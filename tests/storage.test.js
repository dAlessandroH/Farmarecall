import { test, assert, assertEqual, assertThrows } from './runner.js';
import { openStorage } from '../src/database/storage.js';
import { getSetting, setSetting } from '../src/database/settings.js';
import { getHomeSummary } from '../src/services/stats.js';

// Prefijo propio: las pruebas nunca tocan los datos reales (farmarecall.*).
const PREFIX = 'farmarecall-pruebas';

function freshStorage() {
  const db = openStorage(PREFIX);
  db.clear();
  return db;
}

const concept = (id, dato = id) => (
  { id, dato, cadenaOriginal: 'A → B', pasos: ['A', 'B'], createdAt: 0, updatedAt: 0 }
);

test('localStorage: cada tabla se guarda como JSON bajo su propia clave', () => {
  const db = freshStorage();
  db.put('concepts', concept('c1', 'M3'));
  const raw = localStorage.getItem(`${PREFIX}.concepts`);
  assert(raw, `no existe la clave ${PREFIX}.concepts`);
  assertEqual(JSON.parse(raw).map((c) => c.dato), ['M3']);
});

test('localStorage: los datos siguen intactos al reabrir (Unicode incluido)', () => {
  const db = freshStorage();
  const morfina = {
    id: 'c1',
    dato: 'MORFINA',
    cadenaOriginal: 'agonista μ → Gi/o → ↓ AMPc, ↑ K⁺, ↓ Ca²⁺ → analgesia, sedación, ñ ≥ ≤ α β γ',
    pasos: ['agonista μ', 'Gi/o', '↓ AMPc, ↑ K⁺, ↓ Ca²⁺', 'analgesia, sedación, ñ ≥ ≤ α β γ'],
    createdAt: 1,
    updatedAt: 1,
  };
  db.put('concepts', morfina);

  const reopened = openStorage(PREFIX);
  assertEqual(reopened.get('concepts', 'c1'), morfina);
  assertEqual(reopened.getAll('concepts'), [morfina]);
});

test('localStorage: put reemplaza por identificador, delete borra y se conserva el orden', () => {
  const db = freshStorage();
  db.putMany('concepts', [concept('a', 'A'), concept('b', 'B'), concept('c', 'C')]);
  db.put('concepts', concept('b', 'B2'));
  db.delete('concepts', 'a');
  assertEqual(db.getAll('concepts').map((c) => c.dato), ['B2', 'C']);
  assertThrows(() => db.put('concepts', { dato: 'sin id' }), 'Falta "id"');
});

test('localStorage: mensajes claros si el navegador no deja guardar o no queda espacio', () => {
  const blocked = {
    getItem: () => null,
    setItem: () => { throw new DOMException('bloqueado', 'SecurityError'); },
    removeItem: () => {},
  };
  assertThrows(() => openStorage(PREFIX, blocked), 'no permite guardar');

  const full = {
    getItem: () => null,
    setItem: (key) => { if (!key.endsWith('.probe')) throw new DOMException('lleno', 'QuotaExceededError'); },
    removeItem: () => {},
  };
  const db = openStorage(PREFIX, full);
  assertThrows(() => db.put('concepts', concept('x')), 'No queda espacio');
});

test('Configuración: valor por defecto (10) y se guarda el cambio', () => {
  const db = freshStorage();
  assertEqual(getSetting(db, 'sessionSize'), 10, 'por defecto');
  setSetting(db, 'sessionSize', 20);
  assertEqual(getSetting(openStorage(PREFIX), 'sessionSize'), 20, 'tras guardar y reabrir');
});

test('Inicio: cuenta pendientes de hoy y conceptos nuevos', () => {
  const db = freshStorage();
  const now = new Date(2026, 9, 3, 12, 0).getTime();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const cases = [
    ['a', now - DAY],      // venció ayer          → pendiente
    ['b', now + 2 * HOUR], // vence hoy más tarde  → pendiente
    ['c', now + 2 * DAY],  // vence en dos días
    ['d', null],           // nunca estudiado      → nuevo
  ];
  db.putMany('concepts', [...cases.map(([id]) => concept(id)), concept('e')]); // 'e' sin progreso → nuevo
  db.putMany('progress', [...cases, ['huérfano', now - DAY]].map(([id, nextReview]) => (
    { conceptId: id, mastery: 0, streak: 0, errorCount: 0, reviewCount: nextReview ? 1 : 0, nextReview, lastReview: null }
  )));

  assertEqual(getHomeSummary(db, now), { total: 5, dueToday: 2, newCount: 2, nextReview: now + 2 * DAY });
  db.clear();
});

test('localStorage: mide el espacio usado (texto UTF-16 → 2 bytes por carácter)', () => {
  const db = freshStorage(PREFIX);
  const empty = db.bytesUsed();
  db.put('concepts', concept('c1', 'M3'));
  const json = localStorage.getItem(`${PREFIX}.concepts`);
  assertEqual(db.bytesUsed() - empty, (`${PREFIX}.concepts`.length + json.length) * 2);
  db.clear();
});
