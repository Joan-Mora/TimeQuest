import { html, useEffect, useRef, useState } from '../lib/html.js';
import { api, useConnection, useKeepAlive } from '../lib/connection.js';
import { remainingFor, useTick } from '../lib/clock.js';
import { LOCKS, grade, dec, ordinal, mmss } from '../lib/format.js';
import { sfx, unlockAudio } from '../lib/sound.js';
import {
  Avatar, Confetti, ConnectionBanner, Countdown, Footer, Hearts, Icon, LevelIcon, LockPill, MathText, MemberChip, Padlock, Pins, Toasts, useToasts,
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
      } else if (ev.type === 'eliminated') {
        sfx.wrong();
        toast(`${ev.name} quedó eliminado · ${ev.alive} de ${ev.total} en pie`, { icon: 'heart', group: 'out' });
      } else if (ev.type === 'started') sfx.start();
      else if (ev.type === 'timeout') {
        sfx.alarm();
        toast(`Se acabó el tiempo de «${ev.name}»`, { icon: 'clock' });
      } else if (ev.type === 'ended') sfx.drum();
      else if (ev.type === 'time') toast(`${ev.seconds > 0 ? '+' : ''}${ev.seconds} s ${ev.lock === 'all' || Number(ev.lock) === 0 ? 'para todos' : `para el candado ${ev.lock}`}`, { icon: 'clock' });
      else if (ev.type === 'paused') toast('Partida en pausa', { icon: 'pause' });
      else if (ev.type === 'resumed') toast('¡Continúa la partida!', { icon: 'play' });
    },
  });

  if (conn.fatal) {
    return html`<div class="theme-dark"><div class="cover notice">
      <${Padlock} color="#8890c4" size=${110} />
      <h1>${conn.fatal.message}</h1>
      <p class="muted">El moderador cerró o eliminó esta sala. Elige otra para seguir proyectando.</p>
      <a class="btn lg" href="/proyector">Elegir otra sala</a>
    </div></div>`;
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
        <div class="proj-title">
          <span class="pill">Sala ${pub.code}</span>
          <h1>${pub.title}</h1>
        </div>
        <div class="proj-head-tools">
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
          <div class="display gold" style="font-size:1.6em;margin-top:.4em">${banner.solo ? '¡Sobrevivió al Caos!' : `¡Candado ${banner.lock} abierto!`}</div>
          <div style="font-size:1.8em;font-weight:900">${banner.name}</div>
          <div class="muted">${banner.solo ? 'Puesto de llegada' : 'Puesto de apertura'}: <b class="gold">${ordinal(banner.seq)}</b></div>
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
  return html`<span class="small muted join-mini">¿Llegaste tarde? Entra en <b class="gold">${url.replace(/^https?:\/\//, '').replace(/\/\?sala=.*/, '')}</b> con el código <b class="gold">${code}</b></span>`;
}

function ProjectorLobby({ pub }) {
  const url = useJoinUrl(pub.code);
  return html`<main class="stack" style="gap:1.6em;align-content:start">
    <section class="join-hero">
      <div class="qr-box"><img src=${`/api/rooms/${pub.code}/qr.svg?v=${pub.code}`} alt=${`Código QR para entrar a la sala ${pub.code}`} /></div>
      <div class="stack" style="gap:.8em">
        <span class="pill ico-text join-pill">Press start <${Icon} name="play" size=${12} /> Entra desde tu celular</span>
        <div class="muted" style="font-size:1.3em">Escanea el QR o entra a</div>
        <div class="join-url"><b style="color:#fff">${url.replace(/\?sala=.*/, '')}</b></div>
        <div class="muted" style="font-size:1.3em">y escribe el código</div>
        <div class="big-code">${pub.code}</div>
      </div>
    </section>
    ${pub.config.mode === 'chaos' ? html`<${ChaosIntro} pub=${pub} />` : null}
    <section class="stack sm">
      <div class="row between">
        <h2 class="ico-text" style="font-size:1.5em"><${Icon} name="users" /> ${pub.players.length} ${pub.players.length === 1 ? 'científico conectado' : 'científicos conectados'}</h2>
        <span class="muted">${pub.config.mode === 'chaos'
          ? `Modo Caos · ${pub.locks[0]?.questionCount ?? '—'} preguntas · ${pub.config.chaosLives} vidas`
          : `Equipos de hasta ${pub.config.teamSize} · ${pub.config.questionsPerLock} preguntas por candado`}</span>
      </div>
      ${pub.teams.length && pub.config.mode !== 'chaos'
        ? html`<${LockColumns} pub=${pub} lobby />`
        : html`<div class="lobby-names">${pub.players.map((p) => html`<${MemberChip} key=${p.id} member=${p} />`)}</div>`}
    </section>
  </main>`;
}

function ChaosIntro({ pub }) {
  const lock = pub.locks[0];
  return html`<section class="chaos-intro">
    <${LevelIcon} lock=${0} size=${84} />
    <div class="stack sm" style="min-width:0">
      <span class="lock-col-kicker">Modo de juego</span>
      <h2 class="display" style="font-size:2em;margin:0">Caos · todos contra todos</h2>
      <p class="muted" style="margin:0;font-size:1.1em">${lock?.story}</p>
      <div class="row" style="gap:.5em">
        ${[1, 2, 3, 4].map((l) => html`<span class=${`pill ${LOCKS[l].key}`}><${Icon} name=${LOCKS[l].icon} size=${14} />${LOCKS[l].short}</span>`)}
      </div>
    </div>
    <div class="chaos-intro-rules">
      <${Hearts} total=${pub.config.chaosLives} />
      <b>${pub.config.chaosLives} ${pub.config.chaosLives === 1 ? 'vida' : 'vidas'}</b>
      <span class="small muted">cada error cuesta una</span>
      <b class="num" style="font-size:1.4em">${mmss(lock?.limitMs ?? 0)}</b>
      <span class="small muted">reloj para todos</span>
    </div>
  </section>`;
}

function chaosOrder(t) {
  return t.opened ? 0 : !t.closedBy ? 1 : t.closedBy === 'eliminated' ? 3 : 2;
}

function ChaosTile({ team }) {
  const status = team.opened
    ? html`<div class="tile-status ok"><${Icon} name="unlock" size=${14} /><b>Sobrevivió ${ordinal(team.finishSeq)}</b></div>`
    : team.closedBy === 'eliminated'
      ? html`<div class="tile-status out"><${Icon} name="x" size=${14} /><b>Eliminado</b></div>`
      : team.closedBy === 'time'
        ? html`<div class="tile-status off"><${Icon} name="clock" size=${14} /><b>Sin tiempo</b></div>`
        : team.closedBy
          ? html`<div class="tile-status off"><${Icon} name="lock" size=${14} /><b>Cerrado</b></div>`
          : html`<span class="small muted num">${team.answered}/${team.total}</span>`;
  const online = team.members[0]?.online !== false;
  return html`<div class=${`chaos-tile ${team.opened ? 'opened' : ''} ${team.closedBy === 'eliminated' ? 'out' : ''}`}>
    <div class="row between nowrap" style="gap:.4em">
      <span class=${`tname ${online ? '' : 'offline'}`}>${team.name}</span>
      <${Hearts} lost=${team.livesLost} total=${team.lives ?? 3} />
    </div>
    <div class="chaos-progress"><i style=${`width:${team.total ? Math.round((team.answered / team.total) * 100) : 0}%`}></i></div>
    ${status}
  </div>`;
}

function ChaosBoard({ pub }) {
  useTick(250, pub.phase === 'running');
  const lock = pub.locks[0];
  const rows = [...pub.teams].sort((a, b) => chaosOrder(a) - chaosOrder(b) || (a.finishSeq ?? 99) - (b.finishSeq ?? 99) || b.answered - a.answered || a.name.localeCompare(b.name, 'es'));
  const out = pub.teams.filter((t) => t.closedBy === 'eliminated').length;
  const done = pub.teams.filter((t) => t.opened).length;
  return html`<main class="proj-board">
    <section class="stack" style="gap:1em;min-width:0">
      <div class="chaos-hero c-l0">
        <${LevelIcon} lock=${0} size=${64} />
        <div class="stack sm" style="gap:.1em;min-width:0">
          <span class="lock-col-kicker">Modo Caos · ${lock?.questionCount ?? ''} preguntas</span>
          <b style="font-size:1.6em">Todos contra todos</b>
        </div>
        <div class="chaos-stats">
          <div><b class="num">${pub.chaos?.alive ?? '—'}<small>/${pub.chaos?.total ?? '—'}</small></b><span>en pie</span></div>
          <div><b class="num">${done}</b><span>sobrevivieron</span></div>
          <div><b class="num">${out}</b><span>eliminados</span></div>
        </div>
        <${Countdown} ms=${remainingFor(pub, 0)} paused=${pub.phase !== 'running'} big />
      </div>
      <div class="chaos-grid">${rows.map((t) => html`<${ChaosTile} key=${t.id} team=${t} />`)}</div>
    </section>
    <${OpenOrder} pub=${pub} />
  </main>`;
}

function TeamTile({ pub, team, lobby }) {
  const status = team.opened
    ? html`<div class="tile-status ok"><${Icon} name="unlock" size=${16} /><b>Abierto ${ordinal(team.finishSeq)}</b><span class="num">${mmss(team.finishedAtMs)}</span></div>`
    : team.closedBy === 'time'
      ? html`<div class="tile-status off"><${Icon} name="clock" size=${16} /><b>Tiempo agotado</b></div>`
      : team.closedBy
        ? html`<div class="tile-status off"><${Icon} name="lock" size=${16} /><b>Cerrado</b></div>`
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
          ${lobby ? html`<span class="lock-col-count">${teams.length} ${teams.length === 1 ? 'equipo' : 'equipos'}</span>` : html`<${Countdown} ms=${remainingFor(pub, lock.id)} paused=${pub.phase !== 'running'} />`}
          <div class="lock-col-title">
            <span class="lock-col-kicker">Candado ${lock.id}</span>
            <b>${lock.name}</b>
            <span class="lock-col-story">«${lock.title}»</span>
          </div>
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
  const chaos = pub.config.mode === 'chaos';
  const opened = pub.teams.filter((t) => t.opened).sort((a, b) => a.finishSeq - b.finishSeq);
  const table = pub.config.scoring.speedTable.map((v) => dec(v, 1)).join(' · ');
  return html`<aside class="card stack sm open-order-card">
    <h3 class="ico-text" style="font-size:1.2em"><${Icon} name="key" cls="gold" /> ${chaos ? 'Orden de llegada' : 'Orden de apertura'}</h3>
    ${opened.length
      ? html`<div class="open-order">${opened.map((t) => html`<div class=${`rank-item c-${LOCKS[t.lock].key}`}>
          <span class="rank-pos">${t.finishSeq}</span>
          <div class="grow"><b>${t.name}</b><div class="tiny muted">${chaos ? `${t.lives - t.livesLost} ${t.lives - t.livesLost === 1 ? 'vida' : 'vidas'} · ` : `Candado ${t.lock} · `}${mmss(t.finishedAtMs)}</div></div>
          <span class="grade-chip">${dec(speedBase(pub.config.scoring, t.finishSeq), 1)}</span>
        </div>`)}</div>`
      : html`<p class="muted small">${pub.phase === 'finished'
          ? chaos ? 'Nadie sobrevivió al Caos: el ranking se decide por aciertos y tiempo en pie.' : 'Ningún equipo abrió su candado.'
          : chaos ? 'Nadie ha sobrevivido al Caos todavía…' : 'Nadie ha abierto su candado todavía…'}</p>`}
    <p class="tiny muted" style="margin:0">La velocidad da la base (${table}), pero los aciertos pesan ${Math.round(pub.config.scoring.weights.accuracy * 100)} %: se revelan al final.</p>
  </aside>`;
}

function Board({ pub }) {
  if (pub.config.mode === 'chaos') return html`<${ChaosBoard} pub=${pub} />`;
  return html`<main class="proj-board">
    <${LockColumns} pub=${pub} />
    <${OpenOrder} pub=${pub} />
  </main>`;
}

function Suspense({ pub }) {
  return html`<main class="stack center" style="justify-items:center;align-content:center;gap:1.4em">
    <${Padlock} size=${160} />
    <h1 class="display" style="font-size:3.4em">${pub.config.mode === 'chaos' ? 'El Caos terminó' : 'Todos los candados están cerrados'}</h1>
    <p class="muted" style="font-size:1.5em;max-width:40em">${pub.config.mode === 'chaos' ? '¿Quién dominó el Caos? Sobrevivir cuenta, pero el acierto manda.' : '¿Quién escapó mejor? La velocidad cuenta, pero el acierto manda.'}<br />El moderador revelará el podio<span class="waiting-dots"></span></p>
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
              ${r.solo
                ? html`<div class="small muted">${r.opened ? `Sobrevivió ${ordinal(r.finishSeq)}` : r.closedBy === 'eliminated' ? 'Eliminado' : 'En pie al final'} · ${r.correct}/${r.total}</div>`
                : html`<div class="small muted">${r.members.map((m) => m.name).join(', ')}</div>`}
              <span class="grade-chip" style="font-size:1.4em">Nota ${grade(r.grade)}</span>
              <div class="podium-block">${pos}</div>
            </div>`;
          })}
        </div>
        ${view === 'podium+table' ? html`<${RankingTable} rows=${rows} />` : null}`}
  </main>`;
}

export function RankingTable({ rows, light = false }) {
  const accW = `×${Math.round(rows[0]?.breakdown.weights.accuracy * 100)}\u00a0%`;
  const spdW = `×${Math.round(rows[0]?.breakdown.weights.speed * 100)}\u00a0%`;
  const chaos = !!rows[0]?.solo;
  const openLabel = chaos ? 'Llegada' : 'Apertura';
  return html`<div class=${light ? 'rank-table-wrap' : 'card rank-table-wrap'}>
    <table class=${light ? 'table rank-table' : 'table on-dark rank-table'}>
      <thead><tr>
        <th>#</th><th>${chaos ? 'Jugador' : 'Equipo'}</th><th>${chaos ? 'Vidas' : 'Candado'}</th><th>Aciertos</th><th>Acierto ${accW}</th>
        <th>${openLabel}</th><th>Velocidad ${spdW}</th><th>Puntaje</th><th>Nota</th><th>Insignias</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => html`<tr>
          <td class="rk-pos"><b class=${light ? '' : 'gold'} style="font-size:1.2em">${r.position}</b></td>
          <td class="rk-name"><b>${r.name}</b>${r.tiebreak ? html`<div class="tiny" style="opacity:.75">${r.tiebreak}</div>` : null}</td>
          <td class="rk-lock">${r.solo ? html`<${Hearts} lost=${r.livesLost} total=${r.lives ?? 3} />` : html`<${LockPill} lock=${r.lock} />`}</td>
          <td class="rk-acc" data-label="Aciertos">${r.correct}/${r.total} (${dec(r.breakdown.accuracyPoints, 0)})</td>
          <td class="rk-accp" data-label=${`Acierto ${accW}`}>${dec(r.breakdown.accuracy5)} → <b>${dec(r.breakdown.accuracyPart)}</b></td>
          <td class="rk-open" data-label=${openLabel}>${r.opened ? ordinal(r.breakdown.speedPosition)
            : r.closedBy === 'eliminated' ? html`<span title="Eliminado"><${Icon} name="x" size=${14} /></span>`
            : r.closedBy === 'time' ? html`<span title="Tiempo agotado"><${Icon} name="clock" size=${14} /></span>` : '—'}</td>
          <td class="rk-spd" data-label=${`Velocidad ${spdW}`}>${dec(r.breakdown.speed, 1)} → <b>${dec(r.breakdown.speedPart)}</b></td>
          <td class="rk-score" data-label="Puntaje">${dec(r.score)}</td>
          <td class="rk-grade"><span class="grade-chip">${grade(r.grade)}</span></td>
          <td class="rk-badges small" data-label="Insignias">${r.badges.map((b) => b.label).join(' · ') || '—'}</td>
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
  return html`<div class="debate-grid">
    <div class="card stack">
      <h2 style="font-size:1.5em">Las preguntas que más costaron</h2>
      ${hardest.length === 0 ? html`<p class="muted">No hubo respuestas.</p>` : null}
      ${hardest.map((s, i) => html`<div class=${`stack sm c-${LOCKS[s.lock].key}`} style="gap:.4em">
        <div class="row nowrap"><${LevelIcon} lock=${s.lock} size=${36} number=${false} /><b class="grow">${i === 0 ? 'La más difícil: ' : ''}<${MathText} text=${s.prompt} /></b></div>
        <div class="row nowrap"><div class="stat-bar grow"><i style=${`width:${s.accuracy}%`}></i></div><b class="num">${s.accuracy} %</b></div>
        <span class="small muted">${s.correct} de ${s.attempts} ${pub.results.mode === 'chaos' ? 'jugadores' : 'equipos'} acertaron</span>
      </div>`)}
    </div>
    <div class="card stack center" style="justify-items:center">
      <span class="pill">Mini debate · 1 minuto</span>
      <h2 style="font-size:2em">¿Qué fue lo más difícil?</h2>
      <p class="muted">${pub.results.mode === 'chaos' ? 'Los sobrevivientes cuentan qué tema los puso en aprietos y cómo lo resolvieron.' : 'Un voluntario por equipo cuenta qué candado les costó más y por qué.'}</p>
      <${Countdown} ms=${left} big />
      <button class="btn" onClick=${() => setEndAt(Date.now() + 60_000)}>${endAt ? 'Reiniciar minuto' : 'Iniciar minuto'}</button>
      <p class="small muted">Todos reciben su certificado de <b class="gold">Científico de Datos</b> desde su celular.</p>
    </div>
  </div>`;
}
