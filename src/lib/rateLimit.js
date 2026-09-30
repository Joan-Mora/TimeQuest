/**
 * Token bucket por conexión. Evita que un cliente (o un script) sature el servidor
 * con votos o envíos repetidos durante la ráfaga de respuestas.
 */
export function createRateLimiter({ capacity = 12, refillPerSec = 6 } = {}) {
  let tokens = capacity;
  let last = Date.now();
  return function allow(cost = 1) {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < cost) return false;
    tokens -= cost;
    return true;
  };
}
