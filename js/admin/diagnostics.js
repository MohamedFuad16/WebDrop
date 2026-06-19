import { AcousticLab } from "./acoustic-lab.js?v=1.0.58";
import { DiagnosticsApi } from "./diagnostics-api.js?v=1.0.58";
import {
  apiBaseFrom,
  escapeHtml,
  formatAge,
  formatFrequency,
  formatNumber
} from "./shared.js?v=1.0.58";

const runtime = globalThis.WEBDROP_RUNTIME_CONFIG || {};
const nodes = {
  base: document.querySelector("[data-diagnostics-base]"),
  token: document.querySelector("[data-diagnostics-token]"),
  polling: document.querySelector("[data-diagnostics-poll]"),
  serverStatus: document.querySelector("[data-server-status]"),
  serverDetail: document.querySelector("[data-server-detail]"),
  deviceCount: document.querySelector("[data-device-count]"),
  pairCount: document.querySelector("[data-pair-count]"),
  sessionCount: document.querySelector("[data-session-count]"),
  snapshotTime: document.querySelector("[data-snapshot-time]"),
  deviceRows: document.querySelector("[data-device-rows]"),
  sessionList: document.querySelector("[data-session-list]"),
  eventStream: document.querySelector("[data-event-stream]"),
  error: document.querySelector("[data-diagnostics-error]")
};
const state = {
  pollTimer: 0,
  eventsClearedAt: 0,
  refreshing: false
};
const api = new DiagnosticsApi();
new AcousticLab(document);

init();

function init() {
  nodes.base.value = apiBaseFrom(runtime.turnConfigUrl || runtime.signalingUrl || "");
  nodes.token.value = sessionStorage.getItem("webdrop.diagnosticsToken") || "";
  document.querySelector("[data-action='diagnostics-refresh']")?.addEventListener("click", refresh);
  document.querySelector("[data-action='events-clear']")?.addEventListener("click", () => {
    state.eventsClearedAt = Date.now();
    renderEvents([]);
  });
  nodes.polling.addEventListener("change", syncPolling);
  nodes.token.addEventListener("change", () => {
    if (nodes.token.value) sessionStorage.setItem("webdrop.diagnosticsToken", nodes.token.value);
    else sessionStorage.removeItem("webdrop.diagnosticsToken");
  });
  refresh();
  syncPolling();
}

async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  configureApi();
  hideError();
  try {
    await refreshReadiness();
    const snapshot = await api.snapshot();
    renderSnapshot(snapshot);
  } catch (error) {
    showError(diagnosticsErrorMessage(error));
  } finally {
    state.refreshing = false;
  }
}

async function refreshReadiness() {
  try {
    const readiness = await api.readiness();
    nodes.serverStatus.textContent = readiness.ok ? "Connected" : "Unavailable";
    nodes.serverDetail.textContent = readiness.ok
      ? `${readiness.environment || "unknown"} · TURN ${readiness.turnConfigured ? "ready" : "missing"}`
      : "Readiness returned false";
  } catch (error) {
    nodes.serverStatus.textContent = "Offline";
    nodes.serverDetail.textContent = error.message;
  }
}

function configureApi() {
  api.configure({
    baseUrl: nodes.base.value,
    token: nodes.token.value
  });
}

function syncPolling() {
  globalThis.clearInterval(state.pollTimer);
  state.pollTimer = 0;
  if (nodes.polling.checked) {
    state.pollTimer = globalThis.setInterval(refresh, 1200);
  }
}

function renderSnapshot(snapshot = {}) {
  const signaling = snapshot.signaling || {};
  const metrics = snapshot.metrics || {};
  const clients = Array.isArray(signaling.clients) ? signaling.clients : [];
  const pairs = Array.isArray(signaling.pairs) ? signaling.pairs : [];
  const sessions = Array.isArray(signaling.proximitySessions) ? signaling.proximitySessions : [];
  nodes.deviceCount.textContent = String(clients.length);
  nodes.pairCount.textContent = String(pairs.length);
  nodes.sessionCount.textContent = String(sessions.length);
  nodes.snapshotTime.textContent = snapshot.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleTimeString()
    : "Just now";
  renderDevices(clients);
  renderSessions(sessions);
  renderEvents((metrics.recentEvents || []).filter((event) => {
    return !state.eventsClearedAt || Date.parse(event.at) > state.eventsClearedAt;
  }));
}

function renderDevices(clients) {
  if (!clients.length) {
    nodes.deviceRows.innerHTML = `<tr><td colspan="5" class="empty-cell">No active signaling clients.</td></tr>`;
    return;
  }
  nodes.deviceRows.innerHTML = clients.map((client) => {
    const capabilities = Object.entries(client.capabilities || {})
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(", ") || "none reported";
    return `
      <tr>
        <td><strong>${escapeHtml(client.deviceName || client.id)}</strong><small>${escapeHtml(client.id)}</small></td>
        <td>${escapeHtml(client.deviceLabel || client.deviceFamily || "unknown")}</td>
        <td>${escapeHtml(capabilities)}</td>
        <td>${escapeHtml(client.pairingId || "unpaired")}</td>
        <td>${escapeHtml(formatAge(client.lastSeenMsAgo))}</td>
      </tr>
    `;
  }).join("");
}

function renderSessions(sessions) {
  if (!sessions.length) {
    nodes.sessionList.innerHTML = `<p class="empty-state">No active proximity sessions.</p>`;
    return;
  }
  nodes.sessionList.innerHTML = sessions.map((session) => `
    <article class="session-item">
      <div class="session-head">
        <strong class="session-id">${escapeHtml(session.id)}</strong>
        <span class="status-pill">${escapeHtml(session.phase)} · ${session.participantCount}</span>
      </div>
      ${(session.participants || []).map(renderParticipant).join("")}
    </article>
  `).join("");
}

function renderParticipant(participant) {
  const signature = participant.signature;
  const telemetry = participant.telemetry;
  const acoustic = telemetry?.acoustic;
  const stateClass = acoustic?.detected ? "telemetry-good" : telemetry ? "telemetry-bad" : "";
  const signatureText = signature
    ? `slot ${signature.slot} · ${formatFrequency(signature.startFrequencyHz, signature.endFrequencyHz)}`
    : "waiting for slot";
  const telemetryText = telemetry
    ? `${telemetry.decision} · ${Math.round(Number(telemetry.score || 0) * 100)}% · emitted ${acoustic?.emitted ? "yes" : "no"} · detected ${acoustic?.detected ? "yes" : "no"} · ${formatNumber(acoustic?.marginDb)} dB`
    : "waiting for telemetry";
  return `
    <div class="participant-row">
      <div>
        <strong>${escapeHtml(participant.deviceName || participant.clientId)}</strong>
        <small>${escapeHtml(signatureText)}</small>
      </div>
      <small class="${stateClass}">${escapeHtml(telemetryText)}</small>
    </div>
  `;
}

function renderEvents(events) {
  if (!events.length) {
    nodes.eventStream.innerHTML = `<p class="empty-state">No server events loaded.</p>`;
    return;
  }
  nodes.eventStream.innerHTML = events.slice(0, 120).map((event) => `
    <article class="event-item">
      <div class="event-head">
        <strong class="event-type">${escapeHtml(event.type)}</strong>
        <small>${escapeHtml(new Date(event.at).toLocaleTimeString())}</small>
      </div>
      ${event.detail ? `<p>${escapeHtml(JSON.stringify(event.detail))}</p>` : ""}
    </article>
  `).join("");
}

function diagnosticsErrorMessage(error) {
  if (error.message === "unauthorized") {
    return "The diagnostics endpoint requires the server METRICS_API_TOKEN. Enter it above; it is kept only for this browser session.";
  }
  if (error.message === "not_found") {
    return "The signaling server is healthy but does not have the diagnostics endpoint deployed yet.";
  }
  if (error.message === "Failed to fetch") {
    return "The signaling server is healthy, but the protected diagnostics request could not be reached. Deploy the diagnostics endpoint and allow this page origin in ALLOWED_ORIGINS.";
  }
  return error.message;
}

function showError(message) {
  nodes.error.hidden = false;
  nodes.error.textContent = message;
}

function hideError() {
  nodes.error.hidden = true;
  nodes.error.textContent = "";
}
