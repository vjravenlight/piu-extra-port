// Efectos de sonido de la cabina (30/10: Charles encontro la ROM, set "pumpitup" de MAME). En la cabina los toca un
// Yamaha YMZ280B de la placa de E/S desde su ROM (piu10.u9, 2 MB); PIU.BIN del disco es la tabla de los 35 efectos
// (investigacion\CABINA.md 4.2 y anexo A). Comprobado: los datos de piu10.u9 terminan justo donde termina la tabla
// (0x1AF231) y los efectos decodificados son audio limpio. Si el servidor no tiene la ROM (efectos/piu10.u9), el juego
// anda igual, sin efectos, como antes.
// Cada efecto se decodifica (ADPCM de 4 bits del YMZ280B, como el chip) la primera vez que suena y queda guardado.
// El juego toca cada efecto en una voz fija (cabina.js 0x42169): un efecto nuevo en esa voz corta el anterior.
import { traer } from './archivos.js';

const FRECUENCIA = 41667;          // 16 MHz / 384 (CABINA.md 4.2)
const DIFF = [1, 3, 5, 7, 9, 11, 13, 15, -1, -3, -5, -7, -9, -11, -13, -15], ESCALA = [0x0e6, 0x0e6, 0x0e6, 0x0e6, 0x133, 0x199, 0x200, 0x266];
let rom = null, tabla = null;
const buffers = [], voces = new Map();

export async function cargarEfectos() {
  try {
    rom = await traer(new URL('../efectos/piu10.u9', location.href).href);
    tabla = await traer(new URL('../disco/piu.bin', location.href).href);
  } catch (e) { rom = null; }
  return !!rom;
}
export const hayEfectos = () => !!(rom && tabla);

function decodificar(ctx, n) {
  if (buffers[n]) return buffers[n];
  const o = n * 16, dir = (k) => (tabla[o + 4 + k] << 16) | (tabla[o + 8 + k] << 8) | tabla[o + 12 + k];
  const ini = dir(0), fin = Math.min(dir(3), rom.length - 1);
  if (fin <= ini) return null;
  const cant = (fin - ini + 1) * 2, b = ctx.createBuffer(1, cant, FRECUENCIA), s = b.getChannelData(0);
  let senal = 0, paso = 0x7f;
  for (let i = 0; i < cant; i++) {
    const byte = rom[ini + (i >> 1)], v = (i & 1) ? byte & 15 : byte >> 4;
    senal = Math.max(-32768, Math.min(32767, senal + Math.trunc((paso * DIFF[v]) / 8)));
    paso = Math.max(0x7f, Math.min(0x6000, (paso * ESCALA[v & 7]) >> 8));
    s[i] = senal / 32768;
  }
  return (buffers[n] = b);
}

export function cortarEfecto(voz) {
  const f = voces.get(voz);
  if (f) { try { f.stop(); } catch (e) { /* ya termino */ } voces.delete(voz); }
}
// efecto 0..34 en la voz 0..7; lazo = se repite (el SOUND TEST)
export function tocarEfecto(ctx, destino, efecto, voz, lazo) {
  if (!hayEfectos() || !ctx || efecto < 0 || efecto >= 35) return false;
  const b = decodificar(ctx, efecto); if (!b) return false;
  cortarEfecto(voz);
  const f = ctx.createBufferSource(); f.buffer = b; f.loop = !!lazo; f.connect(destino); f.start();
  voces.set(voz, f);
  f.onended = () => { if (voces.get(voz) === f) voces.delete(voz); };
  return true;
}
