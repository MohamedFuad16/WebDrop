export class TurnConfigProvider {
  async getIceServers() {
    return [
      { urls: "stun:stun.l.google.com:19302" }
    ];
  }

  async getRelayPolicy() {
    return {
      relayLimitBytes: 500 * 1024 * 1024,
      message: "TURN credentials are supplied later by the managed relay service."
    };
  }
}
