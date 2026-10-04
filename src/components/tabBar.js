import { h } from '../utils/dom.js';
import { icon } from './icons.js';

const TABS = [
  { path: '', label: 'Inicio', icon: 'home' },
  { path: 'biblioteca', label: 'Biblioteca', icon: 'book' },
  { path: 'errores', label: 'Errores', icon: 'alert' },
  { path: 'progreso', label: 'Progreso', icon: 'chart' },
  { path: 'logros', label: 'Logros', icon: 'trophy' },
];

/**
 * Barra de pestañas fija abajo (como una app). Se oculta mientras se estudia,
 * para que en pantalla solo esté la tarea.
 */
export function createTabBar() {
  const links = TABS.map((tab) => h('a', { class: 'tab', href: `#/${tab.path}` },
    icon(tab.icon, { size: 22 }),
    h('span', null, tab.label),
  ));
  const element = h('nav', { class: 'tab-bar', 'aria-label': 'Secciones' }, links);

  /** @param {string} path @param {URLSearchParams} params */
  function update(path, params) {
    // Estudiando o editando solo se ve la tarea (y la barra de símbolos no queda tapada).
    document.body.classList.toggle('focus-mode', path === 'estudiar' || path === 'editar');
    const active = path === 'concepto' || path === 'editar'
      ? (params.get('volver')?.startsWith('#/errores') ? 'errores' : 'biblioteca')
      : path === 'importar' || path === 'datos' ? ''
        : path;
    TABS.forEach((tab, index) => {
      if (tab.path === active) links[index].setAttribute('aria-current', 'page');
      else links[index].removeAttribute('aria-current');
    });
  }

  return { element, update };
}
