import { EventEmitter } from 'node:events';
import { roomCode } from '../../lib/ids.js';
import { DomainError } from '../../lib/errors.js';
import { log } from '../../lib/logger.js';
import { createRoom, defaultConfig } from './roomModel.js';
import { restoreAfterRestart } from '../game/gameEngine.js';

/**
 * Dueño del estado en memoria. Toda mutación pasa por `mutate()`, que incrementa la
 * versión, programa el guardado (con debounce) y avisa a la capa de tiempo real.
 *
 * Eventos: 'changed' (room) cuando cambia el estado; 'presence' (room) cuando alguien
 * se conecta o desconecta; 'removed' (code).
 */
export class RoomManager extends EventEmitter {
  constructor({ store, saveDebounceMs = 400, ttlHours = 12 }) {
    super();
    this.store = store;
    this.saveDebounceMs = saveDebounceMs;
    this.ttlMs = ttlHours * 3600_000;
    this.rooms = new Map();
    this.presence = new Map();
    this.saveTimers = new Map();
  }

  async init() {
    const rooms = await this.store.loadRooms();
    const now = Date.now();
    for (const room of rooms) {
      if (now - (room.updatedAt || 0) > this.ttlMs) {
        await this.store.deleteRoom(room.code).catch(() => {});
        continue;
      }
      const defaults = defaultConfig();
      room.config = { ...defaults, ...room.config, timeLimitsSec: { ...defaults.timeLimitsSec, ...room.config?.timeLimitsSec } };
      room.log ??= [];
      const paused = restoreAfterRestart(room);
      this.rooms.set(room.code, room);
      if (paused) this.scheduleSave(room);
    }
    if (this.rooms.size) log.info(`Salas restauradas: ${[...this.rooms.keys()].join(', ')}`);
  }

  create() {
    let code;
    do code = roomCode(5);
    while (this.rooms.has(code));
    const room = createRoom(code);
    this.rooms.set(code, room);
    this.touch(room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code || '').trim().toUpperCase()) ?? null;
  }

  require(code) {
    const room = this.get(code);
    if (!room) throw new DomainError('La sala no existe o ya expiró.');
    return room;
  }

  list() {
    return [...this.rooms.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  mutate(code, fn) {
    const room = this.require(code);
    const result = fn(room);
    this.touch(room);
    return result;
  }

  touch(room) {
    room.version += 1;
    room.updatedAt = Date.now();
    this.scheduleSave(room);
    this.emit('changed', room);
  }

  scheduleSave(room, delay = this.saveDebounceMs) {
    if (this.saveTimers.has(room.code)) return;
    const timer = setTimeout(() => {
      this.saveTimers.delete(room.code);
      this.saveNow(room);
    }, delay);
    this.saveTimers.set(room.code, timer);
  }

  async saveNow(room) {
    if (!this.rooms.has(room.code)) return;
    try {
      await this.store.saveRoom(room);
    } catch (err) {
      log.warn(`No se pudo guardar la sala ${room.code}: ${err.message}`);
      this.scheduleSave(room, 2000);
    }
  }

  async flush() {
    const pending = [...this.saveTimers.keys()];
    for (const code of pending) {
      clearTimeout(this.saveTimers.get(code));
      this.saveTimers.delete(code);
    }
    await Promise.all([...this.rooms.values()].map((r) => this.saveNow(r)));
  }

  async remove(code) {
    const room = this.require(code);
    clearTimeout(this.saveTimers.get(room.code));
    this.saveTimers.delete(room.code);
    this.rooms.delete(room.code);
    this.presence.delete(room.code);
    await this.store.deleteRoom(room.code);
    this.emit('removed', room.code);
  }

  // ---- Presencia (solo en memoria: no se persiste) ----
  connect(code, playerId) {
    const map = this.presence.get(code) ?? new Map();
    this.presence.set(code, map);
    const before = map.get(playerId) ?? 0;
    map.set(playerId, before + 1);
    const room = this.get(code);
    if (room && before === 0) this.emit('presence', room);
  }

  disconnect(code, playerId) {
    const map = this.presence.get(code);
    if (!map) return;
    const n = (map.get(playerId) ?? 1) - 1;
    if (n <= 0) map.delete(playerId);
    else map.set(playerId, n);
    const room = this.get(code);
    if (room && n <= 0) this.emit('presence', room);
  }

  isOnline(code, playerId) {
    return (this.presence.get(code)?.get(playerId) ?? 0) > 0;
  }

  onlineChecker(code) {
    return (playerId) => this.isOnline(code, playerId);
  }
}
