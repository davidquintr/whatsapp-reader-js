// Service worker: offline app shell + Android "Share to WhatsApp Reader" target.
// Bump VERSION whenever the shell files change so clients pick up the update.
const VERSION = "v3.1.0";
const SHELL_CACHE = `wa-reader-${VERSION}`;
const RUNTIME_CACHE = "wa-reader-runtime";
const SHARE_CACHE = "wa-share";

const SHELL = [
  "./",
  "index.html",
  "en/",
  "manifest.webmanifest",
  "assets/css/styles.css",
  "assets/js/app.js",
  "assets/js/parser.js",
  "assets/js/i18n.js",
  "assets/js/format.js",
  "assets/js/render.js",
  "assets/js/search.js",
  "assets/js/stats.js",
  "assets/js/statsview.js",
  "assets/js/diff.js",
  "assets/js/zip.js",
  "assets/js/exporter.js",
  "assets/images/iconreader.png",
  "assets/images/icon-192.png",
  "assets/images/icon-512.png",
  "assets/images/background.webp",
  "assets/images/backgroundlight.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("wa-reader-v") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Android share sheet: the file arrives as a POST; stash it and open the app.
  if (request.method === "POST" && url.pathname.endsWith("/share-target")) {
    event.respondWith(handleShare(request));
    return;
  }
  if (request.method !== "GET") return;

  // Same-origin: stale-while-revalidate, so it works offline and updates in the background.
  // Google Fonts: same strategy in a runtime cache.
  const sameOrigin = url.origin === self.location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: sameOrigin && request.mode === "navigate" }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok || response.type === "opaque") {
            const copy = response.clone();
            caches.open(sameOrigin ? SHELL_CACHE : RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

async function handleShare(request) {
  const base = new URL("./", self.registration.scope);
  try {
    const form = await request.formData();
    const file = form.getAll("chat").find((f) => f instanceof File);
    if (file) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        "shared-file",
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
          },
        }),
      );
    }
  } catch {
    /* fall through to the app */
  }
  return Response.redirect(new URL("?shared=1", base).href, 303);
}
