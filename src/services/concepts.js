import { newProgress } from '../spacedRepetition/scheduler.js';
import { splitChain } from '../parser/chain.js';
import { validateConcept } from '../parser/concepts.js';
import { newId } from '../utils/random.js';
import { normalizeAnswer, compareText } from '../utils/text.js';

/**
 * Guarda los conceptos leídos de un CSV.
 * Si un dato ya existe (sin distinguir mayúsculas ni tildes), se actualizan su cadena y su tema
 * y se conserva su progreso. El contenido del usuario se guarda tal cual.
 *
 * @param {import('../database/storage.js').Database} db
 * @param {import('../parser/concepts.js').ImportItem[]} items
 * @returns {{ created: number, updated: number, unchanged: number }}
 */
export function importConcepts(db, items, now = Date.now()) {
  const existing = new Map(db.getAll('concepts').map((concept) => [normalizeAnswer(concept.dato), concept]));
  const concepts = [];
  const progress = [];
  const newStepsById = new Map();
  let updated = 0;
  let unchanged = 0;

  for (const { dato, cadena, pasos, tema = '' } of items) {
    const current = existing.get(normalizeAnswer(dato));
    if (!current) {
      const id = newId();
      concepts.push({ id, dato, cadenaOriginal: cadena, pasos, tema, createdAt: now, updatedAt: now });
      progress.push(newProgress(id));
    } else if (current.cadenaOriginal !== cadena || current.dato !== dato || (current.tema ?? '') !== tema) {
      concepts.push({ ...current, dato, cadenaOriginal: cadena, pasos, tema, updatedAt: now });
      if (current.cadenaOriginal !== cadena) newStepsById.set(current.id, pasos);
      updated++;
    } else {
      unchanged++;
    }
  }

  db.putMany('concepts', concepts);
  db.putMany('progress', progress);
  dropStaleErrors(db, newStepsById);
  return { created: progress.length, updated, unchanged };
}

/**
 * Edita un concepto desde la app (dato, cadena y tema). Conserva su progreso.
 * @param {import('../database/storage.js').Database} db
 * @param {string} id
 * @param {{ dato: string, cadena: string, tema?: string }} changes
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function updateConcept(db, id, { dato, cadena, tema = '' }, now = Date.now()) {
  const current = db.get('concepts', id);
  if (!current) return { ok: false, message: 'Este concepto ya no existe.' };
  const clean = { dato: dato.trim(), cadena: cadena.trim(), tema: tema.trim() };

  const problem = validateConcept(clean.dato, clean.cadena);
  if (problem) return { ok: false, message: problem };
  const duplicate = db.getAll('concepts')
    .find((concept) => concept.id !== id && normalizeAnswer(concept.dato) === normalizeAnswer(clean.dato));
  if (duplicate) return { ok: false, message: `Ya hay otro concepto llamado "${duplicate.dato}".` };

  const pasos = splitChain(clean.cadena);
  db.put('concepts', { ...current, dato: clean.dato, cadenaOriginal: clean.cadena, pasos, tema: clean.tema, updatedAt: now });
  if (current.cadenaOriginal !== clean.cadena) dropStaleErrors(db, new Map([[id, pasos]]));
  return { ok: true };
}

/**
 * Elimina un concepto con su progreso y sus errores.
 * @param {import('../database/storage.js').Database} db
 * @param {string} id
 */
export function deleteConcept(db, id) {
  db.delete('concepts', id);
  db.delete('progress', id);
  db.replaceAll('errors', db.getAll('errors').filter((row) => row.conceptId !== id));
}

/** Temas usados en la biblioteca, en orden alfabético. */
export function listTopics(db) {
  return [...new Set(db.getAll('concepts').map((concept) => concept.tema ?? '').filter(Boolean))].sort(compareText);
}

/** Los errores de pasos que ya no están en la cadena nueva dejan de tener sentido. */
function dropStaleErrors(db, newStepsById) {
  if (newStepsById.size === 0) return;
  db.replaceAll('errors', db.getAll('errors').filter((row) => (
    !newStepsById.has(row.conceptId) || newStepsById.get(row.conceptId).includes(row.paso)
  )));
}
