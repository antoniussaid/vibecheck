// Test service worker: tries to reach an external host on install.
// The scanner blocks service workers and aborts external egress, so this
// external request must never actually be contacted.
self.addEventListener('install', (event) => {
  event.waitUntil(fetch('http://example.invalid/sw-beacon').catch(() => {}));
});
