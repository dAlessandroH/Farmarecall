import { test, assertEqual } from './runner.js';
import { parseCsv } from '../src/parser/csv.js';
import { splitChain } from '../src/parser/chain.js';

test('CSV: comas dentro de comillas y símbolos Unicode intactos', () => {
  const { rows } = parseCsv('dato,cadena\nM3,"Gq → ↑ IP₃/DAG, PLC → ↑ Ca²⁺ → contracción"\n');
  assertEqual(rows, [['dato', 'cadena'], ['M3', 'Gq → ↑ IP₃/DAG, PLC → ↑ Ca²⁺ → contracción']]);
});

test('CSV: comillas escapadas ("") y saltos de línea dentro de un campo', () => {
  const { rows } = parseCsv('a,b\n"dice ""hola""","línea 1\nlínea 2"');
  assertEqual(rows[1], ['dice "hola"', 'línea 1\nlínea 2']);
});

test('CSV: BOM, saltos de línea de Windows y última fila sin salto', () => {
  const { rows } = parseCsv('﻿dato,cadena\r\nβ1,"Gs → ↑ AMPc"\r\nα1,"Gq → ↑ Ca²⁺"');
  assertEqual(rows, [['dato', 'cadena'], ['β1', 'Gs → ↑ AMPc'], ['α1', 'Gq → ↑ Ca²⁺']]);
});

test('CSV: separador punto y coma (Excel en español) y tabulador', () => {
  assertEqual(parseCsv('dato;cadena\nM2;"Gi → ↓ AMPc; ↑ K⁺"').rows[1], ['M2', 'Gi → ↓ AMPc; ↑ K⁺']);
  assertEqual(parseCsv('dato\tcadena\nM2\tGi → ↓ AMPc').rows[1], ['M2', 'Gi → ↓ AMPc']);
});

test('CSV: las filas vacías cuentan para la numeración (como en una hoja de cálculo)', () => {
  const { rows } = parseCsv('a,b\n\nc,d\n');
  assertEqual(rows, [['a', 'b'], [''], ['c', 'd']]);
});

test('CSV: comillas sin cerrar → error con el número de fila', () => {
  const { rows, error } = parseCsv('dato,cadena\nM3,"Gq → ↑ IP₃\nM2,Gi → ↓ AMPc');
  assertEqual(rows.length, 1);
  assertEqual(error.row, 2);
});

test('Cadena: se divide por → (o ->) sin cambiar el texto de cada paso', () => {
  assertEqual(splitChain('β1 → Gs → ↑ AMPc → ↑ Ca²⁺ → ↑ FC'), ['β1', 'Gs', '↑ AMPc', '↑ Ca²⁺', '↑ FC']);
  assertEqual(splitChain('A->B -> C'), ['A', 'B', 'C']);
  assertEqual(splitChain('  Gq →↑ IP₃/DAG→contracción '), ['Gq', '↑ IP₃/DAG', 'contracción']);
});
