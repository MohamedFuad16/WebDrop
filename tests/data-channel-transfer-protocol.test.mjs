import assert from "node:assert/strict";
import { test } from "node:test";
import { DataChannelTransferProtocol, DATA_CHANNEL_LABELS } from "../js/services/data-channel-transfer-protocol.js";

class FakeChannel extends EventTarget {
  constructor(label) {
    super();
    this.label = label;
    this.readyState = "open";
    this.bufferedAmount = 0;
    this.binaryType = "blob";
    this.sent = [];
  }

  send(data) {
    this.sent.push(typeof data === "string" ? JSON.parse(data) : data);
  }

  deliver(data) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeManifest() {
  return {
    id: "tx-1",
    totalBytes: 4,
    files: [
      {
        id: "f1",
        name: "hello.txt",
        size: 4,
        sha256: "a".repeat(64)
      }
    ]
  };
}

test("a duplicate transfer:manifest re-acks without resetting an in-progress receive", async () => {
  const control = new FakeChannel(DATA_CHANNEL_LABELS.control);
  const protocol = new DataChannelTransferProtocol({ controlChannel: control });

  control.deliver({ type: "transfer:manifest", manifest: makeManifest() });
  await flush();

  const acksAfterFirst = control.sent.filter((m) => m.type === "transfer:ack" && m.stage === "manifest");
  assert.equal(acksAfterFirst.length, 1, "first manifest is acked once");

  // Simulate mid-transfer progress the duplicate must not clobber.
  const state = protocol.incoming.get("tx-1");
  state.receivedBytes = 3;
  state.fileOffsets.set("f1", 3);

  control.deliver({ type: "transfer:manifest", manifest: makeManifest() });
  await flush();

  const allManifestAcks = control.sent.filter((m) => m.type === "transfer:ack" && m.stage === "manifest");
  assert.equal(allManifestAcks.length, 2, "duplicate manifest is re-acked (recovers a lost ack)");

  const stateAfter = protocol.incoming.get("tx-1");
  assert.equal(stateAfter, state, "receive state object is preserved, not replaced");
  assert.equal(stateAfter.receivedBytes, 3, "progress is not reset to zero");
  assert.equal(stateAfter.fileOffsets.get("f1"), 3, "per-file offsets are preserved");
});
