const CACHE_NAME = "webdrop-v2-static-17";
const AVATAR_FRAMES = Array.from({ length: 8 }, (_, userIndex) =>
  Array.from(
    { length: 6 },
    (_, frameIndex) => `./assets/icons/animated/user-${userIndex + 1}/frame-${frameIndex + 1}.png`
  )
).flat();
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
  "./assets/icons/webdrop-mark.svg",
  "./assets/icons/avatars/user-01.png",
  "./assets/icons/avatars/user-02.png",
  "./assets/icons/avatars/user-03.png",
  "./assets/icons/avatars/user-04.png",
  "./assets/icons/avatars/user-05.png",
  "./assets/icons/avatars/user-06.png",
  "./assets/icons/avatars/user-07.png",
  "./assets/icons/avatars/user-08.png",
  "./assets/icons/user_1.png",
  "./assets/icons/user_2.png",
  "./assets/icons/user_3.png",
  "./assets/icons/user_4.png",
  "./assets/icons/user_5.png",
  "./assets/icons/user_6.png",
  "./assets/icons/user_7.png",
  "./assets/icons/user_8.png",
  ...AVATAR_FRAMES,
  "./output/pdf/webdrop-demo-en.pdf",
  "./output/pdf/webdrop-demo-ja.pdf"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
