/**
 * Lector de CSV (RFC 4180), sin dependencias.
 *  - Separador detectado en la primera fila: coma, punto y coma (Excel en español) o tabulador.
 *  - Campos entre comillas con comas, saltos de línea y comillas dobles escapadas ("").
 *  - Ignora el BOM inicial y acepta saltos de línea de Windows, Mac y Linux.
 *
 * @param {string} text
 * @returns {{ rows: string[][], error?: { row: number, message: string } }}
 *   rows[0] es la fila 1, como en una hoja de cálculo (las filas vacías también cuentan).
 */
export function parseCsv(text) {
  const source = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const delimiter = detectDelimiter(source);
  const rows = [];
  let fields = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char !== '"') {
        field += char;
      } else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(field);
      field = '';
    } else if (char === '\n') {
      fields.push(field);
      rows.push(fields);
      fields = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    return { rows, error: { row: rows.length + 1, message: 'Hay unas comillas (") sin cerrar.' } };
  }
  if (field !== '' || fields.length > 0) {
    fields.push(field);
    rows.push(fields);
  }
  return { rows };
}

/** @param {string} text */
function detectDelimiter(text) {
  const end = text.indexOf('\n');
  const header = end === -1 ? text : text.slice(0, end);
  let best = ',';
  let bestCount = 0;
  for (const candidate of [',', ';', '\t']) {
    const count = header.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}
