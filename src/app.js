import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { safeEqual } from './lib/ids.js';
import { DomainError } from './lib/errors.js';
import { log } from './lib/logger.js';
import { joinRoom } from './modules/rooms/playerService.js';
import { buildResults } from './modules/game/gameEngine.js';
import { studentsCsv, teamsCsv } from './modules/exports/exportService.js';
import { buildXlsx } from './modules/exports/xlsxReport.js';

const SPA_ROUTES = ['/', '/moderador', '/proyector', '/informe', '/certificado', '/espectador'];

export function createApp({ manager, bankService, store, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' ws: wss:; script-src 'self'; object-src 'none'; base-uri 'self'",
    );
    next();
  });

  // ---------- Salud (health check de Render y "despertador") ----------
  app.get('/healthz', async (_req, res) => {
    let storeOk = false;
    try {
      storeOk = await store.ping();
    } catch {
      storeOk = false;
    }
    res.json({ ok: true, uptimeSec: Math.round(process.uptime()), rooms: manager.rooms.size, store: store.kind, storeOk });
  });

  // ---------- API pública ----------
  const joinHits = new Map();
  function joinLimited(ip) {
    const now = Date.now();
    const hits = (joinHits.get(ip) || []).filter((t) => now - t < 60_000);
    hits.push(now);
    joinHits.set(ip, hits);
    if (joinHits.size > 5000) joinHits.clear();
    // Un salón entero puede compartir la IP del wifi: el límite es holgado.
    return hits.length > 120;
  }

  app.get('/api/rooms/:code', (req, res) => {
    const room = manager.get(req.params.code);
    if (!room) return res.status(404).json({ ok: false, error: 'No existe una sala con ese código.' });
    res.json({ ok: true, code: room.code, title: room.config.title, phase: room.phase, players: Object.keys(room.players).length });
  });

  app.post('/api/rooms/:code/join', (req, res) => {
    if (joinLimited(req.ip)) return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera un momento.' });
    try {
      const { player, token } = manager.mutate(req.params.code, (room) =>
        joinRoom(room, req.body?.name, { maxPlayers: config.maxPlayersPerRoom, deviceId: req.body?.device }),
      );
      res.json({ ok: true, code: manager.get(req.params.code).code, playerId: player.id, name: player.name, token });
    } catch (err) {
      if (err instanceof DomainError) return res.status(400).json({ ok: false, error: err.message });
      log.error('join', err);
      res.status(500).json({ ok: false, error: 'Error interno.' });
    }
  });

  function joinUrl(req, code) {
    const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    return `${base}/?sala=${encodeURIComponent(code)}`;
  }

  app.get('/api/rooms/:code/qr.svg', async (req, res) => {
    const room = manager.get(req.params.code);
    if (!room) return res.status(404).end();
    const svg = await QRCode.toString(joinUrl(req, room.code), {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1b1f3bff', light: '#ffffffff' },
    });
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  });

  app.get('/api/rooms/:code/join-url', (req, res) => {
    const room = manager.get(req.params.code);
    if (!room) return res.status(404).json({ ok: false });
    res.json({ ok: true, url: joinUrl(req, room.code) });
  });

  // ---------- API del moderador (clave en cabecera) ----------
  function requireModerator(req, res, next) {
    const key = req.get('x-moderator-key');
    if (!safeEqual(key, config.moderatorKey)) return res.status(401).json({ ok: false, error: 'Clave de moderador incorrecta.' });
    next();
  }

  app.post('/api/moderator/check', requireModerator, (_req, res) => res.json({ ok: true }));

  function resultsFor(room) {
    return room.results ?? (room.game ? buildResults(room) : null);
  }

  app.get('/api/rooms/:code/export/:kind', requireModerator, async (req, res) => {
    const room = manager.get(req.params.code);
    if (!room) return res.status(404).json({ ok: false, error: 'Sala no encontrada.' });
    const results = resultsFor(room);
    if (!results) return res.status(409).json({ ok: false, error: 'La partida aún no ha empezado.' });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const partial = room.phase !== 'finished';
    const who = results.mode === 'chaos' ? 'jugadores' : 'equipos';
    if (req.params.kind === 'equipos.csv') {
      res.attachment(`resultados-${who}-${room.code}-${stamp}.csv`).type('text/csv; charset=utf-8').send(teamsCsv(results));
    } else if (req.params.kind === 'estudiantes.csv') {
      res.attachment(`resultados-estudiantes-${room.code}-${stamp}.csv`).type('text/csv; charset=utf-8').send(studentsCsv(results));
    } else if (req.params.kind === 'informe.xlsx') {
      const buffer = await buildXlsx({ room, results, partial });
      res.attachment(`informe-${room.code}-${stamp}.xlsx`)
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .send(Buffer.from(buffer));
    } else if (req.params.kind === 'informe.json') {
      res.json({
        ok: true,
        room: { code: room.code, title: room.config.title, phase: room.phase, createdAt: room.createdAt, config: room.config },
        locks: room.game?.locks ?? bankService.get().locks,
        partial,
        players: Object.keys(room.players).length,
        results,
      });
    } else {
      res.status(404).json({ ok: false, error: 'Formato no soportado.' });
    }
  });

  app.get('/api/bank/export', requireModerator, (_req, res) => {
    res.attachment('banco-preguntas.json').json(bankService.get());
  });

  // ---------- Frontend (SPA sin paso de build) ----------
  const nm = (p) => path.join(config.rootDir, 'node_modules', p);
  const staticOpts = { maxAge: config.isProduction ? '1h' : 0 };
  // Los hooks importan el especificador desnudo "preact"; sin build ni import map (CSP), se reescribe a una ruta.
  const hooksSource = fs
    .readFileSync(nm('preact/hooks/dist/hooks.mjs'), 'utf8')
    .replace(/from\s*["']preact["']/g, 'from"/vendor/preact/preact.mjs"');
  app.get('/vendor/preact-hooks.mjs', (_req, res) => {
    res.type('text/javascript').set('Cache-Control', config.isProduction ? 'public, max-age=3600' : 'no-cache').send(hooksSource);
  });
  app.use('/vendor/preact', express.static(nm('preact/dist'), staticOpts));
  app.use('/vendor/htm', express.static(nm('htm/dist'), staticOpts));
  app.use('/vendor/fonts', express.static(nm('@fontsource/lato/files'), { maxAge: '7d' }));
  // Sin versionado en los nombres de archivo: la app siempre revalida (ETag) para no quedar con CSS/JS viejos tras un despliegue.
  app.use(express.static(path.join(config.rootDir, 'public'), { index: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

  const indexFile = path.join(config.rootDir, 'public', 'index.html');
  app.get(SPA_ROUTES, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(indexFile));

  app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada.' }));
  app.use((_req, res) => res.status(404).sendFile(indexFile));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    log.error('HTTP', err);
    res.status(500).json({ ok: false, error: 'Error interno.' });
  });

  return app;
}
