"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { prepareImage } from "@/lib/imagePrep";
import type { CaseContext } from "@/lib/types";
import { ErrorBanner } from "./StatusBits";

const ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.pdf,.xlsx,.xls,.csv";
const INCOTERMS = ["CIF", "FOB", "EXW", "FCA", "CFR", "CIP", "FAS", "DAP", "DPU", "DDP"];
const CURRENCIES = ["USD", "EUR", "CNY", "BRL", "UYU", "ARS", "GBP", "JPY", "MXN", "CLP"];

export default function UploadStep({
  files,
  setFiles,
  ctx,
  setCtx,
  onSubmit,
  onManual,
  loading,
  error,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  ctx: CaseContext;
  setCtx: (c: CaseContext) => void;
  onSubmit: () => void;
  onManual: () => void;
  loading: boolean;
  error: string | null;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    setPreparing(true);
    try {
      // screenshots/photos get downscaled client-side: faster upload,
      // stays under Vercel's body limit, better OCR
      const prepared = await Promise.all(Array.from(list).map(prepareImage));
      const next = [...files];
      for (const f of prepared) {
        if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
      }
      setFiles(next);
    } finally {
      setPreparing(false);
    }
  };

  const loadDemo = async () => {
    const res = await fetch("/samples/demo.csv");
    const blob = await res.blob();
    const f = new File([blob], "factura-demo-fob.csv", { type: "text/csv" });
    setFiles([f]);
    setCtx({ ...ctx, declaredIncoterm: "FOB", declaredValue: 15550, declaredCurrency: "USD" });
  };

  const set = <K extends keyof CaseContext>(k: K, v: CaseContext[K]) => setCtx({ ...ctx, [k]: v });

  const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      {/* Dropzone + file list */}
      <div className="fade-up">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={`card grid cursor-pointer place-items-center border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? "!border-[var(--brand)] !bg-[#eef1f7]" : ""
          }`}
        >
          {preparing ? (
            <span className="spinner" style={{ width: 32, height: 32, color: "var(--brand)" }} />
          ) : (
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" aria-hidden>
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" />
            </svg>
          )}
          <p className="mt-3 font-display text-xl font-semibold">{t("upload.drop")}</p>
          <p className="text-sm text-[var(--ink-soft)]">{t("upload.browse")}</p>
          <p className="mono mt-3 text-[0.68rem] uppercase tracking-wide text-[var(--ink-soft)]">
            {t("upload.formats")}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <button onClick={loadDemo} className="mt-3 text-sm font-semibold text-[var(--brand)] hover:underline">
          {t("upload.demo")} →
        </button>

        {files.length > 0 && (
          <div className="card mt-4 divide-y">
            <p className="label !mb-0 px-4 pt-3">{t("upload.selected")}</p>
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="mono text-xs text-[var(--ink-soft)]">{i + 1}.</span>
                <span className="flex-1 truncate">{f.name}</span>
                <span className="mono text-xs text-[var(--ink-soft)]">{fmtSize(f.size)}</span>
                <button
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="text-xs font-semibold text-[var(--fail)] hover:underline"
                >
                  {t("upload.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context form: essentials visible, everything else collapsed */}
      <div className="card fade-up fade-up-1 h-fit p-5">
        <h2 className="font-display text-lg font-bold">{t("ctx.title")}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("ctx.origin")}</label>
            <input className="input" value={ctx.originCountry} onChange={(e) => set("originCountry", e.target.value)} />
          </div>
          <div>
            <label className="label">{t("ctx.destination")}</label>
            <input className="input" value={ctx.destinationCountry} onChange={(e) => set("destinationCountry", e.target.value)} />
          </div>
          <div>
            <label className="label">{t("ctx.mode")}</label>
            <select className="input" value={ctx.shippingMode} onChange={(e) => set("shippingMode", e.target.value as CaseContext["shippingMode"])}>
              <option value="sea">{t("mode.sea")}</option>
              <option value="air">{t("mode.air")}</option>
              <option value="courier">{t("mode.courier")}</option>
            </select>
          </div>
          <div>
            <label className="label">{t("ctx.incoterm")}</label>
            <select className="input" value={ctx.declaredIncoterm} onChange={(e) => set("declaredIncoterm", e.target.value)}>
              {INCOTERMS.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("ctx.declaredValue")}</label>
            <input
              className="input mono"
              type="number"
              min="0"
              step="any"
              value={ctx.declaredValue ?? ""}
              onChange={(e) => set("declaredValue", e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">{t("ctx.currency")}</label>
            <select className="input" value={ctx.declaredCurrency} onChange={(e) => set("declaredCurrency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            {t("ctx.advanced")}
          </summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={ctx.autoTaxes} onChange={(e) => set("autoTaxes", e.target.checked)} />
              {t("ctx.autoTaxes")}
            </label>
            <div>
              <label className="label">{t("ctx.dutyRate")}</label>
              <input
                className="input mono"
                type="number"
                min="0"
                max="200"
                step="any"
                value={ctx.dutyRatePct}
                onChange={(e) => set("dutyRatePct", Number(e.target.value) || 0)}
              />
              {ctx.autoTaxes && <p className="mt-1 text-[0.68rem] text-[var(--ink-soft)]">{t("ctx.dutyRateHint")}</p>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ctx.cifBasis} onChange={(e) => set("cifBasis", e.target.checked)} />
              {t("ctx.cifBasis")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t("ctx.warnPct")}</label>
                <input
                  className="input mono"
                  type="number"
                  min="0"
                  max="100"
                  value={ctx.thresholds.warnPct}
                  onChange={(e) => set("thresholds", { ...ctx.thresholds, warnPct: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="label">{t("ctx.failPct")}</label>
                <input
                  className="input mono"
                  type="number"
                  min="0"
                  max="100"
                  value={ctx.thresholds.failPct}
                  onChange={(e) => set("thresholds", { ...ctx.thresholds, failPct: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
        </details>

        {error && (
          <div className="mt-4 space-y-2">
            <ErrorBanner message={error} onRetry={onSubmit} />
            <button onClick={onManual} className="btn btn-ghost w-full justify-center">
              {t("extract.manual")}
            </button>
          </div>
        )}

        <button onClick={onSubmit} disabled={files.length === 0 || loading || preparing} className="btn btn-primary mt-5 w-full justify-center">
          {loading && <span className="spinner" />}
          {loading ? t("act.extracting") : t("act.extract")}
        </button>
      </div>
    </div>
  );
}
