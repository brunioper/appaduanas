"use client";

/** Client side of the NDJSON progress protocol (see lib/progress.ts). */

export interface StageEvent {
  t: "s";
  id: string;
  st: "run" | "ok" | "warn" | "err";
  note?: string;
}

export async function streamNdjson<T>(
  url: string,
  init: RequestInit,
  onStage: (e: StageEvent) => void
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      if (d.error) msg = d.error;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result: T | null = null;
  let errorMsg: string | null = null;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let evt: { t: string; error?: string };
    try {
      evt = JSON.parse(line);
    } catch {
      return;
    }
    if (evt.t === "result") result = evt as T;
    else if (evt.t === "error") errorMsg = evt.error ?? "error";
    else if (evt.t === "s") onStage(evt as StageEvent);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      handleLine(buf.slice(0, idx));
      buf = buf.slice(idx + 1);
    }
  }
  handleLine(buf);

  if (errorMsg) throw new Error(errorMsg);
  if (!result) throw new Error("La conexión se cortó antes de recibir el resultado. Reintentá.");
  return result;
}
