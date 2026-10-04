/**
 * Crea un elemento del DOM.
 *
 * El texto siempre se inserta como nodo de texto, nunca como HTML: así el contenido
 * que importa el usuario (cadenas, símbolos, comillas…) se muestra literal y no puede inyectar marcado.
 *
 * h('a', { class: 'btn', href: '#/' }, 'Inicio')
 * h('button', { type: 'button', onclick: () => {} }, 'Comprobar')
 *
 * @param {string} tag
 * @param {Record<string, any> | null} [attrs]  Atributos; `on…` con una función añade un evento.
 * @param {...any} children  Nodos, textos, números o listas; null/false se ignoran.
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      element.className = value;
    } else {
      element.setAttribute(key, value === true ? '' : String(value));
    }
  }
  appendChildren(element, children);
  return element;
}

/**
 * Sustituye el contenido de un elemento. A diferencia de `replaceChildren`, ignora null/false
 * (en vez de escribir "undefined" o "false") y acepta listas, igual que h().
 * @param {HTMLElement} parent
 * @param {...any} children
 */
export function setChildren(parent, ...children) {
  parent.replaceChildren();
  appendChildren(parent, children);
}

/** @param {HTMLElement} parent @param {any[]} children */
function appendChildren(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(parent, child);
    else parent.append(child instanceof Node ? child : String(child));
  }
}
