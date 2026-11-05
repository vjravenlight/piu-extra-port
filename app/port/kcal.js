// Kcal estimadas de una cancion (Charles 05/11: "eso de kcalorias despues de una cancion"). Es una estimacion, no una medicion:
// kcal = MET x peso (kg) x horas. El MET sale de las pisadas por minuto, entre los valores que midieron los estudios de juegos
// de baile: unos 3 MET en lo mas tranquilo, 6 a 7 en lo comun y 8 en lo mas exigente (estudio de la ACE, 2007, y JEPonline, 2011).
const TRAMOS = [[0, 3], [60, 4.5], [120, 6.5], [200, 8]];
export function estimarKcal(pisadas, seg, pesoKg) {
  if (!(seg > 0) || !(pesoKg > 0) || pisadas < 5) return 0;
  const ppm = pisadas / (seg / 60);
  let met = TRAMOS[TRAMOS.length - 1][1];
  for (let i = 1; i < TRAMOS.length; i++) {
    const [a, ma] = TRAMOS[i - 1], [b, mb] = TRAMOS[i];
    if (ppm <= b) { met = ma + (mb - ma) * (ppm - a) / (b - a); break; }
  }
  return met * pesoKg * seg / 3600;
}
