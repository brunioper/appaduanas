"use client";

import { useRef, useState } from "react";
import ExtractionEditor from "@/components/ExtractionEditor";
import ProgressPanel, { type StageState } from "@/components/ProgressPanel";
import Results from "@/components/Results";
import UploadStep from "@/components/UploadStep";
import { useI18n } from "@/lib/i18n";
import { streamNdjson, type StageEvent } from "@/lib/stream";
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

const EMPTY_EXTRACTION: Extraction = {
  supplier: null,
  buyer: null,
  invoiceNumber: null,
  invoiceDate: null,
  currency: null,
  incoterm: null,
  invoiceTotal: null,
  freight: null,
  insurance: null,
  otherCharges: null,
  lineItems: [
    { description: "", quantity: null, unit: null, unitPrice: null, lineTotal: null, hsCode: null, confidence: 1 },
  ],
  notes: null,
};

export default function Home() {
  const { t, lang } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [ctx, setCtx] = useState<CaseContext>(DEFAULT_CTX);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<null | "extract" | "analyze">(null);
  const [stages, setStages] = useState<StageState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const applyStage = (e: StageEvent) =>
    setStages((prev) => prev.map((s) => (s.id === e.id ? { ...s, st: e.st, note: e.note } : s)));

  const doExtract = async () => {
    setLoading("extract");
    setError(null);
    setStages([
      { id: "files", st: "pending" },
      { id: "vision", st: "pending" },
    ]);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("lang", lang);
      const data = await streamNdjson<{ extraction: Extraction }>(
        "/api/extract",
        { method: "POST", body: fd, signal: ac.signal },
        applyStage
      );
      const ex = data.extraction;
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
      setError(
        e instanceof Error ? (e.name === "AbortError" ? t("err.canceled") : e.message) : t("err.generic")
      );
    } finally {
      setLoading(null);
      abortRef.current = null;
    }
  };

  const doAnalyze = async () => {
    if (!extraction) return;
    setLoading("analyze");
    setError(null);
    setStages([
      { id: "bench", st: "pending" },
      { id: "taxes", st: "pending" },
      { id: "freight", st: "pending" },
      { id: "save", st: "pending" },
    ]);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const data = await streamNdjson<{ result: AnalysisResult; saved: boolean }>(
        "/api/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extraction, context: { ...ctx, lang } }),
          signal: ac.signal,
        },
        applyStage
      );
      setResult(data.result);
      setSaved(data.saved ?? null);
      setStep(3);
    } catch (e) {
      setError(
        e instanceof Error ? (e.name === "AbortError" ? t("err.canceled") : e.message) : t("err.generic")
      );
    } finally {
      setLoading(null);
      abortRef.current = null;
    }
  };

  /** Failsafe path: AI couldn't read the document → hand-enter the invoice. */
  const manualEntry = () => {
    setExtraction({
      ...EMPTY_EXTRACTION,
      currency: ctx.declaredCurrency,
      incoterm: ctx.declaredIncoterm,
      lineItems: [...EMPTY_EXTRACTION.lineItems],
    });
    setError(null);
    setStep(2);
  };

  const reset = () => {
    setStep(1);
    setFiles([]);
    setCtx(DEFAULT_CTX);
    setExtraction(null);
    setResult(null);
    setSaved(null);
    setError(null);
    setStages([]);
  };

  return (
    <div>
      {/* Stepper */}
      <ol className="no-print mb-6 flex items-center gap-0">
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

      {/* How it works — only on a fresh case */}
      {step === 1 && !loading && files.length === 0 && (
        <div className="fade-up mb-6 grid gap-2 text-sm text-[var(--ink-soft)] sm:grid-cols-3">
          {([1, 2, 3] as const).map((n) => (
            <div key={n} className="flex items-start gap-2 rounded border bg-[var(--card)] px-3 py-2.5">
              <span className="mono font-bold text-[var(--brand)]">{n}.</span>
              {t(`how.${n}` as const)}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <ProgressPanel
          title={t(loading === "extract" ? "prog.extract" : "prog.analyze")}
          stages={stages}
          onCancel={() => abortRef.current?.abort()}
        />
      ) : (
        <>
          {step === 1 && (
            <UploadStep
              files={files}
              setFiles={setFiles}
              ctx={ctx}
              setCtx={setCtx}
              onSubmit={doExtract}
              onManual={manualEntry}
              loading={false}
              error={error}
            />
          )}
          {step === 2 && extraction && (
            <ExtractionEditor
              extraction={extraction}
              setExtraction={setExtraction}
              onAnalyze={doAnalyze}
              onBack={() => setStep(1)}
              loading={false}
              error={error}
            />
          )}
          {step === 3 && result && extraction && (
            <Results result={result} extraction={extraction} saved={saved} onNew={reset} />
          )}
        </>
      )}
    </div>
  );
}
