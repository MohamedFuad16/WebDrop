const APP_VERSION = "1.0.40";
const CHUNK_SIZE = 256 * 1024;

const readinessItems = [
  {
    title: "Mobile UI and orbit UX",
    status: "Done",
    score: 92,
    checks: [
      "Orbital presence map and nearby overflow sheet",
      "Connected Venn avatar state and bottom actions",
      "Dynamic Island QR and connection ceremony UI"
    ]
  },
  {
    title: "Static frontend architecture",
    status: "Done",
    score: 88,
    checks: [
      "Vanilla HTML/CSS/JS modules",
      "Japanese and English locale support",
      "Service worker cache versioning"
    ]
  },
  {
    title: "Production signaling code",
    status: "Ready, endpoint check required",
    score: 82,
    checks: [
      "Azure WebSocket server package and local integration tests pass",
      "Presence, invites, RTC, chat and transfer metadata schemas",
      "nginx, Certbot, systemd and load-test assets"
    ]
  },
  {
    title: "TURN credential path",
    status: "Ready, external verification",
    score: 76,
    checks: [
      "Server-side Cloudflare TURN credential endpoint",
      "Frontend adapter requests temporary iceServers",
      "Long-lived TURN token stays off the frontend"
    ]
  },
  {
    title: "WebRTC transfer engine",
    status: "Ready, live",
    score: 82,
    checks: [
      "DataChannel control and file channels",
      "256 KiB chunks and backpressure model",
      "Path stats classify direct, relay or failed"
    ]
  },
  {
    title: "Deferred receive storage",
    status: "Ready, live",
    score: 84,
    checks: [
      "500 MB send and receive session caps",
      "IndexedDB keeps desktop chunks pending until Save",
      "iPhone and iPad Blob fallback waits for explicit Save"
    ]
  },
  {
    title: "Proximity ceremony",
    status: "Ready, disabled",
    score: 55,
    checks: [
      "QR token flow and scanner UI",
      "Web Audio chirp and motion capture modules",
      "Server policy can gate RTC and transfer metadata"
    ]
  },
  {
    title: "Production proof",
    status: "External verification",
    score: 42,
    checks: [
      "Configured WSS/TURN endpoint must remain reachable and healthy",
      "Needs physical iOS/Android calibration",
      "Needs direct and relay transfer proof"
    ]
  }
];

const blockers = [
  ["Verify Azure signaling availability", "The configured Japan East health, WSS and ICE endpoints must pass from the public app before launch.", "High"],
  ["Verify TURN credentials", "Confirm the server can issue temporary Cloudflare TURN credentials without exposing the long-lived token.", "High"],
  ["Calibrate proximity", "Test QR, microphone chirps, tilt and bump on physical iOS and Android devices.", "High"],
  ["Prove real transfer", "Run direct and TURN file transfers with cancellation, retry and storage exhaustion cases.", "High"],
  ["Load test signaling", "Ramp WebSocket load toward the 10,000-client target while watching nginx and Node limits.", "Medium"],
  ["Plan horizontal scale", "Add shared state such as Redis or sticky session routing before multi-node signaling.", "Medium"]
];

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

init();

function init() {
  $("[data-admin-version]").textContent = APP_VERSION;
  $("[data-admin-mode]").textContent = runtime.productionSignaling ? "Production" : "Mock";
  $("[data-admin-score]").textContent = `${Math.round(average(readinessItems.map((item) => item.score)))}%`;

  const wsUrl = $("[data-ws-url]");
  const httpBase = $("[data-http-base]");
  if (runtime.signalingUrl) wsUrl.value = runtime.signalingUrl;
  if (runtime.turnConfigUrl) httpBase.value = apiBaseFrom(runtime.turnConfigUrl);

  renderReadiness();
  renderBlockers();
  renderDevices();
  renderSessionFacts();
  renderTransferSummary();
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
  $("[data-readiness-grid]").innerHTML = readinessItems.map((item) => `
    <article class="admin-card">
      <div class="card-head">
        <h3>${escapeHtml(item.title)}</h3>
        <span class="item-status">${escapeHtml(item.status)}</span>
      </div>
      <div class="readiness-meter" aria-label="${escapeHtml(item.title)} ${item.score}% ready">
        <span style="width: ${item.score}%"></span>
      </div>
      <ul class="check-list">
        ${item.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join("")}
      </ul>
    </article>
  `).join("");
}

function renderBlockers() {
  $("[data-blocker-list]").innerHTML = blockers.map(([title, copy, priority]) => `
    <article class="blocker-card">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(copy)}</p>
      </div>
      <span class="item-status">${escapeHtml(priority)}</span>
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
  updateWsStatus("Connecting");
  const clientId = `admin-${safeRandomId()}`;
  try {
    socket = new WebSocket(url);
  } catch (error) {
    updateWsStatus("Invalid URL");
    appendLog(error.message);
    return;
  }
  socket.addEventListener("open", () => {
    updateWsStatus("Connected");
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
    updateWsStatus("Disconnected");
    adminState.session = null;
    renderSessionFacts();
    appendLog(`close ${event.code || 1000} ${event.reason || ""}`.trim());
  });
  socket.addEventListener("error", () => {
    updateWsStatus("Error");
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
  updateWsStatus("Disconnected");
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
  status.textContent = "Gathering";
  list.innerHTML = `<p class="empty-note">Gathering ICE candidates...</p>`;
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
    status.textContent = candidates.length ? `${candidates.length} found` : "None";
    renderCandidates(candidates);
  } catch (error) {
    status.textContent = "Failed";
    list.innerHTML = `<p class="empty-note">${escapeHtml(error.message)}</p>`;
  } finally {
    pc?.close();
  }
}

function renderCandidates(candidates) {
  const list = $("[data-candidate-list]");
  if (!candidates.length) {
    list.innerHTML = `<p class="empty-note">No candidates yet. Browsers may hide host IPs behind mDNS.</p>`;
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
    renderTransferSummary("Select files first.");
    return;
  }
  clearInterval(transferTimer);
  const transfer = adminState.transfer;
  transfer.startedAt = performance.now();
  transfer.transferredBytes = 0;
  $("[data-transfer-status]").textContent = "Running";
  transferTimer = setInterval(() => {
    const elapsed = Math.max(1, performance.now() - transfer.startedAt);
    const targetSpeed = 18 * 1024 * 1024;
    transfer.transferredBytes = Math.min(transfer.totalBytes, Math.round((elapsed / 1000) * targetSpeed));
    transfer.speedBytesPerSecond = transfer.transferredBytes / (elapsed / 1000);
    renderTransferSummary();
    if (transfer.transferredBytes >= transfer.totalBytes) {
      clearInterval(transferTimer);
      $("[data-transfer-status]").textContent = "Complete";
    }
  }, 120);
}

function resetTransfer() {
  clearInterval(transferTimer);
  selectedFiles = [];
  adminState.transfer = null;
  $("[data-file-input]").value = "";
  $("[data-transfer-status]").textContent = "Idle";
  renderTransferSummary();
}

function renderTransferSummary(message = "") {
  const transfer = adminState.transfer;
  const bar = $("[data-transfer-bar]");
  const summary = $("[data-transfer-summary]");
  if (!transfer?.files.length) {
    bar.style.width = "0%";
    summary.innerHTML = `<p class="empty-note">${escapeHtml(message || "No files selected yet.")}</p>`;
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
    table.innerHTML = `<p class="empty-note">No live signaling peers yet.</p>`;
    return;
  }
  table.innerHTML = adminState.peers.map((peer) => `
    <div class="device-row">
      <div>
        <strong>${escapeHtml(peer.name || peer.deviceName || peer.id || "Unknown device")}</strong>
        <small>${escapeHtml(peer.deviceFamily || peer.family || "unknown")} - ${escapeHtml(peer.id || "no id")}</small>
      </div>
      <span class="item-status">${escapeHtml(peer.online === false ? "Offline" : "Online")}</span>
    </div>
  `).join("");
}

function renderSessionFacts() {
  const session = adminState.session || {};
  $("[data-session-client]").textContent = session.id || "Not connected";
  $("[data-session-id]").textContent = session.sessionId || "Not connected";
  $("[data-session-turn-token]").textContent = session.turnAccessToken || "Not issued";
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
