import { html, useEffect, useMemo, useRef, useState } from '../lib/html.js';
import { api, useConnection } from '../lib/connection.js';
import { gameElapsed, remainingFor, useTick } from '../lib/clock.js';
import { LETTERS, LOCKS, grade, dec, ordinal, mmss } from '../lib/format.js';
import { sfx, unlockAudio, vibrate, isMuted, setMuted } from '../lib/sound.js';
import {
  Avatar, BadgeList, Confetti, ConnectionBanner, Countdown, Difficulty, Footer, Hearts, Icon, LevelIcon,
  LockPill, MemberChip, Padlock, Pins, Rich, SoundToggle, Toasts, XpBar, useToasts,
} from '../components/ui.js';
import { rankTitle } from './shared.js';

const SESSION_KEY = 'erlab:session';

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function StudentApp() {
  const params = new URLSearchParams(location.search);
  const urlCode = (params.get('sala') || '').toUpperCase();
  const [session, setSession] = useState(() => {
    const s = loadSession();
    return s && (!urlCode || urlCode === s.code) ? s : null;
  });

  const save = (s) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
    history.replaceState(null, '', `/?sala=${s.code}`);
  };
  const clear = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  if (!session) return html`<${JoinScreen} initialCode=${urlCode || loadSession()?.code || ''} onJoined=${save} />`;
  return html`<${PlayScreen} session=${session} onExit=${clear} />`;
}

// ---------------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------------
function JoinScreen({ initialCode, onJoined }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(localStorage.getItem('erlab:lastName') || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    unlockAudio();
    setError('');
    const c = code.trim().toUpperCase();
    if (c.length < 4) return setError('Escribe el código de la sala que aparece en el proyector.');
    if (name.trim().length < 2) return setError('Escribe tu nombre (mínimo 2 letras).');
    setBusy(true);
    const res = await api(`/api/rooms/${encodeURIComponent(c)}/join`, { method: 'POST', body: { name } });
    setBusy(false);
    if (!res.ok) return setError(res.error || 'No se pudo entrar.');
    localStorage.setItem('erlab:lastName', name.trim());
    onJoined({ code: res.code, token: res.token, playerId: res.playerId, name: res.name });
  }

  return html`<div class="theme-dark">
    <form class="cover" onSubmit=${submit} novalidate>
      <div class="row between">
        <span class="pill">Press start <${Icon} name="play" size=${12} /></span>
        <div class="dots" aria-hidden="true"></div>
      </div>
      <div class="stack sm">
        <h1 class="cover-title">Escape Room Estadístico <span>El Laboratorio Sellado</span></h1>
        <p class="muted">4 candados · 5 preguntas cada uno · un solo equipo escapa primero.</p>
      </div>
      <div class="path-icons" aria-hidden="true">
        ${[1, 2, 3, 4].map((l, i) => html`${i ? html`<span class="sep"></span>` : null}<${LevelIcon} lock=${l} size=${44} />`)}
        <span class="sep"></span><${LevelIcon} boss size=${48} />
      </div>
      <div class="card stack">
        <div class="field">
          <label for="code">Código de la sala</label>
          <input id="code" class="input code" value=${code} maxlength="6" autocomplete="off" autocapitalize="characters"
            inputmode="text" placeholder="ABCDE" onInput=${(e) => setCode(e.target.value.toUpperCase())} />
        </div>
        <div class="field">
          <label for="name">Tu nombre</label>
          <input id="name" class="input" value=${name} maxlength="32" autocomplete="given-name" placeholder="Ej.: Laura Gómez"
            onInput=${(e) => setName(e.target.value)} />
        </div>
        ${error ? html`<div class="error-box" role="alert">${error}</div>` : null}
        <button class="btn block lg" disabled=${busy}>${busy ? 'Entrando…' : html`Entrar al laboratorio <${Icon} name="play" size=${16} />`}</button>
      </div>
      <${Footer} />
    </form>
  </div>`;
}

// ---------------------------------------------------------------------------
// Sesión de juego
// ---------------------------------------------------------------------------
function PlayScreen({ session, onExit }) {
  const [toasts, toast] = useToasts();
  const [flash, setFlash] = useState(null);
  const [muted, setMutedState] = useState(isMuted());
  const flashTimer = useRef(null);

  const showFlash = (f) => {
    clearTimeout(flashTimer.current);
    setFlash({ ...f, key: Math.random() });
    flashTimer.current = setTimeout(() => setFlash(null), 1650);
  };

  const conn = useConnection(
    { role: 'player', code: session.code, token: session.token },
    {
      onEvent: (ev) => {
        const myTeam = connRef.current?.team?.teamId;
        if (ev.type === 'answer') {
          if (ev.correct === true) {
            sfx.correct();
            vibrate(60);
            showFlash({ kind: 'ok', title: '¡Correcto!', sub: `+100 XP · confirmó ${ev.byName}` });
          } else if (ev.correct === false) {
            sfx.wrong();
            vibrate([80, 60, 80]);
            showFlash({ kind: 'bad', title: 'Incorrecto', sub: `Confirmó ${ev.byName}. ¡Sigan!` });
          } else {
            sfx.neutral();
            showFlash({ kind: 'neutral', title: 'Respuesta registrada', sub: 'Los resultados se revelan al final' });
          }
        } else if (ev.type === 'opened') {
          if (ev.teamId === myTeam) {
            sfx.unlock();
            vibrate([100, 50, 100, 50, 200]);
          } else {
            toast(`«${ev.name}» abrió el candado ${ev.lock} (${ordinal(ev.seq)})`, { icon: 'unlock' });
          }
        } else if (ev.type === 'started') {
          sfx.start();
          vibrate(150);
        } else if (ev.type === 'time') {
          toast(`${ev.seconds > 0 ? '+' : ''}${ev.seconds} s ${ev.lock === 'all' ? 'para todos' : `para el candado ${ev.lock}`}`, { icon: 'clock' });
        } else if (ev.type === 'timeout' && ev.teamId === myTeam) {
          sfx.alarm();
          vibrate([300, 100, 300]);
        } else if (ev.type === 'captain') {
          toast(`${ev.byName} tomó el mando de esta pregunta${ev.previousName ? ` (antes: ${ev.previousName})` : ''}.`, { icon: 'crown' });
        } else if (ev.type === 'podium') {
          sfx.fanfare();
        }
      },
    },
  );
  const connRef = useRef(conn);
  connRef.current = conn;

  if (conn.fatal) {
    return html`<div class="theme-dark"><div class="cover" style="justify-items:center;text-align:center">
      <${Padlock} color="#d62f4f" size=${110} />
      <h1>No pudimos reconectarte</h1>
      <p class="muted">${conn.fatal.message}</p>
      <button class="btn block lg" onClick=${onExit}>Volver a entrar</button>
    </div></div>`;
  }

  const pub = conn.public;
  const team = conn.team && pub?.teams.some((t) => t.id === conn.team.teamId && t.members.some((m) => m.id === session.playerId)) ? conn.team : null;
  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  let body;
  if (!pub) {
    body = html`<div class="cover center"><p class="muted waiting-dots">Conectando con el laboratorio</p></div>`;
  } else if (pub.phase === 'lobby') {
    body = html`<${Lobby} pub=${pub} team=${team} session=${session} onExit=${async () => {
      await conn.call('player:leave');
      onExit();
    }} muted=${muted} toggleSound=${toggleSound} />`;
  } else if (!team || !team.started) {
    body = html`<${NoTeam} pub=${pub} session=${session} />`;
  } else if (pub.phase === 'finished' && pub.podiumRevealed && pub.results) {
    body = html`<${Results} pub=${pub} team=${team} session=${session} />`;
  } else if (team.closed || pub.phase === 'finished') {
    body = html`<${LockClosed} pub=${pub} team=${team} session=${session} muted=${muted} toggleSound=${toggleSound} />`;
  } else {
    body = html`<${Game} pub=${pub} team=${team} session=${session} call=${conn.call} toast=${toast} muted=${muted} toggleSound=${toggleSound} />`;
  }

  return html`<div class="theme-dark">
    ${body}
    ${pub?.phase === 'paused'
      ? html`<div class="overlay" role="alertdialog" aria-label="Partida en pausa"><div class="panel">
          <span class="lvl-icon c-boss" style="--size:84px"><${Icon} name="pause" size=${40} /></span>
          <h2 class="display">Pausa</h2>
          <p class="muted">${pub.autoPaused ? 'El servidor se reinició. Tu progreso está guardado: el moderador reanudará en un momento.' : 'El moderador pausó la partida. El reloj está detenido.'}</p>
        </div></div>`
      : null}
    ${flash
      ? html`<div key=${flash.key} class=${`flash ${flash.kind}`} role="status" aria-live="assertive">
          <div class="badge-big">
            <span class="big-icon">${flash.kind === 'ok' ? html`<${Icon} name="check" size=${44} />` : flash.kind === 'bad' ? html`<${Icon} name="x" size=${44} />` : html`<${Icon} name="lock" size=${40} />`}</span>
            <strong style="font-size:1.6rem">${flash.title}</strong>
            <span class="muted small">${flash.sub}</span>
          </div>
        </div>`
      : null}
    <${Toasts} toasts=${toasts} />
    <${ConnectionBanner} status=${conn.status} />
  </div>`;
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------
function HowToPlay({ pub }) {
  const w = pub.config.scoring.weights;
  return html`<div class="card stack sm">
    <h3>Cómo se juega</h3>
    <ol class="small" style="margin:0;padding-left:1.2rem;display:grid;gap:.35rem">
      <li><b>Todos votan</b> la respuesta desde su celular; ven en vivo qué eligió cada compañero.</li>
      <li>El <b>capitán</b> <${Icon} name="crown" size=${14} /> de cada pregunta confirma. La capitanía rota: cada uno confirma al menos una vez.</li>
      <li>Respondan las 5 preguntas para <b>abrir el candado</b>, aunque fallen alguna. ¡Ojo con el reloj!</li>
    </ol>
    <p class="small muted" style="margin:0">Nota = <b class="gold">${Math.round(w.accuracy * 100)} % acierto</b> (20 puntos por pregunta) + <b class="gold">${Math.round(w.speed * 100)} % velocidad</b> (1.º en abrir: 5,0 · 2.º: 4,5 · 3.º: 4,0 · 4.º: 3,5).</p>
  </div>`;
}

function TeamCard({ pub, team, session, captainId }) {
  const lock = pub.locks.find((l) => l.id === team.lock);
  return html`<div class=${`card accent c-${LOCKS[team.lock].key} stack`}>
    <div class="row nowrap">
      <${LevelIcon} lock=${team.lock} size=${60} />
      <div class="grow">
        <div class="label">Tu equipo</div>
        <h2 style="font-size:1.4rem">${team.name}</h2>
        <${LockPill} lock=${team.lock} name=${lock?.name} />
      </div>
    </div>
    ${lock ? html`<div><strong class="gold">«${lock.title}»</strong><p class="small muted" style="margin:.25rem 0 0">${lock.story}</p></div>` : null}
    <div class="row" style="gap:.45rem">
      ${team.members.map((m) => html`<${MemberChip} member=${m} me=${m.id === session.playerId} captain=${m.id === captainId} />`)}
    </div>
  </div>`;
}

function Lobby({ pub, team, session, onExit, muted, toggleSound }) {
  const pubTeam = pub.teams.find((t) => t.members.some((m) => m.id === session.playerId));
  return html`<div class="wrap stack">
    <div class="row between">
      <span class="pill">Lobby · Sala ${pub.code}</span>
      <${SoundToggle} muted=${muted} onToggle=${toggleSound} />
    </div>
    <div class="row nowrap">
      <${Avatar} id=${session.playerId} name=${session.name} size=${54} />
      <div>
        <h1 style="font-size:1.5rem">¡Estás dentro, ${session.name.split(' ')[0]}!</h1>
        <p class="muted small" style="margin:0">${pub.players.length} ${pub.players.length === 1 ? 'científico conectado' : 'científicos conectados'}</p>
      </div>
    </div>
    ${pubTeam
      ? html`<${TeamCard} pub=${pub} team=${pubTeam} session=${session} />`
      : html`<div class="card center stack sm" style="justify-items:center"><${Padlock} size=${80} /><p><b>Esperando a que el moderador arme los equipos</b><span class="waiting-dots"></span></p><p class="small muted">Equipos de hasta ${pub.config.teamSize}. No cierres esta página.</p></div>`}
    <${HowToPlay} pub=${pub} />
    <button class="btn link small muted" onClick=${onExit}>Salir de la sala</button>
    <${Footer} />
  </div>`;
}

function NoTeam({ pub }) {
  return html`<div class="cover center" style="justify-items:center">
    <${Padlock} size=${90} />
    <h2>La partida ya empezó</h2>
    <p class="muted">El moderador te asignará a un equipo en un momento<span class="waiting-dots"></span></p>
    <p class="small muted">Sala ${pub.code}</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Juego
// ---------------------------------------------------------------------------
function GameHeader({ pub, team, muted, toggleSound }) {
  useTick(250, pub.phase === 'running');
  const remaining = remainingFor(pub, team.lock);
  const lastTick = useRef(null);
  const secs = Math.ceil(remaining / 1000);
  useEffect(() => {
    if (pub.phase !== 'running' || team.closed) return;
    if (secs <= 10 && secs > 0 && lastTick.current !== secs) sfx.tick();
    lastTick.current = secs;
  }, [secs]);
  const lock = pub.locks.find((l) => l.id === team.lock);
  const wrong = team.history.filter((h) => h.correct === false).length;
  return html`<div class="game-top">
    <div class="hud">
      <span class=${`pill ${LOCKS[team.lock].key}`} title=${`Candado ${team.lock} · ${lock?.name ?? LOCKS[team.lock].short}`}>
        <span class="pill-long">Candado </span><span class="pill-short">C</span>${team.lock} · ${lock?.name ?? LOCKS[team.lock].short}
      </span>
      <div class="row nowrap" style="gap:.6rem">
        ${team.correct !== null ? html`<${Hearts} lost=${Math.min(3, wrong)} />` : null}
        <${SoundToggle} muted=${muted} onToggle=${toggleSound} />
      </div>
    </div>
    <div style="width:min(100%,720px);margin:0 auto;padding:0 1rem" class="stack sm">
      <div class="row between nowrap">
        <${Countdown} ms=${remaining} paused=${pub.phase === 'paused'} />
        ${team.xp !== null ? html`<${XpBar} xp=${team.xp} />` : html`<span class="small muted">${team.history.length}/${team.total} respondidas</span>`}
      </div>
      <${Pins} total=${team.total} answers=${team.history} current=${team.current} />
    </div>
  </div>`;
}

function normalizeNum(v) {
  return String(v).trim().replace(',', '.').replace('−', '-');
}

function Game({ pub, team, session, call, toast, muted, toggleSound }) {
  const q = team.question;
  const me = session.playerId;
  const isCaptain = team.captainId === me;
  const captain = team.members.find((m) => m.id === team.captainId);
  const serverVote = team.votes.find((v) => v.playerId === me)?.value;
  const [optimistic, setOptimistic] = useState(null);
  const [numInput, setNumInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Evita que un toque destinado a la pregunta anterior caiga en la nueva cuando el capitán confirma.
  const readyAt = useRef(0);

  useEffect(() => {
    setOptimistic(null);
    setNumInput('');
    setSubmitting(false);
    readyAt.current = Date.now() + 700;
  }, [q?.index]);

  const myVote = optimistic && optimistic.q === q.index ? optimistic.value : serverVote;
  const nameOf = (id) => team.members.find((m) => m.id === id);

  async function vote(value) {
    if (Date.now() < readyAt.current) return;
    sfx.tap();
    setOptimistic({ q: q.index, value });
    const res = await call('player:vote', { q: q.index, value });
    if (!res.ok) {
      setOptimistic(null);
      toast(res.error, { kind: 'error' });
    }
  }

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    const res = await call('player:submit', { q: q.index });
    if (!res.ok) {
      setSubmitting(false);
      toast(res.error, { kind: 'error' });
    }
  }

  const votesByValue = useMemo(() => {
    const map = new Map();
    for (const v of team.votes) {
      const key = q.type === 'mc' ? v.value : normalizeNum(v.value);
      if (!map.has(key)) map.set(key, { value: v.value, voters: [] });
      map.get(key).voters.push(v.playerId);
    }
    return map;
  }, [team.votes, q?.type]);

  const top = [...votesByValue.values()].sort((a, b) => b.voters.length - a.voters.length)[0];
  const online = team.members.filter((m) => m.online).length;
  const myKey = myVote === undefined || myVote === null ? null : q.type === 'mc' ? myVote : normalizeNum(myVote);
  const disagree = isCaptain && top && myKey !== null && top.voters.length > (votesByValue.get(myKey)?.voters.length ?? 0);
  const display = (v) => (q.type === 'mc' ? `${LETTERS[v]}` : `${v}${q.unit ? ` ${q.unit}` : ''}`);

  useTick(1000, !isCaptain && team.claimAtMs !== null);
  const claimIn = team.claimAtMs === null ? null : Math.ceil((team.claimAtMs - gameElapsed(pub.clock)) / 1000);
  const [claiming, setClaiming] = useState(false);
  async function claim() {
    setClaiming(true);
    const res = await call('player:claimCaptain', { q: q.index });
    setClaiming(false);
    if (!res.ok) toast(res.error, { kind: 'error' });
  }

  return html`<div class="game">
    <${GameHeader} pub=${pub} team=${team} muted=${muted} toggleSound=${toggleSound} />
    <main class="game-main">
      <div class="row nowrap" style="gap:.4rem;overflow-x:auto;padding-top:10px">
        ${team.members.map((m) => html`<${Avatar} id=${m.id} name=${m.name} size=${34} online=${m.online} captain=${m.id === team.captainId}
          title=${`${m.name}${m.id === team.captainId ? ' (capitán)' : ''}${team.votes.some((v) => v.playerId === m.id) ? ' · ya votó' : ''}`} />`)}
        <span class="small muted" style="margin-left:.4rem;white-space:nowrap">${team.votes.length}/${online} votaron</span>
      </div>
      ${team.feedbackMode === 'instant' && team.history.length && team.history[team.history.length - 1].solution
        ? html`<${LastExplanation} item=${team.history[team.history.length - 1]} />`
        : null}
      <section class="question-card" aria-labelledby="qprompt">
        <div class="question-meta">
          <span>Pregunta ${q.index + 1} de ${team.total}</span>
          <${Difficulty} level=${q.difficulty} />
        </div>
        <p id="qprompt" class="question-prompt" style="margin:0"><${Rich} text=${q.prompt} /></p>
        ${q.data ? html`<div class="data-box"><${Rich} text=${q.data} /></div>` : null}
        ${q.hint ? html`<p class="hint"><b>Pista:</b> ${q.hint}</p>` : null}
      </section>

      ${q.type === 'mc'
        ? html`<div class=${`options ${q.options.every((o) => o.length < 40) ? 'two' : ''}`} role="radiogroup" aria-label="Opciones">
            ${q.options.map((opt, i) => {
              const voters = votesByValue.get(i)?.voters ?? [];
              const captainPick = team.votes.find((v) => v.playerId === team.captainId)?.value === i;
              return html`<button key=${i} role="radio" aria-checked=${myVote === i} class=${`option ${myVote === i ? 'mine' : ''} ${captainPick ? 'captain-pick' : ''}`}
                onClick=${() => vote(i)} disabled=${submitting}>
                <span class="letter">${LETTERS[i]}</span>
                <span><${Rich} text=${opt} /></span>
                ${voters.length
                  ? html`<span class="voters">${voters.map((id) => nameOf(id) && html`<${Avatar} id=${id} name=${nameOf(id).name} size=${24} />`)}</span>`
                  : null}
              </button>`;
            })}
          </div>`
        : html`<div class="stack sm">
            <form class="numeric-row" onSubmit=${(e) => {
              e.preventDefault();
              if (numInput.trim()) vote(numInput.trim());
            }}>
              <label class="sr-only" for="num">Tu respuesta numérica</label>
              <input id="num" class="input" inputmode="decimal" autocomplete="off" placeholder=${q.unit ? `Respuesta en ${q.unit}` : 'Tu respuesta'}
                value=${numInput} onInput=${(e) => setNumInput(e.target.value)} maxlength="20" />
              <button class="btn" disabled=${!numInput.trim() || submitting}>Proponer</button>
            </form>
            <p class="tiny muted" style="margin:0">Puedes usar punto o coma decimal. Toca una propuesta para apoyarla.</p>
            <div class="proposals">
              ${[...votesByValue.entries()].sort((a, b) => b[1].voters.length - a[1].voters.length).map(([key, g]) => html`
                <button class=${`proposal ${myKey === key ? 'mine' : ''}`} onClick=${() => vote(g.value)} disabled=${submitting}>
                  <span class="val">${g.value}${q.unit ? html` <span class="small muted">${q.unit}</span>` : null}</span>
                  <span class="row nowrap" style="gap:4px">${g.voters.map((id) => nameOf(id) && html`<${Avatar} id=${id} name=${nameOf(id).name} size=${24} captain=${id === team.captainId} />`)}</span>
                </button>`)}
              ${votesByValue.size === 0 ? html`<p class="small muted center">Aún no hay propuestas. ¡Calculen y propongan!</p>` : null}
            </div>
          </div>`}
    </main>

    <div class="captain-bar">
      <div class="inner">
        ${isCaptain
          ? html`
            <div class="captain-info"><${Icon} name="crown" size=${18} cls="gold" /> <span><b>Eres el capitán</b> de esta pregunta: tú confirmas.</span></div>
            ${disagree ? html`<div class="small" style="color:#ffd27a">La mayoría propone <b>${display(top.value)}</b>. ¿Seguro?</div>` : null}
            <button class="btn block lg" onClick=${confirm} disabled=${myKey === null || submitting || pub.phase !== 'running'}>
              ${submitting ? 'Confirmando…' : myKey === null ? 'Elige una respuesta' : html`Confirmar ${display(myVote)} <${Icon} name="lock" size=${16} />`}
            </button>`
          : html`
            <div class="captain-info">
              ${captain ? html`<${Avatar} id=${captain.id} name=${captain.name} size=${30} captain />` : null}
              <span>${captain ? html`<b>${captain.name}</b> confirma esta pregunta.` : 'Esperando capitán…'} ${myKey !== null ? html`Tu voto: <b class="gold">${display(myVote)}</b>` : 'Vota para ayudar.'}</span>
            </div>
            ${claimIn !== null && claimIn <= 0 && pub.phase === 'running'
              ? html`<button class="btn secondary sm block" onClick=${claim} disabled=${claiming}>
                  <${Icon} name="crown" size=${16} /> ¿${captain ? captain.name : 'El capitán'} no responde? Tomar el mando
                </button>`
              : null}`}
      </div>
    </div>
  </div>`;
}

function LastExplanation({ item }) {
  const q = item.question;
  const sol = item.solution;
  const right = q.type === 'mc' ? `${LETTERS[sol.correct]}. ${q.options[sol.correct]}` : `${sol.correct}${sol.unit ? ` ${sol.unit}` : ''}`;
  return html`<details class="card small" style=${`border-left:6px solid ${item.correct ? 'var(--green)' : 'var(--red)'}`}>
    <summary style="cursor:pointer;list-style:none;gap:.5rem" class="row nowrap">
      <span class=${`pill ${item.correct ? 'ok' : 'bad'}`}><${Icon} name=${item.correct ? 'check' : 'x'} size=${12} />P${item.index + 1}</span>
      <span class="grow">Ver explicación</span><span class="chev"><${Icon} name="chevron" size=${14} /></span>
    </summary>
    <p style="margin:.5rem 0 0">Correcta: <b class="gold">${right}</b></p>
    ${sol.explanation ? html`<p class="muted" style="margin:.3rem 0 0">${sol.explanation}</p>` : null}
  </details>`;
}

// ---------------------------------------------------------------------------
// Candado cerrado (abierto por el equipo, por tiempo o por el moderador)
// ---------------------------------------------------------------------------
export function ReviewList({ items }) {
  return html`<div class="stack sm">
    ${items.map((it) => {
      const q = it.question;
      const sol = it.solution;
      const yours = it.value === null || it.value === undefined ? 'Sin responder' : q.type === 'mc' ? `${LETTERS[it.value]}. ${q.options[it.value]}` : `${it.value}`;
      const right = sol ? (q.type === 'mc' ? `${LETTERS[sol.correct]}. ${q.options[sol.correct]}` : `${sol.correct}${sol.unit ? ` ${sol.unit}` : ''}`) : null;
      return html`<details class="card" style=${`border-left:6px solid ${it.correct ? 'var(--green)' : 'var(--red)'}`}>
        <summary style="cursor:pointer;list-style:none" class="row nowrap">
          <span class=${`pill ${it.correct ? 'ok' : 'bad'}`}><${Icon} name=${it.correct ? 'check' : 'x'} size=${12} />P${it.index + 1}</span>
          <span class="small grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${q.prompt}</span>
          <span class="chev"><${Icon} name="chevron" size=${14} /></span>
        </summary>
        <div class="stack sm" style="margin-top:.7rem">
          <p style="margin:0"><${Rich} text=${q.prompt} /></p>
          ${q.data ? html`<div class="data-box">${q.data}</div>` : null}
          <p class="small" style="margin:0">Respuesta del equipo: <b>${yours}</b>${it.byName ? html` <span class="muted">(confirmó ${it.byName})</span>` : null}</p>
          ${right ? html`<p class="small" style="margin:0">Respuesta correcta: <b class="gold">${right}</b></p>` : null}
          ${sol?.explanation ? html`<div class="ok-box small"><b>Paso a paso:</b> ${sol.explanation}</div>` : null}
        </div>
      </details>`;
    })}
  </div>`;
}

function MiniBoard({ pub, myTeamId }) {
  return html`<div class="card stack sm">
    <h3>Así van los demás</h3>
    ${pub.teams.map((t) => html`<div class="row nowrap" style="gap:.6rem">
      <${LevelIcon} lock=${t.lock} size=${30} number=${false} />
      <span class="grow small" style=${t.id === myTeamId ? 'font-weight:900;color:var(--gold)' : ''}>${t.name}</span>
      ${t.opened ? html`<span class="pill" style="font-size:.7rem"><${Icon} name="unlock" size=${12} />${ordinal(t.finishSeq)}</span>`
        : t.closedBy ? html`<span class="pill ghost" style="font-size:.7rem"><${Icon} name=${t.closedBy === 'time' ? 'clock' : 'lock'} size=${12} />cerrado</span>`
        : html`<span class="small muted num">${t.answered}/${t.total}</span>`}
    </div>`)}
  </div>`;
}

function LockClosed({ pub, team, session, muted, toggleSound }) {
  const opened = team.closedBy === null && team.finishSeq !== null;
  const [fire] = useState(() => (opened ? Date.now() : 0));
  const lock = pub.locks.find((l) => l.id === team.lock);
  const title = opened ? '¡Candado abierto!' : team.closedBy === 'time' ? 'Se acabó el tiempo' : 'Partida terminada';
  return html`<div class="wrap stack">
    ${opened ? html`<${Confetti} fire=${fire} />` : null}
    <div class="row between">
      <${LockPill} lock=${team.lock} name=${lock?.name} />
      <${SoundToggle} muted=${muted} onToggle=${toggleSound} />
    </div>
    <div class="card center stack" style="justify-items:center">
      <${Padlock} open=${opened} color=${opened ? '#ffc53d' : '#8890c4'} size=${120} />
      <h1 class="display" style="font-size:1.8rem">${title}</h1>
      ${opened
        ? html`<p style="margin:0">«${team.name}» abrió su candado en el puesto <b class="gold" style="font-size:1.3rem">${ordinal(team.finishSeq)}</b> · ${mmss(team.finishedAtMs)}</p>`
        : html`<p class="muted" style="margin:0">El candado se cerró con ${team.history.length} de ${team.total} preguntas respondidas.</p>`}
      ${team.correct !== null ? html`<div class="row" style="justify-content:center"><span class="pill ok">${team.correct}/${team.total} correctas</span><${XpBar} xp=${team.xp} /></div>` : null}
      ${pub.phase === 'finished'
        ? html`<p class="small gold" style="margin:0"><b>Todos los candados están cerrados. Miren el proyector: ¡se viene el podio!</b></p>`
        : html`<p class="small muted" style="margin:0">Esperando a que los demás equipos terminen<span class="waiting-dots"></span></p>`}
    </div>
    ${team.review
      ? html`<div class="stack sm"><h3>Revisión de su candado</h3><${ReviewList} items=${team.review} /></div>`
      : html`<div class="card small muted row nowrap" style="align-items:flex-start"><span class="gold"><${Icon} name="lock" size=${18} /></span><span>Las soluciones se desbloquean cuando todos los equipos del candado ${team.lock} terminen, para no dar pistas.</span></div>`}
    <${MiniBoard} pub=${pub} myTeamId=${team.teamId} />
    <${Footer} />
  </div>`;
}

// ---------------------------------------------------------------------------
// Resultados (tras revelar el podio)
// ---------------------------------------------------------------------------
export function BreakdownCard({ row, dark = true }) {
  const b = row.breakdown;
  return html`<div class="breakdown">
    <div class="line"><span>Acierto: ${row.correct}/${row.total} → ${dec(b.accuracyPoints, 0)}/100 = <b>${dec(b.accuracy5)}</b> sobre 5
      <div class="formula">× peso ${Math.round(b.weights.accuracy * 100)} %</div></span><b class="num">${dec(b.accuracyPart)}</b></div>
    <div class="line"><span>Velocidad: ${b.speedPosition ? `abrió ${ordinal(b.speedPosition)}` : row.closedBy === 'time' ? 'tiempo agotado' : 'no abrió'} → base <b>${dec(b.speed, 1)}</b>
      <div class="formula">× peso ${Math.round(b.weights.speed * 100)} %</div></span><b class="num">${dec(b.speedPart)}</b></div>
    <div class="line total"><span>Puntaje ${dec(row.score)} → Nota</span><span class="num">${grade(row.grade)}</span></div>
    ${row.tiebreak ? html`<p class=${`small ${dark ? 'muted' : ''}`} style="margin:0">${row.tiebreak}</p>` : null}
  </div>`;
}

function Results({ pub, team, session }) {
  const rows = pub.results.teams;
  const mine = rows.find((r) => r.teamId === team.teamId);
  const [fire] = useState(() => (mine && mine.position <= 3 ? Date.now() : 0));
  const title = mine ? rankTitle(mine.grade) : '';
  const certUrl = mine
    ? `/certificado?${new URLSearchParams({ nombre: session.name, equipo: mine.name, puesto: String(mine.position), rango: title, candado: String(mine.lock), insignias: mine.badges.map((b) => b.label).join('|') })}`
    : null;
  return html`<div class="wrap stack">
    <${Confetti} fire=${fire} />
    <span class="pill">Tablero final</span>
    ${mine
      ? html`<div class="card stack" style="border:2px solid var(--gold)">
          <div class="row nowrap">
            <span class="rank-pos" style="font-size:3rem">${ordinal(mine.position)}</span>
            <div class="grow">
              <div class="label">Tu equipo</div>
              <h2>${mine.name}</h2>
              <p class="small muted" style="margin:0">Rango: <b class="gold">${title}</b></p>
            </div>
            <span class="grade-chip" style="font-size:1.6rem">${grade(mine.grade)}</span>
          </div>
          <${BreakdownCard} row=${mine} />
          <div><div class="label" style="margin-bottom:.5rem">Insignias</div><${BadgeList} badges=${mine.badges} lock=${mine.lock} /></div>
          <a class="btn block" href=${certUrl} target="_blank" rel="noopener">Descargar mi certificado <${Icon} name="download" size=${16} /></a>
        </div>`
      : null}
    <div class="stack sm">
      <h3>Ranking</h3>
      <div class="rank-list">
        ${rows.map((r) => html`<div class=${`rank-item c-${LOCKS[r.lock].key} ${r.teamId === team.teamId ? 'me' : ''}`}>
          <span class="rank-pos">${r.position}</span>
          <div class="grow"><b>${r.name}</b><div class="tiny muted">${r.correct}/${r.total} correctas · ${r.opened ? `abrió ${ordinal(r.finishSeq)}` : 'sin abrir'}</div></div>
          <span class="grade-chip">${grade(r.grade)}</span>
        </div>`)}
      </div>
    </div>
    ${team.review ? html`<details class="card"><summary style="cursor:pointer"><b>Revisar las respuestas de mi candado</b></summary><div style="margin-top:.8rem"><${ReviewList} items=${team.review} /></div></details>` : null}
    <${Footer} />
  </div>`;
}
