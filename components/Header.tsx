"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export default function Header() {
  const { lang, setLang, t } = useI18n();
  const path = usePathname();

  const navCls = (active: boolean) =>
    `rounded px-3 py-1.5 text-sm font-semibold transition-colors ${
      active ? "bg-[var(--paper)] text-[var(--ink)]" : "text-[#cfd6e4] hover:text-white"
    }`;

  return (
    <header className="no-print bg-[var(--brand)] text-[var(--paper)]">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 rotate-[-6deg] place-items-center rounded border-[3px] border-double border-[var(--paper)] font-display text-xl font-black"
          >
            V
          </span>
          <span>
            <span className="block font-display text-2xl font-bold leading-none tracking-tight">
              VeriCIF
            </span>
            <span className="block text-[0.7rem] uppercase tracking-[0.18em] text-[#aeb9d0]">
              {t("app.tagline")}
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          <Link href="/" className={navCls(path === "/")}>
            {t("nav.new")}
          </Link>
          <Link href="/history" className={navCls(path.startsWith("/history"))}>
            {t("nav.history")}
          </Link>
        </nav>

        <div className="mono flex overflow-hidden rounded border border-[#3d4d75] text-xs">
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2.5 py-1 font-semibold uppercase transition-colors ${
                lang === l ? "bg-[var(--paper)] text-[var(--ink)]" : "text-[#aeb9d0] hover:text-white"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
