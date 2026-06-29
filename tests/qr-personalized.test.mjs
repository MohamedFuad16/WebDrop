import test from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import qrcode from "../js/vendor/qrcode-generator.mjs";

/**
 * Guards the personalised connection QR (DynamicIsland.drawQr): it renders at
 * error-correction level "H" and punches a rounded white knockout in the centre
 * for the user's avatar badge. This test reproduces that geometry into an RGBA
 * buffer and confirms jsQR still decodes the exact token, i.e. the avatar never
 * breaks scannability. Mirrors the runtime: badge ≈ 24% of the code, knockout =
 * badge + ~1.4 modules of padding.
 */

const QUIET = 4; // quiet-zone modules around the code
const CELL = 10; // px per module in the test raster

function renderWithCentreBadge(token, { badgeFraction = 0.24, badgePadModules = 1.4 } = {}) {
  const qr = qrcode(0, "H");
  qr.addData(token);
  qr.make();
  const count = qr.getModuleCount();
  const dim = (count + QUIET * 2) * CELL;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255); // white RGBA

  const paint = (px, py, value) => {
    const idx = (py * dim + px) * 4;
    data[idx] = value;
    data[idx + 1] = value;
    data[idx + 2] = value;
    data[idx + 3] = 255;
  };

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      const x0 = (QUIET + col) * CELL;
      const y0 = (QUIET + row) * CELL;
      for (let y = y0; y < y0 + CELL; y += 1) {
        for (let x = x0; x < x0 + CELL; x += 1) paint(x, y, 0);
      }
    }
  }

  // Centre knockout (worst case: all covered modules treated as lost data).
  const knockoutPx = (badgeFraction * count + badgePadModules) * CELL;
  const centre = dim / 2;
  const start = Math.round(centre - knockoutPx / 2);
  const end = Math.round(centre + knockoutPx / 2);
  for (let y = start; y < end; y += 1) {
    for (let x = start; x < end; x += 1) paint(x, y, 255);
  }

  return { data, dim, count };
}

const tokens = [
  "wdp1.eyJ2IjoxLCJzaWQiOiJzZXNzLTEyMyIsInBlZXIiOiJkZXZpY2UtMDA3IiwiZXhwIjoxNzE5NzIwMDAwfQ.c2lnbmF0dXJlLXBsYWNlaG9sZGVyLXh5eg",
  `wdp1.${"a1B2c3D4e5F6g7H8".repeat(8)}`
];

for (const token of tokens) {
  test(`personalised QR (level H + centre badge) still decodes — token length ${token.length}`, () => {
    const { data, dim } = renderWithCentreBadge(token);
    const result = jsQR(data, dim, dim, { inversionAttempts: "dontInvert" });
    assert.ok(result, "jsQR should detect the personalised code");
    assert.equal(result.data, token, "decoded payload must equal the original token");
  });
}

test("a baseline level-H code with no badge decodes (control)", () => {
  const token = tokens[0];
  const { data, dim } = renderWithCentreBadge(token, { badgeFraction: 0, badgePadModules: 0 });
  const result = jsQR(data, dim, dim, { inversionAttempts: "dontInvert" });
  assert.ok(result);
  assert.equal(result.data, token);
});
