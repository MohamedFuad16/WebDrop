export function formatBytes(bytes) {
  if (!bytes) return "0";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const fixed = value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${fixed} ${units[unit]}`;
}
