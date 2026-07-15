"use client";

import { useI18n } from "@/lib/i18n";
import type { AnalysisResult, Extraction, Status } from "@/lib/types";
import { RangeBar, StatusChip, StatusIcon } from "./StatusBits";

const money = (n: number | null | undefined, cur = "") =>
  n == null ? "—" : `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ""}`;

export default function Results({
  result,
  extraction,
  saved,
  onNew,
}: {
  result: AnalysisResult;
  extraction: Extraction;
  saved?: boolean | null;
  onNew?: () => void;
}) {
  const { t } = useI18n();
  const r = result;
  const cur = r.cif.currency;

  const verdictKey = `verdict.${r.overall.verdict}` as const;

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ extraction, result }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vericif-${extraction.invoiceNumber || "analisis"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      {/* Overall verdict */}
      <section className="card fade-up relative overflow-hidden p-6 md:p-8">
        <div className="flex flex-col items-start gap-5 md:flex-row md:items-center">
          <span className={`stamp stamp-${r.overall.verdict}`}>{t(verdictKey)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold">{t("res.title")}</h2>
            {r.overall.rationale && <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">{r.overall.rationale}</p>}
            <p className="mono mt-2 text-xs text-[var(--ink-soft)]">
              {Math.round(r.overall.confidence * 100)}% {t("res.confidence")}
              {" · "}
              {t("fx.label")}: 1 {r.fx.currency} = {r.fx.rate.toFixed(4)} USD ({r.fx.source}, {r.fx.date})
              {saved != null && <> · {saved ? `✓ ${t("res.savedYes")}` : t("res.savedNo")}</>}
            </p>
          </div>
        </div>
      </section>

      {/* CIF reconstruction */}
      {r.cif.applicable && (
        <section className="card fade-up fade-up-1 mt-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusIcon status={r.cif.status} />
            <h3 className="font-display text-lg font-bold">{t("cif.title")}</h3>
            {r.cif.fobDeclaredAsCif && <StatusChip status="fail" label={t("cif.pattern")} />}
            <span className="chip bg-[var(--na-soft)] text-[var(--ink-soft)]">{r.cif.incotermUsed}</span>
          </div>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">{r.cif.explanation}</p>

          <div className="mono mt-4 grid gap-2 text-sm sm:grid-cols-[repeat(7,auto)] sm:items-center sm:justify-start sm:gap-3">
            <span className="rounded border bg-[var(--paper)] px-3 py-2">
              {t("cif.declared")}: <strong>{money(r.cif.declaredValue, cur)}</strong>
            </span>
            <span className="text-center text-[var(--ink-soft)]">+</span>
            <span className="rounded border bg-[var(--paper)] px-3 py-2">
              {t("cif.freight")}: <strong>{money(r.cif.freightEst, cur)}</strong>{" "}
              <em className="text-xs text-[var(--ink-soft)]">({r.cif.freightSource === "invoice" ? t("cif.invoice") : t("cif.est")})</em>
            </span>
            <span className="text-center text-[var(--ink-soft)]">+</span>
            <span className="rounded border bg-[var(--paper)] px-3 py-2">
              {t("cif.insurance")}: <strong>{money(r.cif.insuranceEst, cur)}</strong>{" "}
              <em className="text-xs text-[var(--ink-soft)]">({r.cif.insuranceSource === "invoice" ? t("cif.invoice") : t("cif.est")})</em>
            </span>
            <span className="text-center text-[var(--ink-soft)]">=</span>
            <span className="rounded border-2 border-[var(--brand)] bg-[#eef1f7] px-3 py-2 font-bold">
              {t("cif.corrected")}: {money(r.cif.correctedCif, cur)}
            </span>
          </div>

          {r.cif.dutyGap > 0 && (
            <p
              className="mono mt-3 inline-block rounded border px-3 py-2 text-sm font-bold"
              style={{ background: "var(--fail-soft)", borderColor: "var(--fail)", color: "var(--fail)" }}
            >
              {t("cif.dutyGap")}: {money(r.cif.dutyGap, cur)}
            </p>
          )}
        </section>
      )}

      {/* Checks */}
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        {(
          [
            { title: t("chk.consistency"), check: r.consistency },
            { title: t("chk.redflags"), check: r.redFlags },
          ] as { title: string; check: { status: Status; issues: string[] } }[]
        ).map(({ title, check }, idx) => (
          <div key={title} className={`card fade-up fade-up-${idx + 1} p-5`}>
            <div className="flex items-center gap-3">
              <StatusIcon status={check.status} />
              <h3 className="font-display text-lg font-bold">{title}</h3>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-[var(--ink-soft)]">
              {check.issues.map((issue, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[var(--line)]">▸</span>
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Per-item comparison */}
      <section className="card fade-up fade-up-2 mt-4 overflow-x-auto">
        <h3 className="px-5 pt-5 font-display text-lg font-bold">{t("items.title")}</h3>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--paper)] text-left">
              <th className="label !mb-0 px-5 py-2.5">{t("tbl.description")}</th>
              <th className="label !mb-0 px-3 py-2.5">{t("items.declared")} US$</th>
              <th className="label !mb-0 px-3 py-2.5">{t("items.range")}</th>
              <th className="label !mb-0 px-3 py-2.5">{t("items.dev")}</th>
              <th className="label !mb-0 px-3 py-2.5 pr-5">{t("items.verdict")}</th>
            </tr>
          </thead>
          <tbody>
            {r.benchmark.map((row) => (
              <tr key={row.index} className="border-b align-top last:border-0">
                <td className="max-w-[280px] px-5 py-3">
                  <p className="font-medium">{row.description || "—"}</p>
                  <p className="mono mt-1 text-xs text-[var(--ink-soft)]">
                    {row.hsCode && <>HS {row.hsCode} · </>}
                    {row.quantity != null && (
                      <>
                        {row.quantity.toLocaleString("en-US")} {row.unit || "u"} ·{" "}
                      </>
                    )}
                    <StatusChip
                      status={row.source === "reference-db" ? "ok" : row.source === "model" ? "na" : "warn"}
                      label={row.source === "reference-db" ? t("src.db") : row.source === "model" ? t("src.model") : t("src.none")}
                    />
                  </p>
                  {row.rationale && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs text-[var(--brand)]">ℹ</summary>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">{row.rationale}</p>
                    </details>
                  )}
                </td>
                <td className="mono px-3 py-3 font-semibold">{money(row.declaredUnitUsd)}</td>
                <td className="px-3 py-3">
                  <RangeBar low={row.lowUsd} typical={row.typicalUsd} high={row.highUsd} declared={row.declaredUnitUsd} verdict={row.verdict} />
                </td>
                <td className="mono px-3 py-3">
                  {row.deviationPct == null ? "—" : row.deviationPct === 0 ? "0%" : `−${row.deviationPct.toFixed(0)}%`}
                </td>
                <td className="px-3 py-3 pr-5">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={row.verdict} />
                    <span className="text-xs font-semibold" style={{ color: `var(--${row.verdict === "na" ? "na" : row.verdict})` }}>
                      {t(`verdict.${row.verdict}` as const)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-4 text-xs italic text-[var(--ink-soft)]">{t("disclaimer")}</p>

      {/* Actions */}
      <div className="no-print mt-6 flex flex-wrap gap-3">
        <button onClick={() => window.print()} className="btn btn-primary">
          {t("act.print")}
        </button>
        <button onClick={downloadJson} className="btn btn-ghost">
          {t("act.json")}
        </button>
        {onNew && (
          <button onClick={onNew} className="btn btn-ghost ml-auto">
            {t("act.new")}
          </button>
        )}
      </div>
    </div>
  );
}
