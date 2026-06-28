const REDACTED_KEYS = new Set([
  "authorization",
  "credential",
  "iceServers",
  "CLOUDFLARE_TURN_API_TOKEN",
  "turnApiToken",
  "apiToken"
]);
const SECRET_KEY_PATTERN = /(authorization|bearer|token|secret|credential|password|iceServers|sdp)/i;

export function createLogger(scope = "webdrop") {
  return {
    info(message, meta) {
      write("info", scope, message, meta);
    },
    warn(message, meta) {
      write("warn", scope, message, meta);
    },
    error(message, meta) {
      write("error", scope, message, meta);
    }
  };
}

export function redact(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (REDACTED_KEYS.has(key) || SECRET_KEY_PATTERN.test(key)) return [key, "[redacted]"];
    return [key, redact(item)];
  }));
}

function write(level, scope, message, meta) {
  const entry = {
    level,
    scope,
    message,
    time: new Date().toISOString()
  };
  if (meta !== undefined) entry.meta = redact(meta);
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
