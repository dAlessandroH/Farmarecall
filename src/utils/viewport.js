/**
 * Mide cuánto ocupa el teclado en pantalla (iPhone/iPad) y lo guarda en la variable CSS
 * --keyboard-inset, para que la barra de símbolos quede justo encima del teclado.
 */
export function trackKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  const update = () => {
    const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    root.style.setProperty('--keyboard-inset', `${inset}px`);
    root.classList.toggle('keyboard-open', inset > 0);
  };
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  update();
}
