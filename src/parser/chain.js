/**
 * Divide una cadena en pasos usando "→" (también se acepta "->").
 * La app no interpreta el contenido: cada paso conserva su texto tal cual,
 * solo se quitan los espacios de los extremos.
 *
 *   "β1 → Gs → ↑ AMPc"  →  ["β1", "Gs", "↑ AMPc"]
 *
 * @param {string} cadena
 * @returns {string[]}
 */
export function splitChain(cadena) {
  return cadena.split(/→|->/).map((paso) => paso.trim());
}
