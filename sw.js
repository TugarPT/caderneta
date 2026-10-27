// Rede primeiro (para receber sempre a versão nova); cache só quando não há rede.
// Os ficheiros da própria app pedem-se com cache:'no-cache' para o browser confirmar sempre
// com o GitHub Pages se há versão nova (sem isto, a cache HTTP de 10 min servia a antiga).
const CACHE = 'caderneta-v2';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  const static3p = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host);
  if (!own && !static3p) return; // APIs de preços: nunca guardar em cache
  const net = own ? fetch(req.url, {cache: 'no-cache', credentials: 'same-origin'}) : fetch(req);
  e.respondWith(net.then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, {ignoreSearch: own}).then(r => r || caches.match('./'))));
});
