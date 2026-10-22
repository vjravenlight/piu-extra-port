// Prueba funciones originales traducidas (app\port\traducido.js) contra resultados conocidos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const imp = (p) => import(pathToFileURL(path.join(base, p)).href);
const C = await imp('app/port/cpu.js');
await imp('app/port/traducido.js');
const { xorAndamiro } = await imp('app/motor/cifrados.js');
const vol = path.join(base, 'investigacion', 'volcados');
C.cargar(0x20000, fs.readFileSync(path.join(vol, 'codigo_0x20000.bin')));
C.cargar(0x130000, fs.readFileSync(path.join(vol, 'datos_0x130000.bin')));
const { R, ESP, EAX, EDX } = C;
let fallas = 0;
const prueba = (nombre, ok, detalle = '') => { console.log((ok ? 'OK    ' : 'FALLA ') + nombre + (detalle ? ' · ' + detalle : '')); if (!ok) fallas++; };
R[ESP] = 0x3F00000;

// 1) descifrado original 0x3689C (EAX = bufer, EDX = largo)
{
  const c = fs.readFileSync(path.join(base, 'extraido', 'Piu', 'step', '60_N1.NOT'));
  const n = c.readInt32LE(0) * 4, datos = c.subarray(0x88, 0x88 + n);
  C.cargar(0x2000000, datos);
  const esp0 = R[ESP];
  R[EAX] = 0x2000000; R[EDX] = n;
  C.llamar(0x3689c, 0x12345678);
  const esperado = xorAndamiro(c, 0x88, n);
  const obtenido = C.M8.subarray(0x2000000, 0x2000000 + n);
  prueba('descifrado 0x3689C (60_N1.NOT, ' + n + ' bytes)', Buffer.compare(Buffer.from(esperado), Buffer.from(obtenido)) === 0 && R[ESP] === esp0, 'pila ' + (R[ESP] === esp0 ? 'ok' : 'desfasada'));
}
// 2) sprintf original de Watcom 0x10D791 (cdecl: destino, formato, argumentos)
{
  C.escribirTexto(0x2100000, 'STEP\\%s'); C.escribirTexto(0x2100100, '60_N1.NOT');
  const esp0 = R[ESP];
  C.push(0x2100100); C.push(0x2100000); C.push(0x2100200);
  try {
    C.llamar(0x10d791, 0x12345678); R[ESP] += 12;
    const s = C.leerTexto(0x2100200);
    prueba('sprintf 0x10D791 ("STEP\\\\%s")', s === 'STEP\\60_N1.NOT' && R[ESP] === esp0, JSON.stringify(s) + ' devolvio ' + R[EAX]);
  } catch (e) { prueba('sprintf 0x10D791', false, e.message); R[ESP] = esp0; }
}
// 3) sprintf con numeros (como el registro "%d %s %s" y "AUDIO\%02d.AUD")
C.IO.int = (n) => {
  const ah = (R[EAX] >> 8) & 0xFF;
  console.log(`  (int 0x${n.toString(16)} AH=0x${ah.toString(16)} AL=0x${(R[EAX] & 0xFF).toString(16)} EBX=0x${(R[3] >>> 0).toString(16)} EDX=0x${(R[EDX] >>> 0).toString(16)} pila: ${[0, 4, 8, 12].map(k => '0x' + (C.r32(R[ESP] + k) >>> 0).toString(16)).join(' ')})`);
  C.fijarCf(0);
};
{
  C.escribirTexto(0x2100000, 'AUDIO\\%02d.AUD %d %x %5.1f');
  const esp0 = R[ESP];
  // double 3.25 ocupa 8 bytes en la pila (parte baja primero en memoria -> se empuja la alta primero)
  const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, 3.25, true);
  C.push(dv.getInt32(4, true)); C.push(dv.getInt32(0, true)); C.push(0xBEEF); C.push(-42); C.push(7); C.push(0x2100000); C.push(0x2100200);
  try {
    C.llamar(0x10d791, 0x12345678); R[ESP] += 28;
    const s = C.leerTexto(0x2100200);
    prueba('sprintf con %02d %d %x %5.1f', s === 'AUDIO\\07.AUD -42 beef   3.3' || s === 'AUDIO\\07.AUD -42 beef   3.2', JSON.stringify(s));
  } catch (e) { prueba('sprintf con numeros', false, e.message); R[ESP] = esp0; }
}
console.log(fallas ? `${fallas} FALLAS` : 'TODO BIEN');
if (C.traza.faltantes.size) console.log('funciones faltantes: ' + [...C.traza.faltantes.keys()].map(d => '0x' + d.toString(16)).join(' '));
