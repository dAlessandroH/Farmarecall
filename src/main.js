import { openStorage } from './database/storage.js';
import { startRouter } from './services/router.js';
import { registerServiceWorker, requestPersistentStorage } from './services/pwa.js';
import { trackKeyboardInset } from './utils/viewport.js';
import { h } from './utils/dom.js';
import { messageScreen } from './components/ui.js';
import { createTabBar } from './components/tabBar.js';
import { showToast } from './components/toast.js';
import { homeView } from './views/home.js';
import { importView } from './views/import.js';
import { libraryView } from './views/library.js';
import { conceptView } from './views/concept.js';
import { studyView } from './views/study.js';
import { errorsView } from './views/errors.js';
import { progressView } from './views/progress.js';
import { achievementsView } from './views/achievements.js';
import { backupView } from './views/backup.js';
import { editView } from './views/edit.js';

const app = document.getElementById('app');

registerServiceWorker({
  // Se instaló una versión nueva: avisar, sin recargar solo (no cortar una sesión a medias).
  onUpdate: () => showToast({
    title: 'Nueva versión de FarmaRecall',
    text: 'Toca aquí para actualizar.',
    iconName: 'refresh',
    persistent: true,
    onClick: () => location.reload(),
  }),
});
trackKeyboardInset();

try {
  const db = openStorage();
  requestPersistentStorage();

  const view = h('div', { class: 'view' });
  const tabBar = createTabBar();
  app.replaceChildren(view, tabBar.element);

  startRouter({
    root: view,
    context: { db },
    onChange: tabBar.update,
    routes: {
      '': homeView,
      estudiar: studyView,
      importar: importView,
      biblioteca: libraryView,
      concepto: conceptView,
      editar: editView,
      errores: errorsView,
      progreso: progressView,
      logros: achievementsView,
      datos: backupView,
    },
  });
} catch (error) {
  console.error(error);
  app.replaceChildren(messageScreen(
    'No se pudo abrir el almacenamiento',
    'FarmaRecall guarda tus datos en este dispositivo y el navegador no lo permitió. '
      + 'Si estás en una ventana privada, ábrela en una ventana normal.',
  ));
}
