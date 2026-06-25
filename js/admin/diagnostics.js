import { DiagnosticsApi } from "./diagnostics-api.js?v=1.0.81";
import { createOperationsI18n } from "./operations-i18n.js?v=1.0.81";
import { AcousticProximitySensor } from "../services/acoustic-proximity.js?v=1.0.81";
import {
  apiBaseFrom,
  escapeHtml,
  formatAge,
  formatFrequency,
  formatNumber
} from "./shared.js?v=1.0.81";

const APP_VERSION = "1.0.81";
const runtime = globalThis.WEBDROP_RUNTIME_CONFIG || {};
const DEFAULT_BASE_URL = apiBaseFrom(runtime.turnConfigUrl || runtime.signalingUrl || "")
  || "https://webdrop-wss-0618.japaneast.cloudapp.azure.com";
const DISPLAY_BAND_START_HZ = 18_000;
const DISPLAY_BAND_END_HZ = 21_000;
const LOCAL_MONITOR_BANDS = Array.from({ length: 12 }, (_, index) => {
  const startFrequencyHz = DISPLAY_BAND_START_HZ + index * 250;
  return { startFrequencyHz, endFrequencyHz: startFrequencyHz + 250 };
});

const MESSAGES = {
  en: {
    documentTitle: "WebDrop Live Diagnostics",
    diagnosticsNavigation: "Diagnostics navigation",
    operationsKicker: "WebDrop operations",
    pageTitle: "Live proximity diagnostics",
    pageCopy: "A live control room for signaling presence, physical matching, ultrasonic evidence, and failure analysis.",
    appLink: "Back to app",
    adminLink: "Readiness and testing",
    languageLabel: "Language",
    appVersion: "app version",
    lastSnapshot: "last snapshot",
    sourceLabel: "Live source",
    refresh: "Refresh now",
    livePolling: "Live polling",
    server: "server",
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
    localAcousticKicker: "This browser",
    localAcousticTitle: "Local ultrasonic monitor",
    localAcousticEmpty: "Enable the microphone from this browser to inspect local ultrasonic input.",
    localAcousticNote: "This local probe does not need another phone. It proves whether the current browser can open the mic, run Web Audio, emit the inaudible WebDrop chirp, and see energy in the ultrasonic band.",
    enableMicrophone: "Enable microphone",
    emitChirp: "Emit chirp",
    runLoopback: "Run loopback",
    stop: "Stop",
    microphone: "Microphone",
    audioContext: "Audio context",
    peakFrequency: "Peak frequency",
    notRequested: "Not requested",
    notStarted: "Not started",
    idle: "Idle",
    monitoring: "Monitoring",
    emittingNow: "Emitting",
    loopbackRunning: "Loopback",
    granted: "Granted",
    unsupported: "Unsupported",
    failed: "Failed",
    startedMonitor: "Local monitor started",
    stoppedMonitor: "Local monitor stopped",
    chirpEmitted: "Chirp emitted",
    chirpFailed: "Chirp failed",
    loopbackDetected: "Loopback detected",
    loopbackMissed: "Loopback missed",
    analysisKicker: "Debug analysis",
    analysisTitle: "Ceremony health and failure reasons",
    noAnalysis: "No ceremony evidence has arrived yet.",
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
    online: "online",
    noClients: "No active signaling clients.",
    unpaired: "unpaired",
    noneReported: "none reported",
    waitingTelemetry: "waiting for telemetry",
    waitingSlot: "waiting for slot",
    emitted: "Emitted",
    detected: "Detected",
    listened: "Listening",
    reason: "Reason",
    yes: "Yes",
    no: "No",
    method: "Method",
    sampleRate: "Sample rate",
    capture: "Capture",
    margin: "Energy margin",
    correlation: "Correlation",
    confidenceMargin: "Winner margin",
    runnerUp: "Runner-up",
    band: "Band",
    slot: "Slot",
    score: "Score",
    decision: "Decision",
    strictInaudible: "Strict inaudible",
    inputRate: "Input rate",
    starts: "Starts",
    ends: "Ends",
    age: "Age",
    rawDetail: "Raw event detail",
    healthy: "Receiving acoustic evidence",
    attention: "Acoustic evidence is missing",
    waiting: "Waiting for a ceremony",
    detectedChannels: "Detected channels",
    missedChannels: "Missed channels",
    averageMargin: "Average energy margin",
    protocolBand: "Protocol band",
    failureLeader: "Most common failure",
    eventVolume: "Timeline events",
    noFailure: "No failure reported",
    candidates: "Detection candidates",
    readinessFalse: "Readiness returned false",
    turnReady: "TURN ready",
    turnMissing: "TURN missing",
    diagnosticsProtected: "Diagnostics are still protected on this server. Deploy the public diagnostics route.",
    diagnosticsMissing: "The signaling server does not have the diagnostics route deployed yet.",
    diagnosticsUnreachable: "The signaling server is healthy, but this page could not reach diagnostics. Check allowed origins and deployment."
  },
  ja: {
    documentTitle: "WebDrop ライブ診断",
    diagnosticsNavigation: "診断ナビゲーション",
    operationsKicker: "WebDrop オペレーション",
    pageTitle: "近接ライブ診断",
    pageCopy: "シグナリング、物理マッチング、超音波証拠、失敗理由をリアルタイムで確認するコントロールルームです。",
    appLink: "アプリに戻る",
    adminLink: "準備状況とテスト",
    languageLabel: "言語",
    appVersion: "アプリバージョン",
    lastSnapshot: "最終スナップショット",
    sourceLabel: "ライブ接続先",
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
    localAcousticKicker: "このブラウザ",
    localAcousticTitle: "ローカル超音波モニター",
    localAcousticEmpty: "このブラウザでマイクを有効にすると、ローカルの超音波入力を確認できます。",
    localAcousticNote: "このローカル確認は別の端末を必要としません。現在のブラウザがマイク、Web Audio、非可聴 WebDrop チャープ送信、超音波帯域の入力を扱えるかを確認します。",
    enableMicrophone: "マイクを有効化",
    emitChirp: "チャープ送信",
    runLoopback: "ループバック実行",
    stop: "停止",
    microphone: "マイク",
    audioContext: "Audio context",
    peakFrequency: "ピーク周波数",
    notRequested: "未要求",
    notStarted: "未開始",
    idle: "待機中",
    monitoring: "監視中",
    emittingNow: "送信中",
    loopbackRunning: "ループバック",
    granted: "許可済み",
    unsupported: "非対応",
    failed: "失敗",
    startedMonitor: "ローカルモニター開始",
    stoppedMonitor: "ローカルモニター停止",
    chirpEmitted: "チャープを送信しました",
    chirpFailed: "チャープ送信に失敗しました",
    loopbackDetected: "ループバック検出",
    loopbackMissed: "ループバック未検出",
    analysisKicker: "デバッグ分析",
    analysisTitle: "セレモニー状態と失敗理由",
    noAnalysis: "セレモニー証拠はまだ届いていません。",
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
    online: "オンライン",
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
    sampleRate: "サンプルレート",
    capture: "録音時間",
    margin: "エネルギーマージン",
    correlation: "相関",
    confidenceMargin: "勝者マージン",
    runnerUp: "次点相関",
    band: "帯域",
    slot: "スロット",
    score: "スコア",
    decision: "判定",
    strictInaudible: "非可聴を厳守",
    inputRate: "入力レート",
    starts: "開始",
    ends: "終了",
    age: "経過",
    rawDetail: "イベント詳細",
    healthy: "音響証拠を受信中",
    attention: "音響証拠が不足",
    waiting: "セレモニー待ち",
    detectedChannels: "検出チャンネル",
    missedChannels: "未検出チャンネル",
    averageMargin: "平均エネルギーマージン",
    protocolBand: "プロトコル帯域",
    failureLeader: "最多の失敗理由",
    eventVolume: "タイムラインイベント",
    noFailure: "失敗報告なし",
    candidates: "検出候補",
    readinessFalse: "Readiness が false を返しました",
    turnReady: "TURN 準備済み",
    turnMissing: "TURN 未設定",
    diagnosticsProtected: "このサーバーでは診断が保護されています。公開診断ルートをデプロイしてください。",
    diagnosticsMissing: "シグナリングサーバーに診断ルートがまだありません。",
    diagnosticsUnreachable: "サーバーは稼働していますが診断に到達できません。許可オリジンとデプロイを確認してください。"
  }
};

const nodes = {
  polling: document.querySelector("[data-diagnostics-poll]"),
  baseLabel: document.querySelector("[data-diagnostics-base-label]"),
  version: document.querySelector("[data-diagnostics-version]"),
  serverStatus: document.querySelector("[data-server-status]"),
  serverStatusCard: document.querySelector("[data-server-status-card]"),
  serverDetail: document.querySelector("[data-server-detail]"),
  deviceCount: document.querySelector("[data-device-count]"),
  pairCount: document.querySelector("[data-pair-count]"),
  sessionCount: document.querySelector("[data-session-count]"),
  snapshotTime: document.querySelector("[data-snapshot-time]"),
  deviceSummary: document.querySelector("[data-device-summary]"),
  deviceRows: document.querySelector("[data-device-rows]"),
  sessionList: document.querySelector("[data-session-list]"),
  channelCount: document.querySelector("[data-channel-count]"),
  channelList: document.querySelector("[data-channel-list]"),
  frequencyStrip: document.querySelector("[data-frequency-strip]"),
  localAcousticStatus: document.querySelector("[data-local-acoustic-status]"),
  localAcousticMic: document.querySelector("[data-local-acoustic-mic]"),
  localAcousticContext: document.querySelector("[data-local-acoustic-context]"),
  localAcousticSample: document.querySelector("[data-local-acoustic-sample]"),
  localAcousticPeak: document.querySelector("[data-local-acoustic-peak]"),
  localAcousticMargin: document.querySelector("[data-local-acoustic-margin]"),
  localAcousticBars: document.querySelector("[data-local-acoustic-bars]"),
  localAcousticLog: document.querySelector("[data-local-acoustic-log]"),
  analysisStatus: document.querySelector("[data-analysis-status]"),
  analysisGrid: document.querySelector("[data-analysis-grid]"),
  eventStream: document.querySelector("[data-event-stream]"),
  error: document.querySelector("[data-diagnostics-error]")
};

const state = {
  pollTimer: 0,
  localMonitorTimer: 0,
  localLogs: [],
  eventsClearedAt: 0,
  refreshing: false,
  lastSnapshot: null,
  lastReadiness: null
};
const api = new DiagnosticsApi({ baseUrl: DEFAULT_BASE_URL });
const localSensor = new AcousticProximitySensor();
const i18n = createOperationsI18n(MESSAGES, {
  onChange: () => {
    renderSourceLabel();
    renderReadiness(state.lastReadiness);
    if (state.lastSnapshot) renderSnapshot(state.lastSnapshot);
  }
});

init();

function init() {
  nodes.version.textContent = APP_VERSION;
  renderSourceLabel();
  document.querySelector("[data-action='diagnostics-refresh']")?.addEventListener("click", refresh);
  document.querySelector("[data-action='events-clear']")?.addEventListener("click", () => {
    state.eventsClearedAt = Date.now();
    renderEvents([]);
  });
  document.querySelector("[data-action='local-acoustic-enable']")?.addEventListener("click", startLocalMonitor);
  document.querySelector("[data-action='local-acoustic-emit']")?.addEventListener("click", emitLocalChirp);
  document.querySelector("[data-action='local-acoustic-loopback']")?.addEventListener("click", runLocalLoopback);
  document.querySelector("[data-action='local-acoustic-stop']")?.addEventListener("click", stopLocalMonitor);
  nodes.polling.addEventListener("change", syncPolling);
  renderLocalBands([]);
  refresh();
  syncPolling();
}

function renderSourceLabel() {
  nodes.baseLabel.textContent = `${i18n.t("production")} · ${DEFAULT_BASE_URL.replace(/^https?:\/\//, "")}`;
}

async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  api.configure({ baseUrl: DEFAULT_BASE_URL, token: "" });
  hideError();
  try {
    const [readiness, snapshot] = await Promise.all([
      api.readiness().catch((error) => ({ error })),
      api.snapshot()
    ]);
    state.lastReadiness = readiness;
    state.lastSnapshot = snapshot;
    renderReadiness(readiness);
    renderSnapshot(snapshot);
  } catch (error) {
    renderReadiness({ error });
    showError(diagnosticsErrorMessage(error));
  } finally {
    state.refreshing = false;
  }
}

function renderReadiness(readiness) {
  let status = i18n.t("checking");
  let detail = i18n.t("checking");
  if (readiness?.error) {
    status = i18n.t("offline");
    detail = readiness.error.message;
  } else if (readiness) {
    status = readiness.ok ? i18n.t("connected") : i18n.t("unavailable");
    detail = readiness.ok
      ? `${readiness.environment || "unknown"} · ${readiness.turnConfigured ? i18n.t("turnReady") : i18n.t("turnMissing")}`
      : i18n.t("readinessFalse");
  }
  nodes.serverStatus.textContent = status;
  nodes.serverStatusCard.textContent = status;
  nodes.serverDetail.textContent = detail;
}

function syncPolling() {
  globalThis.clearInterval(state.pollTimer);
  state.pollTimer = 0;
  if (nodes.polling.checked) {
    state.pollTimer = globalThis.setInterval(refresh, 1200);
  }
}

async function startLocalMonitor() {
  setLocalStatus(i18n.t("monitoring"));
  const permission = await localSensor.requestMicrophonePermission();
  if (!permission.granted) {
    nodes.localAcousticMic.textContent = localPermissionText(permission.reason);
    appendLocalLog(i18n.t("failed"), permission.reason || "microphone");
    setLocalStatus(i18n.t("failed"));
    return false;
  }
  const output = await localSensor.prepareAudioOutput();
  const status = localSensor.getStatus();
  nodes.localAcousticMic.textContent = permission.cached ? `${i18n.t("granted")} · cached` : i18n.t("granted");
  nodes.localAcousticContext.textContent = output.reason || status.contextState || "running";
  nodes.localAcousticSample.textContent = status.sampleRate ? `${status.sampleRate} Hz` : "Unknown";
  appendLocalLog(i18n.t("startedMonitor"), `${status.sampleRate || "unknown"} Hz`);
  startLocalSamplingLoop();
  return true;
}

async function emitLocalChirp() {
  const ready = await startLocalMonitor();
  if (!ready) return;
  setLocalStatus(i18n.t("emittingNow"));
  const result = await localSensor.emitChirp();
  if (result.emitted) {
    appendLocalLog(i18n.t("chirpEmitted"), formatFrequency(result.startFrequencyHz, result.endFrequencyHz));
  } else {
    appendLocalLog(i18n.t("chirpFailed"), result.reason || "unknown");
  }
  setLocalStatus(i18n.t("monitoring"));
}

async function runLocalLoopback() {
  const ready = await startLocalMonitor();
  if (!ready) return;
  setLocalStatus(i18n.t("loopbackRunning"));
  const detection = localSensor.detectChirp({
    timeoutMs: 1500,
    threshold: 0.2,
    requiredBandHits: 1
  });
  await wait(80);
  await localSensor.emitChirp();
  const result = await detection;
  const label = result.detected ? i18n.t("loopbackDetected") : i18n.t("loopbackMissed");
  appendLocalLog(label, `corr ${formatNumber(result.correlation, 2)} · ${formatNumber(result.band?.marginDb)} dB`);
  setLocalStatus(i18n.t("monitoring"));
}

function stopLocalMonitor() {
  globalThis.clearInterval(state.localMonitorTimer);
  state.localMonitorTimer = 0;
  localSensor.stopCapture({ releaseStream: true });
  setLocalStatus(i18n.t("idle"));
  nodes.localAcousticMic.textContent = i18n.t("notRequested");
  nodes.localAcousticContext.textContent = i18n.t("notStarted");
  nodes.localAcousticSample.textContent = "Unknown";
  nodes.localAcousticPeak.textContent = "Unknown";
  nodes.localAcousticMargin.textContent = "Unknown";
  renderLocalBands([]);
  appendLocalLog(i18n.t("stoppedMonitor"), "");
}

function startLocalSamplingLoop() {
  if (state.localMonitorTimer) return;
  void sampleLocalBands();
  state.localMonitorTimer = globalThis.setInterval(sampleLocalBands, 420);
}

async function sampleLocalBands() {
  const sample = await localSensor.sampleFrequencyBands({ bands: LOCAL_MONITOR_BANDS, fftSize: 4096 });
  const status = localSensor.getStatus();
  nodes.localAcousticContext.textContent = sample.contextState || status.contextState || "Unknown";
  nodes.localAcousticSample.textContent = sample.sampleRate ? `${sample.sampleRate} Hz` : "Unknown";
  if (!sample.available) {
    nodes.localAcousticPeak.textContent = sample.reason || "Unknown";
    nodes.localAcousticMargin.textContent = "Unknown";
    renderLocalBands([]);
    return;
  }
  const strongest = [...sample.bands].sort((a, b) => Number(b.peakDb) - Number(a.peakDb))[0];
  nodes.localAcousticPeak.textContent = strongest
    ? `${formatFrequency(strongest.startFrequencyHz, strongest.endFrequencyHz)} · ${formatNumber(strongest.peakDb)} dB`
    : "Unknown";
  nodes.localAcousticMargin.textContent = strongest ? `${formatNumber(strongest.marginDb)} dB` : "Unknown";
  renderLocalBands(sample.bands);
}

function renderLocalBands(bands) {
  const rows = bands.length ? bands : LOCAL_MONITOR_BANDS.map((band) => ({
    ...band,
    detected: false,
    confidence: 0,
    marginDb: 0,
    peakDb: -100
  }));
  nodes.localAcousticBars.innerHTML = rows.map((band) => {
    const confidence = clamp(Number(band.confidence || 0), 0, 1);
    const level = clamp((Number(band.peakDb || -100) + 92) / 34, 0, 1);
    const fill = Math.round(Math.max(confidence, level) * 100);
    return `
      <span data-detected="${band.detected ? "true" : "false"}" title="${escapeHtml(`${formatFrequency(band.startFrequencyHz, band.endFrequencyHz)} · ${formatNumber(band.marginDb)} dB`)}">
        <i style="--fill:${fill}%"></i>
        <b>${escapeHtml(formatFrequency(band.startFrequencyHz, band.endFrequencyHz))}</b>
      </span>
    `;
  }).join("");
}

function appendLocalLog(title, detail) {
  state.localLogs.unshift({
    title,
    detail,
    at: new Date().toLocaleTimeString(i18n.locale)
  });
  state.localLogs = state.localLogs.slice(0, 10);
  nodes.localAcousticLog.innerHTML = state.localLogs.map((entry) => `
    <article>
      <strong>${escapeHtml(entry.title)}</strong>
      <span>${escapeHtml(entry.at)}</span>
      ${entry.detail ? `<small>${escapeHtml(entry.detail)}</small>` : ""}
    </article>
  `).join("");
}

function setLocalStatus(value) {
  nodes.localAcousticStatus.textContent = value;
}

function localPermissionText(reason) {
  if (reason === "unsupported") return i18n.t("unsupported");
  return reason || i18n.t("failed");
}

function renderSnapshot(snapshot = {}) {
  const signaling = snapshot.signaling || {};
  const metrics = snapshot.metrics || {};
  const protocol = signaling.protocol || {};
  const clients = Array.isArray(signaling.clients) ? signaling.clients : [];
  const pairs = Array.isArray(signaling.pairs) ? signaling.pairs : [];
  const sessions = Array.isArray(signaling.proximitySessions) ? signaling.proximitySessions : [];
  const events = (metrics.recentEvents || []).filter((event) => {
    return !state.eventsClearedAt || Date.parse(event.at) > state.eventsClearedAt;
  });
  const channels = extractChannels({ sessions, events, clients });
  nodes.deviceCount.textContent = String(clients.length);
  nodes.pairCount.textContent = String(pairs.length);
  nodes.sessionCount.textContent = String(sessions.length);
  nodes.deviceSummary.textContent = `${clients.length} ${i18n.t("online")}`;
  nodes.snapshotTime.textContent = snapshot.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleTimeString(i18n.locale)
    : i18n.t("checking");
  renderDevices(clients);
  renderSessions(sessions);
  renderChannels(channels);
  renderAnalysis({ channels, sessions, events, protocol });
  renderEvents(events);
}

function renderDevices(clients) {
  if (!clients.length) {
    nodes.deviceRows.innerHTML = `<tr><td colspan="5" class="empty-cell">${escapeHtml(i18n.t("noClients"))}</td></tr>`;
    return;
  }
  nodes.deviceRows.innerHTML = clients.map((client) => {
    const capabilities = Object.entries(client.capabilities || {})
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(", ") || i18n.t("noneReported");
    return `
      <tr>
        <td><strong>${escapeHtml(client.deviceName || client.id)}</strong><small>${escapeHtml(client.id)}</small></td>
        <td>${escapeHtml(client.deviceLabel || client.deviceFamily || "unknown")}</td>
        <td>${escapeHtml(capabilities)}</td>
        <td>${escapeHtml(client.pairingId || i18n.t("unpaired"))}</td>
        <td>${escapeHtml(formatAge(client.lastSeenMsAgo, i18n.locale))}</td>
      </tr>
    `;
  }).join("");
}

function renderSessions(sessions) {
  if (!sessions.length) {
    nodes.sessionList.innerHTML = `<p class="empty-state">${escapeHtml(i18n.t("noSessions"))}</p>`;
    return;
  }
  nodes.sessionList.innerHTML = sessions.map((session) => `
    <article class="session-item">
      <div class="session-head">
        <strong class="session-id">${escapeHtml(session.id)}</strong>
        <span class="status-pill">${escapeHtml(session.phase)} · ${session.participantCount}</span>
      </div>
      <div class="session-timing">
        <span>${i18n.t("age")}: ${escapeHtml(formatAge(Date.now() - Date.parse(session.createdAt || Date.now()), i18n.locale))}</span>
        <span>${i18n.t("starts")}: ${escapeHtml(formatTimestamp(session.startAt))}</span>
        <span>${i18n.t("ends")}: ${escapeHtml(formatTimestamp(session.endsAt))}</span>
      </div>
      ${(session.participants || []).map(renderParticipant).join("")}
    </article>
  `).join("");
}

function renderParticipant(participant) {
  const signature = participant.signature;
  const telemetry = participant.telemetry;
  const acoustic = telemetry?.acoustic;
  const capabilities = participant.acousticCapabilities || {};
  const stateClass = acoustic?.detected ? "telemetry-good" : telemetry ? "telemetry-bad" : "";
  const signatureText = signature
    ? `${i18n.t("slot")} ${signature.slot} · code ${signature.code ?? 0} · ${formatFrequency(signature.startFrequencyHz, signature.endFrequencyHz)}`
    : i18n.t("waitingSlot");
  const telemetryText = telemetry
    ? `${i18n.t("decision")} ${telemetry.decision} · ${i18n.t("score")} ${Math.round(Number(telemetry.score || 0) * 100)}% · ${i18n.t("emitted")} ${yesNo(acoustic?.emitted)} · ${i18n.t("detected")} ${yesNo(acoustic?.detected)} · ${formatNumber(acoustic?.marginDb)} dB`
    : i18n.t("waitingTelemetry");
  const capabilityText = capabilities.sampleRate
    ? `${i18n.t("inputRate")} ${capabilities.sampleRate} Hz · ${i18n.t("strictInaudible")} ${yesNo(capabilities.strictInaudible)}`
    : i18n.t("noneReported");
  return `
    <div class="participant-row">
      <div>
        <strong>${escapeHtml(participant.deviceName || participant.clientId)}</strong>
        <small>${escapeHtml(signatureText)}</small>
        <small>${escapeHtml(capabilityText)}</small>
      </div>
      <small class="${stateClass}">${escapeHtml(telemetryText)}</small>
    </div>
  `;
}

function renderChannels(channels) {
  nodes.channelCount.textContent = `${channels.length} ${i18n.t("channels")}`;
  if (!channels.length) {
    nodes.channelList.innerHTML = `<p class="empty-state">${escapeHtml(i18n.t("noChannels"))}</p>`;
    nodes.frequencyStrip.innerHTML = "";
    return;
  }
  nodes.channelList.innerHTML = channels.slice(0, 24).map((channel) => `
    <article class="channel-card" data-state="${channel.detected ? "detected" : channel.emitted ? "emitted" : "missed"}">
      <div class="channel-head">
        <div>
          <strong>${escapeHtml(channel.deviceName || channel.clientId || "Unknown device")}</strong>
          <small>${escapeHtml(channel.sessionId || "latest telemetry")} · ${escapeHtml(formatAge(Date.now() - Date.parse(channel.at || Date.now()), i18n.locale))}</small>
        </div>
        <span>${escapeHtml(channel.slotLabel)}</span>
      </div>
      <div class="channel-band">
        <span>${escapeHtml(channel.bandLabel)}</span>
        <i style="--start:${channel.startPercent};--width:${channel.widthPercent}"></i>
      </div>
      <dl>
        <div><dt>${i18n.t("emitted")}</dt><dd>${yesNo(channel.emitted)}</dd></div>
        <div><dt>${i18n.t("detected")}</dt><dd>${yesNo(channel.detected)}</dd></div>
        <div><dt>${i18n.t("margin")}</dt><dd>${formatNumber(channel.marginDb)} dB</dd></div>
        <div><dt>${i18n.t("correlation")}</dt><dd>${formatNumber(channel.correlation, 2)}</dd></div>
        <div><dt>${i18n.t("confidenceMargin")}</dt><dd>${formatNumber(channel.confidenceMargin, 2)}</dd></div>
        <div><dt>${i18n.t("runnerUp")}</dt><dd>${formatNumber(channel.runnerUpCorrelation, 2)}</dd></div>
        <div><dt>${i18n.t("method")}</dt><dd>${escapeHtml(channel.method || "n/a")}</dd></div>
        <div><dt>${i18n.t("sampleRate")}</dt><dd>${channel.sampleRate ? `${channel.sampleRate} Hz` : "n/a"}</dd></div>
        <div><dt>${i18n.t("capture")}</dt><dd>${channel.recordingDurationMs ? `${channel.recordingDurationMs} ms` : "n/a"}</dd></div>
        <div><dt>RMS / Peak</dt><dd>${formatNumber(channel.rms, 3)} / ${formatNumber(channel.peak, 3)}</dd></div>
        <div><dt>${i18n.t("reason")}</dt><dd>${escapeHtml(channel.reason || "none")}</dd></div>
      </dl>
      ${renderDetections(channel.detections)}
    </article>
  `).join("");
  nodes.frequencyStrip.innerHTML = channels.slice(0, 18).map((channel) => `
    <span title="${escapeHtml(`${channel.deviceName || channel.clientId}: ${channel.bandLabel}`)}" style="--start:${channel.startPercent};--width:${channel.widthPercent}" data-detected="${channel.detected ? "true" : "false"}"></span>
  `).join("");
}

function renderDetections(detections) {
  if (!Array.isArray(detections) || !detections.length) return "";
  return `
    <div>
      <p class="eyebrow">${escapeHtml(i18n.t("candidates"))}</p>
      <ul class="detection-list">
        ${detections.slice(0, 6).map((detection) => `
          <li>
            <span>${escapeHtml(detection.signatureId || "unknown")}</span>
            <span>${formatNumber(detection.correlation, 2)} · ${formatNumber(detection.marginDb)} dB</span>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

function renderAnalysis({ channels, sessions, events, protocol }) {
  if (!channels.length && !sessions.length && !events.length) {
    nodes.analysisStatus.textContent = i18n.t("waiting");
    nodes.analysisGrid.innerHTML = `<p class="empty-state">${escapeHtml(i18n.t("noAnalysis"))}</p>`;
    return;
  }
  const detected = channels.filter((channel) => channel.detected).length;
  const missed = channels.filter((channel) => channel.emitted && !channel.detected).length;
  const margins = channels.map((channel) => Number(channel.marginDb)).filter(Number.isFinite);
  const reasons = failureReasons(channels, events);
  const topFailure = reasons[0] || [i18n.t("noFailure"), 0];
  const protocolBand = formatFrequency(protocol.acousticBandStartHz, protocol.acousticBandEndHz);
  nodes.analysisStatus.textContent = detected ? i18n.t("healthy") : channels.length ? i18n.t("attention") : i18n.t("waiting");
  nodes.analysisGrid.innerHTML = [
    analysisCard(i18n.t("detectedChannels"), detected, `${channels.length} ${i18n.t("channels")}`),
    analysisCard(i18n.t("missedChannels"), missed, missed ? topFailure[0] : i18n.t("noFailure")),
    analysisCard(i18n.t("averageMargin"), margins.length ? `${formatNumber(average(margins))} dB` : "n/a", `min ${formatNumber(protocol.energyAssistedMinMarginDb)} dB`),
    analysisCard(i18n.t("protocolBand"), protocolBand, `${protocol.maxClients || 0} max · ${protocol.sessionDurationMs || 0} ms`),
    analysisCard(i18n.t("failureLeader"), topFailure[0], `${topFailure[1]} events`),
    analysisCard(i18n.t("eventVolume"), events.length, `${sessions.length} sessions`)
  ].join("");
}

function analysisCard(label, value, detail) {
  return `
    <article class="analysis-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function renderEvents(events) {
  if (!events.length) {
    nodes.eventStream.innerHTML = `<p class="empty-state">${escapeHtml(i18n.t("noEvents"))}</p>`;
    return;
  }
  nodes.eventStream.innerHTML = events.slice(0, 120).map((event) => `
    <article class="event-item" data-event-kind="${escapeHtml(event.type || "")}">
      <div class="event-head">
        <strong class="event-type">${escapeHtml(event.type)}</strong>
        <small>${escapeHtml(new Date(event.at).toLocaleTimeString(i18n.locale))}</small>
      </div>
      ${event.detail ? `
        <details>
          <summary>${escapeHtml(i18n.t("rawDetail"))}</summary>
          <pre>${escapeHtml(JSON.stringify(event.detail, null, 2))}</pre>
        </details>
      ` : ""}
    </article>
  `).join("");
}

function extractChannels({ sessions, events, clients }) {
  const clientNames = new Map(clients.map((client) => [client.id, client.deviceName]));
  const channelMap = new Map();
  for (const session of sessions) {
    for (const participant of session.participants || []) {
      const acoustic = participant.telemetry?.acoustic;
      const signature = participant.signature;
      if (!acoustic && !signature) continue;
      const channel = normalizeChannel({
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
        correlation: firstFinite(acoustic?.detections?.[0]?.correlation),
        confidenceMargin: acoustic?.confidenceMargin,
        runnerUpCorrelation: acoustic?.runnerUpCorrelation,
        detections: acoustic?.detections,
        method: acoustic?.detectionMethod,
        sampleRate: acoustic?.sampleRate,
        recordingDurationMs: acoustic?.recordingDurationMs,
        rms: acoustic?.recordingRms,
        peak: acoustic?.recordingPeak,
        reason: acoustic?.reason
      });
      channelMap.set(channelKey(channel), channel);
    }
  }
  for (const event of events || []) {
    if (event.type !== "proximity:session:telemetry") continue;
    const detail = event.detail || {};
    const channel = normalizeChannel({
      at: event.at,
      sessionId: detail.sessionId,
      clientId: detail.clientId,
      deviceName: clientNames.get(detail.clientId),
      slot: detail.acousticSlot,
      slotCount: detail.acousticSlotCount,
      startFrequencyHz: detail.acousticStartFrequencyHz,
      endFrequencyHz: detail.acousticEndFrequencyHz,
      emitted: detail.acousticEmitted,
      detected: detail.acousticDetected,
      marginDb: detail.acousticMarginDb,
      correlation: detail.acousticCorrelation,
      confidenceMargin: detail.acousticConfidenceMargin,
      runnerUpCorrelation: detail.acousticRunnerUpCorrelation,
      detections: detail.acousticDetections,
      method: detail.acousticDetectionMethod,
      sampleRate: detail.acousticSampleRate,
      recordingDurationMs: detail.acousticRecordingDurationMs,
      rms: detail.acousticRecordingRms,
      peak: detail.acousticRecordingPeak,
      reason: detail.acousticReason
    });
    const key = channelKey(channel);
    if (!channelMap.has(key)) channelMap.set(key, channel);
  }
  return [...channelMap.values()].sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
}

function normalizeChannel(raw) {
  const start = Number(raw.startFrequencyHz);
  const end = Number(raw.endFrequencyHz);
  const slot = Number(raw.slot || 0);
  const slotCount = Number(raw.slotCount || 0);
  const range = DISPLAY_BAND_END_HZ - DISPLAY_BAND_START_HZ;
  const startPercent = Number.isFinite(start) ? clamp((start - DISPLAY_BAND_START_HZ) / range * 100, 0, 100) : 0;
  const widthPercent = Number.isFinite(start) && Number.isFinite(end)
    ? clamp((end - start) / range * 100, 3, 100 - startPercent)
    : 8;
  return {
    ...raw,
    slot,
    slotCount,
    slotLabel: slot ? `${i18n.t("slot")} ${slot}${slotCount ? `/${slotCount}` : ""}` : i18n.t("listened"),
    bandLabel: Number.isFinite(start) && Number.isFinite(end) ? formatFrequency(start, end) : "unknown band",
    startPercent: `${startPercent}%`,
    widthPercent: `${widthPercent}%`
  };
}

function channelKey(channel) {
  return [channel.sessionId || "event", channel.clientId || "unknown", channel.slot || 0].join(":");
}

function failureReasons(channels, events) {
  const counts = new Map();
  for (const channel of channels) {
    if (channel.detected || !channel.reason) continue;
    counts.set(channel.reason, (counts.get(channel.reason) || 0) + 1);
  }
  for (const event of events) {
    if (event.type !== "proximity:session:failed" || !event.detail?.reason) continue;
    counts.set(event.detail.reason, (counts.get(event.detail.reason) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function diagnosticsErrorMessage(error) {
  if (error.message === "unauthorized") return i18n.t("diagnosticsProtected");
  if (error.message === "not_found") return i18n.t("diagnosticsMissing");
  if (error.message === "Failed to fetch") return i18n.t("diagnosticsUnreachable");
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

function yesNo(value) {
  return value ? i18n.t("yes") : i18n.t("no");
}

function formatTimestamp(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "n/a";
  return new Date(milliseconds).toLocaleTimeString(i18n.locale);
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function wait(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
