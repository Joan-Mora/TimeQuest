import { createFileStore } from './fileStore.js';
import { createRedisStore } from './redisStore.js';

export async function createStore(config) {
  if (config.redisUrl) {
    const store = createRedisStore(config.redisUrl, { ttlHours: config.roomTtlHours });
    try {
      await store.init();
      return store;
    } catch (err) {
      console.warn(`[store] No se pudo conectar a REDIS_URL (${err.message}); se usa archivo local.`);
      await store.close();
    }
  }
  const store = createFileStore(config.dataDir);
  await store.init();
  return store;
}
