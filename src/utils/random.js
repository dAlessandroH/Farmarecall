/**
 * Copia mezclada de una lista (Fisher–Yates).
 * @template T
 * @param {T[]} items
 * @param {() => number} [random]  Las pruebas pasan uno con semilla fija.
 * @returns {T[]}
 */
export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Entero aleatorio entre `min` y `max`, ambos incluidos. */
export function randomInt(min, max, random = Math.random) {
  return min + Math.floor(random() * (max - min + 1));
}

/** Identificador único. (crypto.randomUUID solo existe con HTTPS; esto funciona siempre.) */
export function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
