import fs from "node:fs";

export class PermissionPolicyProvider {
  constructor({ env = process.env, configPath = new URL("../config/permissions.json", import.meta.url) } = {}) {
    this.env = env;
    this.configPath = configPath;
  }

  getPolicy() {
    const configured = readJson(this.configPath);
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
