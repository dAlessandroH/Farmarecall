import { test, assert, assertEqual } from './runner.js';
import { freshStorage, texts, mount } from './helpers.js';
import { parseConceptsCsv } from '../src/parser/concepts.js';
import { importConcepts } from '../src/services/concepts.js';
import { errorRowsFor } from '../src/services/review.js';
import { studyView } from '../src/views/study.js';
import { errorsView } from '../src/views/errors.js';
import { progressView } from '../src/views/progress.js';
import { MINUTE } from '../src/utils/dates.js';

const PREFIX = 'farmarecall-pruebas-estudio';
const CSV = 'dato,cadena\nM3,"Gq → ↑ IP₃/DAG → ↑ Ca²⁺ → contracción"\nMETOPROLOL,"bloqueo β1 → ↓ Gs → ↓ AMPc → ↓ Ca²⁺ → ↓ FC/contractilidad → ↓ gasto cardiaco"';

function seed() {
  const db = freshStorage(PREFIX);
  importConcepts(db, parseConceptsCsv(CSV).items);
  return db;
}

const byDato = (db, dato) => db.getAll('concepts').find((c) => c.dato === dato);
const submit = (view) => view.querySelector('form button[type=submit]').click();
const scoreText = (ok, total) => `${ok} de ${total} ${total === 1 ? 'paso correcto' : 'pasos correctos'}`;
const bannerOk = (view) => view.querySelector('.result-banner').classList.contains('is-ok');
/** Ningún texto suelto tipo "undefined", "false" o "null" en pantalla. */
const assertCleanText = (view) => assert(!/undefined|false|null|NaN/.test(view.textContent), `texto sospechoso: ${view.textContent}`);
const button = (view, label) => Array.from(view.querySelectorAll('button')).find((b) => b.textContent.trim() === label);
/** Los conceptos nuevos se enseñan primero: pasar de la vista previa al ejercicio. */
function start(view) {
  assertEqual(view.querySelector('.eyebrow')?.textContent, 'Concepto nuevo', 'vista previa del concepto nuevo');
  button(view, 'La tengo, pregúntame').click();
}
const fillCorrectly = (view, concept) => view.querySelectorAll('.step-input').forEach((input) => {
  input.value = concept.pasos[Number(input.dataset.index)];
});

test('Estudiar (completar): vista previa, responder, registrar, repetir lo fallado al final y resumen', () => {
  const db = seed();
  const view = studyView({ db, params: new URLSearchParams('n=5&modo=completar') });
  const unmount = mount(view);
  try {
    // 1.º M3 (nuevo): primero se ve la cadena entera, sin huecos.
    const m3 = byDato(db, 'M3');
    assertEqual(view.querySelector('h1').textContent, 'M3');
    assertEqual(view.querySelector('.study-position').textContent, '1/2');
    assertEqual(texts(view.querySelectorAll('.chain .step')), m3.pasos);
    assertEqual(view.querySelectorAll('.step-input').length, 0);
    start(view);

    const inputs = view.querySelectorAll('.step-input');
    assert(inputs.length >= 1 && inputs.length <= 2, `${inputs.length} huecos para 4 pasos`);
    assert(view.querySelector('.symbol-bar'), 'barra de símbolos visible al responder');
    inputs.forEach((input) => { input.value = m3.pasos[Number(input.dataset.index)].replace('₃', '3').replace('²⁺', '2+'); });
    submit(view);

    assertEqual(view.querySelector('.score').textContent, scoreText(inputs.length, inputs.length));
    assert(bannerOk(view), 'banner verde');
    assertEqual(view.querySelector('.xp-chip').textContent, `+${inputs.length * 2 + 5} XP`);
    assertEqual(view.querySelector('.result-next').textContent, 'Vuelve a salir mañana');
    assertEqual(view.querySelector('.repeat-note'), null, 'lo acertado no se repite');
    assertCleanText(view);
    assert(!view.querySelector('.symbol-bar'), 'la barra desaparece al corregir');
    assertEqual(view.querySelector('.study-position').textContent, '1/2');

    // 2.º METOPROLOL (nuevo): en blanco → errores, y se repetirá al final.
    button(view, 'Siguiente').click();
    assertEqual(view.querySelector('h1').textContent, 'METOPROLOL');
    start(view);
    const holes = view.querySelectorAll('.step-input').length;
    submit(view);
    assertEqual(view.querySelector('.score').textContent, scoreText(0, holes));
    assert(!bannerOk(view), 'banner rojo');
    assertEqual(view.querySelector('.xp-chip'), null, 'sin aciertos no hay XP');
    assertEqual(view.querySelector('.result-next').textContent, 'Vuelve a salir en 10 min');
    assertEqual(view.querySelector('.repeat-note').textContent, 'Te lo volveré a preguntar al final de la sesión.');
    assertEqual(view.querySelector('.study-position').textContent, '2/3', 'la cola crece con la repetición');
    const metoprolol = byDato(db, 'METOPROLOL');
    assertEqual(db.get('progress', metoprolol.id).errorCount, holes);
    assertEqual(errorRowsFor(db, metoprolol.id).length, holes);
    assertCleanText(view);

    // "Marcar como correcta" rehace el registro con un error menos.
    button(view, 'Marcar como correcta').click();
    assertEqual(view.querySelector('.score').textContent, scoreText(1, holes));
    assertEqual(db.get('progress', metoprolol.id).errorCount, holes - 1);
    assertEqual(db.get('progress', metoprolol.id).reviewCount, 1, 'sigue contando como un solo repaso');

    const fixedByOverride = holes === 1; // con un solo hueco ya está todo bien: no hace falta repetir
    if (!fixedByOverride) {
      button(view, 'Siguiente').click();
      assertEqual(view.querySelector('h1').textContent, 'METOPROLOL');
      assertEqual(view.querySelector('.eyebrow').textContent, 'Otra vez: antes no salió del todo');
      fillCorrectly(view, metoprolol);
      submit(view);
      assert(bannerOk(view), 'la repetición sale bien');
      assertEqual(view.querySelector('.study-position').textContent, '3/3');
    } else {
      assertEqual(view.querySelector('.study-position').textContent, '2/2', 'repetición cancelada');
    }

    // Resumen: cuenta los primeros intentos y aparte lo corregido al repetir.
    button(view, 'Ver resultado').click();
    assertEqual(view.querySelector('h1').textContent, 'Sesión terminada');
    assertCleanText(view);
    const counts = texts(view.querySelectorAll('.session-counts li'));
    assertEqual(counts.slice(0, 3), fixedByOverride
      ? ['2 conceptos', '2 correctos', '0 con errores']
      : ['2 conceptos', '1 correcto', '1 con errores']);
    if (!fixedByOverride) assertEqual(counts[counts.length - 1], '1 de 1 corregidos al repetir');
    assert(/^\+\d+ XP$/.test(view.querySelector('.xp-total').textContent), view.querySelector('.xp-total').textContent);
    // Con 2 conceptos la meta del día es 2: se cumple en esta misma sesión.
    assertEqual(texts(view.querySelectorAll('.mini-achievements strong')), ['Primer paso', 'Meta cumplida', 'Sesión completa']);
    assertEqual(view.querySelector('.goal-line').textContent, 'Meta de hoy cumplida');
    if (!fixedByOverride) assert(view.querySelector('.list .list-sub').textContent.includes('Al repetir: ✓'));
  } finally {
    unmount();
    db.clear();
  }
});

test('Estudiar (completar): Enter pasa al siguiente hueco y la barra inserta símbolos en el campo activo', () => {
  const db = seed();
  const view = studyView({ db, params: new URLSearchParams(`concepto=${byDato(db, 'METOPROLOL').id}&modo=completar`) });
  const unmount = mount(view);
  try {
    start(view);
    const inputs = view.querySelectorAll('.step-input');
    inputs[0].focus();
    inputs[0].value = 'x';
    inputs[0].setSelectionRange(0, 0);
    view.querySelector('.symbol[aria-label="Insertar flecha abajo"]').click();
    assertEqual(inputs[0].value, '↓x');
    inputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    if (inputs.length > 1) assertEqual(document.activeElement, inputs[1]);
  } finally {
    unmount();
    db.clear();
  }
});

test('Estudiar (completar): la pista muestra el principio; acertar con pista da menos XP y se repite pronto', () => {
  const db = seed();
  const m3 = byDato(db, 'M3');
  const view = studyView({ db, params: new URLSearchParams(`concepto=${m3.id}&modo=completar`) });
  const unmount = mount(view);
  try {
    start(view);
    const inputs = view.querySelectorAll('.step-input');
    view.querySelector('.hint-button').click();
    assert(view.querySelector('.hint-text').textContent.startsWith('Pista: '), view.querySelector('.hint-text').textContent);
    assert(view.querySelector('.hint-text').textContent.endsWith('…'));
    fillCorrectly(view, m3);
    submit(view);

    assert(bannerOk(view), 'todo bien, aunque con pista');
    assertEqual(view.querySelector('.xp-chip').textContent, `+${1 + (inputs.length - 1) * 2} XP`, 'pista: 1 XP y sin extra por perfecto');
    assertEqual(view.querySelector('.your-answer').textContent, 'Con pista');
    assertEqual(view.querySelector('.repeat-note').textContent, 'Te lo volveré a preguntar al final de la sesión.');
    const progress = db.get('progress', m3.id);
    assertEqual([progress.mastery, progress.nextReview - progress.lastReview], [0, 10 * MINUTE], 'no sube de nivel');
    assertEqual(errorRowsFor(db, m3.id), [], 'una pista no es un error');
  } finally {
    unmount();
    db.clear();
  }
});

test('Estudiar (elegir): 4 opciones por hueco, incluida la misma con la flecha al revés', () => {
  const db = seed();
  const metoprolol = byDato(db, 'METOPROLOL');
  const view = studyView({ db, params: new URLSearchParams(`concepto=${metoprolol.id}&modo=elegir`) });
  const unmount = mount(view);
  try {
    start(view);
    const groups = view.querySelectorAll('.choice');
    assert(groups.length >= 1 && groups.length <= 2, `${groups.length} huecos`);
    for (const group of groups) {
      const expected = metoprolol.pasos[Number(group.dataset.index)];
      const options = Array.from(group.querySelectorAll('input'), (input) => input.value);
      assertEqual(options.length, 4);
      assert(options.includes(expected), 'la correcta está entre las opciones');
      if (expected.includes('↓')) assert(options.includes(expected.replace('↓', '↑')), `distractor con la flecha al revés para ${expected}`);
      Array.from(group.querySelectorAll('input')).find((input) => input.value === expected).click();
    }
    assertEqual(view.querySelectorAll('.symbol-bar').length, 0, 'en Elegir no hace falta teclado');
    submit(view);
    assert(bannerOk(view));
    assertEqual(view.querySelector('.xp-chip').textContent, `+${groups.length + 5} XP`, 'Elegir: 1 XP por paso');
  } finally {
    unmount();
    db.clear();
  }
});

test('Estudiar (reconstruir): "Tu respuesta" frente a la correcta, con errata aceptada', () => {
  const db = seed();
  const m3 = byDato(db, 'M3');
  const view = studyView({ db, params: new URLSearchParams(`concepto=${m3.id}&modo=reconstruir`) });
  const unmount = mount(view);
  try {
    start(view);
    assertEqual(view.querySelector('.instruction').textContent, 'Construye la cadena farmacológica completa.');
    view.querySelector('textarea').value = 'Gq\n↑ IP3/DAG → contracion';
    submit(view);

    assertEqual(view.querySelector('.score').textContent, '3 de 4 pasos correctos');
    assert(!bannerOk(view));
    assertEqual(texts(view.querySelectorAll('.section-title')), ['Respuesta correcta', 'Tu respuesta']);
    assertCleanText(view);
    assertEqual(Array.from(view.querySelectorAll('.chain .step'), (s) => s.classList.contains('is-ok')), [true, true, false, true]);
    assertEqual(view.querySelectorAll('.chain .step')[3].querySelector('.your-answer').textContent, 'errata aceptada');
    assertEqual(errorRowsFor(db, m3.id).map((row) => row.paso), ['↑ Ca²⁺']);
    assert(button(view, 'Siguiente'), 'con errores se repite al final: aún no es el último');
  } finally {
    unmount();
    db.clear();
  }
});

test('Estudiar (reconstruir): la pista dice cuántos pasos hay y el primero', () => {
  const db = seed();
  const metoprolol = byDato(db, 'METOPROLOL');
  const view = studyView({ db, params: new URLSearchParams(`concepto=${metoprolol.id}&modo=reconstruir`) });
  const unmount = mount(view);
  try {
    start(view);
    view.querySelector('.hint-button').click();
    assertEqual(view.querySelector('.hint-text').textContent, 'Son 6 pasos. Empieza por: bloqueo β1');
  } finally {
    unmount();
    db.clear();
  }
});

test('Estudiar: sesión "Repasar mis errores" y casos sin nada que estudiar', () => {
  const db = seed();
  const noErrors = studyView({ db, params: new URLSearchParams('errores=1&n=10') });
  assertEqual(noErrors.querySelector('.note').textContent, 'No hay errores que repasar. ✓');

  const metoprolol = byDato(db, 'METOPROLOL');
  const first = studyView({ db, params: new URLSearchParams(`concepto=${metoprolol.id}&modo=completar`) });
  const unmount = mount(first); // un formulario fuera de la página no envía "submit"
  start(first);
  submit(first); // todo en blanco → errores
  unmount();

  const errorSession = studyView({ db, params: new URLSearchParams('errores=1&n=10&modo=completar') });
  assertEqual(errorSession.querySelector('h1').textContent, 'METOPROLOL');
  assertEqual(errorSession.querySelector('.study-position').textContent, '1/1');
  assertEqual(errorSession.querySelector('.eyebrow'), null, 'ya no es nuevo: sin vista previa');

  const missing = studyView({ db, params: new URLSearchParams('concepto=no-existe') });
  assertEqual(missing.querySelector('.note').textContent, 'Este concepto ya no existe.');
  db.clear();
  const empty = studyView({ db, params: new URLSearchParams('n=10') });
  assertEqual(empty.querySelector('a.btn').getAttribute('href'), '#/importar');
});

test('Estudiar: con un tema elegido, la sesión solo usa conceptos de ese tema', () => {
  const db = freshStorage(PREFIX);
  importConcepts(db, parseConceptsCsv('dato,cadena,tema\nA,"x → y",Cardio\nB,"x → z",Renal\nC,"y → z",Cardio').items);
  const view = studyView({ db, params: new URLSearchParams('n=10&tema=Cardio') });
  assertEqual(view.querySelector('.study-position').textContent, '1/2');
  assertEqual(view.querySelector('h1').textContent, 'A');
  db.clear();
});

test('Pantallas Errores y Progreso reflejan lo estudiado', () => {
  const db = seed();
  assertEqual(errorsView({ db }).querySelector('h2').textContent, 'Sin errores por ahora');

  const metoprolol = byDato(db, 'METOPROLOL');
  const session = studyView({ db, params: new URLSearchParams(`concepto=${metoprolol.id}&modo=reconstruir`) });
  const unmount = mount(session);
  start(session);
  session.querySelector('textarea').value = 'bloqueo β1\n↓ Gs';
  submit(session); // 4 pasos fallados
  unmount();

  const errors = errorsView({ db });
  assertEqual(errors.querySelector('.btn-primary').getAttribute('href'), '#/estudiar?errores=1&n=10');
  assertEqual(texts(errors.querySelectorAll('.list-item .count')), ['4 errores']);
  assert(errors.querySelector('.list-sub').textContent.endsWith('(1)'), 'muestra el paso más fallado');
  assert(errors.querySelector('.list-item').getAttribute('href').includes('volver=%23%2Ferrores'));

  const progress = progressView({ db });
  const stats = Object.fromEntries(Array.from(progress.querySelectorAll('.stat'),
    (s) => [s.querySelector('dt').textContent, s.querySelector('dd').textContent]));
  assertEqual(stats, {
    'Pendientes hoy': '1', 'Racha de estudio': '1 día', 'Repasos realizados': '1', 'Errores totales': '4', 'Mejor racha': '1 día',
  });
  assertEqual(texts(progress.querySelectorAll('.legend li')), ['Dominados: 0', 'En progreso: 0', 'Débiles: 1', 'Nuevos: 1']);
  assertEqual(progress.querySelectorAll('.week li').length, 7);
  assert(progress.querySelector('.level-title').textContent.startsWith('Nivel 1 · Estudiante'));
  db.clear();
});
