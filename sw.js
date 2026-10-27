// Rede primeiro (para receber sempre a versão nova); cache só quando não há rede.
// Os ficheiros da própria app pedem-se com cache:'no-cache' para o browser confirmar sempre
// com o GitHub Pages se há versão nova (sem isto, a cache HTTP de 10 min servia a antiga).
const CACHE = 'caderneta-v2';
const NT = 'caderneta-notif'; // lista dos avisos dos próximos dias, escrita pela app (nunca é apagada aqui)
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== NT).map(k => caches.delete(k)))).then(() => self.clients.claim())
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

// Avisos com a app fechada: o Android acorda o service worker (periodic sync, só com a app instalada)
// e mostramos os avisos marcados para hoje que ainda não foram mostrados.
const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
async function avisos() {
  const c = await caches.open(NT), r = await c.match('./__avisos.json');
  if (!r) return;
  const j = await r.json(), t = hoje(), shown = j.shown || {};
  let mudou = false;
  for (const o of j.items || []) {
    if (o.date !== t || shown[o.id]) continue;
    await self.registration.showNotification(o.t, {body: o.b, tag: 'cad-dia-' + o.id, icon: 'icon-192.png', badge: 'icon-192.png', data: {go: o.go || ''}});
    shown[o.id] = t; mudou = true;
  }
  for (const id in shown) if (shown[id] < t && !(j.items || []).some(o => o.id === id)) delete shown[id];
  if (mudou) await c.put('./__avisos.json', new Response(JSON.stringify({items: j.items, shown}), {headers: {'content-type': 'application/json'}}));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'caderneta-avisos') e.waitUntil(avisos()); });
self.addEventListener('message', e => { if (e.data && e.data.type === 'avisos') e.waitUntil(avisos()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const go = (e.notification.data || {}).go || '';
  e.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true}).then(L => {
    const c = L[0];
    if (c) { if (go) c.postMessage({type: 'go', go}); return c.focus(); }
    return clients.openWindow('./' + (go ? '#go-' + encodeURIComponent(go) : ''));
  }));
});
