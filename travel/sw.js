/* 여행 앱 오프라인용 서비스 워커
   - 앱 화면(index.html)은 네트워크 우선, 3.5초 안에 응답이 없거나 오프라인이면 저장해 둔 화면을 사용
   - Leaflet·Sortable·폰트는 한 번 받으면 저장해 두고 이후엔 저장본 사용
   - GitHub 서버(api.github.com), 구글 지도, travel.json 요청은 건드리지 않음 */
const V = 'travel-v1';
const SC = self.registration.scope;
const CORE = [SC, SC + 'index.html'];
const EXTRA = [
  SC + 'manifest.json',
  SC + 'icon-180.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];
const HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    await Promise.all(EXTRA.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

const okRes = r => r && (r.ok || r.type === 'opaque');

async function nav(req) {
  const c = await caches.open(V);
  const key = new URL(req.url); key.search = ''; key.hash = '';
  const net = fetch(req).then(res => {
    if (res && res.ok && !res.redirected && res.type === 'basic') {
      for (const k of new Set([key.href, SC, SC + 'index.html'])) c.put(k, res.clone());
    }
    return res;
  });
  const first = await Promise.race([
    net.catch(() => null),
    new Promise(r => setTimeout(() => r(null), 3500))
  ]);
  if (first) return first;
  const hit = (await c.match(key.href)) || (await c.match(SC)) || (await c.match(SC + 'index.html'));
  if (hit) return hit;
  return net.catch(() => Response.error());
}

async function swr(req) {
  const c = await caches.open(V);
  const hit = await c.match(req);
  const net = fetch(req).then(res => { if (okRes(res)) c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

async function cf(req) {
  const c = await caches.open(V);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (okRes(res)) c.put(req, res.clone());
    return res;
  } catch (e) { return Response.error(); }
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (r.mode === 'navigate') { e.respondWith(nav(r)); return; }
    if (/\/(manifest\.json|icon-\d+\.png)$/.test(u.pathname)) e.respondWith(swr(r));
    return;
  }
  if (HOSTS.includes(u.hostname)) e.respondWith(u.hostname === 'fonts.googleapis.com' ? swr(r) : cf(r));
});
