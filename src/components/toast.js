import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { XP_RULES } from '../gamification/levels.js';

const VISIBLE_MS = 4000;
let region = null;

function toastRegion() {
  if (!region || !region.isConnected) {
    region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  return region;
}

/**
 * Aviso breve arriba de la pantalla (logro, nivel, meta). Desaparece solo o al tocarlo.
 * Con `onClick` es un botón (p. ej. "Nueva versión: toca para actualizar"); con `persistent`
 * se queda hasta que se toca.
 * @param {{ title: string, text?: string, iconName?: string, onClick?: () => void, persistent?: boolean }} options
 */
export function showToast({ title, text, iconName = 'star', onClick, persistent = false }) {
  const toast = h(onClick ? 'button' : 'div', { class: 'toast', type: onClick ? 'button' : null },
    h('span', { class: 'toast-icon' }, icon(iconName, { size: 22 })),
    h('span', { class: 'toast-text' }, h('strong', null, title), text && h('span', null, text)),
  );
  const dismiss = () => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 250);
  };
  toast.addEventListener('click', () => {
    dismiss();
    onClick?.();
  });
  toastRegion().append(toast);
  if (!persistent) setTimeout(dismiss, VISIBLE_MS);
}

/**
 * Avisa de lo conseguido: meta del día, subida de nivel y logros nuevos.
 * @param {{ goalReached?: boolean, levelUp?: { level: number, title: string } | null, achievements?: Array<{ title: string, description: string, icon: string }> }} rewards
 */
export function announceRewards({ goalReached = false, levelUp = null, achievements = [] }) {
  if (goalReached) showToast({ title: 'Meta de hoy cumplida', text: `+${XP_RULES.dailyGoal} XP extra`, iconName: 'target' });
  if (levelUp) showToast({ title: `¡Nivel ${levelUp.level}!`, text: `Ahora eres ${levelUp.title}.`, iconName: 'star' });
  for (const achievement of achievements) {
    showToast({ title: `Logro: ${achievement.title}`, text: achievement.description, iconName: achievement.icon });
  }
}
