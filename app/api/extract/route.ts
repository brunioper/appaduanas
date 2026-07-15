import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { chatJson, MODELS, type ChatMessage, type ContentPart } from "@/lib/ai";
import { ExtractionSchema, type Lang } from "@/lib/types";
import { extractSystemPrompt } from "@/prompts/extract";

export const runtime = "nodejs";
export const maxDuration = 120;

const SPREADSHEET_EXT = /\.(xlsx|xls|csv)$/i;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const lang = (form.get("lang") === "en" ? "en" : "es") as Lang;
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No se recibieron archivos." }, { status: 400 });
    }

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
        // last resort: try to read as plain text
        const text = buf.toString("utf-8");
        if (/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 1000))) {
          return NextResponse.json(
            { error: `Formato no soportado: ${name}. Usá JPG, PNG, PDF, XLSX o CSV.` },
            { status: 400 }
          );
        }
        parts.push({ type: "text", text: `--- FILE "${name}" (plain text) ---\n${text.slice(0, 40000)}` });
      }
    }

    const messages: ChatMessage[] = [
      { role: "system", content: extractSystemPrompt(lang) },
      { role: "user", content: parts },
    ];

    const { data: extraction, model } = await chatJson(ExtractionSchema, {
      models: MODELS.vision,
      messages,
      // pdf-text engine is free; premium OCR engines can be configured here later
      plugins: hasPdf ? [{ id: "file-parser", pdf: { engine: "pdf-text" } }] : undefined,
    });

    return NextResponse.json({ extraction, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido durante la extracción.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
