import { createOperationsI18n } from "./operations-i18n.js?v=1.0.87";
import { DiagnosticsApi } from "./diagnostics-api.js?v=1.0.87";
import { apiBaseFrom, escapeHtml, formatAge, formatFrequency, formatNumber } from "./shared.js?v=1.0.87";

const APP_VERSION = "1.0.87";
const DEFAULT_HTTP_BASE = "https://webdrop-wss-0618.japaneast.cloudapp.azure.com";
const DEFAULT_WS_URL = "wss://webdrop-wss-0618.japaneast.cloudapp.azure.com/ws";
const POLL_INTERVAL_MS = 1000;
const MONITOR_INTERVAL_MS = 1000;
const MONITOR_START_HZ = 18_600;
const MONITOR_END_HZ = 19_400;
// The diagnostics feed requires the metrics bearer token. On the operator's own
// machine it is auto-loaded from the gitignored js/config/local-admin-token.js;
// remote operators paste it once (kept only in sessionStorage, never committed).
const ADMIN_TOKEN_STORAGE_KEY = "webdrop.adminToken";
const LOCAL_ADMIN_TOKEN_URL = new URL("../config/local-admin-token.js?v=1.0.87", import.meta.url);

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
    startAllMonitoring: "Start all",
    stop: "Stop",
    stopAllMonitoring: "Stop all",
    monitorExplainer: "The selected phone must have opened WebDrop audio from a user tap. Monitoring continues until Stop is pressed.",
    goodRange: "Good: within expected range",
    marginalRange: "Marginal: check conditions",
    poorRange: "Poor: investigate",
    recentActivity: "Recent activity",
    eventTimeline: "Event timeline",
    clear: "Clear",
    noEvents: "No events yet.",
    activeSessions: "Active proximity sessions",
    recentSessions: "Recent slot attempts",
    recentSessionCopy: "Finished sessions stay here briefly so you can inspect slots, evidence, and failure reasons.",
    singleDeviceTesting: "Single-device test",
    multiDeviceTesting: "Multi-device sessions",
    noSessions: "No active proximity sessions.",
    sessionColumn: "Session",
    phaseColumn: "Phase",
    devicesColumn: "Devices",
    scoreColumn: "Score & band",
    timingColumn: "Timing",
    scoreLabel: "score",
    slot: "slot",
    emitted: "emitted",
    silent: "silent",
    heard: "heard",
    missed: "missed",
    insufficient: "insufficient",
    micReady: "mic",
    evidenceLabel: "evidence",
    soundShort: "snd",
    bumpShort: "bump",
    tiltShort: "tilt",
    startedAgo: "started {age}",
    endsIn: "ends in {seconds}s",
    completing: "completing",
    joinedAgo: "joined {age}",
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
    statusLive: "Live",
    statusReady: "Ready",
    statusProof: "Needs proof",
    statusLater: "Later",
    serverUnreachable: "Production server",
    serverUnreachableCopy: "The diagnostics endpoint is not reachable from this browser.",
    diagnosticsProtected: "Diagnostics need the operations token. Paste a valid token to continue.",
    diagnosticsMissing: "The signaling server does not have the diagnostics route deployed yet.",
    tokenPrompt: "Enter the WebDrop operations token to read live diagnostics:",
    diagnosticsUnreachable: "The signaling server could not be reached. Check connectivity and allowed origins.",
    phonesCount: "{count} phones",
    physicalDevices: "{count} physical devices",
    devicesCount: "{count} devices",
    activeCount: "{count} active",
    startedMonitor: "Monitoring {device}. Keep the phone on WebDrop and tap Connect if audio is not ready.",
    startedAllMonitors: "Monitoring {count} devices. Keep each phone on WebDrop and tap Connect once if audio is not ready.",
    stoppedMonitor: "Monitor stopped.",
    stoppedAllMonitors: "All monitors stopped.",
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
    bumpEvidenceExpected: "Raw bump value 10 or more awards 20 score points.",
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
      ["Proximity ceremony", "Not signed off. Ultrasound interpretation still needs real iPhone/Android proof.", "proof"],
      ["iPhone acoustic calibration", "Need repeated live tests to confirm emitted slots are heard on the other phone.", "proof"],
      ["Android acoustic calibration", "Android is no longer labeled unknown, but acoustic capture still needs real-device proof.", "proof"],
      ["WebRTC file transfer", "Needs same-room direct and TURN relay proof after proximity pairing is stable.", "proof"],
      ["View/download behavior", "Needs Android receive proof; iPhone behavior has been separately checked before.", "proof"]
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
    startAllMonitoring: "全端末を監視",
    stop: "停止",
    stopAllMonitoring: "全停止",
    monitorExplainer: "選択した端末で WebDrop の音声がタップ操作から有効になっている必要があります。停止するまで監視します。",
    goodRange: "良好: 期待範囲内",
    marginalRange: "注意: 条件を確認",
    poorRange: "不良: 調査が必要",
    recentActivity: "最近の動き",
    eventTimeline: "イベントタイムライン",
    clear: "クリア",
    noEvents: "イベントはまだありません。",
    activeSessions: "近接セッション",
    recentSessions: "直近のスロット試行",
    recentSessionCopy: "終了したセッションも短時間ここに残し、スロット、証拠、失敗理由を確認できます。",
    singleDeviceTesting: "単体端末テスト",
    multiDeviceTesting: "複数端末セッション",
    noSessions: "アクティブな近接セッションはありません。",
    sessionColumn: "セッション",
    phaseColumn: "フェーズ",
    devicesColumn: "端末",
    scoreColumn: "スコアと帯域",
    timingColumn: "タイミング",
    scoreLabel: "スコア",
    slot: "スロット",
    emitted: "送信",
    silent: "無音",
    heard: "受信",
    missed: "未受信",
    insufficient: "不十分",
    micReady: "マイク",
    evidenceLabel: "証拠",
    soundShort: "音",
    bumpShort: "バンプ",
    tiltShort: "傾き",
    startedAgo: "{age}開始",
    endsIn: "残り{seconds}秒",
    completing: "完了処理中",
    joinedAgo: "{age}参加",
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
    statusLive: "稼働中",
    statusReady: "準備済み",
    statusProof: "要実機",
    statusLater: "後で",
    serverUnreachable: "本番サーバー",
    serverUnreachableCopy: "このブラウザから診断エンドポイントに到達できません。",
    diagnosticsProtected: "診断には運用トークンが必要です。有効なトークンを貼り付けてください。",
    diagnosticsMissing: "シグナリングサーバーに診断ルートがまだありません。",
    tokenPrompt: "ライブ診断を表示するには WebDrop の運用トークンを入力してください:",
    diagnosticsUnreachable: "シグナリングサーバーに到達できません。接続と許可オリジンを確認してください。",
    phonesCount: "{count} 台",
    physicalDevices: "物理端末 {count} 台",
    devicesCount: "{count} 台",
    activeCount: "{count} 件",
    startedMonitor: "{device} を監視中。音声が未準備なら端末側で Connect をタップしてください。",
    startedAllMonitors: "{count} 台を監視中。各端末で WebDrop を開き、音声が未準備なら Connect を一度タップしてください。",
    stoppedMonitor: "監視を停止しました。",
    stoppedAllMonitors: "すべての監視を停止しました。",
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
    bumpEvidenceExpected: "生のバンプ値が10以上の場合、スコアに20点加算。",
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
      ["近接セレモニー", "未完了。超音波の解釈は実機 iPhone/Android で証明が必要です。", "proof"],
      ["iPhone 音響調整", "送信スロットが相手端末で聞こえるか、繰り返しライブ確認が必要です。", "proof"],
      ["Android 音響調整", "Android は Unknown 表示にしませんが、音響キャプチャは実機証明が必要です。", "proof"],
      ["WebRTC ファイル転送", "近接ペアリング安定後に直接/TURN リレー転送の証明が必要です。", "proof"],
      ["表示/ダウンロード挙動", "Android 受信の証明が必要です。iPhone 側は以前に確認済みです。", "proof"]
    ],
    laterItems: [
      ["1 万クライアント負荷試験", "物理ハンドシェイクが安定してから実施します。", "later"],
      ["複数ノード化", "水平スケール前に共有状態またはスティッキーセッションが必要です。", "later"],
      ["長時間の音響調整", "複数機種と騒音環境のサンプルを集めます。", "later"]
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
  serverReachable: null,
  pollTimer: 0,
  errorTimer: 0,
  polling: true,
  selectedDeviceId: "",
  activeMonitor: null,
  activeMonitors: new Map(),
  monitorTelemetry: null,
  monitorTelemetryByDevice: new Map(),
  ignoredMonitorIds: new Set(),
  localEvents: [],
  clearEventsBefore: 0,
  tokenPromptDismissed: false
};

const i18n = createOperationsI18n(ADMIN_MESSAGES, {
  onChange: () => renderAll()
});

init();

async function init() {
  $("[data-admin-version]").textContent = APP_VERSION;
  bindEvents();
  activateTab(new URLSearchParams(location.search).get("tab") === "live" ? "live" : "readiness");
  renderAll();
  connectAdminSocket();
  diagnostics.configure({ token: await resolveAdminToken() });
  refreshDiagnostics();
  schedulePoll();
}

async function resolveAdminToken() {
  const fromGlobal = typeof globalThis.WEBDROP_ADMIN_TOKEN === "string" ? globalThis.WEBDROP_ADMIN_TOKEN.trim() : "";
  if (fromGlobal) return fromGlobal;
  const fromSession = storedAdminToken();
  if (fromSession) return fromSession;
  return fetchLocalAdminToken();
}

function storedAdminToken() {
  try {
    return (globalThis.sessionStorage?.getItem(ADMIN_TOKEN_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

async function fetchLocalAdminToken() {
  // Silent best-effort read of the gitignored local token file. A 404 (the file
  // is absent on shared/remote machines) resolves to an empty string without a
  // console error, so remote operators simply fall through to the paste prompt.
  try {
    const response = await fetch(LOCAL_ADMIN_TOKEN_URL, { cache: "no-store" });
    if (!response.ok) return "";
    const text = await response.text();
    const match = text.match(/WEBDROP_ADMIN_TOKEN\s*=\s*["'`]([^"'`]+)["'`]/);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

function promptForAdminToken() {
  if (state.tokenPromptDismissed || typeof globalThis.prompt !== "function") return "";
  const entered = globalThis.prompt(i18n.t("tokenPrompt"));
  const token = typeof entered === "string" ? entered.trim() : "";
  if (!token) {
    state.tokenPromptDismissed = true;
    return "";
  }
  try {
    globalThis.sessionStorage?.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    /* sessionStorage may be unavailable; keep the token in memory via configure */
  }
  return token;
}

function bindEvents() {
  $$("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.adminTab));
  });
  $("[data-live-poll]")?.addEventListener("change", (event) => {
    state.polling = event.target.checked;
    if (state.polling) schedulePoll();
    else globalThis.clearTimeout(state.pollTimer);
  });
  $("[data-monitor-device]")?.addEventListener("change", (event) => {
    selectDevice(event.target.value);
  });
  $("[data-action='monitor-start']")?.addEventListener("click", startMonitor);
  $("[data-action='monitor-stop']")?.addEventListener("click", stopMonitor);
  $("[data-action='monitor-start-all']")?.addEventListener("click", startAllMonitors);
  $("[data-action='monitor-stop-all']")?.addEventListener("click", stopAllMonitors);
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
  $$("[data-admin-tab]").forEach((button) => {
    const isActive = button.dataset.adminTab === name;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
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
      state.activeMonitors.clear();
      renderMonitor();
      globalThis.setTimeout(connectAdminSocket, 1500);
    });
    socket.addEventListener("error", () => setSocketState("offline"));
  } catch (error) {
    setSocketState("offline");
    showError(friendlyError(error));
  }
}

function handleSocketMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }
  const envelope = unwrapSocketEnvelope(message);
  if (envelope.type === "admin:monitor:started") {
    const targetId = envelope.targetId || state.activeMonitor?.targetId || "";
    const existing = targetId ? state.activeMonitors.get(targetId) : state.activeMonitor;
    if (existing?.status === "stopping" && existing.monitorId === envelope.monitorId) {
      addLocalEvent("admin:monitor:started", {
        deviceName: envelope.deviceName,
        targetId: envelope.targetId
      });
      renderMonitor();
      return;
    }
    state.ignoredMonitorIds.delete(envelope.monitorId);
    const nextMonitor = {
      ...(existing || state.activeMonitor || {}),
      monitorId: envelope.monitorId,
      targetId,
      deviceName: envelope.deviceName,
      status: "active",
      startedAt: Date.now()
    };
    if (targetId) state.activeMonitors.set(targetId, nextMonitor);
    if (!state.selectedDeviceId || state.selectedDeviceId === targetId) state.activeMonitor = nextMonitor;
    if (state.selectedDeviceId === targetId) state.monitorTelemetry = null;
    addLocalEvent("admin:monitor:started", {
      deviceName: envelope.deviceName,
      targetId
    });
    setMonitorExplainer(i18n.t("startedMonitor", { device: friendlyDeviceName(envelope) }));
    renderMonitor();
  }
  if (envelope.type === "admin:monitor:stopped") {
    const targetId = envelope.targetId || state.activeMonitor?.targetId || "";
    addLocalEvent("admin:monitor:stopped", { targetId });
    if (targetId) state.activeMonitors.delete(targetId);
    state.monitorTelemetryByDevice.delete(targetId);
    if (!state.activeMonitor || state.activeMonitor.monitorId === envelope.monitorId || state.activeMonitor.targetId === targetId) {
      state.activeMonitor = null;
      state.monitorTelemetry = null;
    }
    if (envelope.monitorId) state.ignoredMonitorIds.add(envelope.monitorId);
    setMonitorExplainer(i18n.t("stoppedMonitor"));
    renderMonitor();
  }
  if (envelope.type === "admin:monitor:telemetry") {
    if (envelope.monitorId && state.ignoredMonitorIds.has(envelope.monitorId)) return;
    const targetId = envelope.deviceId || envelope.targetId || state.activeMonitor?.targetId || "";
    const activeForDevice = targetId ? state.activeMonitors.get(targetId) : null;
    if (activeForDevice && envelope.monitorId && envelope.monitorId !== activeForDevice.monitorId) return;
    if (targetId) state.monitorTelemetryByDevice.set(targetId, envelope);
    if (!state.selectedDeviceId || state.selectedDeviceId === targetId) state.monitorTelemetry = envelope;
    if (activeForDevice) {
      activeForDevice.status = envelope.status || "active";
      state.activeMonitors.set(targetId, activeForDevice);
      if (state.selectedDeviceId === targetId) state.activeMonitor = activeForDevice;
    }
    addLocalEvent("admin:monitor:telemetry", {
      monitorId: envelope.monitorId,
      clientId: targetId,
      deviceName: envelope.deviceName,
      status: envelope.status,
      reason: envelope.reason,
      detected: envelope.detected,
      emitted: envelope.emitted,
      startFrequencyHz: envelope.startFrequencyHz,
      endFrequencyHz: envelope.endFrequencyHz,
      sampleRate: envelope.sampleRate,
      bands: envelope.bands,
      marginDb: envelope.marginDb,
      confidence: envelope.confidence,
      bumpPoints: envelope.bumpPoints,
      tiltDegrees: envelope.tiltDegrees,
      motionSamples: envelope.motionSamples
    });
    if (!state.selectedDeviceId || state.selectedDeviceId === targetId) updateMonitorExplainerFromTelemetry(envelope);
    renderMonitor();
  }
  if (envelope.type === "route:error") {
    addLocalEvent("route:error", envelope);
    if (envelope.code === "target_offline") setMonitorExplainer(i18n.t("targetOffline"));
    else if (envelope.code === "monitor_not_available" && state.activeMonitor?.status === "stopping") {
      if (state.activeMonitor.monitorId) state.ignoredMonitorIds.add(state.activeMonitor.monitorId);
      state.activeMonitor = null;
      state.monitorTelemetry = null;
      setMonitorExplainer(i18n.t("stoppedMonitor"));
    }
    else setMonitorExplainer(envelope.code || i18n.t("error"));
    renderMonitor();
    renderTimeline();
  }
}

function unwrapSocketEnvelope(message) {
  const payload = isPlainObject(message?.payload) ? message.payload : {};
  return {
    ...message,
    ...payload,
    type: message?.type || payload.type || "",
    payload
  };
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
    state.serverReachable = true;
    renderAll();
  } catch (error) {
    if (error.message === "unauthorized") {
      const token = promptForAdminToken();
      if (token) {
        diagnostics.configure({ token });
        return refreshDiagnostics();
      }
    }
    state.serverReachable = false;
    state.readyz = { ok: false, error: error.message };
    setSocketState("offline");
    showError(friendlyError(error));
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
  const generatedClock = formatClock(state.snapshot?.generatedAt || Date.now());
  $("[data-snapshot-time]").textContent = generatedClock;
  $("[data-server-time]").textContent = generatedClock;
}

function renderSummary() {
  const devices = physicalDevices();
  const pairs = state.snapshot?.signaling?.pairs || [];
  const connected = isServerHealthy();
  const unreachable = state.serverReachable === false;
  const connection = $("[data-server-connection]");
  connection.dataset.state = connected ? "connected" : unreachable ? "offline" : "checking";
  connection.querySelector("span").textContent = connected
    ? i18n.t("connected")
    : unreachable ? i18n.t("offline") : i18n.t("checkingServer");
  $("[data-summary-server]").textContent = connected
    ? i18n.t("connected")
    : unreachable ? i18n.t("offline") : i18n.t("checkingServer");
  $("[data-summary-server-detail]").textContent = connected ? `${i18n.t("azureSignaling")} · ${i18n.t("turnReady")}` : httpBase;
  const serverIcon = $("[data-summary-server]").closest("article")?.querySelector(".summary-icon");
  if (serverIcon) {
    serverIcon.dataset.tone = connected ? "green" : unreachable ? "red" : "amber";
    serverIcon.textContent = connected ? "✓" : unreachable ? "!" : "·";
  }
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
    ? [[i18n.t("noBlockers"), i18n.t("openPhoneHint"), "none"]]
    : [[i18n.t("serverUnreachable"), i18n.t("serverUnreachableCopy"), "blocked"]];
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
  const icon = status === "live" || status === "ready" ? "✓" : status === "blocked" ? "!" : "•";
  return `
    <article class="readiness-row">
      <i aria-hidden="true">${icon}</i>
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div>
      <span>${escapeHtml(readinessStatusLabel(status))}</span>
    </article>
  `;
}

function readinessStatusLabel(status) {
  const labels = {
    live: i18n.t("statusLive"),
    ready: i18n.t("statusReady"),
    proof: i18n.t("statusProof"),
    later: i18n.t("statusLater"),
    blocked: i18n.t("blocked"),
    none: i18n.t("none")
  };
  return labels[status] || status;
}

function renderDevices() {
  const devices = physicalDevices();
  pruneDisconnectedDevices(devices);
  if (!state.selectedDeviceId && devices[0]) state.selectedDeviceId = devices[0].id;
  if (state.selectedDeviceId && !devices.some((device) => device.id === state.selectedDeviceId)) {
    state.selectedDeviceId = devices[0]?.id || "";
  }

  const list = $("[data-device-list]");
  if (!devices.length) {
    list.innerHTML = `<p class="empty-row">${escapeHtml(i18n.t("noDevices"))}</p>`;
  } else {
    list.innerHTML = devices.map((device) => {
      const monitor = state.activeMonitors.get(device.id);
      const telemetry = state.monitorTelemetryByDevice.get(device.id);
      const status = monitor?.status || telemetry?.status || "idle";
      const age = telemetry?.sampledAt
        ? formatAge(Date.now() - Number(telemetry.sampledAt), i18n.locale)
        : formatAge(device.lastSeenMsAgo, i18n.locale);
      return `
      <button class="device-row${device.id === state.selectedDeviceId ? " is-selected" : ""}" type="button" data-device-id="${escapeHtml(device.id)}">
        <span class="device-name">
          <span class="device-avatar">${escapeHtml(deviceInitials(device))}</span>
          <span><strong>${escapeHtml(friendlyDeviceName(device))}</strong><small>${escapeHtml(statusLabel(status))} · ${escapeHtml(device.id)}</small></span>
        </span>
        <span>${escapeHtml(friendlyPlatform(device))}</span>
        <span>${escapeHtml(age)}</span>
      </button>
    `;
    }).join("");
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
  state.activeMonitor = state.activeMonitors.get(state.selectedDeviceId) || null;
  state.monitorTelemetry = state.monitorTelemetryByDevice.get(state.selectedDeviceId) || null;
  renderDevices();
  renderMonitor();
}

function startMonitor() {
  const device = selectedDevice();
  if (!device) {
    setMonitorExplainer(i18n.t("noDeviceSelected"));
    return;
  }
  startMonitorForDevice(device);
}

function startAllMonitors() {
  const devices = physicalDevices();
  if (!devices.length) {
    setMonitorExplainer(i18n.t("openPhoneHint"));
    return;
  }
  for (const device of devices) startMonitorForDevice(device);
  setMonitorExplainer(i18n.t("startedAllMonitors", { count: devices.length }));
  renderMonitor();
}

function startMonitorForDevice(device) {
  connectAdminSocket();
  if (state.activeMonitors.has(device.id)) return;
  const monitorId = `monitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const monitor = {
    monitorId,
    targetId: device.id,
    deviceName: friendlyDeviceName(device),
    status: "starting",
    startedAt: Date.now()
  };
  state.activeMonitors.set(device.id, monitor);
  if (device.id === state.selectedDeviceId) state.activeMonitor = monitor;
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
    state.activeMonitors.delete(device.id);
    if (device.id === state.selectedDeviceId) state.activeMonitor = null;
    setMonitorExplainer(i18n.t("signalingDisconnected"));
  } else {
    setMonitorExplainer(i18n.t("startedMonitor", { device: friendlyDeviceName(device) }));
  }
  renderMonitor();
}

function stopMonitor() {
  const monitor = state.activeMonitors.get(state.selectedDeviceId) || state.activeMonitor;
  if (!monitor) return;
  stopMonitorFor(monitor);
}

function stopAllMonitors() {
  const monitors = [...state.activeMonitors.values()];
  for (const monitor of monitors) stopMonitorFor(monitor, { quiet: true });
  setMonitorExplainer(i18n.t("stoppedAllMonitors"));
  renderMonitor();
}

function stopMonitorFor(monitor, { quiet = false } = {}) {
  state.ignoredMonitorIds.add(monitor.monitorId);
  const sent = sendSocket({
    type: "admin:monitor:stop",
    targetId: monitor.targetId,
    payload: { monitorId: monitor.monitorId }
  });
  if (!sent) {
    state.activeMonitors.delete(monitor.targetId);
    state.monitorTelemetryByDevice.delete(monitor.targetId);
    if (state.activeMonitor?.monitorId === monitor.monitorId) state.activeMonitor = null;
    if (state.selectedDeviceId === monitor.targetId) state.monitorTelemetry = null;
    setMonitorExplainer(i18n.t("signalingDisconnected"));
    renderMonitor();
    return;
  }
  const nextMonitor = {
    ...monitor,
    status: "stopping"
  };
  state.activeMonitors.set(monitor.targetId, nextMonitor);
  if (state.selectedDeviceId === monitor.targetId) state.activeMonitor = nextMonitor;
  if (!quiet) setMonitorExplainer(i18n.t("stoppingMonitor", { device: monitor.deviceName || i18n.t("chooseDevice") }));
  renderMonitor();
}

function renderMonitor() {
  const selectedMonitor = state.activeMonitors.get(state.selectedDeviceId) || state.activeMonitor;
  const active = selectedMonitor;
  const telemetry = state.monitorTelemetryByDevice.get(state.selectedDeviceId)
    || state.monitorTelemetry
    || latestMonitorTelemetry();
  const status = active?.status || "idle";
  const normalizedStatus = ["active", "waiting", "stopping", "blocked", "error"].includes(status)
    ? status
    : status === "starting" ? "active" : "idle";
  const statusNode = $("[data-monitor-status]");
  statusNode.dataset.monitorStatus = normalizedStatus;
  $("[data-monitor-status-copy]").textContent = i18n.t(normalizedStatus);
  const devices = physicalDevices();
  $("[data-action='monitor-start']").disabled = Boolean(active) || !state.selectedDeviceId;
  $("[data-action='monitor-stop']").disabled = !active || active.status === "stopping";
  $("[data-action='monitor-start-all']").disabled = !devices.length || devices.every((device) => state.activeMonitors.has(device.id));
  $("[data-action='monitor-stop-all']").disabled = !state.activeMonitors.size;
  renderFrequencySpectrum(telemetry);
  renderMetricRows(telemetry);
}

function renderFrequencySpectrum(telemetry) {
  const start = Number(telemetry?.startFrequencyHz || MONITOR_START_HZ);
  const end = Number(telemetry?.endFrequencyHz || MONITOR_END_HZ);
  const bands = monitorFrequencyBands().map((definition, index) => ({
    ...definition,
    ...matchingFrequencyBand(definition, telemetry?.bands, index)
  }));
  $("[data-frequency-target]").textContent = i18n.t("targetBand", {
    band: formatFrequency(start, end)
  });
  $("[data-frequency-channels]").innerHTML = bands.map((band, index) => {
    const peakDb = Number(band.peakDb);
    const confidence = Number(band.confidence);
    const level = Number.isFinite(peakDb)
      ? Math.max(4, Math.min(100, ((peakDb + 140) / 90) * 100))
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

function matchingFrequencyBand(definition, telemetryBands, index) {
  const bands = Array.isArray(telemetryBands) ? telemetryBands : [];
  const overlapping = bands
    .map((band) => ({
      band,
      overlap: frequencyOverlap(definition, band)
    }))
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  return overlapping[0]?.band || bands[index] || {};
}

function frequencyOverlap(a, b) {
  const start = Math.max(Number(a?.startFrequencyHz), Number(b?.startFrequencyHz));
  const end = Math.min(Number(a?.endFrequencyHz), Number(b?.endFrequencyHz));
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
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
      value: telemetry?.bumpDetected
        ? `+${Math.round(Number(telemetry.bumpPoints || 20))} (raw ${formatNumber(telemetry.maxAcceleration, 1)})`
        : Number.isFinite(telemetry?.maxAcceleration)
          ? `raw ${formatNumber(telemetry.maxAcceleration, 1)}`
          : i18n.t("unknown"),
      tone: telemetry?.bumpDetected || Number(telemetry?.maxAcceleration) >= 10 ? "good" : telemetry ? "bad" : "idle"
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
  const recent = recentSessionSummaries(sessions);
  $("[data-session-count]").textContent = i18n.t("activeCount", { count: sessions.length });
  const table = $("[data-session-table]");
  if (!sessions.length && !recent.length) {
    table.innerHTML = `<p class="empty-row">${escapeHtml(i18n.t("noSessions"))}</p>`;
    return;
  }
  const now = Date.now();
  const header = `
    <div class="session-row session-head" aria-hidden="true">
      <span>${escapeHtml(i18n.t("sessionColumn"))}</span>
      <span>${escapeHtml(i18n.t("phaseColumn"))}</span>
      <span>${escapeHtml(i18n.t("devicesColumn"))}</span>
      <span>${escapeHtml(i18n.t("scoreColumn"))}</span>
      <span>${escapeHtml(i18n.t("timingColumn"))}</span>
    </div>`;
  table.innerHTML = header + [
    ...sessions.map((session) => renderActiveSessionRow(session, now)),
    ...recent.map((session) => renderRecentSessionRow(session))
  ].join("");
}

function renderActiveSessionRow(session, now) {
  const participants = session.participants || [];
  const score = participants.reduce((max, participant) => Math.max(max, Number(participant.telemetry?.score || 0)), 0);
  const band = participants.map((participant) => participant.telemetry?.acoustic || participant.signature).find(Boolean);
  return `
    <article class="session-row">
      <strong class="session-id" title="${escapeHtml(session.id)}">${escapeHtml(shortSessionId(session.id))}</strong>
      <span class="session-phase" data-phase="${escapeHtml(session.phase || "joining")}">${escapeHtml(i18n.t(session.phase || "joining"))}</span>
      <span>${escapeHtml(i18n.t("phonesCount", { count: participants.length }))}</span>
      <span>${escapeHtml(`${i18n.t("scoreLabel")} ${Math.round(score * 100)} · ${formatFrequency(band?.startFrequencyHz, band?.endFrequencyHz)}`)}</span>
      <span>${escapeHtml(formatSessionTiming(session, now))}</span>
      ${participants.map((participant) => renderActiveParticipant(participant)).join("")}
    </article>
  `;
}

function renderActiveParticipant(participant) {
  const name = participant.deviceName || participant.clientId || i18n.t("device");
  const slot = participantSlotLabel(participant);
  if (!participant.telemetry) {
    const capabilities = participant.acousticCapabilities || {};
    const sampleRate = Number(capabilities.sampleRate)
      ? `${Math.round(Number(capabilities.sampleRate) / 1000)} kHz`
      : i18n.t("unknown");
    const mic = `${i18n.t("micReady")} ${capabilities.microphoneReady ? i18n.t("yes") : i18n.t("no")}`;
    const detail = [name, `${i18n.t("slot")} ${slot}`, i18n.t("waiting"), sampleRate, mic].join(" · ");
    return `<small class="session-participant">${escapeHtml(detail)}</small>`;
  }
  const telemetry = participant.telemetry;
  const acoustic = telemetry.acoustic || {};
  const margin = Number.isFinite(Number(acoustic.marginDb)) ? `${formatNumber(acoustic.marginDb, 1)} dB` : i18n.t("unknown");
  const detail = [
    name,
    `${i18n.t("slot")} ${slot}`,
    acoustic.emitted ? i18n.t("emitted") : i18n.t("silent"),
    acoustic.detected ? i18n.t("heard") : i18n.t("missed"),
    margin,
    evidenceSummary(telemetry.physicalEvidence),
    i18n.t(telemetry.decision === "verified" ? "verified" : "insufficient")
  ].join(" · ");
  return `<small class="session-participant" data-decision="${escapeHtml(telemetry.decision || "")}">${escapeHtml(detail)}</small>`;
}

function renderRecentSessionRow(session) {
  return `
    <article class="session-row session-row--recent">
      <strong class="session-id" title="${escapeHtml(session.id)}">${escapeHtml(shortSessionId(session.id))}</strong>
      <span class="session-phase" data-phase="${escapeHtml(session.statusKey || "recent")}">${escapeHtml(session.result)}</span>
      <span>${escapeHtml(i18n.t("phonesCount", { count: session.participants.length }))}</span>
      <span>${escapeHtml(`${i18n.t("scoreLabel")} ${Math.round(session.score * 100)} · ${session.reason || session.method || i18n.t("recentSessions")}`)}</span>
      <span>${escapeHtml(formatClock(session.at))}</span>
      <small class="session-note">${escapeHtml(i18n.t("recentSessionCopy"))}</small>
      ${session.participants.map((participant) => {
        const detail = [
          participant.deviceName || participant.clientId || i18n.t("device"),
          `${i18n.t("slot")} ${participant.slotLabel}`,
          participant.emitted ? i18n.t("emitted") : i18n.t("silent"),
          participant.detected ? i18n.t("heard") : i18n.t("missed"),
          `corr ${formatNumber(participant.correlation, 2)}`,
          `peak ${formatNumber(participant.peak, 3)}`,
          participant.method || i18n.t("none")
        ].join(" · ");
        return `<small class="session-participant">${escapeHtml(detail)}</small>`;
      }).join("")}
    </article>
  `;
}

function evidenceSummary(evidence = {}) {
  const mark = (ok) => (ok ? "✓" : "✗");
  return `${i18n.t("evidenceLabel")} ${i18n.t("soundShort")}${mark(evidence.ultrasound)} ${i18n.t("bumpShort")}${mark(evidence.bump)} ${i18n.t("tiltShort")}${mark(evidence.tilt)}`;
}

function participantSlotLabel(participant) {
  const signatureSlot = Number(participant.signature?.slot);
  const acoustic = participant.telemetry?.acoustic || {};
  const acousticSlotCount = Number(acoustic.slotCount);
  if (Number.isFinite(signatureSlot) && signatureSlot > 0) {
    return acousticSlotCount ? `${signatureSlot}/${acousticSlotCount}` : String(signatureSlot);
  }
  if (Number.isFinite(Number(acoustic.slot))) {
    const slot = Number(acoustic.slot) + 1;
    return acousticSlotCount ? `${slot}/${acousticSlotCount}` : String(slot);
  }
  return "—";
}

function shortSessionId(id = "") {
  const text = String(id);
  return text.length <= 16 ? text : `${text.slice(0, 5)}…${text.slice(-6)}`;
}

function formatSessionTiming(session, now) {
  if (session.phase === "running") {
    const startAt = Number(session.startAt);
    const startedAge = Number.isFinite(startAt) ? formatAge(now - startAt, i18n.locale) : "";
    const remainingMs = Number(session.endsAt) - now;
    const ends = Number.isFinite(remainingMs)
      ? remainingMs > 0
        ? i18n.t("endsIn", { seconds: Math.ceil(remainingMs / 1000) })
        : i18n.t("completing")
      : "";
    return [startedAge && i18n.t("startedAgo", { age: startedAge }), ends].filter(Boolean).join(" · ");
  }
  const createdMs = Date.parse(session.createdAt);
  return Number.isFinite(createdMs)
    ? i18n.t("joinedAgo", { age: formatAge(now - createdMs, i18n.locale) })
    : i18n.t("joining");
}

function formatClock(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";
}

function recentSessionSummaries(activeSessions = []) {
  const activeIds = new Set(activeSessions.map((session) => session.id));
  const events = state.snapshot?.metrics?.recentEvents || [];
  const sessions = new Map();
  for (const event of events) {
    const detail = event.detail || {};
    const sessionId = detail.sessionId;
    if (!sessionId || activeIds.has(sessionId)) continue;
    const summary = sessions.get(sessionId) || {
      id: sessionId,
      at: event.at,
      result: i18n.t("recentSessions"),
      statusKey: "recent",
      reason: "",
      score: 0,
      method: "",
      participants: new Map()
    };
    summary.at = event.at || summary.at;
    if (event.type === "proximity:session:matched") {
      summary.result = i18n.t("verified");
      summary.statusKey = "verified";
      summary.score = Math.max(summary.score, Number(detail.score || 0));
    }
    if (event.type === "proximity:session:failed") {
      summary.result = i18n.t("failed");
      summary.statusKey = "failed";
      summary.reason = detail.reason || summary.reason;
      summary.score = Math.max(summary.score, Number(detail.score || 0));
      // A failed event may be the only record for a session that never reported
      // telemetry. Capture its device so the row is not misreported as 0 phones.
      if (detail.clientId && !summary.participants.has(detail.clientId)) {
        summary.participants.set(detail.clientId, {
          clientId: detail.clientId,
          deviceName: detail.deviceName || "",
          slotLabel: detail.acousticSlotCount
            ? `${Number(detail.acousticSlot || 0) + 1}/${detail.acousticSlotCount}`
            : String(Number(detail.acousticSlot || 0) + 1),
          emitted: Boolean(detail.acousticEmitted),
          detected: Boolean(detail.acousticDetected),
          correlation: Number(detail.acousticCorrelation || 0),
          peak: Number(detail.acousticRecordingPeak || 0),
          method: detail.acousticDetectionMethod || "",
          reason: detail.acousticReason || detail.reason || ""
        });
      }
    }
    if (event.type === "proximity:session:telemetry") {
      summary.score = Math.max(summary.score, Number(detail.score || 0));
      summary.method = detail.acousticDetectionMethod || summary.method;
      summary.participants.set(detail.clientId, {
        clientId: detail.clientId,
        deviceName: detail.deviceName || "",
        slotLabel: detail.acousticSlotCount
          ? `${Number(detail.acousticSlot || 0) + 1}/${detail.acousticSlotCount}`
          : String(Number(detail.acousticSlot || 0) + 1),
        emitted: Boolean(detail.acousticEmitted),
        detected: Boolean(detail.acousticDetected),
        correlation: Number(detail.acousticCorrelation || 0),
        peak: Number(detail.acousticRecordingPeak || 0),
        method: detail.acousticDetectionMethod || "",
        reason: detail.acousticReason || ""
      });
    }
    if (event.type === "proximity:session:diagnostic" && detail.clientId && !summary.participants.has(detail.clientId)) {
      summary.participants.set(detail.clientId, {
        clientId: detail.clientId,
        deviceName: detail.deviceName || "",
        slotLabel: detail.acoustic?.slotCount
          ? `${Number(detail.acoustic?.slot || 0)}/${detail.acoustic?.slotCount}`
          : String(Number(detail.acoustic?.slot || 0)),
        emitted: detail.acoustic?.mode === "emit",
        detected: detail.acoustic?.mode === "detected",
        correlation: Number(detail.acoustic?.correlation || 0),
        peak: 0,
        method: detail.acoustic?.detectionMethod || detail.acoustic?.mode || "",
        reason: detail.reason || ""
      });
    }
    sessions.set(sessionId, summary);
  }
  return [...sessions.values()]
    .map((session) => ({ ...session, participants: [...session.participants.values()] }))
    .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))
    .slice(0, 8);
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

function pruneDisconnectedDevices(devices) {
  if (!state.snapshot) return;
  const liveIds = new Set(devices.map((device) => device.id));
  for (const id of [...state.monitorTelemetryByDevice.keys()]) {
    if (!liveIds.has(id) && !state.activeMonitors.has(id)) {
      state.monitorTelemetryByDevice.delete(id);
    }
  }
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
  return Boolean(state.serverReachable && (state.readyz?.ok || state.snapshot?.generatedAt));
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function statusLabel(status) {
  if (status === "active" || status === "waiting" || status === "stopping" || status === "blocked" || status === "error") {
    return i18n.t(status);
  }
  if (status === "starting") return i18n.t("active");
  return i18n.t("idle");
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
  if (type === "proximity:session:matched") {
    const peers = Array.isArray(detail.clientIds) ? detail.clientIds.join(" + ") : i18n.t("verified");
    return `${peers} · ${i18n.t("scoreLabel")} ${Math.round(Number(detail.score || 0) * 100)}`;
  }
  if (type === "proximity:session:failed") {
    return `${detail.deviceName || detail.clientId || "device"} · ${detail.reason || i18n.t("failed")}`;
  }
  if (type === "proximity:session:telemetry") {
    return `${detail.deviceName || detail.clientId || "device"} · ${i18n.t("scoreLabel")} ${Math.round(Number(detail.score || 0) * 100)} · ${formatFrequency(detail.acousticStartFrequencyHz, detail.acousticEndFrequencyHz)}`;
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

function friendlyError(error) {
  const message = error?.message || String(error);
  if (message === "unauthorized") return i18n.t("diagnosticsProtected");
  if (message === "not_found") return i18n.t("diagnosticsMissing");
  if (message === "Failed to fetch") return i18n.t("diagnosticsUnreachable");
  return message;
}

function showError(message) {
  const node = $("[data-admin-error]");
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  globalThis.clearTimeout(state.errorTimer);
  state.errorTimer = globalThis.setTimeout(() => {
    node.hidden = true;
  }, 5000);
}
