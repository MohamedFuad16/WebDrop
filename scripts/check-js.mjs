import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const roots = ["js", "workers", "scripts"];
const files = ["service-worker.js"];
const args = new Set(process.argv.slice(2));

if (!args.has("--secrets-only")) {
  checkSyntax();
  checkPackageLock();
  checkServiceWorkerManifest();
}

scanForSecrets();

function checkSyntax() {
  for (const root of roots) {
    collect(root, files);
  }

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

function collect(dir, out) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) collect(path, out);
    if (stat.isFile() && [".js", ".mjs", ".cjs"].some((extension) => path.endsWith(extension))) {
      out.push(path);
    }
  }
}

function checkPackageLock() {
  const packageJson = readJson("package.json");
  const lockJson = readJson("package-lock.json");
  const rootPackage = lockJson.packages?.[""];

  assert(rootPackage, "package-lock.json is missing the root package entry");
  assert(lockJson.name === packageJson.name, "package-lock.json name does not match package.json");
  assert(lockJson.version === packageJson.version, "package-lock.json version does not match package.json");
  assert(rootPackage.version === packageJson.version, "package-lock root package version does not match package.json");
  assert(
    JSON.stringify(rootPackage.dependencies ?? {}) === JSON.stringify(packageJson.dependencies ?? {}),
    "package-lock root dependencies do not match package.json"
  );
}

function checkServiceWorkerManifest() {
  const packageJson = readJson("package.json");
  const serviceWorker = readFileSync("service-worker.js", "utf8");
  const context = {
    caches: {},
    fetch() {},
    self: {
      addEventListener() {},
      location: { origin: "https://webdrop.example.test" },
      registration: { scope: "https://webdrop.example.test/" }
    }
  };

  vm.runInNewContext(
    `${serviceWorker}\nglobalThis.__check = { APP_VERSION, CACHE_NAME, RUNTIME_CACHE_NAME, ASSETS };`,
    context,
    { filename: "service-worker.js" }
  );

  const { APP_VERSION, CACHE_NAME, RUNTIME_CACHE_NAME, ASSETS } = context.__check;
  assert(APP_VERSION === packageJson.version, "service-worker APP_VERSION does not match package.json");
  assert(CACHE_NAME === `webdrop-v2-static-${packageJson.version}`, "static cache name does not match package version");
  assert(RUNTIME_CACHE_NAME === `webdrop-v2-runtime-${packageJson.version}`, "runtime cache name does not match package version");
  assert(Array.isArray(ASSETS) && ASSETS.length > 0, "service-worker ASSETS must be a non-empty array");
  assert(new Set(ASSETS).size === ASSETS.length, "service-worker ASSETS contains duplicate entries");

  for (const asset of ASSETS) {
    assert(asset.startsWith("./"), `service-worker asset must use relative ./ path: ${asset}`);
    assert(asset !== "./js/config/runtime-config.js", "runtime-config.js must not be precached");
    const assetPath = asset === "./" ? "." : asset.slice(2);
    const stat = statSync(assetPath);
    assert(asset === "./" ? stat.isDirectory() : stat.isFile(), `service-worker asset does not exist: ${asset}`);
  }
}

function scanForSecrets() {
  const findings = [];
  const secretPatterns = [
    /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    /\bAIza[0-9A-Za-z_-]{35}\b/,
    /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/
  ];
  const assignmentPattern = /\b(?:API_TOKEN|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY)\b\s*[:=]\s*["']?(?!replace-with|changeme|example|test|false\b|true\b|0\b|1\b|$)([^\s"',}]{16,})/i;

  for (const file of collectTextFiles(".")) {
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (secretPatterns.some((pattern) => pattern.test(line)) || assignmentPattern.test(line)) {
        findings.push(`${file}:${index + 1}`);
      }
    }
  }

  assert(findings.length === 0, `possible committed secret material found:\n${findings.join("\n")}`);
}

function collectTextFiles(dir, out = []) {
  const ignoredDirectories = new Set([
    ".git",
    "node_modules",
    "graphify-out",
    "output",
    "test-results",
    "tmp",
    "coverage",
    "dist",
    "build",
    "temp"
  ]);
  const ignoredFiles = new Set(["package-lock.json", ".DS_Store"]);
  const textExtensions = new Set([
    "",
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".py",
    ".service",
    ".sh",
    ".svg",
    ".txt",
    ".yml",
    ".yaml"
  ]);

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!ignoredDirectories.has(entry)) collectTextFiles(path, out);
      continue;
    }
    if (!stat.isFile() || ignoredFiles.has(entry) || entry.startsWith(".env")) continue;
    if (!textExtensions.has(extensionFor(entry))) continue;
    out.push(path);
  }
  return out;
}

function extensionFor(file) {
  const index = file.lastIndexOf(".");
  return index === -1 ? "" : file.slice(index);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
