import { z } from "zod";

/** Accepts numbers or numeric strings ("1,200.50"), returns number|null. */
const num = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}, z.number().nullable());

const str = z.preprocess(
  (v) => (v === undefined || v === null ? null : String(v)),
  z.string().nullable()
);

export const LineItemSchema = z.object({
  description: z.preprocess((v) => String(v ?? ""), z.string()),
  quantity: num.default(null),
  unit: str.default(null),
  unitPrice: num.default(null),
  lineTotal: num.default(null),
  hsCode: str.default(null),
  confidence: z.preprocess(
    (v) => (typeof v === "number" ? Math.min(1, Math.max(0, v)) : 0.5),
    z.number()
  ),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const ExtractionSchema = z.object({
  supplier: str.default(null),
  buyer: str.default(null),
  invoiceNumber: str.default(null),
  invoiceDate: str.default(null),
  currency: str.default(null),
  incoterm: str.default(null),
  invoiceTotal: num.default(null),
  freight: num.default(null),
  insurance: num.default(null),
  otherCharges: num.default(null),
  lineItems: z.array(LineItemSchema).default([]),
  notes: str.default(null),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const BenchmarkItemSchema = z.object({
  index: z.number(),
  low_usd: num,
  typical_usd: num,
  high_usd: num,
  confidence: z.preprocess(
    (v) => (typeof v === "number" ? Math.min(1, Math.max(0, v)) : 0.5),
    z.number()
  ),
  rationale: z.preprocess((v) => String(v ?? ""), z.string()),
});
export const BenchmarkResponseSchema = z.object({
  items: z.array(BenchmarkItemSchema).default([]),
  overall_comment: z.preprocess((v) => String(v ?? ""), z.string()),
});
export type BenchmarkResponse = z.infer<typeof BenchmarkResponseSchema>;

const conf = z.preprocess(
  (v) => (typeof v === "number" ? Math.min(1, Math.max(0, v)) : 0.5),
  z.number()
);

/** AI response: tariff classification + import taxes per destination country */
export const TaxesAiSchema = z.object({
  items: z
    .array(
      z.object({
        index: z.number(),
        hs6: str.default(null),
        ncm: str.default(null),
        code_confidence: conf,
        effective_rate_pct: num,
        components: z
          .array(
            z.object({
              name: z.preprocess((v) => String(v ?? ""), z.string()),
              rate_pct: num,
              base: str.default(null),
            })
          )
          .default([]),
        rationale: z.preprocess((v) => String(v ?? ""), z.string()),
      })
    )
    .default([]),
  shipment_rate_pct: num,
  comment: z.preprocess((v) => String(v ?? ""), z.string()),
  confidence: conf,
});
export type TaxesAi = z.infer<typeof TaxesAiSchema>;

/** AI response: realistic freight cost range for the route/mode/cargo */
export const FreightAiSchema = z.object({
  low_usd: num,
  typical_usd: num,
  high_usd: num,
  confidence: conf,
  rationale: z.preprocess((v) => String(v ?? ""), z.string()),
});
export type FreightAi = z.infer<typeof FreightAiSchema>;

export type Lang = "es" | "en";
export type ShippingMode = "sea" | "air" | "courier";

export interface CaseContext {
  originCountry: string;
  destinationCountry: string;
  shippingMode: ShippingMode;
  declaredIncoterm: string;
  declaredValue: number | null;
  declaredCurrency: string;
  dutyRatePct: number;
  cifBasis: boolean;
  autoTaxes: boolean;
  lang: Lang;
  thresholds: { warnPct: number; failPct: number };
}

export type Status = "ok" | "warn" | "fail" | "na";

export interface CheckResult {
  status: Status;
  issues: string[];
}

export interface CifReconstruction {
  status: Status;
  applicable: boolean;
  incotermUsed: string;
  fobDeclaredAsCif: boolean;
  declaredValue: number;
  freightEst: number;
  freightSource: "invoice" | "estimated";
  insuranceEst: number;
  insuranceSource: "invoice" | "estimated";
  correctedCif: number;
  dutyGap: number;
  dutyRatePct: number;
  rateSource: "ai" | "manual";
  currency: string;
  explanation: string;
}

export interface TaxComponent {
  name: string;
  ratePct: number | null;
  base: string | null;
}

export interface TaxItemResult {
  index: number;
  description: string;
  hs6: string | null;
  ncm: string | null;
  codeConfidence: number;
  effectiveRatePct: number | null;
  taxAmount: number | null; // in invoice currency, on this item's CIF share
  components: TaxComponent[];
  rationale: string;
}

export interface TaxesResult {
  status: Status;
  source: "ai" | "none";
  items: TaxItemResult[];
  shipmentRatePct: number | null;
  totalTax: number | null; // on corrected CIF, invoice currency
  currency: string;
  comment: string;
  confidence: number;
}

export interface FreightCheck {
  status: Status;
  applicable: boolean;
  lowUsd: number | null;
  typicalUsd: number | null;
  highUsd: number | null;
  actualUsd: number | null;
  actualSource: "invoice" | "estimated";
  comment: string;
}

export interface BenchmarkRow {
  index: number;
  description: string;
  hsCode: string | null;
  ncm: string | null;
  quantity: number | null;
  unit: string | null;
  declaredUnitPrice: number | null;
  declaredUnitUsd: number | null;
  lowUsd: number | null;
  typicalUsd: number | null;
  highUsd: number | null;
  deviationPct: number | null;
  verdict: Status;
  confidence: number;
  source: "reference-db" | "model" | "none";
  rationale: string;
}

export interface FxInfo {
  currency: string;
  rate: number; // USD per 1 unit of currency
  date: string;
  source: string;
}

export interface AnalysisResult {
  consistency: CheckResult;
  cif: CifReconstruction;
  redFlags: CheckResult;
  benchmark: BenchmarkRow[];
  taxes: TaxesResult;
  freightCheck: FreightCheck;
  webSearch: boolean;
  overall: {
    verdict: Status;
    confidence: number;
    rationale: string;
  };
  fx: FxInfo;
  models: { vision: string; reasoning: string };
  analyzedAt: string;
}
