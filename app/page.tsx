"use client";

import { useState } from "react";
import ExtractionEditor from "@/components/ExtractionEditor";
import Results from "@/components/Results";
import UploadStep from "@/components/UploadStep";
import { useI18n } from "@/lib/i18n";
import type { AnalysisResult, CaseContext, Extraction } from "@/lib/types";

type Step = 1 | 2 | 3;

const DEFAULT_CTX: CaseContext = {
  originCountry: "China",
  destinationCountry: "Uruguay",
  shippingMode: "sea",
  declaredIncoterm: "CIF",
  declaredValue: null,
  declaredCurrency: "USD",
  dutyRatePct: 22,
  cifBasis: true,
  autoTaxes: true,
  lang: "es",
  thresholds: { warnPct: 10, failPct: 30 },
};

export default function Home() {
  const { t, lang } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [ctx, setCtx] = useState<CaseContext>(DEFAULT_CTX);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doExtract = async () => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("lang", lang);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("err.generic"));
      const ex: Extraction = data.extraction;
      setExtraction(ex);
      // prefill context from the documents when the user left fields empty
      setCtx((c) => ({
        ...c,
        declaredValue: c.declaredValue ?? ex.invoiceTotal,
        declaredCurrency: ex.currency || c.declaredCurrency,
        declaredIncoterm: ex.incoterm || c.declaredIncoterm,
      }));
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("err.generic"));
    } finally {
      setLoading(false);
    }
  };

  const doAnalyze = async () => {
    if (!extraction) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraction, context: { ...ctx, lang } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("err.generic"));
      setResult(data.result);
      setSaved(data.saved ?? null);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("err.generic"));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1);
    setFiles([]);
    setCtx(DEFAULT_CTX);
    setExtraction(null);
    setResult(null);
    setSaved(null);
    setError(null);
  };

  return (
    <div>
      {/* Stepper */}
      <ol className="no-print mb-8 flex items-center gap-0">
        {([1, 2, 3] as const).map((n) => (
          <li key={n} className="flex flex-1 items-center last:flex-none">
            <span className="flex items-center gap-2.5">
              <span
                className={`mono grid h-8 w-8 place-items-center rounded-full border-2 text-sm font-bold transition-colors ${
                  step === n
                    ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--paper)]"
                    : step > n
                      ? "border-[var(--ok)] bg-[var(--ok-soft)] text-[var(--ok)]"
                      : "border-[var(--line)] bg-[var(--card)] text-[var(--ink-soft)]"
                }`}
              >
                {step > n ? "✓" : n}
              </span>
              <span className={`text-sm font-semibold ${step === n ? "" : "text-[var(--ink-soft)]"}`}>
                {t(`steps.${n}` as const)}
              </span>
            </span>
            {n < 3 && <span className="mx-4 h-px flex-1 bg-[var(--line)]" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <UploadStep files={files} setFiles={setFiles} ctx={ctx} setCtx={setCtx} onSubmit={doExtract} loading={loading} error={error} />
      )}
      {step === 2 && extraction && (
        <ExtractionEditor
          extraction={extraction}
          setExtraction={setExtraction}
          onAnalyze={doAnalyze}
          onBack={() => setStep(1)}
          loading={loading}
          error={error}
        />
      )}
      {step === 3 && result && extraction && <Results result={result} extraction={extraction} saved={saved} onNew={reset} />}
    </div>
  );
}
