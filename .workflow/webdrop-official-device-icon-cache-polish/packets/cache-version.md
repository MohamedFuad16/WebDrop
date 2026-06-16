# Packet: Cache Version

Objective: audit whether service-worker caching could preserve old device icon rendering.

Scope: `service-worker.js`, `package.json`, `package-lock.json`, visible Settings version, versioned docs/scripts.

Result: complete. The service worker is cache-first for app assets and uses versioned cache names, so this release must bump every visible/runtime version to `1.0.16`.
