import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyConfigPatch, createRoom } from '../src/modules/rooms/roomModel.js';
import { joinRoom } from '../src/modules/rooms/playerService.js';
import { autoAssign } from '../src/modules/teams/teamService.js';
import { validateBank } from '../src/modules/questions/questionBank.js';
import * as engine from '../src/modules/game/gameEngine.js';
import { teamView, publicView } from '../src/modules/realtime/views.js';

const bank = validateBank(JSON.parse(fs.readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'))).bank;

function setup(playerCount = 10, now = 1_000_000) {
  const room = createRoom('TEST1', now);
  for (let i = 0; i < playerCount; i++) joinRoom(room, `Jugador ${i + 1}`, { now: now + i });
  autoAssign(room, { keepOrder: true });
  engine.startGame(room, bank, now + 1000);
  return room;
}

/** Responde la pregunta actual del equipo: el capitán vota la opción correcta o incorrecta y confirma. */
function answerCurrent(room, team, { correct = true, now }) {
  const p = team.progress;
  const qid = p.order[p.current];
  const q = room.game.questions[qid];
  const captain = engine.captainOf(room, team);
  let value;
  if (q.type === 'mc') {
    const displayCorrect = p.optionOrders[qid].indexOf(q.answer);
    value = correct ? displayCorrect : (displayCorrect + 1) % q.options.length;
  } else {
    value = String(correct ? q.answer : q.answer + 1000);
  }
  engine.vote(room, captain, p.current, value, now);
  return engine.submit(room, captain, p.current, () => true, now);
}

test('inicio: cada equipo recibe 5 preguntas de su candado, barajadas', () => {
  const room = setup(10);
  const teams = Object.values(room.teams);
  assert.equal(teams.length, 2);
  for (const t of teams) {
    assert.equal(t.progress.order.length, 5);
    assert.ok(t.progress.order.every((qid) => room.game.questions[qid].lock === t.lock));
  }
  assert.equal(room.phase, 'running');
});

test('solo el capitán confirma; el capitán rota con cada pregunta', () => {
  const room = setup(5);
  const team = Object.values(room.teams)[0];
  const cap1 = engine.captainOf(room, team);
  const other = Object.values(room.players).find((p) => p.id !== cap1).id;
  engine.vote(room, other, 0, team.progress.optionOrders[team.progress.order[0]] ? 0 : '1', 2_000_000);
  assert.throws(() => engine.submit(room, other, 0, () => true, 2_000_000), /capitán/);
  answerCurrent(room, team, { now: 2_000_000 });
  assert.notEqual(engine.captainOf(room, team), cap1);
});

test('si el capitán está desconectado, la capitanía pasa al siguiente conectado', () => {
  const room = setup(3);
  const team = Object.values(room.teams)[0];
  const cap = engine.captainOf(room, team);
  const next = engine.captainOf(room, team, (id) => id !== cap);
  assert.ok(next && next !== cap);
});

test('tomar el mando: solo tras 30 s sin confirmar, y la rotación sigue en la siguiente pregunta', () => {
  const room = setup(5);
  const team = Object.values(room.teams)[0];
  const start = room.clock.startedAt;
  const cap = engine.captainOf(room, team);
  const other = Object.values(room.players).find((p) => p.id !== cap).id;
  assert.throws(() => engine.claimCaptain(room, other, 0, () => true, start + 10_000), /Podrás tomar el mando en 20 s/);
  const res = engine.claimCaptain(room, other, 0, () => true, start + 30_000);
  assert.equal(res.changed, true);
  assert.equal(engine.captainOf(room, team), other);
  assert.throws(() => engine.submit(room, cap, 0, () => true, start + 31_000), /capitán/);

  answerCurrent(room, team, { now: start + 40_000 });
  assert.equal(team.progress.captainOverride, null);
  const nextCap = engine.captainOf(room, team);
  const third = Object.values(room.players).find((p) => p.id !== nextCap).id;
  assert.throws(() => engine.claimCaptain(room, third, 1, () => true, start + 50_000), /Podrás/);
  assert.equal(engine.claimCaptain(room, third, 1, () => true, start + 70_000).changed, true);
});

test('doble envío de la misma pregunta se rechaza (idempotencia ante doble toque)', () => {
  const room = setup(5);
  const team = Object.values(room.teams)[0];
  const captain = engine.captainOf(room, team);
  answerCurrent(room, team, { now: 2_000_000 });
  assert.throws(() => engine.submit(room, captain, 0, () => true, 2_000_001), /ya fue confirmada/);
  assert.equal(team.progress.answers.length, 1);
});

test('abrir el candado: orden decidido por el servidor y fin automático', () => {
  const room = setup(10);
  const [a, b] = Object.values(room.teams);
  for (let i = 0; i < 5; i++) answerCurrent(room, b, { correct: i % 2 === 0, now: 2_000_000 + i });
  assert.equal(b.progress.finishSeq, 1);
  for (let i = 0; i < 5; i++) answerCurrent(room, a, { correct: true, now: 2_100_000 + i });
  assert.equal(a.progress.finishSeq, 2);
  assert.equal(engine.allClosed(room), true);
  engine.endGame(room, 2_200_000, 'completed');
  assert.equal(room.phase, 'finished');
  const [first, second] = room.results.teams;
  assert.equal(first.teamId, a.id, 'el preciso (5/5) supera al rápido (3/5)');
  assert.equal(first.score, 4.85, '0.7·5 + 0.3·4.5');
  assert.equal(second.breakdown.speedPosition, 1);
  assert.equal(room.results.students.length, 10);
});

test('ranking en vivo: aciertos actuales + velocidad del próximo puesto, y coincide con el final', () => {
  const room = setup(10);
  const [a, b] = Object.values(room.teams);
  for (let i = 0; i < 5; i++) answerCurrent(room, a, { correct: true, now: 2_000_000 + i });
  answerCurrent(room, b, { correct: true, now: 2_000_010 });
  answerCurrent(room, b, { correct: false, now: 2_000_011 });
  answerCurrent(room, b, { correct: true, now: 2_000_012 });

  const live = engine.liveRanking(room, 2_000_100);
  const [first, second] = live.teams;
  assert.equal(first.teamId, a.id);
  assert.equal(first.status, 'opened');
  assert.equal(first.score, 5, '0.7·5 + 0.3·5');
  assert.equal(second.status, 'playing');
  assert.equal(second.speed, 4.5, 'si abriera ahora sería 2.º');
  assert.equal(second.score, 2.75, '0.7·(40/20) + 0.3·4.5');
  assert.equal(second.maxScore, 4.15, 'techo: 4/5 aciertos y 2.º puesto');

  answerCurrent(room, b, { correct: true, now: 2_000_020 });
  answerCurrent(room, b, { correct: true, now: 2_000_021 });
  const before = engine.liveRanking(room, 2_000_030).teams.map((r) => [r.teamId, r.score]);
  engine.endGame(room, 2_000_040, 'completed');
  assert.deepEqual(room.results.teams.map((r) => [r.teamId, r.score]), before);
  assert.equal(engine.liveRanking(room).teams.length, 2);
});

test('fallar las 5 igual abre el candado', () => {
  const room = setup(5);
  const team = Object.values(room.teams)[0];
  let last;
  for (let i = 0; i < 5; i++) last = answerCurrent(room, team, { correct: false, now: 2_000_000 + i });
  assert.equal(last.opened, true);
  assert.equal(team.progress.closedBy, null);
});

test('el tiempo se agota: tick cierra el candado y termina la partida', () => {
  const room = setup(5, 0);
  const team = Object.values(room.teams)[0];
  answerCurrent(room, team, { now: 10_000 });
  const limit = room.config.timeLimitsSec[team.lock] * 1000;
  assert.deepEqual(engine.tick(room, 1000 + limit - 1), []);
  const events = engine.tick(room, 1000 + limit + 1);
  assert.equal(events[0].type, 'timeout');
  assert.equal(team.progress.closedBy, 'time');
  assert.equal(room.phase, 'finished');
  assert.equal(room.results.teams[0].opened, false);
});

test('la pausa congela el reloj y bloquea respuestas', () => {
  const room = setup(5, 0);
  const team = Object.values(room.teams)[0];
  engine.pauseGame(room, 60_000);
  assert.throws(() => answerCurrent(room, team, { now: 70_000 }), /pausa/);
  engine.resumeGame(room, 600_000);
  const limit = room.config.timeLimitsSec[team.lock] * 1000;
  // Sin pausa se habría agotado en t = 1000 + limit; con la pausa aún quedan segundos.
  assert.deepEqual(engine.tick(room, 1000 + limit + 400_000), [], 'la pausa no consumió tiempo');
  assert.equal(engine.tick(room, 600_000 + (limit - 59_000) + 1)[0].type, 'timeout');
});

test('tras un reinicio del servidor, la partida en curso queda en pausa', () => {
  const room = setup(5, 0);
  room.lastAliveAt = 30_000;
  engine.restoreAfterRestart(room);
  assert.equal(room.phase, 'paused');
  assert.equal(room.autoPaused, true);
});

test('la vista de equipo nunca expone la respuesta de la pregunta actual', () => {
  const room = setup(5);
  const team = Object.values(room.teams)[0];
  const view = teamView(room, team, { isOnline: () => true });
  const json = JSON.stringify(view.question);
  assert.equal('answer' in view.question, false);
  assert.equal(json.includes('explanation'), false);
  assert.equal(view.history.length, 0);
});

test('modo "verdict": se ve ✓/✗ pero la solución espera a que cierren todos los equipos del mismo candado', () => {
  const room = createRoom('TEST2', 0);
  for (let i = 0; i < 10; i++) joinRoom(room, `J${i}`, { now: i });
  autoAssign(room, { keepOrder: true, teamCount: 2 });
  for (const t of Object.values(room.teams)) t.lock = 1;
  engine.startGame(room, bank, 1000);
  const [a, b] = Object.values(room.teams);
  for (let i = 0; i < 5; i++) answerCurrent(room, a, { now: 2000 + i });
  let view = teamView(room, a, { isOnline: () => true });
  assert.equal(view.history[0].correct, true);
  assert.equal(view.history[0].solution, null, 'el otro equipo del candado 1 sigue jugando');
  assert.equal(view.review, null);
  for (let i = 0; i < 5; i++) answerCurrent(room, b, { now: 3000 + i });
  view = teamView(room, a, { isOnline: () => true });
  assert.ok(view.review && view.review.length === 5);
  assert.ok(view.history[0].solution.explanation);
});

test('la vista pública oculta los aciertos durante la partida', () => {
  const room = setup(5);
  const team = Object.values(room.teams)[0];
  answerCurrent(room, team, { now: 2_000_000 });
  const pub = publicView(room, { bank, isOnline: () => true });
  assert.equal(pub.teams[0].answered, 1);
  assert.equal(pub.teams[0].correct, null);
  assert.equal(pub.results, null);
});

test('reiniciar vuelve al lobby conservando jugadores y equipos', () => {
  const room = setup(10);
  engine.endGame(room, 2_000_000);
  engine.resetGame(room);
  assert.equal(room.phase, 'lobby');
  assert.equal(Object.keys(room.players).length, 10);
  assert.equal(room.teamOrder.length, 2);
  assert.ok(Object.values(room.teams).every((t) => t.progress === null));
});

test('quien llega tarde entra al equipo con menos integrantes y puede jugar', () => {
  const room = setup(9);
  const { player } = joinRoom(room, 'Tardío', { now: 5_000_000 });
  const team = room.teams[player.teamId];
  assert.ok(team && team.progress);
  const sizes = Object.values(room.teams).map((t) => Object.values(room.players).filter((p) => p.teamId === t.id).length);
  assert.deepEqual(sizes.sort(), [5, 5]);
});

// ---------------------------------------------------------------------------
// Modo Caos (battle royale)
// ---------------------------------------------------------------------------
function setupChaos(playerCount = 4, now = 1_000_000, lives = 3) {
  const room = createRoom('CAOS1', now);
  applyConfigPatch(room, { mode: 'chaos', chaosLives: lives });
  for (let i = 0; i < playerCount; i++) joinRoom(room, `Jugador ${i + 1}`, { now: now + i });
  engine.startGame(room, bank, now + 1000);
  return room;
}

test('caos: cada jugador compite solo con los cuatro temas mezclados', () => {
  const room = setupChaos(4);
  const solos = Object.values(room.teams);
  assert.equal(solos.length, 4);
  for (const t of solos) {
    assert.equal(t.solo, true);
    assert.equal(t.lock, 0);
    assert.equal(t.progress.order.length, 20);
    const topics = new Set(t.progress.order.map((qid) => room.game.questions[qid].lock));
    assert.deepEqual([...topics].sort(), [1, 2, 3, 4]);
    assert.equal(Object.values(room.players).filter((p) => p.teamId === t.id).length, 1);
  }
});

test('caos: no se pueden armar equipos', () => {
  const room = createRoom('CAOS2');
  applyConfigPatch(room, { mode: 'chaos' });
  joinRoom(room, 'Ana');
  assert.throws(() => autoAssign(room, {}), /modo Caos/);
});

test('caos: cada error cuesta una vida y a la tercera queda eliminado', () => {
  const room = setupChaos(3);
  const [a, b, c] = Object.values(room.teams);
  let r = answerCurrent(room, a, { correct: false, now: 1_010_000 });
  assert.equal(r.livesLeft, 2);
  assert.equal(r.eliminated, false);
  answerCurrent(room, a, { correct: true, now: 1_011_000 });
  answerCurrent(room, a, { correct: false, now: 1_012_000 });
  r = answerCurrent(room, a, { correct: false, now: 1_013_000 });
  assert.equal(r.eliminated, true);
  assert.equal(a.progress.closedBy, 'eliminated');
  assert.deepEqual(engine.chaosAlive(room), { alive: 2, total: 3 });
  assert.throws(() => answerCurrent(room, a, { now: 1_014_000 }), /cerrado/);

  // b sobrevive respondiendo todo; c se queda sin tiempo.
  for (let i = 0; i < 20; i++) answerCurrent(room, b, { correct: i !== 0 && i !== 10, now: 1_020_000 + i });
  assert.equal(b.progress.finishSeq, 1);
  assert.equal(b.progress.closedBy, null);
  engine.endGame(room, 1_100_000);
  const rows = room.results.teams;
  assert.equal(room.results.mode, 'chaos');
  assert.equal(rows[0].teamId, b.id);
  assert.ok(rows[0].badges.some((x) => x.label === 'Superviviente del Caos'));
  // Con 1 acierto cada uno, c (en pie hasta el final) supera a a (eliminado antes).
  const ra = rows.find((x) => x.teamId === a.id);
  const rc = rows.find((x) => x.teamId === c.id);
  assert.equal(ra.livesLost, 3);
  assert.ok(rc.position > rows[0].position);
  assert.equal(room.results.students.length, 3);
  assert.ok(room.results.questionStats.length > 0);
});

test('caos: un eliminado no puede volver a entrar para recuperar vidas', () => {
  const room = createRoom('CAOS9', 1_000_000);
  applyConfigPatch(room, { mode: 'chaos', chaosLives: 3 });
  const { player: ana } = joinRoom(room, 'Ana', { deviceId: 'device-ana-0001' });
  joinRoom(room, 'Beto', { deviceId: 'device-beto-001' });
  engine.startGame(room, bank, 1_001_000);
  const team = room.teams[ana.teamId];
  for (let i = 0; i < 3; i++) answerCurrent(room, team, { correct: false, now: 1_010_000 + i });
  assert.equal(team.progress.closedBy, 'eliminated');

  // Desde el mismo navegador (aunque cambie el nombre) recupera al mismo jugador eliminado.
  const again = joinRoom(room, 'Ana otra vez', { deviceId: 'device-ana-0001' });
  assert.equal(again.player.id, ana.id);
  assert.equal(Object.keys(room.players).length, 2);
  assert.throws(() => answerCurrent(room, team, { now: 1_020_000 }), /cerrado/);

  // Desde otro navegador no puede reutilizar su nombre.
  assert.throws(() => joinRoom(room, 'ana', { deviceId: 'device-otro-001' }), /Ya hay un jugador con ese nombre/);
});

test('caos: el que resiste más tiempo desempata frente a un eliminado', () => {
  const room = setupChaos(2, 1_000_000, 1);
  const [a, b] = Object.values(room.teams);
  answerCurrent(room, a, { correct: false, now: 1_010_000 });
  answerCurrent(room, b, { correct: false, now: 1_050_000 });
  assert.equal(room.phase, 'running');
  assert.ok(engine.allClosed(room));
  engine.endGame(room, 1_060_000, 'completed');
  assert.equal(room.results.teams[0].teamId, b.id, 'b cayó después, queda por encima');
  assert.match(room.results.teams[1].tiebreak, /resistió/);
});

test('caos: quien llega tarde entra solo y con el reloj común', () => {
  const room = setupChaos(2);
  const { player } = joinRoom(room, 'Tardío', { now: 1_200_000 });
  const team = room.teams[player.teamId];
  assert.ok(team.solo && team.progress && team.progress.order.length === 20);
});

test('caos: las vistas muestran vidas y veredicto aunque el feedback sea «al final»', () => {
  const room = setupChaos(2);
  room.config.feedbackMode = 'end';
  const [a] = Object.values(room.teams);
  answerCurrent(room, a, { correct: false, now: 1_010_000 });
  const view = teamView(room, a, { isOnline: () => true });
  assert.equal(view.lives, 3);
  assert.equal(view.livesLost, 1);
  assert.equal(view.history[0].correct, false);
  assert.equal(view.history[0].solution, null, 'la solución sigue oculta mientras otros juegan');
  assert.equal(typeof view.question.lock, 'number');
  const pub = publicView(room, { bank, isOnline: () => true });
  assert.equal(pub.locks.length, 1);
  assert.equal(pub.locks[0].id, 0);
  assert.deepEqual(pub.chaos, { alive: 2, total: 2 });
  assert.equal(pub.config.mode, 'chaos');
});

test('caos: reiniciar vuelve al lobby sin equipos', () => {
  const room = setupChaos(3);
  engine.endGame(room, 1_100_000);
  engine.resetGame(room);
  assert.equal(room.teamOrder.length, 0);
  assert.ok(Object.values(room.players).every((p) => p.teamId === null));
});
