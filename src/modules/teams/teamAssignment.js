import { shuffle } from '../../lib/ids.js';

export const TEAM_NAMES = [
  'Los Outliers',
  'Hipótesis Nula',
  'Mínimos Cuadrados',
  'p < 0.05',
  'Media Muestral',
  'Intervalo Seguro',
  'Varianza Cero',
  'Error Tipo III',
  'Los Insesgados',
  'Gran Media',
  'Grados de Libertad',
  'Chi Cuadrado',
];

/** Número de equipos cuando el moderador no lo fija: equipos de hasta `teamSize`. */
export function autoTeamCount(playerCount, teamSize = 5) {
  if (playerCount <= 0) return 0;
  return Math.ceil(playerCount / Math.max(1, teamSize));
}

/**
 * Reparte jugadores en `teamCount` equipos lo más parejos posible
 * (23 jugadores en 5 equipos → 5, 5, 5, 4, 4). Si no se fija `teamCount`,
 * se calcula con `teamSize`.
 */
export function planTeams(playerIds, { teamSize = 5, teamCount = 0, random = Math.random, keepOrder = false } = {}) {
  const ids = keepOrder ? [...playerIds] : shuffle(playerIds, random);
  const count = Math.min(ids.length, teamCount > 0 ? teamCount : autoTeamCount(ids.length, teamSize));
  if (count === 0) return [];
  const groups = Array.from({ length: count }, () => []);
  // Reparto por bloques para que los tamaños difieran como máximo en 1.
  const base = Math.floor(ids.length / count);
  const extra = ids.length % count;
  let cursor = 0;
  for (let g = 0; g < count; g++) {
    const size = base + (g < extra ? 1 : 0);
    groups[g] = ids.slice(cursor, cursor + size);
    cursor += size;
  }
  return groups;
}

/** Candados en rotación: equipo 1 → C1, 2 → C2, …, 5 → C1. */
export function lockForTeamIndex(index) {
  return (index % 4) + 1;
}

export function teamName(index, usedNames = []) {
  const free = TEAM_NAMES.find((n) => !usedNames.includes(n));
  return free ?? `Equipo ${index + 1}`;
}

/** Equipo destino para alguien que llega tarde: el de menos integrantes (y, a igualdad, el primero). */
export function smallestTeam(teams, memberCount) {
  let best = null;
  for (const t of teams) {
    if (!best || memberCount(t) < memberCount(best)) best = t;
  }
  return best;
}
