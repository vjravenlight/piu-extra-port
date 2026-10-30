// De donde salen los archivos del juego (Charles 21/10: "que tire la carpeta o bin del mismo"). Dos maneras:
// - EN EL SERVIDOR (la PC con JUGAR.cmd, las builds completas, la web con el disco subido): disco\, volcados\,
//   port\traducido.js y port\game_*.cfg se piden por la red, como siempre;
// - DISCO PROPIO: el servidor no los tiene (la web o las builds sin nada de Andamiro). El jugador eligio su disco una
//   vez (instalar.js) y quedo todo en el almacenamiento del navegador (Cache Storage 'piu-disco-1'): de ahi se lee.
// El hilo del juego no puede esperar promesas: pide cada archivo a la pagina (servirLectura) y espera con Atomics.
export const ALMACEN = 'piu-disco-1';
const BASE = new URL('../', import.meta.url).href;
// lo que sale del disco (o de Piu.exe) y nunca esta en el repositorio
const DEL_DISCO = /^(disco\/|volcados\/|port\/(traducido\.js|game_[a-z]+\.cfg)$)/;
let almacen = null;
export let propio = false;            // true = disco propio (lo guardado en el navegador)

// 'disco/BGA\\00.DAT' -> 'disco/bga/00.dat' (en el almacen todo va en minuscula, como en el hosting)
export const normal = (rel) => rel.replace(/\\/g, '/').toLowerCase();
export const clave = (rel) => BASE + '__disco_propio__/' + normal(rel);
export const relativa = (url) => { const u = new URL(url, location.href).href; return u.startsWith(BASE) ? decodeURIComponent(u.slice(BASE.length)) : null; };
export const esDelDisco = (rel) => DEL_DISCO.test(normal(rel));

// el servidor tiene el juego? (un HEAD a lo primero que pide el juego)
export async function servidorTieneDisco() {
  try { const r = await fetch(BASE + 'volcados/codigo_0x20000.bin', { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch (e) { return false; }
}
// hay un disco propio ya preparado en este navegador? -> lo que se anoto al prepararlo, o null
export async function discoPropio() {
  if (typeof caches === 'undefined') return null;
  try { const c = await caches.open(ALMACEN), r = await c.match(clave('listo.json')); return r ? await r.json() : null; } catch (e) { return null; }
}
export async function usarDiscoPropio() { almacen = await caches.open(ALMACEN); propio = true; }
export async function borrarDiscoPropio() { propio = false; almacen = null; try { await caches.delete(ALMACEN); } catch (e) { /* nada */ } }

// un archivo del juego, venga de donde venga (null si no esta)
export async function leer(rel) {
  if (propio && esDelDisco(rel)) {
    const r = await almacen.match(clave(rel));
    return r ? new Uint8Array(await r.arrayBuffer()) : null;
  }
  const r = await fetch(BASE + rel);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}
// lo mismo con una direccion entera (online.js, tactil.js): si es del disco y el disco es propio, del almacen
export async function traer(url) {
  const rel = relativa(url);
  const b = rel !== null && propio && esDelDisco(rel) ? await leer(rel) : await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((a) => (a ? new Uint8Array(a) : null));
  if (!b) throw new Error('falta ' + url);
  return b;
}

// ---------- lecturas del hilo del juego ----------
// El hilo manda { tipo: 'leer', ruta, desde } y espera en L[0]. La pagina pone en B el pedazo que va desde 'desde',
// L[1] = largo total, L[2] = bytes de este pedazo, y L[0] = 1 (o 2 = no existe). Los archivos grandes van en varios
// pedazos (B es de 8 MB); el ultimo leido queda a mano para no volver a leerlo por cada pedazo.
export const PEDAZO = 8 << 20;
export function crearCanal() { return { L: new SharedArrayBuffer(16), B: new SharedArrayBuffer(PEDAZO) }; }
let ultimo = { ruta: '', bytes: null };
export async function servirLectura(canal, m) {
  const L = new Int32Array(canal.L), B = new Uint8Array(canal.B);
  let bytes = ultimo.ruta === m.ruta ? ultimo.bytes : null;
  if (!bytes) { try { bytes = await leer(m.ruta); } catch (e) { bytes = null; } ultimo = { ruta: m.ruta, bytes }; }
  if (!bytes) { L[1] = 0; L[2] = 0; Atomics.store(L, 0, 2); Atomics.notify(L, 0); return; }
  const n = Math.max(0, Math.min(PEDAZO, bytes.length - m.desde));
  B.set(bytes.subarray(m.desde, m.desde + n));
  L[1] = bytes.length; L[2] = n;
  if (m.desde + n >= bytes.length) ultimo = { ruta: '', bytes: null };
  Atomics.store(L, 0, 1); Atomics.notify(L, 0);
}
