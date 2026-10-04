/**
 * Modelos de datos de FarmaRecall (solo documentación de tipos con JSDoc).
 * Los objetos se guardan tal cual, como JSON en localStorage (ver storage.js).
 * Fechas en milisegundos (Date.now()).
 *
 * @typedef {object} Concept
 * @property {string} id
 * @property {string} dato            Estímulo a reconocer, p. ej. "METOPROLOL".
 * @property {string} cadenaOriginal  Cadena exactamente como la escribió el usuario.
 * @property {string[]} pasos         La cadena dividida por "→".
 * @property {string} [tema]          Bloque opcional (columna "tema" del CSV), p. ej. "Autonómico".
 * @property {number} createdAt
 * @property {number} updatedAt
 *
 * @typedef {object} Progress
 * @property {string} conceptId
 * @property {number} mastery          Nivel de dominio (0 = nuevo).
 * @property {number} streak           Aciertos seguidos.
 * @property {number} errorCount
 * @property {number} reviewCount
 * @property {number | null} nextReview  null = todavía no estudiado.
 * @property {number | null} lastReview
 *
 * @typedef {object} ErrorEntry        Veces que se ha fallado un paso de un concepto.
 * @property {string} id               JSON de [conceptId, paso].
 * @property {string} conceptId
 * @property {string} paso             Texto correcto del paso fallado.
 * @property {number} count
 * @property {number} lastDate         Última vez que se falló.
 *
 * @typedef {object} Setting
 * @property {string} key
 * @property {*} value
 */
export {};
