import { h } from '../utils/dom.js';
import { plural } from '../utils/text.js';
import { screen, fileButton } from '../components/ui.js';
import { parseConceptsCsv } from '../parser/concepts.js';
import { importConcepts } from '../services/concepts.js';
import { readTextFile } from '../services/files.js';
import { requestPersistentStorage } from '../services/pwa.js';
import { getSetting } from '../database/settings.js';
import { announceRewards } from '../components/toast.js';
import { unlockAchievements } from '../gamification/achievements.js';

const CSV_TYPES = '.csv,.txt,text/csv,text/plain,text/comma-separated-values';
const MAX_ERRORS_SHOWN = 20;

/** Importar CSV: elegir archivo → resumen → comenzar a estudiar. */
export function importView({ db }) {
  const result = h('div', { class: 'stack' });

  async function handleFile(file) {
    result.replaceChildren(h('p', { class: 'note', role: 'status' }, 'Leyendo el archivo…'));
    try {
      const parsed = parseConceptsCsv(await readTextFile(file));
      const saved = importConcepts(db, parsed.items);
      if (parsed.items.length > 0) requestPersistentStorage();
      announceRewards({ achievements: unlockAchievements(db) });
      result.replaceChildren(summaryCard(file.name, parsed, saved, getSetting(db, 'sessionSize')));
    } catch (error) {
      result.replaceChildren(h('section', { class: 'card card-alert', role: 'alert' },
        h('h2', { tabindex: '-1' }, 'No se pudo importar'),
        h('p', null, error.message),
      ));
    }
    result.querySelector('h2')?.focus();
  }

  return screen({ title: 'Importar CSV' },
    h('section', { class: 'card' },
      h('p', null, 'Un archivo con dos columnas, ', h('strong', null, 'dato'), ' y ', h('strong', null, 'cadena'),
        '. Los pasos de la cadena se separan con →'),
      h('pre', { class: 'format' }, 'dato,cadena\nM3,"Gq → ↑ IP₃/DAG → ↑ Ca²⁺ → contracción"'),
      h('p', { class: 'note' }, 'Opcional: una tercera columna ', h('strong', null, 'tema'), ' (p. ej. Autonómico, Cardio) para estudiar por bloques.'),
      h('p', { class: 'note' }, 'Si un dato ya existe, se actualiza su cadena y se conserva tu progreso.'),
    ),
    fileButton('Elegir archivo CSV', { accept: CSV_TYPES, onFile: handleFile }),
    result,
  );
}

/**
 * @param {string} fileName
 * @param {ReturnType<typeof parseConceptsCsv>} parsed
 * @param {ReturnType<typeof importConcepts>} saved
 * @param {number} sessionSize
 */
function summaryCard(fileName, { items, errors, rowCount }, saved, sessionSize) {
  const imported = items.length > 0;
  const title = !imported ? 'No se importó ningún concepto'
    : errors.length > 0 ? 'Importado, con filas por revisar'
      : 'Archivo importado correctamente';
  const changes = [
    saved.created && plural(saved.created, 'nuevo', 'nuevos'),
    saved.updated && plural(saved.updated, 'actualizado', 'actualizados'),
    saved.unchanged && `${saved.unchanged} sin cambios`,
  ].filter(Boolean).join(' · ');

  return h('section', { class: `card ${imported ? 'card-ok' : 'card-alert'}` },
    h('h2', { tabindex: '-1' }, title),
    h('p', { class: 'note' }, fileName),
    h('ul', { class: 'import-counts' },
      h('li', null, h('strong', null, rowCount), rowCount === 1 ? ' concepto' : ' conceptos'),
      h('li', null, h('strong', null, items.length), items.length === 1 ? ' cadena válida' : ' cadenas válidas'),
      h('li', null, h('strong', null, errors.length), errors.length === 1 ? ' error' : ' errores'),
    ),
    imported && changes && h('p', { class: 'note' }, changes),
    errors.length > 0 && h('ul', { class: 'row-errors' },
      errors.slice(0, MAX_ERRORS_SHOWN).map((error) => h('li', null, h('strong', null, `Fila ${error.row}: `), error.message)),
      errors.length > MAX_ERRORS_SHOWN && h('li', null, `…y ${errors.length - MAX_ERRORS_SHOWN} más.`),
    ),
    imported && h('a', { class: 'btn btn-primary btn-large', href: `#/estudiar?n=${sessionSize}` }, 'Comenzar a estudiar'),
    imported && h('a', { class: 'btn btn-secondary', href: '#/biblioteca' }, 'Ver biblioteca'),
  );
}
