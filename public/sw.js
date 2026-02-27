/**
 * StikmNek Service Worker v3 — SELF-DESTRUCT MODE
 * 
 * This SW exists ONLY to kill any previous service worker and clear all caches.
 * It has NO fetch handler — it does not cache anything.
 * 
 * When the browser detects this new SW (byte-by-byte comparison with old SW),
 * it will install it. On activation, it:
 *   1. Deletes ALL caches
 *   2. Unregisters itself
 *   3. Force-reloads all open tabs/windows
 * 
 * After this runs once, there will be NO service worker controlling the app.
 * The app will load fresh from the network every time, like a normal website.
 */

const SW_VERSION = '3.0.0-nuke';

// ─── Install: Skip waiting immediately ───
self.addEventListener('install', (event) => {
  console.log(`[SW v${SW_VERSION}] Installing SELF-DESTRUCT service worker...`);
  self.skipWaiting();
});

// ─── Activate: NUKE EVERYTHING ───
self.addEventListener('activate', (event) => {
  console.log(`[SW v${SW_VERSION}] Activating — DESTROYING all caches and unregistering...`);
  
  event.waitUntil(
    (async () => {
      try {
        // Step 1: Delete ALL caches — every single one
        const cacheNames = await caches.keys();
        console.log(`[SW v${SW_VERSION}] Deleting ${cacheNames.length} caches:`, cacheNames);
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log(`[SW v${SW_VERSION}] All caches deleted.`);
      } catch (err) {
        console.error(`[SW v${SW_VERSION}] Cache deletion error:`, err);
      }

      try {
        // Step 2: Claim all clients so we control them
        await self.clients.claim();
        console.log(`[SW v${SW_VERSION}] Claimed all clients.`);
      } catch (err) {
        console.error(`[SW v${SW_VERSION}] Client claim error:`, err);
      }

      try {
        // Step 3: Tell all clients to reload
        const clients = await self.clients.matchAll({ type: 'window' });
        console.log(`[SW v${SW_VERSION}] Sending reload to ${clients.length} clients...`);
        for (const client of clients) {
          client.postMessage({ type: 'FORCE_RELOAD', version: SW_VERSION });
        }
      } catch (err) {
        console.error(`[SW v${SW_VERSION}] Client messaging error:`, err);
      }

      try {
        // Step 4: Unregister ourselves — no more service worker
        await self.registration.unregister();
        console.log(`[SW v${SW_VERSION}] Successfully unregistered. No more service worker.`);
      } catch (err) {
        console.error(`[SW v${SW_VERSION}] Unregister error:`, err);
      }
    })()
  );
});

// ─── Message handler: respond to any commands ───
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: SW_VERSION });
  }
  if (event.data === 'NUKE') {
    // Emergency: clear everything and unregister
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).then(() => {
      self.registration.unregister();
    });
  }
});

// ─── NO fetch handler — let the browser handle everything normally ───
// This is intentional. We do NOT want to intercept any requests.
// The browser will fetch everything from the network like a normal website.

console.log(`[SW v${SW_VERSION}] Self-destruct service worker loaded. Waiting for activation to nuke caches.`);
