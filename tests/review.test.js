import { test, assertEqual } from './runner.js';
import { freshStorage, concept, progress } from './helpers.js';
import { recordAttempt, errorRowsFor, failedStepCounts } from '../src/services/review.js';
import { scheduleReview, newProgress, masteryStatus } from '../src/spacedRepetition/scheduler.js';
import { pickSession, pickErrorSession } from '../src/services/session.js';
import { getProgressStats, getErrorList, studyStreak } from '../src/services/stats.js';
import { getSetting } from '../src/database/settings.js';
import { MINUTE, DAY, dayKey } from '../src/utils/dates.js';

const PREFIX = 'farmarecall-pruebas-repaso';
const NOW = new Date(2026, 9, 3, 12, 0).getTime();

test('Repetición espaciada: aciertos seguidos → 1, 3, 7, 14, 30 y 30 días', () => {
  let p = newProgress('x');
  const intervals = [];
  for (let i = 0; i < 6; i++) {
    p = scheduleReview(p, { correct: true, failedSteps: 0 }, NOW);
    intervals.push((p.nextReview - NOW) / DAY);
  }
  assertEqual(intervals, [1, 3, 7, 14, 30, 30]);
  assertEqual([p.mastery, p.streak, p.reviewCount], [5, 6, 6]);
});

test('Repetición espaciada: un fallo → repetir en 10 minutos y bajar 2 niveles', () => {
  const before = { ...newProgress('x'), mastery: 4, streak: 4, reviewCount: 4 };
  const after = scheduleReview(before, { correct: false, failedSteps: 2 }, NOW);
  assertEqual([after.nextReview - NOW, after.mastery, after.streak, after.errorCount, after.lastReview],
    [10 * MINUTE, 2, 0, 2, NOW]);
  assertEqual(scheduleReview(newProgress('y'), { correct: false, failedSteps: 1 }, NOW).mastery, 0, 'no baja de 0');
});

test('Estado de dominio: nuevo, débil, en progreso, dominado', () => {
  assertEqual(masteryStatus(undefined), 'nuevo');
  assertEqual(masteryStatus(progress('a')), 'nuevo');
  assertEqual(masteryStatus(progress('a', { reviewCount: 2, mastery: 0 })), 'debil');
  assertEqual(masteryStatus(progress('a', { reviewCount: 2, mastery: 2 })), 'aprendiendo');
  assertEqual(masteryStatus(progress('a', { reviewCount: 3, mastery: 3 })), 'dominado');
});

test('Registro de un intento: errores agrupados por paso y próximo repaso', () => {
  const db = freshStorage(PREFIX);
  const c = concept('c', ['A', 'B', 'C']);
  db.put('concepts', c);

  recordAttempt(db, c, [{ expected: 'B', correct: false }, { expected: 'C', correct: true }], NOW);
  recordAttempt(db, c, [{ expected: 'B', correct: false }, { expected: 'C', correct: false }], NOW + MINUTE);

  assertEqual(errorRowsFor(db, 'c').map(({ paso, count, lastDate }) => [paso, count, lastDate]),
    [['B', 2, NOW + MINUTE], ['C', 1, NOW + MINUTE]]);
  assertEqual([...failedStepCounts(db, 'c')], [['B', 2], ['C', 1]]);
  const p = db.get('progress', 'c');
  assertEqual([p.reviewCount, p.errorCount, p.mastery, p.nextReview], [2, 3, 0, NOW + MINUTE + 10 * MINUTE]);

  recordAttempt(db, c, [{ expected: 'B', correct: true }], NOW + DAY);
  const after = db.get('progress', 'c');
  assertEqual([after.mastery, after.streak, after.nextReview], [1, 1, NOW + 2 * DAY]);
  db.clear();
});

test('Registro: "deshacer" deja progreso y errores exactamente como estaban', () => {
  const db = freshStorage(PREFIX);
  const c = concept('c', ['A', 'B', 'C']);
  recordAttempt(db, c, [{ expected: 'B', correct: false }], NOW);
  const progressBefore = db.get('progress', 'c');
  const errorsBefore = db.getAll('errors');

  const attempt = recordAttempt(db, c, [{ expected: 'B', correct: false }, { expected: 'C', correct: false }], NOW + MINUTE);
  attempt.undo();
  assertEqual(db.get('progress', 'c'), progressBefore);
  assertEqual(db.getAll('errors'), errorsBefore);
  db.clear();

  // Primer intento de un concepto sin progreso previo: deshacer lo deja sin progreso.
  recordAttempt(db, c, [{ expected: 'C', correct: false }], NOW).undo();
  assertEqual([db.get('progress', 'c'), db.getAll('errors')], [undefined, []]);
  db.clear();
});

test('Racha: un registro por día y días seguidos hasta hoy (o ayer)', () => {
  const db = freshStorage(PREFIX);
  const c = concept('c');
  recordAttempt(db, c, [{ expected: 'B', correct: true }], NOW - 2 * DAY);
  recordAttempt(db, c, [{ expected: 'B', correct: true }], NOW - DAY);
  recordAttempt(db, c, [{ expected: 'B', correct: true }], NOW - DAY + MINUTE);
  assertEqual(getSetting(db, 'studyDays').length, 2);
  assertEqual(studyStreak(getSetting(db, 'studyDays'), NOW), 2, 'hoy aún no ha estudiado: cuenta hasta ayer');
  recordAttempt(db, c, [{ expected: 'B', correct: true }], NOW);
  assertEqual(studyStreak(getSetting(db, 'studyDays'), NOW), 3);
  assertEqual(studyStreak(getSetting(db, 'studyDays'), NOW + 3 * DAY), 0, 'se rompe si pasan días sin estudiar');
  db.clear();
});

test('Sesión: primero pendientes (los más atrasados), luego débiles, luego nuevos; respeta el tamaño', () => {
  const concepts = ['nuevo1', 'mañana', 'atrasado', 'muyAtrasado', 'debil', 'nuevo2', 'hoyMasTarde'].map((id) => concept(id));
  const progressById = new Map([
    ['mañana', progress('mañana', { nextReview: NOW + DAY, reviewCount: 1, mastery: 1 })],
    ['atrasado', progress('atrasado', { nextReview: NOW - DAY, reviewCount: 1, mastery: 1 })],
    ['muyAtrasado', progress('muyAtrasado', { nextReview: NOW - 5 * DAY, reviewCount: 1, mastery: 2 })],
    ['debil', progress('debil', { nextReview: NOW + DAY + MINUTE, reviewCount: 2, mastery: 0, errorCount: 3 })],
    ['hoyMasTarde', progress('hoyMasTarde', { nextReview: NOW + 3 * 60 * MINUTE, reviewCount: 1, mastery: 1 })],
  ]);
  assertEqual(pickSession(concepts, progressById, 10, NOW),
    { ids: ['muyAtrasado', 'atrasado', 'hoyMasTarde', 'debil', 'nuevo1', 'nuevo2'], ahead: false });
  assertEqual(pickSession(concepts, progressById, 2, NOW).ids, ['muyAtrasado', 'atrasado']);
});

test('Sesión: si todo está al día, adelanta los próximos repasos', () => {
  const concepts = ['a', 'b', 'c'].map((id) => concept(id));
  const progressById = new Map([
    ['a', progress('a', { nextReview: NOW + 9 * DAY, reviewCount: 3, mastery: 3 })],
    ['b', progress('b', { nextReview: NOW + 2 * DAY, reviewCount: 2, mastery: 2 })],
    ['c', progress('c', { nextReview: NOW + 5 * DAY, reviewCount: 2, mastery: 2 })],
  ]);
  assertEqual(pickSession(concepts, progressById, 2, NOW), { ids: ['b', 'c'], ahead: true });
});

test('Errores: más errores primero; a igualdad, el que lleva más tiempo sin repasar', () => {
  const db = freshStorage(PREFIX);
  const concepts = ['pocos', 'muchos', 'empateViejo', 'empateNuevo', 'limpio'].map((id) => concept(id, ['A', 'B', 'C']));
  db.putMany('concepts', concepts);
  db.putMany('progress', [
    progress('pocos', { errorCount: 1, reviewCount: 1, lastReview: NOW }),
    progress('muchos', { errorCount: 5, reviewCount: 3, lastReview: NOW }),
    progress('empateViejo', { errorCount: 2, reviewCount: 2, lastReview: NOW - 3 * DAY }),
    progress('empateNuevo', { errorCount: 2, reviewCount: 2, lastReview: NOW - DAY }),
    progress('limpio', { errorCount: 0, reviewCount: 4, lastReview: NOW }),
  ]);
  const progressById = new Map(db.getAll('progress').map((p) => [p.conceptId, p]));
  assertEqual(pickErrorSession(concepts, progressById, 10), ['muchos', 'empateViejo', 'empateNuevo', 'pocos']);
  assertEqual(getErrorList(db).map((item) => item.concept.id), ['muchos', 'empateViejo', 'empateNuevo', 'pocos']);
  db.clear();
});

test('Progreso: cuenta conceptos por estado, repasos, errores y pendientes', () => {
  const db = freshStorage(PREFIX);
  db.putMany('concepts', ['n', 'd', 'a', 'm'].map((id) => concept(id)));
  db.putMany('progress', [
    progress('n'),
    progress('d', { reviewCount: 2, errorCount: 3, mastery: 0, nextReview: NOW + 10 * MINUTE }),
    progress('a', { reviewCount: 1, mastery: 1, nextReview: NOW + DAY }),
    progress('m', { reviewCount: 4, errorCount: 1, mastery: 3, nextReview: NOW + 7 * DAY }),
  ]);
  const stats = getProgressStats(db, NOW);
  assertEqual({ ...stats, streak: undefined }, {
    total: 4, nuevo: 1, debil: 1, aprendiendo: 1, dominado: 1, dueToday: 1, reviews: 7, errors: 4, streak: undefined,
  });
  db.clear();
});

test('Repetición espaciada: bien pero con pista → ni sube ni baja de nivel y vuelve en 10 minutos', () => {
  const before = { ...newProgress('x'), mastery: 2, streak: 2, reviewCount: 2 };
  const after = scheduleReview(before, { correct: true, failedSteps: 0, hinted: true }, NOW);
  assertEqual([after.mastery, after.streak, after.reviewCount, after.nextReview - NOW], [2, 2, 3, 10 * MINUTE]);
});

test('Racha con día de descanso: saltarse un día por semana no la rompe; dos días seguidos, sí', () => {
  const day = (offset) => dayKey(NOW + offset * DAY);
  assertEqual(studyStreak([day(-3), day(-1)], NOW), 2, 'el día -2 fue de descanso');
  assertEqual(studyStreak([day(-2)], NOW), 1, 'ayer de descanso: hoy aún se puede salvar');
  assertEqual(studyStreak([day(-3)], NOW), 0, 'dos días seguidos sin estudiar');
  assertEqual(studyStreak([day(-4), day(-2)], NOW), 0, 'segundo descanso en menos de 7 días');
  assertEqual(studyStreak([day(-12), day(-10), day(-9), day(-8), day(-7), day(-6), day(-5), day(-4), day(-3), day(-1), day(0)], NOW), 11,
    'dos descansos separados por 7 días o más');
});
