import { dayKey, DAY } from '../utils/dates.js';
import { saveFile } from './files.js';
import { getSetting, setSetting } from '../database/settings.js';

/**
 * Copia de seguridad: un archivo JSON con todos los datos (conceptos, progreso, errores,
 * fechas de repaso y configuración). Sirve para no perder nada y para pasar los datos
 * a otro dispositivo o navegador.
 */

const FORMAT = 'farmarecall-copia';
const TABLES = ['concepts', 'progress', 'errors', 'settings'];

/** @param {import('../database/storage.js').Database} db */
export function createBackup(db, now = Date.now()) {
  return {
    format: FORMAT,
    version: 1,
    app: 'FarmaRecall',
    exportedAt: new Date(now).toISOString(),
    data: Object.fromEntries(TABLES.map((table) => [table, db.getAll(table)])),
  };
}

export function backupFileName(now = Date.now()) {
  return `farmarecall-copia-${dayKey(now)}.json`;
}

/**
 * Exporta la copia (en iPhone abre Compartir; en el ordenador la descarga) y apunta la fecha.
 * Hay que llamarla directamente desde un toque: iOS lo exige para compartir archivos.
 * @returns {{ count: number, saving: Promise<void> }}
 */
export function exportBackup(db, now = Date.now()) {
  const backup = createBackup(db, now);
  const saving = saveFile(JSON.stringify(backup, null, 2), backupFileName(now), 'application/json');
  setSetting(db, 'lastExport', now);
  return { count: backup.data.concepts.length, saving };
}

/** Recordatorio en Inicio: tras 10 repasos, si no hay copia o tiene más de 7 días (y no se pospuso). */
const REMIND_AFTER = 7 * DAY;
const SNOOZE_FOR = 3 * DAY;
const MIN_REVIEWS = 10;

export function shouldRemindBackup(db, now = Date.now()) {
  const reviews = db.getAll('progress').reduce((sum, row) => sum + row.reviewCount, 0);
  const lastExport = getSetting(db, 'lastExport');
  const snoozedUntil = getSetting(db, 'backupSnoozeUntil');
  return reviews >= MIN_REVIEWS
    && (lastExport === null || now - lastExport > REMIND_AFTER)
    && !(snoozedUntil !== null && now < snoozedUntil);
}

/** "Ahora no": volver a recordarlo dentro de 3 días. */
export function snoozeBackupReminder(db, now = Date.now()) {
  setSetting(db, 'backupSnoozeUntil', now + SNOOZE_FOR);
}

/**
 * Lee y valida una copia. Lanza un error con un mensaje claro si el archivo no sirve.
 * @param {string} text
 * @returns {{ concepts: object[], progress: object[], errors: object[], settings: object[] }}
 */
export function parseBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error('Este archivo no es una copia de FarmaRecall.');
  }
  if (backup?.format !== FORMAT || !TABLES.every((table) => Array.isArray(backup.data?.[table]))) {
    throw new Error('Este archivo no es una copia de FarmaRecall.');
  }
  const validConcepts = backup.data.concepts.every((c) => (
    typeof c?.id === 'string' && typeof c.dato === 'string' && typeof c.cadenaOriginal === 'string' && Array.isArray(c.pasos)
  ));
  const validProgress = backup.data.progress.every((p) => typeof p?.conceptId === 'string');
  if (!validConcepts || !validProgress) throw new Error('La copia está incompleta o dañada.');
  return backup.data;
}

/**
 * Sustituye todos los datos por los de la copia.
 * @param {import('../database/storage.js').Database} db
 * @param {ReturnType<typeof parseBackup>} data
 */
export function restoreBackup(db, data) {
  for (const table of TABLES) db.replaceAll(table, data[table]);
}
