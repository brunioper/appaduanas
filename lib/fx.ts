import type { FxInfo } from "./types";

/**
 * Exchange rates: swappable provider behind one function.
 * Primary: open.er-api.com (free, no key). Fallback: hardcoded table.
 */

// USD per 1 unit of currency (approximate fallback, mid-2026)
const FALLBACK_USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  EUR: 1.09,
  GBP: 1.28,
  CNY: 0.14,
  JPY: 0.0067,
  KRW: 0.00073,
  INR: 0.012,
  BRL: 0.18,
  ARS: 0.00075,
  UYU: 0.025,
  CLP: 0.0011,
  MXN: 0.055,
  COP: 0.00024,
  PEN: 0.27,
  CAD: 0.73,
  CHF: 1.13,
  TRY: 0.028,
  VND: 0.000039,
  THB: 0.028,
};

let cache: { at: number; rates: Record<string, number>; date: string } | null = null;

export async function getUsdRate(currency: string | null): Promise<FxInfo> {
  const cur = (currency || "USD").toUpperCase().trim();
  const today = new Date().toISOString().slice(0, 10);
  if (cur === "USD") return { currency: "USD", rate: 1, date: today, source: "fijo" };

  try {
    if (!cache || Date.now() - cache.at > 60 * 60 * 1000) {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`FX ${res.status}`);
      const data = await res.json();
      if (data.result !== "success" || !data.rates) throw new Error("FX bad payload");
      cache = {
        at: Date.now(),
        rates: data.rates,
        date: (data.time_last_update_utc || today).toString().slice(0, 16),
      };
    }
    const perUsd = cache.rates[cur];
    if (perUsd && perUsd > 0) {
      return { currency: cur, rate: 1 / perUsd, date: cache.date, source: "open.er-api.com" };
    }
  } catch {
    // fall through to hardcoded table
  }

  const fb = FALLBACK_USD_PER_UNIT[cur];
  if (fb) return { currency: cur, rate: fb, date: "tabla fija", source: "fallback" };
  return { currency: cur, rate: 1, date: "desconocida", source: "sin-conversión" };
}
