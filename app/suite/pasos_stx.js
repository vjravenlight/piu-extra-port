// Pasos .STX (firma STF4) de Prex 3. Leido de PUMPY.EXE (0x4068B0), sin ejecutarlo.
//
// 0x000 "STF4"; 0x03C titulo; 0x0FC nueve posiciones (u32), una por ranura.
// Ranura: u32, 50 enteros (cuantos bloques tiene cada parte) y los bloques: u32 largo + zlib.
// Bloque abierto: 0x00 BPM (float), 0x04 siempre 4, 0x08 filas por pulso, 0x0C corrimiento, 0x60 retardo,
//                 0x80 filas (u32), 0x84 filas de 13 bytes: 10 paneles y 3 columnas extra.
// Valor de cada panel: 0 nada, 1 nota, 10/11/12 nota larga (cabeza, cuerpo, cola); otros valores: ver investigacion\VERSIONES.md.
//
// inflar(bytes) -> bytes: se pasa de afuera, para usar la misma pieza en Node y en el navegador.
const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const RANURAS = 9, PARTES = 50, CABECERA_BLOQUE = 0x84, ANCHO_FILA = 13;   // 10 paneles y 3 columnas extra, como .STF y .NOT

export function esStx(b) { return b.length > 0x120 && b[0] === 0x53 && b[1] === 0x54 && b[2] === 0x46 && b[3] === 0x34; }

export function leerStx(b, inflar) {
  if (!esStx(b)) throw new Error('No es un .STX');
  const v = dv(b);
  let titulo = '';
  for (let i = 0x3C; i < 0xBC && b[i]; i++) titulo += String.fromCharCode(b[i]);
  const ranuras = [];
  for (let r = 0; r < RANURAS; r++) {
    const off = v.getUint32(0xFC + r * 4, true), ranura = { partes: [], notas: 0 };
    ranuras.push(ranura);
    if (!off || off >= b.length) continue;
    let p = off + 4;
    const cuantos = [];
    for (let i = 0; i < PARTES; i++, p += 4) cuantos.push(v.getInt32(p, true));
    for (const n of cuantos) {
      if (n <= 0) continue;
      const parte = [];
      for (let k = 0; k < n; k++) {
        const L = v.getUint32(p, true); p += 4;
        const c = inflar(b.subarray(p, p + L)), w = dv(c); p += L;
        const filas = w.getUint32(0x80, true), bloque = {
          bpm: w.getFloat32(0, true), filasPorPulso: w.getInt32(8, true), corrimiento: w.getInt32(0x0C, true), retardo: w.getInt32(0x60, true),
          filas, datos: c.subarray(CABECERA_BLOQUE, CABECERA_BLOQUE + filas * ANCHO_FILA),
        };
        for (let q = 0; q < bloque.datos.length; q++) if (q % ANCHO_FILA < 10 && bloque.datos[q] && bloque.datos[q] !== 11 && bloque.datos[q] !== 12) ranura.notas++;
        parte.push(bloque);
      }
      ranura.partes.push(parte);
    }
  }
  return { titulo, ranuras };
}

// Notas de una parte, seguidas: [fila, panel, valor]. Panel 10 a 12 = columnas extra. Las filas cuentan desde el primer bloque.
export function notasDeParte(parte) {
  const o = [];
  let base = 0;
  for (const b of parte) {
    for (let f = 0; f < b.filas; f++) for (let k = 0; k < ANCHO_FILA; k++) { const x = b.datos[f * ANCHO_FILA + k]; if (x) o.push([base + f, k, x]); }
    base += b.filas;
  }
  return o;
}
