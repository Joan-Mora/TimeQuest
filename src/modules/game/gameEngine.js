/**
 * Reglas de la partida. Todas las funciones son síncronas y mutan la sala recibida:
 * como Node procesa un evento a la vez, cada voto/envío se aplica de forma atómica
 * y el orden de apertura de los candados lo decide el servidor, nunca el cliente.
 */
import { DomainError } from '../../lib/errors.js';
import { seededRandom, shuffle } from '../../lib/ids.js';
import { checkAnswer, parseNumber } from '../questions/answerChecker.js';
import { pickQuestions } from '../questions/questionBank.js';
import { createClock, elapsedMs, lockLimitMs, pauseClock, resumeClock, startClock, addBonus } from '../timer/clock.js';
import { accuracyPoints, compareRows, computeResults, liveXp, resolveScoring, round, speedForPosition } from '../scoring/scoring.js';
import { computeBadges } from '../scoring/badges.js';
import { addLog, orderedTeams, teamMembers } from '../rooms/roomModel.js';

export const isClosed = (progress) => !!progress && progress.finishedAtMs !== null;

export function newPlayerStats() {
  return { votes: 0, confirms: 0, votedQuestions: [] };
}

export function initTeamProgress(room, team) {
  const qids = room.game.byLock[team.lock] || [];
  const rand = seededRandom(`${room.code}:${team.id}:${room.game.seed}`);
  const order = room.config.shuffle ? shuffle(qids, rand) : [...qids];
  const optionOrders = {};
  for (const qid of order) {
    const q = room.game.questions[qid];
    if (q.type === 'mc') {
      const idx = q.options.map((_, i) => i);
      optionOrders[qid] = room.config.shuffle ? shuffle(idx, rand) : idx;
    }
  }
  team.progress = {
    order,
    optionOrders,
    current: 0,
    votes: {},
    answers: [],
    finishedAtMs: order.length === 0 ? 0 : null,
    finishSeq: null,
    closedBy: order.length === 0 ? 'time' : null,
    remainingMsAtOpen: null,
  };
}

export function startGame(room, bank, now = Date.now()) {
  if (room.phase !== 'lobby') throw new DomainError('La partida ya fue iniciada.');
  for (const id of [...room.teamOrder]) {
    if (teamMembers(room, id).length === 0) {
      delete room.teams[id];
      room.teamOrder = room.teamOrder.filter((t) => t !== id);
    }
  }
  const teams = orderedTeams(room);
  if (teams.length === 0) throw new DomainError('No hay equipos con integrantes. Arma los equipos primero.');

  const game = { seed: now.toString(36), questions: {}, byLock: {}, locks: bank.locks.map((l) => ({ ...l })) };
  for (const lock of [1, 2, 3, 4]) {
    const picks = pickQuestions(bank, lock, room.config.questionsPerLock);
    game.byLock[lock] = picks.map((q) => q.id);
    for (const q of picks) game.questions[q.id] = structuredClone(q);
  }
  const missing = [...new Set(teams.map((t) => t.lock))].filter((l) => game.byLock[l].length === 0);
  if (missing.length) throw new DomainError(`El candado ${missing.join(', ')} no tiene preguntas activas.`);

  room.game = game;
  for (const p of Object.values(room.players)) p.stats = newPlayerStats();
  teams.forEach((t) => initTeamProgress(room, t));
  startClock(room.clock, now);
  room.phase = 'running';
  room.finishCounter = 0;
  room.results = null;
  room.podiumRevealed = false;
  room.autoPaused = false;
  addLog(room, `Partida iniciada con ${teams.length} equipos.`, now);
}

function assertRunning(room) {
  if (room.phase === 'paused') throw new DomainError('La partida está en pausa.');
  if (room.phase !== 'running') throw new DomainError('La partida no está en curso.');
}

function playContext(room, playerId) {
  const player = room.players[playerId];
  if (!player) throw new DomainError('No estás registrado en esta sala.');
  const team = player.teamId ? room.teams[player.teamId] : null;
  if (!team || !team.progress) throw new DomainError('Aún no tienes equipo asignado.');
  const progress = team.progress;
  if (isClosed(progress)) throw new DomainError('El candado de tu equipo ya está cerrado.');
  const qid = progress.order[progress.current];
  return { player, team, progress, qid, question: room.game.questions[qid] };
}

/** Tiempo sin confirmar tras el cual cualquier integrante puede tomar el mando de la pregunta. */
export const CLAIM_AFTER_MS = 30_000;

/** Momento (ms de juego) en que empezó la pregunta actual del equipo. */
export const questionStartMs = (progress) => progress.answers.at(-1)?.atMs ?? 0;

/** Capitán de la pregunta actual: rota por integrante y salta a quien esté desconectado. */
export function captainOf(room, team, isOnline = () => true) {
  const members = teamMembers(room, team.id);
  if (members.length === 0) return null;
  const override = team.progress?.captainOverride;
  if (override && members.some((m) => m.id === override) && isOnline(override)) return override;
  const start = (team.progress?.current ?? 0) % members.length;
  for (let i = 0; i < members.length; i++) {
    const m = members[(start + i) % members.length];
    if (isOnline(m.id)) return m.id;
  }
  return null;
}

export function vote(room, playerId, questionIndex, value, now = Date.now()) {
  assertRunning(room);
  const { player, progress, qid, question } = playContext(room, playerId);
  if (questionIndex !== progress.current) return { stale: true };
  if (value === null || value === undefined || value === '') {
    delete progress.votes[playerId];
    return { cleared: true };
  }
  let clean;
  if (question.type === 'mc') {
    if (!Number.isInteger(value) || value < 0 || value >= question.options.length) {
      throw new DomainError('Opción inválida.');
    }
    clean = value;
  } else {
    clean = String(value).trim().slice(0, 24);
    if (parseNumber(clean) === null) throw new DomainError('Escribe un número válido (puedes usar punto o coma decimal).');
  }
  progress.votes[playerId] = { value: clean, at: now };
  player.stats ??= newPlayerStats();
  player.stats.votes += 1;
  if (!player.stats.votedQuestions.includes(qid)) player.stats.votedQuestions.push(qid);
  return { ok: true };
}

export function submit(room, playerId, questionIndex, isOnline = () => true, now = Date.now()) {
  assertRunning(room);
  const { player, team, progress, qid, question } = playContext(room, playerId);
  if (questionIndex !== progress.current) throw new DomainError('Esa pregunta ya fue confirmada.');
  if (captainOf(room, team, isOnline) !== playerId) {
    throw new DomainError('Solo el capitán de esta pregunta puede confirmar la respuesta.');
  }
  const chosen = progress.votes[playerId];
  if (!chosen) throw new DomainError('Primero elige o escribe una respuesta.');

  const original = question.type === 'mc' ? progress.optionOrders[qid][chosen.value] : chosen.value;
  const correct = checkAnswer(question, original);
  const same = (a, b) => (question.type === 'mc' ? a === b : parseNumber(a) === parseNumber(b));
  const online = teamMembers(room, team.id).filter((m) => isOnline(m.id));
  const unanimous = online.length >= 2 && online.every((m) => progress.votes[m.id] && same(progress.votes[m.id].value, chosen.value));
  const at = elapsedMs(room.clock, now);

  progress.answers.push({
    qid,
    index: progress.current,
    value: chosen.value,
    correct,
    by: playerId,
    atMs: at,
    unanimous,
    voters: Object.keys(progress.votes).length,
  });
  player.stats ??= newPlayerStats();
  player.stats.confirms += 1;
  progress.current += 1;
  progress.votes = {};
  progress.captainOverride = null;

  let opened = false;
  if (progress.current >= progress.order.length) {
    opened = true;
    progress.finishedAtMs = at;
    progress.finishSeq = ++room.finishCounter;
    progress.remainingMsAtOpen = lockLimitMs(room.clock, room.config.timeLimitsSec, team.lock) - at;
    addLog(room, `«${team.name}» abrió el candado ${team.lock} (#${progress.finishSeq}).`, now);
  }
  return { correct, opened, finishSeq: progress.finishSeq, teamId: team.id, index: progress.current - 1 };
}

/** Un integrante toma el mando cuando el capitán lleva CLAIM_AFTER_MS sin confirmar (distraído o sin celular). */
export function claimCaptain(room, playerId, questionIndex, isOnline = () => true, now = Date.now()) {
  assertRunning(room);
  const { player, team, progress } = playContext(room, playerId);
  if (questionIndex !== progress.current) throw new DomainError('Esa pregunta ya fue confirmada.');
  const previous = captainOf(room, team, isOnline);
  if (previous === playerId) return { teamId: team.id, changed: false };
  const waited = elapsedMs(room.clock, now) - questionStartMs(progress);
  if (waited < CLAIM_AFTER_MS) {
    throw new DomainError(`Podrás tomar el mando en ${Math.ceil((CLAIM_AFTER_MS - waited) / 1000)} s.`);
  }
  progress.captainOverride = playerId;
  return { teamId: team.id, changed: true, byName: player.name, previousName: room.players[previous]?.name ?? null };
}

/** Revisa los límites de tiempo. Devuelve eventos para notificar a los clientes. */
export function tick(room, now = Date.now()) {
  if (room.phase !== 'running') return [];
  const events = [];
  const at = elapsedMs(room.clock, now);
  for (const team of orderedTeams(room)) {
    const p = team.progress;
    if (!p || isClosed(p)) continue;
    const limit = lockLimitMs(room.clock, room.config.timeLimitsSec, team.lock);
    if (at >= limit) {
      p.closedBy = 'time';
      p.finishedAtMs = limit;
      p.votes = {};
      events.push({ type: 'timeout', teamId: team.id, name: team.name, lock: team.lock });
      addLog(room, `Se acabó el tiempo de «${team.name}».`, now);
    }
  }
  if (allClosed(room)) {
    endGame(room, now, 'completed');
    events.push({ type: 'ended' });
  }
  return events;
}

export function allClosed(room) {
  const teams = orderedTeams(room).filter((t) => t.progress);
  return teams.length > 0 && teams.every((t) => isClosed(t.progress));
}

export function pauseGame(room, now = Date.now()) {
  if (room.phase !== 'running') throw new DomainError('Solo se puede pausar una partida en curso.');
  pauseClock(room.clock, now);
  room.phase = 'paused';
  addLog(room, 'Partida en pausa.', now);
}

export function resumeGame(room, now = Date.now()) {
  if (room.phase !== 'paused') throw new DomainError('La partida no está en pausa.');
  resumeClock(room.clock, now);
  room.phase = 'running';
  room.autoPaused = false;
  addLog(room, 'Partida reanudada.', now);
}

export function addTime(room, lock, seconds) {
  if (!['running', 'paused'].includes(room.phase)) throw new DomainError('No hay partida en curso.');
  const secs = Math.round(Number(seconds));
  if (!Number.isFinite(secs) || secs === 0 || Math.abs(secs) > 1800) throw new DomainError('Tiempo inválido.');
  const locks = lock === 'all' ? [1, 2, 3, 4] : [Number(lock)];
  if (!locks.every((l) => [1, 2, 3, 4].includes(l))) throw new DomainError('Candado inválido.');
  locks.forEach((l) => addBonus(room.clock, l, secs * 1000));
  addLog(room, `${secs > 0 ? '+' : ''}${secs} s para ${lock === 'all' ? 'todos los candados' : `el candado ${lock}`}.`);
}

export function endGame(room, now = Date.now(), reason = 'moderator') {
  if (room.phase === 'finished') return;
  if (room.phase === 'lobby') throw new DomainError('La partida no ha empezado.');
  const at = elapsedMs(room.clock, now);
  for (const team of orderedTeams(room)) {
    const p = team.progress;
    if (!p || isClosed(p)) continue;
    p.closedBy = 'moderator';
    p.finishedAtMs = Math.min(at, lockLimitMs(room.clock, room.config.timeLimitsSec, team.lock));
    p.votes = {};
  }
  pauseClock(room.clock, now);
  room.phase = 'finished';
  room.podiumRevealed = false;
  room.results = buildResults(room, now);
  addLog(room, reason === 'completed' ? 'Todos los candados están cerrados.' : 'El moderador terminó la partida.', now);
}

export function resetGame(room) {
  room.phase = 'lobby';
  room.game = null;
  room.results = null;
  room.podiumRevealed = false;
  room.autoPaused = false;
  room.clock = createClock();
  room.finishCounter = 0;
  for (const t of Object.values(room.teams)) t.progress = null;
  for (const p of Object.values(room.players)) p.stats = newPlayerStats();
  addLog(room, 'Partida reiniciada: de vuelta al lobby.');
}

export function lockMeta(room, lock) {
  return room.game?.locks.find((l) => l.id === lock) ?? { id: lock, name: `Candado ${lock}`, badge: 'Insignia' };
}

/**
 * Ranking provisional durante la partida, con la misma fórmula y desempates que el final.
 * Un equipo que sigue jugando suma sus aciertos actuales más la velocidad que obtendría
 * si abriera ahora (el siguiente puesto libre); `maxScore` es su techo si acierta todo lo que le falta.
 */
export function liveRanking(room, now = Date.now()) {
  if (!room.game) return null;
  const scoring = resolveScoring(room.config.scoring);
  const { accuracy: wA, speed: wV } = scoring.weights;
  const teams = orderedTeams(room).filter((t) => t.progress);
  const openedPos = (p) => (p.closedBy === null && p.finishSeq !== null ? p.finishSeq : null);
  const nextSpeed = speedForPosition(teams.filter((t) => openedPos(t.progress)).length + 1, scoring);
  const scoreOf = (correct, total, speed) => {
    const accuracyPart = round((wA * accuracyPoints(correct, total)) / 20, 4);
    const speedPart = round(wV * speed, 4);
    return { accuracyPart, speedPart, score: round(accuracyPart + speedPart, 2) };
  };

  const rows = teams.map((t) => {
    const p = t.progress;
    const correct = p.answers.filter((a) => a.correct).length;
    const total = p.order.length;
    const pos = openedPos(p);
    const status = pos ? 'opened' : isClosed(p) ? p.closedBy : 'playing';
    const speed = pos ? speedForPosition(pos, scoring) : status === 'playing' ? nextSpeed : scoring.timeoutSpeed;
    const parts = scoreOf(correct, total, speed);
    return {
      teamId: t.id,
      name: t.name,
      lock: t.lock,
      correct,
      total,
      answered: p.answers.length,
      opened: !!pos,
      finishSeq: pos,
      elapsedMs: isClosed(p) ? p.finishedAtMs : null,
      status,
      speed,
      speedProjected: status === 'playing',
      ...parts,
      grade: round(parts.score, 1),
      maxScore: status === 'playing' ? scoreOf(correct + total - p.answers.length, total, nextSpeed).score : parts.score,
    };
  });
  rows.sort(compareRows);
  rows.forEach((r, i) => {
    r.position = i + 1;
  });
  return { computedAt: now, weights: { accuracy: round(wA, 4), speed: round(wV, 4) }, nextSpeed, teams: rows };
}

export function buildResults(room, now = Date.now()) {
  const teams = orderedTeams(room).filter((t) => t.progress);
  const rows = computeResults(
    teams.map((t) => {
      const p = t.progress;
      return {
        id: t.id,
        name: t.name,
        lock: t.lock,
        correct: p.answers.filter((a) => a.correct).length,
        total: p.order.length,
        answered: p.answers.length,
        opened: p.closedBy === null && p.finishSeq !== null,
        finishSeq: p.finishSeq,
        elapsedMs: p.finishedAtMs,
      };
    }),
    room.config.scoring,
  );

  for (const row of rows) {
    const team = room.teams[row.teamId];
    const p = team.progress;
    row.closedBy = p.closedBy;
    row.members = teamMembers(room, team.id).map((m) => ({ id: m.id, name: m.name }));
    row.badges = computeBadges({
      lockBadge: lockMeta(room, team.lock).badge,
      answers: p.answers,
      total: p.order.length,
      openedPosition: row.breakdown.speedPosition,
      remainingMsAtOpen: p.remainingMsAtOpen,
    });
    row.xp = liveXp(row.correct, row.breakdown.speedPosition);
  }

  const byTeam = new Map(rows.map((r) => [r.teamId, r]));
  const students = Object.values(room.players)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((pl) => {
      const row = pl.teamId ? byTeam.get(pl.teamId) : null;
      const stats = pl.stats ?? newPlayerStats();
      const total = row?.total ?? 0;
      return {
        id: pl.id,
        name: pl.name,
        teamId: row?.teamId ?? null,
        teamName: row?.name ?? '—',
        lock: row?.lock ?? null,
        position: row?.position ?? null,
        grade: row?.grade ?? null,
        score: row?.score ?? null,
        votes: stats.votes,
        confirms: stats.confirms,
        questionsVoted: stats.votedQuestions.length,
        participation: total ? Math.round((stats.votedQuestions.length / total) * 100) : 0,
      };
    });

  const questionStats = [];
  for (const [qid, q] of Object.entries(room.game?.questions ?? {})) {
    const attempts = [];
    for (const t of teams) for (const a of t.progress.answers) if (a.qid === qid) attempts.push(a);
    if (!teams.some((t) => t.lock === q.lock)) continue;
    const correct = attempts.filter((a) => a.correct).length;
    questionStats.push({
      qid,
      lock: q.lock,
      prompt: q.prompt,
      difficulty: q.difficulty,
      attempts: attempts.length,
      correct,
      accuracy: attempts.length ? Math.round((correct / attempts.length) * 100) : null,
    });
  }
  questionStats.sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.attempts - a.attempts);

  return { computedAt: now, scoring: resolveScoring(room.config.scoring), teams: rows, students, questionStats };
}

/** Tras un reinicio del servidor, una partida en curso vuelve en pausa para no "comerse" el tiempo caído. */
export function restoreAfterRestart(room) {
  if (room.phase === 'running') {
    pauseClock(room.clock, Math.max(room.lastAliveAt || 0, room.updatedAt || 0) || Date.now());
    room.phase = 'paused';
    room.autoPaused = true;
    addLog(room, 'El servidor se reinició: la partida quedó en pausa automáticamente.');
    return true;
  }
  return false;
}
