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
    try {
      return await this.request("/api/diagnostics-public", { authenticated: false });
    } catch (error) {
      if (error.message !== "not_found") throw error;
      return this.request("/api/diagnostics-snapshot", { authenticated: true });
    }
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
