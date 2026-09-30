import { html, useEffect, useState } from '../lib/html.js';
import { api } from '../lib/connection.js';
import { LOCKS, grade, dec, mmss } from '../lib/format.js';

const STATUS = { null: 'Abierto', time: 'Tiempo agotado', moderator: 'Cerrado por el moderador' };

/** Informe imprimible (Guardar como PDF desde el navegador). */
export function Report() {
  const code = (new URLSearchParams(location.search).get('sala') || '').toUpperCase();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const key = localStorage.getItem('erlab:modkey');
    if (!key) return setError('Abre el informe desde el panel del moderador (se necesita la clave).');
    api(`/api/rooms/${encodeURIComponent(code)}/export/informe.json`, { key }).then((res) => {
      if (!res.ok) setError(res.error || 'No se pudo cargar el informe.');
      else setData(res);
    });
  }, [code]);

  if (error) return html`<div class="print-page"><div class="sheet"><div class="error-box">${error}</div></div></div>`;
  if (!data) return html`<div class="print-page"><div class="sheet"><p class="muted">Cargando informe…</p></div></div>`;

  const { room, results, locks, partial } = data;
  const w = results.scoring.weights;
  const lockName = (id) => locks.find((l) => l.id === id)?.title ?? LOCKS[id].short;

  return html`<div class="print-page theme-light"><div class="sheet">
    <div class="row between no-print">
      <span class="muted small">Consejo: en el diálogo de impresión elige «Guardar como PDF».</span>
      <button class="btn" onClick=${() => window.print()}>Imprimir / Guardar PDF</button>
    </div>
    <header class="stack sm" style="border-bottom:4px solid var(--gold);padding-bottom:.8rem">
      <span class="pill" style="justify-self:start">Escape Room Estadístico · Informe de resultados</span>
      <h1 style="margin:0">${room.title}</h1>
      <div class="small muted">Sala ${room.code} · ${new Date(results.computedAt).toLocaleString('es-CO')} · ${results.teams.length} equipos · ${results.students.length} estudiantes
        ${partial ? html` · <b style="color:var(--red)">RESULTADO PARCIAL (la partida no ha terminado)</b>` : null}</div>
    </header>
    <section class="stack sm">
      <h2>Fórmula aplicada</h2>
      <p class="small" style="margin:0">
        Puntaje = ${Math.round(w.accuracy * 100)} % × (Acierto/20) + ${Math.round(w.speed * 100)} % × Velocidad.
        Acierto: 20 puntos por pregunta correcta (0–100). Velocidad según orden de apertura: ${results.scoring.speedTable.map((v) => dec(v, 1)).join(' / ')}
        (luego −${dec(results.scoring.speedStep, 1)} por puesto, mínimo ${dec(results.scoring.speedFloor, 1)}); tiempo agotado: ${dec(results.scoring.timeoutSpeed, 1)}.
        Nota = puntaje redondeado a un decimal. Desempates: aciertos, abrir antes del límite, menor tiempo, orden de apertura.
      </p>
    </section>
    <section class="stack sm">
      <h2>Resultados por equipo</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>Equipo</th><th>Candado</th><th>Estado</th><th>Aciertos</th><th>Tiempo</th><th>Acierto (0-5)</th><th>Velocidad</th><th>Puntaje</th><th>Nota</th><th>Integrantes</th></tr></thead>
        <tbody>${results.teams.map((r) => html`<tr>
          <td><b>${r.position}</b></td>
          <td><b>${r.name}</b>${r.tiebreak ? html`<div class="tiny muted">${r.tiebreak}</div>` : null}</td>
          <td>${r.lock} · ${lockName(r.lock)}</td>
          <td>${STATUS[r.closedBy] ?? (r.opened ? 'Abierto' : 'En curso')}${r.opened ? ` (${r.breakdown.speedPosition}.º)` : ''}</td>
          <td>${r.correct}/${r.total}</td>
          <td>${r.elapsedMs != null ? mmss(r.elapsedMs) : '—'}</td>
          <td>${dec(r.breakdown.accuracy5, 1)}</td>
          <td>${dec(r.breakdown.speed, 1)}</td>
          <td>${dec(r.score)}</td>
          <td><b>${grade(r.grade)}</b></td>
          <td class="small">${r.members.map((m) => m.name).join(', ')}</td>
        </tr>`)}</tbody>
      </table></div>
    </section>
    <section class="stack sm">
      <h2>Notas por estudiante</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Estudiante</th><th>Equipo</th><th>Candado</th><th>Puesto</th><th>Nota</th><th>Participación</th></tr></thead>
        <tbody>${results.students.map((s) => html`<tr>
          <td>${s.name}</td><td>${s.teamName}</td><td>${s.lock ?? '—'}</td><td>${s.position ?? '—'}</td>
          <td><b>${grade(s.grade)}</b></td><td>${s.participation} % (${s.votes} votos)</td>
        </tr>`)}</tbody>
      </table></div>
    </section>
    <section class="stack sm">
      <h2>Aciertos por pregunta</h2>
      <p class="small muted" style="margin:0">Ordenadas de la más difícil a la más fácil: útil para el mini debate y para retroalimentar el tema.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Candado</th><th>Pregunta</th><th>Aciertos</th><th>%</th></tr></thead>
        <tbody>${results.questionStats.map((q) => html`<tr>
          <td>${q.lock}</td><td class="small">${q.prompt}</td><td>${q.correct}/${q.attempts}</td><td><b>${q.accuracy ?? '—'}${q.accuracy != null ? ' %' : ''}</b></td>
        </tr>`)}</tbody>
      </table></div>
    </section>
  </div></div>`;
}
