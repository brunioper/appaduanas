import { NextRequest, NextResponse } from "next/server";
import { chatJson, MODELS, type ChatMessage } from "@/lib/ai";
import {
  checkConsistency,
  checkRedFlags,
  combineStatuses,
  deviationVerdict,
  reconstructCif,
  DEFAULT_THRESHOLDS,
} from "@/lib/analysis";
import { getUsdRate } from "@/lib/fx";
import { getSupabase } from "@/lib/supabase";
import {
  BenchmarkResponseSchema,
  ExtractionSchema,
  type AnalysisResult,
  type BenchmarkRow,
  type CaseContext,
  type Status,
} from "@/lib/types";
import { benchmarkSystemPrompt } from "@/prompts/benchmark";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const extraction = ExtractionSchema.parse(body.extraction);
    const ctx: CaseContext = {
      originCountry: body.context?.originCountry || "",
      destinationCountry: body.context?.destinationCountry || "",
      shippingMode: body.context?.shippingMode || "sea",
      declaredIncoterm: body.context?.declaredIncoterm || "",
      declaredValue: body.context?.declaredValue ?? null,
      declaredCurrency: body.context?.declaredCurrency || "USD",
      dutyRatePct: body.context?.dutyRatePct ?? 20,
      cifBasis: body.context?.cifBasis ?? true,
      lang: body.context?.lang === "en" ? "en" : "es",
      thresholds: {
        warnPct: body.context?.thresholds?.warnPct ?? DEFAULT_THRESHOLDS.warnPct,
        failPct: body.context?.thresholds?.failPct ?? DEFAULT_THRESHOLDS.failPct,
      },
    };

    // 1. FX: everything is benchmarked in USD
    const fx = await getUsdRate(extraction.currency || ctx.declaredCurrency);

    // 2. Deterministic checks
    const consistency = checkConsistency(extraction, ctx);
    const cif = reconstructCif(extraction, ctx);
    const declaredTotalUsd =
      (ctx.declaredValue ?? extraction.invoiceTotal ?? 0) * fx.rate || null;
    const redFlags = checkRedFlags(extraction, ctx, declaredTotalUsd);

    // 3. Reference DB first (official values imported into Supabase), model second
    const sb = getSupabase();
    const refByIndex = new Map<number, { low: number; typical: number; high: number }>();
    if (sb) {
      const hsCodes = [
        ...new Set(
          extraction.lineItems.map((li) => (li.hsCode || "").replace(/\D/g, "").slice(0, 6)).filter(Boolean)
        ),
      ];
      if (hsCodes.length > 0) {
        const { data } = await sb
          .from("reference_prices")
          .select("hs_code, low_usd, typical_usd, high_usd, source")
          .in("hs_code", hsCodes)
          .eq("source", "official");
        if (data && data.length > 0) {
          const byHs = new Map<string, { low: number[]; typ: number[]; high: number[] }>();
          for (const row of data) {
            const agg = byHs.get(row.hs_code) ?? { low: [], typ: [], high: [] };
            if (row.low_usd != null) agg.low.push(Number(row.low_usd));
            if (row.typical_usd != null) agg.typ.push(Number(row.typical_usd));
            if (row.high_usd != null) agg.high.push(Number(row.high_usd));
            byHs.set(row.hs_code, agg);
          }
          const median = (a: number[]) => {
            const s = [...a].sort((x, y) => x - y);
            return s.length ? s[Math.floor(s.length / 2)] : 0;
          };
          extraction.lineItems.forEach((li, i) => {
            const hs = (li.hsCode || "").replace(/\D/g, "").slice(0, 6);
            const agg = hs ? byHs.get(hs) : undefined;
            if (agg && agg.low.length) {
              refByIndex.set(i, { low: median(agg.low), typical: median(agg.typ), high: median(agg.high) });
            }
          });
        }
      }
    }

    // 4. Model benchmark for items without an official reference.
    //    Declared prices are intentionally withheld (see prompts/benchmark.ts).
    const pending = extraction.lineItems
      .map((li, index) => ({ li, index }))
      .filter(({ index }) => !refByIndex.has(index));

    let modelItems = new Map<number, { low: number | null; typical: number | null; high: number | null; confidence: number; rationale: string }>();
    let overallComment = "";
    let reasoningModelUsed = MODELS.reasoning[0];
    if (pending.length > 0) {
      const payload = pending.map(({ li, index }) => ({
        index,
        description: li.description,
        hs_code: li.hsCode,
        quantity: li.quantity,
        unit: li.unit || "pcs",
        origin_country: ctx.originCountry || "unknown",
      }));
      const messages: ChatMessage[] = [
        { role: "system", content: benchmarkSystemPrompt(ctx.lang) },
        { role: "user", content: JSON.stringify({ items: payload }, null, 2) },
      ];
      const { data: bench, model } = await chatJson(BenchmarkResponseSchema, {
        models: MODELS.reasoning,
        messages,
      });
      reasoningModelUsed = model;
      overallComment = bench.overall_comment;
      for (const it of bench.items) {
        modelItems.set(it.index, {
          low: it.low_usd,
          typical: it.typical_usd,
          high: it.high_usd,
          confidence: it.confidence,
          rationale: it.rationale,
        });
      }
    }

    // 5. Merge into benchmark rows with verdicts
    const rows: BenchmarkRow[] = extraction.lineItems.map((li, index) => {
      const declaredUnitUsd = li.unitPrice != null ? li.unitPrice * fx.rate : null;
      const ref = refByIndex.get(index);
      const mod = modelItems.get(index);
      const low = ref?.low ?? mod?.low ?? null;
      const typical = ref?.typical ?? mod?.typical ?? null;
      const high = ref?.high ?? mod?.high ?? null;
      const { deviationPct, verdict } = deviationVerdict(declaredUnitUsd, low, ctx.thresholds);
      return {
        index,
        description: li.description,
        hsCode: li.hsCode,
        quantity: li.quantity,
        unit: li.unit,
        declaredUnitPrice: li.unitPrice,
        declaredUnitUsd,
        lowUsd: low,
        typicalUsd: typical,
        highUsd: high,
        deviationPct,
        verdict,
        confidence: ref ? 0.9 : mod?.confidence ?? 0,
        source: ref ? "reference-db" : mod ? "model" : "none",
        rationale: ref
          ? ctx.lang === "es"
            ? "Valor de referencia oficial cargado en la base de datos."
            : "Official reference value from the local database."
          : mod?.rationale ?? "",
      };
    });

    // 6. Overall verdict
    const rowStatuses = rows.map((r) => r.verdict);
    const overallVerdict = combineStatuses([
      consistency.status,
      cif.status === "na" ? "ok" : cif.status,
      redFlags.status,
      ...(rowStatuses.length ? [combineStatuses(rowStatuses)] : []),
    ]) as Status;

    const confidences = rows.filter((r) => r.source !== "none").map((r) => r.confidence);
    const overallConfidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.3;

    const deterministicNote =
      cif.fobDeclaredAsCif && ctx.lang === "es"
        ? " Además, se detectó el patrón de FOB declarado como CIF (ver reconstrucción del valor)."
        : cif.fobDeclaredAsCif
          ? " Additionally, the FOB-declared-as-CIF pattern was detected (see value reconstruction)."
          : "";

    const result: AnalysisResult = {
      consistency,
      cif,
      redFlags,
      benchmark: rows,
      overall: {
        verdict: overallVerdict,
        confidence: Math.round(overallConfidence * 100) / 100,
        rationale: (overallComment || "").trim() + deterministicNote,
      },
      fx,
      models: { vision: MODELS.vision[0], reasoning: reasoningModelUsed },
      analyzedAt: new Date().toISOString(),
    };

    // 7. Persist (best-effort; the app works without Supabase)
    let saved = false;
    if (sb) {
      const { error } = await sb.from("analyses").insert({
        supplier: extraction.supplier,
        invoice_number: extraction.invoiceNumber,
        declared_value: ctx.declaredValue ?? extraction.invoiceTotal,
        currency: extraction.currency || ctx.declaredCurrency,
        overall_verdict: overallVerdict,
        result,
        context: ctx,
        extraction,
      });
      saved = !error;
      if (!error) {
        // store model estimates for future cross-referencing (marked as 'model', never 'official')
        const estimates = rows
          .filter((r) => r.source === "model" && r.lowUsd != null)
          .map((r) => ({
            hs_code: (r.hsCode || "").replace(/\D/g, "").slice(0, 6) || null,
            description: r.description,
            unit: r.unit,
            low_usd: r.lowUsd,
            typical_usd: r.typicalUsd,
            high_usd: r.highUsd,
            source: "model",
            origin_country: ctx.originCountry || null,
          }));
        if (estimates.length) await sb.from("reference_prices").insert(estimates);
      }
    }

    return NextResponse.json({ result, saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido durante el análisis.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
