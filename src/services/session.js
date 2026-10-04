import { endOfDay } from '../utils/dates.js';

/**
 * @typedef {import('../database/models.js').Concept} Concept
 * @typedef {import('../database/models.js').Progress} Progress
 */

/**
 * Orden de "Errores": más errores primero; a igualdad, el que lleva más tiempo sin repasarse;
 * después, el de menor dominio.
 * @param {Progress} a @param {Progress} b
 */
export function byErrors(a, b) {
  return b.errorCount - a.errorCount
    || (a.lastReview ?? 0) - (b.lastReview ?? 0)
    || a.mastery - b.mastery;
}

/**
 * Elige los conceptos de "Estudiar ahora", por prioridad:
 *  1. Pendientes de hoy: primero los vencidos (los más atrasados antes); luego los que vencen
 *     más tarde hoy, empezando por los que tienen más errores.
 *  2. Débiles: el último intento tuvo errores (más errores primero, luego menor dominio).
 *  3. Nuevos, en el orden en que se importaron.
 * Si no queda nada de eso, adelanta los próximos repasos (`ahead: true`).
 *
 * @param {Concept[]} concepts
 * @param {Map<string, Progress>} progressById
 * @param {number} size
 * @param {number} now
 * @returns {{ ids: string[], ahead: boolean }}
 */
export function pickSession(concepts, progressById, size, now) {
  const limit = endOfDay(now);
  const due = [];
  const weak = [];
  const fresh = [];
  const later = [];

  for (const concept of concepts) {
    const progress = progressById.get(concept.id);
    if (!progress || progress.nextReview === null) fresh.push({ concept });
    else if (progress.nextReview <= limit) due.push({ concept, progress });
    else if (progress.mastery === 0) weak.push({ concept, progress });
    else later.push({ concept, progress });
  }

  const overdue = (item) => item.progress.nextReview <= now;
  due.sort((a, b) => {
    if (overdue(a) && overdue(b)) return a.progress.nextReview - b.progress.nextReview;
    if (overdue(a) !== overdue(b)) return overdue(a) ? -1 : 1;
    return byErrors(a.progress, b.progress);
  });
  weak.sort((a, b) => byErrors(a.progress, b.progress));
  later.sort((a, b) => a.progress.nextReview - b.progress.nextReview);

  const queue = [...due, ...weak, ...fresh];
  const ahead = queue.length === 0;
  return { ids: (ahead ? later : queue).slice(0, size).map(({ concept }) => concept.id), ahead: ahead && later.length > 0 };
}

/**
 * Sesión de "Repasar mis errores": los conceptos con más errores (mismo orden que la pantalla Errores).
 * @param {Concept[]} concepts
 * @param {Map<string, Progress>} progressById
 * @param {number} size
 */
export function pickErrorSession(concepts, progressById, size) {
  return concepts
    .filter((concept) => progressById.get(concept.id)?.errorCount > 0)
    .sort((a, b) => byErrors(progressById.get(a.id), progressById.get(b.id)))
    .slice(0, size)
    .map((concept) => concept.id);
}
