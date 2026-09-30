/**
 * Proyecciones del estado para cada audiencia. Es la única puerta de salida de datos
 * hacia los navegadores: las respuestas correctas y explicaciones solo se incluyen
 * cuando las reglas de revelado lo permiten.
 */
import { elapsedMs, lockLimitMs } from '../timer/clock.js';
import { orderedTeams, teamMembers } from '../rooms/roomModel.js';
import { CLAIM_AFTER_MS, captainOf, isClosed, liveRanking, questionStartMs } from '../game/gameEngine.js';
import { publicQuestion, revealedSolution } from '../questions/questionBank.js';
import { liveXp } from '../scoring/scoring.js';

function openedPosition(progress) {
  return progress && progress.closedBy === null && progress.finishSeq !== null ? progress.finishSeq : null;
}

function locksView(room, bank) {
  return (room.game?.locks ?? bank.locks).map((l) => ({
    id: l.id,
    name: l.name,
    title: l.title,
    story: l.story,
    badge: l.badge,
    limitMs: lockLimitMs(room.clock, room.config.timeLimitsSec, l.id),
    questionCount: room.game ? room.game.byLock[l.id].length : room.config.questionsPerLock,
  }));
}

function clockView(room, now) {
  const c = room.clock;
  return { startedAt: c.startedAt, pausedAt: c.pausedAt, pausedTotalMs: c.pausedTotalMs, elapsedMs: elapsedMs(c, now) };
}

function publicResults(results) {
  if (!results) return null;
  return {
    computedAt: results.computedAt,
    scoring: results.scoring,
    teams: results.teams,
    questionStats: results.questionStats,
  };
}

function baseConfig(room) {
  const c = room.config;
  return {
    teamSize: c.teamSize,
    teamCount: c.teamCount,
    questionsPerLock: c.questionsPerLock,
    feedbackMode: c.feedbackMode,
    showLiveAccuracy: c.showLiveAccuracy,
    timeLimitsSec: c.timeLimitsSec,
    scoring: c.scoring,
  };
}

export function publicView(room, { bank, isOnline, now = Date.now() }) {
  const revealAccuracy = room.config.showLiveAccuracy || (room.phase === 'finished' && room.podiumRevealed);
  const teams = orderedTeams(room).map((t) => {
    const p = t.progress;
    const correct = p ? p.answers.filter((a) => a.correct).length : 0;
    return {
      id: t.id,
      name: t.name,
      lock: t.lock,
      members: teamMembers(room, t.id).map((m) => ({ id: m.id, name: m.name, online: isOnline(m.id) })),
      answered: p?.answers.length ?? 0,
      total: p?.order.length ?? room.config.questionsPerLock,
      correct: revealAccuracy && p ? correct : null,
      xp: revealAccuracy && p ? liveXp(correct, openedPosition(p)) : null,
      opened: openedPosition(p) !== null,
      finishSeq: p?.finishSeq ?? null,
      closedBy: p?.closedBy ?? null,
      finishedAtMs: p?.finishedAtMs ?? null,
    };
  });
  return {
    code: room.code,
    title: room.config.title,
    phase: room.phase,
    version: room.version,
    serverNow: now,
    autoPaused: room.autoPaused,
    config: baseConfig(room),
    clock: clockView(room, now),
    locks: locksView(room, bank),
    teams,
    players: Object.values(room.players)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, online: isOnline(p.id) })),
    podiumRevealed: room.podiumRevealed,
    results: room.phase === 'finished' && room.podiumRevealed ? publicResults(room.results) : null,
  };
}

/** Todos los equipos que comparten candado ya cerraron: es seguro mostrar soluciones. */
function reviewUnlocked(room, team) {
  if (room.phase === 'finished' || room.config.feedbackMode === 'instant') return true;
  return orderedTeams(room)
    .filter((t) => t.lock === team.lock && t.progress)
    .every((t) => isClosed(t.progress));
}

export function teamView(room, team, { isOnline, now = Date.now() }) {
  const p = team.progress;
  const members = teamMembers(room, team.id).map((m) => ({ id: m.id, name: m.name, online: isOnline(m.id) }));
  const base = { teamId: team.id, name: team.name, lock: team.lock, members, serverNow: now };
  if (!p || !room.game) return { ...base, started: false };

  const mode = room.config.feedbackMode;
  const closed = isClosed(p);
  const showVerdict = mode !== 'end' || room.phase === 'finished';
  const unlocked = reviewUnlocked(room, team);
  const solutionsNow = mode === 'instant' || unlocked;
  const nameOf = (id) => room.players[id]?.name ?? 'Alguien';

  let question = null;
  if (!closed) {
    const qid = p.order[p.current];
    question = { ...publicQuestion(room.game.questions[qid], p.optionOrders[qid]), index: p.current };
  }

  const history = p.answers.map((a) => {
    const q = room.game.questions[a.qid];
    return {
      index: a.index,
      value: a.value,
      by: a.by,
      byName: nameOf(a.by),
      unanimous: a.unanimous,
      correct: showVerdict ? a.correct : null,
      question: publicQuestion(q, p.optionOrders[a.qid]),
      solution: solutionsNow ? revealedSolution(q, p.optionOrders[a.qid]) : null,
    };
  });

  let review = null;
  if (closed && unlocked) {
    review = p.order.map((qid, index) => {
      const q = room.game.questions[qid];
      const answer = p.answers.find((a) => a.qid === qid) ?? null;
      return {
        index,
        question: publicQuestion(q, p.optionOrders[qid]),
        solution: revealedSolution(q, p.optionOrders[qid]),
        value: answer?.value ?? null,
        correct: answer ? answer.correct : false,
        byName: answer ? nameOf(answer.by) : null,
      };
    });
  }

  const correct = p.answers.filter((a) => a.correct).length;
  return {
    ...base,
    started: true,
    feedbackMode: mode,
    total: p.order.length,
    current: p.current,
    closed,
    closedBy: p.closedBy,
    finishSeq: p.finishSeq,
    finishedAtMs: p.finishedAtMs,
    captainId: closed ? null : captainOf(room, team, isOnline),
    claimAtMs: closed ? null : questionStartMs(p) + CLAIM_AFTER_MS,
    question,
    votes: Object.entries(p.votes).map(([playerId, v]) => ({ playerId, value: v.value })),
    history,
    review,
    reviewUnlocked: unlocked,
    correct: showVerdict ? correct : null,
    xp: showVerdict ? liveXp(correct, openedPosition(p)) : null,
  };
}

export function moderatorView(room, { bank, bankInfo, isOnline, now = Date.now() }) {
  const pub = publicView(room, { bank, isOnline, now });
  const teams = orderedTeams(room).map((t, i) => {
    const p = t.progress;
    const currentQid = p && !isClosed(p) ? p.order[p.current] : null;
    return {
      ...pub.teams[i],
      correct: p ? p.answers.filter((a) => a.correct).length : null,
      xp: p ? liveXp(p.answers.filter((a) => a.correct).length, openedPosition(p)) : null,
      captainId: p && !isClosed(p) ? captainOf(room, t, isOnline) : null,
      currentIndex: p?.current ?? 0,
      currentPrompt: currentQid ? room.game.questions[currentQid].prompt : null,
      votesCount: p ? Object.keys(p.votes).length : 0,
      answers: p ? p.answers.map((a) => ({ index: a.index, correct: a.correct, by: room.players[a.by]?.name ?? '—', atMs: a.atMs })) : [],
    };
  });
  return {
    ...pub,
    config: room.config,
    teams,
    players: Object.values(room.players)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        online: isOnline(p.id),
        joinedAt: p.joinedAt,
        votes: p.stats?.votes ?? 0,
        confirms: p.stats?.confirms ?? 0,
      })),
    results: room.results,
    live: room.phase === 'running' || room.phase === 'paused' ? liveRanking(room, now) : null,
    log: room.log.slice(-25),
    bankInfo,
  };
}
