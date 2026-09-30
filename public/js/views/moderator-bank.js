import { html, useEffect, useRef, useState } from '../lib/html.js';
import { LOCKS, LETTERS, DIFFICULTY } from '../lib/format.js';
import { Icon, LevelIcon, Rich } from '../components/ui.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

function newQuestion(lock, type, existing) {
  let n = existing.filter((q) => q.lock === lock).length + 1;
  let id = `L${lock}-N${n}`;
  while (existing.some((q) => q.id === id)) id = `L${lock}-N${++n}`;
  const base = { id, lock, type, difficulty: 'media', prompt: '', data: '', hint: '', explanation: '', example: false, active: true };
  return type === 'mc' ? { ...base, options: ['', '', '', ''], answer: 0 } : { ...base, answer: 0, tolerance: 0.01, unit: '' };
}

/** Editor del banco de preguntas: no requiere tocar código ni el archivo JSON. */
export function BankEditor({ act, running }) {
  const [draft, setDraft] = useState(null);
  const [info, setInfo] = useState(null);
  const [lock, setLock] = useState(1);
  const [editing, setEditing] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    const res = await act('mod:getBank');
    if (res.ok) {
      setDraft(clone(res.bank));
      setInfo(res.info);
      setDirty(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!draft) return html`<p class="muted">Cargando banco…</p>`;

  const update = (fn) => {
    const next = clone(draft);
    fn(next);
    setDraft(next);
    setDirty(true);
    setMsg(null);
  };
  const qs = draft.questions.filter((q) => q.lock === lock);
  const indexOf = (id) => draft.questions.findIndex((q) => q.id === id);

  const move = (id, dir) => update((b) => {
    const list = b.questions;
    const i = list.findIndex((q) => q.id === id);
    let j = i + dir;
    while (j >= 0 && j < list.length && list[j].lock !== lock) j += dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  });

  async function save() {
    const res = await act('mod:saveBank', { bank: draft });
    if (res.ok) {
      setInfo(res.info);
      setDirty(false);
      setMsg({ kind: 'ok', text: `Banco guardado.${res.warnings?.length ? ` Avisos: ${res.warnings.length}.` : ''}`, list: res.warnings });
    } else {
      setMsg({ kind: 'error', text: res.error });
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'questions.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importJson(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.questions)) throw new Error('El archivo no tiene la lista "questions".');
      setDraft(parsed);
      setDirty(true);
      setMsg({ kind: 'warn', text: `Importadas ${parsed.questions.length} preguntas. Revisa y pulsa «Guardar cambios» para aplicarlas.` });
    } catch (err) {
      setMsg({ kind: 'error', text: `No se pudo leer el JSON: ${err.message}` });
    }
  }

  async function resetToFile() {
    if (!confirm('¿Descartar las ediciones del panel y volver al banco del archivo data/questions.json?')) return;
    const res = await act('mod:resetBank');
    if (res.ok) {
      setDraft(clone(res.bank));
      setInfo(res.info);
      setDirty(false);
      setMsg({ kind: 'ok', text: 'Se restauró el banco del archivo.' });
    }
  }

  const lockMeta = draft.locks.find((l) => Number(l.id) === lock) ?? { id: lock };
  const perLock = (l) => {
    const list = draft.questions.filter((q) => q.lock === l);
    return `${list.filter((q) => q.active !== false).length}/${list.length}`;
  };

  return html`
    <div class="card row">
      <div class="grow small">
        <b>Fuente:</b> ${info?.source === 'panel' ? 'editado desde este panel (guardado en el servidor)' : 'archivo data/questions.json'}
        ${dirty ? html` · <b style="color:var(--red)">cambios sin guardar</b>` : null}
        ${running ? html`<div class="tiny muted">La partida en curso usa una copia de las preguntas tomada al iniciar; los cambios aplican a la próxima partida.</div>` : null}
      </div>
      <button class="btn sm" disabled=${!dirty} onClick=${save}>Guardar cambios</button>
      <button class="btn sm secondary" disabled=${!dirty} onClick=${load}>Descartar</button>
      <button class="btn sm secondary" onClick=${exportJson}><${Icon} name="download" size=${14} /> Descargar JSON</button>
      <button class="btn sm secondary" onClick=${() => fileRef.current?.click()}>Importar JSON</button>
      <input ref=${fileRef} type="file" accept="application/json,.json" hidden onChange=${importJson} />
      <button class="btn sm danger" onClick=${resetToFile}>Restaurar archivo</button>
    </div>
    ${msg
      ? html`<div class=${msg.kind === 'error' ? 'error-box' : msg.kind === 'warn' ? 'warn-box' : 'ok-box'} style="white-space:pre-line">
          ${msg.text}${msg.list?.length ? html`<ul class="small" style="margin:.4rem 0 0">${msg.list.map((w) => html`<li>${w}</li>`)}</ul>` : null}
        </div>`
      : null}
    <nav class="tabs" style="border-radius:var(--r-md)">
      ${[1, 2, 3, 4].map((l) => html`<button class=${`tab ${lock === l ? 'active' : ''}`} onClick=${() => { setLock(l); setEditing(null); }}>
        C${l} · ${LOCKS[l].short} <span class="tiny muted">(${perLock(l)} activas)</span>
      </button>`)}
    </nav>
    <div class=${`card stack sm c-${LOCKS[lock].key}`} style="border-top:5px solid var(--c)">
      <div class="row nowrap"><${LevelIcon} lock=${lock} size=${40} /><h3 class="grow">Historia del candado</h3></div>
      <div class="row">
        <div class="field grow"><label>Título</label><input class="input" value=${lockMeta.title ?? ''} onInput=${(e) => update((b) => { lockRef(b, lock).title = e.target.value; })} /></div>
        <div class="field grow"><label>Insignia al abrirlo</label><input class="input" value=${lockMeta.badge ?? ''} onInput=${(e) => update((b) => { lockRef(b, lock).badge = e.target.value; })} /></div>
      </div>
      <div class="field"><label>Historia (se muestra al equipo al iniciar)</label><textarea class="textarea" rows="2" value=${lockMeta.story ?? ''} onInput=${(e) => update((b) => { lockRef(b, lock).story = e.target.value; })}></textarea></div>
    </div>
    <p class="small muted" style="margin:0">Cada equipo recibe las primeras N preguntas <b>activas</b> de su candado (N = «Preguntas por candado» en Ajustes), en orden barajado si está activado. Las desactivadas quedan de reserva.</p>
    <div class="stack sm">
      ${qs.map((q, i) => html`<div class=${`q-item ${q.active === false ? 'inactive' : ''}`}>
        <div class="row" style="gap:.5rem">
          <b class="small" style="min-width:4.5em">${i + 1}. ${q.id}</b>
          <span class="pill ghost" style="background:var(--paper);color:var(--ink-2)">${q.type === 'mc' ? 'Opción múltiple' : 'Numérica'}</span>
          <span class="tiny muted">${DIFFICULTY[q.difficulty]?.label ?? 'Media'}</span>
          ${q.example !== false ? html`<span class="pill l3" title="Pregunta de ejemplo pendiente de revisión">Ejemplo</span>` : null}
          <span class="grow"></span>
          <label class="check tiny" style="padding:0"><input type="checkbox" checked=${q.active !== false} onChange=${(e) => update((b) => { b.questions[indexOf(q.id)].active = e.target.checked; })} /> Activa</label>
          <button class="btn sm secondary" aria-label="Subir" onClick=${() => move(q.id, -1)} disabled=${i === 0}>↑</button>
          <button class="btn sm secondary" aria-label="Bajar" onClick=${() => move(q.id, 1)} disabled=${i === qs.length - 1}>↓</button>
          <button class="btn sm" onClick=${() => setEditing(editing === q.id ? null : q.id)}>${editing === q.id ? 'Cerrar' : 'Editar'}</button>
        </div>
        ${editing === q.id
          ? html`<${QuestionForm} q=${q} onChange=${(fn) => update((b) => fn(b.questions[indexOf(q.id)]))}
              onRename=${(id) => {
                if (!id || draft.questions.some((x) => x.id === id)) return;
                update((b) => { b.questions[indexOf(q.id)].id = id; });
                setEditing(id);
              }}
              onDuplicate=${() => {
                const copy = { ...clone(q), id: newQuestion(lock, q.type, draft.questions).id };
                update((b) => b.questions.splice(indexOf(q.id) + 1, 0, copy));
                setEditing(copy.id);
              }}
              onDelete=${() => {
                if (confirm(`¿Eliminar la pregunta ${q.id}?`)) {
                  update((b) => b.questions.splice(indexOf(q.id), 1));
                  setEditing(null);
                }
              }} />`
          : html`<div class="small" style="margin-top:.35rem"><${Rich} text=${q.prompt || '(sin enunciado)'} /></div>`}
      </div>`)}
    </div>
    <div class="row">
      ${['mc', 'numeric'].map((type) => html`<button class="btn sm violet" onClick=${() => {
        const q = newQuestion(lock, type, draft.questions);
        update((b) => b.questions.push(q));
        setEditing(q.id);
      }}>+ Pregunta ${type === 'mc' ? 'de opción múltiple' : 'numérica'}</button>`)}
    </div>
  `;
}

function lockRef(bank, id) {
  let l = bank.locks.find((x) => Number(x.id) === id);
  if (!l) {
    l = { id };
    bank.locks.push(l);
  }
  return l;
}

function QuestionForm({ q, onChange, onRename, onDuplicate, onDelete }) {
  const set = (field, value) => onChange((x) => { x[field] = value; });
  const changeType = (type) => onChange((x) => {
    x.type = type;
    if (type === 'mc') {
      x.options = x.options?.length ? x.options : ['', '', '', ''];
      x.answer = 0;
      delete x.tolerance;
    } else {
      delete x.options;
      x.answer = 0;
      x.tolerance = 0.01;
    }
  });

  return html`<div class="stack sm" style="margin-top:.7rem">
    <div class="row">
      <div class="field" style="width:130px"><label>Id</label><input class="input" value=${q.id} onChange=${(e) => onRename(e.target.value.trim())} /></div>
      <div class="field" style="width:190px"><label>Tipo</label>
        <select class="select" value=${q.type} onChange=${(e) => changeType(e.target.value)}>
          <option value="mc">Opción múltiple</option><option value="numeric">Numérica</option>
        </select></div>
      <div class="field" style="width:140px"><label>Dificultad</label>
        <select class="select" value=${q.difficulty || 'media'} onChange=${(e) => set('difficulty', e.target.value)}>
          ${Object.entries(DIFFICULTY).map(([k, d]) => html`<option value=${k}>${d.label}</option>`)}
        </select></div>
      <label class="check small"><input type="checkbox" checked=${q.example !== false} onChange=${(e) => set('example', e.target.checked)} /> Marcada como ejemplo</label>
    </div>
    <div class="field"><label>Enunciado</label><textarea class="textarea" rows="3" value=${q.prompt} onInput=${(e) => set('prompt', e.target.value)}></textarea>
      <span class="tiny muted">Tip: escribe los datos como «n = 25» o «x̄ = 48»; se resaltan en dorado como en la presentación.</span></div>
    <div class="row">
      <div class="field grow"><label>Datos / tabla (opcional)</label><textarea class="textarea" rows="2" value=${q.data || ''} onInput=${(e) => set('data', e.target.value)}></textarea></div>
      <div class="field grow"><label>Pista (opcional)</label><textarea class="textarea" rows="2" value=${q.hint || ''} onInput=${(e) => set('hint', e.target.value)}></textarea></div>
    </div>
    ${q.type === 'mc'
      ? html`<div class="stack sm">
          <div class="label">Opciones (marca la correcta; se barajan por equipo)</div>
          ${q.options.map((o, i) => html`<div class="option-edit">
            <input type="radio" name=${`ans-${q.id}`} checked=${q.answer === i} onChange=${() => set('answer', i)} aria-label=${`Opción ${LETTERS[i]} es la correcta`} />
            <b>${LETTERS[i]}</b>
            <input class="input grow" value=${o} onInput=${(e) => onChange((x) => { x.options[i] = e.target.value; })} />
            <button class="btn sm secondary" disabled=${q.options.length <= 2} aria-label="Quitar opción" onClick=${() => onChange((x) => {
              x.options.splice(i, 1);
              if (x.answer >= x.options.length) x.answer = x.options.length - 1;
              else if (x.answer > i) x.answer -= 1;
            })}>✕</button>
          </div>`)}
          ${q.options.length < 6 ? html`<button class="btn sm secondary" style="align-self:flex-start" onClick=${() => onChange((x) => { x.options.push(''); })}>+ Opción</button>` : null}
        </div>`
      : html`<div class="row">
          <div class="field" style="width:160px"><label>Respuesta</label><input class="input" type="number" step="any" value=${q.answer} onChange=${(e) => set('answer', Number(e.target.value))} /></div>
          <div class="field" style="width:160px"><label>Tolerancia (±)</label><input class="input" type="number" step="any" min="0" value=${q.tolerance ?? ''} onChange=${(e) => set('tolerance', e.target.value === '' ? undefined : Number(e.target.value))} /></div>
          <div class="field" style="width:120px"><label>Unidad</label><input class="input" value=${q.unit || ''} onInput=${(e) => set('unit', e.target.value)} /></div>
          <span class="tiny muted grow">Se acepta coma o punto decimal. Tolerancia 0 = valor exacto.</span>
        </div>`}
    <div class="field"><label>Explicación (se muestra en la revisión)</label><textarea class="textarea" rows="3" value=${q.explanation || ''} onInput=${(e) => set('explanation', e.target.value)}></textarea></div>
    <div class="row">
      <span class="grow"></span>
      <button class="btn sm secondary" onClick=${onDuplicate}>Duplicar</button>
      <button class="btn sm danger" onClick=${onDelete}>Eliminar</button>
    </div>
  </div>`;
}
