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
    <div class=${`card bank-bar ${dirty ? 'dirty' : ''}`}>
      <div class="bank-info">
        <span class="sec-icon"><${Icon} name="book" size=${16} /></span>
        <div class="grow small">
          <b>${info?.source === 'panel' ? 'Banco editado desde este panel' : 'Banco del archivo data/questions.json'}</b>
          ${dirty ? html`<span class="bank-dirty">Cambios sin guardar</span>` : null}
          ${running ? html`<div class="tiny muted">La partida en curso usa una copia tomada al iniciar; los cambios aplican a la próxima partida.</div>` : null}
        </div>
      </div>
      <div class="bank-actions">
        <button class="btn sm" disabled=${!dirty} onClick=${save}><${Icon} name="check" size=${14} /> Guardar</button>
        <button class="btn sm secondary" disabled=${!dirty} onClick=${load}><${Icon} name="rotate" size=${14} /> Descartar</button>
        <span class="bank-sep"></span>
        <button class="btn sm secondary" onClick=${exportJson} title="Descargar el banco en JSON"><${Icon} name="download" size=${14} /> JSON</button>
        <button class="btn sm secondary" onClick=${() => fileRef.current?.click()} title="Importar un banco en JSON"><${Icon} name="up" size=${14} /> Importar</button>
        <input ref=${fileRef} type="file" accept="application/json,.json" hidden onChange=${importJson} />
        <button class="btn sm secondary danger-text" onClick=${resetToFile} title="Volver al archivo original"><${Icon} name="trash" size=${14} /> Restaurar</button>
      </div>
    </div>
    ${msg
      ? html`<div class=${msg.kind === 'error' ? 'error-box' : msg.kind === 'warn' ? 'warn-box' : 'ok-box'} style="white-space:pre-line">
          ${msg.text}${msg.list?.length ? html`<ul class="small" style="margin:.4rem 0 0">${msg.list.map((w) => html`<li>${w}</li>`)}</ul>` : null}
        </div>`
      : null}
    <nav class="tabs lock-tabs" aria-label="Candado">
      ${[1, 2, 3, 4].map((l) => html`<button class=${`tab c-${LOCKS[l].key} ${lock === l ? 'active' : ''}`} aria-pressed=${lock === l} onClick=${() => { setLock(l); setEditing(null); }}>
        <span class="tab-dot"></span><span>C${l}<span class="lbl-long"> · ${LOCKS[l].short}</span></span><span class="tab-count">${perLock(l)}</span>
      </button>`)}
    </nav>
    <div class=${`card stack sm c-${LOCKS[lock].key}`} style="border-top:5px solid var(--c)">
      <div class="row nowrap"><${LevelIcon} lock=${lock} size=${40} /><h3 class="grow">Historia del candado</h3></div>
      <div class="field-grid wide">
        <div class="field"><label>Título</label><input class="input" value=${lockMeta.title ?? ''} onInput=${(e) => update((b) => { lockRef(b, lock).title = e.target.value; })} /></div>
        <div class="field"><label>Insignia al abrirlo</label><input class="input" value=${lockMeta.badge ?? ''} onInput=${(e) => update((b) => { lockRef(b, lock).badge = e.target.value; })} /></div>
      </div>
      <div class="field"><label>Historia (se muestra al equipo al iniciar)</label><textarea class="textarea" rows="2" value=${lockMeta.story ?? ''} onInput=${(e) => update((b) => { lockRef(b, lock).story = e.target.value; })}></textarea></div>
    </div>
    <p class="small muted" style="margin:0">Cada equipo recibe las primeras N preguntas <b>activas</b> de su candado (N = «Preguntas por candado» en Ajustes), en orden barajado si está activado. Las desactivadas quedan de reserva.</p>
    <div class="stack sm">
      ${qs.map((q, i) => html`<div class=${`q-item c-${LOCKS[lock].key} ${q.active === false ? 'inactive' : ''}`}>
        <div class="q-head">
          <div class="q-meta">
            <span class="q-num">${i + 1}</span>
            <b class="small">${q.id}</b>
            <span class="pill ghost">${q.type === 'mc' ? 'Opción múltiple' : 'Numérica'}</span>
            <span class="tiny muted">${DIFFICULTY[q.difficulty]?.label ?? 'Media'}</span>
            ${q.example !== false ? html`<span class="pill l3" title="Pregunta de ejemplo pendiente de revisión">Ejemplo</span>` : null}
          </div>
          <div class="q-actions">
            <label class="q-active" title="Las preguntas inactivas quedan de reserva">
              <input type="checkbox" class="switch sm" checked=${q.active !== false} onChange=${(e) => update((b) => { b.questions[indexOf(q.id)].active = e.target.checked; })} />
              <span class="tiny">Activa</span>
            </label>
            <button class="icon-btn xs" aria-label="Subir" title="Subir" onClick=${() => move(q.id, -1)} disabled=${i === 0}><${Icon} name="up" size=${14} /></button>
            <button class="icon-btn xs" aria-label="Bajar" title="Bajar" onClick=${() => move(q.id, 1)} disabled=${i === qs.length - 1}><${Icon} name="down" size=${14} /></button>
            <button class=${`btn sm ${editing === q.id ? 'secondary' : ''}`} onClick=${() => setEditing(editing === q.id ? null : q.id)}>${editing === q.id ? 'Cerrar' : 'Editar'}</button>
          </div>
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
      }}><${Icon} name="plus" size=${14} /> Pregunta ${type === 'mc' ? 'de opción múltiple' : 'numérica'}</button>`)}
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
    <div class="field-grid q-meta-fields">
      <div class="field"><label>Id</label><input class="input" value=${q.id} onChange=${(e) => onRename(e.target.value.trim())} /></div>
      <div class="field q-type-field"><label>Tipo</label>
        <select class="select" value=${q.type} onChange=${(e) => changeType(e.target.value)}>
          <option value="mc">Opción múltiple</option><option value="numeric">Numérica</option>
        </select></div>
      <div class="field"><label>Dificultad</label>
        <select class="select" value=${q.difficulty || 'media'} onChange=${(e) => set('difficulty', e.target.value)}>
          ${Object.entries(DIFFICULTY).map(([k, d]) => html`<option value=${k}>${d.label}</option>`)}
        </select></div>
    </div>
    <label class="toggle-row"><span class="grow"><b class="small">Marcada como ejemplo</b><span class="tiny muted">Recordatorio de que aún debes revisarla.</span></span>
      <input type="checkbox" class="switch" checked=${q.example !== false} onChange=${(e) => set('example', e.target.checked)} /></label>
    <div class="field"><label>Enunciado</label><textarea class="textarea" rows="3" value=${q.prompt} onInput=${(e) => set('prompt', e.target.value)}></textarea>
      <span class="tiny muted">Tip: escribe los datos como «n = 25» o «x̄ = 48»; se resaltan en dorado como en la presentación.</span></div>
    <div class="field-grid wide">
      <div class="field"><label>Datos / tabla (opcional)</label><textarea class="textarea" rows="2" value=${q.data || ''} onInput=${(e) => set('data', e.target.value)}></textarea></div>
      <div class="field"><label>Pista (opcional)</label><textarea class="textarea" rows="2" value=${q.hint || ''} onInput=${(e) => set('hint', e.target.value)}></textarea></div>
    </div>
    ${q.type === 'mc'
      ? html`<div class="stack sm">
          <div class="label">Opciones (marca la correcta; se barajan por equipo)</div>
          ${q.options.map((o, i) => html`<div class="option-edit">
            <input type="radio" name=${`ans-${q.id}`} checked=${q.answer === i} onChange=${() => set('answer', i)} aria-label=${`Opción ${LETTERS[i]} es la correcta`} />
            <b>${LETTERS[i]}</b>
            <input class="input grow" value=${o} onInput=${(e) => onChange((x) => { x.options[i] = e.target.value; })} />
            <button class="icon-btn danger-ghost" disabled=${q.options.length <= 2} aria-label="Quitar opción" title="Quitar opción" onClick=${() => onChange((x) => {
              x.options.splice(i, 1);
              if (x.answer >= x.options.length) x.answer = x.options.length - 1;
              else if (x.answer > i) x.answer -= 1;
            })}><${Icon} name="x" size=${16} /></button>
          </div>`)}
          ${q.options.length < 6 ? html`<button class="btn sm secondary" style="align-self:flex-start" onClick=${() => onChange((x) => { x.options.push(''); })}><${Icon} name="plus" size=${14} /> Opción</button>` : null}
        </div>`
      : html`<div class="stack sm">
          <div class="field-grid">
            <div class="field"><label>Respuesta</label><input class="input" type="number" step="any" value=${q.answer} onChange=${(e) => set('answer', Number(e.target.value))} /></div>
            <div class="field"><label>Tolerancia (±)</label><input class="input" type="number" step="any" min="0" value=${q.tolerance ?? ''} onChange=${(e) => set('tolerance', e.target.value === '' ? undefined : Number(e.target.value))} /></div>
            <div class="field"><label>Unidad</label><input class="input" value=${q.unit || ''} onInput=${(e) => set('unit', e.target.value)} /></div>
          </div>
          <span class="tiny muted">Se acepta coma o punto decimal. Tolerancia 0 = valor exacto.</span>
        </div>`}
    <div class="field"><label>Explicación (se muestra en la revisión)</label><textarea class="textarea" rows="3" value=${q.explanation || ''} onInput=${(e) => set('explanation', e.target.value)}></textarea></div>
    <div class="row" style="justify-content:flex-end">
      <button class="btn sm secondary" onClick=${onDuplicate}><${Icon} name="plus" size=${14} /> Duplicar</button>
      <button class="btn sm danger" onClick=${onDelete}><${Icon} name="trash" size=${14} /> Eliminar</button>
    </div>
  </div>`;
}
