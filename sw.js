/* SetMate : fonctionnement hors connexion.
   Réseau d'abord (toujours la dernière version quand il y a du réseau), copie locale sinon.
   Seuls les fichiers du site sont gardés ; les extraits et recherches Deezer ne le sont pas. */
const C = "setmate-1.12.6";
const BASE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./icon-maskable-512.png"];
/* 1.12.5 : on passe toujours par le réseau (cache "reload" / "no-cache"), jamais par le cache HTTP du navigateur : sinon la « dernière version » peut avoir plusieurs minutes de retard */
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => Promise.allSettled(BASE.map(u => fetch(new Request(u, { cache: "reload" })).then(r => { if (!r.ok) throw new Error(u); return c.put(u, r); })))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const signe = x => x ? (x.headers.get("etag") || x.headers.get("last-modified") || x.headers.get("content-length") || "") : "";
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  let servi = "reseau";
  /* Réseau d'abord, mais pas plus de 4 secondes : wifi de club sans internet ou signal faible, on sert la copie locale.
     La requête continue en arrière-plan et met la copie à jour ; si la page a été servie depuis la copie et que la nouvelle est différente, on prévient la page. */
  const maj = fetch(r, { cache: "no-cache" }).then(res => {
    if (res.ok) {
      const cp = res.clone();
      e.waitUntil(caches.open(C).then(async c => {
        const vieux = servi === "copie" && r.mode === "navigate" ? await c.match(r, { ignoreSearch: true }) : null;
        await c.put(r, cp);
        if (vieux && signe(vieux) && signe(vieux) !== signe(cp)) {
          const cs = await self.clients.matchAll({ type: "window" });
          cs.forEach(cl => cl.postMessage({ maj: true }));
        }
      }).catch(() => {}));
    }
    return res;
  });
  e.waitUntil(maj.catch(() => {}));
  let id;
  const trop = new Promise((_, no) => { id = setTimeout(no, 4000); });
  const course = Promise.race([maj, trop]);
  course.then(() => clearTimeout(id), () => clearTimeout(id));
  const copie = () => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === "navigate" ? caches.match("./index.html") : undefined));
  e.respondWith(course.catch(() => { servi = "copie"; return copie().then(m => m || maj); }));
});
