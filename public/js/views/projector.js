import { html, useEffect, useRef, useState } from '../lib/html.js';
import { api, useConnection, useKeepAlive } from '../lib/connection.js';
import { remainingFor, useTick } from '../lib/clock.js';
import { LOCKS, grade, dec, ordinal, mmss } from '../lib/format.js';
import { sfx, unlockAudio } from '../lib/sound.js';
import {
  Avatar, Confetti, ConnectionBanner, Countdown, Footer, Icon, LevelIcon, LockPill, MemberChip, Padlock, Pins, Toasts, useToasts,
} from '../components/ui.js';

export function ProjectorApp() {
  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState((params.get('sala') || '').toUpperCase());
  if (!code) return html`<${AskCode} onCode=${(c) => {
    history.replaceState(null, '', `/proyector?sala=${c}`);
    setCode(c);
  }} />`;
  return html`<${Projector} code=${code} />`;
}

function AskCode({ onCode }) {
  const [v, setV] = useState('');
  return html`<div class="theme-dark"><form class="cover" onSubmit=${(e) => {
    e.preventDefault();
    if (v.trim()) onCode(v.trim().toUpperCase());
  }}>
    <span class="pill">Vista de proyector</span>
    <h1>¿Qué sala quieres proyectar?</h1>
    <input class="input code" value=${v} onInput=${(e) => setV(e.target.value.toUpperCase())} placeholder="CÓDIGO" maxlength="6" />
    <button class="btn lg">Proyectar</button>
  </form></div>`;
}

function Projector({ code }) {
  const [toasts, toast] = useToasts();
  const [banner, setBanner] = useState(null);
  const [soundOn, setSoundOn] = useState(false);
  const bannerTimer = useRef(null);
  useKeepAlive(true);

  const conn = useConnection({ role: 'projector', code }, {
    onEvent: (ev) => {
      if (ev.type === 'opened') {
        sfx.unlock();
        clearTimeout(bannerTimer.current);
        setBanner({ ...ev, key: Math.random() });
        bannerTimer.current = setTimeout(() => setBanner(null), 4500);
      } else if (ev.type === 'started') sfx.start();
      else if (ev.type === 'timeout') {
        sfx.alarm();
        toast(`Se acabó el tiempo de «${ev.name}»`, { icon: 'clock' });
      } else if (ev.type === 'ended') sfx.drum();
      else if (ev.type === 'time') toast(`${ev.seconds > 0 ? '+' : ''}${ev.seconds} s ${ev.lock === 'all' ? 'para todos los candados' : `para el candado ${ev.lock}`}`, { icon: 'clock' });
      else if (ev.type === 'paused') toast('Partida en pausa', { icon: 'pause' });
      else if (ev.type === 'resumed') toast('¡Continúa la partida!', { icon: 'play' });
    },
  });

  if (conn.fatal) {
    return html`<div class="theme-dark"><div class="cover"><h1>${conn.fatal.message}</h1><a class="btn" href="/proyector">Elegir otra sala</a></div></div>`;
  }
  const pub = conn.public;
  if (!pub) return html`<div class="theme-dark" style="display:grid;place-items:center"><p class="muted waiting-dots">Conectando</p></div>`;

  let body;
  if (pub.phase === 'lobby') body = html`<${ProjectorLobby} pub=${pub} />`;
  else if (pub.phase === 'finished' && pub.podiumRevealed && pub.results) body = html`<${Podium} pub=${pub} />`;
  else if (pub.phase === 'finished') body = html`<${Suspense} pub=${pub} />`;
  else body = html`<${Board} pub=${pub} />`;

  const fullscreen = () => {
    unlockAudio();
    setSoundOn(true);
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return html`<div class="theme-dark">
    <div class="projector">
      <header class="head">
        <div class="row nowrap" style="gap:1em">
          <span class="pill">Sala ${pub.code}</span>
          <h1 style="font-size:1.6em">${pub.title}</h1>
        </div>
        <div class="row nowrap" style="gap:.6em">
          ${pub.phase !== 'lobby' ? html`<${JoinMini} code=${pub.code} />` : null}
          <button class="icon-btn no-print" onClick=${fullscreen} title="Pantalla completa y sonido" aria-label="Pantalla completa y sonido">
            <${Icon} name=${soundOn ? 'expand' : 'sound'} size=${20} />
          </button>
        </div>
      </header>
      ${body}
      <${Footer} />
    </div>
    ${pub.phase === 'paused'
      ? html`<div class="overlay"><div class="panel" style="width:min(90vw,700px)">
          <span class="lvl-icon c-boss" style="--size:140px"><${Icon} name="pause" size=${70} /></span>
          <h1 class="display" style="font-size:4em">Pausa</h1>
          <p class="muted" style="font-size:1.4em">${pub.autoPaused ? 'El servidor se reinició; el progreso está a salvo.' : 'El reloj está detenido.'}</p>
        </div></div>`
      : null}
    ${banner
      ? html`<div key=${banner.key} class="banner">
          <${Confetti} fire=${banner.key} />
          <div class="row" style="justify-content:center;gap:1em"><${LevelIcon} lock=${banner.lock} size=${90} /><${Padlock} open size=${90} /></div>
          <div class="display gold" style="font-size:1.6em;margin-top:.4em">¡Candado ${banner.lock} abierto!</div>
          <div style="font-size:1.8em;font-weight:900">${banner.name}</div>
          <div class="muted">Puesto de apertura: <b class="gold">${ordinal(banner.seq)}</b></div>
        </div>`
      : null}
    <${Toasts} toasts=${toasts} />
    <${ConnectionBanner} status=${conn.status} />
  </div>`;
}

function useJoinUrl(code) {
  const [url, setUrl] = useState(`${location.origin}/?sala=${code}`);
  useEffect(() => {
    api(`/api/rooms/${code}/join-url`).then((r) => r.ok && setUrl(r.url));
  }, [code]);
  return url;
}

function JoinMini({ code }) {
  const url = useJoinUrl(code);
  return html`<span class="small muted" style="text-align:right">¿Llegaste tarde? Entra en <b class="gold">${url.replace(/^https?:\/\//, '').replace(/\/\?sala=.*/, '')}</b> con el código <b class="gold">${code}</b></span>`;
}

function ProjectorLobby({ pub }) {
  const url = useJoinUrl(pub.code);
  return html`<main class="stack" style="gap:1.6em;align-content:start">
    <section class="join-hero">
      <div class="qr-box"><img src=${`/api/rooms/${pub.code}/qr.svg?v=${pub.code}`} alt=${`Código QR para entrar a la sala ${pub.code}`} /></div>
      <div class="stack" style="gap:.8em">
        <span class="pill" style="justify-self:start">Press start ▶ Entra desde tu celular</span>
        <div class="muted" style="font-size:1.3em">Escanea el QR o entra a</div>
        <div class="join-url"><b style="color:#fff">${url.replace(/\?sala=.*/, '')}</b></div>
        <div class="muted" style="font-size:1.3em">y escribe el código</div>
        <div class="big-code">${pub.code}</div>
      </div>
    </section>
    <section class="stack sm">
      <div class="row between">
        <h2 style="font-size:1.5em"><${Icon} name="users" /> ${pub.players.length} ${pub.players.length === 1 ? 'científico conectado' : 'científicos conectados'}</h2>
        <span class="muted">Equipos de hasta ${pub.config.teamSize} · ${pub.config.questionsPerLock} preguntas por candado</span>
      </div>
      ${pub.teams.length
        ? html`<${LockColumns} pub=${pub} lobby />`
        : html`<div class="lobby-names">${pub.players.map((p) => html`<${MemberChip} key=${p.id} member=${p} />`)}</div>`}
    </section>
  </main>`;
}

function TeamTile({ pub, team, lobby }) {
  const status = team.opened
    ? html`<span class="pill" style="font-size:.8em"><${Icon} name="unlock" size=${14} />Abierto · ${ordinal(team.finishSeq)} · ${mmss(team.finishedAtMs)}</span>`
    : team.closedBy === 'time'
      ? html`<span class="pill ghost" style="font-size:.8em"><${Icon} name="clock" size=${14} />Tiempo agotado</span>`
      : team.closedBy
        ? html`<span class="pill ghost" style="font-size:.8em"><${Icon} name="lock" size=${14} />Cerrado</span>`
        : lobby ? null : html`<span class="small muted num">${team.answered}/${team.total} respondidas</span>`;
  const pins = Array.from({ length: team.answered }, () => ({ correct: null }));
  return html`<div class=${`team-tile ${team.opened ? 'opened' : ''} ${team.closedBy === 'time' ? 'timeout' : ''}`}>
    <div class="row between nowrap"><span class="tname">${team.name}</span>${team.opened ? html`<${Icon} name="unlock" cls="gold" />` : null}</div>
    <div class="avatar-stack">${team.members.map((m) => html`<${Avatar} id=${m.id} name=${m.name} size=${30} online=${m.online} />`)}</div>
    ${lobby ? html`<div class="small muted">${team.members.map((m) => m.name).join(', ')}</div>` : html`<${Pins} total=${team.total} answers=${pins} />`}
    ${status}
  </div>`;
}

function LockColumns({ pub, lobby = false }) {
  useTick(250, pub.phase === 'running');
  return html`<div class="lock-columns">
    ${pub.locks.map((lock) => {
      const teams = pub.teams.filter((t) => t.lock === lock.id);
      return html`<section class=${`lock-col c-${LOCKS[lock.id].key}`}>
        <div class="lock-col-head">
          <${LevelIcon} lock=${lock.id} size=${48} number=${false} />
          <div class="grow">
            <div style="font-weight:900;font-size:1.1em">Candado ${lock.id} · ${lock.name}</div>
            <div class="small" style="opacity:.9">«${lock.title}»</div>
          </div>
          ${lobby ? null : html`<${Countdown} ms=${remainingFor(pub, lock.id)} paused=${pub.phase !== 'running'} />`}
        </div>
        <div class="lock-col-body">
          ${teams.length ? teams.map((t) => html`<${TeamTile} pub=${pub} team=${t} lobby=${lobby} />`) : html`<p class="small muted center">Sin equipos</p>`}
        </div>
      </section>`;
    })}
  </div>`;
}

export function speedBase(scoring, pos) {
  const table = scoring.speedTable;
  if (pos <= table.length) return table[pos - 1];
  return Math.max(scoring.speedFloor, table[table.length - 1] - scoring.speedStep * (pos - table.length));
}

function OpenOrder({ pub }) {
  const opened = pub.teams.filter((t) => t.opened).sort((a, b) => a.finishSeq - b.finishSeq);
  const table = pub.config.scoring.speedTable.map((v) => dec(v, 1)).join(' · ');
  return html`<aside class="card stack sm">
    <h3 style="font-size:1.2em"><${Icon} name="key" cls="gold" /> Orden de apertura</h3>
    ${opened.length
      ? html`<div class="open-order">${opened.map((t) => html`<div class=${`rank-item c-${LOCKS[t.lock].key}`}>
          <span class="rank-pos">${t.finishSeq}</span>
          <div class="grow"><b>${t.name}</b><div class="tiny muted">Candado ${t.lock} · ${mmss(t.finishedAtMs)}</div></div>
          <span class="grade-chip">${dec(speedBase(pub.config.scoring, t.finishSeq), 1)}</span>
        </div>`)}</div>`
      : html`<p class="muted small">Nadie ha abierto su candado todavía…</p>`}
    <p class="tiny muted" style="margin:0">La velocidad da la base (${table}), pero los aciertos pesan ${Math.round(pub.config.scoring.weights.accuracy * 100)} %: se revelan al final.</p>
  </aside>`;
}

function Board({ pub }) {
  return html`<main style="display:grid;gap:1.2em;grid-template-columns:minmax(0,1fr) minmax(16em,22em);align-items:start">
    <${LockColumns} pub=${pub} />
    <${OpenOrder} pub=${pub} />
  </main>`;
}

function Suspense({ pub }) {
  return html`<main class="stack center" style="justify-items:center;align-content:center;gap:1.4em">
    <${Padlock} size=${160} />
    <h1 class="display" style="font-size:3.4em">Todos los candados están cerrados</h1>
    <p class="muted" style="font-size:1.5em;max-width:40em">¿Quién escapó mejor? La velocidad cuenta, pero el acierto manda.<br />El moderador revelará el podio<span class="waiting-dots"></span></p>
    <div style="width:min(100%,40em)"><${OpenOrder} pub=${pub} /></div>
  </main>`;
}

function Podium({ pub }) {
  const rows = pub.results.teams;
  const [step, setStep] = useState(0);
  const [view, setView] = useState('podium');
  useEffect(() => {
    setStep(0);
    const timers = [1, 2, 3].map((s, i) => setTimeout(() => {
      setStep(s);
      if (s === 3) sfx.fanfare();
      else sfx.drum();
    }, 900 + i * 2200));
    return () => timers.forEach(clearTimeout);
  }, [pub.results.computedAt]);
  useEffect(() => {
    if (step < 3) return undefined;
    const t = setTimeout(() => setView((v) => (v === 'podium' ? 'podium+table' : v)), 3500);
    return () => clearTimeout(t);
  }, [step]);

  const slot = (pos) => rows[pos - 1];
  const order = [2, 1, 3];
  const showAt = { 3: 1, 2: 2, 1: 3 };

  return html`<main class="stack" style="gap:1.5em;align-content:start">
    ${step >= 3 ? html`<${Confetti} fire=${pub.results.computedAt} />` : null}
    <div class="row" style="justify-content:center;gap:.6em">
      <button class=${`btn sm ${view.startsWith('podium') ? '' : 'secondary'}`} onClick=${() => setView('podium+table')}>Podio y ranking</button>
      <button class=${`btn sm ${view === 'stats' ? '' : 'secondary'}`} onClick=${() => setView('stats')}>Pregunta más difícil y debate</button>
    </div>
    ${view === 'stats'
      ? html`<${Debate} pub=${pub} />`
      : html`
        <div class="podium">
          ${order.map((pos) => {
            const r = slot(pos);
            if (!r) return html`<div></div>`;
            return html`<div class=${`podium-step p${pos} ${step >= showAt[pos] ? 'show' : ''}`}>
              <${LevelIcon} lock=${r.lock} size=${pos === 1 ? 84 : 64} />
              <div class="podium-name">${r.name}</div>
              <div class="small muted">${r.members.map((m) => m.name).join(', ')}</div>
              <span class="grade-chip" style="font-size:1.4em">Nota ${grade(r.grade)}</span>
              <div class="podium-block">${pos}</div>
            </div>`;
          })}
        </div>
        ${view === 'podium+table' ? html`<${RankingTable} rows=${rows} />` : null}`}
  </main>`;
}

export function RankingTable({ rows, light = false }) {
  return html`<div class=${light ? '' : 'card'} style="overflow-x:auto">
    <table class=${light ? 'table' : 'table on-dark'}>
      <thead><tr>
        <th>#</th><th>Equipo</th><th>Candado</th><th>Aciertos</th><th>Acierto ×${Math.round(rows[0]?.breakdown.weights.accuracy * 100)} %</th>
        <th>Apertura</th><th>Velocidad ×${Math.round(rows[0]?.breakdown.weights.speed * 100)} %</th><th>Puntaje</th><th>Nota</th><th>Insignias</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => html`<tr>
          <td><b class=${light ? '' : 'gold'} style="font-size:1.2em">${r.position}</b></td>
          <td><b>${r.name}</b>${r.tiebreak ? html`<div class="tiny" style="opacity:.75">${r.tiebreak}</div>` : null}</td>
          <td><${LockPill} lock=${r.lock} /></td>
          <td>${r.correct}/${r.total} (${dec(r.breakdown.accuracyPoints, 0)})</td>
          <td>${dec(r.breakdown.accuracy5)} → <b>${dec(r.breakdown.accuracyPart)}</b></td>
          <td>${r.opened ? ordinal(r.breakdown.speedPosition) : r.closedBy === 'time' ? html`<span title="Tiempo agotado"><${Icon} name="clock" size=${14} /></span>` : '—'}</td>
          <td>${dec(r.breakdown.speed, 1)} → <b>${dec(r.breakdown.speedPart)}</b></td>
          <td>${dec(r.score)}</td>
          <td><span class="grade-chip">${grade(r.grade)}</span></td>
          <td class="small">${r.badges.map((b) => b.label).join(' · ') || '—'}</td>
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}

function Debate({ pub }) {
  const stats = pub.results.questionStats.filter((s) => s.attempts > 0);
  const hardest = stats.slice(0, 3);
  const [endAt, setEndAt] = useState(null);
  useTick(250, !!endAt);
  const left = endAt ? Math.max(0, endAt - Date.now()) : 60_000;
  return html`<div class="grid-2" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)">
    <div class="card stack">
      <h2 style="font-size:1.5em">Las preguntas que más costaron</h2>
      ${hardest.length === 0 ? html`<p class="muted">No hubo respuestas.</p>` : null}
      ${hardest.map((s, i) => html`<div class=${`stack sm c-${LOCKS[s.lock].key}`} style="gap:.4em">
        <div class="row nowrap"><${LevelIcon} lock=${s.lock} size=${36} number=${false} /><b class="grow">${i === 0 ? 'La más difícil: ' : ''}${s.prompt}</b></div>
        <div class="row nowrap"><div class="stat-bar grow"><i style=${`width:${s.accuracy}%`}></i></div><b class="num">${s.accuracy} %</b></div>
        <span class="small muted">${s.correct} de ${s.attempts} equipos acertaron</span>
      </div>`)}
    </div>
    <div class="card stack center" style="justify-items:center">
      <span class="pill">Mini debate · 1 minuto</span>
      <h2 style="font-size:2em">¿Qué fue lo más difícil?</h2>
      <p class="muted">Un voluntario por equipo cuenta qué candado les costó más y por qué.</p>
      <${Countdown} ms=${left} big />
      <button class="btn" onClick=${() => setEndAt(Date.now() + 60_000)}>${endAt ? 'Reiniciar minuto' : 'Iniciar minuto'}</button>
      <p class="small muted">Todos reciben su certificado de <b class="gold">Científico de Datos</b> desde su celular.</p>
    </div>
  </div>`;
}
