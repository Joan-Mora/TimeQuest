import { hashToken, secretToken, shortId } from '../../lib/ids.js';
import { DomainError } from '../../lib/errors.js';
import { newPlayerStats } from '../game/gameEngine.js';
import { placeLatePlayer } from '../teams/teamService.js';

export function cleanName(raw) {
  const name = String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
  if (name.length < 2) throw new DomainError('Escribe tu nombre (mínimo 2 letras).');
  return name;
}

function uniqueName(room, name) {
  const taken = new Set(Object.values(room.players).map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; i < 100; i++) {
    const candidate = `${name} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} (${Date.now() % 1000})`;
}

/**
 * Registra a un estudiante. El token solo lo conoce su navegador (localStorage);
 * el servidor guarda su hash y con él lo reconoce al reconectarse.
 */
export function joinRoom(room, rawName, { maxPlayers = 80, now = Date.now() } = {}) {
  if (room.phase === 'finished') throw new DomainError('Esta partida ya terminó.');
  if (Object.keys(room.players).length >= maxPlayers) throw new DomainError('La sala está llena.');
  const name = uniqueName(room, cleanName(rawName));
  const token = secretToken();
  const player = {
    id: shortId('p_'),
    name,
    tokenHash: hashToken(token),
    teamId: null,
    joinedAt: now,
    stats: newPlayerStats(),
  };
  room.players[player.id] = player;
  placeLatePlayer(room, player.id);
  return { player, token };
}

export function findPlayerByToken(room, token) {
  if (!token) return null;
  const h = hashToken(token);
  return Object.values(room.players).find((p) => p.tokenHash === h) ?? null;
}

export function removePlayer(room, playerId) {
  const player = room.players[playerId];
  if (!player) throw new DomainError('Jugador no encontrado.');
  if (player.teamId && room.teams[player.teamId]?.progress) delete room.teams[player.teamId].progress.votes[playerId];
  delete room.players[playerId];
  return player;
}
