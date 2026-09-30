#!/usr/bin/env node
/**
 * Simulación de carga: crea una sala, conecta N jugadores, arma equipos, inicia la
 * partida y hace que todos voten en ráfagas mientras los capitanes confirman.
 * Mide latencia de respuesta del servidor y cuenta errores.
 *
 * Uso:
 *   npm run load-test -- --url http://localhost:3000 --players 40
 *   MODERATOR_KEY=... npm run load-test -- --url https://tu-app.onrender.com --players 50 --chaos 0.15
 *
 * Opciones:
 *   --url       Servidor (por defecto http://localhost:3000)
 *   --players   Jugadores simulados (40)
 *   --key       Clave del moderador (o variable MODERATOR_KEY; por defecto profe123)
 *   --think     Tiempo máximo "pensando" antes de votar, en ms (1500)
 *   --minutes   Tiempo límite por candado en minutos (3)
 *   --chaos     Fracción de jugadores que se desconectan y reconectan a mitad de partida (0.1)
 *   --keep      No borrar la sala al terminar (para verla en el panel)
 *   --room      Unir los bots a una sala EXISTENTE (ensayo): no arma equipos ni inicia;
 *               los bots juegan cuando el moderador pulse «Iniciar» y la sala se conserva.
 */
import { io } from 'socket.io-client';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const URL_BASE = String(arg('url', 'http://localhost:3000')).replace(/\/$/, '');
const N = Number(arg('players', 40));
const KEY = String(arg('key', process.env.MODERATOR_KEY || 'profe123'));
const THINK = Number(arg('think', 1500));
const MINUTES = Number(arg('minutes', 3));
const CHAOS = Number(arg('chaos', 0.1));
const ROOM = arg('room', null);
const KEEP = Boolean(arg('keep', false)) || Boolean(ROOM);
const MAX_RUN_MS = ROOM ? 60 * 60_000 : (MINUTES * 60 + 60) * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

const stats = {
  lat: { vote: [], submit: [], join: [] },
  errors: new Map(),
  votes: 0,
  submits: 0,
  stateMsgs: 0,
  reconnects: 0,
  connectErrors: 0,
};
const addError = (msg) => stats.errors.set(msg, (stats.errors.get(msg) || 0) + 1);

function emitAck(socket, event, payload, bucket) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    socket.timeout(10_000).emit(event, payload, (err, res) => {
      const ms = performance.now() - t0;
      if (bucket) stats.lat[bucket].push(ms);
      if (err) {
        addError(`${event}: sin respuesta (timeout)`);
        return resolve({ ok: false });
      }
      if (!res?.ok) addError(`${event}: ${res?.error}`);
      resolve(res);
    });
  });
}

function connect(auth) {
  return new Promise((resolve, reject) => {
    const socket = io(URL_BASE, { auth, transports: ['websocket'], reconnection: true, reconnectionDelay: 500 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      stats.connectErrors++;
      reject(err);
    });
  });
}

function pct(list, p) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function summary(label, list) {
  if (!list.length) return `  ${label.padEnd(8)} sin datos`;
  const f = (n) => `${n.toFixed(0)} ms`.padStart(8);
  return `  ${label.padEnd(8)} n=${String(list.length).padStart(5)}  p50 ${f(pct(list, 50))}  p95 ${f(pct(list, 95))}  p99 ${f(pct(list, 99))}  máx ${f(Math.max(...list))}`;
}

class Bot {
  constructor(i, session) {
    this.i = i;
    this.session = session;
    this.team = null;
    this.pendingVote = new Set();
    this.submitted = new Set();
    this.socket = null;
  }

  async start() {
    this.socket = await connect({ role: 'player', code: this.session.code, token: this.session.token });
    this.socket.on('state:team', (t) => {
      stats.stateMsgs++;
      this.team = t;
      this.act();
    });
    this.socket.on('state:public', () => stats.stateMsgs++);
    this.socket.io.on('reconnect', () => stats.reconnects++);
  }

  act() {
    const t = this.team;
    if (!t?.started || t.closed || !t.question) return;
    const q = t.question;
    const me = this.session.playerId;
    const iVoted = t.votes.some((v) => v.playerId === me);
    if (!iVoted && !this.pendingVote.has(q.index)) {
      this.pendingVote.add(q.index);
      setTimeout(async () => {
        await this.vote(q);
        this.pendingVote.delete(q.index);
      }, rand(100, THINK));
    }
    if (t.captainId === me && !this.submitted.has(q.index)) {
      const online = t.members.filter((m) => m.online).length;
      if (iVoted && t.votes.length >= online) this.submit(q.index);
      else if (iVoted && !this.waitTimer) {
        // No esperar eternamente a un compañero desconectado.
        this.waitTimer = setTimeout(() => {
          this.waitTimer = null;
          if (this.team?.question?.index === q.index) this.submit(q.index);
        }, THINK * 2);
      }
    }
  }

  async vote(q) {
    if (!this.socket.connected || this.team?.question?.index !== q.index) return;
    const value = q.type === 'mc' ? Math.floor(Math.random() * q.options.length) : String(Math.round(rand(0, 60) * 100) / 100);
    stats.votes++;
    await emitAck(this.socket, 'player:vote', { q: q.index, value }, 'vote');
  }

  async submit(index) {
    if (this.submitted.has(index) || !this.socket.connected) return;
    this.submitted.add(index);
    stats.submits++;
    const res = await emitAck(this.socket, 'player:submit', { q: index }, 'submit');
    if (!res?.ok) this.submitted.delete(index);
  }

  async bounce() {
    this.socket.disconnect();
    await sleep(rand(1000, 4000));
    this.socket.connect();
    stats.reconnects++;
  }
}

async function main() {
  console.log(`▶ Prueba de carga contra ${URL_BASE} con ${N} jugadores`);
  const health = await fetch(`${URL_BASE}/healthz`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) throw new Error('El servidor no responde en /healthz. ¿Está encendido?');
  console.log(`  Servidor OK (almacenamiento: ${health.store})`);

  const mod = await connect({ role: 'moderator', key: KEY }).catch((e) => {
    throw new Error(`No se pudo entrar como moderador: ${e.message}`);
  });
  let modState = null;
  mod.on('state:mod', (s) => (modState = s));
  let code = ROOM ? String(ROOM).toUpperCase() : null;
  if (!code) {
    const created = await emitAck(mod, 'mod:createRoom', { title: `Prueba de carga (${N})` });
    if (!created?.ok) throw new Error('No se pudo crear la sala.');
    code = created.code;
  }
  const watched = await emitAck(mod, 'mod:watch', { code });
  if (!watched?.ok) throw new Error(`La sala ${code} no existe.`);
  if (!ROOM) {
    await emitAck(mod, 'mod:updateConfig', { patch: { timeLimitsSec: { 1: MINUTES * 60, 2: MINUTES * 60, 3: MINUTES * 60, 4: MINUTES * 60 } } });
    console.log(`  Sala ${code} creada`);
  }

  const t0 = performance.now();
  const sessions = await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const s = performance.now();
      const res = await fetch(`${URL_BASE}/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Bot ${String(i + 1).padStart(2, '0')}` }),
      }).then((r) => r.json());
      stats.lat.join.push(performance.now() - s);
      if (!res.ok) throw new Error(`Join falló: ${res.error}`);
      return res;
    }),
  );
  const bots = sessions.map((s, i) => new Bot(i, s));
  await Promise.all(bots.map((b) => b.start()));
  console.log(`  ${N} jugadores conectados en ${(performance.now() - t0).toFixed(0)} ms`);

  if (ROOM) {
    console.log(`  Bots listos en la sala ${code}. Arma equipos e inicia desde el panel; Ctrl+C para salir.`);
    while (modState?.phase !== 'running') await sleep(500);
  } else {
    await emitAck(mod, 'mod:autoAssign', { teamCount: 0 });
    await sleep(300);
    console.log(`  ${modState?.teams.length ?? '?'} equipos armados; iniciando partida…`);
    await emitAck(mod, 'mod:start', {});
  }
  const startedAt = performance.now();

  if (CHAOS > 0) {
    setTimeout(() => {
      const victims = bots.filter(() => Math.random() < CHAOS);
      console.log(`  ⚡ Desconectando ${victims.length} jugadores para probar la reconexión…`);
      victims.forEach((b) => b.bounce());
    }, THINK * 3);
  }

  while (performance.now() - startedAt < MAX_RUN_MS) {
    await sleep(1000);
    if (modState?.phase === 'finished') break;
    const done = modState?.teams.filter((t) => t.opened || t.closedBy).length ?? 0;
    process.stdout.write(`\r  … ${((performance.now() - startedAt) / 1000).toFixed(0)} s · candados cerrados ${done}/${modState?.teams.length ?? '?'} · votos ${stats.votes} · confirmaciones ${stats.submits}   `);
  }
  process.stdout.write('\n');
  if (modState?.phase !== 'finished') {
    console.log('  Tiempo máximo alcanzado: terminando la partida desde el moderador.');
    await emitAck(mod, 'mod:end', {});
    await sleep(500);
  }

  const results = modState?.results;
  const dur = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n■ Partida terminada en ${dur} s`);
  console.log(summary('join', stats.lat.join));
  console.log(summary('voto', stats.lat.vote));
  console.log(summary('confirmar', stats.lat.submit));
  console.log(`  Mensajes de estado recibidos: ${stats.stateMsgs} · reconexiones: ${stats.reconnects} · errores de conexión: ${stats.connectErrors}`);
  if (stats.errors.size) {
    console.log('  Respuestas con error (algunas son esperables: votos de una pregunta que el capitán acaba de confirmar):');
    for (const [msg, n] of stats.errors) console.log(`    ${String(n).padStart(4)} × ${msg}`);
  } else {
    console.log('  Sin errores.');
  }
  if (results) {
    console.log('\n  Ranking:');
    for (const r of results.teams) {
      console.log(`    ${String(r.position).padStart(2)}. ${r.name.padEnd(22)} C${r.lock}  ${r.correct}/${r.total}  vel ${r.breakdown.speed}  nota ${r.grade}${r.tiebreak ? `  (${r.tiebreak})` : ''}`);
    }
    const seqs = results.teams.filter((r) => r.opened).map((r) => r.finishSeq).sort((a, b) => a - b);
    const unique = new Set(seqs).size === seqs.length && seqs.every((s, i) => s === i + 1);
    console.log(`  Orden de apertura consistente (1..n sin repetidos): ${unique ? 'sí ✓' : 'NO ✗'}`);
  }

  bots.forEach((b) => b.socket.disconnect());
  if (!KEEP) await emitAck(mod, 'mod:deleteRoom', { code });
  else console.log(`  Sala ${code} conservada (--keep).`);
  mod.disconnect();
  const p95 = pct(stats.lat.submit, 95);
  process.exit(p95 > 1000 || stats.connectErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
