import { h } from '../utils/dom.js';

/**
 * Cadena en vertical, con una flecha ↓ entre pasos (la dibuja el CSS).
 * Cada paso puede ser texto o un elemento (un campo para responder, un resultado…).
 *
 * @param {Array<Node | string>} steps
 */
export function chainList(steps) {
  return h('ol', { class: 'chain' },
    steps.map((step) => h('li', null, typeof step === 'string' ? h('span', { class: 'step' }, step) : step)),
  );
}
