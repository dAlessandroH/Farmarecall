import { openStorage } from '../src/database/storage.js';

/** Almacenamiento de pruebas vacío (con su propio prefijo: nunca toca los datos reales). */
export function freshStorage(prefix) {
  const db = openStorage(prefix);
  db.clear();
  return db;
}

/** Generador aleatorio con semilla fija (mulberry32), para pruebas reproducibles. */
export function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const texts = (nodes) => Array.from(nodes, (node) => node.textContent.trim());

/** Monta una vista fuera de la vista (pero renderizada, para poder hacer clic y enfocar); devuelve cómo quitarla. */
export function mount(view) {
  const sandbox = document.createElement('div');
  sandbox.style.cssText = 'position: fixed; left: -10000px; top: 0; width: 375px;';
  sandbox.append(view);
  document.body.append(sandbox);
  return () => sandbox.remove();
}

export function concept(id, pasos = ['A', 'B'], dato = id) {
  return { id, dato, cadenaOriginal: pasos.join(' → '), pasos, createdAt: 0, updatedAt: 0 };
}

export function progress(conceptId, fields = {}) {
  return { conceptId, mastery: 0, streak: 0, errorCount: 0, reviewCount: 0, nextReview: null, lastReview: null, ...fields };
}
