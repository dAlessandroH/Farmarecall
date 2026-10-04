export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Último milisegundo (23:59:59.999, hora local) del día que contiene `time`.
 * @param {number} time
 */
export function endOfDay(time) {
  const date = new Date(time);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

/** Día local en formato AAAA-MM-DD. @param {number} time */
export function dayKey(time) {
  const date = new Date(time);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Días de calendario entre dos instantes (no cuenta horas: de 23:00 a 01:00 es 1 día). */
function calendarDaysBetween(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(12, 0, 0, 0);
  b.setHours(12, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

/** Cuándo toca el próximo repaso: "Ahora", "En 10 min", "Hoy", "Mañana", "En 3 días". */
export function formatNextReview(nextReview, now) {
  if (nextReview === null || nextReview === undefined) return 'Sin estudiar';
  if (nextReview <= now) return 'Ahora';
  const minutes = Math.ceil((nextReview - now) / MINUTE);
  if (minutes < 60) return `En ${minutes} min`;
  const days = calendarDaysBetween(now, nextReview);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  return `En ${days} días`;
}

/** Hace cuánto: "Hoy", "Ayer", "Hace 3 días", "Nunca". */
export function formatPast(time, now) {
  if (time === null || time === undefined) return 'Nunca';
  const days = calendarDaysBetween(time, now);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return `Hace ${days} días`;
}
