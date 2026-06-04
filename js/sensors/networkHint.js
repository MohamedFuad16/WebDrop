export class NetworkHintSensor {
  constructor() {
    this.networkHints = new Map();
  }

  recordIceCandidate(userId, candidateLine) {
    const ipAddress = this.extractPrivateIpv4(candidateLine);
    if (!ipAddress) return;
    this.networkHints.set(userId, {
      ipAddress,
      sameSubnet: true,
      updatedAt: Date.now()
    });
  }

  getScore(userId) {
    const hint = this.networkHints.get(userId);
    if (!hint) return 0;
    return hint.sameSubnet ? 20 : 8; // Max 20
  }

  extractPrivateIpv4(candidateLine) {
    const match = String(candidateLine).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    if (!match) return null;
    const ipAddress = match[0];
    return this.isPrivateIpv4(ipAddress) ? ipAddress : null;
  }

  isPrivateIpv4(ipAddress) {
    const parts = ipAddress.split(".").map(Number);
    if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    return parts[0] === 192 && parts[1] === 168;
  }
}
