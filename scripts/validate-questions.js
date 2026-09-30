#!/usr/bin/env node
/**
 * Valida un banco de preguntas antes de la clase.
 * Uso: npm run validate:questions [-- ruta/al/banco.json]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LOCK_IDS, validateBank } from '../src/modules/questions/questionBank.js';

const file = path.resolve(process.argv[2] || 'data/questions.json');
let raw;
try {
  raw = JSON.parse(await readFile(file, 'utf8'));
} catch (err) {
  console.error(`✗ No se pudo leer ${file}: ${err.message}`);
  process.exit(1);
}

const { ok, errors, warnings, bank } = validateBank(raw);
console.log(`Banco: ${file}`);
if (bank) {
  for (const lock of LOCK_IDS) {
    const all = bank.questions.filter((q) => q.lock === lock);
    const active = all.filter((q) => q.active);
    const meta = bank.locks.find((l) => l.id === lock);
    const kinds = active.map((q) => (q.type === 'mc' ? 'OM' : 'Num')).join(', ');
    console.log(`  Candado ${lock} «${meta.title}»: ${active.length} activas / ${all.length} totales  [${kinds}]`);
  }
  const examples = bank.questions.filter((q) => q.example).length;
  if (examples) console.log(`  ${examples} pregunta(s) marcadas como ejemplo (revísalas y pon "example": false).`);
}
for (const w of warnings) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✗ ${e}`);
console.log(ok ? '✓ El banco es válido.' : `✗ El banco tiene ${errors.length} error(es).`);
process.exit(ok ? 0 : 1);
