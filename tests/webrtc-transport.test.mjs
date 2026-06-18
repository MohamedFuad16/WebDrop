import assert from "node:assert/strict";
import test from "node:test";
import { Emitter } from "../js/utils/emitter.js";
import { WebRtcTransport } from "../js/services/webrtc-transport.js";

test("responder reuses one peer connection when startup races an incoming offer", async () => {
  const originalPeerConnection = globalThis.RTCPeerConnection;
  const instances = [];
  let releaseIceServers;
  const iceServersReady = new Promise((resolve) => {
    releaseIceServers = resolve;
  });

  class FakePeerConnection extends EventTarget {
    constructor() {
      super();
      this.connectionState = "new";
      this.iceConnectionState = "new";
      this.localDescription = null;
      this.remoteDescription = null;
      instances.push(this);
    }

    async setRemoteDescription(description) {
      this.remoteDescription = description;
    }

    async createAnswer() {
      assert.equal(this.remoteDescription?.type, "offer");
      return { type: "answer", sdp: "v=0\r\na=mid:0\r\n" };
    }

    async setLocalDescription(description) {
      this.localDescription = description;
    }

    async addIceCandidate() {}

    close() {
      this.connectionState = "closed";
    }
  }

  const signaling = new Emitter();
  const sentSignals = [];
  signaling.sendRtcSignal = async (_peerId, signal) => {
    sentSignals.push(signal);
    return true;
  };
  const transport = new WebRtcTransport({
    signaling,
    enabled: true,
    turnConfig: {
      async getIceServers() {
        await iceServersReady;
        return [];
      }
    }
  });

  globalThis.RTCPeerConnection = FakePeerConnection;
  try {
    const responderStartup = transport.connect("peer-a", {
      pairingId: "pair-a",
      initiator: false
    });
    const incomingOffer = transport.handleSignal({
      peerId: "peer-a",
      pairingId: "pair-a",
      signal: {
        type: "offer",
        sdp: "v=0\r\na=mid:0\r\n"
      }
    });

    releaseIceServers();
    await Promise.all([responderStartup, incomingOffer]);

    assert.equal(instances.length, 1);
    assert.deepEqual(sentSignals, [
      { type: "answer", sdp: "v=0\r\na=mid:0\r\n" }
    ]);
  } finally {
    transport.close();
    globalThis.RTCPeerConnection = originalPeerConnection;
  }
});
