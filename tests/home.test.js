import { test, assert, assertEqual, waitFor } from './runner.js';
import { freshStorage, texts, mount, concept, progress } from './helpers.js';
import { getSetting, setSetting } from '../src/database/settings.js';
import { homeView } from '../src/views/home.js';
import { DAY, dayKey } from '../src/utils/dates.js';

const PREFIX = 'farmarecall-pruebas-inicio';
const noop = () => {};

function addConcept(db, id, nextReview) {
  db.put('concepts', concept(id));
  db.put('progress', progress(id, { nextReview, reviewCount: nextReview === null ? 0 : 1, mastery: nextReview === null ? 0 : 1 }));
}

test('Inicio vacío: bienvenida en 3 pasos, Importar CSV y "probar con el ejemplo"', () => {
  const view = homeView({ db: freshStorage(PREFIX), refresh: noop });
  assertEqual(texts(view.querySelectorAll('.btn-primary')), ['Importar CSV']);
  assertEqual(view.querySelector('.btn-primary').getAttribute('href'), '#/importar');
  assertEqual(texts(view.querySelectorAll('.btn-secondary')), ['Probar con 5 conceptos de ejemplo']);
  assertEqual(view.querySelectorAll('.steps li').length, 3);
  assert(!view.querySelector('input[type=radio]'), 'sin conceptos no hay opciones de sesión');
});

test('Inicio: "Probar con el ejemplo" importa los 5 conceptos y vuelve a dibujar la pantalla', async () => {
  const db = freshStorage(PREFIX);
  let refreshed = false;
  const view = homeView({ db, refresh: () => { refreshed = true; } });
  view.querySelector('.btn-secondary').click();
  await waitFor(() => refreshed, { message: 'no se cargó el ejemplo' });
  assertEqual(db.getAll('concepts').map((c) => c.dato), ['M3', 'M2', 'SALBUTAMOL', 'METOPROLOL', 'MORFINA']);
  db.clear();
});

test('Inicio con conceptos: tarjeta "Hoy", Estudiar ahora y pendientes', () => {
  const db = freshStorage(PREFIX);
  addConcept(db, 'vencido', Date.now() - 1000);
  addConcept(db, 'nuevo', null);
  const view = homeView({ db, refresh: noop });

  const start = view.querySelector('.btn-hero');
  assertEqual(start.getAttribute('href'), '#/estudiar?n=10');
  assertEqual(start.querySelector('.btn-sub').textContent, '10 conceptos · Completar');
  assertEqual(view.querySelector('.summary').textContent, 'Pendientes hoy: 1 · 1 nuevo');
  const ring = view.querySelector('.ring');
  assertEqual([ring.getAttribute('aria-valuenow'), ring.getAttribute('aria-valuemax')], ['0', '2'], 'meta = 2 (solo hay 2 conceptos)');
  assertEqual(view.querySelector('.ring-center').textContent, '0/2');
  assertEqual(view.querySelector('.level-chip').textContent, 'Nivel 1');
  assertEqual(texts(view.querySelectorAll('.quick-action')), ['Importar CSV', 'Copia de seguridad']);
  assertEqual(Array.from(view.querySelectorAll('input[name=session-size]'), (r) => r.value), ['5', '10', '20']);
  assertEqual(Array.from(view.querySelectorAll('input[name=study-mode]'), (r) => r.value), ['completar', 'elegir', 'reconstruir']);
  assertEqual(view.querySelector('select[name=study-topic]'), null, 'sin temas no hay selector de tema');
});

test('Inicio: "Todo al día" cuando no hay pendientes ni nuevos', () => {
  const db = freshStorage(PREFIX);
  addConcept(db, 'repasado', Date.now() + 3 * DAY);
  const view = homeView({ db, refresh: noop });
  assertEqual(view.querySelector('.summary').textContent, 'Todo al día ✓ · Próximo repaso: en 3 días');
});

test('Inicio: la meta del día, la racha y la XP reflejan lo estudiado', () => {
  const db = freshStorage(PREFIX);
  for (let i = 0; i < 12; i++) addConcept(db, `c${i}`, null);
  setSetting(db, 'studyDays', [dayKey(Date.now())]);
  setSetting(db, 'activity', { [dayKey(Date.now())]: { reviews: 4, correct: 2, xp: 40, goalMet: false } });
  setSetting(db, 'xp', 340);
  let view = homeView({ db, refresh: noop });
  assertEqual(view.querySelector('.ring-center').textContent, '4/10');
  assertEqual(view.querySelector('.today-title').textContent, 'Meta de hoy');
  assertEqual(texts(view.querySelectorAll('.chip')), ['1 día de racha', '340 XP']);
  assertEqual(view.querySelector('.level-chip').textContent, 'Nivel 3');

  setSetting(db, 'activity', { [dayKey(Date.now())]: { reviews: 12, correct: 10, xp: 120, goalMet: true } });
  view = homeView({ db, refresh: noop });
  assertEqual(view.querySelector('.today-title').textContent, 'Meta de hoy cumplida');
  db.clear();
});

test('Inicio: elegir 20 conceptos y modo Reconstruir se recuerda y actualiza el botón', () => {
  const db = freshStorage(PREFIX);
  addConcept(db, 'x', null);
  const view = homeView({ db, refresh: noop });
  const unmount = mount(view);

  view.querySelector('input[name=session-size][value="20"]').click();
  view.querySelector('input[name=study-mode][value="reconstruir"]').click();
  assertEqual(view.querySelector('.btn-hero').getAttribute('href'), '#/estudiar?n=20');
  assertEqual(view.querySelector('.btn-sub').textContent, '20 conceptos · Reconstruir');
  assertEqual(view.querySelector('.session-options summary').textContent, 'Ajustar sesión (20 · Reconstruir)');
  assertEqual([getSetting(db, 'sessionSize'), getSetting(db, 'studyMode')], [20, 'reconstruir']);

  const again = homeView({ db, refresh: noop });
  assertEqual(again.querySelector('input[name=session-size]:checked').value, '20');
  assertEqual(again.querySelector('input[name=study-mode]:checked').value, 'reconstruir');
  unmount();
  db.clear();
});

test('Inicio: con temas, se puede limitar la sesión a uno (y se ve en el botón)', () => {
  const db = freshStorage(PREFIX);
  db.putMany('concepts', [{ ...concept('a'), tema: 'Cardio' }, { ...concept('b'), tema: 'Renal' }]);
  const view = homeView({ db, refresh: noop });
  const unmount = mount(view);
  const select = view.querySelector('select[name=study-topic]');
  assertEqual(Array.from(select.options, (option) => option.textContent), ['Todos los temas', 'Cardio', 'Renal']);
  select.value = 'Renal';
  select.dispatchEvent(new Event('change'));
  assertEqual(getSetting(db, 'studyTopic'), 'Renal');
  assertEqual(view.querySelector('.btn-sub').textContent, '10 conceptos · Completar · Renal');
  unmount();
  db.clear();
});

test('Inicio: recordatorio de copia de seguridad con "Ahora no"', () => {
  const db = freshStorage(PREFIX);
  db.put('concepts', concept('a'));
  db.put('progress', progress('a', { reviewCount: 12, mastery: 2, nextReview: Date.now() + 5 * DAY }));
  const view = homeView({ db, refresh: noop });
  const notice = view.querySelector('.notice');
  assert(notice, 'aparece el recordatorio');
  assertEqual(notice.querySelector('strong').textContent, 'Guarda una copia de tus datos');
  Array.from(notice.querySelectorAll('button')).find((b) => b.textContent === 'Ahora no').click();
  assert(getSetting(db, 'backupSnoozeUntil') > Date.now(), 'pospuesto');
  assertEqual(homeView({ db, refresh: noop }).querySelector('.notice'), null);
  db.clear();
});
