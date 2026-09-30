import { Redis } from 'ioredis';

const PREFIX = 'erlab:';

/**
 * Persistencia en Render Key Value (compatible con Redis). Vive fuera del Web Service,
 * así que un reinicio, redeploy o suspensión del servicio no borra la partida.
 */
export function createRedisStore(url, { ttlHours = 12 } = {}) {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    connectTimeout: 10_000,
  });
  redis.on('error', (err) => console.warn('[store] Redis:', err.message));
  const ttl = Math.max(1, ttlHours) * 3600;

  return {
    kind: 'key-value',
    async init() {
      await redis.ping();
    },
    async loadRooms() {
      const codes = await redis.smembers(`${PREFIX}rooms`);
      if (codes.length === 0) return [];
      const values = await redis.mget(codes.map((c) => `${PREFIX}room:${c}`));
      const rooms = [];
      values.forEach((v, i) => {
        if (!v) {
          redis.srem(`${PREFIX}rooms`, codes[i]).catch(() => {});
          return;
        }
        try {
          rooms.push(JSON.parse(v));
        } catch {
          console.warn(`[store] Sala ${codes[i]} corrupta, se ignora.`);
        }
      });
      return rooms;
    },
    async saveRoom(room) {
      await redis.multi().set(`${PREFIX}room:${room.code}`, JSON.stringify(room), 'EX', ttl).sadd(`${PREFIX}rooms`, room.code).exec();
    },
    async deleteRoom(code) {
      await redis.multi().del(`${PREFIX}room:${code}`).srem(`${PREFIX}rooms`, code).exec();
    },
    async loadBank() {
      const v = await redis.get(`${PREFIX}bank`);
      return v ? JSON.parse(v) : null;
    },
    async saveBank(bank) {
      await redis.set(`${PREFIX}bank`, JSON.stringify(bank));
    },
    async clearBank() {
      await redis.del(`${PREFIX}bank`);
    },
    async ping() {
      return (await redis.ping()) === 'PONG';
    },
    async close() {
      await redis.quit().catch(() => {});
    },
  };
}
