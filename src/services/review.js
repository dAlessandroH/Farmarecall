import { scheduleReview, newProgress } from '../spacedRepetition/scheduler.js';
import { getSetting, setSetting } from '../database/settings.js';
import { dayKey } from '../utils/dates.js';

/**
 * Los errores se guardan agrupados por concepto y paso: { conceptId, paso, count, lastDate }.
 * Así la tabla no crece sin límite aunque se estudie durante años.
 */
const errorId = (conceptId, paso) => JSON.stringify([conceptId, paso]);

/**
 * Pasos fallados de un concepto, del más fallado al menos.
 * @param {import('../database/storage.js').Database} db
 * @param {string} conceptId
 */
export function errorRowsFor(db, conceptId) {
  return db.getAll('errors')
    .filter((row) => row.conceptId === conceptId)
    .sort((a, b) => b.count - a.count || b.lastDate - a.lastDate);
}

/** Veces que se ha fallado cada paso de un concepto: Map(paso → veces). */
export function failedStepCounts(db, conceptId) {
  return new Map(errorRowsFor(db, conceptId).map((row) => [row.paso, row.count]));
}

/**
 * Registra un intento: progreso y próximo repaso, errores por paso y día de estudio.
 * Devuelve `undo()` para deshacerlo (lo usa "Marcar como correcta").
 *
 * @param {import('../database/storage.js').Database} db
 * @param {{ id: string }} concept
 * @param {Array<{ expected: string, correct: boolean, hinted?: boolean }>} results  Un elemento por paso evaluado.
 */
export function recordAttempt(db, concept, results, now = Date.now()) {
  const previousProgress = db.get('progress', concept.id);
  const previousErrors = errorRowsFor(db, concept.id);
  const failed = results.filter((result) => !result.correct);

  const progress = scheduleReview(
    previousProgress ?? newProgress(concept.id),
    { correct: failed.length === 0, failedSteps: failed.length, hinted: results.some((result) => result.hinted) },
    now,
  );
  db.put('progress', progress);

  if (failed.length > 0) {
    const rows = new Map(previousErrors.map((row) => [row.id, row]));
    for (const { expected } of failed) {
      const id = errorId(concept.id, expected);
      const row = rows.get(id) ?? { id, conceptId: concept.id, paso: expected, count: 0 };
      rows.set(id, { ...row, count: row.count + 1, lastDate: now });
    }
    db.putMany('errors', [...rows.values()]);
  }
  markStudyDay(db, now);

  return {
    progress,
    /** Progreso antes de este intento (undefined si era la primera vez). */
    previous: previousProgress,
    undo() {
      if (previousProgress) db.put('progress', previousProgress);
      else db.delete('progress', concept.id);
      const others = db.getAll('errors').filter((row) => row.conceptId !== concept.id);
      db.replaceAll('errors', [...others, ...previousErrors]);
    },
  };
}

/** Guarda que hoy se estudió (para la racha). Conserva como mucho los últimos 400 días. */
function markStudyDay(db, now) {
  const days = getSetting(db, 'studyDays');
  const today = dayKey(now);
  if (days[days.length - 1] !== today) setSetting(db, 'studyDays', [...days, today].slice(-400));
}
