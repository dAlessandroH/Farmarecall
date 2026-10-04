import { h } from '../utils/dom.js';
import { plural } from '../utils/text.js';
import { screen, statGrid } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { progressBar } from '../components/progress.js';
import { getProgressStats, bestStreak } from '../services/stats.js';
import { recentActivity } from '../gamification/rewards.js';
import { levelFromXp } from '../gamification/levels.js';
import { SCHEDULE } from '../spacedRepetition/scheduler.js';
import { getSetting } from '../database/settings.js';

const WEEKDAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

/** Progreso: nivel, actividad de la semana, dominio y cifras clave. */
export function progressView({ db }) {
  const stats = getProgressStats(db);

  if (stats.total === 0) {
    return screen({ title: 'Progreso', back: false },
      h('section', { class: 'card empty-state' },
        icon('chart', { size: 32 }),
        h('p', null, 'Importa conceptos y estudia para ver aquí tu progreso.'),
        h('a', { class: 'btn btn-primary', href: '#/importar' }, 'Importar CSV'),
      ),
    );
  }

  const level = levelFromXp(getSetting(db, 'xp'));
  return screen({ title: 'Progreso', back: false },
    h('section', { class: 'card level-card' },
      h('div', { class: 'level-head' },
        h('span', { class: 'badge-icon is-unlocked' }, icon('star', { size: 22 })),
        h('div', null,
          h('p', { class: 'level-title' }, `Nivel ${level.level} · ${level.title}`),
          h('p', { class: 'note' }, `${level.xp} XP en total`),
        ),
      ),
      progressBar(level.current, level.needed, { label: 'Experiencia del nivel actual', tone: 'accent' }),
      h('p', { class: 'note' }, `${level.current} / ${level.needed} XP · faltan ${level.toNext} para el nivel ${level.level + 1}`),
    ),
    weekCard(db),
    masteryCard(stats),
    statGrid([
      ['Pendientes hoy', stats.dueToday],
      ['Racha de estudio', stats.streak === 1 ? '1 día' : `${stats.streak} días`],
      ['Repasos realizados', stats.reviews],
      ['Errores totales', stats.errors],
      ['Mejor racha', plural(bestStreak(getSetting(db, 'studyDays')), 'día', 'días'), true],
    ]),
    h('p', { class: 'note' }, 'Día de descanso: puedes saltarte un día por semana sin perder la racha.'),
  );
}

/** Repasos de los últimos 7 días, en barras. */
function weekCard(db) {
  const days = recentActivity(db, Date.now(), 7);
  const max = Math.max(1, ...days.map((day) => day.reviews));
  const total = days.reduce((sum, day) => sum + day.reviews, 0);
  return h('section', { class: 'card' },
    h('h2', null, 'Últimos 7 días'),
    h('ol', { class: 'week', 'aria-label': `${plural(total, 'repaso', 'repasos')} en los últimos 7 días` },
      days.map((day, index) => h('li', { class: index === days.length - 1 ? 'is-today' : '' },
        h('span', { class: 'week-count' }, day.reviews || ''),
        h('span', { class: 'week-bar', style: `height: ${day.reviews ? Math.max(8, Math.round((day.reviews / max) * 100)) : 4}%` }),
        h('span', { class: 'week-day', 'aria-hidden': 'true' }, WEEKDAYS[new Date(day.time).getDay()]),
        h('span', { class: 'visually-hidden' }, `${new Date(day.time).toLocaleDateString('es', { weekday: 'long' })}: ${plural(day.reviews, 'repaso', 'repasos')}`),
      )),
    ),
  );
}

/** Reparto de conceptos por estado: una barra apilada con su leyenda (no solo color). */
function masteryCard(stats) {
  const parts = [
    ['dominado', 'Dominados', stats.dominado],
    ['aprendiendo', 'En progreso', stats.aprendiendo],
    ['debil', 'Débiles', stats.debil],
    ['nuevo', 'Nuevos', stats.nuevo],
  ];
  return h('section', { class: 'card' },
    h('h2', null, `${plural(stats.total, 'concepto', 'conceptos')}`),
    h('div', { class: 'stack-bar', 'aria-hidden': 'true' },
      parts.filter(([, , count]) => count > 0).map(([status, , count]) => h('span', {
        class: `stack-${status}`,
        style: `flex-grow: ${count}`,
      })),
    ),
    h('ul', { class: 'legend' },
      parts.map(([status, label, count]) => h('li', null, h('span', { class: `dot stack-${status}` }), `${label}: `, h('strong', null, count))),
    ),
    h('p', { class: 'note' },
      `Cada acierto sube un nivel de dominio y cada fallo baja ${SCHEDULE.levelsLostOnError}. `
        + `Dominado: nivel ${SCHEDULE.masteredLevel} o más. Débil: nivel 0 después de fallar.`),
  );
}
