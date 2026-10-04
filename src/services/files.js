/** Lectura y guardado de archivos del usuario. */

/**
 * Lee un archivo de texto en UTF-8. Si no lo es (p. ej. un CSV de una versión antigua de Excel),
 * lo lee como Windows-1252 para no perder tildes ni eñes.
 * @param {File} file
 */
export async function readTextFile(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/**
 * Entrega un archivo al usuario. En iPhone/iPad abre el menú Compartir
 * (Guardar en Archivos, AirDrop…); en el ordenador lo descarga.
 * Debe llamarse directamente desde un toque o clic.
 *
 * @param {string} content
 * @param {string} filename
 * @param {string} type
 */
export async function saveFile(content, filename, type) {
  const file = new File([content], filename, { type });
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (isTouchDevice && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return; // el usuario cerró el menú
      // Si compartir falla, se intenta la descarga normal.
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
