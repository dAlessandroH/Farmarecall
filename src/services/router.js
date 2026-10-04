import { messageScreen } from '../components/ui.js';

/**
 * Navegación por hash (#/biblioteca, #/estudiar?n=10). No necesita servidor y funciona sin conexión.
 * Cada vista es una función `(context) => HTMLElement` (o una promesa de uno); recibe `context`,
 * `params` y `refresh()` para volver a dibujarse.
 *
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {Record<string, (ctx: any) => HTMLElement | Promise<HTMLElement>>} options.routes  '' es la pantalla de inicio.
 * @param {object} options.context  Lo que comparten todas las vistas (p. ej. la base de datos).
 * @param {(path: string, params: URLSearchParams) => void} [options.onChange]  Se llama en cada cambio de pantalla.
 */
export function startRouter({ root, routes, context, onChange }) {
  let renderCount = 0;

  async function render() {
    const current = ++renderCount;
    const { path, params } = parseHash(location.hash);
    const route = path in routes ? path : '';
    onChange?.(route, params);

    let screen;
    try {
      screen = await routes[route]({ ...context, params, refresh: render });
    } catch (error) {
      console.error(error);
      screen = messageScreen('Algo salió mal', String(error?.message ?? error));
    }
    if (current !== renderCount) return; // el usuario ya cambió de pantalla

    root.replaceChildren(screen);
    window.scrollTo(0, 0);
    const heading = root.querySelector('h1');
    document.title = route && heading ? `${heading.textContent} · FarmaRecall` : 'FarmaRecall';
    // Al cambiar de pantalla, llevar el foco al título (lectores de pantalla y teclado).
    if (current > 1) heading?.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', render);
  render();
}

/** @param {string} hash */
export function parseHash(hash) {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  return { path, params: new URLSearchParams(query) };
}
