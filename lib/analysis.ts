import type {
  CaseContext,
  CheckResult,
  CifReconstruction,
  Extraction,
  Lang,
  Status,
} from "./types";

/**
 * Deterministic valuation checks. Everything here is auditable math —
 * no AI involved. Tunable constants live at the top.
 */

export const FREIGHT_PCT: Record<string, number> = {
  sea: 0.08, // typical ocean freight as % of FOB
  air: 0.15,
  courier: 0.18,
};
export const INSURANCE_PCT = 0.004; // 0.4% of FOB, standard proxy
export const DEFAULT_THRESHOLDS = { warnPct: 10, failPct: 30 };

const FOB_FAMILY = ["FOB", "EXW", "FCA", "FAS"];
const CIF_FAMILY = ["CIF", "CIP", "DAP", "DPU", "DDP"];
const DE_MINIMIS_USD = [200, 800, 1000, 3000];

const t = (lang: Lang, es: string, en: string) => (lang === "es" ? es : en);

const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** a ≈ b within tol (relative) */
const approx = (a: number, b: number, tol = 0.02) =>
  b !== 0 && Math.abs(a - b) / Math.abs(b) <= tol;

export function checkConsistency(ex: Extraction, ctx: CaseContext): CheckResult {
  const lang = ctx.lang;
  const issues: string[] = [];
  let worst: Status = "ok";
  const bump = (s: Status) => {
    if (s === "fail" || worst === "fail") worst = "fail";
    else if (s === "warn") worst = "warn";
  };

  let sum = 0;
  let sumKnown = true;
  ex.lineItems.forEach((li, i) => {
    if (li.quantity != null && li.unitPrice != null && li.lineTotal != null) {
      const expected = li.quantity * li.unitPrice;
      if (!approx(expected, li.lineTotal, 0.015)) {
        bump("warn");
        issues.push(
          t(
            lang,
            `Ítem ${i + 1}: ${fmt(li.quantity)} × ${fmt(li.unitPrice)} = ${fmt(expected)}, pero el total de línea dice ${fmt(li.lineTotal)}.`,
            `Item ${i + 1}: ${fmt(li.quantity)} × ${fmt(li.unitPrice)} = ${fmt(expected)}, but the line total says ${fmt(li.lineTotal)}.`
          )
        );
      }
    }
    if (li.lineTotal != null) sum += li.lineTotal;
    else if (li.quantity != null && li.unitPrice != null) sum += li.quantity * li.unitPrice;
    else sumKnown = false;
  });

  if (sumKnown && ex.lineItems.length > 0 && ex.invoiceTotal != null) {
    const withCharges = sum + (ex.freight ?? 0) + (ex.insurance ?? 0) + (ex.otherCharges ?? 0);
    if (!approx(sum, ex.invoiceTotal, 0.02) && !approx(withCharges, ex.invoiceTotal, 0.02)) {
      bump("warn");
      issues.push(
        t(
          lang,
          `La suma de líneas (${fmt(sum)}) no coincide con el total de la factura (${fmt(ex.invoiceTotal)}).`,
          `Sum of line items (${fmt(sum)}) does not match the invoice total (${fmt(ex.invoiceTotal)}).`
        )
      );
    }
  }

  if (ctx.declaredValue != null && ex.invoiceTotal != null) {
    if (!approx(ctx.declaredValue, ex.invoiceTotal, 0.02)) {
      bump("warn");
      issues.push(
        t(
          lang,
          `El valor declarado en aduana (${fmt(ctx.declaredValue)}) difiere del total de la factura (${fmt(ex.invoiceTotal)}).`,
          `Declared customs value (${fmt(ctx.declaredValue)}) differs from the invoice total (${fmt(ex.invoiceTotal)}).`
        )
      );
    }
  }

  if (ex.lineItems.length === 0) {
    bump("fail");
    issues.push(
      t(
        lang,
        "No se pudieron extraer ítems de la factura. Revisá el documento.",
        "No line items could be extracted from the invoice. Check the document."
      )
    );
  }

  if (issues.length === 0) {
    issues.push(
      t(
        lang,
        "Cantidades × precios unitarios coinciden con los totales declarados.",
        "Quantities × unit prices match the declared totals."
      )
    );
  }
  return { status: worst, issues };
}

export function reconstructCif(ex: Extraction, ctx: CaseContext): CifReconstruction {
  const lang = ctx.lang;
  const currency = (ex.currency || ctx.declaredCurrency || "USD").toUpperCase();
  // invoices print things like "FOB Ningbo" or "CIF Montevideo" — isolate the code
  const rawIncoterm = (ex.incoterm || ctx.declaredIncoterm || "").toUpperCase().trim();
  const KNOWN = [...FOB_FAMILY, ...CIF_FAMILY, "CFR"];
  const incotermUsed =
    KNOWN.find((k) => rawIncoterm.split(/[^A-Z]+/).includes(k)) ?? rawIncoterm;
  const declaredValue = ctx.declaredValue ?? ex.invoiceTotal ?? 0;
  const dutyRate = (ctx.dutyRatePct || 0) / 100;

  const base: CifReconstruction = {
    status: "na",
    applicable: false,
    incotermUsed,
    fobDeclaredAsCif: false,
    declaredValue,
    freightEst: 0,
    freightSource: "estimated",
    insuranceEst: 0,
    insuranceSource: "estimated",
    correctedCif: declaredValue,
    dutyGap: 0,
    currency,
    explanation: "",
  };

  if (!ctx.cifBasis) {
    return {
      ...base,
      status: "ok",
      explanation: t(
        lang,
        "El país de destino no usa base imponible CIF; no se reconstruye el valor.",
        "Destination country does not use a CIF tax base; no reconstruction needed."
      ),
    };
  }

  if (CIF_FAMILY.includes(incotermUsed)) {
    return {
      ...base,
      status: "ok",
      explanation: t(
        lang,
        `Incoterm ${incotermUsed}: el flete y el seguro ya están incluidos en el valor declarado.`,
        `Incoterm ${incotermUsed}: freight and insurance are already included in the declared value.`
      ),
    };
  }

  if (incotermUsed === "CFR") {
    const insuranceEst = ex.insurance ?? declaredValue * INSURANCE_PCT;
    const correctedCif = declaredValue + insuranceEst;
    return {
      ...base,
      status: "warn",
      applicable: true,
      insuranceEst,
      insuranceSource: ex.insurance != null ? "invoice" : "estimated",
      correctedCif,
      dutyGap: (correctedCif - declaredValue) * dutyRate,
      explanation: t(
        lang,
        "CFR incluye flete pero NO seguro. Se agregó una estimación de seguro para llegar al CIF.",
        "CFR includes freight but NOT insurance. An insurance estimate was added to reach CIF."
      ),
    };
  }

  if (FOB_FAMILY.includes(incotermUsed)) {
    const freightEst =
      ex.freight != null && ex.freight > 0
        ? ex.freight
        : declaredValue * (FREIGHT_PCT[ctx.shippingMode] ?? FREIGHT_PCT.sea);
    const insuranceEst =
      ex.insurance != null && ex.insurance > 0
        ? ex.insurance
        : declaredValue * INSURANCE_PCT;
    const correctedCif = declaredValue + freightEst + insuranceEst;
    const dutyGap = (correctedCif - declaredValue) * dutyRate;

    // The classic pattern: invoice is FOB and the FOB total was declared
    // as the customs value in a CIF-basis country.
    const fobDeclaredAsCif =
      ctx.declaredValue != null &&
      ex.invoiceTotal != null &&
      approx(ctx.declaredValue, ex.invoiceTotal, 0.02);

    return {
      ...base,
      status: fobDeclaredAsCif ? "fail" : "warn",
      applicable: true,
      fobDeclaredAsCif,
      freightEst,
      freightSource: ex.freight != null && ex.freight > 0 ? "invoice" : "estimated",
      insuranceEst,
      insuranceSource: ex.insurance != null && ex.insurance > 0 ? "invoice" : "estimated",
      correctedCif,
      dutyGap,
      explanation: fobDeclaredAsCif
        ? t(
            lang,
            `Patrón detectado: factura ${incotermUsed} declarada como valor en aduana sin agregar flete ni seguro. El valor CIF corregido es ${fmt(correctedCif)} ${currency}.`,
            `Pattern detected: ${incotermUsed} invoice declared as customs value without adding freight or insurance. Corrected CIF value is ${fmt(correctedCif)} ${currency}.`
          )
        : t(
            lang,
            `Incoterm ${incotermUsed}: se estimó flete y seguro para reconstruir el CIF.`,
            `Incoterm ${incotermUsed}: freight and insurance were estimated to reconstruct CIF.`
          ),
    };
  }

  return {
    ...base,
    status: "warn",
    explanation: t(
      lang,
      `Incoterm no reconocido ("${incotermUsed || "—"}"). Verificá manualmente si el valor declarado incluye flete y seguro.`,
      `Unrecognized Incoterm ("${incotermUsed || "—"}"). Manually verify whether the declared value includes freight and insurance.`
    ),
  };
}

export function checkRedFlags(ex: Extraction, ctx: CaseContext, declaredUsd: number | null): CheckResult {
  const lang = ctx.lang;
  const flags: string[] = [];

  const items = ex.lineItems.filter((li) => li.unitPrice != null);
  if (items.length >= 3) {
    const round = items.filter((li) => li.unitPrice! % 5 === 0 && li.unitPrice! >= 5);
    if (round.length / items.length >= 0.7) {
      flags.push(
        t(
          lang,
          "La mayoría de los precios unitarios son números redondos (múltiplos de 5), un patrón frecuente en facturas fabricadas.",
          "Most unit prices are round numbers (multiples of 5), a frequent pattern in fabricated invoices."
        )
      );
    }
    const byPrice = new Map<number, Set<string>>();
    items.forEach((li) => {
      const set = byPrice.get(li.unitPrice!) ?? new Set<string>();
      set.add(li.description.toLowerCase().trim());
      byPrice.set(li.unitPrice!, set);
    });
    for (const [price, descs] of byPrice) {
      if (descs.size >= 3) {
        flags.push(
          t(
            lang,
            `${descs.size} productos distintos comparten exactamente el mismo precio unitario (${fmt(price)}).`,
            `${descs.size} different products share exactly the same unit price (${fmt(price)}).`
          )
        );
        break;
      }
    }
  }

  if (declaredUsd != null && declaredUsd > 0) {
    for (const th of DE_MINIMIS_USD) {
      if (declaredUsd < th && declaredUsd >= th * 0.97) {
        flags.push(
          t(
            lang,
            `El valor declarado (US$ ${fmt(declaredUsd)}) queda apenas por debajo del umbral de US$ ${fmt(th)}.`,
            `Declared value (US$ ${fmt(declaredUsd)}) sits just below the US$ ${fmt(th)} threshold.`
          )
        );
        break;
      }
    }
  }

  return {
    status: flags.length > 0 ? "warn" : "ok",
    issues: flags.length > 0 ? flags : [t(lang, "Sin señales de alerta adicionales.", "No additional red flags.")],
  };
}

export function deviationVerdict(
  declaredUsd: number | null,
  lowUsd: number | null,
  thresholds: { warnPct: number; failPct: number }
): { deviationPct: number | null; verdict: Status } {
  if (declaredUsd == null || lowUsd == null || lowUsd <= 0) {
    return { deviationPct: null, verdict: "na" };
  }
  if (declaredUsd >= lowUsd) return { deviationPct: 0, verdict: "ok" };
  const deviationPct = ((lowUsd - declaredUsd) / lowUsd) * 100;
  if (deviationPct > thresholds.failPct) return { deviationPct, verdict: "fail" };
  if (deviationPct >= thresholds.warnPct) return { deviationPct, verdict: "warn" };
  return { deviationPct, verdict: "ok" };
}

export function combineStatuses(statuses: Status[]): Status {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  if (statuses.every((s) => s === "na")) return "na";
  return "ok";
}
