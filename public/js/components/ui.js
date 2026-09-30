import { html, useEffect, useRef, useState } from '../lib/html.js';
import { LOCKS, colorFor, initials, mmss, highlightTokens, DIFFICULTY } from '../lib/format.js';

const ICONS = {
  target: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><path d="M12 12l7-7M16 5h3v3"/></svg>`,
  scales: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M5 7h14M12 5l0 0"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/></svg>`,
  trend: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-4 3 2 5-6"/><circle cx="7" cy="16" r="1" fill="currentColor"/><circle cx="11" cy="12" r="1" fill="currentColor"/><circle cx="14" cy="14" r="1" fill="currentColor"/><circle cx="19" cy="8" r="1" fill="currentColor"/></svg>`,
  bars: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 21h18"/><rect x="5" y="12" width="3" height="6" rx="0.5" fill="currentColor"/><rect x="10.5" y="8" width="3" height="10" rx="0.5" fill="currentColor"/><rect x="16" y="4" width="3" height="14" rx="0.5" fill="currentColor"/></svg>`,
  crown: html`<svg viewBox="0 0 24 20" fill="currentColor"><path d="M2 6l5 4 5-8 5 8 5-4-2 11H4z"/><rect x="4" y="18" width="16" height="2" rx="1"/></svg>`,
  clock: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  heart: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.8 3.7 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg>`,
  check: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  x: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  star: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>`,
  bolt: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`,
  users: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9"/></svg>`,
  fire: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 0-6 1-9zM12 22a7 7 0 0 1-7-7c0-.4 0-.8.1-1.2A7 7 0 0 0 12 20a7 7 0 0 0 6.9-6.2c.1.4.1.8.1 1.2a7 7 0 0 1-7 7z"/></svg>`,
  sync: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5"/></svg>`,
  key: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="8" cy="15" r="4.5"/><path d="M11.5 12L20 3.5M16.5 7l3 3M14 9.5l2 2"/></svg>`,
  play: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>`,
  pause: html`<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>`,
  sound: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`,
  mute: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`,
  lock: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>`,
  unlock: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/></svg>`,
  trophy: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10v5a5 5 0 0 1-10 0zM5 4H2.5v2A3.5 3.5 0 0 0 6 9.5M19 4h2.5v2A3.5 3.5 0 0 1 18 9.5" stroke="currentColor" stroke-width="1.8" fill-rule="evenodd"/><path d="M10.5 13h3v4h-3zM7.5 18h9v2.5h-9z"/></svg>`,
  download: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>`,
  expand: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  gear: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  book: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7.5h8M8 11h6"/></svg>`,
  link: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>`,
  monitor: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 21h8M12 16.5V21"/></svg>`,
  back: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  plus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  minus: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>`,
  trash: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/></svg>`,
  shuffle: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h4v4M4 20L20 4M20 16v4h-4M15 15l5 5M4 4l5 5"/></svg>`,
  flag: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5" fill="currentColor"/></svg>`,
  rotate: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>`,
  logout: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/></svg>`,
  up: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`,
  down: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>`,
  caretUp: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 6l8 11H4z"/></svg>`,
  caretDown: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 18L4 7h16z"/></svg>`,
  chevron: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`,
  file: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/></svg>`,
};

export function Icon({ name, size, cls = '' }) {
  const icon = ICONS[name] ?? ICONS.star;
  return html`<span class=${`icon ${cls}`} aria-hidden="true" style=${size ? `display:inline-block;width:${size}px;height:${size}px` : 'display:inline-block;width:1.1em;height:1.1em'}>${icon}</span>`;
}

export function LevelIcon({ lock, size = 56, number = true, boss = false }) {
  const meta = LOCKS[lock];
  const cls = boss ? 'c-boss' : `c-${meta.key}`;
  return html`<span class=${`lvl-icon ${cls}`} style=${`--size:${size}px`} aria-hidden="true">
    ${boss ? ICONS.crown : ICONS[meta.icon]}
    ${number && !boss ? html`<span class="lvl-num">${lock}</span>` : null}
  </span>`;
}

export function LockPill({ lock, name, prefix = 'Candado' }) {
  return html`<span class=${`pill ${LOCKS[lock].key}`}>${prefix} ${lock} · ${name ?? LOCKS[lock].short}</span>`;
}

export function Hearts({ lost = 0, total = 3 }) {
  return html`<span class="hearts" role="img" aria-label=${`${total - lost} de ${total} vidas`}>
    ${Array.from({ length: total }, (_, i) => html`<span class=${`heart ${i >= total - lost ? 'lost' : ''}`}>${ICONS.heart}</span>`)}
  </span>`;
}

export function XpBar({ xp = 0, max = 750 }) {
  const w = Math.min(100, Math.round(((xp || 0) / max) * 100));
  return html`<span class="xp"><span>XP ${xp ?? 0}</span><span class="xp-bar"><i style=${`width:${w}%`}></i></span></span>`;
}

export function Countdown({ ms, paused = false, big = false }) {
  const cls = ms <= 30_000 ? 'danger' : ms <= 60_000 ? 'warn' : '';
  return html`<span class=${`countdown ${paused ? '' : cls}`} role="timer" aria-live="off" style=${big ? 'font-size:2.2em' : ''}>
    ${paused ? ICONS.pause : ICONS.clock}<span>${mmss(ms)}</span>
  </span>`;
}

export function Avatar({ id, name, size = 36, online = true, captain = false, title }) {
  return html`<span class=${`avatar ${online ? '' : 'offline'}`} style=${`--s:${size}px;--c:${colorFor(id || name)}`} title=${title ?? name}>
    ${captain ? html`<span class="crown">${ICONS.crown}</span>` : null}
    ${initials(name)}
  </span>`;
}

export function MemberChip({ member, me = false, captain = false }) {
  return html`<span class=${`member-chip ${me ? 'me' : ''}`}>
    <${Avatar} id=${member.id} name=${member.name} size=${28} online=${member.online} captain=${captain} />
    <span>${member.name}${me ? ' (tú)' : ''}</span>
    ${member.online ? null : html`<span class="tiny muted">desconectado</span>`}
  </span>`;
}

/** Texto con los valores «x = 12» resaltados. */
export function Rich({ text }) {
  return highlightTokens(text || '').map((p) => (p.hl ? html`<span class="hl">${p.t}</span>` : p.t));
}

export function Difficulty({ level }) {
  const d = DIFFICULTY[level] ?? DIFFICULTY.media;
  return html`<span class="diff" title=${`Dificultad ${d.label}`}>
    ${[1, 2, 3].map((i) => html`<i class=${i <= d.n ? 'on' : ''}></i>`)}
    <span style="margin-left:4px">${d.label}</span>
  </span>`;
}

export function Pins({ total, answers = [], current = null }) {
  return html`<div class="pins" style=${`--n:${total}`} role="progressbar" aria-valuemin="0" aria-valuemax=${total} aria-valuenow=${answers.length}>
    ${Array.from({ length: total }, (_, i) => {
      const a = answers[i];
      let cls = 'pin';
      if (a) cls += a.correct === true ? ' ok' : a.correct === false ? ' bad' : ' done';
      else if (i === current) cls += ' current';
      return html`<span class=${cls}></span>`;
    })}
  </div>`;
}

const BADGE_STYLE = {
  lock: { icon: null, color: null },
  first: { icon: 'key', color: '#ffc53d', ink: '#1b1f3b' },
  perfect: { icon: 'star', color: '#16a34a' },
  streak: { icon: 'fire', color: '#d62f4f' },
  sync: { icon: 'sync', color: '#6d45e8' },
  clutch: { icon: 'bolt', color: '#f5a524', ink: '#1b1f3b' },
};
const LOCK_COLORS = { 1: '#0a7f75', 2: '#6d45e8', 3: '#f5a524', 4: '#d62f4f' };

export function HexBadge({ badge, lock, size = 64 }) {
  const style = BADGE_STYLE[badge.id] ?? BADGE_STYLE.first;
  const color = badge.id === 'lock' ? LOCK_COLORS[lock] : style.color;
  const iconName = badge.id === 'lock' ? LOCKS[lock].icon : style.icon;
  const ink = badge.id === 'lock' && lock === 3 ? '#1b1f3b' : style.ink ?? '#fff';
  return html`<span class="hex" style=${`--s:${size}px`} title=${badge.desc}>
    <svg class="hex-shape" viewBox="0 0 100 110"><polygon points="50,3 96,28 96,82 50,107 4,82 4,28" fill=${color} stroke="#fff" stroke-width="5"/><polygon points="50,14 86,34 86,76 50,96 14,76 14,34" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2.5"/></svg>
    <span class="hex-icon" style=${`color:${ink}`}>${ICONS[iconName]}</span>
  </span>`;
}

export function BadgeList({ badges = [], lock }) {
  if (!badges.length) return html`<p class="muted small">Sin insignias esta vez. ¡La próxima!</p>`;
  return html`<div class="badge-row">
    ${badges.map((b) => html`<div class="badge-item"><${HexBadge} badge=${b} lock=${lock} /><span>${b.label}</span></div>`)}
  </div>`;
}

export function Padlock({ open = false, color = '#ffc53d', size = 140 }) {
  return html`<svg class=${`padlock ${open ? 'open unlock-anim' : ''}`} viewBox="0 0 140 160" style=${`width:${size}px;height:${size * 1.14}px`} aria-hidden="true">
    <path class="shackle" d="M38 72V48a32 32 0 0 1 64 0v24" fill="none" stroke="#c9cef0" stroke-width="14" stroke-linecap="round"/>
    <rect class="body" x="18" y="70" width="104" height="82" rx="18" fill=${color}/>
    <circle cx="70" cy="104" r="11" fill="#141a45"/>
    <rect x="65" y="108" width="10" height="22" rx="5" fill="#141a45"/>
  </svg>`;
}

/** Confeti ligero en canvas (se omite si el usuario pidió reducir movimiento). */
export function Confetti({ fire }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!fire || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#ffc53d', '#0a7f75', '#6d45e8', '#f5a524', '#d62f4f', '#ffffff'];
    const parts = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.3,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      r: Math.random() * 6 + 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf;
    const start = performance.now();
    const step = (t) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      }
      if (t - start < 3800) raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return html`<canvas ref=${ref} class="confetti-canvas" aria-hidden="true"></canvas>`;
}

/** Pila de avisos breves. Uso: const [toasts, push] = useToasts(); */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = (text, { kind = 'info', ms = 3200, icon } = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, text, kind, icon: icon ?? (kind === 'error' ? 'x' : null) }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  };
  return [toasts, push];
}

export function Toasts({ toasts }) {
  return html`<div class="toast-stack" role="status" aria-live="polite">
    ${toasts.map((t) => html`<div key=${t.id} class=${`toast ${t.kind === 'error' ? 'error' : ''}`}>
      ${t.icon ? html`<span class="toast-icon"><${Icon} name=${t.icon} size=${16} /></span>` : null}<span>${t.text}</span>
    </div>`)}
  </div>`;
}

export function ConnectionBanner({ status }) {
  if (status !== 'reconnecting' && status !== 'connecting') return null;
  return html`<div class="conn-banner" role="status"><span class="spinner"></span>${status === 'connecting' ? 'Conectando…' : 'Reconectando… tu progreso está a salvo'}</div>`;
}

export function Footer() {
  return html`<p class="footer-note">Análisis Cuantitativo de Datos · Tecnología en Desarrollo de Software · UNIMINUTO</p>`;
}

export function SoundToggle({ muted, onToggle }) {
  return html`<button class="icon-btn" onClick=${onToggle} aria-label=${muted ? 'Activar sonido' : 'Silenciar'} title=${muted ? 'Activar sonido' : 'Silenciar'}>
    <${Icon} name=${muted ? 'mute' : 'sound'} size=${20} />
  </button>`;
}
