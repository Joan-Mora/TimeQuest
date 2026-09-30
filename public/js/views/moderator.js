import { html, useEffect, useState } from '../lib/html.js';
import { api, download, useConnection, useKeepAlive } from '../lib/connection.js';
import { remainingFor, useTick } from '../lib/clock.js';
import { LOCKS, grade, dec, mmss, phaseLabel, ordinal } from '../lib/format.js';
import { Avatar, Icon, LevelIcon, LockPill, Pins, Toasts, ConnectionBanner, useToasts } from '../components/ui.js';
import { BankEditor } from './moderator-bank.js';
import { RankingTable, speedBase } from './projector.js';

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
      if (ev.type === 'opened') toast(`🔓 «${ev.name}» abrió el candado ${ev.lock} (${ordinal(ev.seq)})`);
      if (ev.type === 'timeout') toast(`⏱ Tiempo agotado: «${ev.name}»`);
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
    else if (okMsg) toast(okMsg);
    return res;
  };

  const choose = (c) => {
    localStorage.setItem(ROOM, c);
    setCode(c);
  };

  const mod = conn.mod && conn.mod.code === code ? conn.mod : null;

  return html`<div class="theme-light">
    ${!code || !mod
      ? html`<${RoomPicker} conn=${conn} onChoose=${choose} onLogout=${onLogout} act=${act} loading=${!!code && !mod} />`
      : html`<${RoomPanel} mod=${mod} act=${act} modKey=${modKey} toast=${toast} onLeave=${() => {
          localStorage.removeItem(ROOM);
          setCode('');
        }} />`}
    <${Toasts} toasts=${toasts} />
    <${ConnectionBanner} status=${conn.status} />
  </div>`;
}

function RoomPicker({ conn, onChoose, onLogout, act, loading }) {
  const [rooms, setRooms] = useState(null);
  const [title, setTitle] = useState('El Laboratorio Sellado');
  const refresh = () => conn.call('mod:listRooms').then((r) => r.ok && setRooms(r.rooms));
  useEffect(() => {
    if (conn.status === 'online') refresh();
  }, [conn.status]);

  async function create() {
    const res = await act('mod:createRoom', { title });
    if (res.ok) onChoose(res.code);
  }

  return html`<div class="wrap stack" style="padding-top:2rem">
    <div class="row between">
      <span class="pill">Panel del moderador</span>
      <button class="btn sm secondary" onClick=${onLogout}>Cerrar sesión</button>
    </div>
    <h1>Escape Room Estadístico</h1>
    ${loading ? html`<p class="muted waiting-dots">Abriendo sala</p>` : null}
    <div class="card stack">
      <h3>Crear una sala nueva</h3>
      <div class="field"><label>Título (se ve en el proyector)</label><input class="input" value=${title} maxlength="60" onInput=${(e) => setTitle(e.target.value)} /></div>
      <button class="btn lg" onClick=${create} disabled=${conn.status !== 'online'}>Crear sala <${Icon} name="play" size=${14} /></button>
    </div>
    <div class="card stack sm">
      <div class="card-title"><h3>Salas existentes</h3><button class="btn sm secondary" onClick=${refresh}>Actualizar</button></div>
      ${rooms === null ? html`<p class="muted">Cargando…</p>` : null}
      ${rooms?.length === 0 ? html`<p class="muted small">No hay salas activas.</p>` : null}
      ${rooms?.map((r) => html`<div class="player-line">
        <b style="letter-spacing:.12em">${r.code}</b>
        <span class="grow">${r.title} · <span class="muted">${phaseLabel(r.phase)} · ${r.players} jugadores</span></span>
        <button class="btn sm" onClick=${() => onChoose(r.code)}>Abrir</button>
        <button class="btn sm danger" onClick=${async () => {
          if (confirm(`¿Eliminar la sala ${r.code}? Se pierden sus resultados.`)) {
            await act('mod:deleteRoom', { code: r.code });
            refresh();
          }
        }}>Eliminar</button>
      </div>`)}
    </div>
  </div>`;
}

const TABS = [
  ['teams', 'Sala y equipos'],
  ['game', 'Partida en vivo'],
  ['config', 'Ajustes'],
  ['bank', 'Preguntas'],
  ['results', 'Resultados'],
];

function RoomPanel({ mod, act, modKey, toast, onLeave }) {
  const [tab, setTab] = useState(mod.phase === 'lobby' ? 'teams' : mod.phase === 'finished' ? 'results' : 'game');
  useEffect(() => {
    if (mod.phase === 'running') setTab((t) => (t === 'teams' ? 'game' : t));
    if (mod.phase === 'finished') setTab((t) => (t === 'game' ? 'results' : t));
  }, [mod.phase]);

  const joinUrl = `${location.origin}/?sala=${mod.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast('Enlace copiado');
    } catch {
      prompt('Copia el enlace:', joinUrl);
    }
  };

  return html`<div class="mod-shell">
    <header class="mod-top">
      <button class="icon-btn" onClick=${onLeave} title="Cambiar de sala" aria-label="Cambiar de sala">←</button>
      <span class="code">${mod.code}</span>
      <span class=${`pill ${mod.phase === 'running' ? 'ok' : mod.phase === 'paused' ? 'l3' : mod.phase === 'finished' ? 'l2' : ''}`}>${phaseLabel(mod.phase)}</span>
      <span class="small" style="opacity:.8">${mod.players.filter((p) => p.online).length}/${mod.players.length} conectados · ${mod.teams.length} equipos</span>
      <span class="grow"></span>
      <button class="btn sm secondary" style="background:rgba(255,255,255,.1);color:#fff" onClick=${copy}>Copiar enlace</button>
      <a class="btn sm secondary" style="background:rgba(255,255,255,.1);color:#fff" href=${`/espectador?sala=${mod.code}`} target="_blank" rel="noopener">Ranking en vivo</a>
      <a class="btn sm" href=${`/proyector?sala=${mod.code}`} target="_blank" rel="noopener">Abrir proyector <${Icon} name="expand" size=${14} /></a>
      <${PrimaryAction} mod=${mod} act=${act} />
    </header>
    <nav class="tabs" role="tablist">
      ${TABS.map(([id, label]) => html`<button role="tab" aria-selected=${tab === id} class=${`tab ${tab === id ? 'active' : ''}`} onClick=${() => setTab(id)}>${label}</button>`)}
    </nav>
    <main class="mod-body">
      ${mod.autoPaused ? html`<div class="warn-box">El servidor se reinició y la partida quedó en pausa automáticamente. El progreso está intacto: pulsa <b>Reanudar</b> cuando todos estén conectados.</div>` : null}
      ${tab === 'teams' ? html`<${TeamsTab} mod=${mod} act=${act} />` : null}
      ${tab === 'game' ? html`<${GameTab} mod=${mod} act=${act} />` : null}
      ${tab === 'config' ? html`<${ConfigTab} mod=${mod} act=${act} />` : null}
      ${tab === 'bank' ? html`<${BankEditor} act=${act} modKey=${modKey} running=${mod.phase !== 'lobby'} />` : null}
      ${tab === 'results' ? html`<${ResultsTab} mod=${mod} act=${act} modKey=${modKey} toast=${toast} />` : null}
    </main>
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

  if (mod.phase === 'lobby') {
    const n = mod.players.length;
    return html`<button class="btn sm" disabled=${n === 0 || cooling} onClick=${() => {
      const unassigned = mod.players.filter((p) => !p.teamId).length;
      const msg = mod.teams.length === 0
        ? `No hay equipos: se armarán automáticamente con ${n} jugadores. ¿Iniciar?`
        : unassigned ? `${unassigned} jugador(es) sin equipo se ubicarán en los equipos más pequeños. ¿Iniciar?` : '¿Iniciar la partida? Los cuatro candados arrancan a la vez.';
      if (confirm(msg)) act('mod:start', {}, '¡Partida iniciada!');
    }}><${Icon} name="play" size=${14} /> Iniciar partida</button>`;
  }
  if (mod.phase === 'running') return html`<button class="btn sm" disabled=${cooling} onClick=${() => act('mod:pause')}><${Icon} name="pause" size=${14} /> Pausar</button>`;
  if (mod.phase === 'paused') return html`<button class="btn sm teal" disabled=${cooling} onClick=${() => act('mod:resume')}><${Icon} name="play" size=${14} /> Reanudar</button>`;
  if (mod.phase === 'finished' && !mod.podiumRevealed) return html`<button class="btn sm" disabled=${cooling} onClick=${() => act('mod:revealPodium', {}, '¡Podio revelado!')}><${Icon} name="trophy" size=${14} /> Revelar podio</button>`;
  return html`<button class="btn sm secondary" style="background:rgba(255,255,255,.1);color:#fff" disabled=${cooling} onClick=${() => act('mod:hidePodium')}>Ocultar podio</button>`;
}

// ---------------------------------------------------------------------------
// Sala y equipos
// ---------------------------------------------------------------------------
function TeamsTab({ mod, act }) {
  const lobby = mod.phase === 'lobby';
  const [teamCount, setTeamCount] = useState(mod.config.teamCount || 0);
  const autoCount = Math.ceil(mod.players.length / mod.config.teamSize) || 0;
  const unassigned = mod.players.filter((p) => !p.teamId);
  const teamOptions = [['', 'Sin equipo'], ...mod.teams.map((t) => [t.id, t.name])];

  const PlayerLine = ({ p }) => html`<div class="player-line">
    <span class=${`dot ${p.online ? '' : 'off'}`} title=${p.online ? 'Conectado' : 'Desconectado'}></span>
    <span class="grow">${p.name}</span>
    <select class="select" aria-label=${`Mover a ${p.name}`} value=${p.teamId || ''} disabled=${mod.phase === 'finished'}
      onChange=${(e) => act('mod:movePlayer', { playerId: p.id, teamId: e.target.value || null })}>
      ${teamOptions.map(([id, name]) => html`<option value=${id}>${name}</option>`)}
    </select>
    <button class="btn sm danger" title="Retirar de la sala" aria-label=${`Retirar a ${p.name}`}
      onClick=${() => confirm(`¿Retirar a ${p.name} de la sala?`) && act('mod:kick', { playerId: p.id })}>✕</button>
  </div>`;

  return html`
    <div class="kpis">
      <div class="kpi"><div class="k">Conectados</div><div class="v">${mod.players.filter((p) => p.online).length}</div></div>
      <div class="kpi"><div class="k">Registrados</div><div class="v">${mod.players.length}</div></div>
      <div class="kpi"><div class="k">Equipos</div><div class="v">${mod.teams.length}</div></div>
      <div class="kpi"><div class="k">Sin equipo</div><div class="v">${unassigned.length}</div></div>
    </div>
    ${lobby
      ? html`<div class="card stack sm">
          <h3>Armar equipos</h3>
          <p class="small muted" style="margin:0">Reparte a todos al azar en equipos parejos (tamaño máximo ${mod.config.teamSize}) y asigna candados en rotación 1 → 2 → 3 → 4. Luego puedes mover a cualquiera a mano.</p>
          <div class="row">
            <label class="small" for="tc"><b>Número de equipos</b></label>
            <input id="tc" class="input" type="number" min="0" max="16" style="width:110px;min-height:40px" value=${teamCount} onInput=${(e) => setTeamCount(Number(e.target.value))} />
            <span class="small muted">0 = automático (${autoCount} con ${mod.players.length} jugadores)</span>
            <button class="btn sm violet" disabled=${mod.players.length === 0} onClick=${() => {
              if (mod.teams.length === 0 || confirm('Esto rearma todos los equipos. ¿Continuar?')) act('mod:autoAssign', { teamCount }, 'Equipos armados');
            }}>Armar automáticamente</button>
            <button class="btn sm secondary" onClick=${() => act('mod:addTeam')}>+ Equipo vacío</button>
          </div>
        </div>`
      : html`<div class="warn-box small">La partida está en curso: puedes mover jugadores entre equipos (su progreso queda en el equipo), pero no crear ni borrar equipos.</div>`}
    ${unassigned.length
      ? html`<div class="card stack sm" style="border-top:5px solid var(--ink-3)">
          <h3>Sin equipo (${unassigned.length})</h3>
          ${unassigned.map((p) => html`<${PlayerLine} p=${p} />`)}
        </div>`
      : null}
    <div class="team-grid">
      ${mod.teams.map((t) => html`<div class=${`team-box c-${LOCKS[t.lock].key}`}>
        <div class="row nowrap">
          <${LevelIcon} lock=${t.lock} size=${36} number=${false} />
          <input class="input grow" style="min-height:38px;font-weight:700" value=${t.name} maxlength="32" aria-label="Nombre del equipo"
            onChange=${(e) => act('mod:renameTeam', { teamId: t.id, name: e.target.value })} />
        </div>
        <div class="row">
          <select class="select" style="min-height:36px;width:auto" disabled=${!lobby} value=${t.lock} aria-label="Candado"
            onChange=${(e) => act('mod:setTeamLock', { teamId: t.id, lock: Number(e.target.value) })}>
            ${[1, 2, 3, 4].map((l) => html`<option value=${l}>Candado ${l} · ${LOCKS[l].short}</option>`)}
          </select>
          <span class="small muted grow">${t.members.length} integrante${t.members.length === 1 ? '' : 's'}</span>
          ${lobby ? html`<button class="btn sm danger" onClick=${() => confirm(`¿Eliminar «${t.name}»? Sus integrantes quedan sin equipo.`) && act('mod:deleteTeam', { teamId: t.id })}>Eliminar</button>` : null}
        </div>
        <div>${mod.players.filter((p) => p.teamId === t.id).map((p) => html`<${PlayerLine} p=${p} />`)}</div>
        ${t.members.length === 0 ? html`<p class="small muted" style="margin:0">Equipo vacío (se descarta al iniciar).</p>` : null}
      </div>`)}
    </div>
    ${mod.players.length === 0 ? html`<div class="card center muted">Aún no hay jugadores. Abre el proyector para mostrar el QR y el código <b>${mod.code}</b>.</div>` : null}
  `;
}

// ---------------------------------------------------------------------------
// Partida en vivo
// ---------------------------------------------------------------------------
function GameTab({ mod, act }) {
  useTick(500, mod.phase === 'running');
  const [lock, setLock] = useState('all');
  const inGame = mod.phase === 'running' || mod.phase === 'paused';
  const nameOf = (id) => mod.players.find((p) => p.id === id)?.name ?? '—';

  return html`
    <div class="card stack sm">
      <div class="row">
        ${mod.phase !== 'finished' ? html`<${PrimaryAction} mod=${mod} act=${act} />` : null}
        ${inGame ? html`
          <span class="grow"></span>
          <select class="select" style="width:auto;min-height:36px" value=${lock} onChange=${(e) => setLock(e.target.value)} aria-label="Candado al que se ajusta el tiempo">
            <option value="all">Todos los candados</option>
            ${[1, 2, 3, 4].map((l) => html`<option value=${l}>Candado ${l}</option>`)}
          </select>
          <button class="btn sm secondary" onClick=${() => act('mod:addTime', { lock, seconds: -30 })}>−30 s</button>
          <button class="btn sm secondary" onClick=${() => act('mod:addTime', { lock, seconds: 30 })}>+30 s</button>
          <button class="btn sm secondary" onClick=${() => act('mod:addTime', { lock, seconds: 60 })}>+1 min</button>
          <button class="btn sm danger" onClick=${() => confirm('¿Terminar la partida ahora? Los candados abiertos se cierran con lo respondido.') && act('mod:end')}>Terminar</button>` : null}
        ${mod.phase !== 'lobby' ? html`<button class="btn sm secondary" onClick=${() => confirm('¿Reiniciar? Se borra el progreso y vuelven al lobby (se conservan jugadores y equipos).') && act('mod:reset', {}, 'De vuelta al lobby')}>Reiniciar</button>` : null}
      </div>
    </div>
    <div class="grid-2" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
      ${mod.teams.map((t) => {
        const remaining = remainingFor(mod, t.lock);
        const answers = t.answers.map((a) => ({ correct: a.correct }));
        return html`<div class=${`team-box c-${LOCKS[t.lock].key}`}>
          <div class="row between nowrap">
            <div class="row nowrap"><${LevelIcon} lock=${t.lock} size=${32} number=${false} /><b>${t.name}</b></div>
            ${t.opened ? html`<span class="pill ok">🔓 ${ordinal(t.finishSeq)}</span>` : t.closedBy ? html`<span class="pill ghost" style="color:var(--ink-2);background:var(--paper)">${t.closedBy === 'time' ? '⏱ Tiempo' : 'Cerrado'}</span>` : html`<b class="num">${mmss(remaining)}</b>`}
          </div>
          <${Pins} total=${t.total} answers=${answers} current=${t.closedBy === null && !t.opened ? t.currentIndex : null} />
          <div class="small row between"><span>Aciertos: <b>${t.correct ?? 0}/${t.total}</b></span><span>XP ${t.xp ?? 0}</span></div>
          ${t.currentPrompt ? html`<div class="small muted" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">P${t.currentIndex + 1}: ${t.currentPrompt}</div>` : null}
          <div class="row" style="gap:.3rem">
            ${t.members.map((m) => html`<${Avatar} id=${m.id} name=${m.name} size=${28} online=${m.online} captain=${m.id === t.captainId} />`)}
            ${t.captainId ? html`<span class="tiny muted">Capitán: ${nameOf(t.captainId)} · ${t.votesCount} voto(s)</span>` : null}
          </div>
        </div>`;
      })}
    </div>
    <div class="card stack sm"><h3>Bitácora</h3><div class="log">${[...mod.log].reverse().map((l) => html`<div>${new Date(l.at).toLocaleTimeString('es-CO')} · ${l.text}</div>`)}</div></div>
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

  return html`
    ${!lobby ? html`<div class="warn-box small">La partida ya empezó: el tamaño de equipos, las preguntas por candado y los tiempos base quedan fijos (usa +1 min en «Partida en vivo»). Los pesos sí se pueden ajustar: si la partida terminó, las notas se recalculan al instante.</div>` : null}
    <div class="grid-2">
      <div class="card stack">
        <h3>Sala</h3>
        <div class="field"><label>Título</label><input class="input" value=${c.title} maxlength="60" onChange=${(e) => patch({ title: e.target.value })} /></div>
        <div class="row">
          <div class="field grow"><label>Tamaño de equipo</label><input class="input" type="number" min="1" max="12" value=${c.teamSize} disabled=${!lobby} onChange=${(e) => patch({ teamSize: Number(e.target.value) })} /></div>
          <div class="field grow"><label>Número de equipos (0 = auto)</label><input class="input" type="number" min="0" max="16" value=${c.teamCount} disabled=${!lobby} onChange=${(e) => patch({ teamCount: Number(e.target.value) })} /></div>
        </div>
        <div class="field"><label>Preguntas por candado</label><input class="input" type="number" min="1" max="10" value=${c.questionsPerLock} disabled=${!lobby} onChange=${(e) => patch({ questionsPerLock: Number(e.target.value) })} /></div>
        <div>
          <div class="label" style="margin-bottom:.4rem">Tiempo límite por candado (minutos)</div>
          <div class="row">
            ${[1, 2, 3, 4].map((l) => html`<div class="field" style="width:110px"><label class=${`c-${LOCKS[l].key}`} style="color:var(--c)">C${l} · ${LOCKS[l].short}</label>
              <input class="input" type="number" min="0.5" max="60" step="0.5" value=${c.timeLimitsSec[l] / 60} disabled=${!lobby}
                onChange=${(e) => patch({ timeLimitsSec: { [l]: Math.round(Number(e.target.value) * 60) } })} /></div>`)}
          </div>
        </div>
      </div>
      <div class="card stack">
        <h3>Reglas del juego</h3>
        <div class="stack sm" role="radiogroup" aria-label="Retroalimentación">
          <div class="label">Retroalimentación al responder</div>
          ${[
            ['verdict', 'Correcto/incorrecto al instante (recomendado)', 'Cada equipo ve ✓/✗ y suma XP. Las soluciones se desbloquean cuando todos los equipos de ese candado terminan, para no soplar respuestas.'],
            ['instant', 'Todo al instante', 'Muestra ✓/✗, la respuesta correcta y la explicación enseguida. Úsalo solo si cada candado tiene un único equipo.'],
            ['end', 'Todo al final', 'Solo se registra la respuesta; aciertos y soluciones se ven al terminar. Máximo suspenso.'],
          ].map(([id, label, desc]) => html`<label class="check">
            <input type="radio" name="fb" checked=${c.feedbackMode === id} onChange=${() => patch({ feedbackMode: id })} />
            <span><b>${label}</b><br /><span class="small muted">${desc}</span></span>
          </label>`)}
        </div>
        <label class="check"><input type="checkbox" checked=${c.shuffle} disabled=${!lobby} onChange=${(e) => patch({ shuffle: e.target.checked })} />
          <span><b>Barajar preguntas y opciones por equipo</b><br /><span class="small muted">Dos equipos en el mismo candado ven otro orden: copiar la letra no sirve.</span></span></label>
        <label class="check"><input type="checkbox" checked=${c.autoAssignLate} onChange=${(e) => patch({ autoAssignLate: e.target.checked })} />
          <span><b>Ubicar automáticamente a quien llega tarde</b><br /><span class="small muted">Entra al equipo con menos integrantes.</span></span></label>
        <label class="check"><input type="checkbox" checked=${c.showLiveAccuracy} onChange=${(e) => patch({ showLiveAccuracy: e.target.checked })} />
          <span><b>Mostrar aciertos en vivo en el proyector</b><br /><span class="small muted">Por defecto se ocultan hasta el podio para mantener el suspenso.</span></span></label>
      </div>
    </div>
    <div class="card stack">
      <h3>Fórmula de la nota</h3>
      <p class="small" style="margin:0"><b>Puntaje = ${accDraft} % × (Acierto/20) + ${100 - accDraft} % × Velocidad</b>, donde Acierto = 20 puntos por pregunta correcta (0–100) y Velocidad = base según el orden en que el equipo abre su candado. Nota = puntaje con un decimal. Desempates: más aciertos → abrió antes de que se acabara el tiempo → menor tiempo total → orden de apertura → nombre.</p>
      <div class="field">
        <label for="w">Peso del acierto: ${accDraft} % · velocidad: ${100 - accDraft} %</label>
        <input id="w" class="slider" type="range" min="0" max="100" step="5" value=${accDraft} onInput=${(e) => setAccDraft(Number(e.target.value))}
          onChange=${(e) => patch({ scoring: { weights: { accuracy: Number(e.target.value), speed: 100 - Number(e.target.value) } } })} />
      </div>
      <div class="row">
        ${c.scoring.speedTable.map((v, i) => html`<div class="field" style="width:95px"><label>${i + 1}.º abre</label>
          <input class="input" type="number" step="0.1" min="0" max="5" value=${v} onChange=${(e) => {
            const t = [...c.scoring.speedTable];
            t[i] = Number(e.target.value);
            patch({ scoring: { speedTable: t } });
          }} /></div>`)}
        <div class="field" style="width:95px"><label>Paso luego</label><input class="input" type="number" step="0.1" min="0" max="5" value=${c.scoring.speedStep} onChange=${(e) => patch({ scoring: { speedStep: Number(e.target.value) } })} /></div>
        <div class="field" style="width:95px"><label>Piso</label><input class="input" type="number" step="0.1" min="0" max="5" value=${c.scoring.speedFloor} onChange=${(e) => patch({ scoring: { speedFloor: Number(e.target.value) } })} /></div>
        <div class="field" style="width:120px"><label>Tiempo agotado</label><input class="input" type="number" step="0.1" min="0" max="5" value=${c.scoring.timeoutSpeed} onChange=${(e) => patch({ scoring: { timeoutSpeed: Number(e.target.value) } })} /></div>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Escenario</th><th>Acierto (0-5)</th><th>Velocidad</th><th>Puntaje</th><th>Nota</th></tr></thead>
        <tbody>${scen.map((s) => html`<tr><td>${s.label}</td><td>${dec(s.correct, 1)}</td><td>${dec(s.speed, 1)}</td><td>${dec(s.score)}</td><td><b>${grade(Math.round(s.score * 10) / 10)}</b></td></tr>`)}</tbody>
      </table></div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Resultados y exportación
// ---------------------------------------------------------------------------
function ResultsTab({ mod, act, modKey, toast }) {
  const r = mod.results;
  const dl = async (kind, name) => {
    try {
      await download(`/api/rooms/${mod.code}/export/${kind}`, modKey, name);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };
  return html`
    <div class="card row">
      <b class="grow">Exportar</b>
      <button class="btn sm secondary" onClick=${() => dl('equipos.csv', 'equipos.csv')} disabled=${mod.phase === 'lobby'}><${Icon} name="download" size=${14} /> CSV por equipo</button>
      <button class="btn sm secondary" onClick=${() => dl('estudiantes.csv', 'estudiantes.csv')} disabled=${mod.phase === 'lobby'}><${Icon} name="download" size=${14} /> CSV por estudiante</button>
      <a class=${`btn sm ${mod.phase === 'lobby' ? 'secondary' : ''}`} href=${`/informe?sala=${mod.code}`} target="_blank" rel="noopener">Informe PDF (imprimir)</a>
      ${mod.phase === 'finished'
        ? mod.podiumRevealed
          ? html`<button class="btn sm secondary" onClick=${() => act('mod:hidePodium')}>Ocultar podio</button>`
          : html`<button class="btn sm" onClick=${() => act('mod:revealPodium', {}, '¡Podio revelado!')}><${Icon} name="trophy" size=${14} /> Revelar podio</button>`
        : null}
    </div>
    ${!r
      ? html`<div class="card muted">Los resultados definitivos aparecen cuando todos los candados se cierran o pulsas «Terminar». Mientras tanto puedes descargar un CSV parcial.</div>`
      : html`
        <div class="card stack sm">
          <h3>Ranking de equipos</h3>
          <p class="small muted" style="margin:0">Pesos: acierto ${Math.round(r.scoring.weights.accuracy * 100)} % · velocidad ${Math.round(r.scoring.weights.speed * 100)} %. Cambia los pesos en «Ajustes» y se recalcula todo.</p>
          <${RankingTable} rows=${r.teams} light />
        </div>
        <div class="card stack sm">
          <h3>Notas por estudiante</h3>
          <p class="small muted" style="margin:0">La nota individual es la del equipo (trabajo cooperativo). La participación se reporta para que decidas si ajustar casos puntuales.</p>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Estudiante</th><th>Equipo</th><th>Candado</th><th>Puesto</th><th>Nota</th><th>Votos</th><th>Confirmó</th><th>Participación</th></tr></thead>
            <tbody>${r.students.map((s) => html`<tr>
              <td>${s.name}</td><td>${s.teamName}</td><td>${s.lock ? html`<${LockPill} lock=${s.lock} />` : '—'}</td>
              <td>${s.position ?? '—'}</td><td><b>${grade(s.grade)}</b></td><td>${s.votes}</td><td>${s.confirms}</td>
              <td style=${s.participation < 40 ? 'color:var(--red);font-weight:700' : ''}>${s.participation} %</td>
            </tr>`)}</tbody>
          </table></div>
        </div>
        <div class="card stack sm">
          <h3>Dificultad real de las preguntas</h3>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Candado</th><th>Pregunta</th><th>Aciertos</th><th>%</th></tr></thead>
            <tbody>${r.questionStats.map((s) => html`<tr><td><${LockPill} lock=${s.lock} /></td><td class="small">${s.prompt}</td><td>${s.correct}/${s.attempts}</td><td><b>${s.accuracy ?? '—'}${s.accuracy !== null ? ' %' : ''}</b></td></tr>`)}</tbody>
          </table></div>
        </div>`}
  `;
}
