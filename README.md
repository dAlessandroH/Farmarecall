# FarmaRecall

PWA para estudiar farmacología con Active Recall: importas un CSV `dato,cadena` y la app convierte cada cadena en ejercicios.
Todo se guarda en el dispositivo (localStorage). Sin cuentas, sin servidor, sin IA y sin dependencias. Funciona sin conexión.

## Cómo se usa

1. **Importar CSV** (o "Probar con 5 conceptos de ejemplo" la primera vez):
   ```csv
   dato,cadena,tema
   M3,"Gq → ↑ IP₃/DAG → ↑ Ca²⁺ → contracción",Autonómico
   ```
   - Los pasos se separan con `→` (también vale `->`). Si un paso lleva comas, pon la cadena entre comillas.
   - `tema` es opcional: sirve para estudiar o filtrar por bloques.
   - Sirve el CSV de Excel en español (separado por `;`) y los archivos en UTF-8 o Windows-1252.
   - Si un dato ya existe, se actualizan su cadena y su tema, y se conserva el progreso.
   - Los errores indican la fila exacta del archivo.
2. **Estudiar ahora**: 5, 10 o 20 conceptos (también es tu meta diaria). Primero lo que toca hoy, luego lo que fallaste, al final lo nuevo.
   - **Completar**: escribes los pasos ocultos (el que más fallas siempre sale). Botón **Pista** si te atascas.
   - **Elegir**: escoges entre 4 opciones; una es el mismo paso con la flecha al revés. Lo más rápido en el móvil.
   - **Reconstruir**: solo ves el dato y escribes la cadena entera. La pista dice cuántos pasos hay y el primero.
   - Un concepto **nuevo** se enseña entero antes de preguntarlo.
   - Lo que sale con errores o con pista **se repite al final de la misma sesión**.
3. **Comprobar** → corrección inmediata con la cadena completa → **Siguiente**.

**Corrección**: no cuentan mayúsculas, tildes, espacios ni superíndices (`↑ca2+` = `↑ Ca²⁺`). Las cargas se escriben
con el teclado normal: `Ca2+`, `Ca+2`, `Ca++` o `Ca 2+` valen como `Ca²⁺` (y `SO4-2` o `SO4--` como `SO₄²⁻`). Se perdona **una errata**
en palabras de 6 o más letras (`hiperpolarisación`), pero nunca en flechas, números, letras griegas ni en las dos primeras
letras (`hipo/hiper`, `aferente/eferente`). Si aun así la app se equivoca, toca **Marcar como correcta**.

**Repaso espaciado** (`src/spacedRepetition/scheduler.js`): fallo → 10 min · aciertos seguidos → 1, 3, 7, 14 y 30 días ·
bien con pista → 10 min sin cambiar de nivel.

**Motivación** (`src/gamification/`): XP por paso acertado, niveles (Estudiante → Interno → Residente → … → Catedrático),
meta diaria, racha (con **un día de descanso por semana** que no la rompe) y 18 logros.

**Otras cosas**: editar un concepto desde su detalle (lápiz), filtros por estado y tema en la Biblioteca,
recordatorio para exportar una copia, aviso si queda poco espacio y aviso cuando hay una versión nueva.

## Ejecutar en el Mac

```bash
cd ~/Desktop/DAVID/FARMARECALL
python3 serve.py
```

Abre **http://localhost:8000** escribiéndolo en Safari o Chrome (no abras `index.html` con doble clic: así no funciona).
Pruebas automáticas: http://localhost:8000/tests/ (deben salir todas en verde).

## Instalar en el iPhone (con modo sin conexión)

El modo sin conexión de un iPhone exige HTTPS, así que la app se publica en un hosting estático gratuito.
Solo se suben los archivos de la app: tus datos siguen viviendo únicamente en tu iPhone.

1. Crea una cuenta gratuita en github.com y un repositorio nuevo, por ejemplo `farmarecall` (público).
2. En el repositorio: **Add file → Upload files** y arrastra todo el contenido de esta carpeta
   (no subas tus propios CSV si no quieres que sean públicos).
3. **Settings → Pages → Build and deployment**: *Deploy from a branch*, rama `main`, carpeta `/ (root)` → **Save**.
4. En uno o dos minutos estará en `https://TU-USUARIO.github.io/farmarecall/`.
5. En el iPhone, abre esa dirección en **Safari** → **Compartir → Añadir a pantalla de inicio**.
6. Ábrela una vez con internet. A partir de ahí funciona sin conexión.

Para actualizarla: sube de nuevo los archivos cambiados. La app avisa ("Nueva versión: toca para actualizar").

Cada dirección (localhost, la IP del Mac, GitHub) guarda sus propios datos. Para pasarlos de una a otra:
**Copia de seguridad → Exportar datos** y después **Restaurar una copia** en la otra.

### Comprobar en el iPhone

- La barra de símbolos (↑ ↓ → α β γ μ) queda justo encima del teclado.
- **Exportar datos** abre el menú Compartir (Guardar en Archivos).
- Instalada en la pantalla de inicio, se abre sin barra de Safari y funciona en modo avión.

## Estructura

```
index.html  manifest.json  sw.js     app, manifiesto PWA y service worker (offline)
serve.py                             servidor local (Python de macOS)
icons/                               iconos (python3 scripts/generate_icons.py)
scripts/update_precache.py           actualiza la lista de archivos offline de sw.js
src/
  main.js          arranque y rutas
  styles.css       diseño (claro/oscuro automático)
  components/      piezas de interfaz (pantalla, cadena, ejercicios, barra de símbolos, pestañas, avisos…)
  views/           pantallas: inicio, importar, biblioteca, concepto, editar, estudiar, errores, progreso, logros, copia
  services/        lógica: importación, ejercicios, registro de intentos, sesiones, estadísticas, copias
  gamification/    XP, niveles, recompensas y logros
  database/        almacenamiento local (localStorage), modelos y configuración
  parser/          lectura del CSV y división de cadenas
  spacedRepetition/  intervalos de repaso
  utils/           utilidades (DOM, fechas, texto)
tests/             pruebas en el navegador
ejemplos/          CSV de prueba
```

## Al modificar la app

Después de añadir, renombrar o cambiar archivos, actualiza la lista offline y sube la versión
(así los dispositivos instalados descargan los cambios):

```bash
python3 scripts/update_precache.py 1.2.1
```

Luego abre `/tests/`: todas las pruebas deben salir en verde.
