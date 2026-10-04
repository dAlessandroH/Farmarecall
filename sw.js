/*
 * FarmaRecall — service worker (funcionamiento sin conexión).
 *
 * Al instalarse guarda en caché todos los archivos de la app. Después:
 *  - Publicada (HTTPS): responde primero desde la caché → arranque instantáneo y offline.
 *  - En localhost: pide primero a la red (para ver los cambios al desarrollar)
 *    y usa la caché solo si no hay conexión.
 *
 * Al modificar la app:
 *  1. Si añades o renombras un archivo, actualiza ASSETS (tests/index.html lo comprueba).
 *  2. Cambia VERSION para que los dispositivos descarguen la nueva versión.
 */
const VERSION = '1.3.0';
const CACHE_PREFIX = 'farmarecall-';
const CACHE_NAME = CACHE_PREFIX + VERSION;

// Rutas relativas a este archivo. Debe ser JSON válido (los tests lo leen).
// PRECACHE:START
const ASSETS = [
  "index.html",
  "manifest.json",
  "src/components/chain.js",
  "src/components/exercises.js",
  "src/components/icons.js",
  "src/components/progress.js",
  "src/components/symbolBar.js",
  "src/components/tabBar.js",
  "src/components/toast.js",
  "src/components/ui.js",
  "src/database/models.js",
  "src/database/settings.js",
  "src/database/storage.js",
  "src/gamification/achievements.js",
  "src/gamification/levels.js",
  "src/gamification/rewards.js",
  "src/main.js",
  "src/parser/chain.js",
  "src/parser/concepts.js",
  "src/parser/csv.js",
  "src/services/backup.js",
  "src/services/concepts.js",
  "src/services/exercise.js",
  "src/services/files.js",
  "src/services/pwa.js",
  "src/services/review.js",
  "src/services/router.js",
  "src/services/session.js",
  "src/services/stats.js",
  "src/spacedRepetition/scheduler.js",
  "src/styles.css",
  "src/utils/dates.js",
  "src/utils/dom.js",
  "src/utils/random.js",
  "src/utils/text.js",
  "src/utils/viewport.js",
  "src/version.js",
  "src/views/achievements.js",
  "src/views/backup.js",
  "src/views/concept.js",
  "src/views/edit.js",
  "src/views/errors.js",
  "src/views/home.js",
  "src/views/import.js",
  "src/views/library.js",
  "src/views/progress.js",
  "src/views/study.js",
  "icons/apple-touch-icon.png",
  "icons/favicon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "ejemplos/prueba.csv"
];
// PRECACHE:END

const IS_LOCALHOST = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
const ROOT_PATH = new URL('./', self.location.href).pathname;
const INDEX_URL = new URL('index.html', self.location.href).href;
const PRECACHED = new Set(ASSETS.map((path) => new URL(path, self.location.href).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La app navega con # (p. ej. #/biblioteca): abrir la raíz siempre es index.html.
  const isAppShell = request.mode === 'navigate'
    && (url.pathname === ROOT_PATH || url.pathname === ROOT_PATH + 'index.html');
  const key = isAppShell ? INDEX_URL : url.origin + url.pathname;

  // Cualquier otro archivo (tests/, ejemplos/…) va directo a la red.
  if (!PRECACHED.has(key)) return;

  event.respondWith(IS_LOCALHOST ? networkFirst(request, key) : cacheFirst(request, key));
});

async function cacheFirst(request, key) {
  const cached = await caches.match(key);
  return cached ?? fetch(request);
}

async function networkFirst(request, key) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(key, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(key);
    if (cached) return cached;
    throw error;
  }
}
