const CACHE_NAME = "webdrop-v2-static-20";
const RUNTIME_CACHE_NAME = "webdrop-v2-runtime-20";
const ASSETS = [
  "./",
  "./index.html",
  "./css/base.css",
  "./css/orbit.css",
  "./css/connected.css",
  "./css/sheets.css",
  "./css/responsive.css",
  "./js/app.js",
  "./js/config/avatar-options.js",
  "./js/config/i18n.js",
  "./js/core/controller.js",
  "./js/core/state.js",
  "./js/services/capabilities.js",
  "./js/services/mock-signaling.js",
  "./js/services/proximity-engine.js",
  "./js/services/transfer-engine.js",
  "./js/services/turn-config.js",
  "./js/services/webrtc-transport.js",
  "./js/services/websocket-signaling.js",
  "./js/storage/storage-client.js",
  "./js/ui/app-view.js",
  "./js/utils/emitter.js",
  "./js/utils/format.js",
  "./workers/storage-worker.js",
  "./assets/icons/webdrop-mark.svg"
];

const RUNTIME_ASSET_PREFIXES = [
  "assets/icons/animated/",
  "output/pdf/"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![CACHE_NAME, RUNTIME_CACHE_NAME].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.status === 200 && shouldRuntimeCache(event.request)) {
          event.waitUntil(
            caches.open(RUNTIME_CACHE_NAME).then((cache) => cache.put(event.request, response.clone()))
          );
        }
        return response;
      });
    })
  );
});

function shouldRuntimeCache(request) {
  if (request.headers.has("range")) return false;
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  const basePath = scopePath.endsWith("/") ? scopePath : `${scopePath}/`;
  return url.origin === self.location.origin
    && RUNTIME_ASSET_PREFIXES.some((prefix) => url.pathname.startsWith(`${basePath}${prefix}`));
}
