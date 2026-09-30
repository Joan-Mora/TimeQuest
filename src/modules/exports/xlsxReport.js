/**
 * Informe en Excel con la identidad visual de la actividad (azul marino, dorado y un color por candado).
 * Los números se guardan como números con formato: Excel los muestra con la coma decimal del equipo.
 */
import ExcelJS from 'exceljs';
import { LOCK_NAMES, isChaosResults, lockLabel, rankingTable, statusLabel, studentsTable } from './exportService.js';

const C = {
  navy: 'FF141A45',
  navyDeep: 'FF0E1233',
  navySoft: 'FFE9EBF7',
  line: 'FFDDE1EE',
  gold: 'FFFFC53D',
  goldSoft: 'FFFFF3D6',
  ink: 'FF1B1F3B',
  muted: 'FF555C7A',
  white: 'FFFFFFFF',
  green: 'FF16A34A',
  greenSoft: 'FFDCF5E4',
  red: 'FFD62F4F',
  redSoft: 'FFFADADF',
  amberSoft: 'FFFFF3D6',
};
const LOCK_COLORS = { 0: 'FFB8327A', 1: 'FF0A7F75', 2: 'FF6D45E8', 3: 'FFF5A524', 4: 'FFD62F4F' };
const DIFFICULTY = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };
const FONT = 'Calibri';

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: C.line } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

function banner(ws, { title, subtitle, cols }) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 18, bold: true, color: { argb: C.white } };
  t.fill = fill(C.navy);
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 34;

  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, size: 11, bold: true, color: { argb: C.ink } };
  s.fill = fill(C.gold);
  s.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 22;

  // Franja con los colores de los cuatro candados bajo el encabezado.
  ws.getRow(3).height = 6;
  for (let c = 1; c <= cols; c++) ws.getCell(3, c).fill = fill(LOCK_COLORS[((c - 1) % 4) + 1]);
}

function sectionTitle(ws, row, text, cols) {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text.toUpperCase();
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.navy } };
  cell.border = { bottom: { style: 'medium', color: { argb: C.gold } } };
  ws.getRow(row).height = 20;
}

function headerRow(ws, rowNumber, labels) {
  const row = ws.getRow(rowNumber);
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.font = { name: FONT, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.navy);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = box;
  });
  row.height = 32;
}

function gradeStyle(cell, grade) {
  if (grade === null || grade === undefined) return;
  const [bg, fg] = grade >= 4 ? [C.greenSoft, C.green] : grade >= 3 ? [C.amberSoft, 'FF9A5F00'] : [C.redSoft, C.red];
  cell.fill = fill(bg);
  cell.font = { name: FONT, bold: true, color: { argb: fg } };
}

function lockStyle(cell, lock) {
  if (lock === null || lock === undefined || !LOCK_COLORS[lock]) return;
  cell.fill = fill(LOCK_COLORS[lock]);
  cell.font = { name: FONT, bold: true, color: { argb: lock === 3 ? C.ink : C.white } };
}

function bodyRows(ws, startRow, rows, { formats = {}, zebra = true } = {}) {
  rows.forEach((values, r) => {
    const row = ws.getRow(startRow + r);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v === null || v === undefined ? '—' : v;
      cell.font = { name: FONT, color: { argb: C.ink } };
      cell.border = box;
      cell.alignment = { vertical: 'middle', wrapText: typeof v === 'string' && v.length > 28 };
      if (typeof v === 'number') {
        cell.alignment.horizontal = 'center';
        if (formats[i]) cell.numFmt = formats[i];
      }
      if (zebra && r % 2 === 1) cell.fill = fill('FFF6F7FC');
    });
  });
}

function kv(ws, row, pairs, cols) {
  pairs.forEach(([k, v], i) => {
    const r = row + i;
    const key = ws.getCell(r, 1);
    key.value = k;
    key.font = { name: FONT, bold: true, color: { argb: C.muted } };
    ws.mergeCells(r, 2, r, cols);
    const val = ws.getCell(r, 2);
    val.value = v;
    val.font = { name: FONT, color: { argb: C.ink } };
    val.alignment = { wrapText: true, vertical: 'top' };
  });
  return row + pairs.length;
}

const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

export async function buildXlsx({ room, results, partial, generatedAt = new Date() }) {
  const chaos = isChaosResults(results);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Escape Room Estadístico';
  wb.title = `Informe ${room.code}`;
  wb.created = generatedAt;

  const dateText = generatedAt.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });
  const title = 'Escape Room Estadístico · El Laboratorio Sellado';
  const subtitle = `Informe de resultados · ${room.config.title} · Sala ${room.code}${partial ? ' · PARCIAL' : ''}`;
  const w = results.scoring.weights;
  const grades = results.teams.map((t) => t.grade);
  const studentGrades = results.students.map((s) => s.grade).filter((g) => g !== null && g !== undefined);

  // ---------------- Resumen ----------------
  const sum = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.gold } } });
  const SC = 6;
  sum.columns = [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  banner(sum, { title, subtitle, cols: SC });

  sectionTitle(sum, 5, 'Identificación', SC);
  let row = kv(sum, 6, [
    ['Actividad', 'Análisis Cuantitativo de Datos · Tecnología en Desarrollo de Software · UNIMINUTO'],
    ['Sala', `${room.config.title} (código ${room.code})`],
    ['Modo de juego', chaos ? `Caos · todos contra todos (${room.config.chaosLives ?? 3} vidas, 4 temas mezclados)` : 'Por equipos · un candado por equipo'],
    ['Estado', partial ? 'Parcial: la partida sigue en curso' : 'Final'],
    ['Generado', dateText],
    ['Participantes', `${results.students.length} estudiantes${chaos ? '' : ` en ${results.teams.length} equipos`}`],
    ['Fórmula de la nota', `Nota = ${Math.round(w.accuracy * 100)} % × acierto (0-5) + ${Math.round(w.speed * 100)} % × velocidad por orden de ${chaos ? 'llegada' : 'apertura'} (${results.scoring.speedTable.join(' · ')}; sin ${chaos ? 'terminar' : 'abrir'}: ${results.scoring.timeoutSpeed})`],
  ], SC);

  row += 1;
  sectionTitle(sum, row, 'Indicadores', SC);
  row += 1;
  const kpis = [
    ['Nota promedio', avg(studentGrades), '0.0'],
    ['Nota más alta', grades.length ? Math.max(...grades) : null, '0.0'],
    ['Acierto promedio', avg(results.teams.map((t) => (t.total ? t.correct / t.total : 0))), '0%'],
    [chaos ? 'Sobrevivientes' : 'Candados abiertos', results.teams.filter((t) => t.opened).length, '0'],
    ['Notas ≥ 3,0', studentGrades.filter((g) => g >= 3).length, '0'],
  ];
  if (chaos) kpis.push(['Eliminados', results.teams.filter((t) => t.closedBy === 'eliminated').length, '0']);
  kpis.slice(0, SC).forEach(([label, value, fmt], i) => {
    const l = sum.getCell(row, i + 1);
    l.value = label;
    l.font = { name: FONT, size: 9, bold: true, color: { argb: C.muted } };
    l.alignment = { horizontal: 'center', wrapText: true };
    l.fill = fill(C.navySoft);
    const v = sum.getCell(row + 1, i + 1);
    v.value = value ?? '—';
    v.numFmt = fmt;
    v.font = { name: FONT, size: 20, bold: true, color: { argb: C.navy } };
    v.alignment = { horizontal: 'center', vertical: 'middle' };
    v.fill = fill(C.navySoft);
    v.border = { bottom: { style: 'medium', color: { argb: C.gold } } };
  });
  sum.getRow(row).height = 26;
  sum.getRow(row + 1).height = 36;
  row += 3;

  sectionTitle(sum, row, 'Podio', SC);
  row += 1;
  headerRow(sum, row, ['Puesto', chaos ? 'Jugador' : 'Equipo', chaos ? 'Estado' : 'Candado', 'Aciertos', 'Nota', 'Insignias']);
  results.teams.slice(0, 3).forEach((t, i) => {
    const r = row + 1 + i;
    const vals = [`${t.position}.º`, t.name, chaos ? statusLabel(t) : lockLabel(t.lock), `${t.correct}/${t.total}`, t.grade, t.badges.map((b) => b.label).join(', ') || '—'];
    vals.forEach((v, c) => {
      const cell = sum.getCell(r, c + 1);
      cell.value = v;
      cell.border = box;
      cell.font = { name: FONT, bold: c < 2, color: { argb: C.ink } };
      cell.alignment = { vertical: 'middle', horizontal: c === 1 || c === 5 ? 'left' : 'center', wrapText: true };
    });
    const medal = sum.getCell(r, 1);
    medal.fill = fill([C.gold, 'FFC9CEF0', 'FFE8B07A'][i]);
    medal.font = { name: FONT, bold: true, size: 13, color: { argb: C.ink } };
    if (!chaos) lockStyle(sum.getCell(r, 3), t.lock);
    sum.getCell(r, 5).numFmt = '0.0';
    gradeStyle(sum.getCell(r, 5), t.grade);
    sum.getRow(r).height = 22;
  });
  row += 5;
  sum.mergeCells(row, 1, row, SC);
  const foot = sum.getCell(row, 1);
  foot.value = 'Hojas: ranking completo con desglose de la nota, notas por estudiante y dificultad real de cada pregunta.';
  foot.font = { name: FONT, italic: true, size: 9, color: { argb: C.muted } };

  // ---------------- Ranking ----------------
  const rank = rankingTable(results);
  const rs = wb.addWorksheet(chaos ? 'Jugadores' : 'Equipos', { views: [{ state: 'frozen', ySplit: 5, xSplit: 2, showGridLines: false }], properties: { tabColor: { argb: C.navy } } });
  rs.columns = [8, 26, chaos ? 10 : 20, chaos ? 10 : 34, 10, 10, 11, 11, 11, 11, 11, 10, 10, 10, 10, 10, 9, 22, 9, 30, 36].map((width) => ({ width }));
  banner(rs, { title, subtitle: `${chaos ? 'Ranking de jugadores' : 'Ranking de equipos'} · ${subtitle}`, cols: rank.header.length });
  headerRow(rs, 5, rank.header);
  bodyRows(rs, 6, rank.rows, { formats: { 7: '0', 8: '0.00', 10: '0.0', 11: '0%', 12: '0%', 13: '0.00', 14: '0.00', 15: '0.00', 16: '0.0' } });
  results.teams.forEach((t, i) => {
    const r = 6 + i;
    rs.getCell(r, 2).font = { name: FONT, bold: true, color: { argb: C.ink } };
    if (!chaos) lockStyle(rs.getCell(r, 3), t.lock);
    gradeStyle(rs.getCell(r, 17), t.grade);
    if (t.position <= 3) rs.getCell(r, 1).fill = fill([C.gold, 'FFC9CEF0', 'FFE8B07A'][t.position - 1]);
    if (t.closedBy === 'eliminated') rs.getCell(r, 18).font = { name: FONT, bold: true, color: { argb: C.red } };
    if (t.opened) rs.getCell(r, 18).font = { name: FONT, bold: true, color: { argb: C.green } };
  });
  rs.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + rank.rows.length, column: rank.header.length } };

  // ---------------- Estudiantes ----------------
  const st = studentsTable(results);
  const ss = wb.addWorksheet('Estudiantes', { views: [{ state: 'frozen', ySplit: 5, xSplit: 1, showGridLines: false }], properties: { tabColor: { argb: LOCK_COLORS[1] } } });
  ss.columns = (chaos ? [30, 10, 9, 10, 10, 11, 12, 12, 20] : [30, 24, 24, 12, 9, 12, 14, 14, 14]).map((width) => ({ width }));
  banner(ss, { title, subtitle: `Notas por estudiante · ${subtitle}`, cols: st.header.length });
  headerRow(ss, 5, st.header);
  bodyRows(ss, 6, st.rows, { formats: chaos ? { 2: '0.0', 3: '0.00' } : { 4: '0.0' } });
  results.students.forEach((s, i) => {
    const r = 6 + i;
    ss.getCell(r, 1).font = { name: FONT, bold: true, color: { argb: C.ink } };
    gradeStyle(ss.getCell(r, chaos ? 3 : 5), s.grade);
    if (!chaos) {
      lockStyle(ss.getCell(r, 3), s.lock);
      if (s.participation < 40) ss.getCell(r, 9).font = { name: FONT, bold: true, color: { argb: C.red } };
    }
  });
  ss.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + st.rows.length, column: st.header.length } };
  const note = 6 + st.rows.length + 1;
  ss.mergeCells(note, 1, note, st.header.length);
  ss.getCell(note, 1).value = chaos
    ? 'En Caos la nota es individual. Quien quedó eliminado recibe la velocidad mínima y se ordena por aciertos y por cuánto resistió.'
    : 'La nota individual es la del equipo (trabajo cooperativo). La participación ayuda a decidir ajustes puntuales.';
  ss.getCell(note, 1).font = { name: FONT, italic: true, size: 9, color: { argb: C.muted } };

  // ---------------- Preguntas ----------------
  const qs = wb.addWorksheet('Preguntas', { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }], properties: { tabColor: { argb: LOCK_COLORS[2] } } });
  qs.columns = [16, 70, 11, 11, 11, 12].map((width) => ({ width }));
  banner(qs, { title, subtitle: `Dificultad real de las preguntas · ${subtitle}`, cols: 6 });
  headerRow(qs, 5, ['Tema', 'Enunciado', 'Dificultad', 'Intentos', 'Aciertos', '% acierto']);
  const qRows = results.questionStats.map((q) => [LOCK_NAMES[q.lock] ?? `Candado ${q.lock}`, q.prompt, DIFFICULTY[q.difficulty] ?? q.difficulty ?? '—', q.attempts, q.correct, q.accuracy === null ? null : q.accuracy / 100]);
  bodyRows(qs, 6, qRows, { formats: { 5: '0%' } });
  results.questionStats.forEach((q, i) => {
    const r = 6 + i;
    lockStyle(qs.getCell(r, 1), q.lock);
    qs.getCell(r, 2).alignment = { wrapText: true, vertical: 'middle' };
    const pct = qs.getCell(r, 6);
    if (q.accuracy !== null) gradeStyle(pct, q.accuracy >= 70 ? 4 : q.accuracy >= 40 ? 3 : 0);
  });

  for (const ws of wb.worksheets) {
    ws.pageSetup = { orientation: ws.name === 'Resumen' ? 'portrait' : 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    ws.headerFooter = { oddFooter: `&L&8Escape Room Estadístico · Sala ${room.code}&R&8Página &P de &N` };
  }
  return wb.xlsx.writeBuffer();
}
