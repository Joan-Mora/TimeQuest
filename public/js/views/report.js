import { html, useEffect, useState } from '../lib/html.js';
import { api, download } from '../lib/connection.js';
import { LOCKS, grade, dec, mmss, ordinal } from '../lib/format.js';
import { Hearts, Icon, LevelIcon, MathText } from '../components/ui.js';

const DIFFICULTY = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };

const gradeCls = (g) => (g === null || g === undefined ? '' : g >= 4 ? 'hi' : g >= 3 ? 'mid' : 'lo');

function statusOf(r) {
  if (r.solo) {
    if (r.opened) return { cls: 'ok', text: `Sobrevivió ${ordinal(r.finishSeq)}` };
    if (r.closedBy === 'eliminated') return { cls: 'bad', text: 'Eliminado' };
    return { cls: 'off', text: r.closedBy === 'time' ? 'Tiempo agotado' : 'En pie al cierre' };
  }
  if (r.opened) return { cls: 'ok', text: `Abrió ${ordinal(r.breakdown.speedPosition)}` };
  if (r.closedBy === 'time') return { cls: 'off', text: 'Tiempo agotado' };
  if (r.closedBy === 'moderator') return { cls: 'off', text: 'Cerrado por el moderador' };
  return { cls: 'off', text: 'En curso' };
}

function LockTag({ lock, short = false }) {
  const meta = LOCKS[lock];
  if (!meta) return '—';
  return html`<span class=${`rep-lock ${meta.key}`}><${Icon} name=${meta.icon} size=${11} />${lock === 0 ? 'Caos' : short ? `C${lock}` : `C${lock} · ${meta.short}`}</span>`;
}

function Grade({ value }) {
  return html`<span class=${`rep-grade ${gradeCls(value)}`}>${grade(value)}</span>`;
}

function Section({ title, icon, children, note, cls = '' }) {
  return html`<section class=${`rep-section ${cls}`}>
    <h2 class="rep-h2"><span class="rep-h2-icon"><${Icon} name=${icon} size=${14} /></span>${title}</h2>
    ${note ? html`<p class="rep-note">${note}</p>` : null}
    ${children}
  </section>`;
}

/** Informe imprimible (Guardar como PDF desde el navegador) con la identidad visual de la actividad. */
export function Report() {
  const code = (new URLSearchParams(location.search).get('sala') || '').toUpperCase();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const key = localStorage.getItem('erlab:modkey');

  useEffect(() => {
    if (!key) return setError('Abre el informe desde el panel del moderador (se necesita la clave).');
    api(`/api/rooms/${encodeURIComponent(code)}/export/informe.json`, { key }).then((res) => {
      if (!res.ok) setError(res.error || 'No se pudo cargar el informe.');
      else setData(res);
    });
  }, [code]);

  useEffect(() => {
    if (data) document.title = `Informe ${data.room.code} · ${data.room.title}`;
  }, [data]);

  if (error) return html`<div class="rep-page"><div class="rep-sheet"><div class="error-box">${error}</div></div></div>`;
  if (!data) return html`<div class="rep-page"><div class="rep-sheet"><p class="rep-note">Cargando informe…</p></div></div>`;

  const { room, results, partial } = data;
  const chaos = results.mode === 'chaos';
  const w = results.scoring.weights;
  const cfg = room.config;
  const rows = results.teams;
  const studentGrades = results.students.map((s) => s.grade).filter((g) => g !== null && g !== undefined);
  const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
  const accAvg = avg(rows.map((r) => (r.total ? r.correct / r.total : 0)));
  const when = new Date(results.computedAt).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
  const passed = studentGrades.filter((g) => g >= 3).length;

  const kpis = [
    { icon: 'users', label: 'Participantes', value: results.students.length, sub: chaos ? 'todos contra todos' : `en ${rows.length} equipos` },
    chaos
      ? { icon: 'heart', label: 'Sobrevivientes', value: rows.filter((r) => r.opened).length, sub: `${rows.filter((r) => r.closedBy === 'eliminated').length} eliminados` }
      : { icon: 'unlock', label: 'Candados abiertos', value: `${rows.filter((r) => r.opened).length}/${rows.length}`, sub: 'antes del tiempo' },
    { icon: 'star', label: 'Nota promedio', value: grade(avg(studentGrades)), sub: `${passed} de ${studentGrades.length} con 3,0 o más` },
    { icon: 'trophy', label: 'Nota más alta', value: grade(rows.length ? Math.max(...rows.map((r) => r.grade)) : null), sub: rows[0]?.name ?? '—' },
    { icon: 'target', label: 'Acierto promedio', value: accAvg === null ? '—' : `${Math.round(accAvg * 100)} %`, sub: 'sobre todas las preguntas' },
  ];

  const podium = rows.slice(0, 3);
  const minutes = (s) => `${dec(s / 60, s % 60 ? 1 : 0)} min`;

  return html`<div class="rep-page">
    <div class="rep-toolbar no-print">
      <span class="small">En el diálogo de impresión elige <b>«Guardar como PDF»</b> y activa <b>«Gráficos de fondo»</b>.</span>
      <div class="row" style="gap:.5rem">
        <button class="btn sm secondary" onClick=${() => download(`/api/rooms/${room.code}/export/informe.xlsx`, key, `informe-${room.code}.xlsx`).catch((e) => alert(e.message))}>
          <${Icon} name="bars" size=${14} /> Excel
        </button>
        <button class="btn sm" onClick=${() => window.print()}><${Icon} name="file" size=${14} /> Imprimir / PDF</button>
      </div>
    </div>

    <article class="rep-sheet">
      <header class="rep-hero">
        <div class="rep-hero-top">
          <div class="rep-brand">
            <span class="rep-kicker">Escape Room Estadístico · El Laboratorio Sellado</span>
            <h1 class="rep-title">${room.title}</h1>
            <span class="rep-sub">Informe de resultados${chaos ? ' · Modo Caos' : ''}</span>
          </div>
          <div class="rep-icons" aria-hidden="true">
            ${chaos
              ? html`<${LevelIcon} lock=${0} size=${46} />`
              : [1, 2, 3, 4].map((l) => html`<${LevelIcon} lock=${l} size=${34} number=${false} />`)}
          </div>
        </div>
        <dl class="rep-meta">
          <div><dt>Sala</dt><dd class="rep-code">${room.code}</dd></div>
          <div><dt>Fecha</dt><dd>${when}</dd></div>
          <div><dt>Modo</dt><dd>${chaos ? `Caos · ${cfg.chaosLives ?? 3} vidas` : 'Por equipos'}</dd></div>
          <div><dt>Estado</dt><dd>${partial ? html`<span class="rep-state partial">Parcial</span>` : html`<span class="rep-state final">Final</span>`}</dd></div>
        </dl>
      </header>
      <div class="rep-strip" aria-hidden="true"><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i></div>

      ${partial ? html`<div class="rep-warn"><${Icon} name="clock" size=${16} /> <span><b>Resultado parcial.</b> La partida sigue en curso: las notas pueden cambiar hasta que termine.</span></div>` : null}

      <section class="rep-kpis">
        ${kpis.map((k) => html`<div class="rep-kpi">
          <span class="rep-kpi-icon"><${Icon} name=${k.icon} size=${16} /></span>
          <span class="rep-kpi-label">${k.label}</span>
          <b class="rep-kpi-value">${k.value}</b>
          <span class="rep-kpi-sub">${k.sub}</span>
        </div>`)}
      </section>

      ${podium.length ? html`<${Section} title="Podio" icon="trophy" cls="avoid-break">
        <div class="rep-podium">
          ${podium.map((r) => html`<div class=${`rep-podium-card p${r.position}`}>
            <span class="rep-medal">${r.position}</span>
            <div class="rep-podium-body">
              <b class="rep-podium-name">${r.name}</b>
              <div class="rep-podium-meta">
                ${chaos ? html`<${Hearts} lost=${r.livesLost} total=${r.lives ?? 3} />` : html`<${LockTag} lock=${r.lock} />`}
                <span>${r.correct}/${r.total} correctas</span>
              </div>
              ${!chaos && r.members?.length ? html`<span class="rep-podium-members">${r.members.map((m) => m.name).join(', ')}</span>` : null}
            </div>
            <${Grade} value=${r.grade} />
          </div>`)}
        </div>
      <//>` : null}

      <${Section} title="Fórmula aplicada" icon="bars" cls="avoid-break">
        <div class="rep-formula">
          <div class="rep-formula-main">
            Nota = <b class="gold-ink">${Math.round(w.accuracy * 100)} %</b> × acierto (0–5) + <b class="gold-ink">${Math.round(w.speed * 100)} %</b> × velocidad
          </div>
          <ul>
            <li><b>Acierto:</b> correctas ÷ preguntas × 5 (cada pregunta pesa igual).</li>
            <li><b>Velocidad:</b> según el orden de ${chaos ? 'llegada' : 'apertura'}: ${results.scoring.speedTable.map((v) => dec(v, 1)).join(' · ')}, luego −${dec(results.scoring.speedStep, 1)} por puesto (mínimo ${dec(results.scoring.speedFloor, 1)}). ${chaos ? 'Eliminado o sin terminar' : 'Sin abrir'}: ${dec(results.scoring.timeoutSpeed, 1)}.</li>
            <li><b>Desempates:</b> más aciertos → ${chaos ? 'terminar antes del límite → resistir más tiempo en pie' : 'abrir antes del límite'} → menor tiempo → orden de ${chaos ? 'llegada' : 'apertura'}.</li>
            ${chaos
              ? html`<li><b>Reglas del Caos:</b> ${cfg.chaosLives ?? 3} vidas, cada error cuesta una; ${results.teams[0]?.total ?? '—'} preguntas de los 4 temas mezcladas; ${minutes(cfg.timeLimitsSec?.[0] ?? 900)} para todos.</li>`
              : html`<li><b>Tiempo por candado:</b> ${[1, 2, 3, 4].map((l) => `C${l} ${minutes(cfg.timeLimitsSec?.[l] ?? 480)}`).join(' · ')}.</li>`}
          </ul>
        </div>
      <//>

      <${Section} title=${chaos ? 'Ranking de jugadores' : 'Resultados por equipo'} icon="trend">
        <table class="rep-table">
          <thead><tr>
            <th class="c">#</th><th>${chaos ? 'Jugador' : 'Equipo'}</th><th>${chaos ? 'Vidas' : 'Candado'}</th><th>Estado</th>
            <th class="c">Aciertos</th><th class="c">Tiempo</th><th class="c">Acierto<br /><small>0–5</small></th><th class="c">Velocidad<br /><small>0–5</small></th><th class="c">Puntaje</th><th class="c">Nota</th>
          </tr></thead>
          <tbody>${rows.map((r) => {
            const s = statusOf(r);
            return html`<tr>
              <td class="c"><span class=${`rep-pos ${r.position <= 3 ? `p${r.position}` : ''}`}>${r.position}</span></td>
              <td class="rep-name"><b>${r.name}</b>
                ${!chaos && r.members?.length ? html`<div class="rep-small">${r.members.map((m) => m.name).join(', ')}</div>` : null}
                ${r.badges?.length ? html`<div class="rep-small rep-badges">${r.badges.map((b) => b.label).join(' · ')}</div>` : null}
                ${r.tiebreak ? html`<div class="rep-small rep-tie">${r.tiebreak}</div>` : null}</td>
              <td>${chaos ? html`<${Hearts} lost=${r.livesLost} total=${r.lives ?? 3} />` : html`<${LockTag} lock=${r.lock} />`}</td>
              <td><span class=${`rep-status ${s.cls}`}>${s.text}</span></td>
              <td class="c num">${r.correct}/${r.total}</td>
              <td class="c num">${r.elapsedMs != null ? mmss(r.elapsedMs) : '—'}</td>
              <td class="c num">${dec(r.breakdown.accuracy5, 1)}</td>
              <td class="c num">${dec(r.breakdown.speed, 1)}</td>
              <td class="c num">${dec(r.score)}</td>
              <td class="c"><${Grade} value=${r.grade} /></td>
            </tr>`;
          })}</tbody>
        </table>
      <//>

      <${Section} title="Notas por estudiante" icon="users"
        note=${chaos ? 'En Caos la nota es individual.' : 'La nota individual es la del equipo (trabajo cooperativo). La participación ayuda a decidir ajustes puntuales: por debajo de 40 % se marca en rojo.'}>
        <table class="rep-table">
          ${chaos
            ? html`<thead><tr><th>Estudiante</th><th class="c">Puesto</th><th>Estado</th><th class="c">Aciertos</th><th class="c">Respondidas</th><th class="c">Nota</th></tr></thead>
              <tbody>${results.students.map((s) => {
                const row = rows.find((r) => r.teamId === s.teamId);
                const st = row ? statusOf(row) : { cls: 'off', text: 'Sin partida' };
                return html`<tr>
                  <td><b>${s.name}</b></td><td class="c num">${s.position ?? '—'}</td>
                  <td><span class=${`rep-status ${st.cls}`}>${st.text}</span></td>
                  <td class="c num">${s.correct ?? 0}/${s.total || '—'}</td><td class="c num">${s.confirms}</td>
                  <td class="c"><${Grade} value=${s.grade} /></td>
                </tr>`;
              })}</tbody>`
            : html`<thead><tr><th>Estudiante</th><th>Equipo</th><th>Candado</th><th class="c">Puesto</th><th class="c">Votos</th><th class="c">Confirmó</th><th class="c">Participación</th><th class="c">Nota</th></tr></thead>
              <tbody>${results.students.map((s) => html`<tr>
                <td><b>${s.name}</b></td><td>${s.teamName}</td><td>${s.lock ? html`<${LockTag} lock=${s.lock} short />` : '—'}</td>
                <td class="c num">${s.position ?? '—'}</td><td class="c num">${s.votes}</td><td class="c num">${s.confirms}</td>
                <td class=${`c num ${s.participation < 40 ? 'rep-low' : ''}`}>${s.participation} %</td>
                <td class="c"><${Grade} value=${s.grade} /></td>
              </tr>`)}</tbody>`}
        </table>
      <//>

      <${Section} title="Dificultad real de las preguntas" icon="target"
        note="Ordenadas de la más difícil a la más fácil: útil para el mini debate y para retroalimentar cada tema.">
        <table class="rep-table">
          <thead><tr><th>Tema</th><th>Pregunta</th><th class="c">Dificultad</th><th class="c">Aciertos</th><th style="width:22%">% de acierto</th></tr></thead>
          <tbody>${results.questionStats.map((q) => html`<tr>
            <td><${LockTag} lock=${q.lock} /></td>
            <td class="rep-prompt"><${MathText} text=${q.prompt} /></td>
            <td class="c rep-small">${DIFFICULTY[q.difficulty] ?? '—'}</td>
            <td class="c num">${q.correct}/${q.attempts}</td>
            <td>${q.accuracy === null
              ? html`<span class="rep-small">Sin respuestas</span>`
              : html`<div class="rep-bar-row"><span class=${`rep-bar ${LOCKS[q.lock].key}`}><i style=${`width:${q.accuracy}%`}></i></span><b class="num">${q.accuracy} %</b></div>`}</td>
          </tr>`)}</tbody>
        </table>
      <//>

      <footer class="rep-foot">
        <span>Análisis Cuantitativo de Datos · Tecnología en Desarrollo de Software · UNIMINUTO</span>
        <span>Sala ${room.code} · generado el ${new Date().toLocaleDateString('es-CO', { dateStyle: 'long' })}</span>
      </footer>
    </article>
  </div>`;
}
