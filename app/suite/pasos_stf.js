// Pasos .STF de The 2nd Dance Floor. Son texto: 28.952 bytes = cabecera de 280 + 2048 filas de 14.
// Cada fila: 13 caracteres '0' o '1' y un cero. Columnas 0-4 panel 1, 5-9 panel 2, 10-12 extras (las mismas que los .NOT de Extra).
//
// Campos, comprobados contra los .NOT de Extra del mismo tema (coincidencia de notas del 100 %):
//   0x000  titulo (a veces vacio)
//   0x0FC  ultima fila. Solo es de fiar en los _1: en los demas tiene basura del programa que los armo
//   0x100  BPM (float)
//   0x104  siempre 4 en los 95 del disco; sin saber que es
//   0x108  filas por pulso (2 o 4)
//   0x110  sin saber que es (varia por tema)
//   0x114  arranque, en centesimas de segundo (el "valores" de los .NOT)
//
// Abrir y escribir sin cambios da el mismo archivo: se guarda la cabecera entera.

export const TAM_STF = 28952;
const CABECERA = 0x118, ANCHO_FILA = 14, FILAS = 2048, COLUMNAS = 13;
const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

export function esStf(b) {
  if (b.length !== TAM_STF) return false;
  for (let c = 0; c < COLUMNAS; c++) if (b[CABECERA + c] !== 0x30 && b[CABECERA + c] !== 0x31) return false;
  return b[CABECERA + COLUMNAS] === 0;
}

export function leerStf(b) {
  if (!esStf(b)) throw new Error('No es un .STF');
  const v = dv(b), filas = new Uint16Array(FILAS);
  for (let f = 0; f < FILAS; f++) {
    const o = CABECERA + f * ANCHO_FILA;
    let m = 0;
    for (let c = 0; c < COLUMNAS; c++) {
      const d = b[o + c];
      if (d === 0x31) m |= 1 << c; else if (d !== 0x30) throw new Error(`Fila ${f}: caracter inesperado`);
    }
    if (b[o + COLUMNAS] !== 0) throw new Error(`Fila ${f}: sin el cero del final`);
    filas[f] = m;
  }
  let titulo = '';
  for (let i = 0; i < 64 && b[i]; i++) titulo += String.fromCharCode(b[i]);
  return { titulo, bpm: v.getFloat32(0x100, true), filasPorPulso: v.getInt32(0x108, true), arranque: v.getInt32(0x114, true), filas, cabecera: b.slice(0, CABECERA) };
}

export function escribirStf(p) {
  const o = new Uint8Array(TAM_STF);
  o.set(p.cabecera, 0);
  const v = dv(o);
  v.setFloat32(0x100, p.bpm, true); v.setInt32(0x108, p.filasPorPulso, true); v.setInt32(0x114, p.arranque, true);
  for (let f = 0; f < FILAS; f++) {
    const q = CABECERA + f * ANCHO_FILA;
    for (let c = 0; c < COLUMNAS; c++) o[q + c] = p.filas[f] & (1 << c) ? 0x31 : 0x30;
  }
  return o;
}

// Las notas, en la misma forma que leerPasos (app\motor\cifrados.js): [fila, columna].
export function notasDeStf(p) {
  const notas = [], extras = [];
  for (let f = 0; f < FILAS; f++) for (let c = 0; c < COLUMNAS; c++) if (p.filas[f] & (1 << c)) (c < 10 ? notas : extras).push([f, c]);
  return { notas, extras };
}
