#!/usr/bin/env node
// Stages the runtime frontend into a Monaca-importable Cordova project and zips it
// to dist/webdrop-monaca-v<version>.zip. Version is read from package.json.
//
//   node scripts/build-monaca.mjs
//
// The archive contains config.xml + .monaca/project_info.json + www/ (the static
// app: index.html, service-worker.js, css, js, admin, vendor, workers, the fonts
// and icons the app loads at runtime, and the demo PDFs controller.js references).
// Backend, tests, scripts, docs, agent/ and screenshots are excluded, as is the
// gitignored js/config/local-admin-token.js — it holds a real token.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = join(ROOT, "tmp", "monaca-stage");
const WWW = join(STAGE, "www");
const DIST = join(ROOT, "dist");

const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

// Paths copied verbatim into www/. Directories are copied recursively.
const INCLUDE = [
  "index.html",
  "service-worker.js",
  "css",
  "js",
  "admin",
  "vendor",
  "workers",
  "assets/fonts",
  "assets/icons",
  "output/pdf",
];

// Removed from www/ after the copy. local-admin-token.js is a real secret and must
// never leave the machine; the rest is dead weight in a mobile package.
const SCRUB = ["js/config/local-admin-token.js", "js/.DS_Store", "assets/icons/animated/.DS_Store"];

const CONFIG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0" id="com.webdrop.app" version="${version}">
  <name>WebDrop</name>
  <description>AirDrop-style proximity file transfer PWA: peers verify physical closeness (ultrasound + bump/tilt or QR) then send files peer-to-peer over WebRTC.</description>
  <author email="flashxjapan@gmail.com">MohamedFuad16</author>
  <content src="index.html" />
  <access origin="*" />
  <allow-navigation href="*" />
  <allow-intent href="http://*/*" />
  <allow-intent href="https://*/*" />
  <preference name="DisallowOverscroll" value="true" />
  <preference name="Orientation" value="portrait" />
</widget>
`;

// Monaca gates project imports on the Cordova version the account's plan supports:
// a Free/Education plan rejects newer projects outright ("Unsupported Cordova
// Version"). 11.0 is what the Free plan accepts. Platform/toolchain versions are
// deliberately omitted so Monaca fills in its own defaults for that Cordova line.
const CORDOVA_VERSION = process.env.MONACA_CORDOVA_VERSION ?? "11.0";

const PROJECT_INFO = `${JSON.stringify(
  {
    cordova_version: CORDOVA_VERSION,
    build: { transpile: { enabled: false } },
  },
  null,
  2,
)}\n`;

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(join(STAGE, ".monaca"), { recursive: true });
mkdirSync(WWW, { recursive: true });

for (const entry of INCLUDE) {
  const from = join(ROOT, entry);
  if (!existsSync(from)) throw new Error(`missing include: ${entry}`);
  const to = join(WWW, entry);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith(".DS_Store") });
}

for (const entry of SCRUB) rmSync(join(WWW, entry), { recursive: true, force: true });

// Monaca's preview server has no MIME mapping for .mjs and serves it as
// application/octet-stream. A browser refuses to evaluate an ES module with a
// non-JavaScript MIME type, so that single import kills the whole graph: app.js
// never runs, no identity/avatar is created, signaling never connects. Vercel maps
// .mjs correctly, so this is rewritten for the Monaca package only — the repo and
// the Vercel deploy keep the .mjs name.
renameSync(join(WWW, "js/vendor/qrcode-generator.mjs"), join(WWW, "js/vendor/qrcode-generator.js"));
for (const file of ["js/ui/dynamic-island.js", "service-worker.js"]) {
  const path = join(WWW, file);
  const before = readFileSync(path, "utf8");
  const after = before.replaceAll("qrcode-generator.mjs", "qrcode-generator.js");
  if (after === before) throw new Error(`expected a qrcode-generator.mjs reference in ${file}`);
  writeFileSync(path, after);
}

const strayModules = [...readdirSync(join(WWW, "js/vendor"))].filter((f) => f.endsWith(".mjs"));
if (strayModules.length) throw new Error(`.mjs would be served as octet-stream by Monaca: ${strayModules.join(", ")}`);

writeFileSync(join(STAGE, "config.xml"), CONFIG_XML);
writeFileSync(join(STAGE, ".monaca", "project_info.json"), PROJECT_INFO);

// The service worker precaches by path; a missing entry makes install() reject and
// the whole PWA shell silently fall back to network. Fail the build instead.
const sw = readFileSync(join(WWW, "service-worker.js"), "utf8");
const assetBlock = sw.slice(sw.indexOf("const ASSETS = ["), sw.indexOf("];", sw.indexOf("const ASSETS = [")));
const missing = [...assetBlock.matchAll(/"\.\/([^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => p && !existsSync(join(WWW, p)));
if (missing.length) throw new Error(`service-worker ASSETS missing from www/: ${missing.join(", ")}`);

if (existsSync(join(WWW, "js/config/local-admin-token.js"))) {
  throw new Error("refusing to package: local-admin-token.js is present in www/");
}

mkdirSync(DIST, { recursive: true });
const zip = join(DIST, `webdrop-monaca-v${version}.zip`);
rmSync(zip, { force: true });
execFileSync("zip", ["-r", "-q", "-X", zip, "config.xml", ".monaca", "www"], { cwd: STAGE });
rmSync(STAGE, { recursive: true, force: true });

console.log(`built ${zip.replace(`${ROOT}/`, "")} (v${version})`);
