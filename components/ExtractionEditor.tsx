"use client";

import { useI18n } from "@/lib/i18n";
import type { Extraction, LineItem } from "@/lib/types";
import { ErrorBanner } from "./StatusBits";

const numOrNull = (s: string) => (s === "" ? null : Number(s));

export default function ExtractionEditor({
  extraction,
  setExtraction,
  onAnalyze,
  onBack,
  loading,
  error,
}: {
  extraction: Extraction;
  setExtraction: (e: Extraction) => void;
  onAnalyze: () => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  const { t } = useI18n();
  const ex = extraction;

  const set = <K extends keyof Extraction>(k: K, v: Extraction[K]) => setExtraction({ ...ex, [k]: v });
  const setItem = (i: number, patch: Partial<LineItem>) => {
    const items = ex.lineItems.map((li, j) => (j === i ? { ...li, ...patch } : li));
    setExtraction({ ...ex, lineItems: items });
  };

  const headerFields: { key: keyof Extraction; label: string; numeric?: boolean }[] = [
    { key: "supplier", label: t("f.supplier") },
    { key: "buyer", label: t("f.buyer") },
    { key: "invoiceNumber", label: t("f.invoiceNumber") },
    { key: "invoiceDate", label: t("f.invoiceDate") },
    { key: "currency", label: t("f.currency") },
    { key: "incoterm", label: t("f.incoterm") },
    { key: "invoiceTotal", label: t("f.invoiceTotal"), numeric: true },
    { key: "freight", label: t("f.freight"), numeric: true },
    { key: "insurance", label: t("f.insurance"), numeric: true },
    { key: "otherCharges", label: t("f.otherCharges"), numeric: true },
  ];

  const hasRealItems = ex.lineItems.some((li) => li.description.trim().length > 0);

  return (
    <div className="fade-up">
      <div className="mb-5">
        <h2 className="font-display text-2xl font-bold">{t("review.title")}</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">{t("review.hint")}</p>
      </div>

      {!hasRealItems && (
        <div
          className="mb-4 flex items-start gap-3 rounded border px-4 py-3 text-sm"
          style={{ background: "var(--warn-soft)", borderColor: "var(--warn)", color: "var(--warn)" }}
        >
          <span className="font-bold">!</span>
          {t("review.noItems")}
        </div>
      )}

      <div className="card p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {headerFields.map((f) => (
            <div key={String(f.key)}>
              <label className="label">{f.label}</label>
              <input
                className={`input ${f.numeric ? "mono" : ""}`}
                type={f.numeric ? "number" : "text"}
                step={f.numeric ? "any" : undefined}
                value={(ex[f.key] as string | number | null) ?? ""}
                onChange={(e) =>
                  set(f.key, (f.numeric ? numOrNull(e.target.value) : e.target.value || null) as never)
                }
              />
            </div>
          ))}
        </div>
        {ex.notes && (
          <p className="mt-3 rounded bg-[var(--na-soft)] px-3 py-2 text-xs text-[var(--ink-soft)]">
            <strong>{t("f.notes")}:</strong> {ex.notes}
          </p>
        )}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--paper)] text-left">
              <th className="label !mb-0 px-3 py-2.5">{t("tbl.description")}</th>
              <th className="label !mb-0 px-3 py-2.5 w-24">{t("tbl.qty")}</th>
              <th className="label !mb-0 px-3 py-2.5 w-20">{t("tbl.unit")}</th>
              <th className="label !mb-0 px-3 py-2.5 w-28">{t("tbl.unitPrice")}</th>
              <th className="label !mb-0 px-3 py-2.5 w-28">{t("tbl.lineTotal")}</th>
              <th className="label !mb-0 px-3 py-2.5 w-28">{t("tbl.hs")}</th>
              <th className="label !mb-0 px-3 py-2.5 w-16">{t("tbl.conf")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {ex.lineItems.map((li, i) => {
              const lowConf = li.confidence < 0.7;
              return (
                <tr key={i} className="border-b last:border-0" style={lowConf ? { background: "var(--warn-soft)" } : undefined}>
                  <td className="px-2 py-1.5">
                    <input className="input" value={li.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className="input mono" type="number" step="any" value={li.quantity ?? ""} onChange={(e) => setItem(i, { quantity: numOrNull(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className="input" value={li.unit ?? ""} onChange={(e) => setItem(i, { unit: e.target.value || null })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className="input mono" type="number" step="any" value={li.unitPrice ?? ""} onChange={(e) => setItem(i, { unitPrice: numOrNull(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className="input mono" type="number" step="any" value={li.lineTotal ?? ""} onChange={(e) => setItem(i, { lineTotal: numOrNull(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className="input mono" value={li.hsCode ?? ""} onChange={(e) => setItem(i, { hsCode: e.target.value || null })} />
                  </td>
                  <td className="mono px-3 py-1.5 text-xs" style={{ color: lowConf ? "var(--warn)" : "var(--ok)" }}>
                    {Math.round(li.confidence * 100)}%
                  </td>
                  <td className="px-2">
                    <button
                      onClick={() => setExtraction({ ...ex, lineItems: ex.lineItems.filter((_, j) => j !== i) })}
                      className="text-[var(--fail)] hover:opacity-70"
                      title={t("upload.remove")}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          onClick={() =>
            setExtraction({
              ...ex,
              lineItems: [
                ...ex.lineItems,
                { description: "", quantity: null, unit: null, unitPrice: null, lineTotal: null, hsCode: null, confidence: 1 },
              ],
            })
          }
          className="px-4 py-3 text-sm font-semibold text-[var(--brand)] hover:underline"
        >
          {t("act.addRow")}
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} onRetry={onAnalyze} />
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <button onClick={onBack} className="btn btn-ghost" disabled={loading}>
          ← {t("act.back")}
        </button>
        <button onClick={onAnalyze} disabled={loading || !hasRealItems} className="btn btn-primary">
          {loading && <span className="spinner" />}
          {loading ? t("act.analyzing") : t("act.analyze")}
        </button>
      </div>
    </div>
  );
}
