const MAX_EDGE = 1680;
const JPEG_QUALITY = 0.82;
const SMALL_FILE_BYTES = 450_000;

/**
 * Downscale large screenshots and re-encode as JPEG to speed uploads and avoid UI stalls.
 * GIFs and tiny files are left unchanged.
 */
export async function compressTradeScreenshot(input: File): Promise<File> {
  if (!input.type.startsWith("image/") || input.type === "image/gif") {
    return input;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input);
  } catch {
    return input;
  }

  try {
    const maxDim = Math.max(bitmap.width, bitmap.height);
    if (maxDim <= MAX_EDGE && input.size < SMALL_FILE_BYTES) {
      return input;
    }

    const scale = Math.min(1, MAX_EDGE / maxDim);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return input;

    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) return input;
    if (blob.size >= input.size * 0.92) return input;

    const base = input.name.replace(/\.[^/.]+$/, "") || "screenshot";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
