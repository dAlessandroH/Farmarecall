import { h, setChildren } from '../utils/dom.js';
import { formatPast } from '../utils/dates.js';
import { plural } from '../utils/text.js';
import { screen, fileButton } from '../components/ui.js';
import { progressBar } from '../components/progress.js';
import { exportBackup, parseBackup, restoreBackup } from '../services/backup.js';
import { readTextFile } from '../services/files.js';
import { getSetting } from '../database/settings.js';
import { STORAGE_LIMIT_BYTES } from '../database/storage.js';
import { APP_VERSION } from '../version.js';

/** Copia de seguridad: exportar, restaurar o borrar todos los datos de este dispositivo. */
export function backupView({ db }) {
  const conceptCount = db.getAll('concepts').length;
  const status = h('div', { class: 'stack' });
  const lastExportLine = h('p', { class: 'note' }, lastExportText(getSetting(db, 'lastExport')));

  function exportData() {
    // Sin esperar a nada antes: iOS exige que compartir/descargar salga directamente del toque.
    const { count, saving } = exportBackup(db);
    saving.catch((error) => setChildren(status, alertCard('No se pudo exportar', error.message)));
    lastExportLine.textContent = lastExportText(Date.now());
    setChildren(status, h('section', { class: 'card card-ok', role: 'status' },
      h('h2', null, 'Copia creada'),
      h('p', null, `${plural(count, 'concepto', 'conceptos')} con su progreso. `
        + 'Guárdala en un lugar seguro (Archivos, iCloud Drive, tu correo…).'),
    ));
  }

  async function restore(file) {
    try {
      const data = parseBackup(await readTextFile(file));
      const question = `Se reemplazarán todos los datos de este dispositivo por los de la copia `
        + `(${plural(data.concepts.length, 'concepto', 'conceptos')}). ¿Continuar?`;
      if (!window.confirm(question)) return;
      restoreBackup(db, data);
      setChildren(status, h('section', { class: 'card card-ok', role: 'status' },
        h('h2', { tabindex: '-1' }, 'Copia restaurada'),
        h('p', null, `${plural(data.concepts.length, 'concepto', 'conceptos')} con su progreso y sus errores.`),
        h('a', { class: 'btn btn-primary', href: '#/' }, 'Ir al inicio'),
      ));
    } catch (error) {
      setChildren(status, alertCard('No se pudo restaurar', error.message));
    }
    status.querySelector('h2')?.focus();
  }

  function deleteAll() {
    const question = '¿Borrar todos los conceptos, el progreso y los errores de este dispositivo? '
      + 'No se puede deshacer. Si quieres conservarlos, exporta antes una copia.';
    if (!window.confirm(question)) return;
    db.clear();
    location.hash = '#/';
  }

  return screen({ title: 'Copia de seguridad' },
    h('p', null, 'Tus datos solo se guardan en este dispositivo. Exporta una copia de vez en cuando para no perderlos '
      + 'o para pasarlos a otro dispositivo.'),
    lastExportLine,
    h('button', { class: 'btn btn-primary btn-large', type: 'button', disabled: conceptCount === 0, onclick: exportData }, 'Exportar datos'),
    fileButton('Restaurar una copia', { accept: '.json,application/json', onFile: restore, primary: false }),
    status,
    storageCard(db),
    h('button', { class: 'btn btn-danger', type: 'button', disabled: conceptCount === 0, onclick: deleteAll }, 'Borrar todos los datos'),
    h('p', { class: 'app-version' }, `FarmaRecall ${APP_VERSION} · Sin cuentas ni servidores: tus datos no salen de este dispositivo.`),
  );
}

/** Cuánto ocupan los datos en el navegador (el límite es de unos 5 MB: miles de conceptos). */
function storageCard(db) {
  const used = db.bytesUsed();
  const size = used < 1024 * 1024 ? `${Math.max(1, Math.round(used / 1024))} KB` : `${(used / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return h('section', { class: 'card' },
    h('h2', null, 'Espacio usado'),
    progressBar(used, STORAGE_LIMIT_BYTES, { label: 'Espacio usado', tone: used / STORAGE_LIMIT_BYTES > 0.8 ? 'accent' : 'primary' }),
    h('p', { class: 'note' }, `${size} de unos 5 MB disponibles en este navegador.`),
  );
}

function lastExportText(time) {
  return time ? `Última copia: ${formatPast(time, Date.now()).toLowerCase()}.` : 'Todavía no has exportado ninguna copia.';
}

function alertCard(title, message) {
  return h('section', { class: 'card card-alert', role: 'alert' }, h('h2', { tabindex: '-1' }, title), h('p', null, message));
}
