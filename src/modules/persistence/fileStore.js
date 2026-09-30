import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Persistencia en disco local (desarrollo o servidor con disco persistente).
 * Escritura atómica: se escribe a un temporal y se renombra, así un corte a mitad
 * de escritura nunca deja un JSON corrupto.
 */
export function createFileStore(dataDir) {
  const roomsDir = path.join(dataDir, 'rooms');
  const bankFile = path.join(dataDir, 'bank.json');

  async function writeAtomic(file, text) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, text, 'utf8');
    await fs.rename(tmp, file);
  }

  async function readJson(file) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  return {
    kind: 'archivo',
    async init() {
      await fs.mkdir(roomsDir, { recursive: true });
    },
    async loadRooms() {
      const files = (await fs.readdir(roomsDir).catch(() => [])).filter((f) => f.endsWith('.json'));
      const rooms = [];
      for (const f of files) {
        try {
          const room = await readJson(path.join(roomsDir, f));
          if (room?.code) rooms.push(room);
        } catch (err) {
          console.warn(`[store] No se pudo leer ${f}: ${err.message}`);
        }
      }
      return rooms;
    },
    saveRoom: (room) => writeAtomic(path.join(roomsDir, `${room.code}.json`), JSON.stringify(room)),
    deleteRoom: (code) => fs.rm(path.join(roomsDir, `${code}.json`), { force: true }),
    loadBank: () => readJson(bankFile),
    saveBank: (bank) => writeAtomic(bankFile, JSON.stringify(bank, null, 2)),
    clearBank: () => fs.rm(bankFile, { force: true }),
    async ping() {
      return true;
    },
    async close() {},
  };
}
