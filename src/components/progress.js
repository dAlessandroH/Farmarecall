import { h } from '../utils/dom.js';

const percentOf = (value, max) => (max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0);

/**
 * Barra de progreso accesible.
 * @param {number} value
 * @param {number} max
 * @param {{ label: string, tone?: 'primary' | 'accent' | 'ok' }} options
 */
export function progressBar(value, max, { label, tone = 'primary' }) {
  return h('div', {
    class: `bar bar-${tone}`,
    role: 'progressbar',
    'aria-label': label,
    'aria-valuemin': 0,
    'aria-valuemax': max,
    'aria-valuenow': Math.min(value, max),
  }, h('span', { class: 'bar-fill', style: `width: ${percentOf(value, max)}%` }));
}

/**
 * Anillo de progreso (meta del día) con contenido en el centro.
 * @param {number} value
 * @param {number} max
 * @param {{ label: string, center: Node | string }} options
 */
export function progressRing(value, max, { label, center }) {
  return h('div', {
    class: 'ring',
    role: 'progressbar',
    'aria-label': label,
    'aria-valuemin': 0,
    'aria-valuemax': max,
    'aria-valuenow': Math.min(value, max),
    style: `--percent: ${percentOf(value, max)}`,
  }, h('span', { class: 'ring-center' }, center));
}
