import { test, assert, assertEqual } from './runner.js';
import { seededRandom } from './helpers.js';
import { holeRange, pickHiddenSteps, isCorrect, gradeFill, gradeRebuild, splitAnswer, hintFor, buildOptions, flipArrows } from '../src/services/exercise.js';
import { compareAnswer } from '../src/utils/text.js';

test('Huecos: 2 pasos → 1 · 4 pasos → 1–2 · 7 pasos → 2–4', () => {
  assertEqual(holeRange(2), [1, 1]);
  assertEqual(holeRange(4), [1, 2]);
  assertEqual(holeRange(7), [2, 4]);
});

test('Huecos: nunca el primero, cantidad dentro del rango y distintos en cada ejercicio', () => {
  const pasos = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const random = seededRandom(42);
  const variants = new Set();
  let lastHidden = 0;
  for (let i = 0; i < 200; i++) {
    const hidden = pickHiddenSteps(pasos, { random });
    assert(!hidden.includes(0), 'el primer paso queda visible');
    assert(hidden.length >= 2 && hidden.length <= 4, `cantidad ${hidden.length}`);
    assertEqual(hidden, [...new Set(hidden)].sort((a, b) => a - b));
    if (hidden.includes(6)) lastHidden++;
    variants.add(hidden.join(','));
  }
  assert(variants.size > 20, `solo ${variants.size} combinaciones distintas`);
  assert(lastHidden > 20 && lastHidden < 180, 'el último paso se oculta a veces, no siempre');
  assertEqual(pickHiddenSteps(['a', 'b']), [1], 'con 2 pasos se oculta el segundo');
});

test('Huecos: el paso que más fallas se oculta siempre', () => {
  const pasos = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const failedCounts = new Map([['f', 1], ['d', 3]]);
  const random = seededRandom(7);
  for (let i = 0; i < 50; i++) {
    assert(pickHiddenSteps(pasos, { failedCounts, random }).includes(3), 'd (3 errores) debe estar oculto');
  }
});

test('Evaluación: sin importar mayúsculas, tildes, espacios ni superíndices; los símbolos sí cuentan', () => {
  assert(isCorrect('↑ca2+', '↑ Ca²⁺'));
  assert(isCorrect('  ↑   Ca²⁺ ', '↑ Ca²⁺'));
  assert(isCorrect('contraccion', 'contracción'));
  assert(isCorrect('IP3/dag', 'IP₃/DAG'));
  assert(isCorrect('↓ FC / contractilidad', '↓ FC/contractilidad'));
  assert(isCorrect('agonista µ', 'agonista μ'), 'µ (micro) = μ (mu)');
  assert(isCorrect('HIPERPOLARIZACIÓN', 'hiperpolarización'));
  assert(!isCorrect('Ca²⁺', '↑ Ca²⁺'), 'falta ↑');
  assert(!isCorrect('↓ Ca²⁺', '↑ Ca²⁺'), '↓ ≠ ↑');
  assert(!isCorrect('β2', 'β1'));
  assert(!isCorrect('Gi', 'Gq'));
  assert(!isCorrect('   ', 'x'), 'vacío');
});

test('Completar: un resultado por hueco, con lo que escribió el usuario', () => {
  assertEqual(gradeFill(['Gq', '↑ IP₃/DAG', '↑ Ca²⁺', 'contracción'], [1, 3], ['↑ IP3/DAG', 'relajación']), [
    { index: 1, expected: '↑ IP₃/DAG', answer: '↑ IP3/DAG', correct: true },
    { index: 3, expected: 'contracción', answer: 'relajación', correct: false },
  ]);
});

test('Reconstruir: cadena perfecta, paso olvidado, paso inventado, orden cambiado y vacía', () => {
  const pasos = ['β1', 'Gs', '↑ AMPc', '↑ Ca²⁺', '↑ FC'];
  const marks = (result) => result.steps.map((step) => step.correct);

  assertEqual(marks(gradeRebuild(pasos, ['β1', 'gs', '↑ampc', '↑ Ca2+', '↑ FC'])), [true, true, true, true, true]);

  const missing = gradeRebuild(pasos, ['β1', 'Gs', '↑ Ca²⁺', '↑ FC']);
  assertEqual(marks(missing), [true, true, false, true, true]);
  assertEqual(missing.answers.map((a) => a.correct), [true, true, true, true]);

  const extra = gradeRebuild(pasos, ['β1', 'Gs', 'PKA', '↑ AMPc', '↑ Ca²⁺', '↑ FC']);
  assertEqual(marks(extra), [true, true, true, true, true]);
  assertEqual(extra.answers.map((a) => a.correct), [true, true, false, true, true, true]);

  const swapped = gradeRebuild(pasos, ['β1', '↑ AMPc', 'Gs', '↑ Ca²⁺', '↑ FC']);
  assertEqual(marks(swapped).filter(Boolean).length, 4, 'con dos pasos cambiados de orden, uno cuenta como fallo');
  assert(swapped.steps[0].correct && swapped.steps[3].correct && swapped.steps[4].correct);

  assertEqual(marks(gradeRebuild(pasos, [])), [false, false, false, false, false]);
});

test('Reconstruir: la respuesta se separa por líneas o por flechas', () => {
  assertEqual(splitAnswer('β1\nGs → ↑ AMPc\n\n  -> ↑ Ca²⁺ '), ['β1', 'Gs', '↑ AMPc', '↑ Ca²⁺']);
});

test('Erratas: se perdona una letra en palabras largas, nunca en flechas, números, griego ni al principio', () => {
  assertEqual(compareAnswer('hiperpolarisación', 'hiperpolarización'), 'typo');
  assertEqual(compareAnswer('contarccion', 'contracción'), 'typo', 'dos letras cambiadas de orden');
  assertEqual(compareAnswer('↓ gasto cardíacoo', '↓ gasto cardiaco'), 'typo');
  assertEqual(compareAnswer('contracción', 'contracción'), 'exact');
  assertEqual(compareAnswer('hipotensión', 'hipertensión'), 'wrong', 'hipo/hiper cambia el significado');
  assertEqual(compareAnswer('eferente', 'aferente'), 'wrong', 'la primera letra no se perdona');
  assertEqual(compareAnswer('↑ contraccion', '↓ contraccion'), 'wrong', 'la flecha no se perdona');
  assertEqual(compareAnswer('β2 agonista', 'β1 agonista'), 'wrong', 'los números no se perdonan');
  assertEqual(compareAnswer('AMPc', 'GMPc'), 'wrong', 'palabra corta');
  assertEqual(compareAnswer('contrxccxon', 'contracción'), 'wrong', 'dos erratas');
});

test('Pista: enseña el principio del paso (un tercio de sus letras)', () => {
  assertEqual(hintFor('contracción'), 'cont…');
  assertEqual(hintFor('↑ IP₃/DAG'), '↑ IP…');
  assertEqual(hintFor('Gq'), 'G…');
  const hinted = gradeFill(['A', 'Gq', 'contracción'], [1, 2], ['Gq', 'contraccion'], { hinted: new Set([2]) });
  assertEqual(hinted.map((r) => [r.correct, r.hinted ?? false]), [[true, false], [true, true]]);
});

test('Elegir: la correcta, el mismo paso con la flecha al revés y distractores parecidos, sin repetidos', () => {
  const pool = ['↑ AMPc', '↓ AMPc', '↑ K⁺', 'contracción', '↑ Ca2+', 'relajación', 'Gq'];
  const options = buildOptions('↑ Ca²⁺', pool, { random: seededRandom(3) });
  assertEqual(options.length, 4);
  assert(options.includes('↑ Ca²⁺') && options.includes('↓ Ca²⁺'), options.join(' | '));
  assert(!options.includes('↑ Ca2+'), 'no se ofrece algo que equivale a la correcta');
  assertEqual(new Set(options).size, 4);
  assertEqual(flipArrows('↑ FC, ↓ secreciones'), '↓ FC, ↑ secreciones');
  assertEqual(buildOptions('Gq', ['Gq', 'Gi'], { random: seededRandom(1) }).length, 2, 'con pocos pasos, menos opciones');
  const few = pickHiddenSteps(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], { maxHoles: 2, random: seededRandom(5) });
  assert(few.length >= 1 && few.length <= 2, `${few.length} huecos`);
});

test('Reconstruir: un paso con errata cuenta como correcto (y se marca); con pista, todos marcados', () => {
  const result = gradeRebuild(['Gq', 'hiperpolarización'], ['Gq', 'hiperpolarisacion'], { hinted: true });
  assertEqual(result.steps.map((s) => [s.correct, s.typo ?? false, s.hinted]), [[true, false, true], [true, true, true]]);
});
