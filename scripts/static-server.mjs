import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] || ".");
const port = Number(process.env.PORT || process.argv[3] || 4180);
const host = process.env.HOST || process.argv[4] || "127.0.0.1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".pdf", "application/pdf"],
  [".wasm", "application/wasm"]
]);

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || host}`);
    const target = resolveSafePath(url.pathname);
    if (!target) {
      send(response, 403, "Forbidden");
      return;
    }
    const file = resolveFile(target);
    if (!file) {
      send(response, 404, "Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extname(file).toLowerCase()) || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    createReadStream(file).pipe(response);
  } catch {
    send(response, 500, "Internal error");
  }
});

server.listen(port, host, () => {
  console.error(`Static server listening on http://${host}:${port}`);
});

function resolveSafePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const target = resolve(join(root, normalized));
  return target === root || target.startsWith(`${root}${sep}`) ? target : "";
}

function resolveFile(target) {
  if (!existsSync(target)) return "";
  const stats = statSync(target);
  if (stats.isDirectory()) {
    const index = join(target, "index.html");
    return existsSync(index) && statSync(index).isFile() ? index : "";
  }
  return stats.isFile() ? target : "";
}

function send(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(text);
}
