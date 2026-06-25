import { createOperationsI18n } from "./operations-i18n.js?v=1.0.82";
import { DiagnosticsApi } from "./diagnostics-api.js?v=1.0.82";
import { apiBaseFrom, escapeHtml, formatAge, formatFrequency, formatNumber } from "./shared.js?v=1.0.82";

const APP_VERSION = "1.0.82";
const DEFAULT_HTTP_BASE = "https://webdrop-wss-0618.japaneast.cloudapp.azure.com";
const DEFAULT_WS_URL = "wss://webdrop-wss-0618.japaneast.cloudapp.azure.com/ws";
const POLL_INTERVAL_MS = 1000;
const MONITOR_INTERVAL_MS = 1000;
const MONITOR_START_HZ = 18_600;
const MONITOR_END_HZ = 19_400;

const ADMIN_MESSAGES = {
  en: {
    documentTitle: "WebDrop Admin",
    adminSections: "Admin sections",
    language: "Language",
    readiness: "Readiness",
    liveTesting: "Live testing",
    checkingServer: "Checking server",
    server: "Server",
    devicesOnline: "Devices online",
    activePairs: "Active pairs",
    verifiedConnections: "Verified connections",
    verifiedReadiness: "Verified readiness",
    launchChecks: "{verified} of {total} launch checks",
    readinessExplainer: "{verified} of {total} launch-critical checks are signed off. Physical-device proof remains unverified.",
    appVersion: "App version",
    productionFrontend: "Production frontend",
    readinessTitle: "What is actually ready",
    readinessCopy: "Live infrastructure is separated from work that still needs physical device proof.",
    lastUpdated: "Last updated",
    physicalProofNote: "Items under Needs physical proof require two real devices and cannot be signed off by browser tests alone.",
    liveTitle: "Live testing",
    liveCopy: "Watch connected phones, inspect one device continuously, and understand each signal without reading raw logs.",
    liveUpdates: "Live updates",
    serverAndDevices: "Server & devices",
    connectedDevices: "Connected devices",
    signalingConnected: "Signaling connected",
    signalingDisconnected: "Signaling disconnected",
    device: "Device",
    platform: "Platform",
    lastSeen: "Last seen",
    noDevices: "No physical devices are connected.",
    selectDeviceHelp: "Select a device to inspect it",
    acousticInspection: "Acoustic inspection",
    continuousMonitor: "Continuous ultrasonic monitor",
    liveFrequencyMap: "Live frequency map",
    liveFrequencyMapCopy: "Actual microphone energy reported by the selected phone",
    targetBand: "Target {band}",
    quietBand: "Quiet",
    signalBand: "Signal",
    idle: "Idle",
    active: "Active",
    stopping: "Stopping",
    blocked: "Blocked",
    error: "Error",
    selectConnectedDevice: "Select a connected device",
    chooseDevice: "Choose a device",
    startMonitoring: "Start monitoring",
    stop: "Stop",
    monitorExplainer: "The selected phone must have opened WebDrop audio from a user tap. Monitoring continues until Stop is pressed.",
    goodRange: "Good: within expected range",
    marginalRange: "Marginal: check conditions",
    poorRange: "Poor: investigate",
    recentActivity: "Recent activity",
    eventTimeline: "Event timeline",
    clear: "Clear",
    noEvents: "No events yet.",
    physicalMatching: "Physical matching",
    activeSessions: "Active proximity sessions",
    singleDeviceTesting: "Single-device test",
    multiDeviceTesting: "Multi-device sessions",
    noSessions: "No active proximity sessions.",
    pollingEverySecond: "Live data refreshes every second",
    serverTime: "Server time",
    readyColumn: "Ready",
    proofColumn: "Needs physical proof",
    blockedColumn: "Blocked",
    laterColumn: "Later",
    noBlockers: "No production infrastructure blocker is visible right now.",
    azureSignaling: "Azure signaling",
    connected: "Connected",
    offline: "Offline",
    turnReady: "TURN ready",
    physicalDevices: "{count} physical devices",
    devicesCount: "{count} devices",
    activeCount: "{count} active",
    startedMonitor: "Monitoring {device}. Keep the phone on WebDrop and tap Connect if audio is not ready.",
    stoppedMonitor: "Monitor stopped.",
    stoppingMonitor: "Stopping monitor on {device}...",
    noDeviceSelected: "Select a connected phone first.",
    targetOffline: "Selected device is offline.",
    audioNotReady: "Audio is not unlocked on that phone. Open WebDrop there and tap Connect once.",
    ceremonyActive: "That phone is already inside a proximity ceremony. Try again after it finishes.",
    monitorBlocked: "The phone replied but cannot sample audio yet.",
    monitorRunning: "The phone is emitting and listening in the selected ultrasonic band once per second.",
    monitorWaitingForTap: "The phone is armed. Tap Connect once on that phone to unlock microphone, speaker, and motion. Monitoring starts automatically afterward.",
    monitorWaitingForCeremony: "Waiting for the phone's current proximity ceremony to finish. Monitoring starts automatically afterward.",
    monitorError: "The phone reported a monitor error.",
    openPhoneHint: "Open WebDrop on a phone, leave this admin tab open, then start monitoring that phone.",
    metric: "Metric",
    meaning: "Meaning",
    expected: "Expected",
    current: "Current",
    status: "Status",
    heardSignal: "Heard signal",
    heardSignalMeaning: "Can the phone hear the chirp packet in the ultrasonic band?",
    heardSignalExpected: "Good above 35 percent confidence. Marginal above 15 percent.",
    correlation: "Correlation",
    correlationMeaning: "How closely the sound matches the coded WebDrop chirp shape.",
    correlationExpected: "Good above 0.30. Marginal above 0.20.",
    energyMargin: "Energy margin",
    energyMarginMeaning: "How much louder the chirp band is than nearby noise.",
    energyMarginExpected: "Good above 8 dB. Marginal above 4.5 dB.",
    sampleRate: "Sample rate",
    sampleRateMeaning: "Audio resolution available to the phone microphone.",
    sampleRateExpected: "44.1-48 kHz is ideal. Lower rates may miss ultrasound.",
    emittedPacket: "Emitted packet",
    emittedPacketMeaning: "Whether the phone actually played the test chirp.",
    emittedPacketExpected: "Should be yes during active monitoring.",
    bumpEvidence: "Bump evidence",
    bumpEvidenceMeaning: "Latest physical bump signal from a proximity attempt.",
    bumpEvidenceExpected: "Good when bump score is 10 or more for this test build.",
    tiltEvidence: "Tilt evidence",
    tiltEvidenceMeaning: "Latest tilt angle from the selected phone.",
    tiltEvidenceExpected: "Must be strictly above 30 degrees.",
    yes: "Yes",
    no: "No",
    unknown: "Unknown",
    waiting: "Waiting",
    good: "Good",
    marginal: "Marginal",
    poor: "Poor",
    none: "None",
    joining: "Joining",
    running: "Running",
    failed: "Failed",
    verified: "Verified",
    notReady: "Not ready",
    readyItems: [
      ["Production signaling", "Azure WebSocket presence, routing, and diagnostics are online.", "live"],
      ["TURN credentials", "The server-side ICE credential path is implemented and ready for relay tests.", "ready"],
      ["QR fallback", "Peerless QR pairing works as the explicit fallback/manual path.", "live"],
      ["Admin operations shell", "This page now uses the production diagnostics feed and live WebSocket monitor.", "live"]
    ],
    proofItems: [
      ["Proximity ceremony", "Not signed off. Ultrasound interpretation still needs real iPhone/Android proof.", "needs proof"],
      ["iPhone acoustic calibration", "Need repeated live tests to confirm emitted slots are heard on the other phone.", "needs proof"],
      ["Android acoustic calibration", "Android is no longer labeled unknown, but acoustic capture still needs real-device proof.", "needs proof"],
      ["WebRTC file transfer", "Needs same-room direct and TURN relay proof after proximity pairing is stable.", "needs proof"],
      ["View/download behavior", "Needs Android receive proof; iPhone behavior has been separately checked before.", "needs proof"]
    ],
    laterItems: [
      ["10,000-client load testing", "Run after the physical handshake is stable.", "later"],
      ["Multi-node signaling", "Requires shared state or sticky sessions before horizontal scale.", "later"],
      ["Long-run acoustic calibration", "Collect multiple device models and noisy-room samples.", "later"]
    ]
  },
  ja: {
    documentTitle: "WebDrop 管理",
    adminSections: "管理セクション",
    language: "言語",
    readiness: "準備状況",
    liveTesting: "ライブテスト",
    checkingServer: "サーバー確認中",
    server: "サーバー",
    devicesOnline: "オンライン端末",
    activePairs: "接続ペア",
    verifiedConnections: "確認済み接続",
    verifiedReadiness: "確認済み準備度",
    launchChecks: "リリース確認 {verified}/{total}",
    readinessExplainer: "リリース必須項目 {total} 件中 {verified} 件を確認済みです。実機証明はまだ未完了です。",
    appVersion: "アプリ版",
    productionFrontend: "本番フロント",
    readinessTitle: "実際に準備できているもの",
    readinessCopy: "稼働中のインフラと、実機で証明が必要な作業を分けて表示します。",
    lastUpdated: "更新",
    physicalProofNote: "実機証明が必要な項目は、2 台の実端末で確認するまで完了扱いにしません。",
    liveTitle: "ライブテスト",
    liveCopy: "接続中の端末を見て、1 台を継続監視し、専門用語なしで音響信号を確認します。",
    liveUpdates: "ライブ更新",
    serverAndDevices: "サーバーと端末",
    connectedDevices: "接続中の端末",
    signalingConnected: "シグナリング接続済み",
    signalingDisconnected: "シグナリング未接続",
    device: "端末",
    platform: "種別",
    lastSeen: "最終確認",
    noDevices: "物理端末は接続されていません。",
    selectDeviceHelp: "端末を選ぶと監視できます",
    acousticInspection: "音響検査",
    continuousMonitor: "超音波の継続モニター",
    liveFrequencyMap: "ライブ周波数マップ",
    liveFrequencyMapCopy: "選択端末のマイクが報告した実際の音響エネルギー",
    targetBand: "対象 {band}",
    quietBand: "静音",
    signalBand: "信号",
    idle: "待機中",
    active: "稼働中",
    stopping: "停止中",
    blocked: "ブロック",
    error: "エラー",
    selectConnectedDevice: "接続中の端末を選択",
    chooseDevice: "端末を選択",
    startMonitoring: "監視開始",
    stop: "停止",
    monitorExplainer: "選択した端末で WebDrop の音声がタップ操作から有効になっている必要があります。停止するまで監視します。",
    goodRange: "良好: 期待範囲内",
    marginalRange: "注意: 条件を確認",
    poorRange: "不良: 調査が必要",
    recentActivity: "最近の動き",
    eventTimeline: "イベントタイムライン",
    clear: "クリア",
    noEvents: "イベントはまだありません。",
    physicalMatching: "物理マッチング",
    activeSessions: "近接セッション",
    singleDeviceTesting: "単体端末テスト",
    multiDeviceTesting: "複数端末セッション",
    noSessions: "アクティブな近接セッションはありません。",
    pollingEverySecond: "ライブデータは 1 秒ごとに更新されます",
    serverTime: "サーバー時刻",
    readyColumn: "準備済み",
    proofColumn: "実機証明が必要",
    blockedColumn: "ブロック",
    laterColumn: "後で対応",
    noBlockers: "現在、本番インフラのブロッカーは見えていません。",
    azureSignaling: "Azure シグナリング",
    connected: "接続済み",
    offline: "オフライン",
    turnReady: "TURN 準備済み",
    physicalDevices: "物理端末 {count} 台",
    devicesCount: "{count} 台",
    activeCount: "{count} 件",
    startedMonitor: "{device} を監視中。音声が未準備なら端末側で Connect をタップしてください。",
    stoppedMonitor: "監視を停止しました。",
    stoppingMonitor: "{device} の監視を停止しています...",
    noDeviceSelected: "先に接続中の端末を選んでください。",
    targetOffline: "選択した端末はオフラインです。",
    audioNotReady: "その端末の音声がまだ有効化されていません。WebDrop を開き、Connect を一度タップしてください。",
    ceremonyActive: "その端末は近接セレモニー中です。終了後に再試行してください。",
    monitorBlocked: "端末は応答しましたが、まだ音声をサンプリングできません。",
    monitorRunning: "端末は 1 秒ごとに指定した超音波帯で送信と受信を行っています。",
    monitorWaitingForTap: "端末の準備ができました。その端末で一度 Connect をタップしてマイク、スピーカー、モーションを有効にしてください。その後、監視が自動的に開始されます。",
    monitorWaitingForCeremony: "端末の現在の近接セレモニーが終了するのを待っています。終了後、監視が自動的に開始されます。",
    monitorError: "端末が監視エラーを返しました。",
    openPhoneHint: "スマホで WebDrop を開き、この管理タブを開いたまま、その端末の監視を開始してください。",
    metric: "指標",
    meaning: "意味",
    expected: "期待値",
    current: "現在",
    status: "状態",
    heardSignal: "聞こえた信号",
    heardSignalMeaning: "端末が超音波帯のチャープを聞けたか。",
    heardSignalExpected: "35%以上で良好。15%以上で注意。",
    correlation: "一致度",
    correlationMeaning: "WebDrop の音パケット形状とどれくらい一致したか。",
    correlationExpected: "0.30 以上で良好。0.20 以上で注意。",
    energyMargin: "音量差",
    energyMarginMeaning: "チャープ帯が周辺ノイズよりどれくらい強いか。",
    energyMarginExpected: "8 dB 以上で良好。4.5 dB 以上で注意。",
    sampleRate: "サンプルレート",
    sampleRateMeaning: "端末マイクの音声解像度。",
    sampleRateExpected: "44.1-48 kHz が理想。低いと超音波を取り逃がす可能性があります。",
    emittedPacket: "送信パケット",
    emittedPacketMeaning: "端末がテストチャープを実際に再生したか。",
    emittedPacketExpected: "監視中は Yes が期待値です。",
    bumpEvidence: "バンプ証拠",
    bumpEvidenceMeaning: "直近の近接試行から得たバンプ信号。",
    bumpEvidenceExpected: "このテスト版ではバンプスコア 10 以上で良好。",
    tiltEvidence: "傾き証拠",
    tiltEvidenceMeaning: "選択端末の直近の傾き角度。",
    tiltEvidenceExpected: "30 度を厳密に超える必要があります。",
    yes: "はい",
    no: "いいえ",
    unknown: "不明",
    waiting: "待機中",
    good: "良好",
    marginal: "注意",
    poor: "不良",
    none: "なし",
    joining: "参加中",
    running: "実行中",
    failed: "失敗",
    verified: "確認済み",
    notReady: "未準備",
    readyItems: [
      ["本番シグナリング", "Azure WebSocket の在席、ルーティング、診断が稼働中です。", "live"],
      ["TURN 認証情報", "サーバー側 ICE 認証経路は実装済みで、リレーテスト可能です。", "ready"],
      ["QR フォールバック", "相手未選択 QR ペアリングは明示的なフォールバックとして動きます。", "live"],
      ["管理オペレーション画面", "このページは本番診断フィードとライブ WebSocket 監視を使います。", "live"]
    ],
    proofItems: [
      ["近接セレモニー", "未完了。超音波の解釈は実機 iPhone/Android で証明が必要です。", "要実機"],
      ["iPhone 音響調整", "送信スロットが相手端末で聞こえるか、繰り返しライブ確認が必要です。", "要実機"],
      ["Android 音響調整", "Android は Unknown 表示にしませんが、音響キャプチャは実機証明が必要です。", "要実機"],
      ["WebRTC ファイル転送", "近接ペアリング安定後に直接/TURN リレー転送の証明が必要です。", "要実機"],
      ["表示/ダウンロード挙動", "Android 受信の証明が必要です。iPhone 側は以前に確認済みです。", "要実機"]
    ],
    laterItems: [
      ["1 万クライアント負荷試験", "物理ハンドシェイクが安定してから実施します。", "後で"],
      ["複数ノード化", "水平スケール前に共有状態またはスティッキーセッションが必要です。", "後で"],
      ["長時間の音響調整", "複数機種と騒音環境のサンプルを集めます。", "後で"]
    ]
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const runtime = globalThis.WEBDROP_RUNTIME_CONFIG || {};
const httpBase = apiBaseFrom(runtime.turnConfigUrl || runtime.signalingUrl) || DEFAULT_HTTP_BASE;
const wsUrl = runtime.signalingUrl || DEFAULT_WS_URL;
const diagnostics = new DiagnosticsApi({ baseUrl: httpBase });

const state = {
  socket: null,
  socketState: "checking",
  adminId: `admin-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`,
  snapshot: null,
  readyz: null,
  pollTimer: 0,
  polling: true,
  selectedDeviceId: "",
  activeMonitor: null,
  monitorTelemetry: null,
  ignoredMonitorIds: new Set(),
  localEvents: [],
  clearEventsBefore: 0
};

const i18n = createOperationsI18n(ADMIN_MESSAGES, {
  onChange: () => renderAll()
});

init();

function init() {
  $("[data-admin-version]").textContent = APP_VERSION;
  bindEvents();
  activateTab(new URLSearchParams(location.search).get("tab") === "live" ? "live" : "readiness");
  renderAll();
  connectAdminSocket();
  refreshDiagnostics();
  schedulePoll();
}

function bindEvents() {
  $$("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.adminTab));
  });
  $("[data-live-poll]")?.addEventListener("change", (event) => {
    state.polling = event.target.checked;
    if (state.polling) schedulePoll();
  });
  $("[data-monitor-device]")?.addEventListener("change", (event) => {
    selectDevice(event.target.value);
  });
  $("[data-action='monitor-start']")?.addEventListener("click", startMonitor);
  $("[data-action='monitor-stop']")?.addEventListener("click", stopMonitor);
  $("[data-action='timeline-clear']")?.addEventListener("click", () => {
    state.clearEventsBefore = Date.now();
    renderTimeline();
  });
  globalThis.addEventListener("beforeunload", () => {
    if (state.activeMonitor) sendSocket({
      type: "admin:monitor:stop",
      targetId: state.activeMonitor.targetId,
      payload: { monitorId: state.activeMonitor.monitorId }
    });
  });
}

function activateTab(name) {
  $$("[data-admin-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.adminTab === name));
  $$("[data-admin-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.adminPanel === name));
  const url = new URL(location.href);
  url.searchParams.set("tab", name);
  history.replaceState(null, "", url);
}

function connectAdminSocket() {
  if (state.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.socket.readyState)) return;
  setSocketState("checking");
  try {
    const socket = new WebSocket(wsUrl);
    state.socket = socket;
    socket.addEventListener("open", () => {
      setSocketState("connected");
      sendSocket({
        type: "client:hello",
        payload: {
          self: {
            id: state.adminId,
            deviceId: state.adminId,
            deviceName: "WebDrop Admin",
            deviceFamily: "admin",
            deviceLabel: "Admin dashboard"
          },
          capabilities: {
            admin: true,
            webRtc: false,
            camera: false,
            qrScanner: false,
            platform: { family: "admin", label: "Admin dashboard" }
          }
        }
      });
    });
    socket.addEventListener("message", (event) => handleSocketMessage(event.data));
    socket.addEventListener("close", () => {
      setSocketState("offline");
      if (state.activeMonitor) {
        state.activeMonitor.status = "stopped";
        state.activeMonitor = null;
        state.monitorTelemetry = null;
      }
      renderMonitor();
      globalThis.setTimeout(connectAdminSocket, 1500);
    });
    socket.addEventListener("error", () => setSocketState("offline"));
  } catch (error) {
    setSocketState("offline");
    showError(error.message || String(error));
  }
}

function handleSocketMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  if (message.type === "admin:monitor:started") {
    if (state.activeMonitor?.status === "stopping" && state.activeMonitor.monitorId === message.monitorId) {
      addLocalEvent("admin:monitor:started", {
        deviceName: message.deviceName,
        targetId: message.targetId
      });
      renderMonitor();
      return;
    }
    state.ignoredMonitorIds.delete(message.monitorId);
    state.activeMonitor = {
      ...(state.activeMonitor || {}),
      monitorId: message.monitorId,
      targetId: message.targetId,
      deviceName: message.deviceName,
      status: "active",
      startedAt: Date.now()
    };
    state.monitorTelemetry = null;
    addLocalEvent("admin:monitor:started", {
      deviceName: message.deviceName,
      targetId: message.targetId
    });
    setMonitorExplainer(i18n.t("startedMonitor", { device: friendlyDeviceName(message) }));
    renderMonitor();
  }
  if (message.type === "admin:monitor:stopped") {
    addLocalEvent("admin:monitor:stopped", { targetId: message.targetId });
    if (!state.activeMonitor || state.activeMonitor.monitorId === message.monitorId) {
      state.activeMonitor = null;
      state.monitorTelemetry = null;
    }
    if (message.monitorId) state.ignoredMonitorIds.add(message.monitorId);
    setMonitorExplainer(i18n.t("stoppedMonitor"));
    renderMonitor();
  }
  if (message.type === "admin:monitor:telemetry") {
    if (message.monitorId && state.ignoredMonitorIds.has(message.monitorId)) return;
    if (state.activeMonitor && message.monitorId && message.monitorId !== state.activeMonitor.monitorId) return;
    state.monitorTelemetry = message;
    if (state.activeMonitor) state.activeMonitor.status = message.status || "active";
    addLocalEvent("admin:monitor:telemetry", {
      deviceName: message.deviceName,
      status: message.status,
      reason: message.reason,
      detected: message.detected,
      emitted: message.emitted,
      marginDb: message.marginDb,
      confidence: message.confidence,
      bumpPoints: message.bumpPoints,
      tiltDegrees: message.tiltDegrees,
      motionSamples: message.motionSamples
    });
    updateMonitorExplainerFromTelemetry(message);
    renderMonitor();
  }
  if (message.type === "route:error") {
    addLocalEvent("route:error", message);
    if (message.code === "target_offline") setMonitorExplainer(i18n.t("targetOffline"));
    else if (message.code === "monitor_not_available" && state.activeMonitor?.status === "stopping") {
      if (state.activeMonitor.monitorId) state.ignoredMonitorIds.add(state.activeMonitor.monitorId);
      state.activeMonitor = null;
      state.monitorTelemetry = null;
      setMonitorExplainer(i18n.t("stoppedMonitor"));
    }
    else setMonitorExplainer(message.code || i18n.t("error"));
    renderMonitor();
    renderTimeline();
  }
}

function sendSocket(payload) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return false;
  state.socket.send(JSON.stringify(payload));
  return true;
}

async function refreshDiagnostics() {
  try {
    const [readyz, snapshot] = await Promise.all([
      diagnostics.readiness().catch((error) => ({ ok: false, error: error.message })),
      diagnostics.snapshot()
    ]);
    state.readyz = readyz;
    state.snapshot = snapshot;
    renderAll();
  } catch (error) {
    state.readyz = { ok: false, error: error.message };
    setSocketState("offline");
    showError(error.message || String(error));
    renderAll();
  }
}

function schedulePoll() {
  globalThis.clearTimeout(state.pollTimer);
  if (!state.polling) return;
  state.pollTimer = globalThis.setTimeout(async () => {
    await refreshDiagnostics();
    schedulePoll();
  }, POLL_INTERVAL_MS);
}

function renderAll() {
  renderSummary();
  renderReadinessBoard();
  renderDevices();
  renderMonitor();
  renderTimeline();
  renderSessions();
  const generatedAt = state.snapshot?.generatedAt ? new Date(state.snapshot.generatedAt) : new Date();
  $("[data-snapshot-time]").textContent = generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("[data-server-time]").textContent = generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderSummary() {
  const devices = physicalDevices();
  const pairs = state.snapshot?.signaling?.pairs || [];
  const connected = isServerHealthy();
  const connection = $("[data-server-connection]");
  connection.dataset.state = connected ? "connected" : state.socketState;
  connection.querySelector("span").textContent = connected ? i18n.t("connected") : i18n.t("checkingServer");
  $("[data-summary-server]").textContent = connected ? i18n.t("connected") : i18n.t("offline");
  $("[data-summary-server-detail]").textContent = connected ? `${i18n.t("azureSignaling")} · ${i18n.t("turnReady")}` : httpBase;
  $("[data-summary-devices]").textContent = String(devices.length);
  $("[data-summary-devices-detail]").textContent = i18n.t("physicalDevices", { count: devices.length });
  $("[data-summary-pairs]").textContent = String(pairs.length);
  const readiness = readinessSummary();
  $("[data-summary-readiness]").textContent = `${readiness.percent}%`;
  $("[data-summary-readiness-detail]").textContent = i18n.t("launchChecks", readiness);
}

function renderReadinessBoard() {
  const connected = isServerHealthy();
  const blockedItems = connected
    ? [[i18n.t("noBlockers"), i18n.t("openPhoneHint"), i18n.t("none")]]
    : [["Production server", "The diagnostics endpoint is not reachable from this browser.", "blocked"]];
  const columns = [
    { key: "ready", title: i18n.t("readyColumn"), icon: "✓", items: i18n.t("readyItems") },
    { key: "proof", title: i18n.t("proofColumn"), icon: "!", items: i18n.t("proofItems") },
    { key: "blocked", title: i18n.t("blockedColumn"), icon: connected ? "0" : "!", items: blockedItems },
    { key: "later", title: i18n.t("laterColumn"), icon: "→", items: i18n.t("laterItems") }
  ];
  const readiness = readinessSummary();
  $("[data-readiness-score]").textContent = `${readiness.percent}%`;
  $("[data-readiness-progress]").style.width = `${readiness.percent}%`;
  $("[data-readiness-explainer]").textContent = i18n.t("readinessExplainer", readiness);
  $("[data-readiness-board]").innerHTML = columns.map((column) => `
    <section class="readiness-column" data-state="${escapeHtml(column.key)}">
      <header><span class="state-icon">${escapeHtml(column.icon)}</span><span>${escapeHtml(column.title)}</span><b>${column.items.length}</b></header>
      ${column.items.map((item) => renderReadinessRow(item)).join("")}
    </section>
  `).join("");
}

function renderReadinessRow([title, copy, status]) {
  return `
    <article class="readiness-row">
      <i aria-hidden="true">${status === "live" || status === "ready" ? "✓" : status === "blocked" ? "!" : "•"}</i>
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div>
      <span>${escapeHtml(status)}</span>
    </article>
  `;
}

function renderDevices() {
  const devices = physicalDevices();
  if (!state.selectedDeviceId && devices[0]) state.selectedDeviceId = devices[0].id;
  if (state.selectedDeviceId && !devices.some((device) => device.id === state.selectedDeviceId)) {
    state.selectedDeviceId = devices[0]?.id || "";
  }

  const list = $("[data-device-list]");
  if (!devices.length) {
    list.innerHTML = `<p class="empty-row">${escapeHtml(i18n.t("noDevices"))}</p>`;
  } else {
    list.innerHTML = devices.map((device) => `
      <button class="device-row${device.id === state.selectedDeviceId ? " is-selected" : ""}" type="button" data-device-id="${escapeHtml(device.id)}">
        <span class="device-name">
          <span class="device-avatar">${escapeHtml(deviceInitials(device))}</span>
          <span><strong>${escapeHtml(friendlyDeviceName(device))}</strong><small>${escapeHtml(device.id)}</small></span>
        </span>
        <span>${escapeHtml(friendlyPlatform(device))}</span>
        <span>${escapeHtml(formatAge(device.lastSeenMsAgo, i18n.locale))}</span>
      </button>
    `).join("");
  }
  list.querySelectorAll("[data-device-id]").forEach((button) => {
    button.addEventListener("click", () => selectDevice(button.dataset.deviceId));
  });

  const select = $("[data-monitor-device]");
  select.innerHTML = `<option value="">${escapeHtml(i18n.t("chooseDevice"))}</option>${devices.map((device) => `
    <option value="${escapeHtml(device.id)}"${device.id === state.selectedDeviceId ? " selected" : ""}>${escapeHtml(friendlyDeviceName(device))} · ${escapeHtml(friendlyPlatform(device))}</option>
  `).join("")}`;
  $("[data-device-count-copy]").textContent = i18n.t("devicesCount", { count: devices.length });
}

function selectDevice(deviceId) {
  state.selectedDeviceId = deviceId || "";
  state.monitorTelemetry = null;
  renderDevices();
  renderMonitor();
}

function startMonitor() {
  const device = selectedDevice();
  if (!device) {
    setMonitorExplainer(i18n.t("noDeviceSelected"));
    return;
  }
  connectAdminSocket();
  const monitorId = `monitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  state.activeMonitor = {
    monitorId,
    targetId: device.id,
    deviceName: friendlyDeviceName(device),
    status: "starting",
    startedAt: Date.now()
  };
  state.ignoredMonitorIds.delete(monitorId);
  const sent = sendSocket({
    type: "admin:monitor:start",
    targetId: device.id,
    payload: {
      monitorId,
      intervalMs: MONITOR_INTERVAL_MS,
      startFrequencyHz: MONITOR_START_HZ,
      endFrequencyHz: MONITOR_END_HZ,
      emit: true
    }
  });
  if (!sent) {
    state.activeMonitor = null;
    setMonitorExplainer(i18n.t("signalingDisconnected"));
  } else {
    setMonitorExplainer(i18n.t("startedMonitor", { device: friendlyDeviceName(device) }));
  }
  renderMonitor();
}

function stopMonitor() {
  if (!state.activeMonitor) return;
  const monitor = state.activeMonitor;
  state.ignoredMonitorIds.add(monitor.monitorId);
  const sent = sendSocket({
    type: "admin:monitor:stop",
    targetId: monitor.targetId,
    payload: { monitorId: monitor.monitorId }
  });
  if (!sent) {
    state.activeMonitor = null;
    state.monitorTelemetry = null;
    setMonitorExplainer(i18n.t("signalingDisconnected"));
    renderMonitor();
    return;
  }
  state.activeMonitor = {
    ...monitor,
    status: "stopping"
  };
  setMonitorExplainer(i18n.t("stoppingMonitor", { device: monitor.deviceName || i18n.t("chooseDevice") }));
  renderMonitor();
}

function renderMonitor() {
  const active = state.activeMonitor;
  const telemetry = state.monitorTelemetry || latestMonitorTelemetry();
  const status = active?.status || "idle";
  const normalizedStatus = ["active", "waiting", "stopping", "blocked", "error"].includes(status)
    ? status
    : status === "starting" ? "active" : "idle";
  const statusNode = $("[data-monitor-status]");
  statusNode.dataset.monitorStatus = normalizedStatus;
  $("[data-monitor-status-copy]").textContent = i18n.t(normalizedStatus);
  $("[data-action='monitor-start']").disabled = Boolean(active);
  $("[data-action='monitor-stop']").disabled = !active || active.status === "stopping";
  renderFrequencySpectrum(telemetry);
  renderMetricRows(telemetry);
}

function renderFrequencySpectrum(telemetry) {
  const start = Number(telemetry?.startFrequencyHz || MONITOR_START_HZ);
  const end = Number(telemetry?.endFrequencyHz || MONITOR_END_HZ);
  const bands = monitorFrequencyBands().map((definition, index) => ({
    ...definition,
    ...(telemetry?.bands?.[index] || {})
  }));
  $("[data-frequency-target]").textContent = i18n.t("targetBand", {
    band: formatFrequency(start, end)
  });
  $("[data-frequency-channels]").innerHTML = bands.map((band, index) => {
    const peakDb = Number(band.peakDb);
    const confidence = Number(band.confidence);
    const level = Number.isFinite(peakDb)
      ? Math.max(4, Math.min(100, ((peakDb + 100) / 65) * 100))
      : 4;
    const tone = !telemetry
      ? "idle"
      : band.detected || confidence >= 0.35
        ? "good"
        : confidence >= 0.15
          ? "warn"
          : "quiet";
    const overlapsTarget = band.startFrequencyHz < end && band.endFrequencyHz > start;
    const status = tone === "good" || tone === "warn" ? i18n.t("signalBand") : i18n.t("quietBand");
    const targetLabel = i18n.t("targetBand", { band: "" }).trim();
    return `
      <article class="frequency-channel" data-channel="${index}" data-tone="${tone}" tabindex="0"
        title="${escapeHtml(`${formatFrequency(band.startFrequencyHz, band.endFrequencyHz)} · ${Number.isFinite(peakDb) ? `${formatNumber(peakDb, 1)} dB` : i18n.t("waiting")}`)}">
        <header>
          <strong>${escapeHtml(band.label)}</strong>
          ${overlapsTarget ? `<span>${escapeHtml(targetLabel)}</span>` : ""}
        </header>
        <div class="frequency-channel-meter" aria-hidden="true"><i style="--level:${level}%"></i></div>
        <footer>
          <b>${Number.isFinite(peakDb) ? `${escapeHtml(formatNumber(peakDb, 1))} dB` : "-- dB"}</b>
          <span>${escapeHtml(status)}</span>
        </footer>
      </article>
    `;
  }).join("");
}

function monitorFrequencyBands() {
  return [
    { label: "18 kHz", startFrequencyHz: 18_000, endFrequencyHz: 18_500 },
    { label: "19 kHz", startFrequencyHz: 18_500, endFrequencyHz: 19_500 },
    { label: "20 kHz", startFrequencyHz: 19_500, endFrequencyHz: 20_500 },
    { label: "21 kHz", startFrequencyHz: 20_500, endFrequencyHz: 21_000 }
  ];
}

function readinessSummary() {
  const total = i18n.t("readyItems").length + i18n.t("proofItems").length;
  const liveInfrastructureChecks = isServerHealthy() ? 2 : 0;
  const locallyVerifiedChecks = Math.max(0, i18n.t("readyItems").length - 2);
  const verified = Math.min(total, liveInfrastructureChecks + locallyVerifiedChecks);
  return {
    verified,
    total,
    percent: total ? Math.round((verified / total) * 100) : 0
  };
}

function renderMetricRows(telemetry = state.monitorTelemetry || latestMonitorTelemetry()) {
  const sessionEvidence = latestSessionEvidence();
  const eventEvidence = latestEventEvidence();
  const correlation = firstNumber(telemetry?.confidence, sessionEvidence?.acoustic?.correlation, eventEvidence?.acousticCorrelation);
  const marginDb = firstNumber(telemetry?.marginDb, sessionEvidence?.acoustic?.marginDb, eventEvidence?.acousticMarginDb);
  const bump = firstNumber(telemetry?.bumpPoints, eventEvidence?.bumpCorrelation, sessionEvidence?.physicalEvidence?.bumpCorrelation);
  const tilt = firstNumber(telemetry?.tiltDegrees, eventEvidence?.tiltDegrees, sessionEvidence?.physicalEvidence?.tiltDegrees, eventEvidence?.tiltMatch);
  const rows = [
    {
      name: i18n.t("heardSignal"),
      meaning: i18n.t("heardSignalMeaning"),
      expected: i18n.t("heardSignalExpected"),
      value: telemetry?.status === "active"
        ? `${Math.round(Number(telemetry.confidence || 0) * 100)}% · ${telemetry.detected ? i18n.t("yes") : i18n.t("no")}`
        : i18n.t("waiting"),
      tone: telemetry?.status === "active" ? telemetryTone(telemetry) : "idle"
    },
    {
      name: i18n.t("correlation"),
      meaning: i18n.t("correlationMeaning"),
      expected: i18n.t("correlationExpected"),
      value: Number.isFinite(correlation) ? formatNumber(correlation, 2) : i18n.t("unknown"),
      tone: scoreTone(correlation, 0.30, 0.20)
    },
    {
      name: i18n.t("energyMargin"),
      meaning: i18n.t("energyMarginMeaning"),
      expected: i18n.t("energyMarginExpected"),
      value: Number.isFinite(marginDb) ? `${formatNumber(marginDb, 1)} dB` : i18n.t("unknown"),
      tone: scoreTone(marginDb, 8, 4.5)
    },
    {
      name: i18n.t("sampleRate"),
      meaning: i18n.t("sampleRateMeaning"),
      expected: i18n.t("sampleRateExpected"),
      value: telemetry?.sampleRate ? `${Math.round(telemetry.sampleRate / 1000)} kHz` : i18n.t("unknown"),
      tone: sampleRateTone(telemetry?.sampleRate)
    },
    {
      name: i18n.t("emittedPacket"),
      meaning: i18n.t("emittedPacketMeaning"),
      expected: i18n.t("emittedPacketExpected"),
      value: telemetry?.status === "active" ? (telemetry.emitted ? i18n.t("yes") : i18n.t("no")) : i18n.t("waiting"),
      tone: telemetry?.status === "active" ? (telemetry.emitted ? "good" : "bad") : "idle"
    },
    {
      name: i18n.t("bumpEvidence"),
      meaning: i18n.t("bumpEvidenceMeaning"),
      expected: i18n.t("bumpEvidenceExpected"),
      value: Number.isFinite(bump) ? (bump > 1 ? formatNumber(bump, 1) : `+${Math.round(bump * 20)}`) : i18n.t("unknown"),
      tone: Number.isFinite(bump) ? (bump >= 0.5 || bump >= 10 ? "good" : "bad") : "idle"
    },
    {
      name: i18n.t("tiltEvidence"),
      meaning: i18n.t("tiltEvidenceMeaning"),
      expected: i18n.t("tiltEvidenceExpected"),
      value: Number.isFinite(tilt) ? `${formatNumber(tilt > 1 ? tilt : tilt * 90, 0)}°` : i18n.t("unknown"),
      tone: Number.isFinite(tilt) ? ((tilt > 1 ? tilt : tilt * 90) > 30 ? "good" : "bad") : "idle"
    }
  ];

  $("[data-monitor-metrics]").innerHTML = `
    <div class="metric-row" data-header="true">
      <span>${escapeHtml(i18n.t("metric"))}</span><span>${escapeHtml(i18n.t("meaning"))}</span><span>${escapeHtml(i18n.t("expected"))}</span><span>${escapeHtml(i18n.t("current"))}</span><span>${escapeHtml(i18n.t("status"))}</span>
    </div>
    ${rows.map((row) => `
      <div class="metric-row">
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.meaning)}</span>
        <span>${escapeHtml(row.expected)}</span>
        <b>${escapeHtml(row.value)}</b>
        <span class="metric-state" data-tone="${escapeHtml(row.tone)}"><i></i>${escapeHtml(toneLabel(row.tone))}</span>
      </div>
    `).join("")}
  `;
}

function renderTimeline() {
  const local = state.localEvents.map((event) => ({ ...event, local: true }));
  const remote = (state.snapshot?.metrics?.recentEvents || []).map((event) => ({
    ...event,
    timestamp: new Date(event.at).getTime()
  })).filter((event) => !isEmptyTelemetryEvent(event));
  const events = [...local, ...remote]
    .filter((event) => Number(event.timestamp || 0) >= state.clearEventsBefore)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, 60);
  const timeline = $("[data-event-timeline]");
  if (!events.length) {
    timeline.innerHTML = `<p class="empty-row">${escapeHtml(i18n.t("noEvents"))}</p>`;
    return;
  }
  timeline.innerHTML = events.map((event) => {
    const detail = event.detail || {};
    return `
      <article class="timeline-item" data-tone="${escapeHtml(eventTone(event))}">
        <strong>${escapeHtml(friendlyEventType(event.type))}</strong>
        <time>${escapeHtml(new Date(event.timestamp || event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }))}</time>
        <small>${escapeHtml(friendlyEventDetail(event.type, detail))}</small>
      </article>
    `;
  }).join("");
}

function renderSessions() {
  const sessions = state.snapshot?.signaling?.proximitySessions || [];
  $("[data-session-count]").textContent = i18n.t("activeCount", { count: sessions.length });
  const table = $("[data-session-table]");
  if (!sessions.length) {
    table.innerHTML = `<p class="empty-row">${escapeHtml(i18n.t("noSessions"))}</p>`;
    return;
  }
  table.innerHTML = sessions.map((session) => {
    const participants = session.participants || [];
    const score = Math.max(...participants.map((participant) => Number(participant.telemetry?.score || 0)), 0);
    const acoustic = participants.map((participant) => participant.telemetry?.acoustic).find(Boolean);
    const participantRows = participants.map((participant) => {
      const telemetry = participant.telemetry || {};
      const acousticEvidence = telemetry.acoustic || {};
      const motion = telemetry.physicalEvidence || telemetry.motion || {};
      return `<small>${escapeHtml(participant.deviceName || participant.clientId || "device")} · audio ${formatNumber(acousticEvidence.correlation, 2)} · bump ${formatNumber(motion.bumpCorrelation ?? motion.bumpPoints, 1)} · tilt ${formatNumber(motion.tiltDegrees ?? motion.maxTiltDeg, 0)}°</small>`;
    }).join("");
    return `
      <article class="session-row">
        <strong>${escapeHtml(session.id)}</strong>
        <span>${escapeHtml(i18n.t(session.phase || "joining"))}</span>
        <span>${escapeHtml(`${participants.length} phones`)}</span>
        <span>${escapeHtml(`score ${Math.round(score * 100)} · ${formatFrequency(acoustic?.startFrequencyHz, acoustic?.endFrequencyHz)}`)}</span>
        ${participantRows}
      </article>
    `;
  }).join("");
}

function setSocketState(nextState) {
  state.socketState = nextState;
  const connected = nextState === "connected";
  const inline = document.querySelector(".inline-status span");
  if (inline) inline.textContent = connected ? i18n.t("signalingConnected") : i18n.t("signalingDisconnected");
  renderSummary();
}

function setMonitorExplainer(text) {
  const node = $("[data-monitor-explainer]");
  if (node) node.textContent = text;
}

function updateMonitorExplainerFromTelemetry(telemetry) {
  if (telemetry.status === "active") setMonitorExplainer(i18n.t("monitorRunning"));
  if (telemetry.status === "waiting") {
    if (telemetry.reason === "device-tap-required") setMonitorExplainer(i18n.t("monitorWaitingForTap"));
    else if (telemetry.reason === "proximity-ceremony-active") setMonitorExplainer(i18n.t("monitorWaitingForCeremony"));
  }
  if (telemetry.status === "blocked") {
    if (telemetry.reason === "audio-not-ready") setMonitorExplainer(i18n.t("audioNotReady"));
    else if (telemetry.reason === "proximity-ceremony-active") setMonitorExplainer(i18n.t("ceremonyActive"));
    else setMonitorExplainer(`${i18n.t("monitorBlocked")} ${telemetry.reason || ""}`.trim());
  }
  if (telemetry.status === "error") setMonitorExplainer(`${i18n.t("monitorError")} ${telemetry.reason || ""}`.trim());
}

function addLocalEvent(type, detail = {}) {
  state.localEvents.unshift({
    type,
    detail,
    timestamp: Date.now()
  });
  state.localEvents = state.localEvents.slice(0, 80);
  renderTimeline();
}

function physicalDevices() {
  return (state.snapshot?.signaling?.clients || [])
    .filter((client) => !client.capabilities?.admin && client.deviceFamily !== "admin")
    .map((client) => ({
      ...client,
      deviceFamily: normalizedDeviceFamily(client),
      deviceName: client.deviceName || fallbackDeviceName(client)
    }));
}

function selectedDevice() {
  return physicalDevices().find((device) => device.id === state.selectedDeviceId) || null;
}

function normalizedDeviceFamily(device) {
  const family = String(device.deviceFamily || device.capabilities?.platform?.family || "").toLowerCase();
  if (family.includes("android")) return "android";
  if (family.includes("iphone") || family === "ios") return "ios";
  if (family.includes("ipad")) return "ipad";
  if (family.includes("mac")) return "macos";
  if (family.includes("win")) return "windows";
  return family || inferFamilyFromName(device.deviceName);
}

function inferFamilyFromName(name = "") {
  const lower = String(name).toLowerCase();
  if (lower.includes("android") || lower.includes("pixel") || lower.includes("galaxy")) return "android";
  if (lower.includes("iphone")) return "ios";
  if (lower.includes("ipad")) return "ipad";
  if (lower.includes("mac")) return "macos";
  return "device";
}

function fallbackDeviceName(device) {
  const family = normalizedDeviceFamily(device);
  if (family === "android") return "Android phone";
  if (family === "ios") return "iPhone";
  if (family === "ipad") return "iPad";
  if (family === "macos") return "Mac";
  return "WebDrop device";
}

function friendlyDeviceName(device = {}) {
  return device.deviceName || device.name || fallbackDeviceName(device);
}

function friendlyPlatform(device = {}) {
  const family = normalizedDeviceFamily(device);
  const labels = {
    android: "Android",
    ios: "iPhone / iOS",
    ipad: "iPadOS",
    macos: "macOS",
    windows: "Windows",
    device: "Web device"
  };
  return device.deviceLabel || labels[family] || labels.device;
}

function deviceInitials(device) {
  const name = friendlyDeviceName(device).trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "WD";
}

function latestSessionEvidence() {
  const deviceId = state.selectedDeviceId;
  const participants = (state.snapshot?.signaling?.proximitySessions || [])
    .flatMap((session) => session.participants || [])
    .filter((participant) => participant.clientId === deviceId && participant.telemetry)
    .sort((a, b) => new Date(b.telemetry.receivedAt).getTime() - new Date(a.telemetry.receivedAt).getTime());
  return participants[0]?.telemetry || null;
}

function latestEventEvidence() {
  const deviceId = state.selectedDeviceId;
  const events = state.snapshot?.metrics?.recentEvents || [];
  for (const event of events) {
    const detail = event.detail || {};
    if (deviceId && detail.clientId && detail.clientId !== deviceId) continue;
    if (event.type !== "proximity:session:telemetry" && event.type !== "proximity:session:diagnostic") continue;
    return {
      ...detail,
      tiltDegrees: detail.motion?.maxTiltDeg,
      acousticCorrelation: detail.acousticCorrelation ?? detail.acoustic?.correlation,
      acousticMarginDb: detail.acousticMarginDb ?? detail.acoustic?.marginDb
    };
  }
  return null;
}

function latestMonitorTelemetry() {
  const deviceId = state.selectedDeviceId || state.activeMonitor?.targetId || "";
  if (!deviceId) return null;
  const events = state.snapshot?.metrics?.recentEvents || [];
  for (const event of events) {
    if (event.type !== "admin:monitor:telemetry") continue;
    const detail = event.detail || {};
    if (deviceId && detail.clientId && detail.clientId !== deviceId) continue;
    if (detail.monitorId && state.ignoredMonitorIds.has(detail.monitorId)) continue;
    return {
      monitorId: detail.monitorId,
      deviceId: detail.clientId,
      deviceName: detail.deviceName,
      status: detail.status || "active",
      reason: detail.reason || null,
      sequence: detail.sequence,
      sampledAt: event.at,
      sampleRate: detail.sampleRate,
      emitted: detail.emitted,
      detected: detail.detected,
      startFrequencyHz: detail.startFrequencyHz,
      endFrequencyHz: detail.endFrequencyHz,
      marginDb: detail.marginDb,
      confidence: detail.confidence,
      bands: detail.bands,
      bumpDetected: detail.bumpDetected,
      bumpPoints: detail.bumpPoints,
      tiltDetected: detail.tiltDetected,
      tiltDegrees: detail.tiltDegrees,
      motionSamples: detail.motionSamples,
      maxAcceleration: detail.maxAcceleration
    };
  }
  return null;
}

function isServerHealthy() {
  return Boolean(state.readyz?.ok || state.snapshot?.generatedAt);
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function telemetryTone(telemetry) {
  if (!telemetry) return "idle";
  if (telemetry.status === "blocked" || telemetry.status === "error") return "bad";
  if (telemetry.detected && Number(telemetry.confidence) >= 0.35) return "good";
  if (Number(telemetry.confidence) >= 0.15) return "warn";
  return "bad";
}

function scoreTone(value, good, warn) {
  if (!Number.isFinite(value)) return "idle";
  if (value >= good) return "good";
  if (value >= warn) return "warn";
  return "bad";
}

function sampleRateTone(value) {
  const sampleRate = Number(value);
  if (!Number.isFinite(sampleRate)) return "idle";
  if (sampleRate >= 44100) return "good";
  if (sampleRate >= 32000) return "warn";
  return "bad";
}

function toneLabel(tone) {
  if (tone === "good") return i18n.t("good");
  if (tone === "warn") return i18n.t("marginal");
  if (tone === "bad") return i18n.t("poor");
  return i18n.t("waiting");
}

function eventTone(event) {
  const detail = event.detail || {};
  if (event.type === "route:error" || /failed|error|blocked/i.test(event.type) || ["error", "blocked"].includes(detail.status)) return "bad";
  if (event.type === "admin:monitor:telemetry") {
    return detail.status === "active" && detail.detected ? "good" : "warn";
  }
  if (/diagnostic|stopped|stop|left/.test(event.type)) return "warn";
  return "good";
}

function isEmptyTelemetryEvent(event) {
  return !event.detail && (
    event.type === "admin:monitor:telemetry"
    || event.type === "proximity:session:telemetry"
    || event.type === "proximity:session:diagnostic"
  );
}

function friendlyEventType(type = "") {
  return String(type)
    .replace(/^proximity:session:/, "session ")
    .replace(/^admin:monitor:/, "monitor ")
    .replace(/^client:/, "client ")
    .replace(/:/g, " · ");
}

function friendlyEventDetail(type, detail = {}) {
  if (type === "admin:monitor:started") {
    return `${detail.deviceName || "Selected device"} · continuous monitoring started`;
  }
  if (type === "admin:monitor:start") {
    return "Admin requested continuous ultrasonic monitoring.";
  }
  if (type === "admin:monitor:stopped") {
    return `${detail.deviceName || "Selected device"} · monitoring stopped`;
  }
  if (type === "admin:monitor:stop") {
    return "Admin requested the monitor to stop.";
  }
  if (type === "admin:monitor:telemetry") {
    if (detail.status === "waiting") {
      return `${detail.deviceName || detail.clientId || "device"} · waiting · ${detail.reason || "device action required"}`;
    }
    const bump = Number.isFinite(Number(detail.bumpPoints)) ? formatNumber(detail.bumpPoints, 0) : "--";
    const tilt = Number.isFinite(Number(detail.tiltDegrees)) ? formatNumber(detail.tiltDegrees, 0) : "--";
    return `${detail.deviceName || detail.clientId || "device"} · ${detail.status || "active"} · ${detail.emitted ? "emitted" : "silent"} · ${detail.detected ? "heard" : "missed"} · ${formatNumber(detail.marginDb, 1)} dB · bump ${bump} · tilt ${tilt}°`;
  }
  if (type === "proximity:session:telemetry") {
    return `${detail.deviceName || detail.clientId || "device"} · score ${Math.round(Number(detail.score || 0) * 100)} · ${formatFrequency(detail.acousticStartFrequencyHz, detail.acousticEndFrequencyHz)}`;
  }
  if (type === "proximity:session:diagnostic") {
    return `${detail.deviceName || detail.clientId || "device"} · ${detail.phase || "diagnostic"} · ${detail.reason || detail.message || "reported"}`;
  }
  if (type === "client:joined" || type === "client:left") {
    return `${detail.deviceName || detail.clientId || "device"} · ${detail.deviceFamily || ""}`;
  }
  if (detail.reason) return `${detail.reason}`;
  if (detail.code) return `${detail.code}`;
  return JSON.stringify(detail).slice(0, 220);
}

function showError(message) {
  const node = $("[data-admin-error]");
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  globalThis.setTimeout(() => {
    node.hidden = true;
  }, 5000);
}
