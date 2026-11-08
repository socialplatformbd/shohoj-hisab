/* সহজ হিসাব — Service Worker
 * লক্ষ্য: প্রথমবার অনলাইনে খোলার পর পুরো অ্যাপ (সব পেজ + JS/CSS) অফলাইনে চলা।
 * আর্থিক ডেটা এখানে নেই — তা IndexedDB-তে থাকে। /api/* কখনো ক্যাশ হয় না।
 */
const VERSION = "v2";
const SHELL_CACHE = `shohoj-hisab-shell-${VERSION}`;
const ROUTES = ["/", "/transactions", "/reports", "/budgets", "/debts", "/accounts", "/recurring", "/mess", "/mess/meals", "/mess/entries", "/mess/members", "/shop", "/shop/entries", "/shop/parties", "/ai", "/settings", "/more"];
const STATIC = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png", "/icon.svg"];

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  const assets = new Set(STATIC);
  await Promise.allSettled(
    ROUTES.map(async (route) => {
      const res = await fetch(route, { cache: "reload", credentials: "same-origin" });
      if (!res.ok) return;
      const copy = res.clone();
      const html = await res.text();
      await cache.put(route, copy);
      // HTML-এ উল্লেখ থাকা সব স্ট্যাটিক অ্যাসেট খুঁজে বের করি
      const re = /\/_next\/static\/[A-Za-z0-9_\-./%~\[\]@+]+\.(?:js|css|woff2?)/g;
      for (const m of html.matchAll(re)) assets.add(m[0]);
    }),
  );
  await Promise.allSettled(
    [...assets].map(async (url) => {
      const res = await fetch(url, { credentials: "same-origin" });
      if (res.ok) await cache.put(url, res);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("shohoj-hisab-") && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([fetch(request), timeout(5000)]);
    if (res && res.ok) {
      const url = new URL(request.url);
      cache.put(url.pathname, res.clone());
    }
    return res;
  } catch {
    const url = new URL(request.url);
    return (
      (await cache.match(url.pathname)) ||
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match("/")) ||
      new Response("<h1>অফলাইন</h1><p>অ্যাপটি একবার অনলাইনে খুলুন, তারপর অফলাইনে চলবে।</p>", {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

async function handleAsset(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return; // Next-এর নিজস্ব ডেটা রিকোয়েস্ট

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || STATIC.includes(url.pathname) || /\.(?:png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(handleAsset(request));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("/budgets");
    }),
  );
});
