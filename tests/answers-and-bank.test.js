import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkAnswer, parseNumber } from '../src/modules/questions/answerChecker.js';
import { publicQuestion, validateBank } from '../src/modules/questions/questionBank.js';
import { planTeams, lockForTeamIndex, autoTeamCount } from '../src/modules/teams/teamAssignment.js';

test('parseNumber acepta coma o punto decimal, signos y %', () => {
  assert.equal(parseNumber('4,06'), 4.06);
  assert.equal(parseNumber(' 4.06 '), 4.06);
  assert.equal(parseNumber('-2'), -2);
  assert.equal(parseNumber('−2'), -2, 'signo menos tipográfico');
  assert.equal(parseNumber('85%'), 85);
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('2..3'), null);
});

test('checkAnswer numérico respeta la tolerancia', () => {
  const q = { type: 'numeric', answer: 54.26, tolerance: 0.02 };
  assert.equal(checkAnswer(q, '54,26'), true);
  assert.equal(checkAnswer(q, '54.28'), true, 'justo en el borde');
  assert.equal(checkAnswer(q, '54.3'), false);
  assert.equal(checkAnswer(q, 'hola'), false);
  assert.equal(checkAnswer({ type: 'numeric', answer: 97, tolerance: 0 }, '97'), true);
  assert.equal(checkAnswer({ type: 'numeric', answer: 97, tolerance: 0 }, '96.04'), false);
});

test('checkAnswer de opción múltiple compara índices originales', () => {
  const q = { type: 'mc', answer: 2, options: ['a', 'b', 'c'] };
  assert.equal(checkAnswer(q, 2), true);
  assert.equal(checkAnswer(q, 1), false);
  assert.equal(checkAnswer(q, '2'), false, 'no acepta texto');
});

test('publicQuestion nunca incluye respuesta, tolerancia ni explicación', () => {
  const q = { id: 'x', type: 'mc', prompt: 'p', options: ['a', 'b', 'c'], answer: 1, explanation: 'e', tolerance: 1 };
  const pub = publicQuestion(q, [2, 0, 1]);
  assert.deepEqual(pub.options, ['c', 'a', 'b']);
  assert.equal('answer' in pub, false);
  assert.equal('explanation' in pub, false);
  assert.equal('tolerance' in pub, false);
});

test('el banco incluido es válido y tiene 5 preguntas activas por candado', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'));
  const res = validateBank(raw);
  assert.equal(res.ok, true, res.errors.join('\n'));
  for (const lock of [1, 2, 3, 4]) {
    const active = res.bank.questions.filter((q) => q.lock === lock && q.active);
    assert.equal(active.length, 5, `candado ${lock}`);
    assert.ok(active.some((q) => q.type === 'mc') && active.some((q) => q.type === 'numeric'), `candado ${lock} mezcla tipos`);
    assert.ok(active.every((q) => q.explanation && q.example), `candado ${lock} con explicación y marca de ejemplo`);
  }
});

test('validateBank reporta errores legibles', () => {
  const res = validateBank({ questions: [{ id: 'a', lock: 9, type: 'mc', prompt: '', options: ['x'], answer: 3 }] });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('"lock"')));
  assert.ok(res.errors.some((e) => e.includes('opciones')));
  assert.ok(res.errors.some((e) => e.includes('no tiene preguntas activas')));
});

test('planTeams reparte parejo, con equipos incompletos', () => {
  const ids = Array.from({ length: 23 }, (_, i) => `p${i}`);
  const groups = planTeams(ids, { teamSize: 5 });
  assert.deepEqual(groups.map((g) => g.length), [5, 5, 5, 4, 4]);
  assert.equal(new Set(groups.flat()).size, 23, 'nadie repetido ni perdido');

  assert.deepEqual(planTeams(['a', 'b', 'c'], { teamSize: 5 }).map((g) => g.length), [3]);
  assert.deepEqual(planTeams(ids, { teamCount: 4 }).map((g) => g.length), [6, 6, 6, 5]);
  assert.deepEqual(planTeams(['a', 'b'], { teamCount: 4 }).map((g) => g.length), [1, 1], 'no crea equipos vacíos');
  assert.deepEqual(planTeams([], { teamSize: 5 }), []);
  assert.equal(autoTeamCount(40, 5), 8);
});

test('candados en rotación 1-2-3-4-1', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(lockForTeamIndex), [1, 2, 3, 4, 1, 2]);
});
