import { endOfDay, dayKey, DAY } from '../utils/dates.js';
import { masteryStatus } from '../spacedRepetition/scheduler.js';
import { getSetting } from '../database/settings.js';
import { byErrors } from './session.js';

/** @param {import('../database/storage.js').Database} db */
function progressMap(db) {
  return new Map(db.getAll('progress').map((row) => [row.conceptId, row]));
}

/**
 * Resumen pequeño para la pantalla de inicio.
 *  - dueToday: conceptos ya estudiados cuyo repaso vence hoy (o ya venció).
 *  - newCount: conceptos que todavía no se han estudiado nunca.
 *  - nextReview: el próximo repaso que no es de hoy (para "Todo al día").
 *
 * @param {import('../database/storage.js').Database} db
 * @param {number} [now]
 */
export function getHomeSummary(db, now = Date.now()) {
  const concepts = db.getAll('concepts');
  const progress = progressMap(db);
  const limit = endOfDay(now);

  let dueToday = 0;
  let newCount = 0;
  let nextReview = null;
  for (const concept of concepts) {
    const next = progress.get(concept.id)?.nextReview ?? null;
    if (next === null) newCount++;
    else if (next <= limit) dueToday++;
    else if (nextReview === null || next < nextReview) nextReview = next;
  }
  return { total: concepts.length, dueToday, newCount, nextReview };
}

/**
 * Cifras de la pantalla Progreso.
 * @param {import('../database/storage.js').Database} db
 * @param {number} [now]
 */
export function getProgressStats(db, now = Date.now()) {
  const concepts = db.getAll('concepts');
  const progress = progressMap(db);
  const byStatus = { nuevo: 0, debil: 0, aprendiendo: 0, dominado: 0 };
  let reviews = 0;
  let errors = 0;
  for (const concept of concepts) {
    const row = progress.get(concept.id);
    byStatus[masteryStatus(row)]++;
    reviews += row?.reviewCount ?? 0;
    errors += row?.errorCount ?? 0;
  }
  return {
    total: concepts.length,
    ...byStatus,
    dueToday: getHomeSummary(db, now).dueToday,
    reviews,
    errors,
    streak: studyStreak(getSetting(db, 'studyDays'), now),
  };
}

/**
 * Día de descanso: saltarse un único día no rompe la racha, una vez cada 7 días.
 * (Perder una racha larga por un solo día desmotiva mucho.)
 */
export const REST_DAY_EVERY = 7;

/** Número entero de día de una fecha AAAA-MM-DD (sin problemas con el horario de verano). */
function dayNumber(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY);
}

const canRest = (run, restDay) => run.lastRest === null || restDay - run.lastRest >= REST_DAY_EVERY;

/** Rachas de días con estudio (cuenta los días estudiados), permitiendo el día de descanso. */
function streakRuns(days) {
  const runs = [];
  let run = null;
  for (const day of [...new Set(days)].map(dayNumber).sort((a, b) => a - b)) {
    const gap = run ? day - run.end : Infinity;
    if (gap === 1) {
      run.end = day;
      run.length++;
    } else if (gap === 2 && canRest(run, day - 1)) {
      run.end = day;
      run.length++;
      run.lastRest = day - 1;
    } else {
      run = { end: day, length: 1, lastRest: null };
      runs.push(run);
    }
  }
  return runs;
}

/**
 * Racha actual: días con estudio hasta hoy. Sigue viva si hoy aún no has estudiado,
 * y también si ayer fue tu día de descanso.
 * @param {string[]} days  Días AAAA-MM-DD.
 * @param {number} now
 */
export function studyStreak(days, now) {
  const runs = streakRuns(days);
  const last = runs[runs.length - 1];
  if (!last) return 0;
  const today = dayNumber(dayKey(now));
  const gap = today - last.end;
  if (gap <= 1) return last.length;
  if (gap === 2 && canRest(last, today - 1)) return last.length;
  return 0;
}

/**
 * La racha más larga (con las mismas reglas).
 * @param {string[]} days  Días AAAA-MM-DD.
 */
export function bestStreak(days) {
  return Math.max(0, ...streakRuns(days).map((run) => run.length));
}

/**
 * Conceptos con errores, ordenados como pide la pantalla Errores, con su paso más fallado.
 * @param {import('../database/storage.js').Database} db
 */
export function getErrorList(db) {
  const progress = progressMap(db);
  const topStep = new Map();
  for (const row of db.getAll('errors')) {
    const current = topStep.get(row.conceptId);
    if (!current || row.count > current.count) topStep.set(row.conceptId, row);
  }
  return db.getAll('concepts')
    .filter((concept) => progress.get(concept.id)?.errorCount > 0)
    .sort((a, b) => byErrors(progress.get(a.id), progress.get(b.id)))
    .map((concept) => ({ concept, progress: progress.get(concept.id), topStep: topStep.get(concept.id) ?? null }));
}
