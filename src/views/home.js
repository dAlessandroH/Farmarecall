import { h } from '../utils/dom.js';
import { plural } from '../utils/text.js';
import { formatNextReview, formatPast, dayKey } from '../utils/dates.js';
import { icon } from '../components/icons.js';
import { segmented } from '../components/ui.js';
import { progressRing } from '../components/progress.js';
import { showToast, announceRewards } from '../components/toast.js';
import { getHomeSummary, studyStreak } from '../services/stats.js';
import { importConcepts, listTopics } from '../services/concepts.js';
import { exportBackup, shouldRemindBackup, snoozeBackupReminder } from '../services/backup.js';
import { STORAGE_LIMIT_BYTES } from '../database/storage.js';
import { parseConceptsCsv } from '../parser/concepts.js';
import { levelFromXp } from '../gamification/levels.js';
import { dailyGoal, dayActivity } from '../gamification/rewards.js';
import { unlockAchievements } from '../gamification/achievements.js';
import { getSetting, setSetting, SESSION_SIZES, MODE_LABELS } from '../database/settings.js';

const MODE_HELP = {
  completar: 'Escribe los pasos que faltan.',
  elegir: 'Elige entre 4 opciones. Lo más rápido.',
  reconstruir: 'Escribe la cadena entera. Lo más difícil.',
};

/**
 * Inicio. Una sola acción principal:
 *  - sin conceptos → bienvenida: Importar CSV (o probar con el ejemplo)
 *  - con conceptos → "Hoy" (meta, racha, nivel) y Estudiar ahora
 *
 * @param {{ db: import('../database/storage.js').Database, refresh: () => void }} context
 */
export function homeView({ db, refresh }) {
  const summary = getHomeSummary(db);
  if (summary.total === 0) return welcome(db, refresh);

  return h('main', { class: 'screen', 'data-view': 'home' },
    header(db),
    notice(db),
    todayCard(db),
    studyBlock(db, summary),
    h('div', { class: 'quick-actions' },
      quickAction('#/importar', 'upload', 'Importar CSV'),
      quickAction('#/datos', 'archive', 'Copia de seguridad'),
    ),
  );
}

function header(db) {
  const level = levelFromXp(getSetting(db, 'xp'));
  return h('header', { class: 'home-header' },
    h('div', { class: 'brand' },
      h('img', { src: 'icons/favicon.svg', alt: '', width: 36, height: 36 }),
      h('h1', { tabindex: '-1' }, 'FarmaRecall'),
    ),
    h('a', { class: 'level-chip', href: '#/logros', 'aria-label': `Nivel ${level.level}, ${level.title}. Ver logros` },
      icon('star', { size: 16 }), `Nivel ${level.level}`),
  );
}

/** Avisos importantes (como mucho uno): poco espacio o conviene hacer una copia de seguridad. */
function notice(db) {
  const used = db.bytesUsed() / STORAGE_LIMIT_BYTES;
  if (used > 0.8) {
    return h('section', { class: 'card notice notice-alert', role: 'alert' },
      h('div', { class: 'notice-head' },
        h('span', { class: 'badge-icon' }, icon('database', { size: 20 })),
        h('div', null,
          h('strong', null, 'Queda poco espacio'),
          h('p', { class: 'note' }, `Tus datos ocupan el ${Math.round(used * 100)} % del espacio del navegador. Exporta una copia.`),
        ),
      ),
      h('a', { class: 'btn btn-secondary', href: '#/datos' }, 'Ir a Copia de seguridad'),
    );
  }
  if (!shouldRemindBackup(db)) return null;

  const lastExport = getSetting(db, 'lastExport');
  const card = h('section', { class: 'card notice', 'aria-label': 'Recordatorio de copia de seguridad' },
    h('div', { class: 'notice-head' },
      h('span', { class: 'badge-icon is-unlocked' }, icon('archive', { size: 20 })),
      h('div', null,
        h('strong', null, 'Guarda una copia de tus datos'),
        h('p', { class: 'note' }, lastExport
          ? `La última fue ${formatPast(lastExport, Date.now()).toLowerCase()}.`
          : 'Tu progreso solo está en este dispositivo.'),
      ),
    ),
    h('div', { class: 'notice-actions' },
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          const { count } = exportBackup(db);
          showToast({ title: 'Copia creada', text: `${plural(count, 'concepto', 'conceptos')}. Guárdala en Archivos o iCloud.`, iconName: 'archive' });
          card.remove();
        },
      }, 'Exportar ahora'),
      h('button', {
        class: 'btn btn-secondary',
        type: 'button',
        onclick: () => {
          snoozeBackupReminder(db);
          card.remove();
        },
      }, 'Ahora no'),
    ),
  );
  return card;
}

/** Meta del día (anillo), racha y experiencia. */
function todayCard(db) {
  const now = Date.now();
  const goal = dailyGoal(db);
  const today = dayActivity(db, now);
  const done = Math.min(today.reviews, goal);
  const met = today.goalMet || today.reviews >= goal;
  const studyDays = getSetting(db, 'studyDays');
  const streak = studyStreak(studyDays, now);
  const studiedToday = studyDays.includes(dayKey(now));
  const level = levelFromXp(getSetting(db, 'xp'));

  return h('section', { class: 'card today', 'aria-label': 'Hoy' },
    progressRing(done, goal, {
      label: `Meta de hoy: ${done} de ${goal} conceptos`,
      center: met ? icon('check', { size: 30 }) : `${done}/${goal}`,
    }),
    h('div', { class: 'today-text' },
      h('p', { class: 'today-title' }, met ? 'Meta de hoy cumplida' : 'Meta de hoy'),
      h('p', { class: 'note' }, met
        ? `${plural(today.reviews, 'concepto repasado', 'conceptos repasados')}. ¡Bien hecho!`
        : `Te faltan ${plural(goal - done, 'concepto', 'conceptos')}.`),
      h('ul', { class: 'chips' },
        h('li', { class: `chip ${streak > 0 ? 'chip-accent' : ''}` }, icon('flame', { size: 16 }),
          streak === 0 ? 'Empieza tu racha hoy'
            : `${plural(streak, 'día', 'días')} de racha${studiedToday ? '' : ' · ¡hoy toca!'}`),
        h('li', { class: 'chip' }, icon('bolt', { size: 16 }), `${level.xp} XP`),
      ),
    ),
  );
}

/**
 * @param {import('../database/storage.js').Database} db
 * @param {ReturnType<typeof getHomeSummary>} summary
 */
function studyBlock(db, summary) {
  const subtitle = h('span', { class: 'btn-sub' });
  const start = h('a', { class: 'btn btn-primary btn-hero' },
    icon('play', { size: 24 }),
    h('span', { class: 'btn-text' }, h('span', null, 'Estudiar ahora'), subtitle),
  );
  const optionsLabel = h('span');
  const topics = listTopics(db);
  const currentTopic = () => (topics.includes(getSetting(db, 'studyTopic')) ? getSetting(db, 'studyTopic') : '');
  const update = () => {
    const size = getSetting(db, 'sessionSize');
    const mode = MODE_LABELS[getSetting(db, 'studyMode')];
    const topic = currentTopic();
    start.setAttribute('href', `#/estudiar?n=${size}`);
    subtitle.textContent = [`${size} conceptos`, mode, topic].filter(Boolean).join(' · ');
    optionsLabel.textContent = `Ajustar sesión (${[size, mode, topic].filter(Boolean).join(' · ')})`;
  };
  update();

  const allDone = summary.dueToday === 0 && summary.newCount === 0;
  return h('section', { class: 'study-block', 'aria-label': 'Estudiar' },
    start,
    allDone
      ? h('p', { class: 'summary' },
        h('strong', null, 'Todo al día ✓'),
        summary.nextReview !== null && ` · Próximo repaso: ${formatNextReview(summary.nextReview, Date.now()).toLowerCase()}`)
      : h('p', { class: 'summary' },
        'Pendientes hoy: ', h('strong', null, summary.dueToday),
        summary.newCount > 0 && [' · ', h('strong', null, summary.newCount), summary.newCount === 1 ? ' nuevo' : ' nuevos']),
    h('details', { class: 'session-options' },
      h('summary', null, icon('sliders', { size: 18 }), optionsLabel),
      h('div', { class: 'session-options-body' },
        segmented({
          legend: 'Conceptos por sesión (y meta diaria)',
          name: 'session-size',
          value: getSetting(db, 'sessionSize'),
          options: SESSION_SIZES.map((size) => ({ value: size, label: String(size) })),
          onChange: (size) => { setSetting(db, 'sessionSize', size); update(); },
        }),
        segmented({
          legend: 'Modo',
          name: 'study-mode',
          value: getSetting(db, 'studyMode'),
          options: Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label, description: MODE_HELP[value] })),
          onChange: (mode) => { setSetting(db, 'studyMode', mode); update(); },
        }),
        topics.length > 0 && h('label', { class: 'field' },
          h('span', { class: 'field-label' }, 'Tema'),
          h('select', {
            class: 'select',
            name: 'study-topic',
            onchange: (event) => { setSetting(db, 'studyTopic', event.target.value); update(); },
          },
          h('option', { value: '' }, 'Todos los temas'),
          topics.map((topic) => h('option', { value: topic, selected: topic === currentTopic() }, topic))),
        ),
      ),
    ),
  );
}

function quickAction(href, iconName, label) {
  return h('a', { class: 'quick-action', href }, icon(iconName, { size: 20 }), h('span', null, label));
}

/** Primera vez: explicar en 3 pasos y dejar empezar con un toque. */
function welcome(db, refresh) {
  async function loadExample(event) {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await fetch(new URL('../../ejemplos/prueba.csv', import.meta.url));
      if (!response.ok) throw new Error('No se encontró el ejemplo.');
      const { items } = parseConceptsCsv(await response.text());
      importConcepts(db, items);
      showToast({ title: `${plural(items.length, 'concepto', 'conceptos')} de ejemplo`, text: 'Pulsa "Estudiar ahora" para empezar.', iconName: 'sparkles' });
      announceRewards({ achievements: unlockAchievements(db) });
      refresh();
    } catch (error) {
      button.disabled = false;
      showToast({ title: 'No se pudo cargar el ejemplo', text: error.message, iconName: 'alert' });
    }
  }

  return h('main', { class: 'screen welcome', 'data-view': 'home' },
    h('header', { class: 'brand' },
      h('img', { src: 'icons/favicon.svg', alt: '', width: 36, height: 36 }),
      h('h1', { tabindex: '-1' }, 'FarmaRecall'),
    ),
    h('section', { class: 'card welcome-card', 'aria-labelledby': 'empty-title' },
      h('h2', { id: 'empty-title' }, 'Aprende cadenas farmacológicas recordándolas'),
      h('ol', { class: 'steps' },
        h('li', null, h('span', null, 'Prepara un CSV con dos columnas: ', h('strong', null, 'dato'), ' y ', h('strong', null, 'cadena'), '.')),
        h('li', null, h('span', null, 'Impórtalo aquí. Todo se queda en tu dispositivo.')),
        h('li', null, h('span', null, 'Estudia unos minutos al día: la app decide qué repasar.')),
      ),
      h('pre', { class: 'format' }, 'dato,cadena\nM3,"Gq → ↑ IP₃/DAG → ↑ Ca²⁺ → contracción"'),
      h('a', { class: 'btn btn-primary btn-large', href: '#/importar' }, icon('upload', { size: 22 }), 'Importar CSV'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: loadExample }, 'Probar con 5 conceptos de ejemplo'),
    ),
  );
}
