/**
 * Experiencia (XP) y niveles. Para cambiar el ritmo basta con ajustar estos valores.
 */
export const XP_RULES = {
  /** Por cada paso acertado. Elegir es lo más fácil; Reconstruir, lo más difícil. */
  perCorrectStep: { elegir: 1, completar: 2, reconstruir: 3 },
  /** Por un paso acertado con pista. */
  hintedStep: 1,
  /** Extra por un concepto sin ningún fallo ni pista. */
  perfectConcept: 5,
  /** Por terminar una sesión. */
  sessionComplete: 20,
  /** Por cumplir la meta del día (una vez al día). */
  dailyGoal: 30,
};

/** Títulos por nivel, siguiendo la carrera médica. */
const TITLES = [
  [1, 'Estudiante'],
  [3, 'Interno'],
  [5, 'Residente'],
  [8, 'Especialista'],
  [12, 'Adjunto'],
  [16, 'Jefe de servicio'],
  [20, 'Catedrático'],
];

/** XP total para llegar a un nivel: 1 → 0, 2 → 100, 3 → 300, 4 → 600, 5 → 1000… */
export function xpForLevel(level) {
  return 50 * level * (level - 1);
}

/** @param {number} level */
export function titleFor(level) {
  let title = TITLES[0][1];
  for (const [minLevel, name] of TITLES) if (level >= minLevel) title = name;
  return title;
}

/**
 * Nivel actual y avance dentro de él.
 * @param {number} xp
 */
export function levelFromXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const start = xpForLevel(level);
  const end = xpForLevel(level + 1);
  return { level, title: titleFor(level), xp, current: xp - start, needed: end - start, toNext: end - xp };
}
