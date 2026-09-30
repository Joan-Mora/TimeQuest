import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accuracyPoints,
  computeResults,
  normalizeWeights,
  speedForPosition,
  DEFAULT_SCORING,
} from '../src/modules/scoring/scoring.js';
import { computeBadges } from '../src/modules/scoring/badges.js';

const team = (id, correct, finishSeq, extra = {}) => ({
  id,
  name: id,
  lock: 1,
  correct,
  total: 5,
  answered: 5,
  opened: finishSeq !== null,
  finishSeq,
  elapsedMs: finishSeq ? finishSeq * 60_000 : 480_000,
  ...extra,
});

test('bases de velocidad: 5.0, 4.5, 4.0, 3.5 y luego bajan 0.5 hasta el piso', () => {
  assert.deepEqual([1, 2, 3, 4].map((p) => speedForPosition(p)), [5.0, 4.5, 4.0, 3.5]);
  assert.equal(speedForPosition(5), 3.0);
  assert.equal(speedForPosition(6), 3.0, 'no baja del piso (3.0)');
  assert.equal(speedForPosition(9), 3.0);
});

test('acierto: 20 puntos por pregunta, de 0 a 100', () => {
  assert.equal(accuracyPoints(4, 5), 80);
  assert.equal(accuracyPoints(0, 5), 0);
  assert.equal(accuracyPoints(5, 5), 100);
  assert.equal(accuracyPoints(7, 5), 100, 'nunca supera 100');
  assert.equal(accuracyPoints(3, 0), 0, 'sin preguntas no hay división por cero');
});

test('pesos se normalizan para sumar 1', () => {
  assert.deepEqual(normalizeWeights({ accuracy: 70, speed: 30 }), { accuracy: 0.7, speed: 0.3 });
  assert.deepEqual(normalizeWeights({ accuracy: 0, speed: 0 }), { accuracy: 0.5, speed: 0.5 });
});

test('fórmula por defecto 70/30: puntaje = 0.7·(acierto/20) + 0.3·velocidad', () => {
  const [row] = computeResults([team('A', 4, 1)]);
  assert.equal(row.breakdown.accuracyPoints, 80);
  assert.equal(row.breakdown.accuracy5, 4);
  assert.equal(row.breakdown.speed, 5);
  assert.equal(row.score, 4.3);
  assert.equal(row.grade, 4.3);
});

test('el último con 5/5 supera al primero que falló varias (acierto manda)', () => {
  const rows = computeResults([team('Rapido', 3, 1), team('Medio', 4, 2), team('Tercero', 2, 3), team('Preciso', 5, 4)]);
  assert.equal(rows[0].name, 'Preciso');
  assert.equal(rows[0].score, 4.55);
  const rapido = rows.find((r) => r.name === 'Rapido');
  assert.equal(rapido.score, 3.6);
  assert.ok(rows.findIndex((r) => r.name === 'Preciso') < rows.findIndex((r) => r.name === 'Rapido'));
});

test('con 0 aciertos el candado igual cuenta como abierto y recibe su base de velocidad', () => {
  const [row] = computeResults([team('Cero', 0, 1)]);
  assert.equal(row.opened, true);
  assert.equal(row.breakdown.accuracyPoints, 0);
  assert.equal(row.score, 1.5);
});

test('equipos cerrados por tiempo reciben la base de tiempo agotado (2.5) y van después de quienes abrieron', () => {
  const rows = computeResults([team('Tiempo', 3, null), team('Abrio', 3, 1)]);
  assert.equal(rows[0].name, 'Abrio');
  const t = rows.find((r) => r.name === 'Tiempo');
  assert.equal(t.opened, false);
  assert.equal(t.breakdown.speed, DEFAULT_SCORING.timeoutSpeed);
  assert.equal(t.breakdown.speedPosition, null);
});

test('la velocidad se asigna por orden de apertura (finishSeq), no por orden de la lista', () => {
  const rows = computeResults([team('C', 5, 3), team('A', 5, 1), team('B', 5, 2)]);
  assert.deepEqual(rows.map((r) => r.name), ['A', 'B', 'C']);
  assert.deepEqual(rows.map((r) => r.breakdown.speed), [5, 4.5, 4]);
});

test('desempate 1: a igual puntaje, gana quien tiene más aciertos', () => {
  const rows = computeResults(
    [team('MasRapido', 3, 1), team('Otro', 0, 2), team('MasAciertos', 4, 3)],
    { weights: { accuracy: 0.5, speed: 0.5 } },
  );
  // 0.5·3 + 0.5·5.0 = 4.0  y  0.5·4 + 0.5·4.0 = 4.0
  assert.equal(rows[0].score, rows[1].score);
  assert.equal(rows[0].name, 'MasAciertos');
  assert.match(rows[1].tiebreak, /más respuestas correctas/);
});

test('desempate 2: a igual puntaje y aciertos, gana quien abrió; luego menor tiempo', () => {
  const scoring = { timeoutSpeed: 5.0 };
  const rows = computeResults(
    [team('SinAbrir', 5, null, { elapsedMs: 480_000 }), team('Abrio', 5, 1, { elapsedMs: 470_000 })],
    scoring,
  );
  assert.equal(rows[0].score, rows[1].score);
  assert.equal(rows[0].name, 'Abrio');
  assert.match(rows[1].tiebreak, /abrió el candado/);

  const tied = computeResults(
    [team('Lento', 4, null, { elapsedMs: 480_000 }), team('Veloz', 4, null, { elapsedMs: 300_000 })],
  );
  assert.equal(tied[0].name, 'Veloz');
  assert.match(tied[1].tiebreak, /menor tiempo total/);
});

test('empate absoluto se resuelve alfabéticamente y es determinista', () => {
  const rows = computeResults([team('Zeta', 2, null), team('Alfa', 2, null)]);
  assert.deepEqual(rows.map((r) => r.name), ['Alfa', 'Zeta']);
  assert.match(rows[1].tiebreak, /alfabéticamente/);
});

test('el moderador puede cambiar pesos: 100 % velocidad ordena solo por apertura', () => {
  const rows = computeResults([team('Preciso', 5, 2), team('Rapido', 0, 1)], { weights: { accuracy: 0, speed: 1 } });
  assert.equal(rows[0].name, 'Rapido');
  assert.equal(rows[0].score, 5);
});

test('las posiciones son 1..n y el desglose suma el puntaje', () => {
  const rows = computeResults([team('A', 1, 2), team('B', 5, 4), team('C', 3, 1), team('D', 4, 3), team('E', 2, null)]);
  assert.deepEqual(rows.map((r) => r.position), [1, 2, 3, 4, 5]);
  for (const r of rows) {
    assert.ok(Math.abs(r.breakdown.accuracyPart + r.breakdown.speedPart - r.score) < 0.006);
    assert.ok(r.score >= 0 && r.score <= 5);
  }
});

test('más de 4 equipos: el 5.º y siguientes reciben el piso de velocidad', () => {
  const rows = computeResults([1, 2, 3, 4, 5, 6].map((seq) => team(`T${seq}`, 5, seq)));
  assert.deepEqual(rows.map((r) => r.breakdown.speed), [5, 4.5, 4, 3.5, 3, 3]);
});

test('insignias: pleno, primero, sincronía y último segundo', () => {
  const answers = Array.from({ length: 5 }, () => ({ correct: true, unanimous: true }));
  const ids = computeBadges({ lockBadge: 'Cazador de parámetros', answers, total: 5, openedPosition: 1, remainingMsAtOpen: 10_000 }).map((b) => b.id);
  assert.deepEqual(ids.sort(), ['clutch', 'first', 'lock', 'perfect', 'sync'].sort());

  const none = computeBadges({ lockBadge: 'x', answers: [{ correct: false }, { correct: true }], total: 5, openedPosition: null, remainingMsAtOpen: null });
  assert.equal(none.length, 0);
});
