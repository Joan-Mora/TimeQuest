import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  rootDir: ROOT_DIR,
  isProduction,
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  moderatorKey: process.env.MODERATOR_KEY || (isProduction ? '' : 'profe123'),
  publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''),
  redisUrl: process.env.REDIS_URL || '',
  dataDir: path.resolve(ROOT_DIR, process.env.DATA_DIR || '.data'),
  questionsFile: path.resolve(ROOT_DIR, process.env.QUESTIONS_FILE || 'data/questions.json'),
  saveDebounceMs: int(process.env.SAVE_DEBOUNCE_MS, 400),
  broadcastThrottleMs: int(process.env.BROADCAST_THROTTLE_MS, 60),
  maxPlayersPerRoom: int(process.env.MAX_PLAYERS_PER_ROOM, 80),
  roomTtlHours: int(process.env.ROOM_TTL_HOURS, 12),
};

export function assertConfig() {
  if (!config.moderatorKey) {
    throw new Error('Falta la variable de entorno MODERATOR_KEY (clave del panel del moderador).');
  }
  if (config.isProduction && config.moderatorKey.length < 6) {
    console.warn('[config] MODERATOR_KEY es muy corta; usa al menos 6 caracteres.');
  }
}
