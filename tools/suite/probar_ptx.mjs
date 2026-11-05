// Compara app\suite\ptx.js contra el decodificador real de Piu.exe (0x434AC, traducido) con los .PTX de un disco.
//   node tools\suite\probar_ptx.mjs imagen.bin [carpeta para guardar PNG de muestra]
// Solo lee el disco. Necesita app\port\traducido.js y los volcados, que no se publican.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { decodificarPtx, codificarPtx, esPtx, tablasPtx } from '../../app/suite/ptx.js';
import { abrirPaquete, detectar } from '../../app/suite/paquetes.js';
import { abrirImagen } from './imagen_cd.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const imp = (r) => import(pathToFileURL(join(raiz, r)).href);
const C = await imp('app/port/cpu.js');
await imp('app/port/traducido.js');
C.cargar(0x20000, readFileSync(join(raiz, 'investigacion/volcados/codigo_0x20000.bin')));
C.cargar(0x130000, readFileSync(join(raiz, 'investigacion/volcados/datos_0x130000.bin')));

const PILA = 0x7F0000, ENTRADA = 0x900000, SALIDA = 0xA00000, D_ANCHO = 0x8F0000, D_ALTO = 0x8F0004, D_TIPO = 0x8F0008;

// Las tablas del juego tienen que ser las del estandar que usa ptx.js.
const v32 = (a) => C.r32(a) | 0;
let difTablas = 0;
for (let i = 0; i < 64; i++) { if (v32(1710740 + i * 4) !== tablasPtx.ZIGZAG[i]) difTablas++; if (v32(276384 + i * 4) !== tablasPtx.AAN[i]) difTablas++; if (v32(1300620 + i * 4) !== tablasPtx.CUANT[i]) difTablas++; }
for (const c of [0, 1]) {
  for (const [val, [l, cod]] of tablasPtx.DC[c].escribir) { if (v32(1710996 + c * 96 + val * 8) !== l || v32(1710996 + c * 96 + val * 8 + 4) !== cod) difTablas++; }
  for (const [val, [l, cod]] of tablasPtx.AC[c].escribir) { const a = 1711188 + c * 2048 + val * 8; if (v32(a) !== l || v32(a + 4) !== cod) difTablas++; }
}
console.log('tablas distintas al exe:', difTablas);

// La inicializacion del propio juego: arma la tabla de limites, las de color y la cuantizacion.
C.R[C.ESP] = PILA;
C.llamar(0x42d10, 0);
console.log('tabla de limites en', (C.r32(0x7eefdc) >>> 0).toString(16));
if (!C.r32(0x7eefdc)) { console.log('La inicializacion del juego no armo la tabla de limites'); process.exit(2); }

function delJuego(b) {
  C.cargar(ENTRADA, b);
  C.R[C.ESP] = PILA;
  C.push(D_ALTO);
  C.R[0] = ENTRADA; C.R[1] = D_ANCHO; C.R[2] = SALIDA; C.R[3] = D_TIPO;
  C.llamar(0x434ac, 0);
  const w = C.r32(D_ANCHO), h = C.r32(D_ALTO), t = C.r32(D_TIPO), can = t === 2 ? 3 : 4, n = w * h * can, o = new Uint8Array(n);
  for (let i = 0; i < n; i++) o[i] = C.r8(SALIDA + i);
  return { w, h, can, o };
}

function png(w, h, can, px) {
  const crcT = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c; }
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const trozo = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4, 'latin1'); Buffer.from(d).copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = can === 3 ? 2 : 6;
  const crudo = Buffer.alloc(h * (w * can + 1));
  for (let y = 0; y < h; y++) Buffer.from(px.buffer, px.byteOffset + y * w * can, w * can).copy(crudo, y * (w * can + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 13, 10, 26, 10]), trozo('IHDR', ih), trozo('IDAT', deflateSync(crudo)), trozo('IEND', Buffer.alloc(0))]);
}
const psnr = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s ? 10 * Math.log10(255 * 255 * a.length / s) : 99; };

const im = abrirImagen(process.argv[2]), carpeta = process.argv[3];
if (carpeta) mkdirSync(carpeta, { recursive: true });
const items = [];
for (const f of im.archivos) {
  const b = new Uint8Array(im.leer(f));
  if (/\.PTX$/i.test(f.ruta)) items.push({ n: f.ruta, b });
  else if (detectar(b)) for (const a of abrirPaquete(b).archivos) if (/\.ptx$/i.test(a.nombre)) items.push({ n: f.ruta + ':' + a.nombre, b: a.datos });
}
im.cerrar();
console.log('.PTX encontrados', items.length);
const tipos = {}; let iguales = 0, malos = 0, noPtx = 0, peor = 99, peorN = '', sumaPsnr = 0, reco = 0, recoMal = 0, tamO = 0, tamN = 0;
for (const { n, b } of items) {
  if (!esPtx(b)) { noPtx++; continue; }
  let m;
  try { m = decodificarPtx(b); } catch (e) { malos++; console.log('FALLA', n, e.message); continue; }
  const k = `${m.ancho}x${m.alto} ${m.canales}c q${m.calidad}`; tipos[k] = (tipos[k] || 0) + 1;
  const j = delJuego(b);
  if (j.w === m.ancho && j.h === m.alto && j.can === m.canales && Buffer.compare(Buffer.from(j.o), Buffer.from(m.pixeles)) === 0) iguales++;
  else {
    malos++;
    let d = 0, pri = -1; for (let i = 0; i < j.o.length; i++) if (j.o[i] !== m.pixeles[i]) { d++; if (pri < 0) pri = i; }
    if (malos <= 6) console.log(`DISTINTO ${n} ${j.w}x${j.h}/${m.ancho}x${m.alto} ${d} bytes, primero ${pri}: juego ${j.o[pri]} mio ${m.pixeles[pri]}`);
  }
  // Codificar lo decodificado y decodificarlo otra vez, con el del juego. Con una muestra alcanza.
  if (iguales % 10 && !/TIT01_1|arrow01/i.test(n)) continue;
  const nuevo = codificarPtx(m, m.calidad), v = delJuego(nuevo), p = psnr(v.o, m.pixeles);
  reco++; sumaPsnr += p; tamO += b.length; tamN += nuevo.length;
  if (p < peor) { peor = p; peorN = n; }
  if (Buffer.compare(Buffer.from(decodificarPtx(nuevo).pixeles), Buffer.from(v.o))) { recoMal++; console.log('RECODIFICADO distinto en el juego', n); }
  if (carpeta && (/TIT01_1|arrow01|a&b/i.test(n))) writeFileSync(join(carpeta, n.split(/[/:]/).pop().replace(/[^\w.]/g, '_') + '.png'), png(m.ancho, m.alto, m.canales, m.pixeles));
}
console.log('tamanos y tipos', tipos);
console.log(`identicos al juego ${iguales} de ${items.length - noPtx}; distintos ${malos}; con el nombre pero sin la firma ${noPtx}`);
console.log(`recodificados ${reco}: mismo resultado en los dos decodificadores salvo ${recoMal}; PSNR promedio ${(sumaPsnr / reco).toFixed(1)} dB, peor ${peor.toFixed(1)} (${peorN}); peso ${Math.round(tamO / 1024)} KB -> ${Math.round(tamN / 1024)} KB`);
process.exit(malos || recoMal || difTablas ? 1 : 0);
