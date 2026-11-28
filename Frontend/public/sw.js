/* eslint-disable */
/**
 * Service worker de MyOO (web instalable). Se registra solo en producción y
 * nunca dentro de la app nativa (ver src/lib/pwa.ts).
 *
 * Qué hace con cada petición (solo GET del mismo origen; lo demás no se toca):
 *   - Navegación (index.html): red primero. Sin red, la página offline propia.
 *     Nunca se sirve un index.html viejo: así nadie se queda con otra versión.
 *   - /assets/* (archivos de Vite con hash en el nombre): caché primero. Son
 *     inmutables: un cambio de contenido es un nombre nuevo.
 *   - /models/* (prendas 3D): «stale-while-revalidate»: se enseña lo guardado
 *     al momento y se renueva por detrás. Con límite de entradas y de tamaño.
 *   - /api/*: nunca en caché (datos privados de cada usuario).
 *
 * BUILD_ID lo cambia el build (plugin «sw-build-id» de vite.config.ts): cada
 * despliegue produce un sw.js distinto, el navegador instala el nuevo y la web
 * enseña «Hay una versión nueva · Recargar». No se activa solo (sin
 * skipWaiting automático): espera a que la persona pulse «Recargar» o cierre
 * todas las pestañas, para no cambiar los archivos a mitad de una sesión.
 */
const BUILD_ID = '__MYOO_BUILD_ID__';

const PREFIX = 'myoo-';
/** Página offline y lo que necesita. Va ligada al build: se rehace en cada versión. */
const SHELL_CACHE = `${PREFIX}shell-${BUILD_ID}`;
/** Archivos con hash: el nombre ya es la versión, así que no hace falta versionar la caché. */
const ASSETS_CACHE = `${PREFIX}assets-v1`;
const MODELS_CACHE = `${PREFIX}models-v1`;
const KEEP = [SHELL_CACHE, ASSETS_CACHE, MODELS_CACHE];

const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/brand/mark.svg', '/brand/concrete.webp'];

/** Límites para no llenar el móvil. */
const ASSETS_MAX_ENTRIES = 200;
const MODELS_MAX_ENTRIES = 80;
const MODELS_MAX_BYTES = 8 * 1024 * 1024; // un modelo más grande no se guarda

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // cache: 'reload' → siempre la copia del servidor, no la de la caché HTTP.
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpieza: fuera las cachés de versiones anteriores (solo las nuestras).
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX) && !KEEP.includes(n)).map((n) => caches.delete(n)));
      // La navegación empieza a descargarse mientras arranca el service worker.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => undefined);
    })(),
  );
});

// La web pide activar la versión nueva cuando la persona pulsa «Recargar».
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Otros dominios (fuentes, Stripe, imágenes externas…): el navegador, como siempre.
  if (url.origin !== self.location.origin) return;
  // La API nunca pasa por la caché.
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return;
  // Descargas parciales (vídeo/audio): mejor sin intermediarios.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event, request));
  } else if (url.pathname.startsWith('/models/')) {
    event.respondWith(staleWhileRevalidate(event, request));
  } else if (PRECACHE.includes(url.pathname)) {
    // Lo que usa la página offline: red y, sin red, la copia guardada.
    event.respondWith(fetch(request).catch(() => caches.match(request, { cacheName: SHELL_CACHE }).then((r) => r || Response.error())));
  }
  // El resto (manifest, iconos, sw.js…) va directo a la red.
});

/** index.html: siempre de la red; sin red, la página offline. */
async function networkFirstNavigation(event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    return offline || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

/**
 * ¿Se puede guardar esta respuesta? Solo respuestas correctas del propio
 * origen y nunca HTML: si un archivo ya no existe, Vercel devuelve index.html
 * (200) y no queremos guardarlo como si fuera un .js o un modelo.
 */
function cacheable(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const type = response.headers.get('content-type') || '';
  return !type.includes('text/html');
}

/** /assets/*: lo guardado y, si no está, la red (y se guarda). */
async function cacheFirst(event, request) {
  const cache = await caches.open(ASSETS_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (cacheable(response)) {
    // Se guarda por detrás: la página recibe el archivo sin esperar.
    const copy = response.clone();
    event.waitUntil(
      cache
        .put(request, copy)
        .then(() => trim(cache, ASSETS_MAX_ENTRIES))
        .catch(() => undefined),
    );
  }
  return response;
}

/** /models/*: lo guardado al momento y se renueva por detrás. */
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(MODELS_CACHE);
  const hit = await cache.match(request);
  let saved = Promise.resolve();
  const refresh = fetch(request).then(
    (response) => {
      const size = Number(response.headers.get('content-length') || 0);
      if (cacheable(response) && size <= MODELS_MAX_BYTES) {
        const copy = response.clone();
        // Borrar y volver a poner: queda al final de la lista (el más reciente).
        saved = cache
          .delete(request)
          .then(() => cache.put(request, copy))
          .then(() => trim(cache, MODELS_MAX_ENTRIES))
          .catch(() => undefined);
      }
      return response;
    },
    () => null,
  );
  // El service worker sigue vivo hasta terminar de guardar.
  event.waitUntil(refresh.then(() => saved));
  if (hit) return hit;
  const response = await refresh;
  return response || Response.error();
}

/** Deja como mucho `max` entradas: se van las más antiguas (las primeras). */
async function trim(cache, max) {
  try {
    const keys = await cache.keys();
    const extra = keys.length - max;
    for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
  } catch {
    // sin espacio o caché ocupada: no pasa nada, se intenta la próxima vez
  }
}
