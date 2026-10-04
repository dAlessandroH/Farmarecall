import { h } from '../utils/dom.js';

/** Símbolos difíciles de escribir en el teclado del iPhone. (², ⁺, ₃… no hacen falta: "Ca2+" vale como "Ca²⁺".) */
const SYMBOLS = [
  ['↑', 'flecha arriba'],
  ['↓', 'flecha abajo'],
  ['→', 'flecha derecha'],
  ['α', 'alfa'],
  ['β', 'beta'],
  ['γ', 'gamma'],
  ['μ', 'mu'],
];

const FIELD = 'input[type="text"], textarea';
let lastField = null;
document.addEventListener('focusin', (event) => {
  if (event.target instanceof Element && event.target.matches(FIELD)) lastField = event.target;
});

/**
 * Barra fija con símbolos médicos. Al tocar uno se escribe en el campo donde estaba el cursor
 * sin cerrar el teclado.
 */
export function symbolBar() {
  return h('div', { class: 'symbol-bar', role: 'toolbar', 'aria-label': 'Insertar símbolo' },
    SYMBOLS.map(([symbol, name]) => h('button', {
      type: 'button',
      class: 'symbol',
      'aria-label': `Insertar ${name}`,
      // Evita que el campo pierda el foco (y que el teclado del iPhone se cierre).
      onmousedown: (event) => event.preventDefault(),
      onclick: () => insertSymbol(symbol),
    }, symbol)),
  );
}

/** @param {string} symbol */
function insertSymbol(symbol) {
  const active = document.activeElement;
  const field = active instanceof Element && active.matches(FIELD) ? active : lastField;
  if (!field || !field.isConnected) return;
  field.focus();
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.setRangeText(symbol, start, end, 'end');
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
