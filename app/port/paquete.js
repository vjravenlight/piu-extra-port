// PAQUETE de una cancion propia para el online (EDITOR_MASTER.md etapas 3 y 4). Charles, 20/10: "que si uno quiere en
// online jugar con otro y el otro acepta, que vaya recibiendo el paquete con la cancion, not, musica y demas" y "hay que
// asegurarse que el recibir archivos no reciba algun archivo raro encubierto en esos formatos, tanto para los not, pnz,
// dat y aud". Lo que llega nunca se usa tal cual: cada archivo se lee con un lector propio y estricto y se vuelve a
// armar desde cero; si algo no cierra se descarta el paquete entero. (El servidor, api.php, hace lo mismo antes de
// guardarlo: esto es la segunda revision, la que protege a este aparato.)
// - .NOT: cabecera "pump 5.0", cantidades y rangos revisados, y se reescribe (solo los 10 bits de paneles de cada fila).
// - .AUD: se descifra con la llave del exe y tiene que dar su Adler-32; se recorre la cadena de cuadros MP3 desde el
//   primer byte y se guardan solo esos cuadros (sin ID3 ni nada pegado), hasta 3:05 y 8 MB; se vuelve a cifrar.
// - .PNZ: se descifra, el navegador lo decodifica a pixeles y se vuelve a dibujar en 640 x 480: solo se muestra.
// - .DAT: no viaja nunca; el fondo es uno de los videos REMIX del disco, por numero.
import { ESPEJO } from '../motor/cifrados.js';
import { cifrarCabina } from './editor.js';

export const VIDEOS_REMIX = [27, 28, 29, 30, 31, 32, 36, 52, 53, 57];
const TOPES = { not: 262144, aud: 8650752, pnz: 2097152 };
// la llave del exe (0x13BF90) a partir de la de los archivos (online.js: R.llave[i] = exe[(i + 518) % 1024])
export const llaveExe = (llave) => { const k = new Uint8Array(1024); for (let j = 0; j < 1024; j++) k[j] = llave[(j - 518 + 1024) % 1024]; return k; };
const adler = (b) => { let a = 1, s = 0; for (let i = 0; i < b.length; i++) { a = (a + b[i]) % 65521; s = (s + a) % 65521; } return ((s << 16) | a) >>> 0; };

// .AUD / .PNZ: 4 bytes de Adler-32 del contenido y despues espejo(claro XOR llave[(adler + i) & 1023]) (CABINA 4.1)
function abrirCabina(c, K) {
  if (!(c instanceof Uint8Array) || c.length < 8) return null;
  const h = new DataView(c.buffer, c.byteOffset).getUint32(0, true), o = new Uint8Array(c.length - 4);
  for (let i = 0; i < o.length; i++) o[i] = ESPEJO[c[4 + i]] ^ K[(h + i) & 1023];
  return adler(o) === h ? o : null;
}

// .NOT formato A, estricto (lo mismo que pasosLimpios de api.php)
export function limpiarNot(b) {
  const n = b.length;
  if (n < 222 || n > TOPES.not || String.fromCharCode(...b.subarray(0, 8)) !== 'pump 5.0') return null;
  const v = new DataView(b.buffer, b.byteOffset, n), filas = v.getUint16(0x0A, true);
  if (filas < 1 || filas > 40000 || n !== 216 + 6 * filas) return null;
  const o = new Uint8Array(n), w = new DataView(o.buffer);
  for (let i = 0; i < 8; i++) o[i] = b[i];
  w.setUint16(0x0A, filas, true);
  for (let i = 0; i < 10; i++) {
    const bpm = v.getFloat32(0x10 + 4 * i, true), val = v.getInt32(0x38 + 4 * i, true), cam = v.getInt32(0x60 + 4 * i, true);
    if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 1000 || Math.abs(val) > 1e7 || Math.abs(cam) > 1e7) return null;
    w.setFloat32(0x10 + 4 * i, bpm, true); w.setInt32(0x38 + 4 * i, val, true); w.setInt32(0x60 + 4 * i, cam, true);
  }
  const pp = v.getInt32(0x88, true), num = v.getInt32(0x90, true);
  if (pp < 1 || pp > 48 || num < 0 || num > 99) return null;
  w.setInt32(0x88, pp, true); w.setInt32(0x90, num, true);
  for (let i = 0; i < 3 * filas; i++) { let m = v.getUint16(216 + 2 * i, true) & 0x3FF; if (m & 0x200) m |= 0xFC00; w.setUint16(216 + 2 * i, m, true); }
  return o;
}

// la cadena de cuadros MP3 (MPEG-1/2 capa III) desde el primer byte, todos con la misma version y frecuencia
const KB1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], KB2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
export function soloCuadros(b, topeSeg = 185) {
  // (el ultimo cuadro no se guarda nunca: si el archivo venia cortado, lo pegado atras lo "completaba")
  let i = 0, antes = 0, seg = 0, cuadros = 0, ver0 = -1, sr0 = -1;
  while (i + 4 <= b.length && seg < topeSeg) {
    if (b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) break;
    const ver = (b[i + 1] >> 3) & 3, capa = (b[i + 1] >> 1) & 3, br = b[i + 2] >> 4, sr = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (capa !== 1 || br === 0 || br === 15 || sr === 3 || ver === 1) break;
    if (ver0 < 0) { ver0 = ver; sr0 = sr; } else if (ver !== ver0 || sr !== sr0) break;
    const f = SR[ver][sr], L = ver === 3 ? Math.floor(144000 * KB1[br] / f) + pad : Math.floor(72000 * KB2[br] / f) + pad;
    if (i + L > b.length) break;
    antes = i; i += L; seg += (ver === 3 ? 1152 : 576) / f; cuadros++;
  }
  return cuadros >= 200 ? b.slice(0, antes) : null;
}

export function limpiarMeta(m, numero) {
  const t = (s, n) => String(s || '').toUpperCase().replace(/[^A-Z0-9 .,'!?&()+-]/g, '').trim().slice(0, n);
  const archivo = String(m && m.archivo || '').toLowerCase(), am = /^(\d\d)_([nhx][12]|db)\.not$/.exec(archivo), video = (m && m.video) | 0;
  if (!am || +am[1] !== numero || !VIDEOS_REMIX.includes(video)) return null;
  return { archivo, video, nombre: t(m.nombre, 24) || `CANCION ${numero}`, artista: t(m.artista, 30) };
}

// todo el paquete: { not, aud, pnz } (bytes como llegaron), meta y el numero de la cancion -> lo limpio, o un error
export async function revisarPaquete(crudo, meta, numero, llave) {
  const K = llaveExe(llave);
  for (const [t, tope] of Object.entries(TOPES)) if (!(crudo[t] instanceof Uint8Array) || crudo[t].length > tope) throw new Error(`el ${t.toUpperCase()} no vino o es demasiado grande`);
  const m = limpiarMeta(meta, numero); if (!m) throw new Error('los datos de la cancion no son validos');
  const not = limpiarNot(crudo.not); if (!not) throw new Error('el .NOT no es un .NOT valido');
  const mp3 = abrirCabina(crudo.aud, K), cuadros = mp3 && soloCuadros(mp3); if (!cuadros) throw new Error('el .AUD no es una cancion MP3 valida');
  const png = abrirCabina(crudo.pnz, K); if (!png || png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4E || png[3] !== 0x47) throw new Error('el .PNZ no es una imagen valida');
  let portada;
  try {
    const im = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    if (im.width > 4096 || im.height > 4096) throw new Error('grande');
    const c = new OffscreenCanvas(640, 480); c.getContext('2d').drawImage(im, 0, 0, 640, 480); im.close();
    portada = await createImageBitmap(c);
  } catch (e) { throw new Error('el .PNZ no es una imagen valida'); }
  return { meta: m, not, aud: cifrarCabina(cuadros, K), portada };
}
