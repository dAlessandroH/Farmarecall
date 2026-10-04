import { test, assert, assertEqual, waitFor } from './runner.js';
import { freshStorage, texts, mount } from './helpers.js';
import { importView } from '../src/views/import.js';
import { libraryView } from '../src/views/library.js';
import { conceptView } from '../src/views/concept.js';
import { editView } from '../src/views/edit.js';
import { parseConceptsCsv } from '../src/parser/concepts.js';
import { importConcepts } from '../src/services/concepts.js';
import { recordAttempt } from '../src/services/review.js';

const PREFIX = 'farmarecall-pruebas-biblioteca';
const SAMPLE = 'dato,cadena\nMETOPROLOL,"bloqueo β1 → ↓ Gs → ↓ AMPc"\nM2,"Gi → ↓ AMPc → ↓ FC"\nM10,"X → Y"\natropina,"bloqueo M → ↑ FC"';

function seed() {
  const db = freshStorage(PREFIX);
  importConcepts(db, parseConceptsCsv(SAMPLE).items);
  return db;
}

/** Ejecuta `fn` y devuelve la URL de la página de pruebas a como estaba. */
async function keepingUrl(fn) {
  const url = location.href;
  try {
    return await fn();
  } finally {
    history.replaceState(null, '', url);
  }
}

test('Pantalla Importar: elegir el archivo muestra el resumen y guarda los conceptos', async () => {
  const db = freshStorage(PREFIX);
  const view = importView({ db });
  const unmount = mount(view);

  const input = view.querySelector('input[type=file]');
  const files = new DataTransfer();
  files.items.add(new File([`${SAMPLE}\nMAL,"un paso"`], 'prueba.csv', { type: 'text/csv' }));
  input.files = files.files;
  input.dispatchEvent(new Event('change'));

  const card = await waitFor(() => view.querySelector('.card-ok'), { message: 'no apareció el resumen' });
  assertEqual(card.querySelector('h2').textContent, 'Importado, con filas por revisar');
  assertEqual(texts(card.querySelectorAll('.import-counts li')), ['5 conceptos', '4 cadenas válidas', '1 error']);
  assertEqual(card.querySelector('.row-errors li').textContent, 'Fila 6: La cadena de "MAL" necesita al menos 2 pasos separados por →.');
  assertEqual(texts(card.querySelectorAll('.btn')), ['Comenzar a estudiar', 'Ver biblioteca']);
  assertEqual(db.getAll('concepts').length, 4);
  unmount();
  db.clear();
});

test('Biblioteca: orden alfabético natural y buscador (también busca dentro de la cadena)', () => keepingUrl(() => {
  const db = seed();
  const view = libraryView({ db, params: new URLSearchParams() });
  assertEqual(texts(view.querySelectorAll('.list-main')), ['atropina', 'M2', 'M10', 'METOPROLOL']);
  assertEqual(view.querySelector('.note').textContent, '4 conceptos');

  const search = view.querySelector('input[type=search]');
  search.value = 'ampc';
  search.dispatchEvent(new Event('input'));
  assertEqual(texts(view.querySelectorAll('.list-main')), ['M2', 'METOPROLOL']);
  assertEqual(view.querySelector('.note').textContent, '2 de 4');
  assert(location.hash === '#/biblioteca?q=ampc', `la búsqueda se guarda en la URL (${location.hash})`);

  search.value = 'zzz';
  search.dispatchEvent(new Event('input'));
  assertEqual(texts(view.querySelectorAll('.list li')), ['Sin resultados.']);
  db.clear();
}));

test('Biblioteca: filtro por estado (se recuerda en la URL)', () => keepingUrl(() => {
  const db = seed();
  const m2 = db.getAll('concepts').find((c) => c.dato === 'M2');
  recordAttempt(db, m2, [{ expected: 'Gi', correct: false }]);
  const view = libraryView({ db, params: new URLSearchParams('f=debil') });
  assertEqual(texts(view.querySelectorAll('.list-main')), ['M2']);
  assertEqual(view.querySelector('.filter[aria-pressed="true"]').dataset.filter, 'debil');
  assertEqual(texts(view.querySelectorAll('.filter-count')), ['4', '3', '1', '0', '0']);
  view.querySelector('.filter[data-filter="nuevo"]').click();
  assertEqual(texts(view.querySelectorAll('.list-main')), ['atropina', 'M10', 'METOPROLOL']);
  assertEqual(location.hash, '#/biblioteca?f=nuevo');
  db.clear();
}));

test('Detalle: cadena, estadísticas, pasos más fallados y botón para estudiar', () => {
  const db = seed();
  const metoprolol = db.getAll('concepts').find((c) => c.dato === 'METOPROLOL');
  recordAttempt(db, metoprolol, [{ expected: '↓ Gs', correct: false }, { expected: '↓ AMPc', correct: true }]);
  recordAttempt(db, metoprolol, [{ expected: '↓ Gs', correct: false }, { expected: '↓ AMPc', correct: false }]);

  const view = conceptView({ db, params: new URLSearchParams({ id: metoprolol.id, volver: '#/errores' }) });
  assertEqual(view.querySelector('h1').textContent, 'METOPROLOL');
  assertEqual(texts(view.querySelectorAll('.chain .step')), ['bloqueo β1', '↓ Gs', '↓ AMPc']);
  assertEqual(view.querySelector('.back-link').getAttribute('href'), '#/errores');
  const stats = Object.fromEntries(Array.from(view.querySelectorAll('.stat'), (s) => [s.querySelector('dt').textContent, s.querySelector('dd').textContent]));
  assertEqual(stats.Repasos, '2');
  assertEqual(stats.Errores, '3');
  assertEqual(stats['Próximo repaso'], 'En 10 min');
  assertEqual(texts(view.querySelectorAll('.error-steps li')), ['↓ Gs2 veces', '↓ AMPc1 vez']);
  assertEqual(view.querySelector('.btn-primary').getAttribute('href'), `#/estudiar?concepto=${metoprolol.id}`);
  db.clear();
});

test('Detalle: "Eliminar concepto" pide confirmación y lo borra', () => keepingUrl(() => {
  const db = seed();
  const m2 = db.getAll('concepts').find((c) => c.dato === 'M2');
  const view = conceptView({ db, params: new URLSearchParams({ id: m2.id }) });
  const realConfirm = window.confirm;
  try {
    window.confirm = () => false;
    view.querySelector('.btn-danger').click();
    assert(db.get('concepts', m2.id), 'si se cancela no se borra');
    window.confirm = () => true;
    view.querySelector('.btn-danger').click();
    assertEqual(db.get('concepts', m2.id), undefined);
    assertEqual(location.hash, '#/biblioteca');
  } finally {
    window.confirm = realConfirm;
    db.clear();
  }
}));

test('Biblioteca: filtro por tema (solo aparece si hay temas)', () => keepingUrl(() => {
  const db = freshStorage(PREFIX);
  assertEqual(libraryView({ db, params: new URLSearchParams() }).querySelector('select'), null);
  importConcepts(db, parseConceptsCsv('dato,cadena,tema\nA,"x → y",Cardio\nB,"x → z",Renal\nC,"y → z",Cardio').items);
  const view = libraryView({ db, params: new URLSearchParams() });
  const select = view.querySelector('select');
  assertEqual(Array.from(select.options, (option) => option.value), ['', 'Cardio', 'Renal']);
  select.value = 'Cardio';
  select.dispatchEvent(new Event('change'));
  assertEqual(texts(view.querySelectorAll('.list-main > :first-child')).length, 2);
  assertEqual(location.hash, '#/biblioteca?t=Cardio');
  db.clear();
}));

test('Editar concepto: vista previa al escribir, errores claros y guardar vuelve al detalle', () => keepingUrl(() => {
  const db = seed();
  const m2 = db.getAll('concepts').find((c) => c.dato === 'M2');
  const view = editView({ db, params: new URLSearchParams({ id: m2.id }) });
  const unmount = mount(view);
  try {
    const [dato, tema] = view.querySelectorAll('input.text-input');
    const cadena = view.querySelector('textarea');
    assertEqual([dato.value, cadena.value], ['M2', 'Gi → ↓ AMPc → ↓ FC']);
    cadena.value = 'Gi → ↓ AMPc → ↑ K⁺ → ↓ FC';
    cadena.dispatchEvent(new Event('input'));
    assertEqual(view.querySelector('.section-title').textContent, 'Vista previa · 4 pasos');

    dato.value = 'metoprolol';
    view.querySelector('button[type=submit]').click();
    assertEqual(view.querySelector('[role=alert]').textContent, 'Ya hay otro concepto llamado "METOPROLOL".');

    dato.value = 'M2';
    tema.value = 'Autonómico';
    view.querySelector('button[type=submit]').click();
    assertEqual(db.get('concepts', m2.id).pasos, ['Gi', '↓ AMPc', '↑ K⁺', '↓ FC']);
    assertEqual(db.get('concepts', m2.id).tema, 'Autonómico');
    assertEqual(location.hash, `#/concepto?id=${m2.id}`);
  } finally {
    unmount();
    db.clear();
  }
}));
