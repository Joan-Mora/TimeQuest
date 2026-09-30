export const LOCKS = {
  1: { key: 'l1', short: 'Estimación', icon: 'target' },
  2: { key: 'l2', short: 'Hipótesis', icon: 'scales' },
  3: { key: 'l3', short: 'Regresión', icon: 'trend' },
  4: { key: 'l4', short: 'ANOVA', icon: 'bars' },
};

export function mmss(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Notas con coma decimal, como se escriben en Colombia. */
export function grade(n, digits = 1) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(digits).replace('.', ',');
}

export function dec(n, digits = 2) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(digits).replace('.', ',');
}

export function pct(n) {
  return `${Math.round(n * 100)} %`;
}

export function initials(name = '') {
  const parts = name.replace(/\(\d+\)/, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_COLORS = ['#0a7f75', '#6d45e8', '#f5a524', '#d62f4f', '#2f7de1', '#16a34a', '#c2410c', '#7c3aed'];
export function colorFor(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const DIFFICULTY = { facil: { label: 'Fácil', n: 1 }, media: { label: 'Media', n: 2 }, dificil: { label: 'Difícil', n: 3 } };

export function ordinal(n) {
  return `${n}.º`;
}

/** Resalta asignaciones tipo «n = 36» o «SC_E = 90» en dorado, como en las diapositivas. */
export function highlightTokens(text = '') {
  const re = /([^\s=,;:()«»]{1,8}\s=\s[−-]?\d+(?:[.,]\d+)?(?:\s?(?:mg|mm|cm|min|ms|h|s|%)(?![\p{L}]))?)/gu;
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ t: m[0], hl: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

export function phaseLabel(phase) {
  return { lobby: 'En el lobby', running: 'En juego', paused: 'En pausa', finished: 'Terminada' }[phase] ?? phase;
}
