import { test, assert, assertEqual, assertThrows, waitFor } from './runner.js';
import { freshStorage, mount, texts } from './helpers.js';
import { parseConceptsCsv } from '../src/parser/concepts.js';
import { importConcepts } from '../src/services/concepts.js';
import { recordAttempt } from '../src/services/review.js';
import { createBackup, backupFileName, parseBackup, restoreBackup, shouldRemindBackup, snoozeBackupReminder } from '../src/services/backup.js';
import { DAY } from '../src/utils/dates.js';
import { setSetting, getSetting } from '../src/database/settings.js';
import { backupView } from '../src/views/backup.js';

const PREFIX = 'farmarecall-pruebas-copia';
const OTHER = 'farmarecall-pruebas-copia-otro';

function seed() {
  const db = freshStorage(PREFIX);
  importConcepts(db, parseConceptsCsv('dato,cadena\nMORFINA,"agonista μ → Gi/o → ↓ AMPc, ↑ K⁺"\nM3,"Gq → ↑ Ca²⁺"').items);
  const morfina = db.getAll('concepts')[0];
  recordAttempt(db, morfina, [{ expected: 'Gi/o', correct: false }, { expected: '↓ AMPc, ↑ K⁺', correct: true }]);
  setSetting(db, 'sessionSize', 20);
  return db;
}

test('Copia de seguridad: exportar y restaurar en otro sitio recupera todo (conceptos, progreso, errores, fechas)', () => {
  const db = seed();
  const json = JSON.stringify(createBackup(db, 1000));
  const other = freshStorage(OTHER);
  restoreBackup(other, parseBackup(json));
  for (const table of ['concepts', 'progress', 'errors', 'settings']) {
    assertEqual(other.getAll(table), db.getAll(table), table);
  }
  assertEqual(getSetting(other, 'sessionSize'), 20);
  assertEqual(backupFileName(new Date(2026, 9, 3).getTime()), 'farmarecall-copia-2026-10-03.json');
  db.clear();
  other.clear();
});

test('Copia de seguridad: rechaza archivos que no son una copia válida', () => {
  assertThrows(() => parseBackup('dato,cadena\nM3,"A → B"'), 'no es una copia');
  assertThrows(() => parseBackup('{"format":"otra-app","data":{}}'), 'no es una copia');
  assertThrows(() => parseBackup(JSON.stringify({
    format: 'farmarecall-copia', data: { concepts: [{ dato: 'sin id' }], progress: [], errors: [], settings: [] },
  })), 'dañada');
});

test('Pantalla Copia de seguridad: restaurar pide confirmación y sustituye los datos', async () => {
  const source = seed();
  const json = JSON.stringify(createBackup(source));
  const db = freshStorage(OTHER);
  importConcepts(db, parseConceptsCsv('dato,cadena\nVIEJO,"A → B"').items);

  const view = backupView({ db });
  const unmount = mount(view);
  const realConfirm = window.confirm;
  try {
    assertEqual(texts(view.querySelectorAll('button.btn')), ['Exportar datos', 'Borrar todos los datos']);
    const input = view.querySelector('input[type=file]');
    const pick = (content) => {
      const files = new DataTransfer();
      files.items.add(new File([content], 'copia.json', { type: 'application/json' }));
      input.files = files.files;
      input.dispatchEvent(new Event('change'));
    };

    window.confirm = () => false;
    pick(json);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assertEqual(db.getAll('concepts').map((c) => c.dato), ['VIEJO'], 'cancelar no cambia nada');

    window.confirm = () => true;
    pick(json);
    await waitFor(() => view.querySelector('.card-ok'), { message: 'no se restauró' });
    assertEqual(db.getAll('concepts').map((c) => c.dato), ['MORFINA', 'M3']);
    assertEqual(db.getAll('errors').length, 1);

    pick('esto no es json');
    await waitFor(() => view.querySelector('.card-alert'), { message: 'no avisó del archivo inválido' });
    assert(view.querySelector('.card-alert').textContent.includes('no es una copia'));
  } finally {
    window.confirm = realConfirm;
    unmount();
    source.clear();
    db.clear();
  }
});

test('Recordatorio de copia: tras 10 repasos sin copia reciente, y "Ahora no" lo pospone 3 días', () => {
  const db = freshStorage(PREFIX);
  const now = Date.now();
  db.put('concepts', { id: 'c', dato: 'C', cadenaOriginal: 'A → B', pasos: ['A', 'B'] });
  db.put('progress', { conceptId: 'c', mastery: 1, streak: 1, errorCount: 0, reviewCount: 9, nextReview: now, lastReview: now });
  assertEqual(shouldRemindBackup(db, now), false, 'con 9 repasos todavía no');
  db.put('progress', { conceptId: 'c', mastery: 1, streak: 1, errorCount: 0, reviewCount: 10, nextReview: now, lastReview: now });
  assertEqual(shouldRemindBackup(db, now), true, 'sin ninguna copia');
  setSetting(db, 'lastExport', now - 2 * DAY);
  assertEqual(shouldRemindBackup(db, now), false, 'copia reciente');
  setSetting(db, 'lastExport', now - 8 * DAY);
  assertEqual(shouldRemindBackup(db, now), true, 'copia de hace más de 7 días');
  snoozeBackupReminder(db, now);
  assertEqual(shouldRemindBackup(db, now + 2 * DAY), false, 'pospuesto');
  assertEqual(shouldRemindBackup(db, now + 4 * DAY), true, 'pasados 3 días vuelve');
  db.clear();
});
