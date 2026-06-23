import { DiagnosticsApi } from "./diagnostics-api.js?v=1.0.69";
import {
  apiBaseFrom,
  escapeHtml,
  formatAge,
  formatFrequency,
  formatNumber
} from "./shared.js?v=1.0.69";

const runtime = globalThis.WEBDROP_RUNTIME_CONFIG || {};
const DEFAULT_BASE_URL = apiBaseFrom(runtime.turnConfigUrl || runtime.signalingUrl || "")
  || "https://webdrop-wss-0618.japaneast.cloudapp.azure.com";
const LANGUAGE_KEY = "webdrop.diagnosticsLanguage";
const MESSAGES = {
  en: {
    pageTitle: "Live proximity diagnostics",
    appLink: "App",
    adminLink: "Admin",
    sourceLabel: "Live source",
    languageLabel: "Language",
    refresh: "Refresh now",
    livePolling: "Live polling",
    server: "Server",
    devices: "Devices",
    devicesHelp: "Active signaling clients",
    pairings: "Pairings",
    pairingsHelp: "Verified active pairs",
    proximity: "Proximity",
    proximityHelp: "Joining or running sessions",
    presenceKicker: "Signaling presence",
    connectedDevices: "Connected devices",
    device: "Device",
    platform: "Platform",
    capabilities: "Capabilities",
    pairing: "Pairing",
    lastSeen: "Last seen",
    noSnapshot: "No diagnostics snapshot yet.",
    matchingKicker: "Physical matching",
    proximitySessions: "Proximity sessions",
    noSessions: "No active proximity sessions.",
    acousticKicker: "Device telemetry",
    acousticTitle: "Live ultrasonic channels",
    noChannels: "No acoustic telemetry yet. Tap Connect on two devices to stream channel data.",
    acousticNote: "Shows server-observed acoustic evidence from connected devices. Raw microphone audio stays on each device; this dashboard receives bounded telemetry only.",
    timelineKicker: "Server timeline",
    timelineTitle: "Connection attempts and telemetry",
    clearLocal: "Clear local view",
    noEvents: "No server events loaded.",
    checking: "Checking",
    connected: "Connected",
    unavailable: "Unavailable",
    offline: "Offline",
    production: "Production signaling",
    channels: "channels",
    noClients: "No active signaling clients.",
    unpaired: "unpaired",
    noneReported: "none reported",
    waitingTelemetry: "waiting for telemetry",
    waitingSlot: "waiting for slot",
    emitted: "emitted",
    detected: "detected",
    listened: "listened",
    reason: "reason",
    yes: "yes",
    no: "no",
    method: "method",
    sampleRate: "sample rate",
    recording: "recording",
    margin: "margin",
    correlation: "correlation",
    band: "band",
    slot: "slot",
    score: "score",
    decision: "decision"
  },
  ja: {
    pageTitle: "近接ライブ診断",
    appLink: "アプリ",
    adminLink: "管理",
    sourceLabel: "ライブ接続先",
    languageLabel: "言語",
    refresh: "今すぐ更新",
    livePolling: "ライブ更新",
    server: "サーバー",
    devices: "端末",
    devicesHelp: "接続中の端末",
    pairings: "ペア",
    pairingsHelp: "検証済み接続",
    proximity: "近接",
    proximityHelp: "参加中または実行中",
    presenceKicker: "シグナリング",
    connectedDevices: "接続中の端末",
    device: "端末",
    platform: "プラットフォーム",
    capabilities: "機能",
    pairing: "ペアリング",
    lastSeen: "最終表示",
    noSnapshot: "診断スナップショットはまだありません。",
    matchingKicker: "物理マッチング",
    proximitySessions: "近接セッション",
    noSessions: "アクティブな近接セッションはありません。",
    acousticKicker: "端末テレメトリ",
    acousticTitle: "超音波ライブチャンネル",
    noChannels: "音響テレメトリはまだありません。2台で接続を押すとチャンネル情報が流れます。",
    acousticNote: "接続中端末からサーバーに届いた音響証拠を表示します。生のマイク音声は端末内に残り、この画面には範囲を限定したテレメトリだけが届きます。",
    timelineKicker: "サーバータイムライン",
    timelineTitle: "接続試行とテレメトリ",
    clearLocal: "表示をクリア",
    noEvents: "サーバーイベントはまだありません。",
    checking: "確認中",
    connected: "接続済み",
    unavailable: "利用不可",
    offline: "オフライン",
    production: "本番シグナリング",
    channels: "チャンネル",
    noClients: "接続中の端末はありません。",
    unpaired: "未接続",
    noneReported: "未報告",
    waitingTelemetry: "テレメトリ待ち",
    waitingSlot: "スロット待ち",
    emitted: "送信",
    detected: "検出",
    listened: "待受",
    reason: "理由",
    yes: "はい",
    no: "いいえ",
    method: "方式",
    sampleRate: "サンプル",
    recording: "録音",
    margin: "マージン",
    correlation: "相関",
    band: "帯域",
    slot: "スロット",
    score: "スコア",
    decision: "判定"
  }
};

const nodes = {
  language: document.querySelector("[data-diagnostics-language]"),
  polling: document.querySelector("[data-diagnostics-poll]"),
  baseLabel: document.querySelector("[data-diagnostics-base-label]"),
  serverStatus: document.querySelector("[data-server-status]"),
  serverDetail: document.querySelector("[data-server-detail]"),
  deviceCount: document.querySelector("[data-device-count]"),
  pairCount: document.querySelector("[data-pair-count]"),
  sessionCount: document.querySelector("[data-session-count]"),
  snapshotTime: document.querySelector("[data-snapshot-time]"),
  deviceRows: document.querySelector("[data-device-rows]"),
  sessionList: document.querySelector("[data-session-list]"),
  channelCount: document.querySelector("[data-channel-count]"),
  channelList: document.querySelector("[data-channel-list]"),
  frequencyStrip: document.querySelector("[data-frequency-strip]"),
  eventStream: document.querySelector("[data-event-stream]"),
  error: document.querySelector("[data-diagnostics-error]")
};
const state = {
  pollTimer: 0,
  eventsClearedAt: 0,
  refreshing: false,
  language: preferredLanguage(),
  lastSnapshot: null
};
const api = new DiagnosticsApi({ baseUrl: DEFAULT_BASE_URL });

init();

function init() {
  nodes.baseLabel.textContent = `${t("production")} · ${DEFAULT_BASE_URL.replace(/^https?:\/\//, "")}`;
  nodes.language.value = state.language;
  document.documentElement.lang = state.language;
  applyTranslations();
  document.querySelector("[data-action='diagnostics-refresh']")?.addEventListener("click", refresh);
  document.querySelector("[data-action='events-clear']")?.addEventListener("click", () => {
    state.eventsClearedAt = Date.now();
    renderEvents([]);
  });
  nodes.polling.addEventListener("change", syncPolling);
  nodes.language.addEventListener("change", () => {
    state.language = nodes.language.value === "ja" ? "ja" : "en";
    localStorage.setItem(LANGUAGE_KEY, state.language);
    document.documentElement.lang = state.language;
    applyTranslations();
    if (state.lastSnapshot) renderSnapshot(state.lastSnapshot);
  });
  refresh();
  syncPolling();
}

async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  api.configure({ baseUrl: DEFAULT_BASE_URL, token: "" });
  hideError();
  try {
    await refreshReadiness();
    const snapshot = await api.snapshot();
    state.lastSnapshot = snapshot;
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
    nodes.serverStatus.textContent = readiness.ok ? t("connected") : t("unavailable");
    nodes.serverDetail.textContent = readiness.ok
      ? `${readiness.environment || "unknown"} · TURN ${readiness.turnConfigured ? "ready" : "missing"}`
      : "Readiness returned false";
  } catch (error) {
    nodes.serverStatus.textContent = t("offline");
    nodes.serverDetail.textContent = error.message;
  }
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
  const events = (metrics.recentEvents || []).filter((event) => {
    return !state.eventsClearedAt || Date.parse(event.at) > state.eventsClearedAt;
  });
  nodes.deviceCount.textContent = String(clients.length);
  nodes.pairCount.textContent = String(pairs.length);
  nodes.sessionCount.textContent = String(sessions.length);
  nodes.snapshotTime.textContent = snapshot.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleTimeString()
    : "Just now";
  renderDevices(clients);
  renderSessions(sessions);
  renderChannels(extractChannels({ sessions, events }));
  renderEvents(events);
}

function renderDevices(clients) {
  if (!clients.length) {
    nodes.deviceRows.innerHTML = `<tr><td colspan="5" class="empty-cell">${escapeHtml(t("noClients"))}</td></tr>`;
    return;
  }
  nodes.deviceRows.innerHTML = clients.map((client) => {
    const capabilities = Object.entries(client.capabilities || {})
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(", ") || t("noneReported");
    return `
      <tr>
        <td><strong>${escapeHtml(client.deviceName || client.id)}</strong><small>${escapeHtml(client.id)}</small></td>
        <td>${escapeHtml(client.deviceLabel || client.deviceFamily || "unknown")}</td>
        <td>${escapeHtml(capabilities)}</td>
        <td>${escapeHtml(client.pairingId || t("unpaired"))}</td>
        <td>${escapeHtml(formatAge(client.lastSeenMsAgo))}</td>
      </tr>
    `;
  }).join("");
}

function renderSessions(sessions) {
  if (!sessions.length) {
    nodes.sessionList.innerHTML = `<p class="empty-state">${escapeHtml(t("noSessions"))}</p>`;
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
    ? `${t("slot")} ${signature.slot} · code ${signature.code ?? 0} · ${formatFrequency(signature.startFrequencyHz, signature.endFrequencyHz)}`
    : t("waitingSlot");
  const telemetryText = telemetry
    ? `${t("decision")} ${telemetry.decision} · ${t("score")} ${Math.round(Number(telemetry.score || 0) * 100)}% · ${t("emitted")} ${yesNo(acoustic?.emitted)} · ${t("detected")} ${yesNo(acoustic?.detected)} · ${formatNumber(acoustic?.marginDb)} dB`
    : t("waitingTelemetry");
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

function renderChannels(channels) {
  nodes.channelCount.textContent = `${channels.length} ${t("channels")}`;
  if (!channels.length) {
    nodes.channelList.innerHTML = `<p class="empty-state">${escapeHtml(t("noChannels"))}</p>`;
    nodes.frequencyStrip.innerHTML = "";
    return;
  }
  nodes.channelList.innerHTML = channels.slice(0, 24).map((channel) => `
    <article class="channel-card" data-state="${channel.detected ? "detected" : channel.emitted ? "emitted" : "missed"}">
      <div class="channel-head">
        <div>
          <strong>${escapeHtml(channel.deviceName || channel.clientId || "Unknown device")}</strong>
          <small>${escapeHtml(channel.sessionId || "latest telemetry")}</small>
        </div>
        <span>${escapeHtml(channel.slotLabel)}</span>
      </div>
      <div class="channel-band">
        <span>${escapeHtml(channel.bandLabel)}</span>
        <i style="--start:${channel.startPercent};--width:${channel.widthPercent}"></i>
      </div>
      <dl>
        <div><dt>${t("emitted")}</dt><dd>${yesNo(channel.emitted)}</dd></div>
        <div><dt>${t("detected")}</dt><dd>${yesNo(channel.detected)}</dd></div>
        <div><dt>${t("margin")}</dt><dd>${formatNumber(channel.marginDb)} dB</dd></div>
        <div><dt>${t("correlation")}</dt><dd>${formatNumber(channel.correlation, 2)}</dd></div>
        <div><dt>${t("method")}</dt><dd>${escapeHtml(channel.method || "n/a")}</dd></div>
        <div><dt>${t("sampleRate")}</dt><dd>${channel.sampleRate ? `${channel.sampleRate} Hz` : "n/a"}</dd></div>
        <div><dt>RMS / Peak</dt><dd>${formatNumber(channel.rms, 3)} / ${formatNumber(channel.peak, 3)}</dd></div>
        <div><dt>${t("reason")}</dt><dd>${escapeHtml(channel.reason || "none")}</dd></div>
      </dl>
    </article>
  `).join("");
  nodes.frequencyStrip.innerHTML = channels.slice(0, 18).map((channel) => `
    <span title="${escapeHtml(`${channel.deviceName || channel.clientId}: ${channel.bandLabel}`)}" style="--start:${channel.startPercent};--width:${channel.widthPercent}" data-detected="${channel.detected ? "true" : "false"}"></span>
  `).join("");
}

function renderEvents(events) {
  if (!events.length) {
    nodes.eventStream.innerHTML = `<p class="empty-state">${escapeHtml(t("noEvents"))}</p>`;
    return;
  }
  nodes.eventStream.innerHTML = events.slice(0, 120).map((event) => `
    <article class="event-item" data-event-kind="${escapeHtml(event.type || "")}">
      <div class="event-head">
        <strong class="event-type">${escapeHtml(event.type)}</strong>
        <small>${escapeHtml(new Date(event.at).toLocaleTimeString())}</small>
      </div>
      ${event.detail ? `<p>${escapeHtml(JSON.stringify(event.detail))}</p>` : ""}
    </article>
  `).join("");
}

function extractChannels({ sessions, events }) {
  const channels = [];
  for (const session of sessions) {
    for (const participant of session.participants || []) {
      const acoustic = participant.telemetry?.acoustic;
      const signature = participant.signature;
      if (!acoustic && !signature) continue;
      channels.push(normalizeChannel({
        at: participant.telemetry?.receivedAt,
        sessionId: session.id,
        clientId: participant.clientId,
        deviceName: participant.deviceName,
        slot: acoustic?.slot || signature?.slot,
        slotCount: acoustic?.slotCount || session.participantCount,
        startFrequencyHz: acoustic?.startFrequencyHz || signature?.startFrequencyHz,
        endFrequencyHz: acoustic?.endFrequencyHz || signature?.endFrequencyHz,
        emitted: acoustic?.emitted,
        detected: acoustic?.detected,
        marginDb: acoustic?.marginDb,
        correlation: firstFinite(acoustic?.detections?.[0]?.correlation, participant.telemetry?.analysis?.normalized?.sound),
        method: acoustic?.detectionMethod,
        sampleRate: acoustic?.sampleRate,
        rms: acoustic?.recordingRms,
        peak: acoustic?.recordingPeak,
        reason: acoustic?.reason
      }));
    }
  }
  for (const event of events || []) {
    if (event.type !== "proximity:session:telemetry") continue;
    const detail = event.detail || {};
    channels.push(normalizeChannel({
      at: event.at,
      sessionId: detail.sessionId,
      clientId: detail.clientId,
      slot: detail.acousticSlot,
      startFrequencyHz: detail.acousticStartFrequencyHz,
      endFrequencyHz: detail.acousticEndFrequencyHz,
      emitted: detail.acousticEmitted,
      detected: detail.acousticDetected,
      marginDb: detail.acousticMarginDb,
      correlation: detail.acousticCorrelation,
      method: detail.acousticDetectionMethod,
      sampleRate: detail.acousticSampleRate,
      rms: detail.acousticRecordingRms,
      peak: detail.acousticRecordingPeak,
      reason: detail.acousticReason
    }));
  }
  return dedupeChannels(channels.filter(Boolean));
}

function normalizeChannel(raw) {
  const start = Number(raw.startFrequencyHz);
  const end = Number(raw.endFrequencyHz);
  const slot = Number(raw.slot || 0);
  const slotCount = Number(raw.slotCount || 0);
  const bandLabel = Number.isFinite(start) && Number.isFinite(end)
    ? formatFrequency(start, end)
    : "unknown band";
  const startPercent = Number.isFinite(start) ? clamp((start - 18000) / 2400 * 100, 0, 100) : 0;
  const widthPercent = Number.isFinite(start) && Number.isFinite(end)
    ? clamp((end - start) / 2400 * 100, 4, 100 - startPercent)
    : 10;
  return {
    ...raw,
    slotLabel: slot ? `${t("slot")} ${slot}${slotCount ? `/${slotCount}` : ""}` : t("listened"),
    bandLabel,
    startPercent: `${startPercent}%`,
    widthPercent: `${widthPercent}%`
  };
}

function dedupeChannels(channels) {
  const seen = new Set();
  return channels
    .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))
    .filter((channel) => {
      const key = [channel.sessionId, channel.clientId, channel.slot, channel.bandLabel, channel.at].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function applyTranslations() {
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
}

function diagnosticsErrorMessage(error) {
  if (error.message === "unauthorized") return "Diagnostics are still protected on this server. Deploy the public diagnostics route.";
  if (error.message === "not_found") return "The signaling server does not have the diagnostics route deployed yet.";
  if (error.message === "Failed to fetch") return "The signaling server is healthy, but this page could not reach diagnostics. Check ALLOWED_ORIGINS and deployment.";
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

function preferredLanguage() {
  const saved = localStorage.getItem(LANGUAGE_KEY);
  if (saved === "en" || saved === "ja") return saved;
  return /^ja\b/i.test(navigator.language || "") ? "ja" : "en";
}

function t(key) {
  return MESSAGES[state.language]?.[key] || MESSAGES.en[key] || key;
}

function yesNo(value) {
  return value ? t("yes") : t("no");
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
