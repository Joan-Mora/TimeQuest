/**
 * Reloj de la partida, siempre del lado del servidor. Guarda instantes absolutos
 * (epoch ms) para que sobreviva a un reinicio y los clientes solo tengan que
 * calcular el tiempo restante con su desfase respecto al servidor.
 */
/** Bonos por candado; la clave 0 es el reloj único del modo Caos. */
const emptyBonus = () => ({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });

export function createClock() {
  return { startedAt: null, pausedAt: null, pausedTotalMs: 0, bonusMs: emptyBonus() };
}

export function startClock(clock, now) {
  clock.startedAt = now;
  clock.pausedAt = null;
  clock.pausedTotalMs = 0;
  clock.bonusMs = emptyBonus();
}

export function pauseClock(clock, now) {
  if (clock.startedAt !== null && clock.pausedAt === null) clock.pausedAt = now;
}

export function resumeClock(clock, now) {
  if (clock.pausedAt !== null) {
    clock.pausedTotalMs += Math.max(0, now - clock.pausedAt);
    clock.pausedAt = null;
  }
}

/** Tiempo de juego transcurrido (descontando pausas). */
export function elapsedMs(clock, now) {
  if (clock.startedAt === null) return 0;
  const end = clock.pausedAt ?? now;
  return Math.max(0, end - clock.startedAt - clock.pausedTotalMs);
}

export function lockLimitMs(clock, timeLimitsSec, lock) {
  return (Number(timeLimitsSec?.[lock]) || 0) * 1000 + (clock.bonusMs?.[lock] || 0);
}

export function addBonus(clock, lock, ms) {
  clock.bonusMs[lock] = Math.max(-60 * 60_000, (clock.bonusMs[lock] || 0) + ms);
}
