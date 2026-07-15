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
  FreightAiSchema,
  TaxesAiSchema,
  type AnalysisResult,
  type BenchmarkRow,
  type CaseContext,
  type Extraction,
  type FreightCheck,
  type Status,
  type TaxesResult,
} from "@/lib/types";
import { benchmarkSystemPrompt } from "@/prompts/benchmark";
import { freightSystemPrompt } from "@/prompts/freight";
import { taxesSystemPrompt } from "@/prompts/taxes";

export const runtime = "nodejs";
// Free models + retries can take ~3 min; 300s is the Vercel Hobby (fluid) cap
export const maxDuration = 300;

const lineValue = (li: Extraction["lineItems"][number]) =>
  li.lineTotal ?? (li.quantity != null && li.unitPrice != null ? li.quantity * li.unitPrice : 0);

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
      autoTaxes: body.context?.autoTaxes ?? true,
      lang: body.context?.lang === "en" ? "en" : "es",
      thresholds: {
        warnPct: body.context?.thresholds?.warnPct ?? DEFAULT_THRESHOLDS.warnPct,
        failPct: body.context?.thresholds?.failPct ?? DEFAULT_THRESHOLDS.failPct,
      },
    };
    const es = ctx.lang === "es";

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

    // ── 4. AI pipeline: three independent calls, run in parallel. ──────────
    // Each degrades gracefully: one failed call never kills the analysis.

    // 4a. Market benchmark (with optional web-search grounding).
    //     Declared prices are intentionally withheld (see prompts/benchmark.ts).
    const pending = extraction.lineItems
      .map((li, index) => ({ li, index }))
      .filter(({ index }) => !refByIndex.has(index));

    const webSearchMode = (process.env.WEB_SEARCH || "auto").toLowerCase();
    let webUsed = false;

    const benchPromise = (async () => {
      if (pending.length === 0) return null;
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
      const run = (plugins?: unknown[]) =>
        chatJson(BenchmarkResponseSchema, { models: MODELS.reasoning, messages, plugins });
      if (webSearchMode !== "off") {
        try {
          const out = await run([{ id: "web", max_results: 5 }]);
          webUsed = true;
          return out;
        } catch {
          // web plugin needs OpenRouter credits — fall back to plain model knowledge
        }
      }
      return run();
    })();

    // 4b. Tariff classification (HS6 + NCM) and import taxes for the destination country.
    const taxesPromise = (async () => {
      if (!ctx.autoTaxes || extraction.lineItems.length === 0) return null;
      const payload = extraction.lineItems.map((li, index) => ({
        index,
        description: li.description,
        hs6_guess: li.hsCode,
        origin_country: ctx.originCountry || "unknown",
      }));
      const messages: ChatMessage[] = [
        { role: "system", content: taxesSystemPrompt(ctx.lang, ctx.destinationCountry) },
        {
          role: "user",
          content: JSON.stringify({ destination_country: ctx.destinationCountry, items: payload }, null, 2),
        },
      ];
      return chatJson(TaxesAiSchema, { models: MODELS.reasoning, messages });
    })();

    // 4c. Freight realism: is the freight amount plausible for route/mode/cargo?
    const freightPromise = (async () => {
      if (extraction.lineItems.length === 0) return null;
      const cargo = extraction.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unit: li.unit || "pcs",
      }));
      const messages: ChatMessage[] = [
        { role: "system", content: freightSystemPrompt(ctx.lang) },
        {
          role: "user",
          content: JSON.stringify(
            {
              origin_country: ctx.originCountry || "unknown",
              destination_country: ctx.destinationCountry || "unknown",
              transport_mode: ctx.shippingMode,
              cargo,
            },
            null,
            2
          ),
        },
      ];
      return chatJson(FreightAiSchema, { models: MODELS.reasoning, messages });
    })();

    const [benchSettled, taxesSettled, freightSettled] = await Promise.allSettled([
      benchPromise,
      taxesPromise,
      freightPromise,
    ]);

    const bench = benchSettled.status === "fulfilled" ? benchSettled.value : null;
    const taxesAi = taxesSettled.status === "fulfilled" ? taxesSettled.value : null;
    const freightAi = freightSettled.status === "fulfilled" ? freightSettled.value : null;
    const benchFailed = benchSettled.status === "rejected";
    let reasoningModelUsed = bench?.model ?? taxesAi?.model ?? freightAi?.model ?? MODELS.reasoning[0];

    // 5. Merge benchmark into rows with verdicts
    const modelItems = new Map<
      number,
      { low: number | null; typical: number | null; high: number | null; confidence: number; rationale: string }
    >();
    let overallComment = "";
    if (bench) {
      overallComment = bench.data.overall_comment;
      for (const it of bench.data.items) {
        modelItems.set(it.index, {
          low: it.low_usd,
          typical: it.typical_usd,
          high: it.high_usd,
          confidence: it.confidence,
          rationale: it.rationale,
        });
      }
    }

    const taxByIndex = new Map(taxesAi?.data.items.map((it) => [it.index, it]) ?? []);

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
        hsCode: taxByIndex.get(index)?.hs6 ?? li.hsCode,
        ncm: taxByIndex.get(index)?.ncm ?? null,
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
          ? es
            ? "Valor de referencia oficial cargado en la base de datos."
            : "Official reference value from the local database."
          : mod?.rationale ?? "",
      };
    });

    // 6. Import taxes: per-item amounts on CIF shares + shipment totals.
    //    If the AI produced a country-specific effective rate, it replaces the
    //    manual duty rate in the duty-gap calculation.
    const sumLines = extraction.lineItems.reduce((a, li) => a + lineValue(li), 0);
    const taxes: TaxesResult = (() => {
      if (!taxesAi || taxesAi.data.items.length === 0) {
        return {
          status: "na",
          source: "none",
          items: [],
          shipmentRatePct: null,
          totalTax: null,
          currency: cif.currency,
          comment: benchFailed && !taxesAi ? "" : "",
          confidence: 0,
        };
      }
      const items = taxesAi.data.items.map((it) => {
        const li = extraction.lineItems[it.index];
        const share = li && sumLines > 0 ? cif.correctedCif * (lineValue(li) / sumLines) : null;
        return {
          index: it.index,
          description: li?.description ?? "",
          hs6: it.hs6,
          ncm: it.ncm,
          codeConfidence: it.code_confidence,
          effectiveRatePct: it.effective_rate_pct,
          taxAmount:
            share != null && it.effective_rate_pct != null ? (share * it.effective_rate_pct) / 100 : null,
          components: it.components.map((c) => ({ name: c.name, ratePct: c.rate_pct, base: c.base })),
          rationale: it.rationale,
        };
      });
      const shipmentRatePct =
        taxesAi.data.shipment_rate_pct ??
        (items.length
          ? items.reduce((a, i) => a + (i.effectiveRatePct ?? 0), 0) / items.length
          : null);
      return {
        status: "ok" as Status,
        source: "ai" as const,
        items,
        shipmentRatePct,
        totalTax: shipmentRatePct != null ? (cif.correctedCif * shipmentRatePct) / 100 : null,
        currency: cif.currency,
        comment: taxesAi.data.comment,
        confidence: taxesAi.data.confidence,
      };
    })();

    if (taxes.shipmentRatePct != null && cif.applicable) {
      cif.dutyRatePct = Math.round(taxes.shipmentRatePct * 100) / 100;
      cif.rateSource = "ai";
      cif.dutyGap = Math.max(0, (cif.correctedCif - cif.declaredValue) * (taxes.shipmentRatePct / 100));
    }

    // 7. Freight realism check
    const freightCheck: FreightCheck = (() => {
      const actual =
        extraction.freight != null && extraction.freight > 0
          ? { usd: extraction.freight * fx.rate, source: "invoice" as const }
          : cif.applicable && cif.freightEst > 0
            ? { usd: cif.freightEst * fx.rate, source: "estimated" as const }
            : null;
      if (!freightAi || !actual || freightAi.data.low_usd == null || freightAi.data.high_usd == null) {
        return {
          status: "na",
          applicable: false,
          lowUsd: freightAi?.data.low_usd ?? null,
          typicalUsd: freightAi?.data.typical_usd ?? null,
          highUsd: freightAi?.data.high_usd ?? null,
          actualUsd: actual?.usd ?? null,
          actualSource: actual?.source ?? "estimated",
          comment: freightAi?.data.rationale ?? "",
        };
      }
      const { low_usd, typical_usd, high_usd, rationale } = freightAi.data;
      let status: Status = "ok";
      let note = "";
      if (actual.usd < low_usd * 0.6) {
        status = "warn";
        note = es
          ? ` El flete (US$ ${Math.round(actual.usd)}) está muy por debajo del rango realista — un flete artificialmente bajo reduce la base CIF.`
          : ` The freight (US$ ${Math.round(actual.usd)}) is far below the realistic range — artificially low freight shrinks the CIF base.`;
      } else if (actual.usd > high_usd * 1.5) {
        status = "warn";
        note = es
          ? ` El flete (US$ ${Math.round(actual.usd)}) supera ampliamente el rango típico; verificá el documento de transporte.`
          : ` The freight (US$ ${Math.round(actual.usd)}) far exceeds the typical range; check the transport document.`;
      }
      return {
        status,
        applicable: true,
        lowUsd: low_usd,
        typicalUsd: typical_usd,
        highUsd: high_usd,
        actualUsd: actual.usd,
        actualSource: actual.source,
        comment: rationale + note,
      };
    })();

    // 8. Overall verdict
    const rowStatuses = rows.map((r) => r.verdict);
    const overallVerdict = combineStatuses([
      consistency.status,
      cif.status === "na" ? "ok" : cif.status,
      redFlags.status,
      freightCheck.status === "na" ? "ok" : freightCheck.status,
      ...(rowStatuses.length ? [combineStatuses(rowStatuses)] : []),
    ]) as Status;

    const confidences = rows.filter((r) => r.source !== "none").map((r) => r.confidence);
    const overallConfidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.3;

    let rationale = (overallComment || "").trim();
    if (cif.fobDeclaredAsCif) {
      rationale += es
        ? " Además, se detectó el patrón de FOB declarado como CIF (ver reconstrucción del valor)."
        : " Additionally, the FOB-declared-as-CIF pattern was detected (see value reconstruction).";
    }
    if (benchFailed) {
      rationale += es
        ? " ⚠ La comparación de precios de mercado no pudo ejecutarse (modelo saturado); reintentá el análisis."
        : " ⚠ The market price comparison could not run (model saturated); retry the analysis.";
    }

    const result: AnalysisResult = {
      consistency,
      cif,
      redFlags,
      benchmark: rows,
      taxes,
      freightCheck,
      webSearch: webUsed,
      overall: {
        verdict: overallVerdict,
        confidence: Math.round(overallConfidence * 100) / 100,
        rationale: rationale.trim(),
      },
      fx,
      models: { vision: MODELS.vision[0], reasoning: reasoningModelUsed },
      analyzedAt: new Date().toISOString(),
    };

    // 9. Persist (best-effort; the app works without Supabase)
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
