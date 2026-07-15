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
  currency: string;
  explanation: string;
}

export interface BenchmarkRow {
  index: number;
  description: string;
  hsCode: string | null;
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
  overall: {
    verdict: Status;
    confidence: number;
    rationale: string;
  };
  fx: FxInfo;
  models: { vision: string; reasoning: string };
  analyzedAt: string;
}
