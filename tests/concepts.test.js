import { test, assert, assertEqual } from './runner.js';
import { freshStorage } from './helpers.js';
import { parseConceptsCsv } from '../src/parser/concepts.js';
import { importConcepts, deleteConcept, updateConcept, listTopics } from '../src/services/concepts.js';
import { recordAttempt } from '../src/services/review.js';
import { readTextFile } from '../src/services/files.js';

const PREFIX = 'farmarecall-pruebas-conceptos';

test('Importar: el CSV de ejemplo (ejemplos/prueba.csv) da 5 conceptos sin errores', async () => {
  const text = await (await fetch('../ejemplos/prueba.csv', { cache: 'no-store' })).text();
  const { items, errors, rowCount } = parseConceptsCsv(text);
  assertEqual(errors, []);
  assertEqual(rowCount, 5);
  assertEqual(items.map((item) => item.dato), ['M3', 'M2', 'SALBUTAMOL', 'METOPROLOL', 'MORFINA']);
  assertEqual(items[0].pasos, ['Gq', '↑ IP₃/DAG', '↑ Ca²⁺', 'contracción']);
  assertEqual(items[4].pasos[2], '↓ AMPc, ↑ K⁺, ↓ Ca²⁺', 'coma dentro de un paso');
  assertEqual(items[3].cadena, 'bloqueo β1 → ↓ Gs → ↓ AMPc → ↓ Ca²⁺ → ↓ FC/contractilidad → ↓ gasto cardiaco');
});

test('Importar: cada problema indica su fila exacta', () => {
  const csv = [
    'dato,cadena',          // 1
    'M3,"Gq → ↑ IP₃/DAG"',  // 2 válida
    ',"A → B"',             // 3 falta el dato
    'M2,',                  // 4 falta la cadena
    'X,"solo un paso"',     // 5 un solo paso
    'Y,"A → → B"',          // 6 paso vacío
    '',                     // 7 vacía (se ignora)
    'm3,"A → B"',           // 8 repetido (M3)
    'Z,"A -> B -> C"',      // 9 válida
  ].join('\n');
  const { items, errors, rowCount } = parseConceptsCsv(csv);
  assertEqual(errors.map((error) => error.row), [3, 4, 5, 6, 8]);
  assert(errors[0].message.includes('Falta el dato'), errors[0].message);
  assert(errors[1].message.includes('Falta la cadena de "M2"'), errors[1].message);
  assert(errors[2].message.includes('al menos 2 pasos'), errors[2].message);
  assert(errors[3].message.includes('paso vacío'), errors[3].message);
  assert(errors[4].message.includes('ya aparece en la fila 2'), errors[4].message);
  assertEqual(items.map((item) => item.dato), ['M3', 'Z']);
  assertEqual(items[1].pasos, ['A', 'B', 'C']);
  assertEqual(rowCount, 7);
});

test('Importar: una comilla sin cerrar que une dos filas se señala en su fila (no se importa basura)', () => {
  const { items, errors } = parseConceptsCsv('dato,cadena\nM3,"Gq → ↑ IP₃\nM2,"Gi → ↓ AMPc"\nβ1,"Gs → ↑ AMPc"');
  assertEqual(errors.map((error) => error.row), [2]);
  assert(errors[0].message.includes('comillas'), errors[0].message);
  assertEqual(items.map((item) => item.dato), ['β1']);
});

test('Importar: encabezado en cualquier orden, con mayúsculas, columnas extra y punto y coma', () => {
  const { items, errors } = parseConceptsCsv('Cadena;Notas;DATO\n"Gi → ↓ AMPc";x;M2');
  assertEqual(errors, []);
  assertEqual(items.map(({ dato, cadena }) => ({ dato, cadena })), [{ dato: 'M2', cadena: 'Gi → ↓ AMPc' }]);
});

test('Importar: sin encabezado dato,cadena o archivo vacío → error claro en la fila 1', () => {
  const noHeader = parseConceptsCsv('nombre,mecanismo\nM3,"A → B"');
  assertEqual(noHeader.items, []);
  assertEqual(noHeader.errors[0].row, 1);
  assert(noHeader.errors[0].message.includes('falta "dato" y "cadena"'), noHeader.errors[0].message);
  assert(parseConceptsCsv('\n\n').errors[0].message.includes('vacío'));
});

test('Importar: lee CSV en UTF-8 y también los de Excel antiguo (Windows-1252)', async () => {
  const ascii = (text) => Array.from(text, (char) => char.charCodeAt(0));
  const latin1 = new File([new Uint8Array([...ascii('dato,cadena\ncontracci'), 0xf3, ...ascii('n')])], 'viejo.csv'); // 0xF3 = ó
  assertEqual(await readTextFile(latin1), 'dato,cadena\ncontracción');
  const utf8 = new File(['﻿dato,cadena\nβ1,"Gs → ↑ AMPc"'], 'nuevo.csv');
  assertEqual(await readTextFile(utf8), 'dato,cadena\nβ1,"Gs → ↑ AMPc"');
});

test('Importar: guarda conceptos con su texto original y progreso nuevo', () => {
  const db = freshStorage(PREFIX);
  const { items } = parseConceptsCsv('dato,cadena\nM3,"Gq → ↑ IP₃/DAG → ↑ Ca²⁺ → contracción"\nM2,"Gi → ↓ AMPc"');
  assertEqual(importConcepts(db, items, 1000), { created: 2, updated: 0, unchanged: 0 });

  const [m3] = db.getAll('concepts');
  assertEqual(m3.dato, 'M3');
  assertEqual(m3.cadenaOriginal, 'Gq → ↑ IP₃/DAG → ↑ Ca²⁺ → contracción');
  assertEqual(m3.pasos, ['Gq', '↑ IP₃/DAG', '↑ Ca²⁺', 'contracción']);
  const progress = db.get('progress', m3.id);
  assertEqual([progress.reviewCount, progress.nextReview, progress.mastery], [0, null, 0]);
  db.clear();
});

test('Reimportar: actualiza la cadena, conserva el progreso y borra errores de pasos que ya no existen', () => {
  const db = freshStorage(PREFIX);
  importConcepts(db, parseConceptsCsv('dato,cadena\nM3,"A → B → C"').items);
  const m3 = db.getAll('concepts')[0];
  recordAttempt(db, m3, [{ expected: 'B', correct: false }, { expected: 'C', correct: false }], 5000);

  const result = importConcepts(db, parseConceptsCsv('dato,cadena\nm3,"A → B → D"').items, 9000);
  assertEqual(result, { created: 0, updated: 1, unchanged: 0 });
  const updated = db.get('concepts', m3.id);
  assertEqual([updated.dato, updated.pasos, updated.createdAt, updated.updatedAt], ['m3', ['A', 'B', 'D'], m3.createdAt, 9000]);
  assertEqual(db.get('progress', m3.id).reviewCount, 1, 'el progreso se conserva');
  assertEqual(db.getAll('errors').map((row) => row.paso), ['B'], 'el error del paso C desaparece');

  assertEqual(importConcepts(db, parseConceptsCsv('dato,cadena\nm3,"A → B → D"').items), { created: 0, updated: 0, unchanged: 1 });
  db.clear();
});

test('Eliminar un concepto borra también su progreso y sus errores', () => {
  const db = freshStorage(PREFIX);
  importConcepts(db, parseConceptsCsv('dato,cadena\nM3,"A → B"\nM2,"C → D"').items);
  const [m3, m2] = db.getAll('concepts');
  recordAttempt(db, m3, [{ expected: 'B', correct: false }]);
  recordAttempt(db, m2, [{ expected: 'D', correct: false }]);

  deleteConcept(db, m3.id);
  assertEqual(db.getAll('concepts').map((c) => c.dato), ['M2']);
  assertEqual(db.get('progress', m3.id), undefined);
  assertEqual(db.getAll('errors').map((row) => row.conceptId), [m2.id]);
  db.clear();
});

test('Temas: columna opcional "tema"; reimportar con otro tema lo actualiza', () => {
  const db = freshStorage(PREFIX);
  const { items, errors } = parseConceptsCsv('dato,cadena,Tema\nM3,"Gq → ↑ Ca²⁺",Autonómico\nM2,"Gi → ↓ FC",\nβ1,"Gs → ↑ FC",Cardio');
  assertEqual(errors, []);
  assertEqual(items.map((item) => item.tema), ['Autonómico', '', 'Cardio']);
  importConcepts(db, items);
  assertEqual(listTopics(db), ['Autonómico', 'Cardio']);
  assertEqual(importConcepts(db, parseConceptsCsv('dato,cadena,tema\nM2,"Gi → ↓ FC",Autonómico').items), { created: 0, updated: 1, unchanged: 0 });
  assertEqual(db.getAll('concepts').find((c) => c.dato === 'M2').tema, 'Autonómico');
  db.clear();
});

test('Editar concepto: cambia cadena y tema, conserva el progreso y valida como al importar', () => {
  const db = freshStorage(PREFIX);
  importConcepts(db, parseConceptsCsv('dato,cadena\nM3,"Gq → ↑ IP₃ → contraccion"\nM2,"Gi → ↓ FC"').items);
  const m3 = db.getAll('concepts')[0];
  recordAttempt(db, m3, [{ expected: '↑ IP₃', correct: false }, { expected: 'contraccion', correct: false }]);

  assertEqual(updateConcept(db, m3.id, { dato: ' M3 ', cadena: 'Gq → ↑ IP₃/DAG → contracción', tema: 'Autonómico' }), { ok: true });
  const edited = db.get('concepts', m3.id);
  assertEqual([edited.dato, edited.pasos, edited.tema], ['M3', ['Gq', '↑ IP₃/DAG', 'contracción'], 'Autonómico']);
  assertEqual(db.get('progress', m3.id).reviewCount, 1, 'el progreso se conserva');
  assertEqual(db.getAll('errors'), [], 'los errores de pasos que ya no existen desaparecen');

  assertEqual(updateConcept(db, m3.id, { dato: 'm2', cadena: 'A → B' }).message, 'Ya hay otro concepto llamado "M2".');
  assert(updateConcept(db, m3.id, { dato: 'M3', cadena: 'solo un paso' }).message.includes('al menos 2 pasos'));
  assertEqual(updateConcept(db, 'no-existe', { dato: 'X', cadena: 'A → B' }).ok, false);
  db.clear();
});
