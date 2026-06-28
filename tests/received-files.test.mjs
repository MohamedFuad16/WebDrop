import assert from "node:assert/strict";
import test from "node:test";

import { isPreviewableReceivedItem } from "../js/utils/received-files.js";

test("previews trusted inline media types", () => {
  assert.equal(isPreviewableReceivedItem({ type: "image/png", name: "photo.png" }), true);
  assert.equal(isPreviewableReceivedItem({ type: "video/mp4", name: "clip.mp4" }), true);
  assert.equal(isPreviewableReceivedItem({ type: "application/pdf", name: "report.pdf" }), true);
});

test("falls back to a safe extension only when the type is unknown", () => {
  assert.equal(isPreviewableReceivedItem({ type: "", name: "photo.PNG" }), true);
  assert.equal(isPreviewableReceivedItem({ type: "application/octet-stream", name: "photo.png" }), true);
  assert.equal(isPreviewableReceivedItem({ type: "", name: "archive.zip" }), false);
});

test("never previews active or scriptable peer-declared content", () => {
  assert.equal(isPreviewableReceivedItem({ type: "image/svg+xml", name: "logo.svg" }), false);
  assert.equal(isPreviewableReceivedItem({ type: "image/svg+xml; charset=utf-8", name: "logo.png" }), false);
  assert.equal(isPreviewableReceivedItem({ type: "text/html", name: "exploit.png" }), false);
  assert.equal(isPreviewableReceivedItem({ type: "text/html;charset=utf-8", name: "report.pdf" }), false);
  assert.equal(isPreviewableReceivedItem({ type: "application/xhtml+xml", name: "x.png" }), false);
  assert.equal(isPreviewableReceivedItem({ type: "text/xml", name: "x.mp4" }), false);
});

test("tolerates missing metadata without throwing", () => {
  assert.equal(isPreviewableReceivedItem(), false);
  assert.equal(isPreviewableReceivedItem({}), false);
  assert.equal(isPreviewableReceivedItem({ downloadName: "photo.jpg" }), true);
});
