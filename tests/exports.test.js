import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { applyConfigPatch, createRoom } from '../src/modules/rooms/roomModel.js';
import { joinRoom } from '../src/modules/rooms/playerService.js';
import { autoAssign } from '../src/modules/teams/teamService.js';
import { validateBank } from '../src/modules/questions/questionBank.js';
import * as engine from '../src/modules/game/gameEngine.js';
import { studentsCsv, teamsCsv } from '../src/modules/exports/exportService.js';
import { buildXlsx } from '../src/modules/exports/xlsxReport.js';

const bank = validateBank(JSON.parse(fs.readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'))).bank;

function finishedRoom(mode) {
  const room = createRoom('EXP01', 1_000_000);
  if (mode === 'chaos') applyConfigPatch(room, { mode: 'chaos' });
  for (let i = 0; i < 6; i++) joinRoom(room, `Estudiante ${i + 1}`, { now: 1_000_000 + i });
  if (mode !== 'chaos') autoAssign(room, { keepOrder: true, teamCount: 2 });
  engine.startGame(room, bank, 1_001_000);
  engine.endGame(room, 1_100_000);
  return room;
}

for (const mode of ['teams', 'chaos']) {
  test(`exportación (${mode}): CSV con BOM, «;» y cabeceras según el modo`, () => {
    const room = finishedRoom(mode);
    const teams = teamsCsv(room.results);
    const students = studentsCsv(room.results);
    assert.ok(teams.startsWith('\uFEFFPosición;'));
    assert.match(teams, mode === 'chaos' ? /;Jugador;Vidas restantes;/ : /;Equipo;Candado;/);
    assert.equal(students.trim().split('\r\n').length, 7);
    assert.ok(!/undefined|NaN/.test(teams + students));
  });

  test(`exportación (${mode}): Excel con resumen, ranking, estudiantes y preguntas`, async () => {
    const room = finishedRoom(mode);
    const buffer = await buildXlsx({ room, results: room.results, partial: false, generatedAt: new Date(2026, 8, 30) });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Resumen', mode === 'chaos' ? 'Jugadores' : 'Equipos', 'Estudiantes', 'Preguntas']);
    const rank = wb.worksheets[1];
    assert.equal(rank.getCell(5, 1).value, 'Posición');
    assert.equal(rank.getCell(6, 1).value, 1);
    assert.equal(typeof rank.getCell(6, 17).value, 'number', 'la nota es numérica');
    assert.match(String(wb.worksheets[0].getCell(8, 2).value), mode === 'chaos' ? /Caos/ : /equipos/);
  });
}
