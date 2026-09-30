import { html, useEffect, useRef, useState } from '../lib/html.js';
import { useConnection, useKeepAlive } from '../lib/connection.js';
import { remainingFor, useTick } from '../lib/clock.js';
import { LOCKS, dec, grade, mmss, ordinal, phaseLabel } from '../lib/format.js';
import { ConnectionBanner, Countdown, Footer, Hearts, Icon, LevelIcon, Padlock, Toasts, useToasts } from '../components/ui.js';
import { Login } from './moderator.js';

const KEY = 'erlab:modkey';
const ROOM = 'erlab:modroom';

/** Vista de espectador: ranking y puntajes en vivo. Usa la clave del moderador, pero no puede modificar nada. */
export function SpectatorApp() {
  const [key, setKey] = useState(localStorage.getItem(KEY) || '');
  const [code, setCode] = useState((new URLSearchParams(location.search).get('sala') || localStorage.getItem(ROOM) || '').toUpperCase());
  if (!key) {
    return html`<${Login} label="Ranking en vivo" onKey=${(k) => {
      localStorage.setItem(KEY, k);
      setKey(k);
    }} />`;
  }
  if (!code) return html`<${AskCode} onCode=${(c) => {
    history.replaceState(null, '', `/espectador?sala=${c}`);
    setCode(c);
  }} />`;
  return html`<${Spectator} modKey=${key} code=${code} onBadKey=${() => {
    localStorage.removeItem(KEY);
    setKey('');
  }} onBadRoom=${() => {
    history.replaceState(null, '', '/espectador');
    setCode('');
  }} />`;
}

function AskCode({ onCode }) {
  const [v, setV] = useState('');
  return html`<div class="theme-dark"><form class="cover" onSubmit=${(e) => {
    e.preventDefault();
    if (v.trim()) onCode(v.trim().toUpperCase());
  }}>
    <span class="pill">Ranking en vivo</span>
    <h1>¿Qué sala quieres seguir?</h1>
    <input class="input code" value=${v} onInput=${(e) => setV(e.target.value.toUpperCase())} placeholder="CÓDIGO" maxlength="6" aria-label="Código de la sala" />
    <button class="btn lg">Ver ranking</button>
  </form></div>`;
}

function Spectator({ modKey, code, onBadKey, onBadRoom }) {
  const [toasts, toast] = useToasts();
  const [roomError, setRoomError] = useState('');
  useKeepAlive(true);
  const conn = useConnection({ role: 'moderator', key: modKey }, {
    onEvent: (ev) => {
      if (ev.type === 'opened') toast(ev.solo ? `${ev.name} sobrevivió al Caos (${ordinal(ev.seq)})` : `«${ev.name}» abrió el candado ${ev.lock} (${ordinal(ev.seq)})`, { icon: 'unlock' });
      if (ev.type === 'eliminated') toast(`${ev.name} quedó eliminado · ${ev.alive} de ${ev.total} en pie`, { icon: 'heart', group: 'out' });
      if (ev.type === 'timeout') toast(`Tiempo agotado: «${ev.name}»`, { icon: 'clock' });
    },
  });

  useEffect(() => {
    if (conn.status !== 'online') return;
    conn.call('mod:watch', { code }).then((r) => setRoomError(r.ok ? '' : r.error || 'No se encontró la sala.'));
  }, [conn.status, code]);

  useEffect(() => {
    if (conn.fatal?.code === 'CLAVE_INVALIDA') onBadKey();
  }, [conn.fatal]);
  if (roomError) {
    return html`<div class="theme-dark"><div class="cover notice">
      <${Padlock} color="#8890c4" size=${96} />
      <h1>${roomError}</h1>
      <p class="muted">Revisa el código o abre otra sala para seguir el ranking.</p>
      <button class="btn lg" onClick=${onBadRoom}>Elegir otra sala</button>
    </div></div>`;
  }
  const mod = conn.mod && conn.mod.code === code ? conn.mod : null;
  if (!mod) return html`<div class="theme-dark" style="display:grid;place-items:center"><p class="muted waiting-dots">Conectando</p></div>`;

  return html`<div class="theme-dark">
    <div class="spectator">
      <header class="spec-head">
        <div class="row between nowrap">
          <span class="pill">Ranking en vivo · ${mod.code}</span>
          <span class=${`pill ${mod.phase === 'running' ? 'ok' : mod.phase === 'paused' ? 'l3' : 'ghost'}`}>${phaseLabel(mod.phase)}</span>
        </div>
        <h1 class="spec-title">${mod.title}</h1>
        ${mod.phase === 'running' || mod.phase === 'paused' ? html`<${LockClocks} mod=${mod} />` : null}
      </header>
      <${Body} mod=${mod} />
      <${Footer} />
    </div>
    <${Toasts} toasts=${toasts} />
    <${ConnectionBanner} status=${conn.status} />
  </div>`;
}

export function LockClocks({ mod }) {
  useTick(500, mod.phase === 'running');
  const used = new Set(mod.teams.map((t) => t.lock));
  return html`<div class="spec-clocks">
    ${mod.locks.filter((l) => used.has(l.id)).map((l) => html`<div class=${`spec-clock c-${LOCKS[l.id].key}`}>
      <${LevelIcon} lock=${l.id} size=${28} number=${false} />
      <span class="tiny">${l.id === 0 ? 'Caos' : `C${l.id}`}</span>
      <${Countdown} ms=${remainingFor(mod, l.id)} paused=${mod.phase === 'paused'} />
    </div>`)}
  </div>`;
}

export function fromResults(results) {
  return results.teams.map((r) => ({
    teamId: r.teamId,
    name: r.name,
    lock: r.lock,
    solo: !!r.solo,
    lives: r.lives,
    livesLost: r.livesLost ?? 0,
    correct: r.correct,
    total: r.total,
    answered: r.answered,
    finishSeq: r.finishSeq,
    elapsedMs: r.elapsedMs,
    status: r.opened ? 'opened' : r.closedBy ?? 'time',
    speed: r.breakdown.speed,
    speedProjected: false,
    accuracyPart: r.breakdown.accuracyPart,
    speedPart: r.breakdown.speedPart,
    score: r.score,
    grade: r.grade,
    maxScore: r.score,
    position: r.position,
    tiebreak: r.tiebreak,
  }));
}

function Body({ mod }) {
  if (mod.phase === 'lobby') {
    return html`<main class="card stack center" style="justify-items:center">
      <${Icon} name="users" size=${40} />
      <h2>La partida aún no empieza</h2>
      <p class="muted" style="margin:0">${mod.players.length} jugadores · ${mod.config.mode === 'chaos' ? 'modo Caos' : `${mod.teams.length} equipos`}. El ranking aparecerá aquí en cuanto el moderador pulse <b>Iniciar</b>.</p>
    </main>`;
  }
  const finished = mod.phase === 'finished' && mod.results;
  const rows = finished ? fromResults(mod.results) : mod.live?.teams ?? [];
  const weights = finished ? mod.results.teams[0]?.breakdown.weights : mod.live?.weights;
  return html`<main class="stack sm">
    ${finished
      ? html`<div class=${mod.podiumRevealed ? 'ok-box' : 'warn-box'}>
          ${mod.podiumRevealed ? 'Resultado final (el podio ya se reveló en el proyector).' : html`<b>Resultado final.</b> El podio aún no se revela en el proyector: ¡no lo cuentes todavía!`}
        </div>`
      : null}
    <${RankList} rows=${rows} live=${!finished} />
    ${weights ? html`<${Legend} weights=${weights} live=${!finished} nextSpeed=${mod.live?.nextSpeed} />` : null}
  </main>`;
}

/** Recuerda la posición anterior de cada equipo para mostrar si subió o bajó unos segundos cuando cambia el orden. */
function useMoves(rows) {
  const prev = useRef(null);
  const [moves, setMoves] = useState({});
  const order = rows.map((r) => r.teamId).join('|');
  useEffect(() => {
    const before = prev.current;
    prev.current = new Map(rows.map((r) => [r.teamId, r.position]));
    if (!before) return undefined;
    const next = {};
    for (const r of rows) {
      const was = before.get(r.teamId);
      if (was && was !== r.position) next[r.teamId] = was - r.position;
    }
    if (Object.keys(next).length === 0) return undefined;
    setMoves(next);
    const t = setTimeout(() => setMoves({}), 6000);
    return () => clearTimeout(t);
  }, [order]);
  return moves;
}

export function RankList({ rows, live }) {
  const moves = useMoves(rows);
  if (rows.length === 0) return html`<p class="muted center">Sin equipos en juego.</p>`;
  return html`<ol class="spec-list" aria-label="Ranking de equipos">
    ${rows.map((r) => html`<${RankRow} key=${r.teamId} r=${r} move=${moves[r.teamId]} live=${live} />`)}
  </ol>`;
}

function statusText(r) {
  if (r.status === 'opened') return html`<span class="spec-status ok ico-text"><${Icon} name="unlock" size=${14} />${r.solo ? 'Sobrevivió' : 'Abrió'} ${ordinal(r.finishSeq)} · ${mmss(r.elapsedMs)}</span>`;
  if (r.status === 'eliminated') return html`<span class="spec-status bad ico-text"><${Icon} name="x" size=${14} />Eliminado · resistió ${mmss(r.elapsedMs)}</span>`;
  if (r.status === 'time') return html`<span class="spec-status bad ico-text"><${Icon} name="clock" size=${14} />Tiempo agotado</span>`;
  if (r.status === 'moderator') return html`<span class="spec-status bad ico-text"><${Icon} name="lock" size=${14} />Cerrado por el moderador</span>`;
  return html`<span class="spec-status ico-text"><${Icon} name="bolt" size=${14} />Jugando · pregunta ${Math.min(r.answered + 1, r.total)} de ${r.total}</span>`;
}

function RankRow({ r, move, live }) {
  const answeredPct = r.total ? (r.answered / r.total) * 100 : 0;
  const correctPct = r.total ? (r.correct / r.total) * 100 : 0;
  return html`<li class=${`spec-row c-${LOCKS[r.lock].key} ${r.position <= 3 ? `top top${r.position}` : ''} ${move > 0 ? 'moved-up' : move < 0 ? 'moved-down' : ''}`}>
    <div class="spec-pos" aria-label=${`Puesto ${r.position}`}>
      <span>${r.position}</span>
      ${move ? html`<span class=${`spec-move ${move > 0 ? 'up' : 'down'}`}><${Icon} name=${move > 0 ? 'caretUp' : 'caretDown'} size=${10} />${Math.abs(move)}</span>` : null}
    </div>
    <div class="spec-main">
      <div class="spec-name">${r.name}</div>
      <div class="row" style="gap:.35rem .5rem">
        ${r.solo
          ? html`<${Hearts} lost=${r.livesLost} total=${r.lives ?? 3} />`
          : html`<span class=${`pill ${LOCKS[r.lock].key}`}>C${r.lock} · ${LOCKS[r.lock].short}</span>`}
        ${statusText(r)}
      </div>
      <div class="spec-bar" role="img" aria-label=${`${r.correct} aciertos de ${r.answered} respondidas, ${r.total} en total`}>
        <i class="answered" style=${`width:${answeredPct}%`}></i>
        <i class="correct" style=${`width:${correctPct}%`}></i>
      </div>
      <div class="spec-detail">
        <span><b>${r.correct}/${r.total}</b> aciertos → ${dec(r.accuracyPart)}</span>
        <span>Velocidad ${dec(r.speed, 1)}${r.speedProjected ? '*' : ''} → ${dec(r.speedPart)}</span>
        ${live && r.status === 'playing' && r.maxScore > r.score ? html`<span class="muted">Techo ${grade(r.maxScore)}</span>` : null}
      </div>
      ${r.tiebreak ? html`<div class="tiny muted">${r.tiebreak}</div>` : null}
    </div>
    <div class="spec-grade">
      <span class="grade-chip">${grade(r.grade)}</span>
      <span class="tiny muted num">${dec(r.score)}</span>
    </div>
  </li>`;
}

export function Legend({ weights, live, nextSpeed }) {
  return html`<p class="tiny muted spec-legend">
    Nota = ${Math.round(weights.accuracy * 100)} % × aciertos (escala 0–5) + ${Math.round(weights.speed * 100)} % × velocidad por orden de apertura.
    ${live ? html` <b>*</b> Quien sigue jugando recibe la velocidad que tendría si abriera ahora (${dec(nextSpeed, 1)}); las preguntas sin responder cuentan como no acertadas. <b>Techo</b>: nota si acierta todo lo que le falta y abre ya.` : null}
  </p>`;
}
