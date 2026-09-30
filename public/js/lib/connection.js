import { io } from '/socket.io/socket.io.esm.min.js';
import { useEffect, useRef, useState } from './html.js';
import { syncClock } from './clock.js';

const AUTH_ERRORS = {
  CLAVE_INVALIDA: 'Clave de moderador incorrecta.',
  SALA_NO_EXISTE: 'La sala ya no existe.',
  SESION_INVALIDA: 'Tu sesión ya no es válida en esta sala.',
  ROL_INVALIDO: 'Conexión no válida.',
};

/**
 * Conexión Socket.IO con reconexión automática. Expone el último estado recibido
 * por canal (public, team, me, mod) y un `call()` que devuelve la respuesta del servidor.
 */
export function useConnection(auth, { onEvent, enabled = true } = {}) {
  const [state, setState] = useState({ status: 'connecting', public: null, team: null, me: null, mod: null, fatal: null });
  const socketRef = useRef(null);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;
  const authKey = JSON.stringify(auth);

  useEffect(() => {
    if (!enabled || !auth) return undefined;
    const socket = io({
      auth,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
      timeout: 15000,
    });
    socketRef.current = socket;
    const patch = (p) => setState((s) => ({ ...s, ...p }));

    socket.on('connect', () => {
      patch({ status: 'online', fatal: null });
      syncClock(socket);
    });
    socket.on('disconnect', (reason) => patch({ status: reason === 'io client disconnect' ? 'closed' : 'reconnecting' }));
    socket.io.on('reconnect_attempt', () => patch({ status: 'reconnecting' }));
    socket.on('connect_error', (err) => {
      const fatal = AUTH_ERRORS[err.message];
      if (fatal) {
        patch({ status: 'closed', fatal: { code: err.message, message: fatal } });
        socket.disconnect();
      } else {
        patch({ status: 'reconnecting' });
      }
    });
    socket.on('state:public', (v) => patch({ public: v }));
    socket.on('state:team', (v) => patch({ team: v }));
    socket.on('state:me', (v) => patch({ me: v }));
    socket.on('state:mod', (v) => patch({ mod: v }));
    socket.on('game:event', (ev) => eventRef.current?.(ev));
    socket.on('session:ended', (ev) => {
      patch({ status: 'closed', fatal: { code: ev.reason, message: ev.reason === 'kicked' ? 'El moderador te retiró de la sala.' : 'La sala fue cerrada.' } });
      socket.disconnect();
    });

    // Al volver a la pestaña (celular bloqueado), reconectar de inmediato.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !socket.connected && socket.io.opts.reconnection) socket.connect();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [authKey, enabled]);

  const call = (event, payload = {}) =>
    new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) return resolve({ ok: false, error: 'Sin conexión. Reintentando…' });
      socket.timeout(8000).emit(event, payload, (err, res) => {
        if (err) resolve({ ok: false, error: 'El servidor no respondió. Intenta de nuevo.' });
        else resolve(res ?? { ok: true });
      });
    });

  return { ...state, call, socket: socketRef.current };
}

export async function api(path, { method = 'GET', body, key } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (key) headers['x-moderator-key'] = key;
  try {
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data, ok: res.ok && data.ok !== false };
  } catch {
    return { ok: false, error: 'No hay conexión con el servidor.' };
  }
}

export async function download(path, key, fallbackName) {
  const res = await fetch(path, { headers: { 'x-moderator-key': key } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo descargar.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Mantiene despierto el servicio gratuito de Render mientras el proyector o el panel estén abiertos. */
export function useKeepAlive(active = true, everyMs = 4 * 60_000) {
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => fetch('/healthz', { cache: 'no-store' }).catch(() => {}), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
}
