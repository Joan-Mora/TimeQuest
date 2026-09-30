/** Rango del "Científico de Datos" según la nota (como el «Rango: Analista de datos» de la exposición). */
export function rankTitle(grade) {
  if (grade === null || grade === undefined) return 'Científico de Datos';
  if (grade >= 4.5) return 'Científico de Datos Élite';
  if (grade >= 4.0) return 'Analista de Datos';
  if (grade >= 3.0) return 'Explorador Estadístico';
  return 'Aprendiz de Laboratorio';
}
