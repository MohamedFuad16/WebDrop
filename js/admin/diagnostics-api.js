export class DiagnosticsApi {
  constructor({
    baseUrl = "",
    token = "",
    fetchImpl = (...args) => globalThis.fetch(...args)
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  configure({ baseUrl, token } = {}) {
    if (typeof baseUrl === "string") this.baseUrl = baseUrl.trim().replace(/\/$/, "");
    if (typeof token === "string") this.token = token.trim();
  }

  async readiness() {
    return this.request("/readyz", { authenticated: false });
  }

  async snapshot() {
    // Single authed diagnostics endpoint. The server consolidated the old
    // unauthenticated `/api/diagnostics-public` and token-gated
    // `/api/diagnostics-snapshot` into one route that always requires the metrics
    // bearer token. A missing/invalid token surfaces as `unauthorized`, which the
    // dashboard handles by prompting for a token.
    return this.request("/api/diagnostics-public", { authenticated: true });
  }

  async request(path, { authenticated = false } = {}) {
    if (!this.baseUrl) throw new Error("Signaling HTTP base is required.");
    const headers = {};
    if (authenticated && this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers,
      cache: "no-store"
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (!response.ok) {
      const message = body?.error || body?.message || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    return body;
  }
}
