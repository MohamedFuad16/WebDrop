import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_ICE_CANDIDATE_LENGTH,
  MAX_SDP_LENGTH,
  MAX_TRANSFER_CHUNK_SIZE_BYTES,
  MAX_TRANSFER_TOTAL_BYTES,
  validateRoutedMessage
} from "../src/message-schema.js";

test("rejects oversized SDP and ICE candidate fields instead of truncating them", () => {
  assert.throws(
    () => validateRoutedMessage({
      type: "rtc:signal",
      targetId: "peer-a",
      signal: { type: "offer", sdp: `v=${"0".repeat(MAX_SDP_LENGTH + 1)}` }
    }),
    { code: "sdp_too_large" }
  );

  assert.throws(
    () => validateRoutedMessage({
      type: "rtc:signal",
      targetId: "peer-a",
      signal: {
        type: "candidate",
        candidate: { candidate: `candidate:${"x".repeat(MAX_ICE_CANDIDATE_LENGTH + 1)}` }
      }
    }),
    { code: "candidate_too_large" }
  );
});

test("rejects transfer manifests beyond control-plane size limits", () => {
  assert.throws(
    () => validateRoutedMessage({
      type: "transfer:manifest",
      targetId: "peer-a",
      payload: {
        transferId: "huge-transfer",
        totalBytes: MAX_TRANSFER_TOTAL_BYTES + 1,
        chunkSize: 65536,
        files: [{ id: "f", name: "huge.bin", size: MAX_TRANSFER_TOTAL_BYTES + 1, chunks: 1 }]
      }
    }),
    { code: "manifest_too_large" }
  );

  assert.throws(
    () => validateRoutedMessage({
      type: "transfer:manifest",
      targetId: "peer-a",
      payload: {
        transferId: "bad-chunk",
        totalBytes: 1,
        chunkSize: MAX_TRANSFER_CHUNK_SIZE_BYTES + 1,
        files: [{ id: "f", name: "one.bin", size: 1, chunks: 1 }]
      }
    }),
    { code: "invalid_chunk_size" }
  );
});
