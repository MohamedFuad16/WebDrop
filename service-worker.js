const APP_VERSION = "1.0.47";
const CACHE_NAME = `webdrop-v2-static-${APP_VERSION}`;
const RUNTIME_CACHE_NAME = `webdrop-v2-runtime-${APP_VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./admin/index.html",
  "./css/admin.css",
  "./css/base.css",
  "./css/orbit.css",
  "./css/connected.css",
  "./css/dynamic-island.css",
  "./css/sheets.css",
  "./css/responsive.css",
  "./js/app.js",
  "./js/admin.js",
  "./js/config/avatar-options.js",
  "./js/config/i18n.js",
  "./js/config/runtime-flags.js",
  "./js/core/controller.js",
  "./js/core/state.js",
  "./js/services/capabilities.js",
  "./js/services/mock-signaling.js",
  "./js/services/acoustic-proximity.js",
  "./js/services/data-channel-transfer-protocol.js",
  "./js/services/motion-proximity.js",
  "./js/services/proximity-engine.js",
  "./js/services/proximity-token.js",
  "./js/services/transfer-engine.js",
  "./js/services/turn-config.js",
  "./js/services/webrtc-transport.js",
  "./js/services/websocket-signaling.js",
  "./js/storage/storage-client.js",
  "./js/ui/app-view.js",
  "./js/ui/dynamic-island.js",
  "./js/ui/siri-wave.js",
  "./js/vendor/jsqr.js",
  "./js/vendor/qrcode-generator.mjs",
  "./js/utils/emitter.js",
  "./js/utils/format.js",
  "./js/vendor/streamsaver-adapter.js",
  "./workers/incremental-sha256.js",
  "./vendor/streamsaver/mitm.html",
  "./vendor/streamsaver/sw.js",
  "./assets/fonts/SourceHanSansJP-Normal-static.ttf",
  "./assets/icons/webdrop-mark.svg"
];

const RUNTIME_ASSET_PREFIXES = [
  "assets/icons/animated/",
  "output/pdf/"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
      self.skipWaiting()
    ])
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![CACHE_NAME, RUNTIME_CACHE_NAME].includes(key))
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() =>
        caches.match(isAdminRoute(event.request) ? "./admin/index.html" : "./index.html")
          .then((cached) => cached || caches.match("./"))
      )
    );
    return;
  }
  if (new URL(event.request.url).pathname.endsWith("/js/config/runtime-config.js")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === self.location.origin && isCodeAsset(requestUrl.pathname)) {
    event.respondWith(
      fetch(event.request, { cache: "no-cache" })
        .then(async (response) => {
          if (response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) =>
          cached || caches.match(event.request, { ignoreSearch: true })
        ))
    );
    return;
  }
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

function isCodeAsset(pathname) {
  return pathname.endsWith(".js") || pathname.endsWith(".mjs") || pathname.endsWith(".css");
}

function shouldRuntimeCache(request) {
  if (request.headers.has("range")) return false;
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  const basePath = scopePath.endsWith("/") ? scopePath : `${scopePath}/`;
  return url.origin === self.location.origin
    && RUNTIME_ASSET_PREFIXES.some((prefix) => url.pathname.startsWith(`${basePath}${prefix}`));
}

function isAdminRoute(request) {
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  const basePath = scopePath.endsWith("/") ? scopePath : `${scopePath}/`;
  return url.pathname === `${basePath}admin` || url.pathname === `${basePath}admin/`;
}
