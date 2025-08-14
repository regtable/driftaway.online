// Very small cache-first service worker for offline play
const CACHE = 'infinite-roguelite-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(CACHE).then(cache=> cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=> Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
});

self.addEventListener('fetch', (e)=>{
  const {request} = e;
  e.respondWith(
    caches.match(request).then(res=> res || fetch(request).then(resp=>{
      const copy = resp.clone();
      caches.open(CACHE).then(cache=> cache.put(request, copy));
      return resp;
    }).catch(()=> caches.match('./index.html')))
  );
});