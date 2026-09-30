/**
 * Efectos de sonido sintetizados con Web Audio (sin archivos que descargar).
 * El navegador exige un gesto del usuario antes de sonar: se "desbloquea" en el primer toque.
 */
let ctx = null;
let muted = localStorage.getItem('erlab:muted') === '1';

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = v;
  localStorage.setItem('erlab:muted', v ? '1' : '0');
}

function tone(freq, start, dur, { type = 'sine', gain = 0.18 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sfx = {
  tap: () => tone(660, 0, 0.06, { type: 'triangle', gain: 0.08 }),
  correct: () => [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.22, { type: 'triangle' })),
  wrong: () => {
    tone(196, 0, 0.25, { type: 'sawtooth', gain: 0.1 });
    tone(147, 0.18, 0.35, { type: 'sawtooth', gain: 0.1 });
  },
  neutral: () => tone(587, 0, 0.18, { type: 'triangle' }),
  unlock: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.35, { type: 'triangle', gain: 0.16 })),
  start: () => [262, 330, 392, 523].forEach((f, i) => tone(f, i * 0.12, 0.3, { type: 'square', gain: 0.07 })),
  tick: () => tone(1200, 0, 0.04, { type: 'square', gain: 0.05 }),
  alarm: () => [880, 660, 880, 660].forEach((f, i) => tone(f, i * 0.18, 0.16, { type: 'square', gain: 0.08 })),
  fanfare: () => [523, 523, 523, 698, 880, 1047].forEach((f, i) => tone(f, i * 0.14, i === 5 ? 0.8 : 0.16, { type: 'triangle', gain: 0.18 })),
  drum: () => {
    for (let i = 0; i < 14; i++) tone(90 + (i % 2) * 20, i * 0.09, 0.08, { type: 'square', gain: 0.06 });
  },
};

export function vibrate(pattern) {
  if (!muted && navigator.vibrate) navigator.vibrate(pattern);
}
