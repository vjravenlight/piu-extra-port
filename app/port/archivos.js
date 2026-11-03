// De donde salen los archivos del juego (Charles 21/10: "que tire la carpeta o bin del mismo"). Dos maneras:
// - EN EL SERVIDOR (la PC con JUGAR.cmd, las builds completas, la web con el disco subido): disco\, volcados\,
//   port\traducido.js y port\game_*.cfg se piden por la red, como siempre;
// - DISCO PROPIO: el servidor no los tiene (la web o las builds sin nada de Andamiro). El jugador eligio su disco una
//   vez (instalar.js) y quedo todo en el almacenamiento del navegador (Cache Storage 'piu-disco-1'): de ahi se lee.
// El hilo del juego no puede esperar promesas: pide cada archivo a la pagina (servirLectura) y espera con Atomics.
export const ALMACEN = 'piu-disco-1';
const BASE = new URL('../', import.meta.url).href;
// lo que sale del disco (o de Piu.exe) y nunca esta en el repositorio; y la ROM de los efectos (la elige el jugador)
const DEL_DISCO = /^(disco\/|volcados\/|efectos\/|port\/(traducido\.js|game_[a-z]+\.cfg)$)/;
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

// ---------- la ROM de los sonidos de la cabina (03/11, Charles: "aclara que para jugar se necesitan esas dos cosas") ----------
// Los efectos (moneda, voces del puntaje...) no estan en el disco: los tocaba un chip de la placa desde su ROM (efectos.js).
// Sin disco propio la pone el servidor; con disco propio la elige el jugador: pumpitup.zip (el set de MAME) o piu10.u9.
const HUELLA_ROM = '34cf33a0007f87e8bf8c847a7b86a0a72a8a9c18e489e579dcf5d5175ce3946d', LARGO_ROM = 2097152;
const NO_ES_ROM = 'Esa no es la ROM de sonidos: elegí pumpitup.zip (el set de MAME) o el archivo piu10.u9.';
async function sacarDeZip(z) {
  const d = new DataView(z.buffer, z.byteOffset, z.byteLength);
  let fin = z.length - 22;
  while (fin >= 0 && d.getUint32(fin, true) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error(NO_ES_ROM);
  let p = d.getUint32(fin + 16, true);
  for (let i = 0, n = d.getUint16(fin + 10, true); i < n; i++) {
    const metodo = d.getUint16(p + 10, true), comprimido = d.getUint32(p + 20, true), largoNombre = d.getUint16(p + 28, true), local = d.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(z.subarray(p + 46, p + 46 + largoNombre));
    if (/(^|\/)piu10\.u9$/i.test(nombre)) {
      const ini = local + 30 + d.getUint16(local + 26, true) + d.getUint16(local + 28, true), datos = z.subarray(ini, ini + comprimido);
      if (metodo === 0) return datos;
      if (metodo !== 8) throw new Error(NO_ES_ROM);
      return new Uint8Array(await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    p += 46 + largoNombre + d.getUint16(p + 30, true) + d.getUint16(p + 32, true);
  }
  throw new Error(NO_ES_ROM);
}
// de lo que eligio el jugador a los bytes de la ROM, comprobados con su huella (si no es, tira el error para mostrar)
export async function leerRom(archivo) {
  let b = new Uint8Array(await archivo.arrayBuffer());
  if (b[0] === 0x50 && b[1] === 0x4b) b = await sacarDeZip(b);
  if (b.length !== LARGO_ROM) throw new Error(NO_ES_ROM);
  if (globalThis.crypto && crypto.subtle) {
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
    if (h !== HUELLA_ROM) throw new Error(NO_ES_ROM);
  }
  return b;
}
export async function guardarRom(bytes) {
  const a = await caches.open(ALMACEN);
  await a.put(clave('efectos/piu10.u9'), new Response(bytes));
}

// ---------- lecturas del hilo del juego ----------
// El hilo manda { tipo: 'leer', ruta, desde } y espera en L[0]. La pagina pone en B el pedazo que va desde 'desde',
// L[1] = largo total, L[2] = bytes de este pedazo, y L[0] = 1 (o 2 = no existe). Los archivos grandes van en varios
// pedazos (B es de 8 MB); el ultimo leido queda a mano para no volver a leerlo por cada pedazo.
// (31/10) sin memoria compartida (la APK con la WebView): el archivo entero va al servidor de la app, que se lo da al
// hilo cuando lo pide (trabajador.js leerPropio); si no esta, se avisa con falta=1
export async function servirPorPuente(base, m) {
  let bytes = null;
  try { bytes = await leer(m.ruta); } catch (e) { bytes = null; }
  const u = `${base}archivo?ruta=${encodeURIComponent(m.ruta)}${bytes ? '' : '&falta=1'}`;
  try { await fetch(u, { method: 'POST', body: bytes || '', cache: 'no-store' }); } catch (e) { /* el hilo se cansa de esperar y sigue sin el */ }
}
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
