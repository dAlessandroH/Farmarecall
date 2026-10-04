import { parseCsv } from './csv.js';
import { splitChain } from './chain.js';
import { normalizeAnswer } from '../utils/text.js';

/**
 * @typedef {{ row: number, dato: string, cadena: string, pasos: string[], tema: string }} ImportItem
 * @typedef {{ row: number, message: string }} RowError
 */

/**
 * Lee un CSV con columnas `dato` y `cadena` (en cualquier orden) y, opcionalmente, `tema`
 * para agrupar los conceptos. Otras columnas se ignoran.
 * Valida cada fila y devuelve los conceptos válidos y los errores con su número de fila.
 *
 * @param {string} text
 * @returns {{ items: ImportItem[], errors: RowError[], rowCount: number }}
 *   rowCount: filas con contenido, sin contar el encabezado.
 */
export function parseConceptsCsv(text) {
  const { rows, error } = parseCsv(text);
  if (rows.every(isEmptyRow) && !error) {
    return { items: [], errors: [{ row: 1, message: 'El archivo está vacío.' }], rowCount: 0 };
  }

  const header = (rows[0] ?? []).map(normalizeHeader);
  const datoColumn = header.indexOf('dato');
  const cadenaColumn = header.indexOf('cadena');
  const temaColumn = header.indexOf('tema');
  if (datoColumn === -1 || cadenaColumn === -1) {
    const missing = [datoColumn === -1 && '"dato"', cadenaColumn === -1 && '"cadena"'].filter(Boolean).join(' y ');
    return {
      items: [],
      errors: [{ row: 1, message: `La primera fila debe ser el encabezado dato,cadena (falta ${missing}).` }],
      rowCount: 0,
    };
  }

  const items = [];
  const errors = [];
  const firstRowByDato = new Map();
  let rowCount = 0;

  rows.forEach((fields, index) => {
    if (index === 0 || isEmptyRow(fields)) return;
    rowCount++;
    const row = index + 1;
    const dato = (fields[datoColumn] ?? '').trim();
    const cadena = (fields[cadenaColumn] ?? '').trim();
    const tema = temaColumn === -1 ? '' : (fields[temaColumn] ?? '').trim();

    const problem = validateConcept(dato, cadena);
    if (problem) {
      errors.push({ row, message: problem });
      return;
    }
    const key = normalizeAnswer(dato);
    if (firstRowByDato.has(key)) {
      errors.push({ row, message: `"${dato}" está repetido (ya aparece en la fila ${firstRowByDato.get(key)}).` });
      return;
    }
    firstRowByDato.set(key, row);
    items.push({ row, dato, cadena, pasos: splitChain(cadena), tema });
  });

  if (error) {
    errors.push(error);
    rowCount++;
  }
  return { items, errors, rowCount };
}

/**
 * Comprueba un dato y su cadena. Devuelve el problema en palabras, o null si está bien.
 * (También lo usa la edición de conceptos.)
 * @param {string} dato
 * @param {string} cadena
 */
export function validateConcept(dato, cadena) {
  if (!dato && !cadena) return 'La fila no tiene dato ni cadena.';
  if (dato.includes('\n') || cadena.includes('\n')) {
    // Casi siempre es una comilla sin cerrar que ha unido esta fila con la siguiente.
    return 'Hay un salto de línea dentro de un campo. ¿Falta cerrar unas comillas (") en esta fila?';
  }
  if (!dato) return 'Falta el dato.';
  if (!cadena) return `Falta la cadena de "${dato}".`;
  const pasos = splitChain(cadena);
  if (pasos.length < 2) return `La cadena de "${dato}" necesita al menos 2 pasos separados por →.`;
  if (pasos.some((paso) => paso === '')) return `La cadena de "${dato}" tiene un paso vacío (revisa las flechas →).`;
  return null;
}

/** @param {string[]} fields */
function isEmptyRow(fields) {
  return fields.every((field) => field.trim() === '');
}

/** "Dato", " DATO " → "dato" */
function normalizeHeader(name) {
  return name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
