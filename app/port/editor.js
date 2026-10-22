// EDITOR de pasos (EDITOR_MASTER.md, etapa 1; Charles 20/10: "amigable pero completo", "importar not, exportar not",
// "el creador tiene que ser un modulo del juego"). Se dibuja en el lienzo del menu (online.js le pasa todo lo que usa).
//
// Que hace:
// - elegir cancion y modo del disco (o importar un .NOT propio) y abrir sus pasos (formato A o B, cifrados.js leerPasos);
// - grilla vertical con las 5 columnas (10 en DOUBLE), lineas de pulso y de compas, las flechas del juego (00.DAT);
// - poner y sacar flechas con las mismas teclas del juego (Z Q S E C / numerico) o con el mouse o el dedo; flechas
//   largas con Shift + tecla (empieza) y otra vez Shift + tecla (termina), o arrastrando con el mouse;
// - ajuste de 1/1 a 1/8 de pulso, zoom, seleccion, copiar, pegar, borrar, espejo, deshacer y rehacer;
// - escuchar la cancion desde donde esta el cursor, con metronomo y "claps" en cada flecha;
// - BPM y desfase a mano; PROBAR en el juego de verdad (trabajador.js: el .NOT del editor entra por el lector de
//   archivos y la cancion arranca sola, como en el online); EXPORTAR un .NOT formato A, que la cabina lee.
import { leerPasos, descifrarAudio, descifrarPnz, ESPEJO } from '../motor/cifrados.js';
import { esTactil } from './tactil.js';

let D = null;                 // lo que presta online.js: { texto, caja, barra, numerosCromo, R, CANCIONES, nombreDe, traer, DISCO, audio, avisar, probar, salir, lienzo }
let ed = null;                // la tabla abierta
let fase = 'elegir';          // 'elegir' (cancion y modo) o 'editar'
const elegir = { i: 0, modo: 0 };
// las variantes de cada modo: en NORMAL, HARD y CRAZY la de 1 jugador (_1) y la VERSUS (_2): los dos pads, el de la
// derecha es el del jugador 2, y no son iguales: forman una coreografia entre los dos (Charles, 20/10)
const variantes = (c) => c.modos.flatMap((m) => (m === 'DOUBLE' ? [{ modo: m, versus: false }] : [{ modo: m, versus: false }, { modo: m, versus: true }]));
const nombreVariante = (v) => v.modo + (v.versus ? ' VERSUS (2 JUGADORES)' : v.modo === 'DOUBLE' ? '' : ' (1 JUGADOR)');
const SUFIJO = { NORMAL: 'n1', HARD: 'h1', CRAZY: 'x1', DOUBLE: 'db' };
const COLS = ['di', 'ui', 'c', 'ud', 'dd'];                     // orden de columnas del juego: ↙ ↖ ● ↗ ↘
const TECLA_COL = { KeyZ: 0, KeyQ: 1, KeyS: 2, KeyE: 3, KeyC: 4, Numpad1: 5, Numpad7: 6, Numpad5: 7, Numpad9: 8, Numpad3: 9 };
const nn = (n) => String(n).padStart(2, '0');

export function iniciarEditor(deps) { D = deps; addEventListener('pointerdown', puntero, { passive: false }); addEventListener('pointermove', puntero, { passive: false }); addEventListener('pointerup', puntero, { passive: false }); }
export function abrirEditor() { fase = 'elegir'; parar(); cargarPropias().then(cargarPortadasPropias); }
// las del disco y las propias (guardado\canciones), todas en la misma lista
const lista = () => [...D.CANCIONES, ...propias.map(c => ({ n: c.n, nombre: c.nombre, modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'], propia: c }))];
const portadasPropias = new Map();
async function cargarPortadasPropias() { for (const c of propias) if (!portadasPropias.has(c.n)) { try { const r = await fetch(GUARDADO() + `t${c.n}.pnz`); const png = descifrarPnz(new Uint8Array(await r.arrayBuffer()), D.R.llave); if (png) portadasPropias.set(c.n, await createImageBitmap(new Blob([png], { type: 'image/png' }))); } catch (e) { /* sin portada */ } } }
export const editorAbierto = () => fase;

// ---------- modelo: filas, notas (mascara de 10 bits por fila) y largas ----------
function nueva(c, modo, base, versus = false) {
  const doble = modo === 'DOUBLE', dosLados = doble || versus;
  return { cancion: c.n, nombre: c.nombre, modo, doble, versus, dosLados, cols: dosLados ? 10 : 5, porPulso: base ? base.filasPorPulso : 4,
    bpms: base ? base.bpms.slice() : [120], valores: base ? base.valores.slice() : [0], cambios: base ? base.cambiosBpm.slice() : [0],
    numero: base ? base.numeroInterno : c.n, notas: new Map(), largas: [], largo: 0,
    cursor: 0, col: 0, zoom: 14, snap: 1, sel: null, deshacer: [], rehacer: [], cambiado: false, largaAbierta: {} };
}
function cargarDe(ed, p) {
  for (const [r, col] of p.notas) if (col < ed.cols) ed.notas.set(r, (ed.notas.get(r) || 0) | (1 << col));
  for (const [col, d, h] of p.largas) if (col < ed.cols) ed.largas.push({ col, d, h });
  ed.largo = Math.max(p.ultimaFila + ed.porPulso * 8, ed.porPulso * 64);
}
const foto = () => JSON.stringify({ n: [...ed.notas], l: ed.largas });
function guardarDeshacer() { ed.deshacer.push(foto()); if (ed.deshacer.length > 200) ed.deshacer.shift(); ed.rehacer = []; ed.cambiado = true; }
function volver(desde, hacia) { if (!desde.length) return; hacia.push(foto()); const s = JSON.parse(desde.pop()); ed.notas = new Map(s.n); ed.largas = s.l; ed.cambiado = true; }
const largaEn = (r, col) => ed.largas.find(l => l.col === col && r >= l.d && r <= l.h);
function alternar(r, col) {
  guardarDeshacer();
  const l = largaEn(r, col);
  if (l) { ed.largas.splice(ed.largas.indexOf(l), 1); return; }
  const m = (ed.notas.get(r) || 0) ^ (1 << col);
  if (m) ed.notas.set(r, m); else ed.notas.delete(r);
  ed.largo = Math.max(ed.largo, r + ed.porPulso * 8);
}
function ponerLarga(col, d, h) {
  if (h < d) [d, h] = [h, d];
  if (h === d) { alternar(d, col); return; }
  guardarDeshacer();
  ed.largas = ed.largas.filter(l => l.col !== col || l.h < d || l.d > h);
  for (let r = d; r <= h; r++) { const m = (ed.notas.get(r) || 0) & ~(1 << col); if (m) ed.notas.set(r, m); else ed.notas.delete(r); }
  ed.largas.push({ col, d, h });
  ed.largo = Math.max(ed.largo, h + ed.porPulso * 8);
}
function borrarRango(a, b) {
  guardarDeshacer();
  for (const r of [...ed.notas.keys()]) if (r >= a && r <= b) ed.notas.delete(r);
  ed.largas = ed.largas.filter(l => l.h < a || l.d > b);
}
let portapapeles = null;
function copiar(a, b) { portapapeles = { n: [...ed.notas].filter(([r]) => r >= a && r <= b).map(([r, m]) => [r - a, m]), l: ed.largas.filter(l => l.d >= a && l.h <= b).map(l => ({ col: l.col, d: l.d - a, h: l.h - a })) }; D.avisar(`Copiadas ${portapapeles.n.length} filas`); }
function pegar(en) {
  if (!portapapeles) return;
  guardarDeshacer();
  for (const [r, m] of portapapeles.n) ed.notas.set(en + r, (ed.notas.get(en + r) || 0) | m);
  for (const l of portapapeles.l) ed.largas.push({ col: l.col, d: en + l.d, h: en + l.h });
}
// VERSUS a partir de lo que hay en el pad izquierdo (tecla V): el derecho queda igual, para despues cambiarlo y armar
// la coreografia de los dos (en el disco, la mitad de las _2 tienen los dos pads iguales y la otra mitad no)
function duplicarAlDerecho() {
  for (const [r, m] of [...ed.notas]) ed.notas.set(r, (m & 0x1F) | ((m & 0x1F) << 5));
  ed.largas = ed.largas.filter(l => l.col < 5); for (const l of [...ed.largas]) ed.largas.push({ col: l.col + 5, d: l.d, h: l.h });
}
function espejo(a, b) {          // ↙↔↘ y ↖↔↗ en cada pad
  guardarDeshacer();
  const mc = (c) => { const p = Math.floor(c / 5) * 5, k = c % 5; return p + [4, 3, 2, 1, 0][k]; };
  for (const [r, m] of [...ed.notas]) if (r >= a && r <= b) { let n = 0; for (let c = 0; c < 10; c++) if (m & (1 << c)) n |= 1 << mc(c); ed.notas.set(r, n); }
  for (const l of ed.largas) if (l.d >= a && l.h <= b) l.col = mc(l.col);
}

// ---------- tiempo: fila r = valores[0]/100 + r / filasPorPulso * 60 / BPM (JUEGO_REGLAS 5) ----------
const segFila = (r) => ed.valores[0] / 100 + r / ed.porPulso * 60 / ed.bpms[0];
const filaSeg = (s) => (s - ed.valores[0] / 100) * ed.bpms[0] / 60 * ed.porPulso;

// ---------- .NOT formato A ("pump 5.0"), el que la cabina lee sin cifrar (FORMATOS.md) ----------
export function escribirNot(e) {
  const N = Math.max(1, e.largo), b = new Uint8Array(216 + 6 * N), v = new DataView(b.buffer);
  for (let i = 0; i < 8; i++) b[i] = 'pump 5.0'.charCodeAt(i);
  v.setUint16(0x0A, N, true);
  for (let i = 0; i < 10; i++) { v.setFloat32(0x10 + 4 * i, e.bpms[i] || e.bpms[0] || 120, true); v.setInt32(0x38 + 4 * i, e.valores[i] | 0, true); v.setInt32(0x60 + 4 * i, e.cambios[i] | 0, true); }
  v.setInt32(0x88, e.porPulso, true); v.setInt32(0x90, e.numero | 0, true);
  const t1 = new Uint16Array(N), t2 = new Uint16Array(N), t3 = new Uint16Array(N);
  // en las simples los dos lados van iguales (como las _1 del disco); columna c = bit 9 - c
  const bits = (col) => (e.dosLados || e.doble ? [col] : [col, col + 5]).reduce((a, c) => a | (1 << (9 - c)), 0);
  for (const [r, m] of e.notas) if (r < N) for (let c = 0; c < 10; c++) if (m & (1 << c)) t1[r] |= bits(c);
  for (const l of e.largas) { const k = bits(l.col); for (let r = l.d; r <= Math.min(l.h, N - 1); r++) t1[r] |= k; if (l.d < N) t2[l.d] |= k; if (l.h < N) t3[l.h] |= k; }
  const sx = (m) => (m & 0x200 ? m | 0xFC00 : m) & 0xFFFF;   // el disco trae el signo extendido desde el bit 9
  for (let r = 0; r < N; r++) { v.setUint16(216 + 2 * r, sx(t1[r]), true); v.setUint16(216 + 2 * (N + r), sx(t2[r]), true); v.setUint16(216 + 2 * (2 * N + r), sx(t3[r]), true); }
  return b;
}
export const archivoDe = (e) => `${nn(e.cancion)}_${e.modo === 'DOUBLE' ? 'db' : (SUFIJO[e.modo] || 'h1')[0] + (e.versus ? '2' : '1')}.not`;

// ---------- abrir ----------
async function abrir(c, modo, versus, original = false) {
  parar();
  const archivo = archivoDe({ cancion: c.n, modo, versus });
  let p = null, edicion = false;
  // si hay "tu version" guardada en el juego se abre esa (O vuelve al original del disco)
  const tuya = original ? null : await leerEdicion(archivo);
  if (tuya) { try { p = leerPasos(archivo.toUpperCase(), tuya); edicion = true; } catch (e) { p = null; } }
  if (!p) try { p = leerPasos(archivo.toUpperCase(), await D.traer(D.DISCO + 'step/' + archivo)); } catch (e) { /* la cancion no trae ese modo: tabla vacia */ }
  armarTabla(c, modo, versus, p); ed.edicion = edicion;
  D.avisar(p ? `Abierto ${edicion ? 'TU VERSION de ' : ''}${archivo.toUpperCase()} (${p.notas.length + p.largas.length} flechas)${edicion ? ' - O = original' : ''}` : `${archivo.toUpperCase()} no existe: tabla nueva`);
}
function armarTabla(c, modo, versus, p) {
  ed = nueva(c, modo, p, versus);
  if (p) cargarDe(ed, p); else ed.largo = ed.porPulso * 64;
  // una _2 con los dos pads iguales llega con solo el izquierdo (leerPasos los junta): se repite en el derecho
  if (p && versus && ![...ed.notas.values()].some(m => m >> 5) && !ed.largas.some(l => l.col >= 5)) duplicarAlDerecho();
  // el cursor un compas antes de la primera flecha (si no, en muchas canciones se abre en una parte vacia)
  const primera = Math.min(...[...ed.notas.keys(), ...ed.largas.map(l => l.d)]);
  if (Number.isFinite(primera)) ed.cursor = Math.max(0, primera - ed.porPulso * 4 - (primera % ed.porPulso));
  fase = 'editar';
  cargarMusica(c.n);
}
function importar() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.not,.NOT';
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    if (f.size > 256 * 1024) { D.avisar('Ese archivo es demasiado grande para ser un .NOT'); return; }
    try {
      const p = leerPasos(f.name.toUpperCase(), new Uint8Array(await f.arrayBuffer()));
      const c = D.CANCIONES[elegir.i], v = variantes(c)[elegir.modo % variantes(c).length];
      const modo = p.tipo === 'doble' ? 'DOUBLE' : (v.modo === 'DOUBLE' ? 'HARD' : v.modo), versus = p.tipo !== 'doble' && (p.ladosDistintos || /_[NHX]2\.NOT$/i.test(f.name));
      ed = nueva(c, modo, p, versus); cargarDe(ed, p); fase = 'editar';
      D.avisar(`Importado ${f.name} sobre ${c.nombre}`); cargarMusica(c.n);
    } catch (e) { D.avisar('No es un .NOT que se pueda leer'); }
  };
  i.click();
}
// ---------- "tu version": los pasos editados de una cancion del disco quedan en el juego (Charles 20/10: "que de momento no
// se exporten, lo que genera ahi se genera en el juego; no borres la funcion, solo ocultala"). Van al almacenamiento del
// navegador/WebView de ese aparato (IndexedDB), nunca al servidor, y nunca reemplazan el .NOT original del disco ----------
function baseEdiciones() {
  return new Promise((ok, mal) => { const r = indexedDB.open('piu_editor', 1); r.onupgradeneeded = () => r.result.createObjectStore('pasos'); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
}
// En la PC y en la build de Edge van a la carpeta interna del juego, guardado\ediciones\ (Charles 20/10: "en la version
// pc y edge, que se guarden ahi en la carpeta interna del juego"); en la web, al almacenamiento del navegador.
const EDICIONES = () => new URL('../guardado/ediciones/', location.href).href;
// en la web van al hosting (api.php guardar_pasos / leer_pasos), sin acceso desde afuera, con la clave de este navegador;
// si no hay conexion, quedan en el navegador (IndexedDB)
function claveNavegador() {
  let k = null; try { k = localStorage.getItem('piu_clave_pasos'); } catch (e) { /* sin almacenamiento */ }
  if (!/^[a-f0-9]{32}$/.test(k || '')) { const b = crypto.getRandomValues(new Uint8Array(16)); k = [...b].map(v => v.toString(16).padStart(2, '0')).join(''); try { localStorage.setItem('piu_clave_pasos', k); } catch (e) { /* sin almacenamiento */ } }
  return k;
}
const aBase64 = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); };
async function apiPasos(cuerpo) { const r = await fetch(D.API, { method: 'POST', body: JSON.stringify({ ...cuerpo, clave: D.clave ? D.clave() : claveNavegador() }) }); const j = await r.json(); if (j.error) throw new Error(j.error); return j; }
async function leerEdicion(archivo) {
  if (puedeGuardar()) { try { const r = await fetch(EDICIONES() + archivo, { cache: 'no-store' }); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch (e) { return null; } }
  try { const j = await apiPasos({ accion: 'leer_pasos', archivo }); if (j.hay) return Uint8Array.from(atob(j.datos), c => c.charCodeAt(0)); } catch (e) { /* sin conexion: lo del navegador */ }
  try { const db = await baseEdiciones(); return await new Promise((ok) => { const q = db.transaction('pasos').objectStore('pasos').get(archivo); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; }
}
async function guardarEdicion() {
  try {
    const b = escribirNot(ed);
    let donde = 'en la carpeta del juego (guardado\\ediciones)';
    if (puedeGuardar()) { const r = await fetch(EDICIONES() + archivoDe(ed), { method: 'PUT', body: b }); if (!r.ok) throw new Error('el juego no lo acepto (' + r.status + ')'); }
    else {
      try { await apiPasos({ accion: 'guardar_pasos', archivo: archivoDe(ed), datos: aBase64(b) }); donde = 'en el juego (hosting)'; }
      catch (er) { donde = 'en este navegador (sin conexion: ' + er.message + ')'; }
      const db = await baseEdiciones(); await new Promise((ok, mal) => { const t = db.transaction('pasos', 'readwrite'); t.objectStore('pasos').put(b, archivoDe(ed)); t.oncomplete = ok; t.onerror = () => mal(t.error); });
    }
    ed.cambiado = false; ed.edicion = true;
    D.avisar(`Guardada tu version de ${archivoDe(ed).toUpperCase()} ${donde}. El original del disco no se toca`);
  } catch (e) { D.avisar('No se pudo guardar: ' + e.message); }
}
// OCULTA por ahora (pedido de Charles): bajar el .NOT como archivo. No tiene tecla ni boton; queda para mas adelante.
function exportar() {
  const b = new Blob([escribirNot(ed)], { type: 'application/octet-stream' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = archivoDe(ed).toUpperCase(); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  ed.cambiado = false; D.avisar(`Exportado ${a.download}`);
}

// ---------- EDITS DE LA COMUNIDAD (Charles 20/10: "cada uno cree un edit de la cancion, se puedan ver e incluso jugar,
// pero solo eso, que el creador pueda borrar o modificar su version"). U publica la tabla abierta (api.php
// comunidad_publicar: el servidor la rearma desde cero). En la lista: VER (la grilla en solo ver), JUGAR, y si es tuyo
// MODIFICAR o BORRAR. El dueño es la clave de este aparato (online.js claveDueno). Solo canciones del disco ----------
const com = { lista: [], i: 0, cargando: false, todas: false, borrar: null, error: '' };
const contarFlechas = () => [...ed.notas.values()].reduce((a, m) => a + popc(m), 0) + ed.largas.length;
function deArchivo(a) { const m = /^(\d\d)_(db|([nhx])([12]))\.not$/.exec(a) || []; return { cancion: +m[1], modo: m[2] === 'db' ? 'DOUBLE' : { n: 'NORMAL', h: 'HARD', x: 'CRAZY' }[m[3]], versus: m[4] === '2' }; }
const cancionDe = (n) => D.CANCIONES.find(c => c.n === n);
async function abrirComunidad() {
  parar(); fase = 'comunidad'; com.cargando = true; com.borrar = null; com.error = '';
  const actual = lista()[elegir.i % lista().length];
  try {
    const j = await apiPasos({ accion: 'comunidad_lista', cancion: com.todas || !actual || actual.propia ? 0 : actual.n });
    com.lista = j.edits.filter(e => cancionDe(e.cancion)); com.i = Math.min(com.i, Math.max(0, com.lista.length - 1));
  } catch (e) { com.lista = []; com.error = 'NO SE PUDO LEER LA COMUNIDAD: ' + e.message.toUpperCase(); }
  com.cargando = false;
}
async function traerEdit(e) { const j = await apiPasos({ accion: 'comunidad_leer', id: e.id }); return { ...j, bytes: Uint8Array.from(atob(j.datos), c => c.charCodeAt(0)) }; }
// VER (solo mirar y escuchar) o, si es tuyo, MODIFICAR: se abre en la grilla con lo que guarda el servidor
async function abrirEdit(e, modificar) {
  try {
    const j = await traerEdit(e), v = deArchivo(j.archivo), c = cancionDe(v.cancion);
    armarTabla(c, v.modo, v.versus, leerPasos(j.archivo.toUpperCase(), j.bytes));
    ed.comunidad = { id: j.id, nick: j.nick, mio: j.mio }; ed.desdeLista = true;
    if (!(modificar && j.mio)) ed.soloVer = { nick: j.nick };
    D.avisar(ed.soloVer ? `Edit de ${j.nick}: solo ver y jugar (P)` : `Tu edit: cambialo y publicalo otra vez con U`);
  } catch (er) { D.avisar('No se pudo abrir: ' + er.message); fase = 'comunidad'; }
}
let vueltaDePrueba = null;
async function jugarEdit(e) {
  try { const j = await traerEdit(e), v = deArchivo(j.archivo); parar(); vueltaDePrueba = 'comunidad'; D.probar({ ...v }, j.bytes); }
  catch (er) { D.avisar('No se pudo traer: ' + er.message); }
}
async function borrarEdit(e) {
  if (com.borrar !== e.id) { com.borrar = e.id; D.avisar('SUPR otra vez para borrarlo de la comunidad'); setTimeout(() => { if (com.borrar === e.id) com.borrar = null; }, 3000); return; }
  try { await apiPasos({ accion: 'comunidad_borrar', id: e.id }); D.avisar('Borrado de la comunidad'); abrirComunidad(); } catch (er) { D.avisar('No se pudo borrar: ' + er.message); }
}
async function publicar() {
  if (ed.propia) { D.avisar('Las canciones propias no se publican: los demas no tienen esa musica'); return; }
  if (!cancionDe(ed.cancion)) { D.avisar('Solo se publican pasos de canciones del disco'); return; }
  let nick = (D.nick && D.nick()) || '';
  if (!nick) { const v = prompt('TU NOMBRE (ASI TE VEN EN LA COMUNIDAD):', ''); if (!v || !v.trim()) return; nick = v.trim().slice(0, 16); }
  try {
    const j = await apiPasos({ accion: 'comunidad_publicar', id: ed.comunidad && ed.comunidad.mio ? ed.comunidad.id : '', nick, pin: D.pin ? D.pin() : '', archivo: archivoDe(ed), datos: aBase64(escribirNot(ed)), flechas: contarFlechas() });
    if (D.fijarNick && !(D.nick && D.nick())) D.fijarNick(nick);
    ed.comunidad = { id: j.id, nick, mio: true };
    D.avisar(`Publicado como ${nick}: los demas lo ven y lo juegan; solo vos lo cambias o lo borras`, 5);
  } catch (e) { D.avisar('No se pudo publicar: ' + e.message); }
}
function dibujarComunidad(x) {
  const { texto, caja } = D, actual = lista()[elegir.i % lista().length];
  caja(24, 24, 592, 432, 0.85);
  texto(x, 'PASOS DE LA COMUNIDAD', 320, 34, 2.4, 'amarillo', true);
  texto(x, com.todas || !actual || actual.propia ? '< TODAS LAS CANCIONES >' : `< ${actual.nombre} >`, 320, 72, 1.4, 'celeste', true);
  if (com.cargando) { texto(x, 'CARGANDO...', 320, 220, 2, 'blanco', true); return; }
  if (com.error) { texto(x, com.error.slice(0, 70), 320, 220, 1, 'rojo', true); }
  else if (!com.lista.length) { texto(x, 'TODAVIA NO HAY EDITS PUBLICADOS', 320, 200, 1.6, 'blanco', true); texto(x, 'ABRI UNA CANCION, HACELE LOS PASOS Y APRETA U PARA PUBLICARLA', 320, 232, 1, 'gris', true); }
  const VIS = 13, desde = Math.max(0, Math.min(com.i - 6, com.lista.length - VIS));
  com.lista.slice(desde, desde + VIS).forEach((e, k) => {
    const i = desde + k, y = 100 + k * 23, v = deArchivo(e.archivo), sel = i === com.i;
    if (sel) { x.fillStyle = 'rgba(95,208,255,.22)'; x.fillRect(36, y - 3, 568, 21); }
    texto(x, (cancionDe(e.cancion) || {}).nombre.slice(0, 16), 44, y, 1, sel ? 'amarillo' : 'blanco');
    texto(x, (v.modo + (v.versus ? ' VS' : '')).slice(0, 9), 186, y, 1, 'celeste');
    texto(x, e.nick.slice(0, 16), 270, y, 1, e.mio ? 'verde' : 'blanco');
    texto(x, e.fecha.slice(5), 410, y, 1, 'gris');
    texto(x, `${e.flechas} FL`, 466, y, 1, 'gris');
    if (e.mio) texto(x, 'TUYO', 548, y, 1, 'verde');
  });
  const e = com.lista[com.i];
  texto(x, esTactil ? 'TOCAR UNA FILA = ELEGIR' : 'ARRIBA/ABAJO = ELEGIR   IZQ/DER = ESTA CANCION O TODAS', 320, 404, 1, 'gris', true);
  texto(x, esTactil ? '' : `ENTER = VER   P = JUGAR${e && e.mio ? '   M = MODIFICAR   SUPR = BORRAR' : ''}   ESC = VOLVER`, 320, 420, 1, 'amarillo', true);
  texto(x, 'SOLO QUIEN HIZO UN EDIT LO PUEDE CAMBIAR O BORRAR', 320, 438, 1, 'celeste', true);
  botonesComunidad(x, e);
}
// botones (dedo y mouse) de la lista
const botonesCom = (e) => [['VER', () => e && abrirEdit(e, false)], ['JUGAR', () => e && jugarEdit(e)], ...(e && e.mio ? [['MODIFICAR', () => abrirEdit(e, true)], ['BORRAR', () => borrarEdit(e)]] : []), ['VOLVER', () => { fase = 'elegir'; }]];
function botonesComunidad(x, e) { if (!esTactil) return; botonesCom(e).forEach(([s], i) => { D.caja(30 + i * 118, 452, 110, 24, 0.9); D.texto(x, s, 85 + i * 118, 457, 1, 'amarillo', true); }); }
function tocarComunidad(px, py) {
  if (esTactil && py >= 452 && py <= 476) { const i = Math.floor((px - 30) / 118), b = botonesCom(com.lista[com.i]); if (i >= 0 && i < b.length) b[i][1](); return true; }
  if (py >= 97 && py < 97 + 13 * 23) { const desde = Math.max(0, Math.min(com.i - 6, com.lista.length - 13)), i = desde + Math.floor((py - 97) / 23); if (i < com.lista.length) com.i = i; return true; }
  return false;
}
function teclaComunidad(k) {
  const e = com.lista[com.i];
  if (['ArrowUp', 'KeyQ', 'Numpad7', 'KeyE', 'Numpad9'].includes(k)) com.i = Math.max(0, com.i - 1);
  else if (['ArrowDown', 'KeyZ', 'Numpad1', 'KeyC', 'Numpad3'].includes(k)) com.i = Math.min(com.lista.length - 1, com.i + 1);
  else if (k === 'ArrowLeft' || k === 'ArrowRight') { com.todas = !com.todas; com.i = 0; abrirComunidad(); }
  else if (e && (k === 'Enter' || k === 'NumpadEnter' || k === 'KeyS' || k === 'Numpad5')) abrirEdit(e, false);
  else if (e && k === 'KeyP') jugarEdit(e);
  else if (e && e.mio && k === 'KeyM') abrirEdit(e, true);
  else if (e && e.mio && (k === 'Delete' || k === 'Backspace')) borrarEdit(e);
  else if (k === 'Escape') fase = 'elegir';
  return true;
}

// ---------- musica, metronomo y claps ----------
let musica = null, fuente = null, sonando = false, inicioCtx = 0, inicioSeg = 0, ultimaFilaSonada = -1;
async function cargarMusica(n) {
  musica = null;
  try {
    const mp3 = descifrarAudio(await D.traer(D.DISCO + `audio/${nn(n)}.aud`), D.R.llave), ctx = D.audio();
    if (mp3) musica = await ctx.decodeAudioData(mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength));
  } catch (e) { D.avisar('No pude cargar la musica'); }
}
function tocar() {
  const ctx = D.audio(); parar();
  inicioSeg = Math.max(0, segFila(ed.cursor)); inicioCtx = ctx.currentTime + 0.05; ultimaFilaSonada = ed.cursor - 1;
  if (musica) { fuente = ctx.createBufferSource(); fuente.buffer = musica; fuente.connect(ctx.destination); fuente.start(inicioCtx, inicioSeg); }
  sonando = true;
}
function parar() { if (fuente) { try { fuente.stop(); } catch (e) { /* ya parada */ } fuente = null; } sonando = false; }
function bip(f, d = 0.04, vol = 0.25) { const ctx = D.audio(), o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = vol; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + d); }
let metronomo = true, claps = true;
function seguirSonido() {
  if (!sonando) return;
  const t = D.audio().currentTime - inicioCtx + inicioSeg, f = Math.floor(filaSeg(t));
  for (let r = ultimaFilaSonada + 1; r <= f; r++) {
    if (metronomo && r % ed.porPulso === 0) bip(r % (ed.porPulso * 4) === 0 ? 1320 : 880);
    if (claps && (ed.notas.get(r) || ed.largas.some(l => l.d === r))) bip(2200, 0.02, 0.35);
  }
  ultimaFilaSonada = Math.max(ultimaFilaSonada, f);
  ed.cursor = Math.max(0, f);
  if (f > ed.largo) parar();
}

// ---------- dibujo ----------
const AREA = { x: 210, y: 40, alto: 400 };                    // la grilla; la fila del cursor queda a 1/3 de arriba
function anchoCol() { return ed.cols === 10 ? 34 : 52; }
function dibujarFlecha(x, col, px, py, t) {
  const R = D.R, k = col % 5, img = k === 2 ? R.arrow03 : R.arrow01; if (!img) return;
  x.save(); x.translate(px + t / 2, py + t / 2);
  const ex = k === 3 || k === 4 ? -1 : 1, ey = k === 0 || k === 4 ? -1 : 1;
  x.scale(ex, ey);
  if (k === 2) x.drawImage(img, 2, 142, 66, 66, -t / 2, -t / 2, t, t);
  else if (k === 1 || k === 3) x.drawImage(img, 2, 72, 66, 66, -t / 2, -t / 2, t, t);
  else x.drawImage(img, 142, 142, 66, 66, -t / 2, -t / 2, t, t);
  x.restore();
}
export function dibujarEditor(x, t) {
  const { texto, caja } = D;
  if (fase === 'elegir') return dibujarElegir(x, t);
  if (fase === 'nueva') return dibujarNueva(x);
  if (fase === 'comunidad') return dibujarComunidad(x);
  seguirSonido();
  const w = anchoCol(), ancho = w * ed.cols, x0 = 420 - ancho / 2, zoom = ed.zoom;
  const filaY = (r) => AREA.y + AREA.alto / 3 + (r - ed.cursor) * zoom;
  caja(x0 - 8, AREA.y - 4, ancho + 16, AREA.alto + 8, 0.7);
  x.save(); x.beginPath(); x.rect(x0 - 8, AREA.y - 4, ancho + 16, AREA.alto + 8); x.clip();
  const desde = Math.max(0, Math.floor(ed.cursor - AREA.alto / 3 / zoom) - 2), hasta = Math.ceil(ed.cursor + AREA.alto * 2 / 3 / zoom) + 2;
  // seleccion
  if (ed.sel) { const a = Math.min(ed.sel.a, ed.sel.b), b = Math.max(ed.sel.a, ed.sel.b); x.fillStyle = 'rgba(95,208,255,.18)'; x.fillRect(x0, filaY(a), ancho, (b - a + 1) * zoom); }
  // lineas de fila, pulso y compas
  for (let r = desde; r <= hasta; r++) {
    const y = filaY(r), pulso = r % ed.porPulso === 0, compas = r % (ed.porPulso * 4) === 0;
    if (!pulso && zoom < 8) continue;
    x.fillStyle = compas ? 'rgba(255,210,63,.8)' : pulso ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.08)';
    x.fillRect(x0, y, ancho, compas ? 2 : 1);
    if (compas) texto(x, String(r / ed.porPulso / 4 + 1), x0 + 3, y + 3, 1, 'amarillo');
  }
  for (let c = 1; c < ed.cols; c++) { x.fillStyle = c === 5 ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.12)'; x.fillRect(x0 + c * w, AREA.y, 1, AREA.alto); }
  // largas y notas
  const tf = Math.min(w - 4, Math.max(14, zoom * 1.6));
  for (const l of ed.largas) {
    if (l.h < desde || l.d > hasta) continue;
    const px = x0 + l.col * w + w / 2, y1 = filaY(l.d) + zoom / 2, y2 = filaY(l.h) + zoom / 2;
    x.fillStyle = (l.col % 5) === 2 ? 'rgba(255,190,60,.55)' : (l.col % 5) === 1 || (l.col % 5) === 3 ? 'rgba(255,80,80,.55)' : 'rgba(80,140,255,.55)';
    x.fillRect(px - tf * 0.3, y1, tf * 0.6, y2 - y1);
    dibujarFlecha(x, l.col, px - tf / 2, y1 - tf / 2, tf); dibujarFlecha(x, l.col, px - tf / 2, y2 - tf / 2, tf * 0.7);
  }
  for (let r = desde; r <= hasta; r++) {
    const m = ed.notas.get(r); if (!m) continue;
    for (let c = 0; c < ed.cols; c++) if (m & (1 << c)) dibujarFlecha(x, c, x0 + c * w + w / 2 - tf / 2, filaY(r) + zoom / 2 - tf / 2, tf);
  }
  // cursor (fila y columna) y largas a medio poner
  const yc = filaY(ed.cursor);
  x.fillStyle = sonando ? 'rgba(125,255,122,.9)' : 'rgba(255,210,63,.9)'; x.fillRect(x0 - 6, yc, ancho + 12, 2);
  if (!sonando) { x.strokeStyle = 'rgba(255,210,63,.9)'; x.lineWidth = 2; x.strokeRect(x0 + ed.col * w + 1, yc - zoom / 2 + zoom / 2 - tf / 2, w - 2, tf); }
  for (const [c, d] of Object.entries(ed.largaAbierta)) { x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(x0 + c * w + w * 0.3, filaY(d), w * 0.4, (ed.cursor - d) * zoom); }
  x.restore();
  // panel de la izquierda: datos y teclas
  caja(8, 40, 186, 400, 0.7);
  const seg = Math.max(0, segFila(ed.cursor)), mm = Math.floor(seg / 60), ss = (seg % 60).toFixed(2).padStart(5, '0');
  const lin = ed.soloVer ? [
    [ed.nombre.slice(0, 22), 'blanco'], [`${ed.modo}${ed.versus ? ' VERSUS' : ''}`, 'celeste'], [`BPM ${ed.bpms[0]}`, 'amarillo'],
    [`TIEMPO ${mm}:${ss}  COMPAS ${Math.floor(ed.cursor / ed.porPulso / 4) + 1}`, 'blanco'], [`FLECHAS ${contarFlechas()}`, 'verde'], ['', 'gris'],
    ['EDIT DE LA COMUNIDAD', 'amarillo'], [`HECHO POR ${ed.soloVer.nick}`.slice(0, 22), 'verde'], ['SOLO VER Y JUGAR', 'gris'], ['(SOLO QUIEN LO HIZO', 'gris'], [' LO CAMBIA)', 'gris'], ['', 'gris'],
    ...(esTactil ? [] : [['FLECHAS / RUEDA = MOVER', 'gris'], ['+/- = ZOOM', 'gris'], ['ESPACIO = ESCUCHAR', 'gris'], ['P = JUGARLO', 'amarillo'], [`T PRACTICAR ${Math.round(velocidadPractica * 100)}% [ ]`, 'verde'], ['ESC = VOLVER A LA LISTA', 'gris']]),
  ] : [
    [ed.nombre.slice(0, 22), 'blanco'], [`${ed.modo}${ed.versus ? ' VERSUS' : ''}  ${archivoDe(ed).toUpperCase()}`, 'celeste'],
    [`BPM ${ed.bpms[0]}   DESFASE ${ed.valores[0]}`, 'amarillo'], [`FILAS/PULSO ${ed.porPulso}  AJUSTE 1/${ed.porPulso / ed.snap}`, 'gris'],
    [`TIEMPO ${mm}:${ss}  COMPAS ${Math.floor(ed.cursor / ed.porPulso / 4) + 1}`, 'blanco'],
    [`FLECHAS ${[...ed.notas.values()].reduce((a, m) => a + popc(m), 0) + ed.largas.length}${ed.cambiado ? '  (SIN GUARDAR)' : ''}`, ed.cambiado ? 'rojo' : 'verde'], ['', 'gris'],
    ...(esTactil ? [['TOCAR LA GRILLA = FLECHA', 'gris'], ['ARRASTRAR = LARGA', 'gris'], ['BOTONES DE ABAJO', 'gris']]
      : [['ZQSEC / NUMERICO = FLECHA', 'gris'], ['SHIFT+TECLA = LARGA', 'gris'], ['FLECHAS = MOVER  RUEDA', 'gris'], ['RE/AV PAG = COMPAS', 'gris'], ['TAB = AJUSTE  +/- = ZOOM', 'gris'],
        ['ESPACIO = ESCUCHAR', 'gris'], ['M = METRONOMO  K = CLAPS', 'gris'], ['SHIFT+FLECHAS = ELEGIR', 'gris'], ['CTRL C/V/X = COPIAR', 'gris'], ['CTRL Z/Y = DESHACER', 'gris'],
        ['F = ESPEJO  SUPR = BORRAR', 'gris'], ['V = VERSUS (2 JUGADORES)', 'gris'], ['B = BPM  D = DESFASE', 'gris'], [`P PROBAR T PRACT.${Math.round(velocidadPractica * 100)}%`, 'amarillo'], ['G = GUARDAR EN EL JUEGO', 'amarillo'], ...(ed.propia ? [] : [[ed.comunidad && ed.comunidad.mio ? 'U = ACTUALIZAR TU EDIT' : 'U = PUBLICAR', 'verde']]), ['I = IMPORTAR .NOT', 'amarillo'], ['O = ORIGINAL ESC=SALIR', 'gris']]),
  ];
  lin.forEach(([s, c], i) => texto(x, s, 16, 50 + i * 15.5, 1, c));
  if (esTactil) botonesTactiles(x);
  texto(x, 'EDITOR DE PASOS', 420, 12, 2, 'amarillo', true);
}
const popc = (m) => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
function dibujarElegir(x, t) {
  const { texto, caja, R } = D, L = lista(), c = L[elegir.i % L.length], vs = variantes(c), modo = nombreVariante(vs[elegir.modo % vs.length]);
  caja(60, 30, 520, 420, 0.8);
  texto(x, 'EDITOR DE PASOS', 320, 44, 3, 'amarillo', true);
  const portada = R.caratulas[c.n] || portadasPropias.get(c.n); if (portada) x.drawImage(portada, 200, 100, 240, 180);
  if (c.propia) texto(x, 'CANCION PROPIA ' + c.n, 320, 84, 1, 'verde', true);
  texto(x, c.nombre, 320, 292, 2, 'blanco', true);
  texto(x, `< ${modo} >`, 320, 326, 2, 'celeste', true);
  texto(x, esTactil ? 'IZQ/DER = CANCION  ARRIBA = MODO  CENTRO = ABRIR' : 'IZQ/DER = CANCION   ARRIBA/ABAJO = MODO   ENTER = ABRIR', 320, 370, 1, 'gris', true);
  texto(x, esTactil ? '' : (puedeGuardar() ? 'N = CANCION NUEVA (TU MP3)   ' : '') + 'I = IMPORTAR UN .NOT   ESC = VOLVER', 320, 390, 1, puedeGuardar() ? 'verde' : 'gris', true);
  texto(x, esTactil ? '' : 'U = PASOS DE LA COMUNIDAD (VER Y JUGAR LOS EDITS DE OTROS)', 320, 406, 1, 'amarillo', true);
  texto(x, 'SE GUARDA EN EL JUEGO COMO TU VERSION (EL DISCO NO SE TOCA)', 320, 424, 1, 'celeste', true);
  if (esTactil) { D.caja(220, 440, 200, 30, 0.9); D.texto(x, 'COMUNIDAD', 320, 448, 1.4, 'amarillo', true); }
}

// ---------- teclado ----------
export function teclaEditor(k, e) {
  if (fase === 'nueva') return teclaNueva(k, e);
  if (fase === 'comunidad') return teclaComunidad(k);
  if (fase === 'elegir') {
    const L = lista(), c = L[elegir.i % L.length], vs = variantes(c);
    if (k === 'ArrowLeft' || k === 'KeyZ' || k === 'Numpad1') { elegir.i = (elegir.i + L.length - 1) % L.length; elegir.modo = 0; }
    else if (k === 'ArrowRight' || k === 'KeyC' || k === 'Numpad3') { elegir.i = (elegir.i + 1) % L.length; elegir.modo = 0; }
    else if (k === 'ArrowUp' || k === 'KeyQ' || k === 'Numpad7') elegir.modo = (elegir.modo + vs.length - 1) % vs.length;
    else if (k === 'ArrowDown' || k === 'KeyE' || k === 'Numpad9') elegir.modo = (elegir.modo + 1) % vs.length;
    else if (k === 'Enter' || k === 'KeyS' || k === 'Numpad5' || k === 'NumpadEnter') { const v = vs[elegir.modo % vs.length]; if (c.propia) abrirPropia(c.propia, v.modo, v.versus); else abrir(c, v.modo, v.versus); }
    else if (k === 'KeyN' && puedeGuardar()) abrirNueva();
    else if (k === 'KeyI') importar();
    else if (k === 'KeyU') abrirComunidad();
    else if (k === 'Escape') D.salir();
    return true;
  }
  const paso = ed.snap, ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey;
  // el edit de otro: solo mirar, escuchar y jugar
  if (ed.soloVer) {
    if (k === 'Escape') { parar(); ed = null; abrirComunidad(); return true; }
    if (ctrl || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', 'Tab', 'Equal', 'NumpadAdd', 'Minus', 'NumpadSubtract', 'Space', 'KeyM', 'KeyK', 'KeyP', 'KeyT', 'BracketLeft', 'BracketRight'].includes(k)) {
      if (!['ShiftLeft', 'ShiftRight'].includes(k)) D.avisar(`Es el edit de ${ed.soloVer.nick}: solo se mira y se juega (P)`);
      return true;
    }
    if (k === 'KeyP') { vueltaDePrueba = 'editar'; }
  }
  const mover = (n) => { if (sonando) parar(); const antes = ed.cursor; ed.cursor = Math.max(0, ed.cursor + n); if (shift) ed.sel = { a: ed.sel ? ed.sel.a : antes, b: ed.cursor }; else ed.sel = null; };
  const rango = () => (ed.sel ? [Math.min(ed.sel.a, ed.sel.b), Math.max(ed.sel.a, ed.sel.b)] : [ed.cursor, ed.cursor]);
  if (k in TECLA_COL && !ctrl) {
    const col = TECLA_COL[k]; if (col >= ed.cols) return true;
    ed.col = col;
    if (shift) {                                    // larga: primera vez empieza, segunda termina
      if (ed.largaAbierta[col] !== undefined) { ponerLarga(col, ed.largaAbierta[col], ed.cursor); delete ed.largaAbierta[col]; }
      else ed.largaAbierta[col] = ed.cursor;
    } else alternar(ed.cursor, col);
  }
  else if (k === 'ArrowDown') mover(paso); else if (k === 'ArrowUp') mover(-paso);
  else if (k === 'ArrowLeft') ed.col = Math.max(0, ed.col - 1); else if (k === 'ArrowRight') ed.col = Math.min(ed.cols - 1, ed.col + 1);
  else if (k === 'PageDown') mover(ed.porPulso * 4); else if (k === 'PageUp') mover(-ed.porPulso * 4);
  else if (k === 'Home') mover(-ed.cursor); else if (k === 'End') mover(ed.largo - ed.cursor);
  else if (k === 'Enter' || k === 'NumpadEnter') alternar(ed.cursor, ed.col);
  else if (k === 'Tab') { e.preventDefault(); const ops = [ed.porPulso, ed.porPulso / 2, 1].filter((v, i, a) => v >= 1 && Number.isInteger(v) && a.indexOf(v) === i); ed.snap = ops[(ops.indexOf(ed.snap) + 1) % ops.length]; ed.cursor -= ed.cursor % ed.snap; }
  else if (k === 'Equal' || k === 'NumpadAdd') ed.zoom = Math.min(40, ed.zoom + 2); else if (k === 'Minus' || k === 'NumpadSubtract') ed.zoom = Math.max(4, ed.zoom - 2);
  else if (k === 'Space') { e.preventDefault(); if (sonando) parar(); else tocar(); }
  else if (k === 'KeyM') { metronomo = !metronomo; D.avisar('Metronomo ' + (metronomo ? 'SI' : 'NO')); }
  else if (k === 'KeyK') { claps = !claps; D.avisar('Claps ' + (claps ? 'SI' : 'NO')); }
  else if (ctrl && k === 'KeyZ') volver(ed.deshacer, ed.rehacer); else if (ctrl && k === 'KeyY') volver(ed.rehacer, ed.deshacer);
  else if (ctrl && k === 'KeyC') copiar(...rango()); else if (ctrl && k === 'KeyX') { copiar(...rango()); borrarRango(...rango()); }
  else if (ctrl && k === 'KeyV') pegar(ed.cursor);
  else if (k === 'Delete' || k === 'Backspace') borrarRango(...rango());
  else if (k === 'KeyF') espejo(...rango());
  else if (k === 'KeyV') {                          // pasar a VERSUS (o, si ya es, copiar el pad izquierdo al derecho)
    if (ed.doble) D.avisar('DOUBLE ya usa los dos pads');
    else { guardarDeshacer(); if (!ed.versus) { ed.versus = true; ed.dosLados = true; ed.cols = 10; } duplicarAlDerecho(); D.avisar(`VERSUS: el pad derecho (jugador 2) quedo igual al izquierdo; cambialo para armar la coreo. Se exporta como ${archivoDe(ed).toUpperCase()}`); }
  }
  else if (k === 'KeyB') pedirNumero('BPM', ed.bpms[0], (v) => { if (v > 20 && v < 600) { guardarDeshacer(); ed.bpms[0] = v; } });
  else if (k === 'KeyD') pedirNumero('DESFASE (CENTESIMAS)', ed.valores[0], (v) => { if (Math.abs(v) < 100000) { guardarDeshacer(); ed.valores[0] = Math.round(v); } });
  else if (k === 'KeyP') { parar(); D.probar(ed, escribirNot(ed)); }
  else if (k === 'KeyG') { if (ed.propia) guardarPasosPropia(); else guardarEdicion(); }
  else if (k === 'KeyU') publicar();
  else if (k === 'KeyT') practicar();
  else if (k === 'BracketLeft' || k === 'BracketRight') { velocidadPractica = Math.max(0.5, Math.min(1, Math.round((velocidadPractica + (k === 'BracketLeft' ? -0.1 : 0.1)) * 10) / 10)); D.avisar(`Practica al ${Math.round(velocidadPractica * 100)}%`); }
  else if (k === 'KeyO' && !ed.propia) { const c = lista().find(s => s.n === ed.cancion); if (c) abrir(c, ed.modo, ed.versus, true).then(() => D.avisar('Abierto el original del disco (tu version sigue guardada hasta que guardes con G)')); }
  else if (k === 'KeyI') importar();
  else if (k === 'Escape') { if (sonando) parar(); else if (ed.cambiado && !confirmarSalir) { confirmarSalir = true; D.avisar('Hay cambios sin guardar: ESC otra vez para salir igual'); setTimeout(() => { confirmarSalir = false; }, 3000); } else if (ed.desdeLista) abrirComunidad(); else { fase = 'elegir'; } }
  return true;
}
let confirmarSalir = false;
// ---------- PRACTICA (mejora 13, Charles 20/10: "mas lento, repetir un tramo") ----------
// T practica lo elegido con Shift (o 8 compases desde el cursor) a la velocidad de [ ] (50 a 100 %), y se repite solo
// hasta Esc (online.js probarPasos). Se arma un .NOT con solo ese tramo y los tiempos corridos para que empiece a los
// 2 s; la musica arranca ahi mismo de la cancion y mas lenta (principal.js), y el reloj del juego la sigue.
let velocidadPractica = 0.8;
function practicar() {
  parar();
  const a = ed.sel ? Math.min(ed.sel.a, ed.sel.b) : ed.cursor, b = ed.sel ? Math.max(ed.sel.a, ed.sel.b) : ed.cursor + ed.porPulso * 4 * 8;
  const T0 = Math.max(0, segFila(a) - 2);
  const copia = { ...ed, notas: new Map([...ed.notas].filter(([r]) => r >= a && r <= b)), largas: ed.largas.filter((l) => l.d >= a && l.h <= b),
    valores: ed.valores.map((v) => Math.round(v - T0 * 100)), cambios: ed.cambios.map((c) => (c ? Math.max(1, Math.round(c - T0 * 100)) : 0)), largo: b + ed.porPulso * 4 };
  if (!copia.notas.size && !copia.largas.length) { D.avisar('En ese tramo no hay flechas: elegi otro (Shift + flechas)'); return; }
  vueltaDePrueba = 'editar';
  D.probar(copia, escribirNot(copia), { desde: T0, velocidad: velocidadPractica });
}
function pedirNumero(que, actual, hecho) { const v = prompt(`${que}:`, String(actual)); if (v !== null && v.trim() !== '' && !isNaN(+v)) hecho(+v); }

// ---------- mouse y dedo: tocar una celda pone o saca la flecha; arrastrar hacia abajo hace una larga ----------
let arrastre = null;
function aGrilla(ev) {
  const r = D.lienzo.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * 640, py = (ev.clientY - r.top) / r.height * 480;
  const w = anchoCol(), x0 = 420 - (w * ed.cols) / 2, col = Math.floor((px - x0) / w);
  const fila = Math.round((ed.cursor + (py - AREA.y - AREA.alto / 3) / ed.zoom) / ed.snap) * ed.snap;
  return { px, py, col, fila, dentro: col >= 0 && col < ed.cols && py >= AREA.y && py <= AREA.y + AREA.alto };
}
function puntero(ev) {
  if (!D || D.pantalla() !== 'editor') return;
  if (ev.type === 'pointerdown' && (fase === 'comunidad' || fase === 'elegir')) {
    const r = D.lienzo.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * 640, py = (ev.clientY - r.top) / r.height * 480;
    if (fase === 'comunidad' && tocarComunidad(px, py)) ev.preventDefault();
    else if (fase === 'elegir' && esTactil && py >= 440 && py <= 470 && px >= 220 && px <= 420) { ev.preventDefault(); abrirComunidad(); }
    return;
  }
  if (fase !== 'editar' || !ed) return;
  const g = aGrilla(ev);
  if (ev.type === 'pointerdown') {
    if (esTactil && tocarBoton(g.px, g.py)) { ev.preventDefault(); return; }
    if (!g.dentro || ed.soloVer) return;
    ev.preventDefault(); arrastre = { col: g.col, fila: g.fila, y: ev.clientY, boton: ev.button };
  } else if (ev.type === 'pointerup' && arrastre) {
    ev.preventDefault();
    const a = arrastre; arrastre = null;
    if (a.boton === 2) { borrarRango(g.fila, g.fila); return; }
    if (Math.abs(ev.clientY - a.y) > 12 && g.fila !== a.fila) ponerLarga(a.col, a.fila, g.fila);
    else alternar(a.fila, a.col);
    ed.col = a.col;
  } else if (ev.type === 'pointermove' && !arrastre && ev.buttons === 0 && g.dentro) { /* solo mirar */ }
}
addEventListener('wheel', (ev) => { if (!D || D.pantalla() !== 'editor' || fase !== 'editar' || !ed) return; ev.preventDefault(); if (sonando) parar(); ed.cursor = Math.max(0, ed.cursor + Math.sign(ev.deltaY) * ed.snap * (ev.shiftKey ? 4 : 1)); }, { passive: false });
addEventListener('contextmenu', (ev) => { if (D && D.pantalla() === 'editor') ev.preventDefault(); });

// ---------- celular: botones abajo de la grilla ----------
const salirDeGrilla = () => { parar(); if (ed.soloVer || ed.desdeLista) { ed = null; abrirComunidad(); } else fase = 'elegir'; };
const BOTONES_COMUNES = [['ARRIBA', () => { if (sonando) parar(); ed.cursor = Math.max(0, ed.cursor - ed.snap * 4); }], ['ABAJO', () => { if (sonando) parar(); ed.cursor += ed.snap * 4; }],
  ['ESCUCHAR', () => (sonando ? parar() : tocar())]];
const botones = () => (ed.soloVer ? [...BOTONES_COMUNES, ['JUGAR', () => { parar(); vueltaDePrueba = 'editar'; D.probar(ed, escribirNot(ed)); }], ['PRACT.', practicar], ['VOLVER', salirDeGrilla]]
  : [...BOTONES_COMUNES, ['DESHACER', () => volver(ed.deshacer, ed.rehacer)], ['PROBAR', () => { parar(); D.probar(ed, escribirNot(ed)); }], ['PRACT.', practicar], ['GUARDAR', () => (ed.propia ? guardarPasosPropia() : guardarEdicion())],
    ...(ed.propia ? [] : [['PUBLICAR', publicar]]), ['SALIR', salirDeGrilla]]);
function botonesTactiles(x) { const b = botones(), w = 624 / b.length; b.forEach(([s], i) => { D.caja(8 + i * w, 446, w - 6, 28, 0.85); D.texto(x, s, 8 + i * w + (w - 6) / 2, 454, 1, 'amarillo', true); }); }
function tocarBoton(px, py) { if (py < 446 || py > 474) return false; const b = botones(), i = Math.floor((px - 8) / (624 / b.length)); if (i < 0 || i >= b.length) return false; b[i][1](); return true; }
// la prueba termino (o se salio con Esc): volver a la grilla tal cual (o a la lista de la comunidad, si se jugo desde ahi)
export function volverDePrueba() { fase = vueltaDePrueba || (ed ? 'editar' : 'elegir'); vueltaDePrueba = null; }

// =====================================================================================================================
// CANCIONES NUEVAS (EDITOR_MASTER.md etapa 2): solo en la PC y en la build de Edge, que tienen donde guardar
// (guardado\canciones\ en sus servidores, numeros 82-99). Se arman igual que las del disco: .AUD = MP3 con Adler-32 y la
// llave del exe, .PNZ = PNG igual, vista previa dNN.AUD de 20 s, y el fondo es el de uno de los REMIX (genericos).
// =====================================================================================================================
export const puedeGuardar = () => !!window.piuBuild || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const GUARDADO = () => new URL('../guardado/canciones/', location.href).href;
const VIDEOS = [27, 28, 29, 30, 31, 32, 36, 52, 53, 57];               // los fondos de los REMIX del disco
let propias = [];                                                     // canciones.json
export async function cargarPropias() {
  if (!puedeGuardar()) { propias = []; return propias; }
  try { const r = await fetch(GUARDADO() + 'canciones.json', { cache: 'no-store' }); propias = r.ok ? ((await r.json()).canciones || []) : []; } catch (e) { propias = []; }
  return propias;
}
async function guardar(nombre, bytes) {
  const r = await fetch(GUARDADO() + nombre, { method: 'PUT', body: bytes });
  if (!r.ok) throw new Error(`no se pudo guardar ${nombre} (${r.status})`);
}
const guardarLista = () => guardar('canciones.json', new TextEncoder().encode(JSON.stringify({ canciones: propias }, null, 1)));
// llave del exe (0x13BF90) a partir de la de los archivos (online.js: R.llave[i] = exe[(i + 518) % 1024])
const llaveExe = () => { const k = new Uint8Array(1024), r = D.R.llave; for (let j = 0; j < 1024; j++) k[j] = r[(j - 518 + 1024) % 1024]; return k; };
const adler = (b) => { let a = 1, s = 0; for (let i = 0; i < b.length; i++) { a = (a + b[i]) % 65521; s = (s + a) % 65521; } return ((s << 16) | a) >>> 0; };
// cifrado de .AUD y .PNZ (CABINA 4.1): 4 bytes de Adler-32 del contenido y despues espejo(claro XOR llave[(adler + i) & 1023])
export function cifrarCabina(claro, K = llaveExe()) {
  const h = adler(claro), o = new Uint8Array(claro.length + 4); new DataView(o.buffer).setUint32(0, h, true);
  for (let i = 0; i < claro.length; i++) o[4 + i] = ESPEJO[claro[i] ^ K[(h + i) & 1023]];
  return o;
}
function cuadrosMp3(b) {               // posiciones de los cuadros MP3 (salteando ID3 y basura)
  const L = (i) => { if (b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) return 0; const ver = (b[i + 1] >> 3) & 3, capa = (b[i + 1] >> 1) & 3, br = b[i + 2] >> 4, sr = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1; if (capa !== 1 || br === 0 || br === 15 || sr === 3 || ver === 1) return 0; const KB1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], KB2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]; const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }[ver][sr]; return ver === 3 ? Math.floor(144000 * KB1[br] / SR) + pad : Math.floor(72000 * KB2[br] / SR) + pad; };
  const pos = []; let i = 0;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127));
  while (i + 4 < b.length) { const l = L(i); if (l && i + l <= b.length && (i + l + 4 >= b.length || L(i + l))) { pos.push([i, l]); i += l; } else i++; }
  return pos;
}

// ---------- BPM y desfase automaticos: energia por tramos de 512 muestras, aumentos (golpes) y un peine por BPM ----------
export function detectarBpm(buf) {
  const sr = buf.sampleRate, a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a, hop = 512, n = Math.floor(a.length / hop);
  const env = new Float32Array(n); let prev = 0;
  for (let i = 0; i < n; i++) { let e = 0; for (let j = i * hop, f = j + hop; j < f; j++) { const v = a[j] + b[j]; e += v * v; } e = Math.log(1e-6 + e); env[i] = Math.max(0, e - prev); prev = e; }
  const fps = sr / hop, desde = Math.floor(n * 0.1), hasta = Math.min(n, desde + Math.floor(fps * 70));   // 70 s desde el 10 %
  const puntaje = (bpm) => {
    const P = fps * 60 / bpm; let mejor = 0, fase = 0;
    for (let ph = 0; ph < P; ph += 0.5) { let s = 0; for (let t = desde + ph; t < hasta; t += P) s += env[Math.round(t)]; if (s > mejor) { mejor = s; fase = ph; } }
    return { s: mejor / ((hasta - desde) / P), fase };
  };
  let mejor = { bpm: 120, s: -1, fase: 0 };
  for (let bpm = 85; bpm <= 200; bpm += 0.1) { const p = puntaje(bpm); if (p.s > mejor.s) mejor = { bpm, s: p.s, fase: p.fase }; }
  // los BPM de las canciones suelen ser enteros: si el entero de al lado puntua casi igual, va el entero
  const entero = Math.round(mejor.bpm), pe = puntaje(entero);
  if (pe.s >= mejor.s * 0.97) mejor = { bpm: entero, s: pe.s, fase: pe.fase };
  else mejor.bpm = Math.round(mejor.bpm * 10) / 10;
  // desfase: el primer pulso (la fase del peine, llevada al principio de la cancion)
  const P = fps * 60 / mejor.bpm; let t0 = ((desde + mejor.fase) % P) / fps;
  return { bpm: mejor.bpm, desfase: Math.round(t0 * 100) };
}

// ---------- la pantalla de cancion nueva ----------
const nuevaC = { audio: null, mp3: null, buf: null, nombre: '', artista: '', bpm: 0, desfase: 0, portada: null, video: 0, toques: [], calculando: false };
function abrirNueva() { Object.assign(nuevaC, { audio: null, mp3: null, buf: null, nombre: '', artista: '', bpm: 0, desfase: 0, portada: null, video: 0, toques: [], calculando: false }); fase = 'nueva'; }
function elegirAudio() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.mp3,audio/mpeg';
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    if (f.size > 16 * 1048576) { D.avisar('La cancion pasa los 16 MB: probá con un MP3 de menos calidad'); return; }
    const b = new Uint8Array(await f.arrayBuffer()), cuadros = cuadrosMp3(b);
    if (cuadros.length < 200) { D.avisar('No es un MP3 valido (el juego, como la cabina, solo toca MP3)'); return; }
    // solo los cuadros MP3: sin etiquetas ni nada pegado (lo mismo que se va a pedir a lo que llegue de otros), y
    // hasta 3 minutos (Charles, 20/10: "que duren hasta 3 minutos de ultima"): si es mas larga se corta en el cuadro de los 3:00
    const seg = (bb, i) => { const v = (bb[i + 1] >> 3) & 3, sr = (bb[i + 2] >> 2) & 3; const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }[v][sr]; return (v === 3 ? 1152 : 576) / SR; };
    let dur = 0, cortada = false; const usar = [];
    for (const [p, l] of cuadros) { if (dur >= 180) { cortada = true; break; } usar.push([p, l]); dur += seg(b, p); }
    const total = usar.reduce((s, [, l]) => s + l, 0), mp3 = new Uint8Array(total); let k = 0; for (const [p, l] of usar) { mp3.set(b.subarray(p, p + l), k); k += l; }
    if (cortada) D.avisar('La cancion pasaba los 3 minutos: se corto a los 3:00');
    nuevaC.audio = f.name; nuevaC.mp3 = mp3; nuevaC.nombre = nuevaC.nombre || f.name.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9 .,'!?&-]/g, '').slice(0, 24);
    nuevaC.calculando = true;
    try {
      nuevaC.buf = await D.audio().decodeAudioData(mp3.slice().buffer);
      const r = detectarBpm(nuevaC.buf); nuevaC.bpm = r.bpm; nuevaC.desfase = r.desfase;
      D.avisar(`BPM ${r.bpm} y desfase ${r.desfase} calculados: escuchalo con ESPACIO y corregilo si hace falta`);
    } catch (e) { D.avisar('No pude leer ese MP3'); }
    nuevaC.calculando = false;
  };
  i.click();
}
function elegirPortada() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    if (f.size > 20 * 1048576) { D.avisar('Esa imagen es demasiado grande'); return; }
    try { nuevaC.portada = await createImageBitmap(f); D.avisar('Portada lista: se recorta al centro a 640 x 480'); } catch (e) { D.avisar('No pude abrir esa imagen'); }
  };
  i.click();
}
// la portada: la imagen recortada al centro a 640 x 480 (como las del disco); sin imagen, una con el titulo
async function portadaPng() {
  const c = new OffscreenCanvas(640, 480), x = c.getContext('2d');
  if (nuevaC.portada) {
    const im = nuevaC.portada, k = Math.max(640 / im.width, 480 / im.height), w = im.width * k, h = im.height * k;
    x.drawImage(im, (640 - w) / 2, (480 - h) / 2, w, h);
  } else {
    const g = x.createLinearGradient(0, 0, 640, 480); g.addColorStop(0, '#120a44'); g.addColorStop(1, '#5a0a6e'); x.fillStyle = g; x.fillRect(0, 0, 640, 480);
    D.texto(x, nuevaC.nombre.slice(0, 20), 320, 200, 3, 'amarillo', true); D.texto(x, nuevaC.artista.slice(0, 30), 320, 260, 2, 'celeste', true); D.texto(x, `BPM ${nuevaC.bpm}`, 320, 400, 2, 'blanco', true);
  }
  return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
}
async function guardarNueva() {
  if (!nuevaC.mp3) { D.avisar('Primero elegí la musica (A)'); return; }
  if (!(nuevaC.bpm > 20 && nuevaC.bpm < 600)) { D.avisar('Falta el BPM'); return; }
  await cargarPropias();
  const usados = new Set(propias.map(c => c.n)); let n = 82; while (usados.has(n) && n <= 99) n++;
  if (n > 99) { D.avisar('Ya hay 18 canciones propias (82 a 99): no entran mas'); return; }
  try {
    D.avisar('Guardando...');
    const K = llaveExe(), cuadros = cuadrosMp3(nuevaC.mp3);
    // vista previa: 20 s desde el 35 % de la cancion
    const fps = cuadros.length / (nuevaC.buf ? nuevaC.buf.duration : 180), ini = Math.floor(cuadros.length * 0.35), fin = Math.min(cuadros.length, ini + Math.round(fps * 20));
    const previa = nuevaC.mp3.slice(cuadros[ini][0], cuadros[fin - 1][0] + cuadros[fin - 1][1]);
    await guardar(`${n}.aud`, cifrarCabina(nuevaC.mp3, K));
    await guardar(`d${n}.aud`, cifrarCabina(previa, K));
    await guardar(`t${n}.pnz`, cifrarCabina(await portadaPng(), K));
    propias.push({ n, nombre: nuevaC.nombre || `CANCION ${n}`, artista: nuevaC.artista, bpm: nuevaC.bpm, desfase: nuevaC.desfase, video: VIDEOS[nuevaC.video], pasos: {}, creada: new Date().toISOString().slice(0, 10) });
    await guardarLista();
    D.avisar(`Cancion ${n} guardada: ahora hacele los pasos y guardalos con G`);
    abrirPropia(propias[propias.length - 1], 'HARD', false);
  } catch (e) { D.avisar('No se pudo guardar: ' + e.message); }
}
function tocarNueva() {
  if (!nuevaC.buf) return;
  parar();
  const ctx = D.audio(); fuente = ctx.createBufferSource(); fuente.buffer = nuevaC.buf; fuente.connect(ctx.destination);
  inicioCtx = ctx.currentTime + 0.05; inicioSeg = 0; fuente.start(inicioCtx); sonando = true; ultimaFilaSonada = -1;
  ed = { porPulso: 1, valores: [nuevaC.desfase], bpms: [nuevaC.bpm], notas: new Map(), largas: [], largo: 1e9, cursor: 0 };   // para el metronomo
}
export function dibujarNueva(x) {
  const { texto, caja } = D;
  if (sonando && ed) { ed.valores[0] = nuevaC.desfase; ed.bpms[0] = nuevaC.bpm; seguirSonido(); }
  caja(40, 24, 560, 432, 0.85);
  texto(x, 'CANCION NUEVA', 320, 36, 3, 'amarillo', true);
  const v = VIDEOS[nuevaC.video], filas = [
    ['A', 'MUSICA (MP3)', nuevaC.audio ? `${nuevaC.audio.slice(0, 24)} ${(nuevaC.mp3.length / 1048576).toFixed(1)} MB` : 'ELEGIR...'],
    ['', 'DURACION', nuevaC.buf ? `${Math.floor(nuevaC.buf.duration / 60)}:${String(Math.floor(nuevaC.buf.duration % 60)).padStart(2, '0')}${nuevaC.mp3.length > 2600000 ? ' (MAS QUE LA PLACA: SUENA ENTERA EN EL PORT)' : ''}` : '-'],
    ['B / T', 'BPM', nuevaC.calculando ? 'CALCULANDO...' : nuevaC.bpm ? `${nuevaC.bpm}${nuevaC.toques.length > 1 ? '  (MARCADO CON T)' : '  (AUTOMATICO)'}` : '-'],
    ['D [ ]', 'DESFASE (CENTESIMAS)', nuevaC.buf ? String(nuevaC.desfase) : '-'],
    ['N', 'NOMBRE', nuevaC.nombre || '-'], ['R', 'ARTISTA', nuevaC.artista || '-'],
    ['P', 'PORTADA', nuevaC.portada ? `${nuevaC.portada.width} x ${nuevaC.portada.height} (SE RECORTA A 640 x 480)` : 'SIN IMAGEN: SE ARMA CON EL TITULO'],
    ['< >', 'VIDEO DE FONDO', `EL DEL REMIX ${v} (${{ 27: 'YOUNG MAN', 28: 'REPGYO', 29: 'PIERROT', 30: 'BIG + BLIND', 31: 'FA + C WING', 32: 'SELECT', 36: 'NAN + REPGYO', 52: 'IGNITION', 53: 'KISS', 57: 'MOEBIUS' }[v] || ''})`],
  ];
  filas.forEach(([k, n, val], i) => { const y = 92 + i * 34; texto(x, k, 60, y, 1.4, 'celeste'); texto(x, n, 130, y, 1.4, 'blanco'); texto(x, String(val).slice(0, 44), 130, y + 16, 1, 'amarillo'); });
  if (nuevaC.portada || nuevaC.nombre) { /* vista de la portada */ x.save(); x.globalAlpha = 0.9; if (nuevaC.portada) { const im = nuevaC.portada, k = Math.max(128 / im.width, 96 / im.height); x.beginPath(); x.rect(452, 296, 128, 96); x.clip(); x.drawImage(im, 516 - im.width * k / 2, 344 - im.height * k / 2, im.width * k, im.height * k); } x.restore(); }
  texto(x, 'ESPACIO = ESCUCHAR CON METRONOMO (PARA VER SI EL BPM Y EL DESFASE VAN)', 320, 380, 1, 'gris', true);
  texto(x, 'G = GUARDAR Y HACERLE LOS PASOS     ESC = VOLVER', 320, 400, 1, 'verde', true);
  texto(x, 'SE GUARDA EN GUARDADO\\CANCIONES (AL LADO DEL JUEGO); MAXIMO 18 CANCIONES', 320, 424, 1, 'celeste', true);
}
export function teclaNueva(k, e) {
  if (k === 'KeyA') elegirAudio();
  else if (k === 'KeyP') elegirPortada();
  else if (k === 'KeyN') { const v = prompt('NOMBRE DE LA CANCION:', nuevaC.nombre); if (v !== null) nuevaC.nombre = v.toUpperCase().slice(0, 24); }
  else if (k === 'KeyR') { const v = prompt('ARTISTA:', nuevaC.artista); if (v !== null) nuevaC.artista = v.toUpperCase().slice(0, 30); }
  else if (k === 'KeyB') { const v = prompt('BPM:', String(nuevaC.bpm || 120)); if (v !== null && +v > 20 && +v < 600) nuevaC.bpm = +v; }
  else if (k === 'KeyD') { const v = prompt('DESFASE EN CENTESIMAS (CUANDO CAE EL PRIMER PULSO):', String(nuevaC.desfase)); if (v !== null && !isNaN(+v)) nuevaC.desfase = Math.round(+v); }
  else if (k === 'BracketLeft') nuevaC.desfase -= e.shiftKey ? 10 : 1; else if (k === 'BracketRight') nuevaC.desfase += e.shiftKey ? 10 : 1;
  else if (k === 'KeyT') {           // marcar el ritmo: el promedio de los ultimos toques
    const t = performance.now(); if (nuevaC.toques.length && t - nuevaC.toques[nuevaC.toques.length - 1] > 2000) nuevaC.toques = [];
    nuevaC.toques.push(t); nuevaC.toques = nuevaC.toques.slice(-12);
    if (nuevaC.toques.length > 3) { const d = (nuevaC.toques[nuevaC.toques.length - 1] - nuevaC.toques[0]) / (nuevaC.toques.length - 1); nuevaC.bpm = Math.round(60000 / d * 10) / 10; }
  }
  else if (k === 'ArrowLeft') nuevaC.video = (nuevaC.video + VIDEOS.length - 1) % VIDEOS.length; else if (k === 'ArrowRight') nuevaC.video = (nuevaC.video + 1) % VIDEOS.length;
  else if (k === 'Space') { e.preventDefault(); if (sonando) parar(); else tocarNueva(); }
  else if (k === 'KeyG') { parar(); guardarNueva(); }
  else if (k === 'Escape') { parar(); fase = 'elegir'; }
  return true;
}
// abrir una cancion propia en la grilla (sus pasos estan en guardado\canciones; si no hay, vacia con su BPM y desfase)
async function abrirPropia(c, modo, versus) {
  parar();
  const tabla = { n: c.n, nombre: c.nombre, modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] }, archivo = archivoDe({ cancion: c.n, modo, versus });
  let p = null;
  try { const r = await fetch(GUARDADO() + archivo, { cache: 'no-store' }); if (r.ok) p = leerPasos(archivo.toUpperCase(), new Uint8Array(await r.arrayBuffer())); } catch (e) { p = null; }
  ed = nueva(tabla, modo, p, versus); ed.propia = c;
  if (p) cargarDe(ed, p); else { ed.bpms = [c.bpm]; ed.valores = [c.desfase | 0]; ed.porPulso = 4; ed.numero = c.n; ed.largo = ed.porPulso * 64; }
  fase = 'editar';
  D.avisar(p ? `Abierto ${archivo.toUpperCase()}` : `${c.nombre}: pasos nuevos en ${modo}. G guarda en la cancion`);
  musica = null;
  try { const r = await fetch(GUARDADO() + `${c.n}.aud`); const mp3 = descifrarAudio(new Uint8Array(await r.arrayBuffer()), D.R.llave); if (mp3) musica = await D.audio().decodeAudioData(mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength)); } catch (e) { D.avisar('No pude cargar la musica'); }
}
// G en una cancion propia: los pasos van a guardado\canciones (y a la lista del juego), no a una descarga
async function guardarPasosPropia() {
  try {
    await guardar(archivoDe(ed), escribirNot(ed));
    await cargarPropias();
    const c = propias.find(p => p.n === ed.cancion);
    if (c) {
      const flechas = [...ed.notas.values()].reduce((a, m) => a + popc(m), 0) + ed.largas.length, seg = Math.max(30, segFila(ed.largo) - segFila(0));
      c.pasos = c.pasos || {}; c.pasos[ed.modo] = { nivel: Math.max(1, Math.min(12, Math.round(flechas / seg * 2.2))) };
      await guardarLista();
    }
    ed.cambiado = false; D.avisar(`Guardado ${archivoDe(ed).toUpperCase()}: ya aparece en la seleccion del juego (${ed.modo})`);
  } catch (e) { D.avisar('No se pudo guardar: ' + e.message); }
}
