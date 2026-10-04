import { test, assert, assertEqual } from './runner.js';
import { freshStorage, concept } from './helpers.js';
import { xpForLevel, levelFromXp, titleFor } from '../src/gamification/levels.js';
import { rewardAttempt, rewardSession, recentActivity, dayActivity } from '../src/gamification/rewards.js';
import { unlockAchievements, getAchievements, ACHIEVEMENTS } from '../src/gamification/achievements.js';
import { bestStreak } from '../src/services/stats.js';
import { recordAttempt } from '../src/services/review.js';
import { getSetting, setSetting } from '../src/database/settings.js';
import { achievementsView } from '../src/views/achievements.js';
import { DAY, dayKey } from '../src/utils/dates.js';

const PREFIX = 'farmarecall-pruebas-logros';
const NOW = new Date(2026, 9, 3, 12, 0).getTime();
const ok = { correct: true };
const bad = { correct: false };

test('Niveles: 0, 100, 300, 600, 1000 XP y títulos de la carrera médica', () => {
  assertEqual([1, 2, 3, 4, 5].map(xpForLevel), [0, 100, 300, 600, 1000]);
  assertEqual(levelFromXp(0), { level: 1, title: 'Estudiante', xp: 0, current: 0, needed: 100, toNext: 100 });
  assertEqual(levelFromXp(350), { level: 3, title: 'Interno', xp: 350, current: 50, needed: 300, toNext: 250 });
  assertEqual([1, 3, 5, 8, 12, 16, 20, 30].map(titleFor),
    ['Estudiante', 'Interno', 'Residente', 'Especialista', 'Adjunto', 'Jefe de servicio', 'Catedrático', 'Catedrático']);
});

/** Biblioteca con `n` conceptos (la meta diaria no puede ser mayor que la biblioteca). */
function withConcepts(n) {
  const db = freshStorage(PREFIX);
  db.putMany('concepts', Array.from({ length: n }, (_, i) => concept(`c${i}`)));
  return db;
}

test('XP por concepto: pasos acertados + extra si es perfecto; Reconstruir da más', () => {
  const db = withConcepts(10);
  assertEqual(rewardAttempt(db, { results: [ok, ok], mode: 'completar' }, NOW).xp, 9);
  assertEqual(rewardAttempt(db, { results: [ok, bad], mode: 'completar' }, NOW).xp, 2);
  assertEqual(rewardAttempt(db, { results: [bad, bad], mode: 'completar' }, NOW).xp, 0);
  assertEqual(rewardAttempt(db, { results: [ok, ok, ok], mode: 'reconstruir' }, NOW).xp, 14);
  assertEqual(getSetting(db, 'xp'), 25);
  assertEqual(getSetting(db, 'counters').perfectRebuilds, 1);
  assertEqual(dayActivity(db, NOW), { reviews: 4, correct: 2, xp: 25, goalMet: false });
  db.clear();
});

test('XP con pistas y en modo Elegir: menos experiencia y sin extra por perfecto', () => {
  const db = withConcepts(10);
  assertEqual(rewardAttempt(db, { results: [{ correct: true, hinted: true }, ok], mode: 'completar' }, NOW).xp, 3);
  assertEqual(rewardAttempt(db, { results: [ok, ok], mode: 'elegir' }, NOW).xp, 7);
  assertEqual(rewardAttempt(db, { results: [{ correct: true, hinted: true }], mode: 'reconstruir' }, NOW).xp, 1);
  assertEqual(getSetting(db, 'counters').perfectRebuilds, 0, 'una reconstrucción con pista no cuenta para el logro');
  db.clear();
});

test('Meta diaria: al llegar al tamaño de sesión da +30 XP una sola vez al día', () => {
  const db = withConcepts(10);
  setSetting(db, 'sessionSize', 5);
  const rewards = Array.from({ length: 6 }, () => rewardAttempt(db, { results: [bad], mode: 'completar' }, NOW));
  assertEqual(rewards.map((r) => r.goalReached), [false, false, false, false, true, false]);
  assertEqual([rewards[4].xp, rewards[4].goalXp], [0, 30], 'la XP de la meta va aparte de la del concepto');
  assertEqual(getSetting(db, 'xp'), 30);
  assertEqual(getSetting(db, 'counters').goalDays, 1);
  assert(dayActivity(db, NOW).goalMet);
  assertEqual(rewardAttempt(db, { results: [bad], mode: 'completar' }, NOW + DAY).goalReached, false, 'otro día empieza de cero');
  db.clear();
});

test('XP: deshacer deja experiencia, actividad y contadores exactamente como estaban', () => {
  const db = freshStorage(PREFIX);
  rewardAttempt(db, { results: [ok], mode: 'completar' }, NOW);
  const before = ['xp', 'activity', 'counters'].map((key) => db.get('settings', key));
  const reward = rewardAttempt(db, { results: [ok, ok, ok], mode: 'reconstruir' }, NOW);
  reward.undo();
  assertEqual(['xp', 'activity', 'counters'].map((key) => db.get('settings', key)), before);
  db.clear();
});

test('Meta diaria: nunca mayor que la biblioteca (con 3 conceptos, la meta es 3)', () => {
  const db = withConcepts(3);
  const rewards = Array.from({ length: 3 }, () => rewardAttempt(db, { results: [ok], mode: 'completar' }, NOW));
  assertEqual(rewards.map((r) => r.goalReached), [false, false, true]);
  db.clear();
});

test('Subida de nivel y "Error corregido"', () => {
  const db = withConcepts(10);
  setSetting(db, 'xp', 95);
  const reward = rewardAttempt(db, { results: [ok], mode: 'completar', previousProgress: { reviewCount: 2, streak: 0 } }, NOW);
  assertEqual(reward.levelUp?.level, 2, 'de 95 a 102 XP sube al nivel 2');
  assertEqual(getSetting(db, 'counters').recovered, 1, 'el intento anterior había fallado');
  rewardAttempt(db, { results: [ok], mode: 'completar', previousProgress: { reviewCount: 2, streak: 3 } }, NOW);
  assertEqual(getSetting(db, 'counters').recovered, 1, 'no cuenta si el anterior ya era correcto');
  db.clear();
});

test('Sesión: +20 XP; "perfecta" solo con 5 o más conceptos sin errores', () => {
  const db = freshStorage(PREFIX);
  const perfect = (n) => Array.from({ length: n }, () => ({ results: [ok, ok] }));
  assertEqual(rewardSession(db, perfect(3), NOW).xp, 20);
  assertEqual(rewardSession(db, perfect(5), NOW).perfect, true);
  assertEqual(rewardSession(db, [...perfect(4), { results: [ok, bad] }], NOW).perfect, false);
  assertEqual(getSetting(db, 'counters'), { sessions: 3, perfectSessions: 1, perfectRebuilds: 0, recovered: 0, goalDays: 0 });
  assertEqual(getSetting(db, 'xp'), 60);
  db.clear();
});

test('Logros: se consiguen una sola vez y los pendientes muestran su avance', () => {
  const db = freshStorage(PREFIX);
  const c = concept('c');
  db.put('concepts', c);
  recordAttempt(db, c, [{ expected: 'B', correct: true }], NOW);

  assertEqual(unlockAchievements(db, NOW).map((a) => a.id), ['primer-paso']);
  assertEqual(unlockAchievements(db, NOW), [], 'no se repite');
  const all = Object.fromEntries(getAchievements(db, NOW).map((a) => [a.id, a]));
  assertEqual(all['primer-paso'].unlockedAt, NOW);
  assertEqual([all['repasos-100'].value, all['repasos-100'].target, all['repasos-100'].unlockedAt], [1, 100, null]);

  setSetting(db, 'xp', 1000);
  assertEqual(unlockAchievements(db, NOW).map((a) => a.id), ['nivel-5']);
  assertEqual(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length, 'ids únicos');
  db.clear();
});

test('Actividad de los últimos 7 días (hoy al final) y mejor racha', () => {
  const db = freshStorage(PREFIX);
  setSetting(db, 'activity', { [dayKey(NOW)]: { reviews: 5, xp: 50 }, [dayKey(NOW - 2 * DAY)]: { reviews: 3, xp: 20 } });
  const days = recentActivity(db, NOW, 7);
  assertEqual(days.map((d) => d.reviews), [0, 0, 0, 0, 3, 0, 5]);
  assertEqual(days[6].key, dayKey(NOW));
  assertEqual(bestStreak(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-05']), 5, 'el 3 fue día de descanso');
  assertEqual(bestStreak(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06']), 2, 'dos días sin estudiar cortan la racha');
  assertEqual(bestStreak([]), 0);
  db.clear();
});

test('Configuración: valores por defecto completos y copias independientes', () => {
  const db = freshStorage(PREFIX);
  db.put('settings', { key: 'counters', value: { sessions: 2 } }); // datos de una versión anterior
  assertEqual(getSetting(db, 'counters'), { sessions: 2, perfectSessions: 0, perfectRebuilds: 0, recovered: 0, goalDays: 0 });
  const achievements = getSetting(db, 'achievements');
  achievements.trampa = 1;
  assertEqual(getSetting(db, 'achievements'), {}, 'modificar la copia no cambia el valor por defecto');
  db.clear();
});

test('Pantalla Logros: total, conseguidos primero y avance de los pendientes', () => {
  const db = freshStorage(PREFIX);
  setSetting(db, 'achievements', { 'primer-paso': NOW });
  const view = achievementsView({ db });
  assertEqual(view.querySelector('.level-title').textContent, `1 de ${ACHIEVEMENTS.length} logros`);
  const unlocked = view.querySelectorAll('.achievement.is-unlocked');
  assertEqual(unlocked.length, 1);
  assert(unlocked[0].querySelector('.achievement-title').textContent.startsWith('Primer paso'));
  assert(unlocked[0].querySelector('.achievement-date').textContent.startsWith('Conseguido el 3'));
  assertEqual(view.querySelectorAll('.achievement.is-locked').length, ACHIEVEMENTS.length - 1);
  assertEqual(view.querySelector('.achievement.is-locked .achievement-progress').textContent.includes(' / '), true);
  db.clear();
});
