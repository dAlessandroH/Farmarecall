/** Configuración y datos de usuario pequeños, guardados como pares clave-valor en la tabla `settings`. */

export const SESSION_SIZES = [5, 10, 20];

export const STUDY_MODES = ['completar', 'elegir', 'reconstruir'];

export const MODE_LABELS = { completar: 'Completar', elegir: 'Elegir', reconstruir: 'Reconstruir' };

const DEFAULTS = {
  /** Conceptos por sesión. También es la meta diaria. */
  sessionSize: 10,
  /**
   * 'completar': escribir los pasos ocultos · 'elegir': escoger entre opciones (lo más rápido)
   * · 'reconstruir': escribir la cadena entera (lo más difícil).
   */
  studyMode: 'completar',
  /** Tema al que se limita "Estudiar ahora" ('' = todos). */
  studyTopic: '',
  /** Hasta cuándo no recordar la copia de seguridad ("Ahora no"). */
  backupSnoozeUntil: null,
  /** Días con estudio (AAAA-MM-DD), para la racha. */
  studyDays: [],
  /** Fecha de la última copia de seguridad exportada. */
  lastExport: null,
  /** Experiencia acumulada. */
  xp: 0,
  /** Logros conseguidos: { id: fecha }. */
  achievements: {},
  /** Contadores para los logros. */
  counters: { sessions: 0, perfectSessions: 0, perfectRebuilds: 0, recovered: 0, goalDays: 0 },
  /** Actividad de los últimos días: { 'AAAA-MM-DD': { reviews, correct, xp, goalMet } }. */
  activity: {},
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Devuelve una copia (modificarla no altera lo guardado ni los valores por defecto).
 * @param {import('./storage.js').Database} db
 * @param {keyof typeof DEFAULTS} key
 */
export function getSetting(db, key) {
  const row = db.get('settings', key);
  const fallback = JSON.parse(JSON.stringify(DEFAULTS[key] ?? null)); // copia (los valores por defecto son JSON)
  if (row === undefined) return fallback;
  // Así un contador nuevo añadido en una versión futura empieza en su valor por defecto.
  return isPlainObject(fallback) && isPlainObject(row.value) ? { ...fallback, ...row.value } : row.value;
}

/**
 * @param {import('./storage.js').Database} db
 * @param {keyof typeof DEFAULTS} key
 * @param {*} value
 */
export function setSetting(db, key, value) {
  db.put('settings', { key, value });
}
