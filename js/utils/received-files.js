const SAFE_PREVIEW_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|pdf|mp4|mov|webm)$/i;
const UNSAFE_PREVIEW_TYPES = new Set([
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
  "application/xml",
  "text/xml"
]);

export function isPreviewableReceivedItem(item = {}) {
  const type = normalizeMimeType(item.type);
  const name = String(item.name || item.downloadName || "").toLowerCase();
  if (isUnsafePreviewType(type)) return false;
  if (type.startsWith("image/") || type.startsWith("video/") || type === "application/pdf") return true;
  return SAFE_PREVIEW_EXTENSIONS.test(name);
}

function normalizeMimeType(type) {
  return String(type || "").toLowerCase().split(";")[0].trim();
}

function isUnsafePreviewType(type) {
  if (!type) return false;
  if (UNSAFE_PREVIEW_TYPES.has(type)) return true;
  return type.startsWith("text/");
}
