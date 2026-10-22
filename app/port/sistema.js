// Lo que el programa original le pedia a DOS y a DOS4GW (int 21h, int 31h, int 10h/16h/1Ah...), simulado.
// Archivos: el anfitrion da leerArchivo(ruta) -> Uint8Array | null (en el navegador, desde /datos/disco/...; en Node, del disco).
import { R, M8, IO, HLE, EAX, EBX, ECX, EDX, ESI, EDI, r32, w32, w16, w8, fijarCf, leerTexto, escribirTexto, cargar } from './cpu.js';

// delay() de Watcom: al arrancar (0x111277) calibra cuantas consultas de hora a DOS entran en un segundo y
// delay(ms) (0x1112A9) gira consultando la hora. Se reemplaza por una espera real de la misma duracion.
const dormir = (() => { const s = new Int32Array(new SharedArrayBuffer(4)); return (ms) => { if (ms > 0) Atomics.wait(s, 0, 0, ms); }; })();
HLE[0x111277] = () => { w32(0x7f04a8, 1000); return 0; };
HLE[0x1112A9] = () => { dormir(R[EAX] | 0); return 0; };

export const ARRANQUE = { eip: 0x10E024, esp: 0x9F0900, montonIni: 0x1000000, montonFin: 0x3E00000 };
export const registro = [];          // llamadas al sistema (para depurar)
export let anotar = (s) => { registro.push(s); if (registro.length > 5000) registro.shift(); };
export function fijarAnotar(f) { anotar = f; }

// ---------- memoria (DPMI) ----------
let siguiente = ARRANQUE.montonIni;
const bloques = new Map();           // handle -> { dir, tam }
let sigHandle = 1;
function reservar(tam) {
  tam = (tam + 0xFFF) & ~0xFFF;
  if (siguiente + tam > ARRANQUE.montonFin) return 0;
  const d = siguiente; siguiente += tam; M8.fill(0, d, d + tam); return d;
}

// ---------- archivos (DOS) ----------
const abiertos = new Map();          // handle -> { ruta, datos, pos, escritura: [] }
let sigArchivo = 5;
let leerArchivo = () => null;
export function fijarLectorDeArchivos(f) { leerArchivo = f; }
export const salida = { texto: '' };  // lo que el programa escribe en pantalla/consola (handles 1 y 2)
// para volver a arrancar el programa en el mismo hilo (trabajador.js): memoria, archivos y vectores como recien abierto
export function reiniciarSistema() {
  siguiente = ARRANQUE.montonIni; bloques.clear(); sigHandle = 1;
  abiertos.clear(); sigArchivo = 5; salida.texto = ''; registro.length = 0;
  vectores.clear();
}

const ok = () => fijarCf(0);
const error = (codigo) => { R[EAX] = (R[EAX] & -65536) | codigo; fijarCf(1); };
const ah = () => (R[EAX] >> 8) & 0xFF, al = () => R[EAX] & 0xFF;
const setAX = (v) => { R[EAX] = (R[EAX] & -65536) | (v & 0xFFFF); };

function dos() {
  const f = ah();
  switch (f) {
    case 0x30: setAX(0x0007); R[EBX] = (R[EBX] & -65536); ok(); return;                 // version de DOS 7.0
    case 0xFF: if ((R[EDX] & 0xFFFF) === 0x78) { R[EAX] = (R[EAX] & -256) | 1; return; } break;   // "hay DOS/4GW": AL != 0
    case 0x19: R[EAX] = (R[EAX] & -256) | 2; return;                                      // disco actual C:
    case 0x0E: R[EAX] = (R[EAX] & -256) | 26; return;
    case 0x2A: { const d = new Date(); setAX(((d.getFullYear() - 1980) << 0) & 0xFFFF); R[ECX] = (R[ECX] & -65536) | d.getFullYear(); R[EDX] = (R[EDX] & -65536) | (((d.getMonth() + 1) << 8) | d.getDate()); R[EAX] = (R[EAX] & -256) | d.getDay(); return; }
    case 0x2C: { const d = new Date(); R[ECX] = (R[ECX] & -65536) | ((d.getHours() << 8) | d.getMinutes()); R[EDX] = (R[EDX] & -65536) | ((d.getSeconds() << 8) | Math.floor(d.getMilliseconds() / 10)); return; }
    case 0x25: anotar(`dos: fijar vector de interrupcion 0x${al().toString(16)} -> 0x${(R[EDX] >>> 0).toString(16)}`); vectores.set(al(), R[EDX] >>> 0); ok(); return;
    case 0x35: R[EBX] = 0x7FFFFF00 + al(); anotar(`dos: leer vector 0x${al().toString(16)}`); ok(); return;   // vector viejo ficticio
    case 0x44: {                                                                          // IOCTL
      if (al() === 0x00) { const h = R[EBX] & 0xFFFF; R[EDX] = (R[EDX] & -65536) | (h <= 2 ? 0x80D3 : 0x0002); ok(); return; }
      ok(); return;
    }
    case 0x3D: case 0x6C: {                                                               // abrir archivo
      const ruta = leerTexto(f === 0x6C ? R[ESI] : R[EDX]);
      const datos = leerArchivo(ruta);
      anotar(`dos: abrir "${ruta}" -> ${datos ? datos.length + ' bytes' : 'NO EXISTE'}`);
      if (!datos) { error(2); return; }
      const h = sigArchivo++; abiertos.set(h, { ruta, datos, pos: 0 }); setAX(h); if (f === 0x6C) R[ECX] = (R[ECX] & -65536) | 1; ok(); return;
    }
    case 0x3C: {                                                                          // crear archivo (capturas, registro): en memoria
      const ruta = leerTexto(R[EDX]); const h = sigArchivo++;
      abiertos.set(h, { ruta, datos: new Uint8Array(0), pos: 0, escritura: [] }); anotar(`dos: crear "${ruta}"`); setAX(h); ok(); return;
    }
    case 0x3E: { const h = R[EBX] & 0xFFFF; abiertos.delete(h); ok(); return; }           // cerrar
    case 0x3F: {                                                                          // leer
      const h = R[EBX] & 0xFFFF, n = R[ECX] >>> 0, a = abiertos.get(h);
      if (!a) { if (h === 0) { R[EAX] = 0; ok(); return; } error(6); return; }
      const m = Math.max(0, Math.min(n, a.datos.length - a.pos));
      M8.set(a.datos.subarray(a.pos, a.pos + m), R[EDX] >>> 0); a.pos += m; R[EAX] = m; ok(); return;
    }
    case 0x40: {                                                                          // escribir
      const h = R[EBX] & 0xFFFF, n = R[ECX] >>> 0, d = R[EDX] >>> 0;
      if (h === 1 || h === 2) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(M8[d + i]); salida.texto += s; anotar('pantalla: ' + JSON.stringify(s)); R[EAX] = n; ok(); return; }
      const a = abiertos.get(h); if (a && a.escritura) a.escritura.push(M8.slice(d, d + n)); R[EAX] = n; ok(); return;
    }
    case 0x42: {                                                                          // mover puntero
      const h = R[EBX] & 0xFFFF, a = abiertos.get(h); if (!a) { error(6); return; }
      const desp = ((R[ECX] & 0xFFFF) << 16) | (R[EDX] & 0xFFFF);
      const base = al() === 0 ? 0 : al() === 1 ? a.pos : a.datos.length;
      a.pos = Math.max(0, base + desp); R[EAX] = a.pos & 0xFFFF; R[EDX] = (R[EDX] & -65536) | ((a.pos >>> 16) & 0xFFFF); ok(); return;
    }
    case 0x43: { const ruta = leerTexto(R[EDX]); const d = leerArchivo(ruta); if (!d) { error(2); return; } R[ECX] = (R[ECX] & -65536) | 0x20; ok(); return; }
    case 0x47: escribirTexto(R[ESI], 'PIU'); ok(); return;                               // carpeta actual
    case 0x3B: ok(); return;                                                              // cambiar carpeta
    case 0x1A: ok(); return;                                                              // DTA
    case 0x4E: case 0x4F: error(18); return;                                              // buscar archivos: no hay
    case 0x48: { const d = reservar((R[EBX] & 0xFFFF) * 16); if (!d) { error(8); return; } setAX(d >>> 4); ok(); return; }
    case 0x49: case 0x4A: ok(); return;
    case 0x4C: throw new SalidaDelPrograma(al());
    case 0x62: R[EBX] = (R[EBX] & -65536) | 0x100; ok(); return;
    case 0x0B: R[EAX] = R[EAX] & -256; return;                                            // hay tecla: no
    case 0x06: case 0x07: case 0x08: R[EAX] = R[EAX] & -256; return;
  }
  anotar(`dos: funcion 0x${f.toString(16)} SIN SIMULAR`);
  throw new Error(`DOS int 21h AH=0x${f.toString(16)} sin simular`);
}

function dpmi() {
  const f = R[EAX] & 0xFFFF;
  switch (f) {
    case 0x0000: setAX(0x100); ok(); return;                                              // reservar descriptores
    case 0x0001: case 0x0007: case 0x0008: case 0x0009: case 0x000C: ok(); return;       // liberar / fijar base / limite / derechos
    case 0x0002: setAX(0x108); ok(); return;
    case 0x0003: setAX(8); ok(); return;
    case 0x0006: R[ECX] = R[ECX] & -65536; R[EDX] = R[EDX] & -65536; ok(); return;        // base del segmento: 0 (plano)
    case 0x000A: setAX(0x110); ok(); return;
    case 0x0100: { const d = reservar((R[EBX] & 0xFFFF) * 16); if (!d || d > 0xFFFFF) { anotar('dpmi: memoria DOS pedida (simulada)'); } setAX(0x9000); R[EDX] = (R[EDX] & -65536) | 0x120; ok(); return; }
    case 0x0101: case 0x0102: ok(); return;
    case 0x0200: case 0x0201: ok(); return;                                               // vectores en modo real
    case 0x0202: case 0x0203: ok(); return;                                               // excepciones
    case 0x0204: R[ECX] = (R[ECX] & -65536) | 0x1B; R[EDX] = 0; ok(); return;              // leer vector en modo protegido
    case 0x0205: anotar(`dpmi: fijar vector 0x${(R[EBX] & 0xFF).toString(16)} -> 0x${(R[EDX] >>> 0).toString(16)}`); vectores.set(R[EBX] & 0xFF, R[EDX] >>> 0); ok(); return;
    case 0x0300: case 0x0301: case 0x0302: anotar('dpmi: llamada a modo real (simulada)'); ok(); return;
    case 0x0400: setAX(0x005A); R[EBX] = (R[EBX] & -65536) | 0x0005; R[ECX] = (R[ECX] & -256) | 4; R[EDX] = (R[EDX] & -65536) | 0x0870; ok(); return;
    case 0x0500: {                                                                        // informacion de memoria libre
      const d = R[EDI] >>> 0, libre = ARRANQUE.montonFin - siguiente;
      w32(d, libre); w32(d + 4, libre >>> 12); w32(d + 8, libre >>> 12); for (let i = 12; i < 48; i += 4) w32(d + i, -1); ok(); return;
    }
    case 0x0501: {                                                                        // reservar memoria
      const tam = (((R[EBX] & 0xFFFF) << 16) | (R[ECX] & 0xFFFF)) >>> 0, d = reservar(tam);
      anotar(`dpmi: reservar ${tam} bytes -> 0x${d.toString(16)}`);
      if (!d) { error(0x8013); return; }
      const h = sigHandle++; bloques.set(h, { dir: d, tam });
      R[EBX] = (R[EBX] & -65536) | (d >>> 16); R[ECX] = (R[ECX] & -65536) | (d & 0xFFFF);
      R[ESI] = (R[ESI] & -65536) | (h >>> 16); R[EDI] = (R[EDI] & -65536) | (h & 0xFFFF); ok(); return;
    }
    case 0x0502: ok(); return;
    case 0x0503: { const tam = (((R[EBX] & 0xFFFF) << 16) | (R[ECX] & 0xFFFF)) >>> 0, d = reservar(tam); R[EBX] = (R[EBX] & -65536) | (d >>> 16); R[ECX] = (R[ECX] & -65536) | (d & 0xFFFF); ok(); return; }
    case 0x0600: case 0x0601: case 0x0602: case 0x0603: case 0x0604: ok(); return;          // trabar/destrabar memoria
    case 0x0800: { const fis = (((R[EBX] & 0xFFFF) << 16) | (R[ECX] & 0xFFFF)) >>> 0; R[EBX] = (R[EBX] & -65536) | (fis >>> 16); R[ECX] = (R[ECX] & -65536) | (fis & 0xFFFF); ok(); return; }
    case 0x0900: case 0x0901: case 0x0902: R[EAX] = R[EAX] & -256 | 1; ok(); return;
    case 0x0A00: error(0x8001); return;
  }
  anotar(`dpmi: funcion 0x${f.toString(16)} SIN SIMULAR`);
  throw new Error(`DPMI int 31h AX=0x${f.toString(16)} sin simular`);
}

export const vectores = new Map();   // interrupciones que instala el programa (timer 8, teclado 9...)

export class SalidaDelPrograma extends Error { constructor(c) { super('el programa termino con codigo ' + c); this.codigo = c; } }

IO.int = (n) => {
  if (n === 0x21) return dos();
  if (n === 0x31) return dpmi();
  if (n === 0x10) { anotar(`bios video AX=0x${(R[EAX] & 0xFFFF).toString(16)}`); return; }
  if (n === 0x16) { R[EAX] = R[EAX] & -65536; return; }      // teclado del BIOS: sin tecla (el port lo maneja aparte)
  if (n === 0x1A) { const t = Math.floor(performance.now() / 54.925); R[ECX] = (R[ECX] & -65536) | ((t >>> 16) & 0xFFFF); R[EDX] = (R[EDX] & -65536) | (t & 0xFFFF); return; }
  if (n === 0x33) { R[EAX] = R[EAX] & -65536; return; }      // raton: no hay
  if (n === 0x2F) { anotar(`int 2f AX=0x${(R[EAX] & 0xFFFF).toString(16)}`); return; }
  anotar(`int 0x${n.toString(16)} SIN SIMULAR AX=0x${(R[EAX] & 0xFFFF).toString(16)}`);
  throw new Error('int 0x' + n.toString(16) + ' sin simular');
};
IO.sistema = (op) => { if (op === 'hlt') anotar('hlt'); };
