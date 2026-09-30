import { html, useState } from '../lib/html.js';
import { LOCKS } from '../lib/format.js';
import { LevelIcon, Padlock } from '../components/ui.js';

/** Certificado de Científico de Datos (se imprime o guarda como PDF desde el celular). */
export function Certificate() {
  const q = new URLSearchParams(location.search);
  const [name, setName] = useState(q.get('nombre') || '');
  const team = q.get('equipo') || '';
  const position = Number(q.get('puesto')) || null;
  const rank = q.get('rango') || 'Científico de Datos';
  const lock = LOCKS[Number(q.get('candado'))] ? Number(q.get('candado')) : null;
  const badges = (q.get('insignias') || '').split('|').filter(Boolean).slice(0, 6);
  const date = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  return html`<div class="print-page" style="background:var(--navy-950, #0b0e24)">
    <div class="sheet">
      <div class="row between no-print" style="color:#fff">
        <input class="input" style="max-width:320px" value=${name} maxlength="40" aria-label="Nombre en el certificado" onInput=${(e) => setName(e.target.value)} />
        <button class="btn" onClick=${() => window.print()}>Guardar como PDF / imprimir</button>
      </div>
      <article class="cert">
        <header class="row between">
          <div>
            <div class="tiny" style="letter-spacing:.2em;text-transform:uppercase;opacity:.75">Análisis Cuantitativo de Datos · Escape Room Estadístico</div>
            <div class="tiny" style="opacity:.6">El Laboratorio Sellado</div>
          </div>
          <div class="row nowrap" style="gap:.35rem">${[1, 2, 3, 4].map((l) => html`<${LevelIcon} lock=${l} size=${34} number=${false} />`)}</div>
        </header>
        <div class="stack" style="align-content:center;justify-items:center;text-align:center;gap:.6em">
          <${Padlock} open color="var(--gold)" size=${64} />
          <div class="small" style="letter-spacing:.3em;text-transform:uppercase;opacity:.8">Certificado de</div>
          <h1 style="margin:0">Científico <span class="gold">de Datos</span></h1>
          <div class="small" style="opacity:.8">Se otorga a</div>
          <div class="name">${name || 'Tu nombre'}</div>
          <p style="max-width:40em;margin:.2em 0;opacity:.9">
            por escapar del Laboratorio Sellado aplicando estimación, pruebas de hipótesis, regresión lineal y ANOVA
            ${team ? html` junto al equipo <b class="gold">${team}</b>` : null}${lock ? html`, desbloqueando el candado <b>${lock} · ${LOCKS[lock].short}</b>` : null}.
          </p>
          <div class="row" style="justify-content:center;gap:.5rem">
            <span class="pill">Rango: ${rank}</span>
            ${position ? html`<span class="pill l3">${position}.º lugar</span>` : null}
            ${badges.map((b) => html`<span class="pill ghost">${b}</span>`)}
          </div>
        </div>
        <footer class="row between small" style="opacity:.85">
          <span>${date}</span>
          <span style="border-top:1px solid rgba(255,255,255,.5);padding-top:.3em;min-width:min(12em,100%);text-align:center">Moderador(a) de la actividad</span>
        </footer>
      </article>
    </div>
  </div>`;
}
