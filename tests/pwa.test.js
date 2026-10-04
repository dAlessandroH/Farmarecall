import { test, assert, assertEqual, waitFor } from './runner.js';

const ROOT = new URL('../', location.href);

async function precacheList() {
  const source = await (await fetch(new URL('sw.js', ROOT), { cache: 'no-store' })).text();
  const match = source.match(/\/\/ PRECACHE:START\s*const ASSETS = (\[[\s\S]*?\]);\s*\/\/ PRECACHE:END/);
  assert(match, 'sw.js debe tener la lista ASSETS entre // PRECACHE:START y // PRECACHE:END');
  return JSON.parse(match[1]);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No carga la imagen ${url}`));
    image.src = url;
  });
}

test('Manifest: nombre, standalone e iconos 192/512/maskable con el tamaño correcto', async () => {
  const manifestUrl = new URL('manifest.json', ROOT);
  const manifest = await (await fetch(manifestUrl)).json();
  assertEqual(manifest.name, 'FarmaRecall');
  assertEqual(manifest.short_name, 'FarmaRecall');
  assertEqual(manifest.display, 'standalone');
  assertEqual(manifest.start_url, './');
  assertEqual(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`),
    ['192x192 any', '512x512 any', '512x512 maskable']);
  for (const icon of manifest.icons) {
    const image = await loadImage(new URL(icon.src, manifestUrl));
    assertEqual(`${image.naturalWidth}x${image.naturalHeight}`, icon.sizes, icon.src);
  }
});

test('index.html: idioma, viewport de iPhone, manifest e icono de iOS (180×180)', async () => {
  const html = await (await fetch(new URL('index.html', ROOT))).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  assertEqual(doc.documentElement.lang, 'es');
  assert(doc.querySelector('meta[name=viewport]').content.includes('viewport-fit=cover'), 'viewport-fit=cover');
  assert(doc.querySelector('link[rel=manifest][href="manifest.json"]'), 'enlace al manifest');
  assertEqual(doc.querySelector('meta[name=apple-mobile-web-app-title]').content, 'FarmaRecall');
  const touchIcon = doc.querySelector('link[rel=apple-touch-icon]').getAttribute('href');
  const image = await loadImage(new URL(touchIcon, ROOT));
  assertEqual(`${image.naturalWidth}x${image.naturalHeight}`, '180x180', 'apple-touch-icon');
});

test('Service worker: todos los archivos de la caché offline existen', async () => {
  for (const path of await precacheList()) {
    const response = await fetch(new URL(path, ROOT), { cache: 'no-store' });
    assert(response.ok, `${path} → HTTP ${response.status}`);
  }
});

test('Service worker: la app no carga ningún archivo que falte en la caché offline', async () => {
  const assets = new Set(await precacheList());
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.src = new URL('index.html', ROOT).href;
  document.body.append(frame);
  try {
    await waitFor(() => frame.contentDocument?.querySelector('[data-view="home"]'),
      { message: 'la pantalla de inicio no apareció' });
    const loaded = frame.contentWindow.performance.getEntriesByType('resource')
      .map((entry) => new URL(entry.name))
      .filter((url) => url.origin === ROOT.origin)
      .map((url) => url.pathname.slice(ROOT.pathname.length))
      .filter((path) => path !== 'sw.js');
    assert(loaded.length > 5, `solo se detectaron ${loaded.length} archivos cargados`);
    const missing = loaded.filter((path) => !assets.has(path));
    assertEqual(missing, [], 'faltan en ASSETS de sw.js');
  } finally {
    frame.remove();
  }
});
