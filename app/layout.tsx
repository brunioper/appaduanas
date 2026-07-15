import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import Header from "@/components/Header";
import { MODELS } from "@/lib/ai";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "900"],
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "VeriCIF — Auditor de valoración aduanera",
  description:
    "Detección de subvaluación en facturas de importación con IA: comparación de precios de mercado, reconstrucción CIF y señales de alerta.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen flex flex-col">
        <I18nProvider>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8">{children}</main>
          <footer className="no-print border-t bg-[var(--card)] px-4 py-4 text-center text-xs text-[var(--ink-soft)]">
            <p className="mono">
              vision: {MODELS.vision[0]} · reasoning: {MODELS.reasoning[0]}
              {(MODELS.vision.length > 1 || MODELS.reasoning.length > 1) && " (+fallbacks)"}
            </p>
            <p className="mt-1">
              Las estimaciones son indicativas — la determinación final del valor corresponde al
              funcionario aduanero.
            </p>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
