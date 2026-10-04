/** Instalación como app: service worker (modo sin conexión) y almacenamiento persistente. */

/**
 * @param {{ onUpdate?: () => void }} [options]  `onUpdate`: se ha instalado una versión nueva
 *   (la pantalla abierta sigue usando la anterior hasta recargar).
 */
export function registerServiceWorker({ onUpdate } = {}) {
  // Los service workers solo funcionan en contextos seguros (HTTPS o localhost).
  // Si la app se abre por IP en la red local (http://192.168.x.x), funciona igual pero sin modo offline.
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  // La primera instalación también "cambia de controlador"; solo es una actualización si ya había uno.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) onUpdate?.();
  });

  const register = () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        // En iPhone la app instalada puede quedarse abierta días: buscar versión nueva al volver a ella.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        });
      })
      .catch((error) => {
        console.warn('No se pudo registrar el service worker:', error);
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/**
 * Pide al navegador que no borre los datos locales aunque falte espacio.
 * Safari lo concede sobre todo a las apps añadidas a la pantalla de inicio.
 * @returns {Promise<boolean>}
 */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
