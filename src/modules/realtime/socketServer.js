import { Server } from 'socket.io';
import { safeEqual } from '../../lib/ids.js';
import { DomainError } from '../../lib/errors.js';
import { log } from '../../lib/logger.js';
import { createRateLimiter } from '../../lib/rateLimit.js';
import { applyConfigPatch, addLog, orderedTeams } from '../rooms/roomModel.js';
import { findPlayerByToken, removePlayer } from '../rooms/playerService.js';
import * as teams from '../teams/teamService.js';
import * as engine from '../game/gameEngine.js';
import { moderatorView, publicView, teamView } from './views.js';

/**
 * Capa de tiempo real. Traduce mensajes de Socket.IO en llamadas a los módulos de
 * dominio y difunde el estado resultante a cada audiencia:
 *   pub:<SALA>          proyector + todos los jugadores (estado público)
 *   team:<SALA>:<EQ>    integrantes de un equipo (pregunta actual, votos, historial)
 *   mod:<SALA>          moderadores
 *   player:<SALA>:<ID>  mensajes personales (p. ej. expulsión)
 */
export function createRealtime(httpServer, { manager, bankService, config }) {
  const io = new Server(httpServer, {
    cors: { origin: false },
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 1e6,
  });

  const pending = new Map();
  const playerSockets = new Map();

  const ctx = (room) => ({ bank: bankService.get(), bankInfo: bankService.info(), isOnline: manager.onlineChecker(room.code) });

  function socketsOf(code, playerId) {
    return playerSockets.get(code)?.get(playerId) ?? new Set();
  }

  function trackSocket(code, playerId, socket, add) {
    let byPlayer = playerSockets.get(code);
    if (!byPlayer) playerSockets.set(code, (byPlayer = new Map()));
    const set = byPlayer.get(playerId) ?? new Set();
    if (add) set.add(socket);
    else set.delete(socket);
    if (set.size) byPlayer.set(playerId, set);
    else byPlayer.delete(playerId);
  }

  /** Asegura que cada socket de jugador esté en la sala de su equipo actual. */
  function syncMemberships(room) {
    const byPlayer = playerSockets.get(room.code);
    if (!byPlayer) return;
    for (const [playerId, sockets] of byPlayer) {
      const teamId = room.players[playerId]?.teamId ?? null;
      const wanted = teamId ? `team:${room.code}:${teamId}` : null;
      for (const s of sockets) {
        if (s.data.teamRoom === wanted) continue;
        if (s.data.teamRoom) s.leave(s.data.teamRoom);
        if (wanted) s.join(wanted);
        s.data.teamRoom = wanted;
      }
    }
  }

  function broadcastNow(room) {
    pending.delete(room.code);
    if (!manager.get(room.code)) return;
    const now = Date.now();
    const c = ctx(room);
    syncMemberships(room);
    io.to(`pub:${room.code}`).emit('state:public', publicView(room, { ...c, now }));
    for (const team of orderedTeams(room)) {
      io.to(`team:${room.code}:${team.id}`).emit('state:team', teamView(room, team, { ...c, now }));
    }
    io.to(`mod:${room.code}`).emit('state:mod', moderatorView(room, { ...c, now }));
  }

  /** Agrupa cambios muy seguidos (ráfaga de votos) en una sola difusión. */
  function scheduleBroadcast(room) {
    if (pending.has(room.code)) return;
    pending.set(room.code, setTimeout(() => broadcastNow(room), config.broadcastThrottleMs));
  }

  manager.on('changed', scheduleBroadcast);
  manager.on('presence', scheduleBroadcast);
  manager.on('removed', (code) => {
    io.to(`pub:${code}`).emit('session:ended', { reason: 'closed' });
    playerSockets.delete(code);
  });

  function emitEvent(code, target, event) {
    const channel = target === 'pub' ? `pub:${code}` : target;
    io.to(channel).emit('game:event', event);
    if (target === 'pub') io.to(`mod:${code}`).emit('game:event', event);
  }

  function handle(socket, event, fn, { limiter } = {}) {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (limiter && !limiter()) return reply({ ok: false, error: 'Vas muy rápido. Espera un segundo.' });
      try {
        const result = await fn(payload ?? {});
        reply({ ok: true, ...(result && typeof result === 'object' ? result : {}) });
      } catch (err) {
        if (err instanceof DomainError) return reply({ ok: false, error: err.message });
        log.error(`Error en ${event}:`, err);
        reply({ ok: false, error: 'Error interno del servidor.' });
      }
    });
  }

  // ---------- Autenticación del handshake ----------
  io.use((socket, next) => {
    const auth = socket.handshake.auth || {};
    if (auth.role === 'moderator') {
      if (!safeEqual(auth.key, config.moderatorKey)) return next(new Error('CLAVE_INVALIDA'));
      socket.data.role = 'moderator';
      return next();
    }
    const room = manager.get(auth.code);
    if (!room) return next(new Error('SALA_NO_EXISTE'));
    if (auth.role === 'projector') {
      socket.data = { role: 'projector', code: room.code };
      return next();
    }
    if (auth.role === 'player') {
      const player = findPlayerByToken(room, auth.token);
      if (!player) return next(new Error('SESION_INVALIDA'));
      socket.data = { role: 'player', code: room.code, playerId: player.id, teamRoom: null };
      return next();
    }
    return next(new Error('ROL_INVALIDO'));
  });

  io.on('connection', (socket) => {
    socket.on('clock:ping', (_payload, ack) => typeof ack === 'function' && ack({ serverNow: Date.now() }));
    const { role } = socket.data;
    if (role === 'player') onPlayer(socket);
    else if (role === 'projector') onProjector(socket);
    else if (role === 'moderator') onModerator(socket);
  });

  // ---------- Proyector ----------
  function onProjector(socket) {
    const room = manager.get(socket.data.code);
    socket.join(`pub:${room.code}`);
    socket.emit('state:public', publicView(room, { ...ctx(room), now: Date.now() }));
  }

  // ---------- Jugador ----------
  function onPlayer(socket) {
    const { code, playerId } = socket.data;
    const limiter = createRateLimiter({ capacity: 15, refillPerSec: 8 });
    socket.join(`pub:${code}`);
    socket.join(`player:${code}:${playerId}`);
    trackSocket(code, playerId, socket, true);
    manager.connect(code, playerId);
    const room = manager.get(code);
    syncMemberships(room);
    const now = Date.now();
    const c = ctx(room);
    socket.emit('state:me', { playerId, name: room.players[playerId]?.name, code });
    socket.emit('state:public', publicView(room, { ...c, now }));
    const myTeam = room.teams[room.players[playerId]?.teamId];
    if (myTeam) socket.emit('state:team', teamView(room, myTeam, { ...c, now }));

    handle(socket, 'player:vote', ({ q, value }) => {
      manager.mutate(code, (r) => engine.vote(r, playerId, Number(q), value));
    }, { limiter });

    handle(socket, 'player:submit', ({ q }) => {
      const result = manager.mutate(code, (r) => engine.submit(r, playerId, Number(q), manager.onlineChecker(code)));
      const r = manager.get(code);
      const team = r.teams[result.teamId];
      emitEvent(code, `team:${code}:${team.id}`, {
        type: 'answer',
        index: result.index,
        correct: r.config.feedbackMode === 'end' ? null : result.correct,
        byName: r.players[playerId]?.name,
      });
      if (result.opened) {
        emitEvent(code, 'pub', { type: 'opened', teamId: team.id, name: team.name, lock: team.lock, seq: result.finishSeq });
      }
      if (engine.allClosed(r) && r.phase === 'running') {
        manager.mutate(code, (rr) => engine.endGame(rr, Date.now(), 'completed'));
        emitEvent(code, 'pub', { type: 'ended' });
      }
      return { correct: r.config.feedbackMode === 'end' ? null : result.correct, opened: result.opened };
    }, { limiter });

    handle(socket, 'player:claimCaptain', ({ q }) => {
      const result = manager.mutate(code, (r) => engine.claimCaptain(r, playerId, Number(q), manager.onlineChecker(code)));
      if (result.changed) {
        emitEvent(code, `team:${code}:${result.teamId}`, { type: 'captain', byName: result.byName, previousName: result.previousName });
      }
      return {};
    }, { limiter });

    handle(socket, 'player:leave', () => {
      const r = manager.get(code);
      if (r && r.phase === 'lobby') manager.mutate(code, (rr) => removePlayer(rr, playerId));
      socket.disconnect(true);
    });

    socket.on('disconnect', () => {
      trackSocket(code, playerId, socket, false);
      manager.disconnect(code, playerId);
    });
  }

  // ---------- Moderador ----------
  function onModerator(socket) {
    let watching = null;
    const watch = (code) => {
      if (watching) {
        socket.leave(`mod:${watching}`);
        socket.leave(`pub:${watching}`);
      }
      watching = code;
      socket.join(`mod:${code}`);
      const room = manager.get(code);
      socket.emit('state:mod', moderatorView(room, { ...ctx(room), now: Date.now() }));
    };
    const current = () => {
      if (!watching || !manager.get(watching)) throw new DomainError('Selecciona una sala.');
      return watching;
    };
    const roomSummary = (r) => ({
      code: r.code,
      title: r.config.title,
      phase: r.phase,
      players: Object.keys(r.players).length,
      teams: r.teamOrder.length,
      createdAt: r.createdAt,
    });

    handle(socket, 'mod:listRooms', () => ({ rooms: manager.list().map(roomSummary) }));
    handle(socket, 'mod:createRoom', ({ title }) => {
      const room = manager.create();
      if (title) manager.mutate(room.code, (r) => applyConfigPatch(r, { title }));
      watch(room.code);
      return { code: room.code };
    });
    handle(socket, 'mod:watch', ({ code }) => {
      const room = manager.require(code);
      watch(room.code);
      return { code: room.code };
    });
    handle(socket, 'mod:deleteRoom', async ({ code }) => {
      await manager.remove(code);
      if (watching === code) watching = null;
    });

    const act = (event, fn) => handle(socket, event, (payload) => manager.mutate(current(), (room) => fn(room, payload)));

    act('mod:updateConfig', (room, { patch }) => {
      applyConfigPatch(room, patch);
      if (room.phase === 'finished' && patch?.scoring) room.results = engine.buildResults(room);
    });
    act('mod:autoAssign', (room, { teamCount }) => ({ teams: teams.autoAssign(room, { teamCount }) }));
    act('mod:addTeam', (room) => ({ teamId: teams.addTeam(room).id }));
    act('mod:deleteTeam', (room, { teamId }) => teams.deleteTeam(room, teamId));
    act('mod:renameTeam', (room, { teamId, name }) => teams.renameTeam(room, teamId, name));
    act('mod:setTeamLock', (room, { teamId, lock }) => teams.setTeamLock(room, teamId, lock));
    act('mod:movePlayer', (room, { playerId, teamId }) => {
      const p = teams.movePlayer(room, playerId, teamId || null);
      if (teamId && room.game && !room.teams[teamId].progress) engine.initTeamProgress(room, room.teams[teamId]);
      addLog(room, `${p.name} → ${teamId ? room.teams[teamId].name : 'sin equipo'}.`);
    });
    act('mod:kick', (room, { playerId }) => {
      const p = removePlayer(room, playerId);
      io.to(`player:${room.code}:${playerId}`).emit('session:ended', { reason: 'kicked' });
      for (const s of socketsOf(room.code, playerId)) s.disconnect(true);
      addLog(room, `${p.name} fue retirado de la sala.`);
    });
    act('mod:start', (room) => {
      if (room.teamOrder.length === 0) teams.autoAssign(room, {});
      for (const p of Object.values(room.players)) {
        if (!p.teamId) teams.placeLatePlayer(room, p.id, { force: true });
      }
      engine.startGame(room, bankService.get());
      emitEvent(room.code, 'pub', { type: 'started' });
    });
    act('mod:pause', (room) => {
      engine.pauseGame(room);
      emitEvent(room.code, 'pub', { type: 'paused' });
    });
    act('mod:resume', (room) => {
      engine.resumeGame(room);
      emitEvent(room.code, 'pub', { type: 'resumed' });
    });
    act('mod:addTime', (room, { lock, seconds }) => {
      engine.addTime(room, lock, seconds);
      emitEvent(room.code, 'pub', { type: 'time', lock, seconds });
    });
    act('mod:end', (room) => {
      engine.endGame(room, Date.now(), 'moderator');
      emitEvent(room.code, 'pub', { type: 'ended' });
    });
    act('mod:revealPodium', (room) => {
      if (room.phase !== 'finished') throw new DomainError('Primero termina la partida.');
      room.podiumRevealed = true;
      emitEvent(room.code, 'pub', { type: 'podium' });
    });
    act('mod:hidePodium', (room) => {
      room.podiumRevealed = false;
    });
    act('mod:reset', (room) => {
      engine.resetGame(room);
      emitEvent(room.code, 'pub', { type: 'reset' });
    });

    handle(socket, 'mod:getBank', () => ({ bank: bankService.get(), info: bankService.info() }));
    handle(socket, 'mod:saveBank', async ({ bank }) => {
      const res = await bankService.save(bank);
      for (const r of manager.list()) manager.touch(r);
      return { warnings: res.warnings, info: bankService.info() };
    });
    handle(socket, 'mod:resetBank', async () => {
      await bankService.resetToFile();
      for (const r of manager.list()) manager.touch(r);
      return { bank: bankService.get(), info: bankService.info() };
    });
  }

  // ---------- Reloj: cierres por tiempo ----------
  const ticker = setInterval(() => {
    const now = Date.now();
    for (const room of manager.list()) {
      if (room.phase !== 'running') continue;
      const events = engine.tick(room, now);
      if (events.length) {
        manager.touch(room);
        for (const ev of events) emitEvent(room.code, 'pub', ev);
      } else if (now - (room.lastAliveAt || 0) > 5000) {
        room.lastAliveAt = now;
        manager.scheduleSave(room);
      }
    }
  }, 250);

  return {
    io,
    close() {
      clearInterval(ticker);
      for (const t of pending.values()) clearTimeout(t);
      io.close();
    },
  };
}
