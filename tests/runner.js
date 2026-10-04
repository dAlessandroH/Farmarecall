/** Mini ejecutor de pruebas para el navegador, sin dependencias. */

const tests = [];

/** @param {string} name @param {() => any} fn */
export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(condition, message = 'La condición no se cumple') {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ? message + ': ' : ''}se esperaba ${e} y se obtuvo ${a}`);
}

/** Comprueba que `fn` lanza un error cuyo mensaje contiene `fragment`. */
export function assertThrows(fn, fragment) {
  try {
    fn();
  } catch (error) {
    if (!String(error?.message).includes(fragment)) {
      throw new Error(`el error debía mencionar "${fragment}" y fue: ${error?.message}`);
    }
    return;
  }
  throw new Error(`se esperaba un error que mencionara "${fragment}"`);
}

/** Repite `check` hasta que devuelva algo verdadero o se agote el tiempo. */
export async function waitFor(check, { timeout = 10000, message = 'Tiempo de espera agotado' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

/** @param {HTMLElement} list @param {HTMLElement} summary */
export async function run(list, summary) {
  const failures = [];
  for (const { name, fn } of tests) {
    const item = document.createElement('li');
    try {
      await fn();
      item.textContent = `✓ ${name}`;
      item.className = 'pass';
    } catch (error) {
      const message = String(error?.message ?? error);
      failures.push({ name, message });
      item.textContent = `✗ ${name} — ${message}`;
      item.className = 'fail';
    }
    list.append(item);
  }
  const passed = tests.length - failures.length;
  summary.textContent = failures.length === 0
    ? `✓ ${passed}/${tests.length} pruebas superadas`
    : `✗ ${failures.length} de ${tests.length} pruebas fallaron`;
  document.title = failures.length === 0 ? 'Pruebas: OK' : 'Pruebas: FALLO';
  window.testResults = { passed, total: tests.length, failures };
}
