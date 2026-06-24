import { createOperationsI18n } from "./operations-i18n.js?v=1.0.72";

const APP_VERSION = "1.0.72";
const CHUNK_SIZE = 256 * 1024;

const ADMIN_MESSAGES = {
  en: {
    documentTitle: "WebDrop Admin",
    backToApp: "Back to app",
    openDiagnostics: "Open live diagnostics",
    language: "Language",
    adminKicker: "WebDrop Admin",
    heroTitle: "Production readiness and live testing",
    heroCopy: "A focused control room for launch status, device sessions, ICE paths, transfer manifests, and server checks.",
    adminStatusSummary: "Admin status summary",
    appVersion: "app version",
    runtimeMode: "runtime mode",
    launchReadiness: "launch readiness",
    adminSections: "Admin sections",
    readiness: "Readiness",
    liveTesting: "Live testing",
    doneKicker: "What is done",
    launchMap: "Launch map",
    leftKicker: "What is left",
    productionBlockers: "Production blockers",
    liveTracking: "Live tracking",
    liveTitle: "Devices, transfer, ICE, and server probes",
    signaling: "Signaling",
    websocketMonitor: "WebSocket session monitor",
    wssEndpoint: "WSS endpoint",
    clientName: "Client name",
    connect: "Connect",
    ping: "Ping",
    disconnect: "Disconnect",
    clientId: "Client id",
    sessionId: "Session id",
    turnAccessToken: "TURN access token",
    server: "Server",
    apiProbes: "API probes",
    httpBase: "HTTP base",
    bearerToken: "Bearer token",
    health: "Health",
    iceServers: "ICE servers",
    metrics: "Metrics",
    candidateLab: "Candidate lab",
    iceServerUrl: "ICE server URL",
    gatherCandidates: "Gather candidates",
    transfer: "Transfer",
    transferSimulator: "File manifest and speed simulator",
    selectTestFiles: "Select test files",
    selectTestFilesHelp: "Builds the same kind of manifest WebDrop sends before DataChannel chunks.",
    simulateTransfer: "Simulate transfer",
    reset: "Reset",
    production: "Production",
    mock: "Mock",
    done: "Done",
    readyCheck: "Ready, endpoint check required",
    readyExternal: "Ready, external verification",
    readyLive: "Ready, live",
    externalVerification: "External verification",
    high: "High",
    medium: "Medium",
    disconnected: "Disconnected",
    connecting: "Connecting",
    connected: "Connected",
    invalidUrl: "Invalid URL",
    error: "Error",
    gathering: "Gathering",
    failed: "Failed",
    idle: "Idle",
    running: "Running",
    complete: "Complete",
    notConnected: "Not connected",
    notIssued: "Not issued",
    noPeers: "No live signaling peers yet.",
    noCandidates: "No candidates yet. Browsers may hide host IPs behind mDNS.",
    gatheringCandidates: "Gathering ICE candidates...",
    noFiles: "No files selected yet.",
    selectFilesFirst: "Select files first.",
    online: "Online",
    offline: "Offline",
    none: "None",
    items: [
      ["Mobile UI and orbit UX", "done", 92, ["Orbital presence map and nearby overflow sheet", "Connected Venn avatar state and bottom actions", "Dynamic Island QR and connection ceremony UI"]],
      ["Static frontend architecture", "done", 88, ["Vanilla HTML/CSS/JS modules", "Japanese and English locale support", "Service worker cache versioning"]],
      ["Production signaling code", "readyCheck", 82, ["Azure WebSocket server package and local integration tests pass", "Presence, invites, RTC, chat and transfer metadata schemas", "nginx, Certbot, systemd and load-test assets"]],
      ["TURN credential path", "readyExternal", 76, ["Server-side Cloudflare TURN credential endpoint", "Frontend adapter requests temporary iceServers", "Long-lived TURN token stays off the frontend"]],
      ["WebRTC transfer engine", "readyLive", 82, ["DataChannel control and file channels", "256 KiB chunks and backpressure model", "Path stats classify direct, relay or failed"]],
      ["Deferred receive storage", "readyLive", 84, ["500 MB send and receive session caps", "IndexedDB keeps desktop chunks pending until Save", "iPhone and iPad Blob fallback waits for explicit Save"]],
      ["Proximity ceremony", "readyLive", 82, ["Peerless QR token flow and scanner UI", "Inaudible acoustic slot diagnostics", "Server policy gates RTC and transfer metadata"]],
      ["Production proof", "externalVerification", 42, ["Configured WSS/TURN endpoint must remain reachable and healthy", "Needs physical iOS/Android calibration", "Needs direct and relay transfer proof"]]
    ],
    blockers: [
      ["Verify Azure signaling availability", "The configured Japan East health, WSS and ICE endpoints must pass from the public app before launch.", "high"],
      ["Verify TURN credentials", "Confirm the server can issue temporary Cloudflare TURN credentials without exposing the long-lived token.", "high"],
      ["Calibrate proximity", "Test QR, microphone chirps, tilt and bump on physical iOS and Android devices.", "high"],
      ["Prove real transfer", "Run direct and TURN file transfers with cancellation, retry and storage exhaustion cases.", "high"],
      ["Load test signaling", "Ramp WebSocket load toward the 10,000-client target while watching nginx and Node limits.", "medium"],
      ["Plan horizontal scale", "Add shared state such as Redis or sticky session routing before multi-node signaling.", "medium"]
    ]
  },
  ja: {
    documentTitle: "WebDrop 管理",
    backToApp: "アプリに戻る",
    openDiagnostics: "ライブ診断を開く",
    language: "言語",
    adminKicker: "WebDrop 管理",
    heroTitle: "本番準備とライブテスト",
    heroCopy: "リリース状況、端末セッション、ICE 経路、転送マニフェスト、サーバー状態を確認するコントロールルームです。",
    adminStatusSummary: "管理ステータス概要",
    appVersion: "アプリバージョン",
    runtimeMode: "実行モード",
    launchReadiness: "リリース準備度",
    adminSections: "管理セクション",
    readiness: "準備状況",
    liveTesting: "ライブテスト",
    doneKicker: "完了済み",
    launchMap: "リリースマップ",
    leftKicker: "残りの項目",
    productionBlockers: "本番ブロッカー",
    liveTracking: "ライブ追跡",
    liveTitle: "端末、転送、ICE、サーバープローブ",
    signaling: "シグナリング",
    websocketMonitor: "WebSocket セッションモニター",
    wssEndpoint: "WSS エンドポイント",
    clientName: "クライアント名",
    connect: "接続",
    ping: "Ping",
    disconnect: "切断",
    clientId: "クライアント ID",
    sessionId: "セッション ID",
    turnAccessToken: "TURN アクセストークン",
    server: "サーバー",
    apiProbes: "API プローブ",
    httpBase: "HTTP ベース",
    bearerToken: "Bearer トークン",
    health: "ヘルス",
    iceServers: "ICE サーバー",
    metrics: "メトリクス",
    candidateLab: "候補経路ラボ",
    iceServerUrl: "ICE サーバー URL",
    gatherCandidates: "候補を収集",
    transfer: "転送",
    transferSimulator: "ファイルマニフェストと速度シミュレーター",
    selectTestFiles: "テストファイルを選択",
    selectTestFilesHelp: "DataChannel のチャンク送信前に WebDrop が作る形式と同じマニフェストを生成します。",
    simulateTransfer: "転送をシミュレート",
    reset: "リセット",
    production: "本番",
    mock: "モック",
    done: "完了",
    readyCheck: "準備済み、接続先確認が必要",
    readyExternal: "準備済み、外部確認が必要",
    readyLive: "準備済み、稼働中",
    externalVerification: "外部確認",
    high: "高",
    medium: "中",
    disconnected: "未接続",
    connecting: "接続中",
    connected: "接続済み",
    invalidUrl: "URL が無効",
    error: "エラー",
    gathering: "収集中",
    failed: "失敗",
    idle: "待機中",
    running: "実行中",
    complete: "完了",
    notConnected: "未接続",
    notIssued: "未発行",
    noPeers: "接続中のシグナリング端末はありません。",
    noCandidates: "候補はまだありません。ブラウザがホスト IP を mDNS で隠す場合があります。",
    gatheringCandidates: "ICE 候補を収集中...",
    noFiles: "ファイルはまだ選択されていません。",
    selectFilesFirst: "先にファイルを選択してください。",
    online: "オンライン",
    offline: "オフライン",
    none: "なし",
    items: [
      ["モバイル UI とオービット UX", "done", 92, ["オービット型の在席マップと近接端末一覧", "接続時の重なりアバターと下部アクション", "Dynamic Island の QR と接続セレモニー UI"]],
      ["静的フロントエンド構成", "done", 88, ["Vanilla HTML/CSS/JS モジュール", "日本語と英語の切り替え", "Service Worker のキャッシュバージョン管理"]],
      ["本番シグナリング", "readyCheck", 82, ["Azure WebSocket サーバーとローカル統合テスト", "在席、RTC、チャット、転送メタデータのスキーマ", "nginx、Certbot、systemd、負荷試験アセット"]],
      ["TURN 認証経路", "readyExternal", 76, ["サーバー側 Cloudflare TURN 認証エンドポイント", "フロントエンドが一時的な iceServers を取得", "長期 TURN トークンをフロントエンドに置かない"]],
      ["WebRTC 転送エンジン", "readyLive", 82, ["DataChannel の制御・ファイルチャンネル", "256 KiB チャンクとバックプレッシャー", "直接・リレー・失敗の経路分類"]],
      ["遅延受信ストレージ", "readyLive", 84, ["送受信セッション上限 500 MB", "保存まで IndexedDB にデスクトップチャンクを保持", "iPhone/iPad は明示的な保存まで Blob を保持"]],
      ["近接セレモニー", "readyLive", 82, ["相手未選択の QR トークンとスキャナー", "非可聴帯域の音響スロット診断", "サーバーポリシーで RTC と転送を制御"]],
      ["本番実証", "externalVerification", 42, ["WSS/TURN エンドポイントの継続的な到達性確認", "実機 iOS/Android の調整", "直接転送と TURN 転送の実証"]]
    ],
    blockers: [
      ["Azure シグナリングを確認", "Japan East のヘルス、WSS、ICE エンドポイントを公開アプリから確認します。", "high"],
      ["TURN 認証情報を確認", "長期トークンを公開せず、一時的な Cloudflare TURN 認証を発行できることを確認します。", "high"],
      ["近接検出を調整", "実機 iOS/Android で QR、マイクチャープ、傾き、バンプを検証します。", "high"],
      ["実転送を実証", "直接・TURN 転送でキャンセル、再試行、容量不足ケースを実行します。", "high"],
      ["シグナリング負荷試験", "nginx と Node の制限を監視しながら 10,000 クライアント目標へ段階的に増やします。", "medium"],
      ["水平スケールを計画", "複数ノード化の前に Redis などの共有状態またはスティッキーセッションを追加します。", "medium"]
    ]
  }
};

let socket = null;
let transferTimer = 0;
let selectedFiles = [];

const $ = (selector) => document.querySelector(selector);

const runtime = globalThis.WEBDROP_RUNTIME_CONFIG || {};
const adminState = {
  events: [],
  peers: [],
  transfer: null,
  session: null
};
const i18n = createOperationsI18n(ADMIN_MESSAGES, {
  onChange: () => {
    renderReadiness();
    renderBlockers();
    renderDevices();
    renderSessionFacts();
    renderTransferSummary();
    if (!socket || socket.readyState !== WebSocket.OPEN) updateWsStatus(i18n.t("disconnected"));
    if (!transferTimer) $("[data-transfer-status]").textContent = i18n.t("idle");
    if (!$("[data-candidate-list] .candidate-row")) $("[data-ice-status]").textContent = i18n.t("idle");
  }
});

init();

function init() {
  $("[data-admin-version]").textContent = APP_VERSION;
  $("[data-admin-mode]").textContent = runtime.productionSignaling ? i18n.t("production") : i18n.t("mock");
  $("[data-admin-score]").textContent = `${Math.round(average(i18n.t("items").map((item) => item[2])))}%`;

  const wsUrl = $("[data-ws-url]");
  const httpBase = $("[data-http-base]");
  if (runtime.signalingUrl) wsUrl.value = runtime.signalingUrl;
  if (runtime.turnConfigUrl) httpBase.value = apiBaseFrom(runtime.turnConfigUrl);

  renderReadiness();
  renderBlockers();
  renderDevices();
  renderSessionFacts();
  renderTransferSummary();
  updateWsStatus(i18n.t("disconnected"));
  $("[data-ice-status]").textContent = i18n.t("idle");
  $("[data-transfer-status]").textContent = i18n.t("idle");
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.adminTab));
  });
  $("[data-action='ws-connect']").addEventListener("click", connectWebSocket);
  $("[data-action='ws-ping']").addEventListener("click", sendPing);
  $("[data-action='ws-disconnect']").addEventListener("click", disconnectWebSocket);
  $("[data-action='probe-health']").addEventListener("click", () => probeApi("/healthz"));
  $("[data-action='probe-ready']").addEventListener("click", () => probeApi("/readyz"));
  $("[data-action='probe-ice']").addEventListener("click", () => probeApi("/api/ice-servers"));
  $("[data-action='probe-metrics']").addEventListener("click", () => probeApi("/api/metrics-summary"));
  $("[data-action='ice-gather']").addEventListener("click", gatherIceCandidates);
  $("[data-action='simulate-transfer']").addEventListener("click", simulateTransfer);
  $("[data-action='reset-transfer']").addEventListener("click", resetTransfer);
  $("[data-file-input]").addEventListener("change", (event) => {
    selectedFiles = [...event.target.files];
    adminState.transfer = buildTransferManifest(selectedFiles);
    renderTransferSummary();
  });
}

function activateTab(name) {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminTab === name);
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.adminPanel === name);
  });
}

function renderReadiness() {
  $("[data-readiness-grid]").innerHTML = i18n.t("items").map(([title, status, score, checks]) => `
    <article class="admin-card">
      <div class="card-head">
        <h3>${escapeHtml(title)}</h3>
        <span class="item-status">${escapeHtml(i18n.t(status))}</span>
      </div>
      <div class="readiness-meter" aria-label="${escapeHtml(title)} ${score}%">
        <span style="width: ${score}%"></span>
      </div>
      <ul class="check-list">
        ${checks.map((check) => `<li>${escapeHtml(check)}</li>`).join("")}
      </ul>
    </article>
  `).join("");
}

function renderBlockers() {
  $("[data-blocker-list]").innerHTML = i18n.t("blockers").map(([title, copy, priority]) => `
    <article class="blocker-card">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(copy)}</p>
      </div>
      <span class="item-status">${escapeHtml(i18n.t(priority))}</span>
    </article>
  `).join("");
}

function connectWebSocket() {
  const url = $("[data-ws-url]").value.trim();
  if (!url) {
    appendLog("wss endpoint missing");
    return;
  }
  disconnectWebSocket();
  updateWsStatus(i18n.t("connecting"));
  const clientId = `admin-${safeRandomId()}`;
  try {
    socket = new WebSocket(url);
  } catch (error) {
    updateWsStatus(i18n.t("invalidUrl"));
    appendLog(error.message);
    return;
  }
  socket.addEventListener("open", () => {
    updateWsStatus(i18n.t("connected"));
    appendLog(`open ${url}`);
    socket.send(JSON.stringify({
      type: "client:hello",
      payload: {
        self: {
          id: clientId,
          deviceName: $("[data-client-name]").value || "Admin Test Device",
          avatarId: "admin",
          ringColor: "#347ff6"
        },
        capabilities: {
          admin: true,
          version: APP_VERSION,
          camera: false,
          qrScanner: false,
          webRtc: hasWebRtc(),
          platform: {
            family: "admin",
            isIOS: false,
            isIPhone: false,
            dynamicIslandCapable: false
          }
        }
      }
    }));
  });
  socket.addEventListener("message", (event) => handleSocketMessage(event.data));
  socket.addEventListener("close", (event) => {
    updateWsStatus(i18n.t("disconnected"));
    adminState.session = null;
    renderSessionFacts();
    appendLog(`close ${event.code || 1000} ${event.reason || ""}`.trim());
  });
  socket.addEventListener("error", () => {
    updateWsStatus(i18n.t("error"));
    appendLog("websocket error");
  });
}

function sendPing() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    appendLog("ping skipped: websocket is not open");
    return;
  }
  socket.send(JSON.stringify({ type: "client:ping", now: new Date().toISOString() }));
  appendLog("sent client:ping");
}

function disconnectWebSocket() {
  if (socket) socket.close(1000, "admin_disconnect");
  socket = null;
  adminState.session = null;
  renderSessionFacts();
  updateWsStatus(i18n.t("disconnected"));
}

function handleSocketMessage(raw) {
  appendLog(`recv ${truncate(raw, 900)}`);
  try {
    const message = JSON.parse(raw);
    if (message.type === "connected" && message.payload) {
      adminState.session = message.payload;
      renderSessionFacts();
      if (message.payload.turnAccessToken && !$("[data-bearer-token]").value) {
        $("[data-bearer-token]").value = message.payload.turnAccessToken;
      }
    }
    if (message.type === "peers" && Array.isArray(message.payload)) {
      adminState.peers = message.payload;
      renderDevices();
    }
    if (Array.isArray(message.peers)) {
      adminState.peers = message.peers;
      renderDevices();
    }
  } catch {
    appendLog("non-json websocket payload");
  }
}

async function probeApi(path) {
  const base = $("[data-http-base]").value.trim().replace(/\/$/, "");
  if (!base) {
    writeApi({ error: "HTTP base URL is required." });
    return;
  }
  const headers = {};
  const token = $("[data-bearer-token]").value.trim();
  if (token && !["/healthz", "/readyz"].includes(path)) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const url = path === "/api/ice-servers"
      ? `${base}${path}?clientId=${encodeURIComponent(adminState.session?.id || `admin-${Date.now()}`)}`
      : `${base}${path}`;
    const response = await fetch(url, { headers, cache: "no-store" });
    const text = await response.text();
    writeApi({
      url,
      status: response.status,
      body: safeJson(text)
    });
  } catch (error) {
    writeApi({ error: error.message });
  }
}

async function gatherIceCandidates() {
  const list = $("[data-candidate-list]");
  const status = $("[data-ice-status]");
  const iceUrl = $("[data-ice-url]").value.trim();
  const candidates = [];
  status.textContent = i18n.t("gathering");
  list.innerHTML = `<p class="empty-note">${escapeHtml(i18n.t("gatheringCandidates"))}</p>`;
  let pc;
  try {
    const iceServers = iceUrl ? [{ urls: iceUrl }] : [];
    pc = new RTCPeerConnection({ iceServers });
    pc.createDataChannel("webdrop-admin-probe");
    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate?.candidate) {
        candidates.push(parseCandidate(event.candidate.candidate));
        renderCandidates(candidates);
      }
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceComplete(pc, 7000);
    status.textContent = candidates.length ? String(candidates.length) : i18n.t("none");
    renderCandidates(candidates);
  } catch (error) {
    status.textContent = i18n.t("failed");
    list.innerHTML = `<p class="empty-note">${escapeHtml(error.message)}</p>`;
  } finally {
    pc?.close();
  }
}

function renderCandidates(candidates) {
  const list = $("[data-candidate-list]");
  if (!candidates.length) {
    list.innerHTML = `<p class="empty-note">${escapeHtml(i18n.t("noCandidates"))}</p>`;
    return;
  }
  list.innerHTML = candidates.map((candidate) => `
    <div class="candidate-row">
      <div>
        <strong>${escapeHtml(candidate.type.toUpperCase())} ${escapeHtml(candidate.protocol)}</strong>
        <small>${escapeHtml(candidate.address)}:${escapeHtml(candidate.port)} - ${escapeHtml(candidate.family)}</small>
      </div>
      <span class="item-status">${escapeHtml(candidate.route)}</span>
    </div>
  `).join("");
}

function buildTransferManifest(files) {
  const fileEntries = files.map((file, index) => ({
    id: `file-${index + 1}`,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    chunks: Math.ceil(file.size / CHUNK_SIZE)
  }));
  return {
    transferId: `admin-transfer-${Date.now()}`,
    chunkSize: CHUNK_SIZE,
    totalBytes: fileEntries.reduce((sum, file) => sum + file.size, 0),
    transferredBytes: 0,
    files: fileEntries,
    startedAt: 0,
    speedBytesPerSecond: 0
  };
}

function simulateTransfer() {
  if (!adminState.transfer?.files.length) {
    adminState.transfer = buildTransferManifest([]);
    renderTransferSummary(i18n.t("selectFilesFirst"));
    return;
  }
  clearInterval(transferTimer);
  const transfer = adminState.transfer;
  transfer.startedAt = performance.now();
  transfer.transferredBytes = 0;
  $("[data-transfer-status]").textContent = i18n.t("running");
  transferTimer = setInterval(() => {
    const elapsed = Math.max(1, performance.now() - transfer.startedAt);
    const targetSpeed = 18 * 1024 * 1024;
    transfer.transferredBytes = Math.min(transfer.totalBytes, Math.round((elapsed / 1000) * targetSpeed));
    transfer.speedBytesPerSecond = transfer.transferredBytes / (elapsed / 1000);
    renderTransferSummary();
    if (transfer.transferredBytes >= transfer.totalBytes) {
      clearInterval(transferTimer);
      $("[data-transfer-status]").textContent = i18n.t("complete");
    }
  }, 120);
}

function resetTransfer() {
  clearInterval(transferTimer);
  selectedFiles = [];
  adminState.transfer = null;
  $("[data-file-input]").value = "";
  $("[data-transfer-status]").textContent = i18n.t("idle");
  renderTransferSummary();
}

function renderTransferSummary(message = "") {
  const transfer = adminState.transfer;
  const bar = $("[data-transfer-bar]");
  const summary = $("[data-transfer-summary]");
  if (!transfer?.files.length) {
    bar.style.width = "0%";
    summary.innerHTML = `<p class="empty-note">${escapeHtml(message || i18n.t("noFiles"))}</p>`;
    return;
  }
  const percent = transfer.totalBytes ? Math.round((transfer.transferredBytes / transfer.totalBytes) * 100) : 0;
  bar.style.width = `${percent}%`;
  summary.innerHTML = `
    <div class="transfer-row">
      <div>
        <strong>${escapeHtml(transfer.files.length)} files - ${formatBytes(transfer.totalBytes)}</strong>
        <small>${escapeHtml(transfer.transferId)} - ${formatBytes(transfer.speedBytesPerSecond || 0)}/s - ${percent}%</small>
      </div>
      <span class="item-status">${transfer.chunkSize / 1024} KiB chunks</span>
    </div>
    ${transfer.files.map((file) => `
      <div class="transfer-row">
        <div>
          <strong>${escapeHtml(file.name)}</strong>
          <small>${escapeHtml(file.type)} - ${formatBytes(file.size)}</small>
        </div>
        <span class="item-status">${file.chunks} chunks</span>
      </div>
    `).join("")}
  `;
}

function renderDevices() {
  const table = $("[data-device-table]");
  if (!adminState.peers.length) {
    table.innerHTML = `<p class="empty-note">${escapeHtml(i18n.t("noPeers"))}</p>`;
    return;
  }
  table.innerHTML = adminState.peers.map((peer) => `
    <div class="device-row">
      <div>
        <strong>${escapeHtml(peer.name || peer.deviceName || peer.id || "Unknown device")}</strong>
        <small>${escapeHtml(peer.deviceFamily || peer.family || "unknown")} - ${escapeHtml(peer.id || "no id")}</small>
      </div>
      <span class="item-status">${escapeHtml(peer.online === false ? i18n.t("offline") : i18n.t("online"))}</span>
    </div>
  `).join("");
}

function renderSessionFacts() {
  const session = adminState.session || {};
  $("[data-session-client]").textContent = session.id || i18n.t("notConnected");
  $("[data-session-id]").textContent = session.sessionId || i18n.t("notConnected");
  $("[data-session-turn-token]").textContent = session.turnAccessToken || i18n.t("notIssued");
}

function appendLog(line) {
  adminState.events.unshift(`[${new Date().toLocaleTimeString()}] ${redactSensitive(line)}`);
  adminState.events = adminState.events.slice(0, 60);
  $("[data-ws-log]").textContent = adminState.events.join("\n");
}

function updateWsStatus(status) {
  $("[data-ws-status]").textContent = status;
}

function writeApi(value) {
  $("[data-api-output]").textContent = JSON.stringify(value, null, 2);
}

function parseCandidate(candidate) {
  const parts = candidate.trim().split(/\s+/);
  const protocol = parts[2] || "unknown";
  const address = parts[4] || "hidden";
  const port = parts[5] || "0";
  const typeIndex = parts.indexOf("typ");
  const type = typeIndex >= 0 ? parts[typeIndex + 1] : "unknown";
  return {
    protocol,
    address,
    port,
    type,
    family: ipFamily(address),
    route: type === "relay" ? "TURN relay" : type === "srflx" ? "Server reflexive" : type === "host" ? "Local host" : "Unknown"
  };
}

function waitForIceComplete(pc, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const done = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", done);
    done();
  });
}

function ipFamily(address) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return "IPv4";
  if (address.includes(":")) return "IPv6";
  if (address.endsWith(".local")) return "mDNS host";
  return "Hidden";
}

function apiBaseFrom(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function safeRandomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    return [...values].map((value) => value.toString(16).padStart(8, "0")).join("");
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasWebRtc() {
  return typeof RTCPeerConnection === "function";
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function redactSensitive(value) {
  return String(value)
    .replace(/("turnAccessToken"\s*:\s*")[^"]+(")/g, "$1[redacted]$2")
    .replace(/("credential"\s*:\s*")[^"]+(")/g, "$1[redacted]$2")
    .replace(/("password"\s*:\s*")[^"]+(")/g, "$1[redacted]$2");
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let amount = bytes / 1024;
  let unit = units.shift();
  while (amount >= 1024 && units.length) {
    amount /= 1024;
    unit = units.shift();
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${unit}`;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function truncate(value, maxLength) {
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
