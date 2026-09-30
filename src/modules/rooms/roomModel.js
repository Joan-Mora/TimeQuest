import { createClock } from '../timer/clock.js';
import { DEFAULT_SCORING, normalizeWeights } from '../scoring/scoring.js';

export const PHASES = ['lobby', 'running', 'paused', 'finished'];
export const FEEDBACK_MODES = ['instant', 'verdict', 'end'];

export function defaultConfig() {
  return {
    title: 'El Laboratorio Sellado',
    teamSize: 5,
    teamCount: 0,
    questionsPerLock: 5,
    timeLimitsSec: { 1: 480, 2: 480, 3: 480, 4: 480 },
    scoring: {
      weights: { ...DEFAULT_SCORING.weights },
      speedTable: [...DEFAULT_SCORING.speedTable],
      speedStep: DEFAULT_SCORING.speedStep,
      speedFloor: DEFAULT_SCORING.speedFloor,
      timeoutSpeed: DEFAULT_SCORING.timeoutSpeed,
    },
    feedbackMode: 'verdict',
    shuffle: true,
    autoAssignLate: true,
    showLiveAccuracy: false,
  };
}

export function createRoom(code, now = Date.now()) {
  return {
    code,
    createdAt: now,
    updatedAt: now,
    version: 0,
    phase: 'lobby',
    config: defaultConfig(),
    players: {},
    teams: {},
    teamOrder: [],
    clock: createClock(),
    finishCounter: 0,
    game: null,
    results: null,
    podiumRevealed: false,
    autoPaused: false,
    log: [],
  };
}

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Aplica un parche de configuración validando cada campo. Devuelve la configuración resultante. */
export function applyConfigPatch(room, patch = {}) {
  const c = room.config;
  const locked = room.phase !== 'lobby';
  if (typeof patch.title === 'string') c.title = patch.title.trim().slice(0, 60) || c.title;
  if (!locked) {
    if (patch.teamSize !== undefined) c.teamSize = clampInt(patch.teamSize, 1, 12, c.teamSize);
    if (patch.teamCount !== undefined) c.teamCount = clampInt(patch.teamCount, 0, 16, c.teamCount);
    if (patch.questionsPerLock !== undefined) c.questionsPerLock = clampInt(patch.questionsPerLock, 1, 10, c.questionsPerLock);
    if (typeof patch.shuffle === 'boolean') c.shuffle = patch.shuffle;
  }
  if (patch.timeLimitsSec && typeof patch.timeLimitsSec === 'object' && !locked) {
    for (const lock of [1, 2, 3, 4]) {
      if (patch.timeLimitsSec[lock] !== undefined) {
        c.timeLimitsSec[lock] = clampInt(patch.timeLimitsSec[lock], 30, 3600, c.timeLimitsSec[lock]);
      }
    }
  }
  if (FEEDBACK_MODES.includes(patch.feedbackMode)) c.feedbackMode = patch.feedbackMode;
  if (typeof patch.autoAssignLate === 'boolean') c.autoAssignLate = patch.autoAssignLate;
  if (typeof patch.showLiveAccuracy === 'boolean') c.showLiveAccuracy = patch.showLiveAccuracy;
  if (patch.scoring && typeof patch.scoring === 'object') {
    const s = c.scoring;
    if (patch.scoring.weights) s.weights = normalizeWeights({ ...s.weights, ...patch.scoring.weights });
    if (Array.isArray(patch.scoring.speedTable) && patch.scoring.speedTable.length >= 1 && patch.scoring.speedTable.length <= 8) {
      s.speedTable = patch.scoring.speedTable.map((v, i) => clampNum(v, 0, 5, s.speedTable[i] ?? 3));
    }
    if (patch.scoring.speedStep !== undefined) s.speedStep = clampNum(patch.scoring.speedStep, 0, 5, s.speedStep);
    if (patch.scoring.speedFloor !== undefined) s.speedFloor = clampNum(patch.scoring.speedFloor, 0, 5, s.speedFloor);
    if (patch.scoring.timeoutSpeed !== undefined) s.timeoutSpeed = clampNum(patch.scoring.timeoutSpeed, 0, 5, s.timeoutSpeed);
  }
  return c;
}

export function addLog(room, text, now = Date.now()) {
  room.log.push({ at: now, text });
  if (room.log.length > 60) room.log.splice(0, room.log.length - 60);
}

/** Integrantes de un equipo en orden estable (orden de llegada). */
export function teamMembers(room, teamId) {
  return Object.values(room.players)
    .filter((p) => p.teamId === teamId)
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

export function orderedTeams(room) {
  return room.teamOrder.map((id) => room.teams[id]).filter(Boolean);
}
