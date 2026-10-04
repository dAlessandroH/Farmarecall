import { h, setChildren } from '../utils/dom.js';
import { formatNextReview } from '../utils/dates.js';
import { screen } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { chainList } from '../components/chain.js';
import { progressBar } from '../components/progress.js';
import { announceRewards } from '../components/toast.js';
import { fillExercise, choiceExercise, rebuildExercise } from '../components/exercises.js';
import { getSetting, SESSION_SIZES, STUDY_MODES } from '../database/settings.js';
import { pickSession, pickErrorSession } from '../services/session.js';
import { recordAttempt, failedStepCounts } from '../services/review.js';
import { rewardAttempt, rewardSession, dailyGoal, dayActivity, isCleanPerfect } from '../gamification/rewards.js';
import { unlockAchievements } from '../gamification/achievements.js';
import { levelFromXp } from '../gamification/levels.js';

const PRAISE = ['¡Perfecto!', '¡Exacto!', '¡Impecable!', '¡Muy bien!', '¡Así se hace!'];
const HELPED = ['Bien, con ayuda', 'Correcto con pista'];
const ALMOST = ['¡Casi!', 'Vas muy cerca', 'Buen intento'];
const MISSED = ['Ahora ya la has visto', 'Fallar también es aprender', 'La próxima sale'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const allCorrect = (results) => results.every((result) => result.correct);

/**
 * Sesión de estudio. Una tarea a la vez: Concepto → Cadena → Responder → Comprobar → Siguiente.
 *  - Un concepto nuevo se enseña primero entero ("La tengo, pregúntame").
 *  - Lo que sale con errores o con pista se vuelve a preguntar una vez al final de la sesión.
 *
 * #/estudiar?n=10                 sesión normal (prioriza pendientes, errores y nuevos)
 * #/estudiar?errores=1&n=10       repasar los conceptos con más errores
 * #/estudiar?concepto=<id>        un solo concepto
 * &modo=completar|elegir|reconstruir   opcional; por defecto, el modo elegido en Inicio
 * &tema=<tema>                    opcional; por defecto, el tema elegido en Inicio
 *
 * @param {{ db: import('../database/storage.js').Database, params: URLSearchParams }} context
 */
export function studyView({ db, params }) {
  const mode = STUDY_MODES.includes(params.get('modo')) ? params.get('modo') : getSetting(db, 'studyMode');
  const size = SESSION_SIZES.includes(Number(params.get('n'))) ? Number(params.get('n')) : getSetting(db, 'sessionSize');
  const allConcepts = db.getAll('concepts');
  const byId = new Map(allConcepts.map((concept) => [concept.id, concept]));
  const progressById = new Map(db.getAll('progress').map((row) => [row.conceptId, row]));
  const topic = params.get('tema') ?? getSetting(db, 'studyTopic');
  const inTopic = topic ? allConcepts.filter((concept) => (concept.tema ?? '') === topic) : [];

  let ids;
  if (params.has('concepto')) ids = byId.has(params.get('concepto')) ? [params.get('concepto')] : [];
  else if (params.has('errores')) ids = pickErrorSession(allConcepts, progressById, size);
  else ids = pickSession(inTopic.length > 0 ? inTopic : allConcepts, progressById, size, Date.now()).ids;

  if (ids.length === 0) return emptyScreen(allConcepts.length, params);

  /** @type {Array<{ id: string, repeat: boolean, previewed?: boolean }>} */
  const queue = ids.map((id) => ({ id, repeat: false }));
  const pool = [...new Set(allConcepts.flatMap((concept) => concept.pasos))];
  const isNew = (id) => !(progressById.get(id)?.reviewCount > 0);

  const position = h('span', { class: 'study-position' });
  const barSlot = h('div', { class: 'study-bar' });
  const heading = h('h1', { tabindex: '-1' });
  const stage = h('div', { class: 'study-stage' });
  const view = h('main', { class: 'screen study', 'data-view': 'study' },
    h('header', { class: 'study-header' },
      h('a', { class: 'icon-button', href: '#/', 'aria-label': 'Salir de la sesión' }, icon('x', { size: 22 })),
      barSlot,
      position,
    ),
    heading,
    stage,
  );

  /** @type {Array<{ concept: object, results: import('../services/exercise.js').StepResult[], xp: number, repeat: boolean }>} */
  const outcomes = [];
  const unlockedInSession = [];
  let current = 0;
  let perfectRun = 0;

  function updateHeader(done) {
    position.textContent = `${Math.min(current + 1, queue.length)}/${queue.length}`;
    setChildren(barSlot, progressBar(done, queue.length, { label: `Paso ${current + 1} de ${queue.length} de la sesión` }));
  }

  function afterRender(target) {
    window.scrollTo(0, 0);
    // Con ratón y teclado se puede escribir directamente; en el móvil no se abre el teclado sin pedirlo.
    if (window.matchMedia('(pointer: fine)').matches) setTimeout(() => target?.focus(), 0);
    else if (current > 0) heading.focus();
  }

  function showStep() {
    const entry = queue[current];
    const concept = byId.get(entry.id);
    updateHeader(current);
    heading.textContent = concept.dato;
    if (!entry.repeat && !entry.previewed && isNew(entry.id)) showPreview(concept, entry);
    else showExercise(concept, entry);
  }

  /** Primera vez: ver la cadena entera antes de que se pregunte. */
  function showPreview(concept, entry) {
    const ready = h('button', {
      class: 'btn btn-primary btn-large',
      type: 'button',
      onclick: () => {
        entry.previewed = true;
        showExercise(concept, entry);
      },
    }, 'La tengo, pregúntame');
    setChildren(stage,
      h('p', { class: 'eyebrow' }, icon('eye', { size: 16 }), 'Concepto nuevo'),
      h('p', { class: 'instruction' }, 'Léela con calma. Después te la preguntaré.'),
      concept.tema && h('p', { class: 'topic-chip' }, icon('tag', { size: 14 }), concept.tema),
      chainList(concept.pasos),
      ready,
    );
    afterRender(ready);
  }

  function showExercise(concept, entry) {
    const onSubmit = (results, answers) => showFeedback(concept, entry, results, answers);
    const failedCounts = failedStepCounts(db, concept.id);
    const exercise = mode === 'reconstruir' ? rebuildExercise({ concept, onSubmit })
      : mode === 'elegir' ? choiceExercise({ concept, failedCounts, pool, onSubmit })
        : fillExercise({ concept, failedCounts, onSubmit });
    setChildren(stage,
      entry.repeat && h('p', { class: 'eyebrow is-repeat' }, icon('refresh', { size: 16 }), 'Otra vez: antes no salió del todo'),
      exercise,
    );
    afterRender(stage.querySelector('input[type="text"], textarea'));
  }

  /**
   * Guarda el intento (repaso espaciado + errores) y su recompensa, con un único "deshacer".
   * `again`: es una corrección del mismo intento ("Marcar como correcta"); no repite el aviso de la meta.
   */
  function record(concept, results, again = false) {
    const saved = recordAttempt(db, concept, results);
    const reward = rewardAttempt(db, { results, mode, previousProgress: saved.previous });
    const achievements = unlockAchievements(db);
    unlockedInSession.push(...achievements);
    announceRewards({ goalReached: reward.goalReached && !again, levelUp: reward.levelUp, achievements });
    return {
      progress: saved.progress,
      /** XP del concepto (la que se muestra en la corrección). */
      conceptXp: reward.xp,
      /** XP total, incluida la de la meta del día (la que suma en el resumen). */
      xp: reward.xp + reward.goalXp,
      undo() {
        reward.undo();
        saved.undo();
      },
    };
  }

  /** Posición en la cola de la repetición pendiente de este concepto (o -1). */
  const pendingRepeat = (id) => queue.findIndex((entry, index) => index > current && entry.id === id && entry.repeat);

  /**
   * Corrección inmediata. El intento ya queda registrado; "Marcar como correcta" lo rehace.
   * @param {object} concept
   * @param {{ id: string, repeat: boolean }} entry
   * @param {import('../services/exercise.js').StepResult[]} results
   * @param {Array<{ text: string, correct: boolean }>} [answers]  Solo en "Reconstruir".
   */
  function showFeedback(concept, entry, results, answers) {
    let attempt = record(concept, results);
    const outcome = { concept, results, xp: attempt.xp, repeat: entry.repeat };
    outcomes[current] = outcome;

    // Si no salió limpio (errores o pista), se vuelve a preguntar una vez al final de la sesión.
    const syncRepeat = () => {
      const pending = pendingRepeat(entry.id);
      if (!entry.repeat && !isCleanPerfect(results) && pending === -1) queue.push({ id: entry.id, repeat: true });
      if (isCleanPerfect(results) && pending !== -1) queue.splice(pending, 1);
      updateHeader(current + 1);
    };
    syncRepeat();

    const render = () => {
      const correctCount = results.filter((result) => result.correct).length;
      const clean = isCleanPerfect(results);
      const ok = allCorrect(results);
      const title = clean ? pick(PRAISE) : ok ? pick(HELPED) : correctCount > 0 ? pick(ALMOST) : pick(MISSED);
      const byIndex = new Map(results.map((result) => [result.index, result]));
      const next = h('button', { class: 'btn btn-primary btn-large', type: 'button', onclick: goNext },
        current === queue.length - 1 ? 'Ver resultado' : 'Siguiente');

      setChildren(stage,
        h('div', { class: `result-banner ${ok ? 'is-ok' : 'is-bad'}`, role: 'status' },
          h('span', { class: 'result-icon' }, icon(ok ? 'check' : 'x', { size: 26 })),
          h('div', { class: 'result-text' },
            h('p', { class: 'result-title' }, title),
            h('p', { class: 'score' }, `${correctCount} de ${results.length} ${results.length === 1 ? 'paso correcto' : 'pasos correctos'}`),
            h('p', { class: 'result-next' }, `Vuelve a salir ${formatNextReview(attempt.progress.nextReview, Date.now()).toLowerCase()}`),
          ),
          attempt.conceptXp > 0 && h('span', { class: 'xp-chip' }, `+${attempt.conceptXp} XP`),
        ),
        pendingRepeat(entry.id) !== -1 && h('p', { class: 'repeat-note' }, icon('refresh', { size: 16 }),
          'Te lo volveré a preguntar al final de la sesión.'),
        clean && perfectRun + 1 >= 3 && h('p', { class: 'run-chip' }, icon('flame', { size: 16 }), `${perfectRun + 1} seguidas sin fallos`),
        answers && h('h2', { class: 'section-title' }, 'Respuesta correcta'),
        chainList(concept.pasos.map((paso, index) => (byIndex.has(index) ? stepResult(byIndex.get(index)) : paso))),
        answers && h('h2', { class: 'section-title' }, 'Tu respuesta'),
        answers && answerList(answers),
        next,
      );
      return next;
    };

    const stepResult = (result) => h('div', { class: `step step-result ${result.correct ? 'is-ok' : 'is-bad'}` },
      h('span', { class: 'step-head' },
        h('span', { class: 'step-mark', 'aria-hidden': 'true' }, result.correct ? '✓' : '✗'),
        h('span', { class: 'visually-hidden' }, result.correct ? 'Correcto: ' : 'Incorrecto: '),
        h('span', null, result.expected),
      ),
      result.typo && h('span', { class: 'your-answer' },
        result.answer !== undefined ? ['Escribiste: ', result.answer.trim(), ' · '] : null, 'errata aceptada'),
      !result.correct && result.answer !== undefined
        && h('span', { class: 'your-answer' }, mode === 'elegir' ? 'Elegiste: ' : 'Escribiste: ', result.answer.trim() || '(nada)'),
      result.correct && result.hinted && h('span', { class: 'your-answer' }, 'Con pista'),
      result.overridden && h('span', { class: 'your-answer' }, 'Marcada como correcta'),
      !result.correct && mode !== 'elegir' && h('button', {
        type: 'button',
        class: 'link-button',
        onclick: () => {
          result.correct = true;
          result.overridden = true;
          attempt.undo();
          attempt = record(concept, results, true);
          outcome.xp = attempt.xp;
          syncRepeat();
          render().focus();
        },
      }, 'Marcar como correcta'),
    );

    window.scrollTo(0, 0);
    render().focus({ preventScroll: true });
  }

  function goNext() {
    perfectRun = isCleanPerfect(outcomes[current].results) ? perfectRun + 1 : 0;
    current++;
    if (current < queue.length) showStep();
    else showSummary();
  }

  function showSummary() {
    const firsts = outcomes.filter((outcome) => !outcome.repeat);
    const repeats = outcomes.filter((outcome) => outcome.repeat);
    const session = rewardSession(db, firsts);
    const achievements = unlockAchievements(db);
    unlockedInSession.push(...achievements);
    announceRewards({ levelUp: session.levelUp, achievements });

    const clean = firsts.filter(({ results }) => isCleanPerfect(results)).length;
    const helped = firsts.filter(({ results }) => allCorrect(results) && !isCleanPerfect(results)).length;
    const withErrors = firsts.length - clean - helped;
    const fixed = repeats.filter(({ results }) => allCorrect(results)).length;
    const totalSteps = firsts.reduce((sum, { results }) => sum + results.length, 0);
    const correctSteps = firsts.reduce((sum, { results }) => sum + results.filter((result) => result.correct).length, 0);
    const earned = outcomes.reduce((sum, outcome) => sum + outcome.xp, 0) + session.xp;
    const level = levelFromXp(getSetting(db, 'xp'));
    const goal = dailyGoal(db);
    const today = dayActivity(db);
    const goalMet = today.goalMet || today.reviews >= goal;
    const repeatResult = new Map(repeats.map((outcome) => [outcome.concept.id, allCorrect(outcome.results)]));

    position.textContent = '';
    barSlot.replaceChildren();
    heading.textContent = 'Sesión terminada';
    setChildren(stage,
      h('section', { class: 'card summary-hero' },
        h('p', { class: 'xp-total' }, icon('bolt', { size: 28 }), `+${earned} XP`),
        h('p', { class: 'summary-level' }, `Nivel ${level.level} · ${level.title}`),
        progressBar(level.current, level.needed, { label: 'Experiencia del nivel actual', tone: 'accent' }),
        h('p', { class: 'note' }, `${level.toNext} XP para el nivel ${level.level + 1}`),
      ),
      h('ul', { class: 'card session-counts' },
        h('li', null, h('strong', null, firsts.length), firsts.length === 1 ? ' concepto' : ' conceptos'),
        h('li', null, h('strong', null, clean), clean === 1 ? ' correcto' : ' correctos'),
        helped > 0 && h('li', null, h('strong', null, helped), ' con pista'),
        h('li', null, h('strong', null, withErrors), ' con errores'),
        h('li', null, h('strong', null, `${Math.round((correctSteps / Math.max(totalSteps, 1)) * 100)} %`), ' de pasos acertados'),
        repeats.length > 0 && h('li', null, h('strong', null, `${fixed} de ${repeats.length}`), ' corregidos al repetir'),
      ),
      h('p', { class: `goal-line ${goalMet ? 'is-done' : ''}` },
        icon(goalMet ? 'check' : 'target', { size: 18 }),
        goalMet ? 'Meta de hoy cumplida' : `Meta de hoy: ${Math.min(today.reviews, goal)} de ${goal} conceptos`),
      unlockedInSession.length > 0 && h('section', { class: 'card' },
        h('h2', null, unlockedInSession.length === 1 ? 'Logro nuevo' : 'Logros nuevos'),
        h('ul', { class: 'mini-achievements' }, unlockedInSession.map((achievement) => h('li', null,
          h('span', { class: 'badge-icon is-unlocked' }, icon(achievement.icon, { size: 20 })),
          h('span', null, h('strong', null, achievement.title), h('span', { class: 'note' }, achievement.description)),
        ))),
      ),
      h('ul', { class: 'list' }, firsts.map(({ concept, results }) => {
        const ok = results.filter((result) => result.correct).length;
        const perfect = isCleanPerfect(results);
        const repeated = repeatResult.get(concept.id);
        return h('li', { class: 'list-item' },
          h('span', { class: `mark ${perfect ? 'mark-ok' : 'mark-bad'}`, 'aria-hidden': 'true' }, perfect ? '✓' : '✗'),
          h('span', { class: 'list-main' },
            h('span', null, concept.dato, h('span', { class: 'visually-hidden' }, perfect ? ', correcto' : ', con errores')),
            repeated !== undefined && h('span', { class: 'list-sub' }, repeated ? 'Al repetir: ✓ bien' : 'Al repetir: ✗ todavía no'),
          ),
          h('span', { class: 'count' }, `${ok}/${results.length}`),
        );
      })),
      withErrors > 0 && h('a', { class: 'btn btn-primary btn-large', href: '#/errores' }, 'Ver errores'),
      h('a', { class: withErrors > 0 ? 'btn btn-secondary' : 'btn btn-primary btn-large', href: '#/' }, 'Volver al inicio'),
    );
    window.scrollTo(0, 0);
    heading.focus();
  }

  showStep();
  return view;
}

/** @param {Array<{ text: string, correct: boolean }>} answers */
function answerList(answers) {
  if (answers.length === 0) return h('p', { class: 'note' }, '(No escribiste ningún paso)');
  return h('ol', { class: 'answer-list' }, answers.map((answer) => h('li', null,
    h('span', { class: `mark ${answer.correct ? 'mark-ok' : 'mark-bad'}`, 'aria-hidden': 'true' }, answer.correct ? '✓' : '✗'),
    h('span', { class: 'visually-hidden' }, answer.correct ? 'Correcto: ' : 'Incorrecto: '),
    h('span', null, answer.text),
  )));
}

function emptyScreen(conceptCount, params) {
  if (conceptCount === 0) {
    return screen({ title: 'Estudiar' },
      h('p', { class: 'note' }, 'Todavía no hay conceptos para estudiar.'),
      h('a', { class: 'btn btn-primary btn-large', href: '#/importar' }, 'Importar CSV'));
  }
  const text = params.has('concepto') ? 'Este concepto ya no existe.' : 'No hay errores que repasar. ✓';
  return screen({ title: 'Estudiar' },
    h('p', { class: 'note' }, text),
    h('a', { class: 'btn btn-primary btn-large', href: '#/' }, 'Volver al inicio'));
}
