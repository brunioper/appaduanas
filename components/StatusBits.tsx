"use client";

import type { Status } from "@/lib/types";

const COLORS: Record<Status, { fg: string; bg: string }> = {
  ok: { fg: "var(--ok)", bg: "var(--ok-soft)" },
  warn: { fg: "var(--warn)", bg: "var(--warn-soft)" },
  fail: { fg: "var(--fail)", bg: "var(--fail-soft)" },
  na: { fg: "var(--na)", bg: "var(--na-soft)" },
};

export function StatusIcon({ status, size = 22 }: { status: Status; size?: number }) {
  const c = COLORS[status];
  const glyph = status === "ok" ? "✓" : status === "warn" ? "!" : status === "fail" ? "✕" : "–";
  return (
    <span
      aria-label={status}
      className="grid shrink-0 place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        color: c.fg,
        background: c.bg,
        border: `1.5px solid ${c.fg}`,
        fontSize: size * 0.55,
      }}
    >
      {glyph}
    </span>
  );
}

export function StatusChip({ status, label }: { status: Status; label: string }) {
  const c = COLORS[status];
  return (
    <span className="chip" style={{ color: c.fg, background: c.bg, border: `1px solid ${c.fg}` }}>
      {label}
    </span>
  );
}

/**
 * Horizontal market-range band: [low … high] with a tick at typical
 * and a diamond marker where the declared price falls.
 */
export function RangeBar({
  low,
  typical,
  high,
  declared,
  verdict,
}: {
  low: number | null;
  typical: number | null;
  high: number | null;
  declared: number | null;
  verdict: Status;
}) {
  if (low == null || high == null || high <= 0) {
    return <span className="text-xs text-[var(--ink-soft)]">—</span>;
  }
  const max = Math.max(high, declared ?? 0) * 1.15;
  const pct = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));
  const c = COLORS[verdict];
  const fmt = (n: number) =>
    n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <div className="min-w-[180px]">
      <div className="relative h-3 w-full rounded-full bg-[var(--na-soft)]">
        <div
          className="absolute top-0 h-3 rounded-full"
          style={{
            left: `${pct(low)}%`,
            width: `${Math.max(2, pct(high) - pct(low))}%`,
            background: "var(--ok-soft)",
            border: "1px solid var(--ok)",
          }}
        />
        {typical != null && (
          <div
            className="absolute top-[-2px] h-4 w-[2px]"
            style={{ left: `${pct(typical)}%`, background: "var(--ok)" }}
            title={`típico: ${fmt(typical)}`}
          />
        )}
        {declared != null && (
          <div
            className="absolute top-[-4px] h-5 w-5 -translate-x-1/2"
            style={{ left: `${pct(declared)}%` }}
            title={`declarado: ${fmt(declared)}`}
          >
            <div
              className="mx-auto h-3.5 w-3.5 rotate-45 border-2"
              style={{ background: c.bg, borderColor: c.fg }}
            />
          </div>
        )}
      </div>
      <div className="mono mt-1 flex justify-between text-[0.65rem] text-[var(--ink-soft)]">
        <span>{fmt(low)}</span>
        <span>{fmt(high)}</span>
      </div>
    </div>
  );
}

export function ErrorBanner({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div
      className="fade-up flex items-center gap-3 rounded border px-4 py-3 text-sm"
      style={{ background: "var(--fail-soft)", borderColor: "var(--fail)", color: "var(--fail)" }}
    >
      <StatusIcon status="fail" size={18} />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-ghost !border-[var(--fail)] !text-[var(--fail)]">
          {retryLabel ?? "Reintentar"}
        </button>
      )}
    </div>
  );
}
