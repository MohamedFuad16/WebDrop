import fs from "node:fs";

export class PermissionPolicyProvider {
  constructor({ env = process.env, configPath = new URL("../config/permissions.json", import.meta.url) } = {}) {
    this.env = env;
    this.configPath = configPath;
    this.configCache = null;
  }

  getPolicy() {
    // The static config file does not change at runtime; read it once and reuse
    // it so the policy endpoint does not perform a synchronous disk read on the
    // event loop for every request.
    if (!this.configCache) this.configCache = readJson(this.configPath);
    const configured = this.configCache;
    const proximityAnalysisEnabled = this.env.ENABLE_PROXIMITY_ANALYSIS === "true";
    return {
      mode: proximityAnalysisEnabled ? "analysis-ready" : configured.mode || "report-only",
      proximityAnalysisEnabled,
      activationRequired: proximityAnalysisEnabled,
      browserPermissionsRequestedByServer: false,
      permissions: configured.permissions || {},
      note: "The backend reports future permission needs only. Browsers must request microphone, motion, or camera permissions from explicit user gestures in the frontend."
    };
  }
}

function readJson(pathOrUrl) {
  try {
    return JSON.parse(fs.readFileSync(pathOrUrl, "utf8"));
  } catch {
    return {
      mode: "report-only",
      permissions: {}
    };
  }
}
