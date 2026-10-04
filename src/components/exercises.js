import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { chainList } from './chain.js';
import { symbolBar } from './symbolBar.js';
import { pickHiddenSteps, gradeFill, gradeRebuild, splitAnswer, hintFor, buildOptions } from '../services/exercise.js';

/**
 * Los tres tipos de ejercicio. Cada uno devuelve un formulario y, al comprobar, llama a
 * `onSubmit(results, answers?)` con un resultado por paso evaluado (ver StepResult).
 */

/** Campos de respuesta sin autocorrector ni mayúsculas automáticas (estropean los términos médicos). */
const FIELD_ATTRS = { autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false' };

const submitButton = () => h('button', { class: 'btn btn-primary btn-large', type: 'submit' }, 'Comprobar');

function exerciseForm(onSubmit, ...children) {
  return h('form', {
    class: 'exercise',
    novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      onSubmit();
    },
  }, ...children);
}

/**
 * Completar: algunos pasos ocultos que hay que escribir. Cada hueco tiene una pista
 * (muestra el principio del paso; acertar con pista da menos XP y se repite pronto).
 * @param {{ concept: object, failedCounts: Map<string, number>, onSubmit: Function }} options
 */
export function fillExercise({ concept, failedCounts, onSubmit }) {
  const { pasos } = concept;
  const hidden = pickHiddenSteps(pasos, { failedCounts });
  const hinted = new Set();

  const inputs = hidden.map((index, k) => h('input', {
    ...FIELD_ATTRS,
    type: 'text',
    class: 'step-input',
    'data-index': index,
    'aria-label': `Paso ${index + 1} de ${pasos.length}`,
    enterkeyhint: k === hidden.length - 1 ? 'done' : 'next',
    onkeydown: (event) => {
      // Enter pasa al siguiente hueco; en el último, comprueba.
      if (event.key !== 'Enter' || k === hidden.length - 1) return;
      event.preventDefault();
      inputs[k + 1].focus();
    },
  }));

  const holes = hidden.map((index, k) => {
    const hintButton = h('button', {
      type: 'button',
      class: 'hint-button',
      'aria-label': `Pista para el paso ${index + 1}`,
      onmousedown: (event) => event.preventDefault(), // no cerrar el teclado
      onclick: () => {
        hinted.add(index);
        hintButton.replaceWith(h('span', { class: 'hint-text' }, icon('bulb', { size: 14 }), 'Pista: ', h('strong', null, hintFor(pasos[index]))));
        inputs[k].focus();
      },
    }, icon('bulb', { size: 16 }), 'Pista');
    return h('div', { class: 'hole' }, inputs[k], hintButton);
  });

  return exerciseForm(
    () => onSubmit(gradeFill(pasos, hidden, inputs.map((input) => input.value), { hinted })),
    h('p', { class: 'instruction' }, hidden.length === 1 ? 'Completa el paso que falta.' : `Completa los ${hidden.length} pasos que faltan.`),
    chainList(pasos.map((paso, index) => (hidden.includes(index) ? holes[hidden.indexOf(index)] : paso))),
    submitButton(),
    symbolBar(),
  );
}

/**
 * Elegir: 1–2 pasos ocultos, cada uno con 4 opciones (incluida la misma con la flecha al revés).
 * Es el modo más rápido en el móvil.
 * @param {{ concept: object, failedCounts: Map<string, number>, pool: string[], onSubmit: Function }} options
 */
export function choiceExercise({ concept, failedCounts, pool, onSubmit }) {
  const { pasos } = concept;
  const hidden = pickHiddenSteps(pasos, { failedCounts, maxHoles: 2 });
  const groups = hidden.map((index, k) => h('fieldset', { class: 'choice', 'data-index': index },
    h('legend', { class: 'visually-hidden' }, `Paso ${index + 1} de ${pasos.length}: elige una opción`),
    h('div', { class: 'choice-options' },
      buildOptions(pasos[index], pool).map((option) => h('label', { class: 'choice-option' },
        h('input', { type: 'radio', name: `opcion-${concept.id}-${k}`, value: option }),
        h('span', null, option),
      )),
    ),
  ));

  return exerciseForm(
    () => onSubmit(gradeFill(pasos, hidden, groups.map((group) => group.querySelector('input:checked')?.value ?? ''))),
    h('p', { class: 'instruction' }, hidden.length === 1 ? 'Elige el paso que falta.' : 'Elige los pasos que faltan.'),
    chainList(pasos.map((paso, index) => (hidden.includes(index) ? groups[hidden.indexOf(index)] : paso))),
    submitButton(),
  );
}

/**
 * Reconstruir: solo el dato; hay que escribir la cadena entera. La pista dice cuántos pasos
 * tiene y cuál es el primero.
 * @param {{ concept: object, onSubmit: Function }} options
 */
export function rebuildExercise({ concept, onSubmit }) {
  const { pasos } = concept;
  let hinted = false;
  const submit = submitButton();
  const field = h('textarea', {
    ...FIELD_ATTRS,
    class: 'rebuild-input',
    rows: 6,
    'aria-label': 'Tu cadena, un paso por línea',
    placeholder: 'Un paso por línea\n(o sepáralos con →)',
    onkeydown: (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submit.click();
      }
    },
  });
  const hintButton = h('button', {
    type: 'button',
    class: 'hint-button',
    onmousedown: (event) => event.preventDefault(),
    onclick: () => {
      hinted = true;
      hintButton.replaceWith(h('p', { class: 'hint-text' }, icon('bulb', { size: 14 }),
        `Son ${pasos.length} pasos. Empieza por: `, h('strong', null, pasos[0])));
      field.focus();
    },
  }, icon('bulb', { size: 16 }), 'Pista');

  return exerciseForm(
    () => {
      const graded = gradeRebuild(pasos, splitAnswer(field.value), { hinted });
      onSubmit(graded.steps, graded.answers);
    },
    h('p', { class: 'instruction' }, 'Construye la cadena farmacológica completa.'),
    field,
    hintButton,
    submit,
    symbolBar(),
  );
}
