import type { ZodType } from "zod";

/**
 * Single gateway for every AI call in the app.
 * No other file may reference model names or the API key.
 * Swap providers/models via .env.local only.
 *
 * MODEL_VISION / MODEL_REASONING accept a comma-separated list:
 * the first model is primary, the rest are automatic fallbacks
 * (useful because free-tier models get rate-limited upstream).
 */

const BASE_URL = process.env.AI_BASE_URL || "https://openrouter.ai/api/v1";

const list = (env: string | undefined, fallback: string): string[] =>
  (env || fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const MODELS = {
  vision: list(
    process.env.MODEL_VISION,
    "google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free,nvidia/nemotron-nano-12b-v2-vl:free"
  ),
  reasoning: list(
    process.env.MODEL_REASONING,
    "qwen/qwen3-next-80b-a3b-instruct:free,meta-llama/llama-3.3-70b-instruct:free,openai/gpt-oss-20b:free"
  ),
};

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

interface ChatOptions {
  models: string[];
  messages: ChatMessage[];
  plugins?: unknown[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatReply {
  text: string;
  model: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chat(opts: ChatOptions): Promise<ChatReply> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY no está configurada. Copiá .env.example a .env.local y completala.");
  }

  const body: Record<string, unknown> = {
    model: opts.models[0],
    messages: opts.messages,
    plugins: opts.plugins,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 6000,
  };
  if (opts.models.length > 1) body.models = opts.models; // OpenRouter fallback routing

  let lastError = "";
  for (const delayMs of [0, 3000, 8000]) {
    if (delayMs) await sleep(delayMs);
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/brunioper/appaduanas",
        "X-Title": "VeriCIF",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const text: string | undefined = data.choices?.[0]?.message?.content;
      if (text && text.trim()) return { text, model: data.model || opts.models[0] };
      lastError = "El modelo devolvió una respuesta vacía.";
      continue;
    }
    const errBody = await res.text();
    lastError = `Fallo del modelo (${res.status}): ${errBody.slice(0, 300)}`;
    // retry only transient failures; anything else is fatal
    if (![429, 500, 502, 503, 524].includes(res.status)) break;
  }
  throw new Error(
    `${lastError} — Los modelos gratuitos se saturan; reintentá en unos segundos o configurá un modelo premium en .env.local.`
  );
}

/** Pulls the first JSON object out of model output (handles ```fences and <think> blocks). */
export function extractJson(text: string): unknown {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No se encontró JSON en la respuesta del modelo.");
  }
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * chat() + JSON parse + zod validation, with one automatic repair round-trip
 * when the model returns malformed output.
 */
export async function chatJson<T>(
  schema: ZodType<T, any, any>,
  opts: ChatOptions
): Promise<{ data: T; model: string }> {
  const first = await chat(opts);
  try {
    return { data: schema.parse(extractJson(first.text)), model: first.model };
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 500) : "invalid JSON";
    const repaired = await chat({
      ...opts,
      messages: [
        ...opts.messages,
        { role: "assistant", content: first.text.slice(0, 8000) },
        {
          role: "user",
          content: `Tu respuesta anterior no es JSON válido según el esquema requerido (${detail}). Respondé nuevamente SOLO con el objeto JSON corregido, sin ningún texto adicional.`,
        },
      ],
    });
    return { data: schema.parse(extractJson(repaired.text)), model: repaired.model };
  }
}
