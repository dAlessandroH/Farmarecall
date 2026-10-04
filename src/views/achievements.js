import { h } from '../utils/dom.js';
import { screen } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { progressBar } from '../components/progress.js';
import { getAchievements } from '../gamification/achievements.js';
import { levelFromXp, XP_RULES } from '../gamification/levels.js';
import { getSetting } from '../database/settings.js';

/** Logros: los conseguidos primero; los demás, con cuánto falta. */
export function achievementsView({ db }) {
  const achievements = getAchievements(db);
  const unlocked = achievements.filter((a) => a.unlockedAt !== null);
  const locked = achievements.filter((a) => a.unlockedAt === null)
    .sort((a, b) => b.value / b.target - a.value / a.target); // los más cercanos primero
  const level = levelFromXp(getSetting(db, 'xp'));

  return screen({ title: 'Logros', back: false },
    h('section', { class: 'card level-card' },
      h('div', { class: 'level-head' },
        h('span', { class: 'badge-icon is-unlocked' }, icon('trophy', { size: 22 })),
        h('div', null,
          h('p', { class: 'level-title' }, `${unlocked.length} de ${achievements.length} logros`),
          h('p', { class: 'note' }, `Nivel ${level.level} · ${level.title} · ${level.xp} XP`),
        ),
      ),
      progressBar(unlocked.length, achievements.length, { label: 'Logros conseguidos', tone: 'accent' }),
    ),
    unlocked.length > 0 && h('h2', { class: 'section-title' }, 'Conseguidos'),
    unlocked.length > 0 && h('ul', { class: 'achievements' }, unlocked.map(achievementCard)),
    locked.length > 0 && h('h2', { class: 'section-title' }, 'Por conseguir'),
    locked.length > 0 && h('ul', { class: 'achievements' }, locked.map(achievementCard)),
    h('details', { class: 'card how-xp' },
      h('summary', null, '¿Cómo se gana experiencia?'),
      h('ul', null,
        h('li', null, `+${XP_RULES.perCorrectStep.completar} XP por paso acertado (+${XP_RULES.perCorrectStep.reconstruir} en Reconstruir).`),
        h('li', null, `+${XP_RULES.perfectConcept} XP por concepto sin fallos.`),
        h('li', null, `+${XP_RULES.sessionComplete} XP por terminar una sesión.`),
        h('li', null, `+${XP_RULES.dailyGoal} XP al cumplir la meta del día.`),
      ),
    ),
  );
}

function achievementCard(achievement) {
  const done = achievement.unlockedAt !== null;
  return h('li', { class: `achievement ${done ? 'is-unlocked' : 'is-locked'}` },
    h('span', { class: `badge-icon ${done ? 'is-unlocked' : ''}` }, icon(done ? achievement.icon : 'lock', { size: 22 })),
    h('div', { class: 'achievement-text' },
      h('p', { class: 'achievement-title' }, achievement.title, h('span', { class: 'visually-hidden' }, done ? ' (conseguido)' : ' (pendiente)')),
      h('p', { class: 'note' }, achievement.description),
      done
        ? h('p', { class: 'achievement-date' }, `Conseguido el ${new Date(achievement.unlockedAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`)
        : [
          progressBar(achievement.value, achievement.target, { label: `${achievement.title}: ${achievement.value} de ${achievement.target}` }),
          h('p', { class: 'achievement-progress' }, `${achievement.value} / ${achievement.target}`),
        ],
    ),
  );
}
