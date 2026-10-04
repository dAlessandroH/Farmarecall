import { h } from '../utils/dom.js';
import { plural } from '../utils/text.js';
import { screen, chevron } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { getErrorList } from '../services/stats.js';
import { getSetting } from '../database/settings.js';

/**
 * Errores: los conceptos que más fallas (más errores → más tiempo sin repasar → menor dominio),
 * con su paso más fallado. Tocar uno muestra la cadena y permite practicarla.
 */
export function errorsView({ db }) {
  const items = getErrorList(db);

  if (items.length === 0) {
    return screen({ title: 'Errores', back: false },
      h('section', { class: 'card empty-state' },
        icon('check', { size: 32 }),
        h('h2', null, 'Sin errores por ahora'),
        h('p', { class: 'note' }, 'Los pasos que falles aparecerán aquí, del más fallado al menos.'),
      ),
    );
  }

  return screen({ title: 'Errores', back: false },
    h('a', { class: 'btn btn-primary btn-large', href: `#/estudiar?errores=1&n=${getSetting(db, 'sessionSize')}` },
      icon('refresh', { size: 22 }), 'Repasar mis errores'),
    h('ol', { class: 'list' }, items.map(({ concept, progress, topStep }) => h('li', null,
      h('a', { class: 'list-item', href: `#/concepto?id=${encodeURIComponent(concept.id)}&volver=${encodeURIComponent('#/errores')}` },
        h('span', { class: 'list-main' },
          concept.dato,
          topStep && h('span', { class: 'list-sub' }, `${topStep.paso} (${topStep.count})`),
        ),
        h('span', { class: 'count count-bad' }, plural(progress.errorCount, 'error', 'errores')),
        chevron(),
      ),
    ))),
  );
}
