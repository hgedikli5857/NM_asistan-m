// Basit çevrimdışı önbellek: uygulama dosyaları önbellekten, veri her zaman internetten.
const CACHE = 'nm-departmani-v3.2.2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icons/icon.svg',
  './css/tokens.css', './css/app.css',
  './js/app.js', './js/config.js', './js/supabase.js', './js/ui.js', './js/units.js',
  './js/views/giris.js', './js/views/panel.js', './js/views/birim.js', './js/views/ayarlar.js', './js/views/kazanim.js', './js/kazanim/model.js', './js/views/iletisim.js', './js/iletisim/content.js', './js/iletisim/uyum.js', './js/views/olcum.js', './js/olcum/metrics.js', './js/views/ekip.js', './js/ekip/tree.js', './js/views/akademi.js', './js/akademi/content.js', './js/akademi/badges.js', './js/views/pazarlama.js', './js/pazarlama/content.js', './js/views/davet.js', './js/iletisim/pratik.js', './js/ui/picker.js', './js/ai/client.js', './js/ai/coach.js', './js/views/koc.js', './js/crm/client.js', './js/iletisim/strateji.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Supabase (veri ve giriş) ve diğer sitelere hiç karışma
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Eski uygulama kendi başına çalışsın
  if (url.pathname.includes('/eski/')) return;

  // Önce internet, olmazsa önbellek: güncellemeler hemen görünür, çevrimdışıyken de açılır
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
