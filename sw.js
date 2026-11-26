// Service worker: offline app shell + Android "Share to WhatsApp Reader" target.
// Bump VERSION whenever the shell files change so clients pick up the update.
const VERSION = "v3.2.0";
const SHELL_CACHE = `wa-reader-${VERSION}`;
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
  "assets/fonts/roboto-latin.woff2",
  "assets/fonts/roboto-latin-ext.woff2",
  "assets/fonts/rubik-500-brand.woff2",
  "assets/images/iconreader.png",
  "assets/images/iconreader-120.webp",
  "assets/images/avatar.webp",
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
            // Old shell versions, plus the Google Fonts cache from before fonts were self-hosted.
            .filter((k) => k.startsWith("wa-reader-") && k !== SHELL_CACHE)
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

  // Same-origin only: stale-while-revalidate, so it works offline and updates in the background.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: request.mode === "navigate" }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
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
