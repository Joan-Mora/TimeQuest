/**
 * Exportación de resultados. CSV pensado para Excel en español (Colombia):
 * separador ";", coma decimal y BOM UTF-8 para que las tildes se vean bien.
 */
export const LOCK_NAMES = { 0: 'Caos (todos los temas)', 1: 'Estimación', 2: 'Prueba de hipótesis', 3: 'Regresión lineal', 4: 'ANOVA' };

const dec = (n, digits = 2) => (n === null || n === undefined || Number.isNaN(n) ? '' : Number(n).toFixed(digits).replace('.', ','));

export const isChaosResults = (results) => results.mode === 'chaos';

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '';
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function cell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function statusLabel(row) {
  if (row.solo) {
    if (row.opened) return 'Sobrevivió al Caos';
    if (row.closedBy === 'eliminated') return 'Eliminado';
    return row.closedBy === 'time' ? 'Tiempo agotado' : 'En pie al cierre';
  }
  if (row.opened) return 'Abrió el candado';
  return row.closedBy === 'time' ? 'Tiempo agotado' : 'Cerrado por el moderador';
}

export const lockLabel = (lock) => (lock === null || lock === undefined ? '—' : lock === 0 ? LOCK_NAMES[0] : `${lock} · ${LOCK_NAMES[lock]}`);

/** Filas del ranking (equipos o, en Caos, jugadores) con las mismas columnas en CSV y Excel. */
export function rankingTable(results) {
  const chaos = isChaosResults(results);
  const header = chaos
    ? ['Posición', 'Jugador', 'Vidas restantes', 'Vidas perdidas', 'Aciertos', 'Preguntas', 'Respondidas', 'Acierto (0-100)', 'Acierto (0-5)',
      'Orden de llegada', 'Base velocidad (0-5)', 'Peso acierto', 'Peso velocidad', 'Aporte acierto', 'Aporte velocidad',
      'Puntaje', 'Nota', 'Estado', 'Tiempo', 'Insignias', 'Desempate']
    : ['Posición', 'Equipo', 'Candado', 'Integrantes', 'Aciertos', 'Preguntas', 'Respondidas', 'Acierto (0-100)', 'Acierto (0-5)',
      'Orden de apertura', 'Base velocidad (0-5)', 'Peso acierto', 'Peso velocidad', 'Aporte acierto', 'Aporte velocidad',
      'Puntaje', 'Nota', 'Estado', 'Tiempo', 'Insignias', 'Desempate'];
  const rows = results.teams.map((t) => [
    t.position,
    t.name,
    chaos ? Math.max(0, (t.lives ?? 0) - (t.livesLost ?? 0)) : lockLabel(t.lock),
    chaos ? t.livesLost ?? 0 : t.members.map((m) => m.name).join(', '),
    t.correct,
    t.total,
    t.answered,
    t.breakdown.accuracyPoints,
    t.breakdown.accuracy5,
    t.breakdown.speedPosition ?? null,
    t.breakdown.speed,
    t.breakdown.weights.accuracy,
    t.breakdown.weights.speed,
    t.breakdown.accuracyPart,
    t.breakdown.speedPart,
    t.score,
    t.grade,
    statusLabel(t),
    formatDuration(t.elapsedMs),
    t.badges.map((b) => b.label).join(', '),
    t.tiebreak ?? '',
  ]);
  return { header, rows };
}

export function studentsTable(results) {
  const chaos = isChaosResults(results);
  const header = chaos
    ? ['Estudiante', 'Posición', 'Nota', 'Puntaje', 'Aciertos', 'Preguntas', 'Respondidas', 'Vidas perdidas', 'Estado']
    : ['Estudiante', 'Equipo', 'Candado', 'Posición del equipo', 'Nota', 'Votos emitidos', 'Confirmaciones como capitán', 'Preguntas en que votó', 'Participación (%)'];
  const rows = results.students.map((s) => (chaos
    ? [s.name, s.position ?? null, s.grade, s.score, s.correct, s.total || null, s.confirms, s.livesLost, s.teamId ? statusLabel({ ...s, solo: true }) : 'Sin partida']
    : [s.name, s.teamName, lockLabel(s.lock), s.position ?? null, s.grade, s.votes, s.confirms, s.questionsVoted, s.participation]));
  return { header, rows };
}

/** Columnas numéricas que en CSV se escriben con coma decimal (índice → decimales). */
const RANK_DECIMALS = { 7: 0, 8: 2, 10: 1, 11: 2, 12: 2, 13: 2, 14: 2, 15: 2, 16: 1 };
const STUDENT_DECIMALS = { chaos: { 2: 1, 3: 2 }, teams: { 4: 1 } };

const csvRows = (rows, decimals) => rows.map((r) => r.map((v, i) => (i in decimals && typeof v === 'number' ? dec(v, decimals[i]) : v ?? '—')));

export function teamsCsv(results) {
  const { header, rows } = rankingTable(results);
  return toCsv([header, ...csvRows(rows, RANK_DECIMALS)]);
}

export function studentsCsv(results) {
  const { header, rows } = studentsTable(results);
  return toCsv([header, ...csvRows(rows, STUDENT_DECIMALS[isChaosResults(results) ? 'chaos' : 'teams'])]);
}
