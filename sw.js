/* Service worker · Registro diario de biodigestores
 *
 * IMPORTANTE — cada vez que subas un cambio a GitHub, subí el número de CACHE_VERSION.
 * Si no lo hacés, los navegadores que ya tienen la app instalada van a seguir usando
 * los archivos viejos del caché y no van a ver tu cambio nunca.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `registro-biodigestores-${CACHE_VERSION}`;

// Todo lo que la app necesita para arrancar sin conexión.
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './vendor/xlsx.full.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// --- Instalación: descargar y guardar todo el paquete ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .catch((err) => console.error('[sw] falló el precache:', err))
  );
});

// --- Activación: borrar las versiones anteriores del caché ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('registro-biodigestores-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// --- El botón "Actualizar ahora" de la app manda este mensaje ---
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// --- Fetch: primero el caché (arranque instantáneo y offline), red como respaldo ---
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Navegación: si no hay red, servir el index cacheado.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Guardar lo que se haya pedido de más, siempre que la respuesta sirva.
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
