import { shuffle, randomInt } from '../utils/random.js';
import { normalizeAnswer, compareAnswer, compareNormalized } from '../utils/text.js';

/**
 * @typedef {object} StepResult
 * @property {number} index        Posición del paso en la cadena.
 * @property {string} expected     Paso correcto.
 * @property {string} [answer]     Lo que respondió el usuario (Completar y Elegir).
 * @property {boolean} correct
 * @property {boolean} [typo]      Correcto, pero con una errata.
 * @property {boolean} [hinted]    Se usó una pista.
 * @property {boolean} [overridden] El usuario lo marcó como correcto.
 */

/**
 * Cuántos pasos ocultar en "Completar la cadena", según su longitud:
 * 2 pasos → 1 · 4 pasos → 1–2 · 7 pasos → 2–4.
 * @param {number} stepCount
 * @returns {[number, number]}
 */
export function holeRange(stepCount) {
  return [Math.max(1, Math.floor(stepCount * 0.3)), Math.max(1, Math.floor(stepCount * 0.6))];
}

/**
 * Elige qué pasos ocultar, al azar y distintos cada vez. El primero siempre queda visible
 * como punto de partida; el último a veces se oculta y a veces no.
 * Si el usuario ya ha fallado algún paso de esta cadena, el más fallado se oculta siempre.
 *
 * @param {string[]} pasos
 * @param {{ failedCounts?: Map<string, number>, random?: () => number, maxHoles?: number }} [options]
 * @returns {number[]} posiciones ocultas, ordenadas
 */
export function pickHiddenSteps(pasos, { failedCounts = new Map(), random = Math.random, maxHoles = Infinity } = {}) {
  const [min, max] = holeRange(pasos.length);
  const count = randomInt(Math.min(min, maxHoles), Math.min(max, maxHoles), random);
  const candidates = pasos.map((_, index) => index).slice(1);

  const weakest = candidates
    .filter((index) => (failedCounts.get(pasos[index]) ?? 0) > 0)
    .sort((a, b) => failedCounts.get(pasos[b]) - failedCounts.get(pasos[a]))[0];
  const chosen = weakest === undefined ? [] : [weakest];
  for (const index of shuffle(candidates.filter((i) => i !== weakest), random)) {
    if (chosen.length >= count) break;
    chosen.push(index);
  }
  return chosen.sort((a, b) => a - b);
}

/**
 * ¿La respuesta vale? Reglas simples (ver compareAnswer): sin IA, sin distinguir mayúsculas,
 * tildes ni espacios, con una errata perdonada en palabras largas, pero nunca en ↑/↓, números o griego.
 */
export function isCorrect(answer, expected) {
  return compareAnswer(answer, expected) !== 'wrong';
}

/**
 * Evalúa "Completar" o "Elegir": un resultado por hueco.
 * @param {string[]} pasos
 * @param {number[]} hidden
 * @param {string[]} answers  En el mismo orden que `hidden`.
 * @param {{ hinted?: Set<number> }} [options]  Huecos en los que se pidió pista.
 * @returns {StepResult[]}
 */
export function gradeFill(pasos, hidden, answers, { hinted = new Set() } = {}) {
  return hidden.map((index, k) => {
    const answer = answers[k] ?? '';
    const match = compareAnswer(answer, pasos[index]);
    return {
      index,
      expected: pasos[index],
      answer,
      correct: match !== 'wrong',
      ...(match === 'typo' && { typo: true }),
      ...(hinted.has(index) && { hinted: true }),
    };
  });
}

/** Separa lo que escribió el usuario en pasos: una línea por paso, o separados por → (o ->). */
export function splitAnswer(text) {
  return text.split(/\n|→|->/).map((step) => step.trim()).filter(Boolean);
}

/**
 * Evalúa "Reconstruir cadena". Alinea la secuencia del usuario con la correcta
 * (subsecuencia común más larga): un paso es correcto si aparece y en el orden adecuado.
 * Pasos de más, que falten o fuera de orden cuentan como incorrectos.
 *
 * @param {string[]} pasos
 * @param {string[]} answerSteps
 * @param {{ hinted?: boolean }} [options]  Se pidió pista (afecta a todos los pasos).
 * @returns {{ steps: StepResult[], answers: Array<{ text: string, correct: boolean }> }}
 */
export function gradeRebuild(pasos, answerSteps, { hinted = false } = {}) {
  const expected = pasos.map(normalizeAnswer);
  const given = answerSteps.map(normalizeAnswer);
  const match = (i, j) => compareNormalized(given[j], expected[i]);
  const same = (i, j) => expected[i] !== '' && match(i, j) !== 'wrong';

  // lcs[i][j] = longitud de la mejor alineación entre expected[i..] y given[j..]
  const lcs = Array.from({ length: expected.length + 1 }, () => new Array(given.length + 1).fill(0));
  for (let i = expected.length - 1; i >= 0; i--) {
    for (let j = given.length - 1; j >= 0; j--) {
      lcs[i][j] = same(i, j) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const matchedExpected = new Map(); // índice esperado → 'exact' | 'typo'
  const matchedGiven = new Set();
  for (let i = 0, j = 0; i < expected.length && j < given.length;) {
    if (same(i, j)) {
      matchedExpected.set(i, match(i, j));
      matchedGiven.add(j);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  return {
    steps: pasos.map((paso, index) => ({
      index,
      expected: paso,
      correct: matchedExpected.has(index),
      ...(matchedExpected.get(index) === 'typo' && { typo: true }),
      ...(hinted && { hinted: true }),
    })),
    answers: answerSteps.map((text, index) => ({ text, correct: matchedGiven.has(index) })),
  };
}

/**
 * Pista: el principio del paso (alrededor de un tercio de sus letras y números).
 * "contracción" → "cont…" · "↑ IP₃/DAG" → "↑ IP…" · "Gq" → "G…"
 */
export function hintFor(expected) {
  const isLetter = (char) => /[\p{L}\p{N}]/u.test(char);
  let reveal = Math.max(1, Math.ceil([...expected].filter(isLetter).length / 3));
  let text = '';
  for (const char of expected) {
    if (reveal === 0) break;
    text += char;
    if (isLetter(char)) reveal--;
  }
  return `${text.trimEnd()}…`;
}

/** Cambia ↑ por ↓ y viceversa: el distractor más útil en farmacología. */
export function flipArrows(text) {
  return text.replace(/[↑↓]/g, (arrow) => (arrow === '↑' ? '↓' : '↑'));
}

/**
 * Opciones para "Elegir": la correcta y hasta 3 distractores, mezcladas. Primero el mismo paso
 * con la flecha al revés; después pasos parecidos (misma flecha) y, si faltan, cualquier otro.
 *
 * @param {string} expected
 * @param {string[]} pool  Pasos de todas las cadenas.
 * @param {{ count?: number, random?: () => number }} [options]
 */
export function buildOptions(expected, pool, { count = 4, random = Math.random } = {}) {
  const expectedKey = normalizeAnswer(expected);
  const used = new Set([expectedKey]);
  const distractors = [];
  const add = (text) => {
    const key = normalizeAnswer(text);
    if (distractors.length >= count - 1 || !key || used.has(key)) return;
    if (compareNormalized(key, expectedKey) !== 'wrong') return; // casi igual a la correcta: no sirve de distractor
    used.add(key);
    distractors.push(text);
  };

  add(flipArrows(expected));
  const arrow = expected.match(/[↑↓]/)?.[0];
  const similar = arrow ? pool.filter((text) => text.includes(arrow) || text.includes(flipArrows(arrow))) : [];
  for (const text of shuffle(similar, random)) add(text);
  for (const text of shuffle(pool, random)) add(text);
  return shuffle([expected, ...distractors], random);
}
