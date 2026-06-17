export class TurnConfigProvider {
  constructor({ url = "", enabled = false, fetchImpl = (...args) => fetch(...args), authorizationProvider = null } = {}) {
    this.url = url;
    this.enabled = Boolean(enabled && url);
    this.fetchImpl = fetchImpl;
    this.cached = null;
    this.authorizationProvider = authorizationProvider;
  }

  async getIceServers() {
    if (this.enabled) {
      const config = await this.getRemoteConfig();
      if (Array.isArray(config.iceServers) && config.iceServers.length) return config.iceServers;
    }
    return [
      { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] }
    ];
  }

  async getRelayPolicy() {
    if (this.enabled) {
      const config = await this.getRemoteConfig();
      if (config.relayPolicy) return config.relayPolicy;
    }
    return {
      relayLimitBytes: 500 * 1024 * 1024,
      message: "Managed TURN credentials are disabled until production runtime configuration is enabled."
    };
  }

  async getRemoteConfig() {
    if (this.cached?.expiresAt > Date.now()) return this.cached.value;
    const authorization = this.authorizationProvider?.();
    if (!authorization?.token) {
      throw new Error("TURN configuration requires an authenticated signaling session.");
    }
    const requestUrl = new URL(this.url, globalThis.location?.href || "https://webdrop.invalid/");
    if (authorization.clientId) requestUrl.searchParams.set("clientId", authorization.clientId);
    const response = await this.fetchImpl(requestUrl.toString(), {
      method: "GET",
      credentials: "omit",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${authorization.token}`
      }
    });
    if (!response.ok) throw new Error(`TURN configuration request failed with ${response.status}`);
    const value = await response.json();
    this.cached = {
      value,
      expiresAt: Date.now() + 30000
    };
    return value;
  }
}
