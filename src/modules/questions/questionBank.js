import fs from 'node:fs/promises';
import { defaultTolerance } from './answerChecker.js';

export const LOCK_IDS = [1, 2, 3, 4];
export const DIFFICULTIES = ['facil', 'media', 'dificil'];

const DEFAULT_LOCKS = {
  1: { name: 'Estimación', title: 'El ladrón de datos', badge: 'Cazador de parámetros' },
  2: { name: 'Prueba de hipótesis', title: 'El juicio', badge: 'Juez implacable' },
  3: { name: 'Regresión lineal', title: 'Traza la recta', badge: 'Domador de rectas' },
  4: { name: 'ANOVA', title: 'Tres pociones', badge: 'Guardián de la varianza' },
};

function str(v, max = 2000) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Valida y normaliza un banco de preguntas. Nunca lanza: devuelve errores legibles
 * para mostrarlos en el panel del moderador o en la consola.
 */
export function validateBank(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['El banco debe ser un objeto JSON con "locks" y "questions".'], warnings, bank: null };
  }

  const locks = LOCK_IDS.map((id) => {
    const src = (Array.isArray(raw.locks) ? raw.locks : []).find((l) => Number(l?.id) === id) || {};
    return {
      id,
      name: str(src.name, 60) || DEFAULT_LOCKS[id].name,
      title: str(src.title, 80) || DEFAULT_LOCKS[id].title,
      story: str(src.story, 600),
      badge: str(src.badge, 60) || DEFAULT_LOCKS[id].badge,
    };
  });

  const seen = new Set();
  const questions = [];
  (Array.isArray(raw.questions) ? raw.questions : []).forEach((q, i) => {
    const where = `Pregunta #${i + 1}${q?.id ? ` (${q.id})` : ''}`;
    if (!q || typeof q !== 'object') {
      errors.push(`${where}: no es un objeto.`);
      return;
    }
    const id = str(q.id, 40);
    if (!id) errors.push(`${where}: falta "id".`);
    else if (seen.has(id)) errors.push(`${where}: el id "${id}" está repetido.`);
    seen.add(id);

    const lock = Number(q.lock);
    if (!LOCK_IDS.includes(lock)) errors.push(`${where}: "lock" debe ser 1, 2, 3 o 4.`);

    const type = q.type === 'numeric' ? 'numeric' : q.type === 'mc' ? 'mc' : null;
    if (!type) errors.push(`${where}: "type" debe ser "mc" (opción múltiple) o "numeric".`);

    const prompt = str(q.prompt);
    if (!prompt) errors.push(`${where}: falta el enunciado "prompt".`);

    const norm = {
      id,
      lock,
      type,
      prompt,
      data: str(q.data),
      hint: str(q.hint, 400),
      unit: str(q.unit, 20),
      difficulty: DIFFICULTIES.includes(q.difficulty) ? q.difficulty : 'media',
      explanation: str(q.explanation),
      example: q.example !== false,
      active: q.active !== false,
    };

    if (type === 'mc') {
      const options = Array.isArray(q.options) ? q.options.map((o) => str(String(o ?? ''), 300)) : [];
      if (options.length < 2 || options.length > 6) errors.push(`${where}: necesita entre 2 y 6 opciones.`);
      if (options.some((o) => !o)) errors.push(`${where}: hay opciones vacías.`);
      const answer = Number(q.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
        errors.push(`${where}: "answer" debe ser el índice (desde 0) de la opción correcta.`);
      }
      norm.options = options;
      norm.answer = answer;
    } else if (type === 'numeric') {
      const answer = Number(q.answer);
      if (!Number.isFinite(answer)) errors.push(`${where}: "answer" debe ser un número.`);
      norm.answer = answer;
      if (q.tolerance === undefined || q.tolerance === null || q.tolerance === '') {
        norm.tolerance = defaultTolerance(answer || 0);
        warnings.push(`${where}: sin "tolerance"; se usa ±${norm.tolerance.toFixed(3)}.`);
      } else {
        const tol = Number(q.tolerance);
        if (!Number.isFinite(tol) || tol < 0) errors.push(`${where}: "tolerance" debe ser un número ≥ 0.`);
        norm.tolerance = tol;
      }
    }
    if (!norm.explanation) warnings.push(`${where}: no tiene explicación.`);
    questions.push(norm);
  });

  for (const lock of LOCK_IDS) {
    const active = questions.filter((q) => q.lock === lock && q.active).length;
    if (active === 0) errors.push(`El candado ${lock} no tiene preguntas activas.`);
    else if (active < 5) warnings.push(`El candado ${lock} tiene ${active} preguntas activas (se recomiendan 5).`);
  }

  return { ok: errors.length === 0, errors, warnings, bank: { version: 1, locks, questions } };
}

export async function loadBankFromFile(file) {
  const text = await fs.readFile(file, 'utf8');
  const result = validateBank(JSON.parse(text));
  if (!result.ok) {
    throw new Error(`Banco de preguntas inválido (${file}):\n- ${result.errors.join('\n- ')}`);
  }
  return result;
}

/** Elige las preguntas activas de un candado, en el orden del banco. */
export function pickQuestions(bank, lock, count) {
  return bank.questions.filter((q) => q.lock === lock && q.active).slice(0, count);
}

/**
 * Versión que viaja al navegador: sin respuesta, sin tolerancia y sin explicación,
 * con las opciones en el orden barajado del equipo.
 */
export function publicQuestion(question, optionOrder) {
  const base = {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    data: question.data,
    hint: question.hint,
    unit: question.unit,
    difficulty: question.difficulty,
    example: question.example,
  };
  if (question.type === 'mc') {
    const order = optionOrder || question.options.map((_, i) => i);
    base.options = order.map((orig) => question.options[orig]);
  }
  return base;
}

/** Solución para mostrar una vez que es seguro revelarla. */
export function revealedSolution(question, optionOrder) {
  if (question.type === 'mc') {
    const order = optionOrder || question.options.map((_, i) => i);
    return { correct: order.indexOf(question.answer), explanation: question.explanation };
  }
  return { correct: question.answer, unit: question.unit, explanation: question.explanation };
}
