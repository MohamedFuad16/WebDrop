export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatAge(milliseconds, locale = "en") {
  const value = Math.max(0, Number(milliseconds) || 0);
  const japanese = locale === "ja";
  if (value < 1000) return japanese ? "今" : "now";
  if (value < 60000) return japanese ? `${Math.round(value / 1000)}秒前` : `${Math.round(value / 1000)}s ago`;
  return japanese ? `${Math.round(value / 60000)}分前` : `${Math.round(value / 60000)}m ago`;
}

export function formatFrequency(start, end) {
  if (!Number.isFinite(Number(start)) || !Number.isFinite(Number(end))) return "unknown band";
  return `${(Number(start) / 1000).toFixed(2)}-${(Number(end) / 1000).toFixed(2)} kHz`;
}

export function formatNumber(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "n/a";
}

export function apiBaseFrom(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}
