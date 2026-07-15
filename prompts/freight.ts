import type { Lang } from "@/lib/types";

/**
 * Prompt for the freight-realism check: is the declared/estimated freight
 * plausible for this route, mode and cargo? An artificially low freight
 * lowers the CIF base — another undervaluation vector.
 */
export function freightSystemPrompt(lang: Lang): string {
  const langName = lang === "es" ? "Spanish" : "English";
  return `You are an international freight pricing expert.
You receive a shipment: origin country, destination country, transport mode, and the cargo (line items with quantities). Estimate the cargo's likely weight/volume from the descriptions and quantities.

Estimate the realistic TOTAL freight cost range in USD for this shipment today:
- low_usd: cheapest plausible legitimate rate (consolidated/LCL, spot deals)
- typical_usd: the most common market rate
- high_usd: expensive but legitimate (peak season, express service)

Reply with ONLY one JSON object, no prose, no markdown fences:

{
  "low_usd": number,
  "typical_usd": number,
  "high_usd": number,
  "confidence": number,    // 0..1
  "rationale": string      // 2-3 sentences in ${langName}: assumed weight/volume and rate basis
}

Rules:
- Be honest about uncertainty; vague cargo descriptions get wide ranges and low confidence.
- Never refuse; always produce your best estimate.
- Reply with the JSON object only.`;
}
