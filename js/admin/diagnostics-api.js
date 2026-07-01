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

  async proximityPolicy() {
    return this.request("/api/proximity-policy", { authenticated: false });
  }

  async updateProximityPolicy(policy) {
    return this.request("/api/proximity-policy", {
      authenticated: true,
      method: "PUT",
      body: policy
    });
  }

  async request(path, { authenticated = false, method = "GET", body } = {}) {
    if (!this.baseUrl) throw new Error("Signaling HTTP base is required.");
    const headers = {};
    if (authenticated && this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers,
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store"
    });
    const text = await response.text();
    let parsedBody;
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = text;
    }
    if (!response.ok) {
      const message = parsedBody?.message || parsedBody?.error || `${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    return parsedBody;
  }
}
