/**
 * Almacenamiento local del navegador (localStorage), sin dependencias.
 *
 * Cada tabla se guarda como una lista JSON bajo su propia clave:
 *   farmarecall.concepts   identificador: id         (Concept)
 *   farmarecall.progress   identificador: conceptId  (Progress)
 *   farmarecall.errors     identificador: id         (ErrorEntry)
 *   farmarecall.settings   identificador: key        (Setting)
 * Tipos en models.js. Todo es síncrono: miles de conceptos ocupan unos cientos de KB
 * y el límite de localStorage es de unos 5 MB.
 */

export const STORAGE_PREFIX = 'farmarecall';

/** Límite aproximado de localStorage en Safari y Chrome (5 MB). */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;

/** Campo que identifica cada registro en cada tabla. */
const TABLE_KEYS = {
  concepts: 'id',
  progress: 'conceptId',
  errors: 'id',
  settings: 'key',
};

/** @typedef {ReturnType<typeof openStorage>} Database */

/**
 * @param {string} [prefix]  Las pruebas usan otro prefijo para no tocar los datos reales.
 * @param {Storage} [storage]  Por defecto, localStorage.
 */
export function openStorage(prefix = STORAGE_PREFIX, storage) {
  try {
    storage ??= globalThis.localStorage;
    const probe = `${prefix}.probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
  } catch (error) {
    throw new Error('Este navegador no permite guardar datos locales.', { cause: error });
  }

  /** @param {string} table */
  function readRows(table) {
    if (!(table in TABLE_KEYS)) throw new Error(`Tabla desconocida: ${table}`);
    const raw = storage.getItem(`${prefix}.${table}`);
    if (raw === null) return [];
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Los datos guardados de "${table}" están dañados.`, { cause: error });
    }
  }

  /** @param {string} table @param {object[]} rows */
  function writeRows(table, rows) {
    try {
      storage.setItem(`${prefix}.${table}`, JSON.stringify(rows));
    } catch (error) {
      throw new Error('No queda espacio para guardar datos en este navegador.', { cause: error });
    }
  }

  /** @param {string} table @param {object[]} records */
  function putMany(table, records) {
    if (records.length === 0) return;
    const field = TABLE_KEYS[table];
    const rows = new Map(readRows(table).map((row) => [row[field], row]));
    for (const record of records) {
      if (record[field] === undefined || record[field] === null) {
        throw new Error(`Falta "${field}" en un registro de ${table}.`);
      }
      rows.set(record[field], record);
    }
    writeRows(table, [...rows.values()]);
  }

  return {
    /** Todos los registros, en el orden en que se guardaron. @param {string} table */
    getAll: (table) => readRows(table),
    /** @param {string} table @param {string | number} key */
    get: (table, key) => readRows(table).find((row) => row[TABLE_KEYS[table]] === key),
    /** Crea o reemplaza un registro (según su identificador). @param {string} table @param {object} record */
    put: (table, record) => putMany(table, [record]),
    putMany,
    /** @param {string} table @param {string | number} key */
    delete: (table, key) => writeRows(table, readRows(table).filter((row) => row[TABLE_KEYS[table]] !== key)),
    /** Sustituye todos los registros de una tabla. @param {string} table @param {object[]} rows */
    replaceAll: (table, rows) => {
      readRows(table); // valida el nombre de la tabla
      writeRows(table, rows);
    },
    /** Espacio aproximado que ocupan los datos, en bytes (localStorage guarda texto UTF-16). */
    bytesUsed: () => Object.keys(TABLE_KEYS).reduce((sum, table) => {
      const value = storage.getItem(`${prefix}.${table}`);
      return value === null ? sum : sum + (`${prefix}.${table}`.length + value.length) * 2;
    }, 0),
    /** Borra todas las tablas de este prefijo. */
    clear: () => Object.keys(TABLE_KEYS).forEach((table) => storage.removeItem(`${prefix}.${table}`)),
  };
}
