import { XP_RULES, levelFromXp } from './levels.js';
import { getSetting, setSetting } from '../database/settings.js';
import { dayKey, DAY } from '../utils/dates.js';

const ACTIVITY_DAYS = 90;
/** Ajustes que cambia una recompensa (se guardan antes para poder deshacerla). */
const TRACKED_KEYS = ['xp', 'activity', 'counters'];

/**
 * La meta diaria es completar una sesión: tantos conceptos como el tamaño de sesión elegido
 * (o todos los de la biblioteca, si hay menos, para que siempre sea alcanzable).
 */
export function dailyGoal(db) {
  return Math.max(1, Math.min(getSetting(db, 'sessionSize'), db.getAll('concepts').length));
}

/** Actividad de un día (por defecto, hoy). */
export function dayActivity(db, now = Date.now()) {
  return { reviews: 0, correct: 0, xp: 0, goalMet: false, ...getSetting(db, 'activity')[dayKey(now)] };
}

/**
 * Los últimos `days` días, del más antiguo a hoy, con sus repasos y XP.
 * @returns {Array<{ key: string, time: number, reviews: number, xp: number }>}
 */
export function recentActivity(db, now = Date.now(), days = 7) {
  const activity = getSetting(db, 'activity');
  return Array.from({ length: days }, (_, i) => {
    const time = now - (days - 1 - i) * DAY;
    const key = dayKey(time);
    return { key, time, reviews: activity[key]?.reviews ?? 0, xp: activity[key]?.xp ?? 0 };
  });
}

/**
 * XP y contadores por un concepto respondido. Devuelve la XP del concepto (`xp`), la de la meta
 * del día si se acaba de cumplir (`goalXp`) y `undo()`.
 * @param {import('../database/storage.js').Database} db
 * @param {{ results: Array<{ correct: boolean }>, mode: string, previousProgress?: import('../database/models.js').Progress }} attempt
 */
export function rewardAttempt(db, { results, mode, previousProgress }, now = Date.now()) {
  const before = TRACKED_KEYS.map((key) => [key, db.get('settings', key)]);
  const levelBefore = levelFromXp(getSetting(db, 'xp')).level;

  const stepXp = XP_RULES.perCorrectStep[mode] ?? XP_RULES.perCorrectStep.completar;
  const perfect = isCleanPerfect(results);
  const xp = results.reduce((sum, result) => {
    if (!result.correct) return sum;
    return sum + (result.hinted ? Math.min(XP_RULES.hintedStep, stepXp) : stepXp);
  }, 0) + (perfect ? XP_RULES.perfectConcept : 0);

  const counters = getSetting(db, 'counters');
  if (perfect && mode === 'reconstruir') counters.perfectRebuilds++;
  // "Error corregido": el intento anterior de este concepto tuvo errores y ahora sale perfecto.
  if (perfect && previousProgress?.reviewCount > 0 && previousProgress.streak === 0) counters.recovered++;

  const activity = getSetting(db, 'activity');
  const today = { ...dayActivity(db, now) };
  today.reviews++;
  if (perfect) today.correct++;
  const goalReached = !today.goalMet && today.reviews >= dailyGoal(db);
  const goalXp = goalReached ? XP_RULES.dailyGoal : 0;
  if (goalReached) {
    today.goalMet = true;
    counters.goalDays++;
  }
  today.xp += xp + goalXp;
  activity[dayKey(now)] = today;

  setSetting(db, 'counters', counters);
  setSetting(db, 'activity', keepRecent(activity));
  const level = addXp(db, xp + goalXp);

  return {
    xp,
    goalXp,
    goalReached,
    levelUp: level.level > levelBefore ? level : null,
    undo() {
      for (const [key, row] of before) {
        if (row === undefined) db.delete('settings', key);
        else db.put('settings', row);
      }
    },
  };
}

/**
 * XP y contadores al terminar una sesión.
 * @param {Array<{ results: Array<{ correct: boolean }> }>} outcomes
 */
export function rewardSession(db, outcomes, now = Date.now()) {
  const levelBefore = levelFromXp(getSetting(db, 'xp')).level;
  const counters = getSetting(db, 'counters');
  counters.sessions++;
  const perfect = outcomes.length >= 5 && outcomes.every(({ results }) => isCleanPerfect(results));
  if (perfect) counters.perfectSessions++;
  setSetting(db, 'counters', counters);

  const xp = XP_RULES.sessionComplete;
  const activity = getSetting(db, 'activity');
  const today = dayActivity(db, now);
  activity[dayKey(now)] = { ...today, xp: today.xp + xp };
  setSetting(db, 'activity', keepRecent(activity));
  const level = addXp(db, xp);
  return { xp, perfect, levelUp: level.level > levelBefore ? level : null };
}

/** Todos los pasos bien y sin pistas. */
export function isCleanPerfect(results) {
  return results.every((result) => result.correct && !result.hinted);
}

function addXp(db, amount) {
  const total = getSetting(db, 'xp') + amount;
  setSetting(db, 'xp', total);
  return levelFromXp(total);
}

/** Solo se guardan los últimos 90 días de actividad. */
function keepRecent(activity) {
  const keys = Object.keys(activity).sort().slice(-ACTIVITY_DAYS);
  return Object.fromEntries(keys.map((key) => [key, activity[key]]));
}
