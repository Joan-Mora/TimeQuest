/**
 * Puntuación del Escape Room Estadístico.
 *
 *   Acierto (0–100)   = correctas / total × 100          → escala 0–5: Acierto / 20
 *   Velocidad (0–5)   = base por orden de apertura (5.0, 4.5, 4.0, 3.5, …)
 *   Puntaje (0–5)     = wA × Acierto/20 + wV × Velocidad  (wA + wV = 1; por defecto 0.7 / 0.3)
 *   Nota              = Puntaje redondeado a 1 decimal
 *
 * Con 70/30, un equipo que abre último (3.5) con 5/5 (4.55) supera a uno que abre primero
 * (5.0) con 3/5 (3.60) o 4/5 (4.30): la velocidad premia, pero el acierto manda.
 */

export const DEFAULT_SCORING = Object.freeze({
  weights: Object.freeze({ accuracy: 0.7, speed: 0.3 }),
  speedTable: Object.freeze([5.0, 4.5, 4.0, 3.5]),
  speedStep: 0.5,
  speedFloor: 3.0,
  timeoutSpeed: 2.5,
});

export const round = (n, d) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;

export function normalizeWeights(weights = DEFAULT_SCORING.weights) {
  const a = Math.max(0, Number(weights.accuracy) || 0);
  const s = Math.max(0, Number(weights.speed) || 0);
  const sum = a + s;
  if (sum <= 0) return { accuracy: 0.5, speed: 0.5 };
  return { accuracy: a / sum, speed: s / sum };
}

export function resolveScoring(partial = {}) {
  return {
    weights: normalizeWeights(partial.weights ?? DEFAULT_SCORING.weights),
    speedTable: Array.isArray(partial.speedTable) && partial.speedTable.length
      ? partial.speedTable.map(Number)
      : [...DEFAULT_SCORING.speedTable],
    speedStep: Number.isFinite(partial.speedStep) ? partial.speedStep : DEFAULT_SCORING.speedStep,
    speedFloor: Number.isFinite(partial.speedFloor) ? partial.speedFloor : DEFAULT_SCORING.speedFloor,
    timeoutSpeed: Number.isFinite(partial.timeoutSpeed) ? partial.timeoutSpeed : DEFAULT_SCORING.timeoutSpeed,
  };
}

/** Base de velocidad para el equipo que abrió en la posición `pos` (1 = primero). */
export function speedForPosition(pos, scoring = DEFAULT_SCORING) {
  const s = resolveScoring(scoring);
  if (pos <= s.speedTable.length) return s.speedTable[pos - 1];
  const last = s.speedTable[s.speedTable.length - 1];
  return Math.max(s.speedFloor, round(last - s.speedStep * (pos - s.speedTable.length), 2));
}

export function accuracyPoints(correct, total) {
  if (!total) return 0;
  return round((Math.max(0, Math.min(correct, total)) / total) * 100, 2);
}

/**
 * @param {Array<{id:string,name:string,lock:number,correct:number,total:number,answered:number,
 *   opened:boolean,finishSeq:number|null,elapsedMs:number|null}>} teams
 *   opened = respondió todas sus preguntas; si no, su candado se cerró por tiempo o por el moderador.
 * @returns lista ordenada con posición, desglose y motivo de desempate
 */
export function computeResults(teams, scoringConfig = DEFAULT_SCORING) {
  const scoring = resolveScoring(scoringConfig);
  const { accuracy: wA, speed: wV } = scoring.weights;

  const openedOrder = teams
    .filter((t) => t.opened)
    .sort((a, b) => (a.finishSeq ?? Infinity) - (b.finishSeq ?? Infinity));
  const openPos = new Map(openedOrder.map((t, i) => [t.id, i + 1]));

  const rows = teams.map((t) => {
    const acc = accuracyPoints(t.correct, t.total);
    const acc5 = round(acc / 20, 4);
    const speedPosition = openPos.get(t.id) ?? null;
    const speed = speedPosition ? speedForPosition(speedPosition, scoring) : scoring.timeoutSpeed;
    const accuracyPart = round(wA * acc5, 4);
    const speedPart = round(wV * speed, 4);
    const score = round(accuracyPart + speedPart, 2);
    return {
      teamId: t.id,
      name: t.name,
      lock: t.lock,
      correct: t.correct,
      total: t.total,
      answered: t.answered ?? t.correct,
      opened: !!t.opened,
      finishSeq: t.opened ? t.finishSeq : null,
      elapsedMs: t.elapsedMs ?? null,
      breakdown: {
        accuracyPoints: acc,
        accuracy5: acc5,
        speedPosition,
        speed,
        weights: { accuracy: round(wA, 4), speed: round(wV, 4) },
        accuracyPart,
        speedPart,
      },
      score,
      grade: round(score, 1),
    };
  });

  rows.sort(compareRows);

  rows.forEach((row, i) => {
    row.position = i + 1;
    row.tiebreak = i > 0 && rows[i - 1].score === row.score ? tiebreakReason(rows[i - 1], row) : null;
  });
  return rows;
}

const TIEBREAKS = [
  { key: 'correct', label: 'más respuestas correctas', cmp: (a, b) => b.correct - a.correct },
  { key: 'opened', label: 'abrió el candado antes de que se acabara el tiempo', cmp: (a, b) => Number(b.opened) - Number(a.opened) },
  { key: 'elapsed', label: 'menor tiempo total', cmp: (a, b) => (a.elapsedMs ?? Infinity) - (b.elapsedMs ?? Infinity) },
  { key: 'seq', label: 'abrió primero su candado', cmp: (a, b) => (a.finishSeq ?? Infinity) - (b.finishSeq ?? Infinity) },
  { key: 'answered', label: 'más preguntas respondidas', cmp: (a, b) => b.answered - a.answered },
];

export function compareRows(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  for (const t of TIEBREAKS) {
    const c = t.cmp(a, b);
    if (c !== 0 && !Number.isNaN(c)) return c;
  }
  return a.name.localeCompare(b.name, 'es');
}

function tiebreakReason(prev, row) {
  for (const t of TIEBREAKS) {
    const c = t.cmp(prev, row);
    if (c !== 0 && !Number.isNaN(c)) return `Empate en puntaje con «${prev.name}»; desempata por ${t.label}.`;
  }
  return `Empate total con «${prev.name}»; se ordena alfabéticamente.`;
}

/** XP cosmético para el juego (no afecta la nota): 100 por acierto + bono por orden de apertura. */
export function liveXp(correct, openedPosition) {
  const bonus = openedPosition ? Math.max(50, 250 - 50 * openedPosition) : 0;
  return correct * 100 + bonus;
}
