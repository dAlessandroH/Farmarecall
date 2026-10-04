import { h } from '../utils/dom.js';
import { normalizeAnswer, compareText, plural } from '../utils/text.js';
import { screen, chevron } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { masteryStatus, STATUS_LABELS, MAX_LEVEL } from '../spacedRepetition/scheduler.js';
import { listTopics } from '../services/concepts.js';

const FILTERS = [
  ['', 'Todos'],
  ['nuevo', 'Nuevos'],
  ['debil', 'Débiles'],
  ['aprendiendo', 'En progreso'],
  ['dominado', 'Dominados'],
];

/**
 * Biblioteca: todos los conceptos, con buscador y filtros por estado y por tema.
 * Búsqueda y filtros se guardan en la URL (#/biblioteca?q=…&f=…&t=…) para recuperarlos al volver del detalle.
 */
export function libraryView({ db, params }) {
  const progress = new Map(db.getAll('progress').map((row) => [row.conceptId, row]));
  const concepts = db.getAll('concepts').sort((a, b) => compareText(a.dato, b.dato));
  const importButton = h('a', { class: 'icon-button', href: '#/importar', 'aria-label': 'Importar CSV' }, icon('upload', { size: 22 }));

  if (concepts.length === 0) {
    return screen({ title: 'Biblioteca', back: false },
      h('section', { class: 'card empty-state' },
        icon('book', { size: 32 }),
        h('p', null, 'Todavía no hay conceptos.'),
        h('a', { class: 'btn btn-primary', href: '#/importar' }, 'Importar CSV'),
      ),
    );
  }

  const items = concepts.map((concept) => {
    const row = progress.get(concept.id);
    return { concept, row, status: masteryStatus(row), text: normalizeAnswer(`${concept.dato} ${concept.cadenaOriginal} ${concept.tema ?? ''}`) };
  });
  let filter = FILTERS.some(([value]) => value === params.get('f')) ? params.get('f') : '';
  const topics = listTopics(db);
  let topic = topics.includes(params.get('t')) ? params.get('t') : '';
  const topicSelect = topics.length > 0 && h('select', {
    class: 'select',
    'aria-label': 'Filtrar por tema',
    onchange: (event) => {
      topic = event.target.value;
      render();
    },
  },
  h('option', { value: '' }, 'Todos los temas'),
  topics.map((name) => h('option', { value: name, selected: name === topic }, name)));

  const search = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Buscar dato o paso',
    'aria-label': 'Buscar en la biblioteca',
    value: params.get('q') ?? '',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
  });
  const filterButtons = FILTERS.map(([value, label]) => {
    const count = value ? items.filter((item) => item.status === value).length : items.length;
    return h('button', {
      type: 'button',
      class: 'filter',
      'data-filter': value,
      onclick: () => {
        filter = value;
        render();
      },
    }, label, h('span', { class: 'filter-count' }, count));
  });
  const count = h('p', { class: 'note', 'aria-live': 'polite' });
  const list = h('ul', { class: 'list' });

  function currentHref() {
    const query = new URLSearchParams();
    if (search.value) query.set('q', search.value);
    if (filter) query.set('f', filter);
    if (topic) query.set('t', topic);
    const text = query.toString();
    return text ? `#/biblioteca?${text}` : '#/biblioteca';
  }

  function render() {
    const query = normalizeAnswer(search.value);
    const shown = items.filter((item) => (!filter || item.status === filter)
      && (!topic || item.concept.tema === topic)
      && (!query || item.text.includes(query)));
    filterButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    count.textContent = shown.length === items.length ? plural(items.length, 'concepto', 'conceptos') : `${shown.length} de ${items.length}`;
    // Recordar búsqueda y filtro al volver del detalle, sin crear entradas nuevas en el historial.
    history.replaceState(null, '', currentHref());
    list.replaceChildren(...(shown.length > 0
      ? shown.map((item) => conceptRow(item, currentHref()))
      : [h('li', { class: 'list-empty' }, 'Sin resultados.')]));
  }

  search.addEventListener('input', render);
  render();

  return screen({ title: 'Biblioteca', back: false, action: importButton },
    h('div', { class: 'search-box' }, icon('search', { size: 18 }), search),
    h('div', { class: 'filters', role: 'group', 'aria-label': 'Filtrar por estado' }, filterButtons),
    topicSelect,
    count,
    list,
  );
}

function conceptRow({ concept, row, status }, backHref) {
  const level = row?.mastery ?? 0;
  return h('li', null,
    h('a', { class: 'list-item', href: `#/concepto?id=${encodeURIComponent(concept.id)}&volver=${encodeURIComponent(backHref)}` },
      h('span', { class: 'list-main' },
        concept.dato,
        concept.tema && h('span', { class: 'list-sub' }, concept.tema),
        h('span', { class: 'level-dots', 'aria-label': `Nivel ${level} de ${MAX_LEVEL}` },
          Array.from({ length: MAX_LEVEL }, (_, i) => h('span', { class: i < level ? 'is-filled' : '' }))),
      ),
      h('span', { class: `badge badge-${status}` }, STATUS_LABELS[status]),
      chevron(),
    ),
  );
}
