function extensionFromMimeType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "png";
}

function buildClipboardFilename(prefix: string, type: string) {
  const ext = extensionFromMimeType(type);
  return `${prefix}-${Date.now()}.${ext}`;
}

export function extractClipboardImageFile(
  clipboardData: DataTransfer | null | undefined,
  prefix: string,
): File | null {
  if (!clipboardData) return null;

  for (const item of Array.from(clipboardData.items || [])) {
    if (!item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    return new File([file], buildClipboardFilename(prefix, file.type || item.type), {
      type: file.type || item.type,
      lastModified: Date.now(),
    });
  }

  return null;
}

export async function readClipboardImage(prefix: string): Promise<File | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) {
    return null;
  }

  const items = await navigator.clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith("image/"));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    return new File([blob], buildClipboardFilename(prefix, imageType), {
      type: imageType,
      lastModified: Date.now(),
    });
  }

  return null;
}
