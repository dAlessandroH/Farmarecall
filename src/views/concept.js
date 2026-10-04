import { h } from '../utils/dom.js';
import { formatNextReview, formatPast } from '../utils/dates.js';
import { screen, statGrid } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { chainList } from '../components/chain.js';
import { masteryStatus, newProgress, STATUS_LABELS, MAX_LEVEL } from '../spacedRepetition/scheduler.js';
import { deleteConcept } from '../services/concepts.js';
import { errorRowsFor } from '../services/review.js';

/** Detalle de un concepto: cadena, dominio, repasos, errores y botón para estudiarlo. */
export function conceptView({ db, params }) {
  const id = params.get('id') ?? '';
  const backHref = safeBackHref(params.get('volver'));
  const back = { href: backHref, label: backHref.startsWith('#/errores') ? 'Errores' : 'Biblioteca' };
  const concept = db.get('concepts', id);

  if (!concept) {
    return screen({ title: 'Concepto no encontrado', back },
      h('p', { class: 'note' }, 'Puede que se haya eliminado.'),
    );
  }

  const now = Date.now();
  const progress = db.get('progress', id) ?? newProgress(id);
  const status = masteryStatus(progress);
  const errorRows = errorRowsFor(db, id);

  const editButton = h('a', {
    class: 'icon-button',
    href: `#/editar?id=${encodeURIComponent(id)}&volver=${encodeURIComponent(backHref)}`,
    'aria-label': 'Editar concepto',
  }, icon('edit', { size: 20 }));

  return screen({ title: concept.dato, back, action: editButton },
    concept.tema && h('p', { class: 'topic-chip' }, icon('tag', { size: 14 }), concept.tema),
    chainList(concept.pasos),
    statGrid([
      ['Dominio', `${STATUS_LABELS[status]} · nivel ${progress.mastery} de ${MAX_LEVEL}`, true],
      ['Repasos', progress.reviewCount],
      ['Errores', progress.errorCount],
      ['Próximo repaso', formatNextReview(progress.nextReview, now)],
      ['Último repaso', formatPast(progress.lastReview, now)],
    ]),
    errorRows.length > 0 && h('section', { class: 'card' },
      h('h2', null, 'Pasos que más fallas'),
      h('ul', { class: 'error-steps' },
        errorRows.map((row) => h('li', null,
          h('span', null, row.paso),
          h('span', { class: 'count' }, row.count === 1 ? '1 vez' : `${row.count} veces`),
        )),
      ),
    ),
    h('a', { class: 'btn btn-primary btn-large', href: `#/estudiar?concepto=${encodeURIComponent(id)}` },
      icon('play', { size: 22 }), 'Estudiar este concepto'),
    h('button', {
      type: 'button',
      class: 'btn btn-danger',
      onclick: () => {
        if (!window.confirm(`¿Eliminar "${concept.dato}" con su progreso y sus errores? No se puede deshacer.`)) return;
        deleteConcept(db, id);
        location.hash = backHref;
      },
    }, 'Eliminar concepto'),
  );
}

/** Solo se aceptan rutas internas de la app como destino de "volver". */
function safeBackHref(value) {
  return typeof value === 'string' && value.startsWith('#/') ? value : '#/biblioteca';
}
