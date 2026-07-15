"use client";

/**
 * Client-side image preparation: screenshots and phone photos get downscaled
 * and re-encoded as JPEG before upload. This makes big photos work at all
 * (Vercel rejects request bodies over ~4.5 MB) and speeds up the vision model.
 * Anything that can't be decoded is uploaded untouched.
 */

const MAX_DIMENSION = 2200; // px — plenty for invoice OCR
const SKIP_BELOW_BYTES = 900 * 1024; // small files pass through
const JPEG_QUALITY = 0.85;

export async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // browser can't decode (e.g. some HEIC) — send as-is
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (file.size < SKIP_BELOW_BYTES && scale === 1) {
    bitmap.close();
    return file;
  }

  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  // white background: screenshots with transparency otherwise turn black in JPEG
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
