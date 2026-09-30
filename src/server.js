import http from 'node:http';
import { assertConfig, config } from './config.js';
import { log } from './lib/logger.js';
import { createStore } from './modules/persistence/index.js';
import { RoomManager } from './modules/rooms/roomManager.js';
import { BankService } from './modules/questions/bankService.js';
import { createRealtime } from './modules/realtime/socketServer.js';
import { createApp } from './app.js';

async function main() {
  assertConfig();
  const store = await createStore(config);
  log.info(`Persistencia: ${store.kind}`);

  const bankService = new BankService({ store, file: config.questionsFile });
  await bankService.init();

  const manager = new RoomManager({ store, saveDebounceMs: config.saveDebounceMs, ttlHours: config.roomTtlHours });
  await manager.init();

  const app = createApp({ manager, bankService, store, config });
  const server = http.createServer(app);
  const realtime = createRealtime(server, { manager, bankService, config });

  server.listen(config.port, config.host, () => {
    log.info(`Escape Room Estadístico escuchando en http://${config.host}:${config.port}`);
    if (!config.isProduction) {
      log.info(`Estudiantes: http://localhost:${config.port}/   Moderador: http://localhost:${config.port}/moderador (clave: ${config.moderatorKey})`);
    }
  });

  let closing = false;
  async function shutdown(signal) {
    if (closing) return;
    closing = true;
    log.info(`${signal} recibido: guardando salas y cerrando…`);
    const force = setTimeout(() => process.exit(1), 8000);
    try {
      await manager.flush();
      realtime.close();
      server.close();
      await store.close();
    } finally {
      clearTimeout(force);
      process.exit(0);
    }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});
