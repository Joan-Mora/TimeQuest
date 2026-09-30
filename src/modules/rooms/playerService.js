import { hashToken, secretToken, shortId } from '../../lib/ids.js';
import { DomainError } from '../../lib/errors.js';
import { newPlayerStats } from '../game/gameEngine.js';
import { placeLatePlayer } from '../teams/teamService.js';
import { isChaos } from './roomModel.js';

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

const cleanDevice = (raw) => (typeof raw === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : null);

/**
 * En pleno Caos nadie puede volver a entrar para recuperar vidas: desde el mismo navegador
 * se recupera al jugador original (eliminado o no) y un nombre repetido se rechaza.
 */
function chaosRejoin(room, name, device) {
  if (!isChaos(room) || !['running', 'paused'].includes(room.phase)) return null;
  const prior = device && Object.values(room.players).find((p) => p.deviceId === device && room.teams[p.teamId]?.progress);
  if (prior) {
    const token = secretToken();
    prior.tokenHash = hashToken(token);
    return { player: prior, token };
  }
  if (Object.values(room.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new DomainError('Ya hay un jugador con ese nombre en el Caos. Si eres tú, entra desde el mismo celular con el que empezaste.');
  }
  return null;
}

/**
 * Registra a un estudiante. El token solo lo conoce su navegador (localStorage);
 * el servidor guarda su hash y con él lo reconoce al reconectarse.
 */
export function joinRoom(room, rawName, { maxPlayers = 80, now = Date.now(), deviceId = null } = {}) {
  if (room.phase === 'finished') throw new DomainError('Esta partida ya terminó.');
  const device = cleanDevice(deviceId);
  const clean = cleanName(rawName);
  const resumed = chaosRejoin(room, clean, device);
  if (resumed) return resumed;
  if (Object.keys(room.players).length >= maxPlayers) throw new DomainError('La sala está llena.');
  const name = uniqueName(room, clean);
  const token = secretToken();
  const player = {
    id: shortId('p_'),
    name,
    tokenHash: hashToken(token),
    deviceId: device,
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
  const team = player.teamId ? room.teams[player.teamId] : null;
  if (team?.progress) delete team.progress.votes[playerId];
  if (team?.solo) {
    delete room.teams[team.id];
    room.teamOrder = room.teamOrder.filter((id) => id !== team.id);
  }
  delete room.players[playerId];
  return player;
}
