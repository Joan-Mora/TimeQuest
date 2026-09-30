/**
 * Convierte lo que escribe un estudiante en un número.
 * Acepta coma o punto decimal, espacios, signo y un % final: "4,06", " -1.9 ", "85%".
 */
export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/\s+/g, '').replace(/%$/, '').replace(/[−–]/g, '-');
  if (!s) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // "1.234,5" (miles con punto) o "1,234.5" (miles con coma): el último separador es el decimal.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function defaultTolerance(answer) {
  return Math.max(Math.abs(answer) * 0.01, 0.01);
}

export function toleranceOf(question) {
  return typeof question.tolerance === 'number' && question.tolerance >= 0
    ? question.tolerance
    : defaultTolerance(question.answer);
}

/**
 * @param question pregunta completa (con respuesta)
 * @param value para "mc": índice ORIGINAL de la opción; para "numeric": número o texto
 */
export function checkAnswer(question, value) {
  if (question.type === 'mc') {
    return Number.isInteger(value) && value === question.answer;
  }
  const n = parseNumber(value);
  if (n === null) return false;
  // Pequeño épsilon para evitar falsos negativos por coma flotante en el borde de la tolerancia.
  return Math.abs(n - question.answer) <= toleranceOf(question) + 1e-9;
}
