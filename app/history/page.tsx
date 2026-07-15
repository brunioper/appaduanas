"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusChip } from "@/components/StatusBits";
import { useI18n } from "@/lib/i18n";
import type { Status } from "@/lib/types";

interface Row {
  id: string;
  created_at: string;
  supplier: string | null;
  invoice_number: string | null;
  declared_value: number | null;
  currency: string | null;
  overall_verdict: Status;
}

export default function HistoryPage() {
  const { t, lang } = useI18n();
  const [state, setState] = useState<{ loading: boolean; configured: boolean; rows: Row[]; error?: string }>({
    loading: true,
    configured: true,
    rows: [],
  });

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setState({ loading: false, configured: d.configured, rows: d.rows ?? [], error: d.error }))
      .catch((e) => setState({ loading: false, configured: true, rows: [], error: String(e) }));
  }, []);

  return (
    <div className="fade-up">
      <h1 className="font-display text-3xl font-bold">{t("hist.title")}</h1>

      {state.loading && <p className="mt-6 text-sm text-[var(--ink-soft)]">{t("hist.loading")}</p>}

      {!state.loading && !state.configured && (
        <div className="card mt-6 max-w-2xl p-6">
          <h2 className="font-display text-lg font-bold">{t("hist.notConfigured")}</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">{t("hist.notConfiguredBody")}</p>
          <pre className="mono mt-4 overflow-x-auto rounded bg-[var(--brand)] p-4 text-xs text-[var(--paper)]">
{`# .env.local
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_ANON_KEY=...`}
          </pre>
        </div>
      )}

      {!state.loading && state.configured && state.error && (
        <p className="mt-6 text-sm text-[var(--fail)]">
          {t("err.generic")}: {state.error} — ¿ejecutaste supabase/schema.sql?
        </p>
      )}

      {!state.loading && state.configured && !state.error && state.rows.length === 0 && (
        <p className="mt-6 text-sm text-[var(--ink-soft)]">{t("hist.empty")}</p>
      )}

      {state.rows.length > 0 && (
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[var(--paper)] text-left">
                <th className="label !mb-0 px-4 py-2.5">{t("hist.date")}</th>
                <th className="label !mb-0 px-4 py-2.5">{t("hist.supplier")}</th>
                <th className="label !mb-0 px-4 py-2.5">{t("hist.invoice")}</th>
                <th className="label !mb-0 px-4 py-2.5">{t("hist.value")}</th>
                <th className="label !mb-0 px-4 py-2.5">{t("hist.verdict")}</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-[var(--paper)]">
                  <td className="mono px-4 py-2.5 text-xs">
                    <Link href={`/history/${row.id}`} className="block">
                      {new Date(row.created_at).toLocaleString(lang === "es" ? "es-UY" : "en-US")}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/history/${row.id}`} className="block">
                      {row.supplier || "—"}
                    </Link>
                  </td>
                  <td className="mono px-4 py-2.5 text-xs">
                    <Link href={`/history/${row.id}`} className="block">
                      {row.invoice_number || "—"}
                    </Link>
                  </td>
                  <td className="mono px-4 py-2.5">
                    <Link href={`/history/${row.id}`} className="block">
                      {row.declared_value != null
                        ? `${row.declared_value.toLocaleString("en-US")} ${row.currency ?? ""}`
                        : "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/history/${row.id}`} className="block">
                      <StatusChip status={row.overall_verdict ?? "na"} label={t(`verdict.${row.overall_verdict ?? "na"}` as const)} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
