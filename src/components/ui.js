import { h } from '../utils/dom.js';

const HOME = { href: '#/', label: 'Inicio' };

/**
 * Pantalla estándar: enlace para volver (las pestañas no lo necesitan), título y contenido.
 * @param {{ title: string, back?: { href: string, label: string } | false, action?: Node }} options
 *   `action`: botón opcional a la derecha del título.
 * @param {...any} children
 */
export function screen({ title, back = HOME, action }, ...children) {
  return h('main', { class: 'screen' },
    h('header', { class: 'screen-header' },
      back && h('a', { class: 'back-link', href: back.href }, h('span', { 'aria-hidden': 'true' }, '‹'), back.label),
      h('div', { class: 'title-row' }, h('h1', { tabindex: '-1' }, title), action),
    ),
    ...children,
  );
}

/**
 * Lista de secciones a la que se navega con un toque.
 * @param {Array<{ label: string, href: string, detail?: string }>} items
 */
export function navList(items) {
  return h('nav', { 'aria-label': 'Secciones' },
    h('ul', { class: 'list' },
      items.map(({ label, href, detail }) => h('li', null,
        h('a', { class: 'list-item', href },
          h('span', { class: 'list-main' }, label),
          detail && h('span', { class: 'count' }, detail),
          chevron(),
        ),
      )),
    ),
  );
}

export function chevron() {
  return h('span', { class: 'chevron', 'aria-hidden': 'true' }, '›');
}

/**
 * Cifras en tarjetas: [['Conceptos', 147], ['Racha', '3 días', true]] (true = ocupa toda la fila).
 * @param {Array<[string, string | number, boolean?]>} items
 */
export function statGrid(items) {
  return h('dl', { class: 'stats' },
    items.map(([label, value, wide]) => h('div', { class: wide ? 'stat stat-wide' : 'stat' },
      h('dt', null, label),
      h('dd', null, value),
    )),
  );
}

/**
 * Selector de una opción con aspecto de botones (radios accesibles por debajo).
 * Con `description` en las opciones se muestra como lista (una opción por fila, explicada).
 * @param {{ legend: string, name: string, value: any, options: Array<{ value: any, label: string, description?: string }>, onChange: (value: any) => void }} options
 */
export function segmented({ legend, name, value, options, onChange }) {
  const asList = options.some((option) => option.description);
  return h('fieldset', { class: `segmented ${asList ? 'segmented-list' : ''}` },
    h('legend', null, legend),
    h('div', {
      class: 'segmented-options',
      style: asList ? null : `grid-template-columns: repeat(${options.length}, minmax(0, 1fr))`,
    },
    options.map((option) => h('label', null,
      h('input', {
        type: 'radio',
        name,
        value: option.value,
        checked: option.value === value,
        onchange: () => onChange(option.value),
      }),
      h('span', null,
        asList ? h('strong', null, option.label) : option.label,
        option.description && h('small', null, option.description),
      ),
    ))),
  );
}

/**
 * Botón que abre el selector de archivos del sistema (en iPhone: Archivos, iCloud Drive…).
 * @param {string} label
 * @param {{ accept: string, onFile: (file: File) => void, primary?: boolean }} options
 */
export function fileButton(label, { accept, onFile, primary = true }) {
  const input = h('input', {
    type: 'file',
    accept,
    class: 'visually-hidden',
    onchange: () => {
      const file = input.files?.[0];
      input.value = ''; // permite volver a elegir el mismo archivo
      if (file) onFile(file);
    },
  });
  return h('label', { class: `btn file-button ${primary ? 'btn-primary btn-large' : 'btn-secondary'}` }, input, label);
}

/**
 * Mensaje a pantalla completa (errores graves).
 * @param {string} title
 * @param {string} text
 */
export function messageScreen(title, text) {
  return h('main', { class: 'screen' },
    h('section', { class: 'card card-alert', role: 'alert' },
      h('h1', { tabindex: '-1' }, title),
      h('p', null, text),
    ),
    h('a', { class: 'btn btn-secondary', href: '#/' }, 'Volver al inicio'),
  );
}
