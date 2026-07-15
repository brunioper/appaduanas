"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Results from "@/components/Results";
import { useI18n } from "@/lib/i18n";
import type { AnalysisResult, Extraction } from "@/lib/types";

interface FullRow {
  result: AnalysisResult;
  extraction: Extraction;
}

export default function HistoryDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const [row, setRow] = useState<FullRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/history?id=${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.row?.result) setRow(d.row);
        else setError(d.error || "not found");
      })
      .catch((e) => setError(String(e)));
  }, [params?.id]);

  return (
    <div>
      <Link href="/history" className="no-print text-sm font-semibold text-[var(--brand)] hover:underline">
        ← {t("hist.title")}
      </Link>
      <div className="mt-4">
        {error && <p className="text-sm text-[var(--fail)]">{t("err.generic")}: {error}</p>}
        {!row && !error && <p className="text-sm text-[var(--ink-soft)]">{t("hist.loading")}</p>}
        {row && <Results result={row.result} extraction={row.extraction} />}
      </div>
    </div>
  );
}
