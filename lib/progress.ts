import type { AiEvent } from "./ai";
import type { Lang } from "./types";

/**
 * NDJSON progress streaming: API routes send one JSON object per line while
 * they work, ending with {t:"result"} or {t:"error"}. The client renders a
 * live stage checklist instead of a dead spinner.
 */

export type StageStatus = "run" | "ok" | "warn" | "err";

export type ProgressEvent =
  | { t: "s"; id: string; st: StageStatus; note?: string }
  | ({ t: "result" } & Record<string, unknown>)
  | { t: "error"; error: string };

export type Send = (e: ProgressEvent) => void;

export function ndjsonResponse(run: (send: Send) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send: Send = (e) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        await run(send);
      } catch (err) {
        send({ t: "error", error: err instanceof Error ? err.message : "Error desconocido" });
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Human-readable note for an in-flight AI event, in the user's language. */
export function aiEventNote(lang: Lang, e: AiEvent): string {
  const es = lang === "es";
  if (e.kind === "retry") {
    return es
      ? `Modelo saturado — reintentando en ${e.delaySec}s…`
      : `Model busy — retrying in ${e.delaySec}s…`;
  }
  if (e.kind === "repair") {
    return es ? "Corrigiendo el formato de la respuesta…" : "Repairing response format…";
  }
  return es ? `Respondió ${e.model}` : `Answered by ${e.model}`;
}
