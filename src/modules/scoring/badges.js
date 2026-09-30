/**
 * Insignias: solo reconocimiento, no cambian la nota.
 * Cada una tiene un id estable para que el frontend dibuje su ícono.
 */
export function computeBadges({ lockBadge, answers, total, openedPosition, remainingMsAtOpen }) {
  const badges = [];
  const correct = answers.filter((a) => a.correct).length;

  if (total > 0 && correct / total >= 0.6) {
    badges.push({ id: 'lock', label: lockBadge, desc: 'Abrió su candado con al menos 60 % de aciertos.' });
  }
  if (openedPosition === 1) {
    badges.push({ id: 'first', label: 'Llave maestra', desc: 'Primer equipo en abrir su candado.' });
  }
  if (total > 0 && correct === total) {
    badges.push({ id: 'perfect', label: 'Pleno estadístico', desc: 'Todas las respuestas correctas.' });
  }
  let streak = 0;
  let best = 0;
  for (const a of answers) {
    streak = a.correct ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  if (best >= 3 && correct !== total) {
    badges.push({ id: 'streak', label: 'Racha imparable', desc: `${best} aciertos seguidos.` });
  }
  if (answers.filter((a) => a.unanimous).length >= 3) {
    badges.push({ id: 'sync', label: 'Equipo sincronizado', desc: 'Votaron todos lo mismo en 3 o más preguntas.' });
  }
  if (openedPosition && remainingMsAtOpen !== null && remainingMsAtOpen <= 30_000) {
    badges.push({ id: 'clutch', label: 'Escape de último segundo', desc: 'Abrió el candado con 30 s o menos.' });
  }
  return badges;
}
