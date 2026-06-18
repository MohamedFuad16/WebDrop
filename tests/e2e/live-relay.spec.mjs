import { expect, test } from "@playwright/test";
import WebSocket from "ws";

const BASE_URL = process.env.WEBDROP_SIGNALING_BASE_URL || "http://127.0.0.1:8080";
const WS_URL = process.env.WEBDROP_SIGNALING_WS_URL || "ws://127.0.0.1:8080/ws";
const ORIGIN = process.env.WEBDROP_SIGNALING_ORIGIN || "http://127.0.0.1:4180";

test("live Cloudflare TURN relay carries bidirectional DataChannel bytes", async ({ page }, testInfo) => {
  test.skip(
    !["chromium-desktop", "webkit-iphone-15-pro"].includes(testInfo.project.name),
    "Run the live relay proof once per supported browser engine."
  );

  const { iceServers, relayPolicy } = await getLiveIceServers();
  expect(Array.isArray(iceServers)).toBe(true);
  expect(iceServers.length).toBeGreaterThan(0);
  expect(relayPolicy.relayLimitBytes).toBe(500 * 1024 * 1024);

  await page.goto("/?qa=e2e-live-relay", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(runForcedRelayTransfer, { iceServers });

  expect(result.receivedByA).toBe(384 * 1024);
  expect(result.receivedByB).toBe(512 * 1024);
  expect(result.messagesA).toBe(2);
  expect(result.messagesB).toBe(2);
  expect(result.path).toBe("relay");
  expect(result.localCandidateType === "relay" || result.remoteCandidateType === "relay").toBe(true);
});

async function getLiveIceServers() {
  const suffix = Date.now().toString(36);
  const clientId = `pw-relay-${suffix}`;
  const socket = await connectSignaling(clientId);
  const connected = await waitForMessage(socket.messages, (message) => message.type === "connected", "connected");
  const token = connected.payload?.turnAccessToken;
  if (!token) throw new Error("Live signaling did not return a TURN access token.");

  const response = await fetch(`${BASE_URL}/api/ice-servers?clientId=${encodeURIComponent(clientId)}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Origin": ORIGIN,
      "Accept": "application/json"
    }
  });
  const body = await response.json();
  socket.ws.close();
  if (!response.ok) throw new Error(`ICE server request failed with ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function connectSignaling(clientId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { headers: { Origin: ORIGIN } });
    const messages = [];
    const timeout = setTimeout(() => reject(new Error("Timed out connecting to live signaling.")), 10_000);
    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "client:hello",
        payload: {
          self: { id: clientId, deviceName: "Playwright Relay Test", avatarId: "user-01" },
          capabilities: { dataChannel: true, relayTest: true }
        }
      }));
    });
    ws.on("message", (data) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.some((message) => message.type === "connected")) {
        clearTimeout(timeout);
        resolve({ ws, messages });
      }
    });
    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForMessage(messages, predicate, label, timeoutMs = 10_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const found = messages.find(predicate);
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${label}. Saw: ${messages.map((message) => message.type).join(", ")}`));
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

async function runForcedRelayTransfer({ iceServers }) {
  const makeDeferred = (timeoutMs, message) => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    return {
      promise: promise.finally(() => clearTimeout(timeout)),
      resolve,
      reject
    };
  };
  const waitForOpenInPage = (channel) => {
    if (channel.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("DataChannel did not open.")), 20_000);
      channel.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  };
  const waitUntilInPage = (predicate, message) => {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (predicate()) {
          resolve();
          return;
        }
        if (Date.now() - startedAt > 20_000) {
          reject(new Error(message));
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  };
  const sendChunksInPage = async (channel, totalBytes, chunkBytes, seed) => {
    for (let offset = 0; offset < totalBytes; offset += chunkBytes) {
      const size = Math.min(chunkBytes, totalBytes - offset);
      const chunk = new Uint8Array(size);
      chunk.fill((seed + offset / chunkBytes) % 255);
      if (channel.bufferedAmount > 4 * 1024 * 1024) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Timed out waiting for DataChannel buffer.")), 10_000);
          channel.bufferedAmountLowThreshold = 1024 * 1024;
          channel.onbufferedamountlow = () => {
            clearTimeout(timeout);
            channel.onbufferedamountlow = null;
            resolve();
          };
        });
      }
      channel.send(chunk);
    }
  };
  const getPathStatsInPage = async (peerConnection) => {
    const stats = await peerConnection.getStats();
    let selectedPair = null;
    for (const report of stats.values()) {
      if (report.type === "transport" && report.selectedCandidatePairId) {
        selectedPair = stats.get(report.selectedCandidatePairId);
      }
      if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
        selectedPair = report;
      }
    }
    const localCandidate = selectedPair ? stats.get(selectedPair.localCandidateId) : null;
    const remoteCandidate = selectedPair ? stats.get(selectedPair.remoteCandidateId) : null;
    const localCandidateType = localCandidate?.candidateType || "unknown";
    const remoteCandidateType = remoteCandidate?.candidateType || "unknown";
    return {
      path: localCandidateType === "relay" || remoteCandidateType === "relay" ? "relay" : "direct",
      localCandidateType,
      remoteCandidateType,
      localProtocol: localCandidate?.protocol || null,
      remoteProtocol: remoteCandidate?.protocol || null,
      currentRoundTripTime: selectedPair?.currentRoundTripTime ?? null
    };
  };
  const pcA = new RTCPeerConnection({ iceServers, iceTransportPolicy: "relay" });
  const pcB = new RTCPeerConnection({ iceServers, iceTransportPolicy: "relay" });
  const cleanup = () => {
    pcA.close();
    pcB.close();
  };

  pcA.onicecandidate = (event) => {
    if (event.candidate) pcB.addIceCandidate(event.candidate).catch(() => {});
  };
  pcB.onicecandidate = (event) => {
    if (event.candidate) pcA.addIceCandidate(event.candidate).catch(() => {});
  };

  const channelA = pcA.createDataChannel("webdrop-file-v1", { ordered: true });
  let channelB;
  const received = { a: 0, b: 0, messagesA: 0, messagesB: 0 };
  const doneA = makeDeferred(20_000, "A did not receive all relay bytes.");
  const doneB = makeDeferred(20_000, "B did not receive all relay bytes.");

  channelA.binaryType = "arraybuffer";
  channelA.onmessage = (event) => {
    received.a += event.data.byteLength || 0;
    received.messagesA += 1;
    if (received.a === 384 * 1024) doneA.resolve();
  };
  pcB.ondatachannel = (event) => {
    channelB = event.channel;
    channelB.binaryType = "arraybuffer";
    channelB.onmessage = (messageEvent) => {
      received.b += messageEvent.data.byteLength || 0;
      received.messagesB += 1;
      if (received.b === 512 * 1024) doneB.resolve();
    };
  };

  const offer = await pcA.createOffer();
  await pcA.setLocalDescription(offer);
  await pcB.setRemoteDescription(offer);
  const answer = await pcB.createAnswer();
  await pcB.setLocalDescription(answer);
  await pcA.setRemoteDescription(answer);

  await waitForOpenInPage(channelA);
  await waitUntilInPage(() => channelB?.readyState === "open", "Relay peer channel did not open.");

  await Promise.all([
    sendChunksInPage(channelA, 512 * 1024, 256 * 1024, 17),
    sendChunksInPage(channelB, 384 * 1024, 256 * 1024, 29),
    doneA.promise,
    doneB.promise
  ]);

  const stats = await getPathStatsInPage(pcA);
  cleanup();
  return {
    receivedByA: received.a,
    receivedByB: received.b,
    messagesA: received.messagesA,
    messagesB: received.messagesB,
    ...stats
  };
}
