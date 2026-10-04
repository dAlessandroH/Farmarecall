import { MINUTE, DAY } from '../utils/dates.js';

/**
 * Repetición espaciada sencilla, basada en el desempeño.
 * Para ajustarla basta con cambiar estos valores; el resto de la app no cambia.
 */
export const SCHEDULE = {
  /** Tras un intento con errores, volver a mostrar el concepto en… */
  retryAfterError: 10 * MINUTE,
  /** Intervalo tras cada nivel de dominio: nivel 1 → 1 día, 2 → 3 días… El último se repite. */
  intervals: [1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY],
  /** Niveles de dominio que se pierden al fallar. */
  levelsLostOnError: 2,
  /** Nivel desde el que un concepto cuenta como dominado (3 → se repasa cada 7 días o más). */
  masteredLevel: 3,
};

export const MAX_LEVEL = SCHEDULE.intervals.length;

/** @param {string} conceptId @returns {import('../database/models.js').Progress} */
export function newProgress(conceptId) {
  return { conceptId, mastery: 0, streak: 0, errorCount: 0, reviewCount: 0, nextReview: null, lastReview: null };
}

/**
 * Nuevo progreso tras un intento. Acierto (todos los pasos bien): sube un nivel y el próximo
 * repaso se aleja. Con errores: baja niveles y se repite pronto. Bien pero con pista:
 * ni sube ni baja, y se repite pronto (aún no lo recuerdas solo).
 *
 * @param {import('../database/models.js').Progress} progress
 * @param {{ correct: boolean, failedSteps: number, hinted?: boolean }} attempt
 * @param {number} now
 */
export function scheduleReview(progress, { correct, failedSteps, hinted = false }, now, schedule = SCHEDULE) {
  if (correct && hinted) {
    return { ...progress, reviewCount: progress.reviewCount + 1, lastReview: now, nextReview: now + schedule.retryAfterError };
  }
  const mastery = correct
    ? Math.min(progress.mastery + 1, schedule.intervals.length)
    : Math.max(0, progress.mastery - schedule.levelsLostOnError);
  return {
    ...progress,
    mastery,
    streak: correct ? progress.streak + 1 : 0,
    reviewCount: progress.reviewCount + 1,
    errorCount: progress.errorCount + failedSteps,
    lastReview: now,
    nextReview: now + (correct ? schedule.intervals[mastery - 1] : schedule.retryAfterError),
  };
}

/**
 * Estado de un concepto para mostrarlo en la biblioteca y en Progreso.
 * @param {import('../database/models.js').Progress | undefined} progress
 * @returns {'nuevo' | 'debil' | 'aprendiendo' | 'dominado'}
 */
export function masteryStatus(progress, schedule = SCHEDULE) {
  if (!progress || progress.reviewCount === 0) return 'nuevo';
  if (progress.mastery >= schedule.masteredLevel) return 'dominado';
  if (progress.mastery === 0) return 'debil';
  return 'aprendiendo';
}

export const STATUS_LABELS = {
  nuevo: 'Nuevo',
  debil: 'Débil',
  aprendiendo: 'En progreso',
  dominado: 'Dominado',
};
