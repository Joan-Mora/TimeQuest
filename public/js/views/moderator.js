import { html, useEffect, useState } from '../lib/html.js';
import { api, download, useConnection, useKeepAlive } from '../lib/connection.js';
import { remainingFor, useTick } from '../lib/clock.js';
import { LOCKS, grade, dec, mmss, phaseLabel, ordinal } from '../lib/format.js';
import { Avatar, Hearts, Icon, LevelIcon, MathText, Pins, Toasts, ConnectionBanner, useToasts } from '../components/ui.js';
import { BankEditor } from './moderator-bank.js';
import { speedBase } from './projector.js';
import { LockClocks, Legend, RankList, fromResults } from './spectator.js';

const KEY = 'erlab:modkey';
const ROOM = 'erlab:modroom';

export function ModeratorApp() {
  const [key, setKey] = useState(localStorage.getItem(KEY) || '');
  if (!key) return html`<${Login} onKey=${(k) => {
    localStorage.setItem(KEY, k);
    setKey(k);
  }} />`;
  return html`<${Panel} modKey=${key} onLogout=${() => {
    localStorage.removeItem(KEY);
    setKey('');
  }} />`;
}

export function Login({ onKey, error: initialError, label = 'Panel del moderador' }) {
  const [k, setK] = useState('');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const res = await api('/api/moderator/check', { method: 'POST', key: k });
    setBusy(false);
    if (!res.ok) return setError(res.error || 'Clave incorrecta.');
    onKey(k);
  }
  return html`<div class="theme-dark"><form class="cover" onSubmit=${submit}>
    <span class="pill">${label}</span>
    <h1 class="cover-title">El Laboratorio <span>Sellado</span></h1>
    <div class="card stack">
      <div class="field">
        <label for="k">Clave del moderador</label>
        <input id="k" class="input" type="password" autocomplete="current-password" value=${k} onInput=${(e) => setK(e.target.value)} />
      </div>
      ${error ? html`<div class="error-box">${error}</div>` : null}
      <button class="btn block lg" disabled=${!k || busy}>Entrar</button>
      <p class="small muted" style="margin:0">La clave se define con la variable de entorno <code>MODERATOR_KEY</code>.</p>
    </div>
  </form></div>`;
}

function Panel({ modKey, onLogout }) {
  const [toasts, toast] = useToasts();
  const [code, setCode] = useState(localStorage.getItem(ROOM) || '');
  const conn = useConnection({ role: 'moderator', key: modKey }, {
    onEvent: (ev) => {
      if (ev.type === 'opened') toast(`«${ev.name}» abrió el candado ${ev.lock} (${ordinal(ev.seq)})`, { icon: 'unlock' });
      if (ev.type === 'timeout') toast(`Tiempo agotado: «${ev.name}»`, { icon: 'clock' });
    },
  });
  useKeepAlive(true);

  useEffect(() => {
    if (conn.status !== 'online' || !code) return;
    conn.call('mod:watch', { code }).then((r) => {
      if (!r.ok) {
        localStorage.removeItem(ROOM);
        setCode('');
      }
    });
  }, [conn.status, code]);

  if (conn.fatal?.code === 'CLAVE_INVALIDA') {
    localStorage.removeItem(KEY);
    return html`<${Login} error="La clave guardada ya no es válida." onKey=${(k) => {
      localStorage.setItem(KEY, k);
      location.reload();
    }} />`;
  }

  const act = async (event, payload, okMsg) => {
    const res = await conn.call(event, payload);
    if (!res.ok) toast(res.error, { kind: 'error', ms: 5000 });
    else if (okMsg) toast(okMsg, { icon: 'check' });
    return res;
  };

  const choose = (c) => {
    localStorage.setItem(ROOM, c);
    setCode(c);
  };

  const mod = conn.mod && conn.mod.code === code ? conn.mod : null;
  const leave = () => {
    localStorage.removeItem(ROOM);
    setCode('');
  };

  let body;
  if (!code) body = html`<${RoomPicker} conn=${conn} onChoose=${choose} onLogout=${onLogout} act=${act} />`;
  else if (!mod) {
    body = html`<div class="cover notice">
      <span class="pill">Sala ${code}</span>
      <p class="muted waiting-dots">Abriendo sala</p>
      <button class="btn sm secondary" onClick=${leave}><${Icon} name="back" size=${14} /> Ver mis salas</button>
    </div>`;
  } else body = html`<${RoomPanel} mod=${mod} act=${act} modKey=${modKey} toast=${toast} onLeave=${leave} />`;

  return html`<div class="theme-dark mod-app">
    ${body}
    <${Toasts} toasts=${toasts} />
    <${ConnectionBanner} status=${conn.status} />
  </div>`;
}

// ---------------------------------------------------------------------------
// Inicio: crear o abrir una sala
// ---------------------------------------------------------------------------
const HOW = [
  ['plus', 'Crea la sala', 'Recibes un código de 5 letras.'],
  ['monitor', 'Proyecta el QR', 'Los estudiantes entran desde el celular.'],
  ['users', 'Arma los equipos', 'Al azar con un toque; ajusta a mano.'],
  ['play', 'Inicia y sigue el ranking', 'Los 4 candados arrancan a la vez.'],
];

function RoomPicker({ conn, onChoose, onLogout, act }) {
  const [rooms, setRooms] = useState(null);
  const [title, setTitle] = useState('El Laboratorio Sellado');
  const refresh = () => conn.call('mod:listRooms').then((r) => r.ok && setRooms(r.rooms));
  useEffect(() => {
    if (conn.status === 'online') refresh();
  }, [conn.status]);

  async function create(e) {
    e.preventDefault();
    const res = await act('mod:createRoom', { title });
    if (res.ok) onChoose(res.code);
  }

  return html`<div class="mod-home">
    <header class="row between nowrap">
      <span class="pill">Panel del moderador</span>
      <button class="btn sm secondary" onClick=${onLogout}><${Icon} name="logout" size=${14} /> Salir</button>
    </header>
    <div class="mod-hero">
      <h1 class="cover-title">El Laboratorio <span>Sellado</span></h1>
      <p class="muted">Escape Room Estadístico · Análisis Cuantitativo de Datos</p>
    </div>
    <div class="mod-home-grid">
      <form class="card stack" onSubmit=${create}>
        <h2 class="sec-title"><span class="sec-icon"><${Icon} name="plus" size=${16} /></span>Nueva sala</h2>
        <div class="field"><label for="rt">Título (se ve en el proyector)</label>
          <input id="rt" class="input" value=${title} maxlength="60" onInput=${(e) => setTitle(e.target.value)} /></div>
        <button class="btn lg block" disabled=${conn.status !== 'online' || !title.trim()}>Crear sala <${Icon} name="play" size=${14} /></button>
        <ol class="how-steps">
          ${HOW.map(([icon, t, d], i) => html`<li>
            <span class="how-num">${i + 1}</span>
            <span><b>${t}</b><span class="tiny muted">${d}</span></span>
            <span class="how-icon"><${Icon} name=${icon} size=${18} /></span>
          </li>`)}
        </ol>
      </form>
      <section class="card stack sm">
        <div class="card-title">
          <h2 class="sec-title"><span class="sec-icon"><${Icon} name="lock" size=${16} /></span>Salas guardadas</h2>
          <button class="btn sm secondary" onClick=${refresh}><${Icon} name="sync" size=${14} /> Actualizar</button>
        </div>
        ${rooms === null ? html`<p class="muted">Cargando…</p>` : null}
        ${rooms?.length === 0 ? html`<div class="empty"><${Icon} name="lock" size=${28} /><span>Aún no hay salas. Crea la primera a la izquierda.</span></div>` : null}
        <div class="room-list">
          ${rooms?.map((r) => html`<div class="room-item">
            <span class="room-code">${r.code}</span>
            <span class="grow room-info">
              <b>${r.title}</b>
              <span class="row" style="gap:.4rem"><${PhasePill} phase=${r.phase} /><span class="tiny muted">${r.players} jugador${r.players === 1 ? '' : 'es'}</span></span>
            </span>
            <button class="btn sm" onClick=${() => onChoose(r.code)}>Abrir</button>
            <button class="icon-btn danger-ghost" title="Eliminar sala" aria-label=${`Eliminar la sala ${r.code}`} onClick=${async () => {
              if (confirm(`¿Eliminar la sala ${r.code}? Se pierden sus resultados.`)) {
                await act('mod:deleteRoom', { code: r.code });
                refresh();
              }
            }}><${Icon} name="trash" size=${18} /></button>
          </div>`)}
        </div>
      </section>
    </div>
  </div>`;
}

function PhasePill({ phase }) {
  return html`<span class=${`pill phase-pill ph-${phase}`}>${phaseLabel(phase)}</span>`;
}

// ---------------------------------------------------------------------------
// Panel de una sala
// ---------------------------------------------------------------------------
const NAV = [
  { id: 'teams', label: 'Sala', title: 'Sala y equipos', icon: 'users' },
  { id: 'game', label: 'En vivo', title: 'Partida en vivo', icon: 'bolt' },
  { id: 'results', label: 'Resultados', title: 'Resultados', icon: 'trophy' },
  { id: 'bank', label: 'Preguntas', title: 'Banco de preguntas', icon: 'book' },
  { id: 'config', label: 'Ajustes', title: 'Ajustes de la sala', icon: 'gear' },
];

function navBadge(id, mod) {
  if (id === 'teams' && mod.phase === 'lobby') {
    const unassigned = mod.players.filter((p) => !p.teamId).length;
    return unassigned ? { text: unassigned, warn: true } : null;
  }
  if (id === 'game' && mod.phase === 'running') return { text: '', live: true };
  if (id === 'results' && mod.phase === 'finished' && !mod.podiumRevealed) return { text: '!', warn: true };
  return null;
}

function RoomPanel({ mod, act, modKey, toast, onLeave }) {
  const [tab, setTab] = useState(mod.phase === 'lobby' ? 'teams' : mod.phase === 'finished' ? 'results' : 'game');
  useEffect(() => {
    if (mod.phase === 'running') setTab((t) => (t === 'teams' ? 'game' : t));
    if (mod.phase === 'finished') setTab((t) => (t === 'game' ? 'results' : t));
  }, [mod.phase]);
  const go = (id) => {
    setTab(id);
    window.scrollTo({ top: 0 });
  };

  const joinUrl = `${location.origin}/?sala=${mod.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast('Enlace copiado', { icon: 'link' });
    } catch {
      prompt('Copia el enlace:', joinUrl);
    }
  };
  const online = mod.players.filter((p) => p.online).length;
  const current = NAV.find((n) => n.id === tab);
  const flowTab = tab === 'teams' || tab === 'game' || tab === 'results';

  const NavItems = ({ cls }) => NAV.map((n) => {
    const badge = navBadge(n.id, mod);
    return html`<button class=${`${cls} ${tab === n.id ? 'active' : ''}`} aria-current=${tab === n.id ? 'page' : null} onClick=${() => go(n.id)}>
      <span class="nav-icon"><${Icon} name=${n.icon} size=${20} />${badge ? html`<span class=${`nav-badge ${badge.live ? 'live' : ''} ${badge.warn ? 'warn' : ''}`}>${badge.text}</span>` : null}</span>
      <span class="nav-label">${n.label}</span>
    </button>`;
  });

  return html`<div class="mod-shell">
    <aside class="mod-side">
      <button class="side-back" onClick=${onLeave}><${Icon} name="back" size=${16} /> Mis salas</button>
      <div class="side-room">
        <span class="tiny muted">Código de la sala</span>
        <button class="side-code" onClick=${copy} title="Copiar enlace de acceso">${mod.code}</button>
        <div class="small side-title">${mod.title}</div>
        <div class="row" style="gap:.4rem"><${PhasePill} phase=${mod.phase} /><span class="tiny muted">${online}/${mod.players.length} conectados</span></div>
      </div>
      <nav class="side-nav" aria-label="Secciones"><${NavItems} cls="side-item" /></nav>
      <div class="side-links">
        <span class="tiny muted">Pantallas</span>
        <${QuickLinks} mod=${mod} copy=${copy} />
      </div>
    </aside>

    <div class="mod-main">
      <header class="mod-top">
        <button class="icon-btn mobile-only" onClick=${onLeave} title="Mis salas" aria-label="Volver a mis salas"><${Icon} name="back" size=${18} /></button>
        <div class="top-id">
          <button class="top-code mobile-only" onClick=${copy} title="Copiar enlace de acceso">${mod.code}</button>
          <h1 class="top-title desktop-only">${current.title}</h1>
        </div>
        <span class="mobile-only"><${PhasePill} phase=${mod.phase} /></span>
        <span class="top-count desktop-only"><${Icon} name="users" size=${16} /> ${online}/${mod.players.length} conectados · ${mod.config.mode === 'chaos' ? 'Modo Caos' : `${mod.teams.length} equipos`}</span>
        <span class="grow"></span>
        <${PrimaryAction} mod=${mod} act=${act} />
      </header>

      <main class="mod-body">
        ${mod.autoPaused ? html`<div class="warn-box">El servidor se reinició y la partida quedó en pausa automáticamente. El progreso está intacto: pulsa <b>Reanudar</b> cuando todos estén conectados.</div>` : null}
        ${flowTab ? html`<${FlowGuide} mod=${mod} act=${act} tab=${tab} go=${go} />` : null}
        ${flowTab ? html`<div class="quick-row mobile-only"><${QuickLinks} mod=${mod} copy=${copy} /></div>` : html`<h2 class="page-title mobile-only">${current.title}</h2>`}
        ${tab === 'teams' ? html`<${TeamsTab} mod=${mod} act=${act} copy=${copy} joinUrl=${joinUrl} />` : null}
        ${tab === 'game' ? html`<${GameTab} mod=${mod} act=${act} />` : null}
        ${tab === 'config' ? html`<${ConfigTab} mod=${mod} act=${act} />` : null}
        ${tab === 'bank' ? html`<${BankEditor} act=${act} modKey=${modKey} running=${mod.phase !== 'lobby'} />` : null}
        ${tab === 'results' ? html`<${ResultsTab} mod=${mod} modKey=${modKey} toast=${toast} />` : null}
      </main>
    </div>

    <nav class="mod-bottom" aria-label="Secciones"><${NavItems} cls="bottom-item" /></nav>
  </div>`;
}

function QuickLinks({ mod, copy }) {
  return html`<div class="quick-links">
    <a class="quick-link" href=${`/proyector?sala=${mod.code}`} target="_blank" rel="noopener"><${Icon} name="monitor" size=${16} /> Proyector</a>
    <a class="quick-link" href=${`/espectador?sala=${mod.code}`} target="_blank" rel="noopener"><${Icon} name="trend" size=${16} /> Ranking en vivo</a>
    <button class="quick-link" onClick=${copy}><${Icon} name="link" size=${16} /> Copiar enlace</button>
  </div>`;
}

function PrimaryAction({ mod, act }) {
  // El botón cambia de función en el mismo lugar (Iniciar → Pausar): un doble toque no debe pausar.
  const [cooling, setCooling] = useState(true);
  useEffect(() => {
    setCooling(true);
    const t = setTimeout(() => setCooling(false), 1500);
    return () => clearTimeout(t);
  }, [mod.phase, mod.podiumRevealed]);

  const Label = ({ long, short }) => html`<span class="lbl-long">${long}</span><span class="lbl-short">${short}</span>`;
  if (mod.phase === 'lobby') {
    const n = mod.players.length;
    const chaos = mod.config.mode === 'chaos';
    const ready = chaos ? n > 1 : n > 0 && mod.teams.length > 0 && mod.players.every((p) => p.teamId);
    return html`<button class=${`btn primary-action ${ready && !cooling ? 'glow' : ''}`} disabled=${n === 0 || cooling} onClick=${() => {
      const unassigned = mod.players.filter((p) => !p.teamId).length;
      const msg = chaos
        ? `¿Iniciar el Caos con ${n} jugador${n === 1 ? '' : 'es'}? Cada uno compite solo con ${mod.config.chaosLives} vidas.`
        : mod.teams.length === 0
        ? `No hay equipos: se armarán automáticamente con ${n} jugadores. ¿Iniciar?`
        : unassigned ? `${unassigned} jugador(es) sin equipo se ubicarán en los equipos más pequeños. ¿Iniciar?` : '¿Iniciar la partida? Los cuatro candados arrancan a la vez.';
      if (confirm(msg)) act('mod:start', {}, chaos ? '¡Que empiece el Caos!' : '¡Partida iniciada!');
    }}><${Icon} name=${chaos ? 'bolt' : 'play'} size=${16} /><${Label} long=${chaos ? 'Iniciar Caos' : 'Iniciar partida'} short="Iniciar" /></button>`;
  }
  if (mod.phase === 'running') return html`<button class="btn primary-action secondary" disabled=${cooling} onClick=${() => act('mod:pause')}><${Icon} name="pause" size=${16} /><${Label} long="Pausar" short="Pausar" /></button>`;
  if (mod.phase === 'paused') return html`<button class="btn primary-action teal glow" disabled=${cooling} onClick=${() => act('mod:resume')}><${Icon} name="play" size=${16} /><${Label} long="Reanudar" short="Reanudar" /></button>`;
  if (mod.phase === 'finished' && !mod.podiumRevealed) return html`<button class="btn primary-action glow" disabled=${cooling} onClick=${() => act('mod:revealPodium', {}, '¡Podio revelado!')}><${Icon} name="trophy" size=${16} /><${Label} long="Revelar podio" short="Podio" /></button>`;
  return html`<button class="btn primary-action secondary" disabled=${cooling} onClick=${() => act('mod:hidePodium')}><${Label} long="Ocultar podio" short="Ocultar" /></button>`;
}

// ---------------------------------------------------------------------------
// Guía de la clase: en qué paso vas y qué sigue
// ---------------------------------------------------------------------------
function flowFor(mod) {
  const players = mod.players.length;
  const unassigned = mod.players.filter((p) => !p.teamId).length;
  const lobby = mod.phase === 'lobby';
  const chaos = mod.config.mode === 'chaos';
  const steps = [
    { label: 'Invitar', done: players > 0 || !lobby },
    chaos
      ? { label: 'Caos', done: !lobby || players > 1 }
      : { label: 'Equipos', done: !lobby || (players > 0 && mod.teams.length > 0 && unassigned === 0) },
    { label: 'Jugar', done: mod.phase === 'finished' },
    { label: 'Resultados', done: !!mod.podiumRevealed },
  ];
  const at = steps.findIndex((s) => !s.done);
  const current = at === -1 ? 3 : at;

  let hint;
  if (lobby && players === 0) hint = { title: 'Invita a los estudiantes', text: html`Proyecta el QR o comparte el enlace. Entran desde el celular con el código <b class="gold">${mod.code}</b>.`, cta: 'projector' };
  else if (lobby && chaos && players === 1) hint = { title: '1 estudiante en la sala', text: 'El Caos es todos contra todos: espera a que entren más jugadores antes de iniciar.' };
  else if (lobby && chaos) hint = { title: `¡Caos listo con ${players} jugadores!`, text: `Cada uno juega solo con ${mod.config.chaosLives} vidas y las preguntas de los 4 temas mezcladas. Quien llegue tarde entra con el reloj que quede.` };
  else if (mod.phase === 'running' && chaos) hint = { title: 'Caos en curso', text: 'Sigue quién sigue en pie y el ranking en vivo. Puedes pausar o dar tiempo extra a todos.', cta: 'game' };
  else if (lobby && mod.teams.length === 0) hint = { title: `${players} estudiante${players === 1 ? '' : 's'} en la sala`, text: `Repártelos al azar en equipos de hasta ${mod.config.teamSize}; después puedes moverlos a mano. Si esperas a más, no pasa nada: quien llegue tarde se ubica solo.`, cta: 'assign' };
  else if (lobby && unassigned) hint = { title: `${unassigned} sin equipo`, text: 'Muévelos a un equipo o pulsa «Iniciar partida»: se ubicarán en los equipos más pequeños.' };
  else if (lobby) hint = { title: '¡Todo listo!', text: `${mod.teams.length} equipos con ${players} estudiantes. Cuando des la señal, pulsa «Iniciar partida».` };
  else if (mod.phase === 'running') hint = { title: 'Partida en curso', text: 'Sigue el avance y el ranking en vivo. Puedes pausar o dar tiempo extra a un candado.', cta: 'game' };
  else if (mod.phase === 'paused') hint = { title: 'Partida en pausa', text: 'Los relojes están detenidos. Pulsa «Reanudar» cuando todos estén listos.', cta: 'game' };
  else if (!mod.podiumRevealed && chaos) hint = { title: '¡El Caos terminó!', text: 'Revela el podio en el proyector cuando quieras; luego abre el minuto de debate.', cta: 'results' };
  else if (!mod.podiumRevealed) hint = { title: '¡Se cerraron los candados!', text: 'Revela el podio en el proyector cuando quieras; luego abre el minuto de debate.', cta: 'results' };
  else hint = { title: 'Cierre de la clase', text: 'Descarga las notas en CSV o imprime el informe para tu registro.', cta: 'results' };
  return { steps, current, hint };
}

function FlowGuide({ mod, act, tab, go }) {
  const { steps, current, hint } = flowFor(mod);
  let cta = null;
  if (hint.cta === 'projector') cta = html`<a class="btn sm" href=${`/proyector?sala=${mod.code}`} target="_blank" rel="noopener"><${Icon} name="monitor" size=${14} /> Abrir proyector</a>`;
  if (hint.cta === 'assign') cta = html`<button class="btn sm violet" onClick=${() => act('mod:autoAssign', { teamCount: mod.config.teamCount || 0 }, 'Equipos armados')}><${Icon} name="shuffle" size=${14} /> Armar equipos al azar</button>`;
  if (hint.cta === 'game' && tab !== 'game') cta = html`<button class="btn sm secondary" onClick=${() => go('game')}><${Icon} name="bolt" size=${14} /> Ver en vivo</button>`;
  if (hint.cta === 'results' && tab !== 'results') cta = html`<button class="btn sm secondary" onClick=${() => go('results')}><${Icon} name="trophy" size=${14} /> Ver resultados</button>`;

  return html`<section class="flow" aria-label="Guía de la clase">
    <ol class="flow-steps">
      ${steps.map((s, i) => html`<li class=${`flow-step ${s.done ? 'done' : ''} ${i === current && !s.done ? 'now' : ''}`}>
        <span class="flow-dot">${s.done ? html`<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>` : i + 1}</span>
        <span class="flow-label">${s.label}</span>
      </li>`)}
    </ol>
    <div class="flow-hint">
      <div class="grow">
        <b>${hint.title}</b>
        <p class="small muted">${hint.text}</p>
      </div>
      ${cta}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Sala y equipos
// ---------------------------------------------------------------------------
function InviteCard({ mod, copy, joinUrl, compact }) {
  const online = mod.players.filter((p) => p.online).length;
  const unassigned = mod.players.filter((p) => !p.teamId).length;
  const chaos = mod.config.mode === 'chaos';
  const alive = mod.teams.filter((t) => t.closedBy !== 'eliminated').length;
  const stats = chaos
    ? [
        ['En línea', online, ''],
        ['Inscritos', mod.players.length, ''],
        mod.phase === 'lobby' ? ['Vidas', mod.config.chaosLives, ''] : ['En pie', `${alive}/${mod.teams.length}`, ''],
        ['Preguntas', mod.locks[0]?.questionCount ?? '—', ''],
      ]
    : [
        ['En línea', online, ''],
        ['Inscritos', mod.players.length, ''],
        ['Equipos', mod.teams.length, ''],
        ['Sin equipo', unassigned, unassigned ? 'warn' : ''],
      ];
  const Stats = () => html`<div class="stat-row">
    ${stats.map(([k, v, cls]) => html`<div class=${`stat ${cls}`}><b>${v}</b><span>${k}</span></div>`)}
  </div>`;
  if (compact) return html`<${Stats} />`;
  return html`<section class="card invite">
    <div class="invite-qr"><img src=${`/api/rooms/${mod.code}/qr.svg?v=${mod.code}`} alt=${`Código QR para entrar a la sala ${mod.code}`} width="150" height="150" /></div>
    <div class="invite-info">
      <span class="label">Código de acceso</span>
      <div class="invite-code">${mod.code}</div>
      <button class="invite-url" onClick=${copy} title="Copiar enlace"><span>${joinUrl.replace(/^https?:\/\//, '')}</span><${Icon} name="link" size=${16} /></button>
      <${Stats} />
    </div>
  </section>`;
}

function ModeCard({ mod, act }) {
  const c = mod.config;
  const chaos = c.mode === 'chaos';
  const patch = (p, msg) => act('mod:updateConfig', { patch: p }, msg);
  const setMode = (mode) => {
    if (mode === c.mode) return;
    if (mode === 'chaos' && mod.teams.length && !confirm('En modo Caos no hay equipos: se desarman los equipos actuales. ¿Continuar?')) return;
    patch({ mode }, mode === 'chaos' ? 'Modo Caos activado' : 'Modo por equipos activado');
  };
  const lives = c.chaosLives ?? 3;
  const opts = [
    ['teams', 'users', 'Por equipos', `Equipos de hasta ${c.teamSize}, un candado por equipo. Votan juntos y el capitán confirma.`, 'c-l1'],
    ['chaos', 'bolt', 'Caos', 'Battle royale: todos contra todos, los 4 temas mezclados y vidas. Cada error cuesta una.', 'c-l0'],
  ];
  return html`<section class="card stack sm">
    <h2 class="sec-title"><span class="sec-icon"><${Icon} name="gear" size=${16} /></span>Modo de juego</h2>
    <div class="mode-grid" role="radiogroup" aria-label="Modo de juego">
      ${opts.map(([id, icon, title, desc, cls]) => html`<button role="radio" aria-checked=${c.mode === id} class=${`mode-opt ${cls} ${c.mode === id ? 'on' : ''}`} onClick=${() => setMode(id)}>
        <span class="mode-icon"><${Icon} name=${icon} size=${20} /></span>
        <span class="grow"><b>${title}</b><span class="small muted">${desc}</span></span>
      </button>`)}
    </div>
    ${chaos ? html`<div class="field-grid three">
      <div class="field"><label>Vidas por jugador</label>
        <div class="stepper" role="group" aria-label="Vidas por jugador">
          <button class="icon-btn xs" aria-label="Menos vidas" disabled=${lives <= 1} onClick=${() => patch({ chaosLives: lives - 1 })}><${Icon} name="minus" size=${14} /></button>
          <span class="stepper-val"><b>${lives}</b><span class="tiny muted"><${Hearts} total=${Math.min(lives, 5)} /></span></span>
          <button class="icon-btn xs" aria-label="Más vidas" disabled=${lives >= 10} onClick=${() => patch({ chaosLives: lives + 1 })}><${Icon} name="plus" size=${14} /></button>
        </div>
      </div>
      <div class="field"><label>Tiempo total (min)</label><input class="input" type="number" min="0.5" max="60" step="0.5" value=${(c.timeLimitsSec[0] ?? 900) / 60}
        onChange=${(e) => patch({ timeLimitsSec: { 0: Math.round(Number(e.target.value) * 60) } })} /></div>
      <div class="field"><label>Preguntas por tema</label><input class="input" type="number" min="1" max="10" value=${c.questionsPerLock}
        onChange=${(e) => patch({ questionsPerLock: Number(e.target.value) })} /></div>
    </div>
    <p class="tiny muted" style="margin:0">${mod.locks[0]?.questionCount ?? '—'} preguntas en total, intercaladas y barajadas por jugador. Nota individual con la misma fórmula: ${Math.round(c.scoring.weights.accuracy * 100)} % acierto + ${Math.round(c.scoring.weights.speed * 100)} % orden de llegada.</p>` : null}
  </section>`;
}

function ChaosPlayers({ mod, act }) {
  const lobby = mod.phase === 'lobby';
  const byPlayer = new Map(mod.teams.map((t) => [t.members[0]?.id, t]));
  return html`<section class="stack sm">
    <div class="sec-head"><h2 class="sec-title">Jugadores <span class="count">${mod.players.length}</span></h2></div>
    <p class="small muted" style="margin:0">${lobby ? 'En Caos no hay equipos: cada estudiante compite solo. Quien entre con la partida en curso se une con el reloj que quede.' : 'Cada jugador compite solo. Retirar a alguien lo saca también del ranking.'}</p>
    ${mod.players.length === 0
      ? html`<div class="empty"><${Icon} name="users" size=${30} /><span>Aún no hay jugadores. Cuando entren, aparecerán aquí.</span></div>`
      : html`<ul class="member-list chaos-roster">${mod.players.map((p) => {
          const t = byPlayer.get(p.id);
          return html`<li key=${p.id} class="member-row">
            <${Avatar} id=${p.id} name=${p.name} size=${28} online=${p.online} title=${p.online ? `${p.name} · conectado` : `${p.name} · desconectado`} />
            <span class=${`grow member-name ${p.online ? '' : 'off'}`}>${p.name}</span>
            ${t ? html`<${Hearts} lost=${t.livesLost} total=${t.lives ?? 3} />` : null}
            <button class="icon-btn xs danger-ghost" title="Retirar de la sala" aria-label=${`Retirar a ${p.name}`}
              onClick=${() => confirm(`¿Retirar a ${p.name} de la sala?`) && act('mod:kick', { playerId: p.id })}><${Icon} name="x" size=${14} /></button>
          </li>`;
        })}</ul>`}
  </section>`;
}

function TeamsTab({ mod, act, copy, joinUrl }) {
  const lobby = mod.phase === 'lobby';
  if (mod.config.mode === 'chaos') {
    return html`
      <${InviteCard} mod=${mod} copy=${copy} joinUrl=${joinUrl} compact=${!lobby} />
      ${lobby ? html`<${ModeCard} mod=${mod} act=${act} />` : null}
      <${ChaosPlayers} mod=${mod} act=${act} />
    `;
  }
  const [teamCount, setTeamCount] = useState(mod.config.teamCount || 0);
  const autoCount = Math.ceil(mod.players.length / mod.config.teamSize) || 0;
  const unassigned = mod.players.filter((p) => !p.teamId);
  const teamOptions = [['', 'Sin equipo'], ...mod.teams.map((t) => [t.id, t.name])];
  const clampCount = (n) => Math.max(0, Math.min(16, n));

  const PlayerLine = ({ p }) => html`<li class="member-row">
    <${Avatar} id=${p.id} name=${p.name} size=${28} online=${p.online} title=${p.online ? `${p.name} · conectado` : `${p.name} · desconectado`} />
    <span class=${`grow member-name ${p.online ? '' : 'off'}`} title=${p.online ? p.name : `${p.name} · desconectado`}>${p.name}</span>
    <select class="select xs" aria-label=${`Mover a ${p.name}`} value=${p.teamId || ''} disabled=${mod.phase === 'finished'}
      onChange=${(e) => act('mod:movePlayer', { playerId: p.id, teamId: e.target.value || null })}>
      ${teamOptions.map(([id, name]) => html`<option value=${id}>${name}</option>`)}
    </select>
    <button class="icon-btn xs danger-ghost" title="Retirar de la sala" aria-label=${`Retirar a ${p.name}`}
      onClick=${() => confirm(`¿Retirar a ${p.name} de la sala?`) && act('mod:kick', { playerId: p.id })}><${Icon} name="x" size=${14} /></button>
  </li>`;

  return html`
    <${InviteCard} mod=${mod} copy=${copy} joinUrl=${joinUrl} compact=${!lobby} />
    ${lobby ? html`<${ModeCard} mod=${mod} act=${act} />` : null}
    <section class="stack sm">
      <div class="sec-head">
        <h2 class="sec-title">Equipos <span class="count">${mod.teams.length}</span></h2>
        ${lobby ? html`<div class="team-tools">
          <div class="stepper" role="group" aria-label="Número de equipos">
            <button class="icon-btn xs" aria-label="Menos equipos" onClick=${() => setTeamCount((n) => clampCount(n - 1))} disabled=${teamCount <= 0}><${Icon} name="minus" size=${14} /></button>
            <span class="stepper-val"><b>${teamCount || 'Auto'}</b><span class="tiny muted">${teamCount ? 'equipos' : `${autoCount} equipos`}</span></span>
            <button class="icon-btn xs" aria-label="Más equipos" onClick=${() => setTeamCount((n) => clampCount(n + 1))} disabled=${teamCount >= 16}><${Icon} name="plus" size=${14} /></button>
          </div>
          <button class="btn sm violet" disabled=${mod.players.length === 0} onClick=${() => {
            if (mod.teams.length === 0 || confirm('Esto rearma todos los equipos. ¿Continuar?')) act('mod:autoAssign', { teamCount }, 'Equipos armados');
          }}><${Icon} name="shuffle" size=${14} /> Armar al azar</button>
          <button class="btn sm secondary" onClick=${() => act('mod:addTeam')} title="Añadir un equipo vacío" aria-label="Añadir un equipo vacío"><${Icon} name="plus" size=${14} /><span class="lbl-long">Equipo</span></button>
        </div>` : null}
      </div>
      <p class="small muted" style="margin:0">${lobby
        ? `«Armar al azar» reparte a todos en equipos parejos (máximo ${mod.config.teamSize}) y asigna los candados en rotación 1 → 2 → 3 → 4. Luego puedes mover a cualquiera con su menú.`
        : 'La partida ya empezó: puedes mover jugadores entre equipos (el progreso queda en el equipo), pero no crear ni borrar equipos.'}</p>

      ${unassigned.length ? html`<div class="bench">
        <div class="bench-head"><${Icon} name="users" size=${16} /> <b>Sin equipo (${unassigned.length})</b></div>
        <ul class="member-list">${unassigned.map((p) => html`<${PlayerLine} key=${p.id} p=${p} />`)}</ul>
      </div>` : null}

      ${mod.teams.length === 0
        ? html`<div class="empty"><${Icon} name="users" size=${30} /><span>${mod.players.length ? 'Aún no hay equipos. Usa «Armar al azar» o crea uno vacío.' : 'Aún no hay jugadores. Cuando entren, aparecerán aquí.'}</span></div>`
        : html`<div class="team-grid">
          ${mod.teams.map((t) => html`<article key=${t.id} class=${`team-card c-${LOCKS[t.lock].key}`}>
            <header class="team-card-head">
              <${LevelIcon} lock=${t.lock} size=${34} number=${false} />
              <input class="team-name" value=${t.name} maxlength="32" aria-label="Nombre del equipo" title="Toca para renombrar"
                onChange=${(e) => act('mod:renameTeam', { teamId: t.id, name: e.target.value })} />
              ${lobby ? html`<button class="icon-btn xs danger-ghost" title="Eliminar equipo" aria-label=${`Eliminar ${t.name}`}
                onClick=${() => confirm(`¿Eliminar «${t.name}»? Sus integrantes quedan sin equipo.`) && act('mod:deleteTeam', { teamId: t.id })}><${Icon} name="trash" size=${16} /></button>` : null}
            </header>
            <div class="team-card-meta">
              <select class="select xs lock-select" disabled=${!lobby} value=${t.lock} aria-label="Candado"
                onChange=${(e) => act('mod:setTeamLock', { teamId: t.id, lock: Number(e.target.value) })}>
                ${[1, 2, 3, 4].map((l) => html`<option value=${l}>Candado ${l} · ${LOCKS[l].short}</option>`)}
              </select>
              <span class="tiny muted">${t.members.length} integrante${t.members.length === 1 ? '' : 's'}</span>
            </div>
            ${t.members.length
              ? html`<ul class="member-list">${mod.players.filter((p) => p.teamId === t.id).map((p) => html`<${PlayerLine} key=${p.id} p=${p} />`)}</ul>`
              : html`<p class="tiny muted" style="margin:0">Equipo vacío (se descarta al iniciar).</p>`}
          </article>`)}
        </div>`}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Partida en vivo
// ---------------------------------------------------------------------------
function GameTab({ mod, act }) {
  useTick(500, mod.phase === 'running');
  const [lock, setLock] = useState('all');
  const inGame = mod.phase === 'running' || mod.phase === 'paused';
  const finished = mod.phase === 'finished' && mod.results;
  const nameOf = (id) => mod.players.find((p) => p.id === id)?.name ?? '—';
  const chaos = mod.config.mode === 'chaos';
  const usedLocks = chaos ? [] : [...new Set(mod.teams.map((t) => t.lock))].sort();

  if (mod.phase === 'lobby') {
    return html`<div class="empty big">
      <${Icon} name="bolt" size=${36} />
      <b>La partida aún no empieza</b>
      <span>Cuando pulses «Iniciar partida», aquí verás los relojes, el avance de cada equipo y el ranking en vivo.</span>
    </div>`;
  }

  const rows = finished ? fromResults(mod.results) : mod.live?.teams ?? [];
  const weights = finished ? mod.results.teams[0]?.breakdown.weights : mod.live?.weights;

  return html`
    <section class="card control-bar">
      ${inGame ? html`<div class="ctrl-group">
        <span class="label">Tiempo</span>
        <div class="seg" role="radiogroup" aria-label="Candado al que se ajusta el tiempo">
          <button role="radio" aria-checked=${lock === 'all'} class=${`seg-btn ${lock === 'all' ? 'on' : ''}`} onClick=${() => setLock('all')}>Todos</button>
          ${usedLocks.map((l) => html`<button role="radio" aria-checked=${String(lock) === String(l)} class=${`seg-btn c-${LOCKS[l].key} ${String(lock) === String(l) ? 'on' : ''}`} onClick=${() => setLock(l)}>C${l}</button>`)}
        </div>
        <div class="row" style="gap:.4rem">
          <button class="btn sm secondary" onClick=${() => act('mod:addTime', { lock, seconds: -30 })}>−30 s</button>
          <button class="btn sm secondary" onClick=${() => act('mod:addTime', { lock, seconds: 30 })}>+30 s</button>
          <button class="btn sm secondary" onClick=${() => act('mod:addTime', { lock, seconds: 60 })}>+1 min</button>
        </div>
      </div>` : html`<p class="small muted grow" style="margin:0">${chaos ? 'Caos terminado. Puedes reiniciarlo para jugar otra ronda con los mismos jugadores.' : 'Partida terminada. Puedes reiniciarla para jugar otra ronda con los mismos equipos.'}</p>`}
      <div class="ctrl-group end">
        ${inGame ? html`<button class="btn sm danger" onClick=${() => confirm(chaos ? '¿Terminar el Caos ahora? Cada jugador queda con lo que haya respondido.' : '¿Terminar la partida ahora? Los candados abiertos se cierran con lo respondido.') && act('mod:end')}><${Icon} name="flag" size=${14} /> Terminar</button>` : null}
        <button class="btn sm secondary" onClick=${() => confirm(chaos ? '¿Reiniciar? Se borra el progreso y vuelven al lobby (se conservan los jugadores).' : '¿Reiniciar? Se borra el progreso y vuelven al lobby (se conservan jugadores y equipos).') && act('mod:reset', {}, 'De vuelta al lobby')}><${Icon} name="rotate" size=${14} /> Reiniciar</button>
      </div>
    </section>
    ${inGame ? html`<${LockClocks} mod=${mod} />` : null}

    <div class="live-grid">
      <section class="stack sm">
        <h2 class="sec-title">${finished ? 'Ranking final' : 'Ranking en vivo'}</h2>
        <${RankList} rows=${rows} live=${!finished} />
        ${weights ? html`<${Legend} weights=${weights} live=${!finished} nextSpeed=${mod.live?.nextSpeed} />` : null}
      </section>
      <section class="stack sm">
        <h2 class="sec-title">${chaos ? 'Avance por jugador' : 'Avance por equipo'}</h2>
        <div class="prog-grid">
          ${mod.teams.map((t) => {
            const answers = t.answers.map((a) => ({ correct: a.correct }));
            const state = t.opened ? 'opened' : t.closedBy ? 'closed' : '';
            const closedPill = t.closedBy === 'eliminated'
              ? html`<span class="pill bad"><${Icon} name="x" size=${13} />Eliminado</span>`
              : html`<span class="pill ghost"><${Icon} name=${t.closedBy === 'time' ? 'clock' : 'lock'} size=${13} />${t.closedBy === 'time' ? 'Tiempo' : 'Cerrado'}</span>`;
            return html`<article key=${t.id} class=${`prog-card c-${LOCKS[t.lock].key} ${state}`}>
              <div class="row between nowrap">
                <div class="row nowrap" style="min-width:0;gap:.5rem">${t.solo
                  ? html`<${Avatar} id=${t.members[0]?.id} name=${t.name} size=${28} online=${t.members[0]?.online} />`
                  : html`<${LevelIcon} lock=${t.lock} size=${28} number=${false} />`}<b class="prog-name">${t.name}</b></div>
                ${t.opened ? html`<span class="pill ok"><${Icon} name="unlock" size=${13} />${ordinal(t.finishSeq)}</span>`
                  : t.closedBy ? closedPill
                  : t.solo ? html`<${Hearts} lost=${t.livesLost} total=${t.lives ?? 3} />`
                  : html`<b class="num gold">${mmss(remainingFor(mod, t.lock))}</b>`}
              </div>
              <${Pins} total=${t.total} answers=${answers} current=${t.closedBy === null && !t.opened ? t.currentIndex : null} />
              <div class="small row between"><span>Aciertos <b>${t.correct ?? 0}/${t.total}</b></span><span class="muted">${t.solo ? `Vidas ${Math.max(0, (t.lives ?? 0) - t.livesLost)}/${t.lives ?? '—'}` : `XP ${t.xp ?? 0}`}</span></div>
              ${t.currentPrompt ? html`<div class="tiny muted clamp-2">P${t.currentIndex + 1}: <${MathText} text=${t.currentPrompt} /></div>` : null}
              ${t.solo ? null : html`<div class="row" style="gap:.3rem">
                ${t.members.map((m) => html`<${Avatar} id=${m.id} name=${m.name} size=${26} online=${m.online} captain=${m.id === t.captainId} />`)}
                ${t.captainId ? html`<span class="tiny muted">Capitán: ${nameOf(t.captainId)} · ${t.votesCount} voto(s)</span>` : null}
              </div>`}
            </article>`;
          })}
        </div>
      </section>
    </div>
    <details class="card log-card">
      <summary><span class="chev"><${Icon} name="chevron" size=${14} /></span><b>Bitácora</b> <span class="tiny muted">(${mod.log.length} eventos)</span></summary>
      <div class="log">${[...mod.log].reverse().map((l) => html`<div><span class="muted num">${new Date(l.at).toLocaleTimeString('es-CO')}</span> ${l.text}</div>`)}</div>
    </details>
  `;
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------
function ConfigTab({ mod, act }) {
  const c = mod.config;
  const lobby = mod.phase === 'lobby';
  const patch = (p) => act('mod:updateConfig', { patch: p });
  const accPct = Math.round(c.scoring.weights.accuracy * 100);
  const [accDraft, setAccDraft] = useState(accPct);
  useEffect(() => setAccDraft(accPct), [accPct]);
  const w = { accuracy: accDraft / 100, speed: 1 - accDraft / 100 };
  const scen = [
    ['1.º en abrir con 3/5', 3, 1],
    ['1.º en abrir con 5/5', 5, 1],
    ['4.º en abrir con 5/5', 5, 4],
    ['2.º en abrir con 4/5', 4, 2],
    ['Tiempo agotado con 4/5', 4, null],
  ].map(([label, correct, pos]) => {
    const speed = pos ? speedBase(c.scoring, pos) : c.scoring.timeoutSpeed;
    return { label, score: w.accuracy * (correct * 20 / 20) + w.speed * speed, speed, correct };
  });
  const Toggle = ({ checked, disabled, onChange, title, desc }) => html`<label class=${`toggle-row ${disabled ? 'disabled' : ''}`}>
    <span class="grow"><b>${title}</b><span class="small muted">${desc}</span></span>
    <input type="checkbox" class="switch" checked=${checked} disabled=${disabled} onChange=${(e) => onChange(e.target.checked)} />
  </label>`;

  return html`
    ${mod.phase === 'finished'
      ? html`<div class="warn-box small">La partida terminó: el tamaño de equipos, las preguntas y los tiempos quedan fijos hasta reiniciar. Los pesos de la nota sí se pueden ajustar y las notas se recalculan al instante.</div>`
      : !lobby ? html`<div class="warn-box small">La partida está en curso: el tamaño de equipos, las preguntas por candado y los tiempos quedan fijos (usa el tiempo extra en «En vivo»). Los pesos de la nota sí se pueden ajustar.</div>` : null}
    <div class="config-grid">
      <section class="card stack">
        <h2 class="sec-title"><span class="sec-icon"><${Icon} name="users" size=${16} /></span>Sala</h2>
        <div class="field"><label>Título (proyector)</label><input class="input" value=${c.title} maxlength="60" onChange=${(e) => patch({ title: e.target.value })} /></div>
        <div class="field-grid">
          <div class="field"><label>Tamaño de equipo</label><input class="input" type="number" min="1" max="12" value=${c.teamSize} disabled=${!lobby} onChange=${(e) => patch({ teamSize: Number(e.target.value) })} /></div>
          <div class="field"><label>Equipos (0 = auto)</label><input class="input" type="number" min="0" max="16" value=${c.teamCount} disabled=${!lobby} onChange=${(e) => patch({ teamCount: Number(e.target.value) })} /></div>
          <div class="field"><label>Preguntas por candado</label><input class="input" type="number" min="1" max="10" value=${c.questionsPerLock} disabled=${!lobby} onChange=${(e) => patch({ questionsPerLock: Number(e.target.value) })} /></div>
        </div>
        <div class="stack sm">
          <span class="label">Tiempo por candado (minutos)</span>
          <div class="field-grid four">
            ${[1, 2, 3, 4].map((l) => html`<div class=${`field lock-field c-${LOCKS[l].key}`}><label>C${l} · ${LOCKS[l].short}</label>
              <input class="input" type="number" min="0.5" max="60" step="0.5" value=${c.timeLimitsSec[l] / 60} disabled=${!lobby}
                onChange=${(e) => patch({ timeLimitsSec: { [l]: Math.round(Number(e.target.value) * 60) } })} /></div>`)}
          </div>
        </div>
      </section>

      <section class="card stack">
        <h2 class="sec-title"><span class="sec-icon"><${Icon} name="check" size=${16} /></span>Reglas del juego</h2>
        <div class="stack sm" role="radiogroup" aria-label="Retroalimentación">
          <span class="label">Retroalimentación al responder</span>
          ${[
            ['verdict', 'Correcto/incorrecto al instante', 'Recomendado. Cada equipo sabe si acertó y suma XP; las soluciones se desbloquean cuando todos los equipos de ese candado terminan.'],
            ['instant', 'Todo al instante', 'Muestra si acertó, la respuesta correcta y la explicación enseguida. Solo si cada candado tiene un único equipo.'],
            ['end', 'Todo al final', 'Solo se registra la respuesta; aciertos y soluciones se ven al terminar. Máximo suspenso.'],
          ].map(([id, label, desc]) => html`<label class=${`choice ${c.feedbackMode === id ? 'on' : ''}`}>
            <input type="radio" name="fb" checked=${c.feedbackMode === id} onChange=${() => patch({ feedbackMode: id })} />
            <span><b>${label}</b><span class="small muted">${desc}</span></span>
          </label>`)}
        </div>
        <div class="toggle-list">
          <${Toggle} checked=${c.shuffle} disabled=${!lobby} onChange=${(v) => patch({ shuffle: v })} title="Barajar preguntas y opciones" desc="Dos equipos en el mismo candado ven otro orden: copiar la letra no sirve." />
          <${Toggle} checked=${c.autoAssignLate} onChange=${(v) => patch({ autoAssignLate: v })} title="Ubicar a quien llega tarde" desc="Entra automáticamente al equipo con menos integrantes." />
          <${Toggle} checked=${c.showLiveAccuracy} onChange=${(v) => patch({ showLiveAccuracy: v })} title="Aciertos en vivo en el proyector" desc="Por defecto se ocultan hasta el podio para mantener el suspenso." />
        </div>
      </section>
    </div>

    <section class="card stack">
      <h2 class="sec-title"><span class="sec-icon"><${Icon} name="bars" size=${16} /></span>Fórmula de la nota</h2>
      <div class="formula-box">
        <b>Nota = <span class="gold">${accDraft}\u00a0%</span> × aciertos (0–5) + <span class="gold">${100 - accDraft}\u00a0%</span> × velocidad</b>
        <span class="small muted">Aciertos: cada pregunta correcta vale 1 punto sobre 5. Velocidad: según el orden en que el equipo abre su candado. Desempates: más aciertos → abrió antes del tiempo → menor tiempo → orden de apertura → nombre.</span>
      </div>
      <div class="field">
        <label for="w">Peso del acierto: ${accDraft}\u00a0% · velocidad: ${100 - accDraft}\u00a0%</label>
        <input id="w" class="slider" type="range" min="0" max="100" step="5" value=${accDraft} onInput=${(e) => setAccDraft(Number(e.target.value))}
          onChange=${(e) => patch({ scoring: { weights: { accuracy: Number(e.target.value), speed: 100 - Number(e.target.value) } } })} />
      </div>
      <div class="stack sm">
        <span class="label">Tabla de velocidad</span>
        <div class="field-grid speed">
          ${c.scoring.speedTable.map((v, i) => html`<div class="field"><label>${i + 1}.º abre</label>
            <input class="input" type="number" step="0.1" min="0" max="5" value=${v} onChange=${(e) => {
              const t = [...c.scoring.speedTable];
              t[i] = Number(e.target.value);
              patch({ scoring: { speedTable: t } });
            }} /></div>`)}
          <div class="field"><label>Paso luego</label><input class="input" type="number" step="0.1" min="0" max="5" value=${c.scoring.speedStep} onChange=${(e) => patch({ scoring: { speedStep: Number(e.target.value) } })} /></div>
          <div class="field"><label>Piso</label><input class="input" type="number" step="0.1" min="0" max="5" value=${c.scoring.speedFloor} onChange=${(e) => patch({ scoring: { speedFloor: Number(e.target.value) } })} /></div>
          <div class="field"><label>Sin abrir</label><input class="input" type="number" step="0.1" min="0" max="5" value=${c.scoring.timeoutSpeed} onChange=${(e) => patch({ scoring: { timeoutSpeed: Number(e.target.value) } })} /></div>
        </div>
      </div>
      <div class="stack sm">
        <span class="label">Así quedarían las notas</span>
        <div class="scen-grid">
          ${scen.map((s) => html`<div class="scen">
            <span class="small">${s.label}</span>
            <span class="tiny muted">Acierto ${dec(s.correct, 1)} · velocidad ${dec(s.speed, 1)}</span>
            <span class="grade-chip">${grade(Math.round(s.score * 10) / 10)}</span>
          </div>`)}
        </div>
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Resultados y exportación
// ---------------------------------------------------------------------------
function ResultsTab({ mod, modKey, toast }) {
  const r = mod.results;
  const lobby = mod.phase === 'lobby';
  const chaos = mod.config.mode === 'chaos';
  const dl = async (kind, name) => {
    try {
      await download(`/api/rooms/${mod.code}/export/${kind}`, modKey, name);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };
  const Tile = ({ icon, title, desc, onClick, href }) => {
    const body = html`<span class="export-icon"><${Icon} name=${icon} size=${20} /></span><span class="grow"><b>${title}</b><span class="tiny muted">${desc}</span></span>`;
    return href
      ? html`<a class=${`export-tile ${lobby ? 'disabled' : ''}`} href=${href} target="_blank" rel="noopener" aria-disabled=${lobby}>${body}</a>`
      : html`<button class="export-tile" disabled=${lobby} onClick=${onClick}>${body}</button>`;
  };

  return html`
    <section class="stack sm">
      <h2 class="sec-title">Exportar</h2>
      <div class="export-grid">
        <${Tile} icon="file" title="Informe PDF" desc="Diseño de la actividad, para imprimir o guardar" href=${`/informe?sala=${mod.code}`} />
        <${Tile} icon="bars" title="Excel (.xlsx)" desc="Resumen, ranking, notas y preguntas en hojas con formato" onClick=${() => dl('informe.xlsx', `informe-${mod.code}.xlsx`)} />
        <${Tile} icon="download" title=${chaos ? 'CSV por jugador' : 'CSV por equipo'} desc="Ranking, puntajes y desglose" onClick=${() => dl('equipos.csv', `${chaos ? 'jugadores' : 'equipos'}-${mod.code}.csv`)} />
        <${Tile} icon="download" title="CSV por estudiante" desc="Nota individual y participación" onClick=${() => dl('estudiantes.csv', `estudiantes-${mod.code}.csv`)} />
      </div>
      ${lobby ? html`<p class="tiny muted" style="margin:0">Disponible cuando empiece la partida. Mientras se juega, los archivos salen parciales.</p>` : null}
    </section>
    ${!r
      ? html`<div class="empty big"><${Icon} name="trophy" size=${36} /><b>Aún no hay resultados definitivos</b><span>${chaos ? 'Aparecen cuando todos terminan o caen, o cuando pulsas «Terminar» en «En vivo».' : 'Aparecen cuando todos los candados se cierran o pulsas «Terminar» en «En vivo».'}</span></div>`
      : html`
        ${mod.podiumRevealed ? null : html`<div class="warn-box small"><b>El podio aún no se revela en el proyector.</b> Pulsa el botón dorado del trofeo, arriba a la derecha, cuando quieras mostrarlo a la clase.</div>`}
        <section class="stack sm">
          <h2 class="sec-title">Ranking final</h2>
          <${RankList} rows=${fromResults(r)} live=${false} />
          <${Legend} weights=${r.scoring.weights} live=${false} />
        </section>
        <section class="card stack sm">
          <h2 class="sec-title">Notas por estudiante</h2>
          ${r.mode === 'chaos'
            ? html`<p class="small muted" style="margin:0">En Caos cada nota es individual: aciertos sobre el total de preguntas más la velocidad por orden de llegada. Quien cayó recibe la velocidad mínima.</p>
              <table class="table rtable">
                <thead><tr><th>Estudiante</th><th>Estado</th><th>Vidas</th><th>Puesto</th><th>Nota</th><th>Aciertos</th><th>Respondidas</th><th>Tiempo</th></tr></thead>
                <tbody>${r.teams.map((t) => html`<tr>
                  <td data-label="Estudiante"><b>${t.name}</b></td>
                  <td data-label="Estado">${t.opened ? `Sobrevivió ${ordinal(t.finishSeq)}` : t.closedBy === 'eliminated' ? 'Eliminado' : t.closedBy === 'time' ? 'Sin tiempo' : 'En pie al cierre'}</td>
                  <td data-label="Vidas"><${Hearts} lost=${t.livesLost} total=${t.lives ?? 3} /></td>
                  <td data-label="Puesto">${t.position}</td>
                  <td data-label="Nota"><span class="grade-chip sm">${grade(t.grade)}</span></td>
                  <td data-label="Aciertos">${t.correct}/${t.total}</td>
                  <td data-label="Respondidas">${t.answered}</td>
                  <td data-label="Tiempo">${t.elapsedMs !== null ? mmss(t.elapsedMs) : '—'}</td>
                </tr>`)}</tbody>
              </table>`
            : html`<p class="small muted" style="margin:0">La nota individual es la del equipo (trabajo cooperativo). La participación te ayuda a decidir si ajustar casos puntuales.</p>
          <table class="table rtable">
            <thead><tr><th>Estudiante</th><th>Equipo</th><th>Candado</th><th>Puesto</th><th>Nota</th><th>Votos</th><th>Confirmó</th><th>Participación</th></tr></thead>
            <tbody>${r.students.map((s) => html`<tr>
              <td data-label="Estudiante"><b>${s.name}</b></td>
              <td data-label="Equipo">${s.teamName}</td>
              <td data-label="Candado">${s.lock ? html`<span class=${`pill ${LOCKS[s.lock].key}`} title=${LOCKS[s.lock].short}>C${s.lock}<span class="lbl-long"> · ${LOCKS[s.lock].short}</span></span>` : '—'}</td>
              <td data-label="Puesto">${s.position ?? '—'}</td>
              <td data-label="Nota"><span class="grade-chip sm">${grade(s.grade)}</span></td>
              <td data-label="Votos">${s.votes}</td>
              <td data-label="Confirmó">${s.confirms}</td>
              <td data-label="Particip." class=${s.participation < 40 ? 'low' : ''}>${s.participation} %</td>
            </tr>`)}</tbody>
          </table>`}
        </section>
        <section class="card stack sm">
          <h2 class="sec-title">Dificultad real de las preguntas</h2>
          <div class="qstats">
            ${r.questionStats.map((s) => html`<div class=${`qstat c-${LOCKS[s.lock].key}`}>
              <span class="qstat-lock">C${s.lock}</span>
              <span class="qstat-main">
                <span class="small clamp-2"><${MathText} text=${s.prompt} /></span>
                <span class="stat-bar"><i style=${`width:${s.accuracy ?? 0}%`}></i></span>
              </span>
              <span class="qstat-val"><b>${s.accuracy ?? '—'}${s.accuracy !== null ? ' %' : ''}</b><span class="tiny muted">${s.correct}/${s.attempts}</span></span>
            </div>`)}
          </div>
        </section>`}
  `;
}
