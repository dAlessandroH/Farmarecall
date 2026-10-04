import { h, setChildren } from '../utils/dom.js';
import { screen } from '../components/ui.js';
import { chainList } from '../components/chain.js';
import { symbolBar } from '../components/symbolBar.js';
import { splitChain } from '../parser/chain.js';
import { updateConcept, listTopics } from '../services/concepts.js';

const FIELD_ATTRS = { autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false' };

/**
 * Editar un concepto (para corregir una errata sin volver a importar el CSV).
 * El progreso se conserva; la vista previa muestra cómo quedará dividida la cadena.
 */
export function editView({ db, params }) {
  const id = params.get('id') ?? '';
  const volver = params.get('volver');
  const conceptHref = `#/concepto?id=${encodeURIComponent(id)}`
    + (volver?.startsWith('#/') ? `&volver=${encodeURIComponent(volver)}` : '');
  const concept = db.get('concepts', id);

  if (!concept) {
    return screen({ title: 'Concepto no encontrado', back: { href: '#/biblioteca', label: 'Biblioteca' } },
      h('p', { class: 'note' }, 'Puede que se haya eliminado.'));
  }

  const dato = h('input', { ...FIELD_ATTRS, type: 'text', class: 'text-input', value: concept.dato });
  const cadena = h('textarea', { ...FIELD_ATTRS, class: 'rebuild-input', rows: 4 });
  cadena.value = concept.cadenaOriginal;
  const tema = h('input', { ...FIELD_ATTRS, type: 'text', class: 'text-input', value: concept.tema ?? '', list: 'temas-existentes' });
  const preview = h('div', { class: 'stack' });
  const problem = h('div', { 'aria-live': 'assertive' });

  const updatePreview = () => {
    const pasos = splitChain(cadena.value.trim());
    setChildren(preview,
      h('p', { class: 'section-title' }, `Vista previa · ${pasos.length} ${pasos.length === 1 ? 'paso' : 'pasos'}`),
      chainList(pasos.map((paso) => paso || '(paso vacío)')),
    );
  };
  cadena.addEventListener('input', updatePreview);
  updatePreview();

  const form = h('form', {
    class: 'stack',
    novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      const result = updateConcept(db, id, { dato: dato.value, cadena: cadena.value, tema: tema.value });
      if (result.ok) {
        location.hash = conceptHref;
        return;
      }
      setChildren(problem, h('p', { class: 'card card-alert', role: 'alert' }, result.message));
    },
  },
  field('Dato', dato),
  field('Cadena', cadena, 'Separa los pasos con →. Tienes los símbolos en la barra de abajo.'),
  field('Tema (opcional)', tema, 'Para agrupar conceptos, p. ej. "Autonómico" o "Cardio".'),
  h('datalist', { id: 'temas-existentes' }, listTopics(db).map((name) => h('option', { value: name }))),
  preview,
  problem,
  h('button', { class: 'btn btn-primary btn-large', type: 'submit' }, 'Guardar cambios'),
  h('p', { class: 'note' }, 'Tu progreso se conserva. Si cambias la cadena, se olvidan los errores de los pasos que ya no estén.'),
  symbolBar());

  return screen({ title: 'Editar concepto', back: { href: conceptHref, label: concept.dato } }, form);
}

function field(label, control, help) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    help && h('span', { class: 'field-help' }, help),
  );
}
