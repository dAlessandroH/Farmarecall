/**
 * Normaliza un texto para comparar respuestas o buscar, con reglas simples (sin IA):
 *  - no distingue mayúsculas ni tildes: "Contracción" = "contraccion"
 *  - no cuentan los espacios repetidos ni los que rodean a un símbolo: "↑ Ca²⁺" = "↑Ca²⁺"
 *  - superíndices y subíndices equivalen a su forma normal: "Ca²⁺" = "Ca2+", "IP₃" = "IP3", "µ" = "μ"
 * Los símbolos con significado se conservan: "↑ Ca²⁺" NO es igual a "Ca²⁺".
 *
 * @param {string} text
 */
export function normalizeAnswer(text) {
  return String(text)
    .normalize('NFKC') // ² → 2, ⁺ → +, ₃ → 3, µ → μ
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes y diéresis
    .toLowerCase()
    .replace(/[‐-―−]/g, '-') // guiones y signo menos
    .replace(/->/g, '→')
    .replace(/\s+/g, ' ')
    .replace(/ ?([→↑↓+\-/,;:()=<>≥≤·]) ?/g, '$1')
    .trim();
}

/**
 * Compara una respuesta con la correcta.
 *  - 'exact': coinciden tras normalizar.
 *  - 'typo': una errata de una letra (o dos letras cambiadas de orden) en una palabra de 6+ letras.
 *  - 'wrong': cualquier otra cosa.
 * Nunca se perdona una diferencia en flechas, números, signos o letras griegas, ni en las dos
 * primeras letras (hipo/hiper, aferente/eferente…: ahí cambia el significado).
 *
 * @param {string} answer
 * @param {string} expected
 * @returns {'exact' | 'typo' | 'wrong'}
 */
export function compareAnswer(answer, expected) {
  return compareNormalized(normalizeAnswer(answer), normalizeAnswer(expected));
}

/** Igual que compareAnswer, con los dos textos ya normalizados. */
export function compareNormalized(given, expected) {
  if (!given) return 'wrong';
  if (given === expected) return 'exact';
  return isSmallTypo(given, expected) ? 'typo' : 'wrong';
}

function isSmallTypo(a, b) {
  // La "forma" (símbolos, números, griego y dónde van las palabras) tiene que ser idéntica.
  const shape = (text) => text.replace(/[a-z]+/g, 'w');
  if (shape(a) !== shape(b)) return false;
  const lettersA = a.replace(/[^a-z]/g, '');
  const lettersB = b.replace(/[^a-z]/g, '');
  if (Math.min(lettersA.length, lettersB.length) < 6) return false;
  if (lettersA.slice(0, 2) !== lettersB.slice(0, 2)) return false;
  return withinOneEdit(lettersA, lettersB) || isAdjacentSwap(lettersA, lettersB);
}

/** ¿Se pasa de un texto al otro cambiando, quitando o añadiendo como mucho una letra? */
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** "contarccion" / "contraccion": dos letras seguidas cambiadas de orden. */
function isAdjacentSwap(a, b) {
  if (a.length !== b.length) return false;
  const k = [...a].findIndex((char, index) => char !== b[index]);
  return k >= 0 && a[k] === b[k + 1] && a[k + 1] === b[k] && a.slice(k + 2) === b.slice(k + 2);
}

/** Orden alfabético en español, con números en orden natural (M2 antes que M10). */
export function compareText(a, b) {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
}

/** "1 concepto" / "3 conceptos" */
export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
