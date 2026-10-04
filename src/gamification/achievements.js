import { levelFromXp } from './levels.js';
import { getSetting, setSetting } from '../database/settings.js';
import { masteryStatus } from '../spacedRepetition/scheduler.js';
import { studyStreak } from '../services/stats.js';

/**
 * Logros. `metric` es la cifra que se mira y `target`, cuánto hace falta.
 * Para añadir uno basta con una línea nueva (y, si usa una cifra nueva, calcularla en achievementMetrics).
 */
export const ACHIEVEMENTS = [
  { id: 'primer-paso', icon: 'sparkles', title: 'Primer paso', description: 'Responde tu primer concepto.', metric: 'reviews', target: 1 },
  { id: 'primera-sesion', icon: 'flag', title: 'Sesión completa', description: 'Termina tu primera sesión.', metric: 'sessions', target: 1 },
  { id: 'meta-diaria', icon: 'target', title: 'Meta cumplida', description: 'Cumple tu meta del día.', metric: 'goalDays', target: 1 },
  { id: 'sin-fallos', icon: 'check', title: 'Sin un fallo', description: 'Termina una sesión de 5 o más conceptos sin errores.', metric: 'perfectSessions', target: 1 },
  { id: 'racha-3', icon: 'flame', title: 'En marcha', description: 'Estudia 3 días seguidos.', metric: 'streak', target: 3 },
  { id: 'racha-7', icon: 'flame', title: 'Una semana entera', description: 'Estudia 7 días seguidos.', metric: 'streak', target: 7 },
  { id: 'racha-30', icon: 'flame', title: 'Hábito de hierro', description: 'Estudia 30 días seguidos.', metric: 'streak', target: 30 },
  { id: 'constancia', icon: 'calendar', title: 'Constancia', description: 'Cumple tu meta diaria 7 días.', metric: 'goalDays', target: 7 },
  { id: 'repasos-100', icon: 'layers', title: 'Cien repasos', description: 'Completa 100 repasos.', metric: 'reviews', target: 100 },
  { id: 'repasos-500', icon: 'layers', title: 'Quinientos repasos', description: 'Completa 500 repasos.', metric: 'reviews', target: 500 },
  { id: 'dominados-10', icon: 'trophy', title: 'Primeros dominios', description: 'Domina 10 conceptos.', metric: 'mastered', target: 10 },
  { id: 'dominados-50', icon: 'trophy', title: 'Farmacólogo en formación', description: 'Domina 50 conceptos.', metric: 'mastered', target: 50 },
  { id: 'dominados-100', icon: 'trophy', title: 'Vademécum andante', description: 'Domina 100 conceptos.', metric: 'mastered', target: 100 },
  { id: 'reconstructor', icon: 'link', title: 'Reconstructor', description: 'Reconstruye 10 cadenas completas sin errores.', metric: 'perfectRebuilds', target: 10 },
  { id: 'corrector', icon: 'refresh', title: 'Error corregido', description: 'Acierta 10 conceptos que antes habías fallado.', metric: 'recovered', target: 10 },
  { id: 'biblioteca-50', icon: 'book', title: 'Biblioteca en crecimiento', description: 'Ten 50 conceptos en tu biblioteca.', metric: 'concepts', target: 50 },
  { id: 'nivel-5', icon: 'star', title: 'Residente', description: 'Alcanza el nivel 5.', metric: 'level', target: 5 },
  { id: 'nivel-8', icon: 'star', title: 'Especialista', description: 'Alcanza el nivel 8.', metric: 'level', target: 8 },
];

/** Cifras que usan los logros. */
export function achievementMetrics(db, now = Date.now()) {
  const progress = new Map(db.getAll('progress').map((row) => [row.conceptId, row]));
  const concepts = db.getAll('concepts');
  let reviews = 0;
  let mastered = 0;
  for (const concept of concepts) {
    const row = progress.get(concept.id);
    reviews += row?.reviewCount ?? 0;
    if (masteryStatus(row) === 'dominado') mastered++;
  }
  return {
    ...getSetting(db, 'counters'),
    reviews,
    mastered,
    concepts: concepts.length,
    streak: studyStreak(getSetting(db, 'studyDays'), now),
    level: levelFromXp(getSetting(db, 'xp')).level,
  };
}

/** Todos los logros con su avance (`value` de `target`) y la fecha en que se consiguieron. */
export function getAchievements(db, now = Date.now()) {
  const metrics = achievementMetrics(db, now);
  const unlocked = getSetting(db, 'achievements');
  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    value: Math.min(metrics[achievement.metric] ?? 0, achievement.target),
    unlockedAt: unlocked[achievement.id] ?? null,
  }));
}

/**
 * Guarda los logros recién conseguidos y los devuelve (para avisar). Un logro conseguido no se pierde.
 * @returns {typeof ACHIEVEMENTS}
 */
export function unlockAchievements(db, now = Date.now()) {
  const metrics = achievementMetrics(db, now);
  const unlocked = getSetting(db, 'achievements');
  const fresh = ACHIEVEMENTS.filter((achievement) => !unlocked[achievement.id] && (metrics[achievement.metric] ?? 0) >= achievement.target);
  if (fresh.length > 0) {
    for (const achievement of fresh) unlocked[achievement.id] = now;
    setSetting(db, 'achievements', unlocked);
  }
  return fresh;
}
