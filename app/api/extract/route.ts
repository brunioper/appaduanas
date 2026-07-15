import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { chatJson, MODELS, type ChatMessage, type ContentPart } from "@/lib/ai";
import { aiEventNote, ndjsonResponse } from "@/lib/progress";
import { ExtractionSchema, type Lang } from "@/lib/types";
import { extractSystemPrompt } from "@/prompts/extract";

export const runtime = "nodejs";
// Vision models on the free tier can retry several times on 429s
export const maxDuration = 300;

const SPREADSHEET_EXT = /\.(xlsx|xls|csv)$/i;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const lang = (form.get("lang") === "en" ? "en" : "es") as Lang;
  const es = lang === "es";

  return ndjsonResponse(async (send) => {
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      send({ t: "error", error: es ? "No se recibieron archivos." : "No files received." });
      return;
    }

    send({ t: "s", id: "files", st: "run" });
    const parts: ContentPart[] = [
      {
        type: "text",
        text: `Documents for this customs case (${files.length} file(s)) follow. Extract per the schema.`,
      },
    ];
    let hasPdf = false;

    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const name = file.name || "document";
      const mime = file.type || "";
      send({ t: "s", id: "files", st: "run", note: name });

      if (mime.startsWith("image/")) {
        parts.push({
          type: "image_url",
          image_url: { url: `data:${mime};base64,${buf.toString("base64")}` },
        });
      } else if (mime === "application/pdf" || /\.pdf$/i.test(name)) {
        hasPdf = true;
        parts.push({
          type: "file",
          file: {
            filename: name,
            file_data: `data:application/pdf;base64,${buf.toString("base64")}`,
          },
        });
      } else if (SPREADSHEET_EXT.test(name) || mime.includes("spreadsheet") || mime.includes("csv") || mime.includes("excel")) {
        const wb = XLSX.read(buf, { type: "buffer" });
        for (const sheetName of wb.SheetNames) {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
          if (csv.trim()) {
            parts.push({
              type: "text",
              text: `--- FILE "${name}" · SHEET "${sheetName}" (as CSV) ---\n${csv.slice(0, 40000)}`,
            });
          }
        }
      } else {
        const text = buf.toString("utf-8");
        if (/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 1000))) {
          send({
            t: "error",
            error: es
              ? `Formato no soportado: ${name}. Usá JPG, PNG, PDF, XLSX o CSV.`
              : `Unsupported format: ${name}. Use JPG, PNG, PDF, XLSX or CSV.`,
          });
          return;
        }
        parts.push({ type: "text", text: `--- FILE "${name}" (plain text) ---\n${text.slice(0, 40000)}` });
      }
    }
    send({ t: "s", id: "files", st: "ok" });

    const messages: ChatMessage[] = [
      { role: "system", content: extractSystemPrompt(lang) },
      { role: "user", content: parts },
    ];

    send({ t: "s", id: "vision", st: "run" });
    const { data: extraction, model } = await chatJson(ExtractionSchema, {
      models: MODELS.vision,
      messages,
      // pdf-text engine is free; premium OCR engines can be configured here later
      plugins: hasPdf ? [{ id: "file-parser", pdf: { engine: "pdf-text" } }] : undefined,
      onEvent: (e) => send({ t: "s", id: "vision", st: "run", note: aiEventNote(lang, e) }),
    });
    send({
      t: "s",
      id: "vision",
      st: extraction.lineItems.length === 0 ? "warn" : "ok",
      note:
        extraction.lineItems.length === 0
          ? es
            ? "No se detectaron ítems"
            : "No line items detected"
          : `${extraction.lineItems.length} ítems`,
    });

    send({ t: "result", extraction, model });
  });
}
