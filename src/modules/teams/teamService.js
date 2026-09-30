import { shortId } from '../../lib/ids.js';
import { DomainError } from '../../lib/errors.js';
import { addLog, isChaos, orderedTeams, teamMembers } from '../rooms/roomModel.js';
import { lockForTeamIndex, planTeams, smallestTeam, teamName } from './teamAssignment.js';
import { createSoloTeam, initTeamProgress } from '../game/gameEngine.js';

function assertTeamsMode(room) {
  if (isChaos(room)) throw new DomainError('En modo Caos no hay equipos: cada jugador compite solo.');
}

export function createTeam(room, { name, lock } = {}) {
  const index = room.teamOrder.length;
  const used = orderedTeams(room).map((t) => t.name);
  const team = {
    id: shortId('t_'),
    name: (name || '').trim().slice(0, 32) || teamName(index, used),
    lock: [1, 2, 3, 4].includes(Number(lock)) ? Number(lock) : lockForTeamIndex(index),
    progress: null,
  };
  room.teams[team.id] = team;
  room.teamOrder.push(team.id);
  return team;
}

/** Arma los equipos automáticamente (aleatorio) con todos los jugadores. Solo en el lobby. */
export function autoAssign(room, { teamCount, keepOrder = false } = {}) {
  assertTeamsMode(room);
  if (room.phase !== 'lobby') throw new DomainError('Solo se pueden rearmar equipos antes de iniciar.');
  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt);
  if (players.length === 0) throw new DomainError('Todavía no hay jugadores conectados.');
  const count = teamCount ?? room.config.teamCount;
  const groups = planTeams(players.map((p) => p.id), { teamSize: room.config.teamSize, teamCount: count, keepOrder });

  const previous = orderedTeams(room);
  room.teams = {};
  room.teamOrder = [];
  groups.forEach((ids, i) => {
    const team = createTeam(room, { name: previous[i]?.name, lock: previous[i]?.lock });
    ids.forEach((pid) => {
      room.players[pid].teamId = team.id;
    });
  });
  addLog(room, `Equipos armados automáticamente: ${groups.length} equipos (${groups.map((g) => g.length).join(', ')}).`);
  return groups.length;
}

export function movePlayer(room, playerId, teamId) {
  assertTeamsMode(room);
  const player = room.players[playerId];
  if (!player) throw new DomainError('Jugador no encontrado.');
  if (teamId !== null && !room.teams[teamId]) throw new DomainError('Equipo no encontrado.');
  if (room.phase === 'finished') throw new DomainError('La partida ya terminó.');
  const from = player.teamId;
  player.teamId = teamId;
  if (from && room.teams[from]?.progress) delete room.teams[from].progress.votes[playerId];
  return player;
}

export function renameTeam(room, teamId, name) {
  assertTeamsMode(room);
  const team = room.teams[teamId];
  if (!team) throw new DomainError('Equipo no encontrado.');
  const clean = String(name || '').trim().slice(0, 32);
  if (!clean) throw new DomainError('El nombre no puede estar vacío.');
  team.name = clean;
  return team;
}

export function setTeamLock(room, teamId, lock) {
  assertTeamsMode(room);
  const team = room.teams[teamId];
  if (!team) throw new DomainError('Equipo no encontrado.');
  if (room.phase !== 'lobby') throw new DomainError('El candado solo se cambia antes de iniciar.');
  if (![1, 2, 3, 4].includes(Number(lock))) throw new DomainError('Candado inválido.');
  team.lock = Number(lock);
  return team;
}

export function deleteTeam(room, teamId) {
  assertTeamsMode(room);
  if (room.phase !== 'lobby') throw new DomainError('Los equipos solo se eliminan antes de iniciar.');
  if (!room.teams[teamId]) throw new DomainError('Equipo no encontrado.');
  for (const p of Object.values(room.players)) if (p.teamId === teamId) p.teamId = null;
  delete room.teams[teamId];
  room.teamOrder = room.teamOrder.filter((id) => id !== teamId);
}

export function addTeam(room) {
  assertTeamsMode(room);
  if (room.phase !== 'lobby') throw new DomainError('Los equipos se crean antes de iniciar.');
  if (room.teamOrder.length >= 16) throw new DomainError('Máximo 16 equipos.');
  return createTeam(room);
}

/**
 * Ubica a un jugador sin equipo: en el lobby solo si ya existen equipos;
 * en partida, en el equipo con menos integrantes (si la sala lo permite).
 * En Caos, quien llega con la partida en curso entra solo con el reloj que quede.
 */
export function placeLatePlayer(room, playerId, { force = false } = {}) {
  if (isChaos(room)) {
    if (!['running', 'paused'].includes(room.phase) || !room.game) return null;
    const team = createSoloTeam(room, room.players[playerId]);
    initTeamProgress(room, team);
    return team;
  }
  const teams = orderedTeams(room);
  if ((!room.config.autoAssignLate && !force) || teams.length === 0) return null;
  const target = smallestTeam(teams, (t) => teamMembers(room, t.id).length);
  if (!target) return null;
  room.players[playerId].teamId = target.id;
  if (room.phase !== 'lobby' && !target.progress && room.game) initTeamProgress(room, target);
  return target;
}
