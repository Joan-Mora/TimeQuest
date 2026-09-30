/**
 * Exportación de resultados. CSV pensado para Excel en español (Colombia):
 * separador ";", coma decimal y BOM UTF-8 para que las tildes se vean bien.
 */
const LOCK_NAMES = { 1: 'Estimación', 2: 'Prueba de hipótesis', 3: 'Regresión lineal', 4: 'ANOVA' };

const dec = (n, digits = 2) => (n === null || n === undefined || Number.isNaN(n) ? '' : Number(n).toFixed(digits).replace('.', ','));

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
  if (row.opened) return 'Abrió el candado';
  return row.closedBy === 'time' ? 'Tiempo agotado' : 'Cerrado por el moderador';
}

export function teamsCsv(results) {
  const header = [
    'Posición', 'Equipo', 'Candado', 'Integrantes', 'Aciertos', 'Preguntas', 'Acierto (0-100)', 'Acierto (0-5)',
    'Orden de apertura', 'Base velocidad (0-5)', 'Peso acierto', 'Peso velocidad', 'Aporte acierto', 'Aporte velocidad',
    'Puntaje', 'Nota', 'Estado', 'Tiempo', 'Insignias', 'Desempate',
  ];
  const rows = results.teams.map((t) => [
    t.position,
    t.name,
    `${t.lock} · ${LOCK_NAMES[t.lock]}`,
    t.members.map((m) => m.name).join(', '),
    t.correct,
    t.total,
    dec(t.breakdown.accuracyPoints, 0),
    dec(t.breakdown.accuracy5),
    t.breakdown.speedPosition ?? '—',
    dec(t.breakdown.speed, 1),
    dec(t.breakdown.weights.accuracy),
    dec(t.breakdown.weights.speed),
    dec(t.breakdown.accuracyPart),
    dec(t.breakdown.speedPart),
    dec(t.score),
    dec(t.grade, 1),
    statusLabel(t),
    formatDuration(t.elapsedMs),
    t.badges.map((b) => b.label).join(', '),
    t.tiebreak ?? '',
  ]);
  return toCsv([header, ...rows]);
}

export function studentsCsv(results) {
  const header = [
    'Estudiante', 'Equipo', 'Candado', 'Posición del equipo', 'Nota', 'Votos emitidos',
    'Confirmaciones como capitán', 'Preguntas en que votó', 'Participación (%)',
  ];
  const rows = results.students.map((s) => [
    s.name,
    s.teamName,
    s.lock ? `${s.lock} · ${LOCK_NAMES[s.lock]}` : '—',
    s.position ?? '—',
    dec(s.grade, 1),
    s.votes,
    s.confirms,
    s.questionsVoted,
    s.participation,
  ]);
  return toCsv([header, ...rows]);
}
