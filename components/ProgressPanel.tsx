"use client";

import { useEffect, useState } from "react";
import { useI18n, type DictKey } from "@/lib/i18n";

export interface StageState {
  id: string;
  st: "pending" | "run" | "ok" | "warn" | "err";
  note?: string;
}

const STAGE_LABEL: Record<string, DictKey> = {
  files: "stage.files",
  vision: "stage.vision",
  bench: "stage.bench",
  taxes: "stage.taxes",
  freight: "stage.freight",
  save: "stage.save",
};

function StageIcon({ st }: { st: StageState["st"] }) {
  if (st === "run") return <span className="spinner shrink-0" style={{ color: "var(--brand)" }} />;
  const map = {
    pending: { glyph: "·", color: "var(--na)", bg: "var(--na-soft)" },
    ok: { glyph: "✓", color: "var(--ok)", bg: "var(--ok-soft)" },
    warn: { glyph: "!", color: "var(--warn)", bg: "var(--warn-soft)" },
    err: { glyph: "✕", color: "var(--fail)", bg: "var(--fail-soft)" },
  }[st];
  return (
    <span
      className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[0.6rem] font-bold"
      style={{ color: map.color, background: map.bg, border: `1px solid ${map.color}` }}
    >
      {map.glyph}
    </span>
  );
}

export default function ProgressPanel({
  title,
  stages,
  onCancel,
}: {
  title: string;
  stages: StageState[];
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="card fade-up mx-auto max-w-xl p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <span className="mono text-sm text-[var(--ink-soft)]">{mm}:{ss}</span>
      </div>

      {/* indeterminate bar */}
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--na-soft)]">
        <div className="progress-slider absolute inset-y-0 w-1/3 rounded-full bg-[var(--brand)]" />
      </div>

      <ul className="mt-5 space-y-3">
        {stages.map((s) => (
          <li key={s.id} className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5">
              <StageIcon st={s.st} />
            </span>
            <span className={s.st === "pending" ? "text-[var(--ink-soft)]" : ""}>
              {t(STAGE_LABEL[s.id] ?? ("stage.files" as DictKey))}
              {s.note && (
                <span className="mono block text-xs text-[var(--ink-soft)]">{s.note}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs text-[var(--ink-soft)]">{t("prog.hint")}</p>

      <button onClick={onCancel} className="btn btn-ghost mt-4">
        {t("prog.cancel")}
      </button>
    </div>
  );
}
