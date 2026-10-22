// Hilo del juego: corre Piu.exe traducido (bloqueante, como en la cabina). Lee los archivos del disco extraido
// con XHR sincrono, anota las llamadas de OpenGL de cada cuadro y se las manda a la pagina para que las dibuje.
// Memoria compartida con la pagina (principal.js):
//   I[0] senal "cuadro mostrado" · I[3]/I[4] luces 0x2A4/0x2A6 · I[10] cuantos toques escribio la pagina en Q
//   I[11] lista con todo (F7): 1 = el juego lee game_con_todo.cfg en vez del game.cfg del disco
//   I[12] velocidad de las flechas elegida con 1-9 (0 = la del juego) · I[13] 1 = la pagina pide cortar este juego
//   (para arrancar otro en el mismo hilo: ver "reinicio" abajo)
//   Q cola de 256 toques: [hora absoluta en ms, grupo*0x20000 + bit*2 + apretado] (grupo 0 P1, 1 P2, 2 botones)
//   D[0] segundos de musica (-1 si no suena) · D[1] cuando se midio (ms absolutos) · D[2] 1 si termino
import * as C from './cpu.js';
import './traducido.js';
import { reiniciarZlib } from './zlib_hle.js';
import * as S from './sistema.js';
import * as G from './gl_hle.js';
import * as K from './cabina.js';
import { aplicarArreglos } from './arreglos.js';
import { crearSeguidorSolo } from './solo.js';

let I = null, D = null, Q = null;
const ahoraAbs = () => performance.timeOrigin + performance.now();
// la carpeta del juego (port\, motor\, disco\, volcados\...): en la PC es la raiz; en el hosting, /piu-prueba/
const BASE = new URL('../', self.location.href).href;
const traer = (url) => {
  const x = new XMLHttpRequest(); x.open('GET', url, false); x.responseType = 'arraybuffer'; x.send();
  return x.status === 200 ? new Uint8Array(x.response) : null;
};

// ---------- OpenGL: grabador de comandos ----------
let cmds = [], transferir = [], sigTex = 1;
// (21/10, "a veces se traba el bga") cuantas texturas se suben en cada cuadro: un cuadro de la cancion que tarda mucho se
// anota con eso, para saber que video y en que momento
const subidas = { n: 0, bytes: 0 };
const NO_GRABAR = new Set(['auxInitDisplayMode', 'auxInitPosition', 'auxQuit', 'glReadPixelsA']);
const grabador = new Proxy({
  glGenTextures: (n) => Array.from({ length: n }, () => sigTex++),
  glTexImage2D: (...a) => { const d = a[8] ? a[8].slice() : null; if (d) { transferir.push(d.buffer); subidas.n++; subidas.bytes += d.length; } a[8] = d; cmds.push(['glTexImage2D', ...a]); },
  lfb: (datos, w, h, paso, abgr) => { const d = datos.slice(); transferir.push(d.buffer); cmds.push(['lfb', d, w, h, paso, abgr]); },
  auxInitWindow: () => 1,
  auxSwapBuffers: () => cambiarCuadro(),
  // (21/10) cada funcion se arma una sola vez y queda guardada: antes se creaba una nueva en cada llamada de dibujo
  // (miles por cuadro) y el recolector de basura frenaba el juego en el celular
}, { get: (o, k) => (k in o ? o[k] : (o[k] = NO_GRABAR.has(k) ? () => {} : (...a) => { a.unshift(k); cmds.push(a); })) });

// ---------- reloj de 240 Hz y ritmo de cuadros ----------
let t0 = 0, tics = 0, cuadros = 0;
const horaTic = (k) => performance.timeOrigin + t0 + k / 0.24;

// ---------- entradas: cada toque se aplica en el tic que le corresponde por su hora ----------
// Si el juego estuvo ocupado (cargando un archivo), los cambios de una misma tecla se separan al menos SEPARAR
// tics y un cuadro: el juego mira lo apretado una vez por cuadro (con 1 cuadro = 4 tics ya cuenta una moneda,
// probado en arrancar.mjs), y dos monedas dentro de la misma tanda de tics se juntaban en una.
// Los botones van mas separados: el juego descarta una moneda que llega a menos de ~20 tics de la anterior
// (medido en el navegador: 20 tics cuenta, 8 no), como un monedero de verdad.
const SEPARAR = [4, 4, 16], entradas = [0, 0, 0], ultimoCambio = new Map(), cola = [];
let leidos = 0, anotarEntradas = false;
function leerCola() {
  const w = Atomics.load(I, 10);
  if (w - leidos > 256) leidos = w - 256;
  for (; leidos < w; leidos++) { const j = (leidos & 255) * 2; cola.push([Q[j], Q[j + 1]]); }
}
function aplicarEntradas(hora) {
  const trabadas = new Set();
  for (let i = 0; i < cola.length; i++) {
    const [t, cod] = cola[i];
    if (t > hora) break;
    const grupo = Math.floor(cod / 0x20000), bit = (cod >> 1) & 0xFFFF, clave = grupo * 0x10000 + bit;
    const ultimo = ultimoCambio.get(clave);
    if (trabadas.has(clave) || (ultimo && (ultimo[0] === cuadros || tics - ultimo[1] < SEPARAR[grupo]))) { trabadas.add(clave); continue; }
    entradas[grupo] = (cod & 1) ? entradas[grupo] | bit : entradas[grupo] & ~bit;
    if (cod & 1) huboToque = true;           // para la intro y la demo del modo solo (seguirAtraccion)
    ultimoCambio.set(clave, [cuadros, tics]);
    if (anotarEntradas) postMessage({ tipo: 'registro', s: `entrada ${['P1', 'P2', 'boton'][grupo]} 0x${bit.toString(16)} ${(cod & 1) ? 'abajo' : 'arriba'} · cuadro ${cuadros} tic ${tics} · ${Math.round(hora - t)} ms tarde · monedas ${C.r32(0x1ca6c0)} estado 0x${(C.r32(0x1ca6a0) >>> 0).toString(16)}` });
    cola.splice(i--, 1);
  }
}

// las interrupciones de 240 Hz que tocaban desde la ultima vez (con tope, para no espiralar si va lento)
function correrTics() {
  if (Atomics.load(I, 13) === 1) throw new Reinicio();   // la pagina pidio cortar (cada cuadro y en las esperas pasa por aca)
  const debidos = Math.floor((performance.now() - t0) * 0.24) - tics;
  const n = Math.min(Math.max(debidos, 0), 16);
  if (debidos > 16) t0 += (debidos - 16) / 0.24;
  leerCola();
  for (let i = 0; i < n; i++) {
    aplicarEntradas(horaTic(tics + 1));
    K.entradas.p1 = entradas[0]; K.entradas.p2 = entradas[1]; K.entradas.botones = entradas[2];
    K.tic(); tics++;
  }
  Atomics.store(I, 3, K.luces.a4); Atomics.store(I, 4, K.luces.a6);
}
// la placa quieta mientras suena la musiquita de la seleccion (cabina.js, 0x30268): el reloj sigue andando
const espera = new Int32Array(new SharedArrayBuffer(4));
K.esperas.mientrasSuena = (maxMs) => {
  const ini = performance.now();
  postMessage({ tipo: 'registro', s: 'placa quieta mientras suena la musiquita' });
  while (K.musica.sonando && performance.now() - ini < maxMs) { correrTics(); Atomics.wait(espera, 0, 0, 8); }
  postMessage({ tipo: 'registro', s: `placa: ${Math.round(performance.now() - ini)} ms` });
};

let ultimoCuadro = 0, cuadroEnCamino = false, trabados = 0;
function cambiarCuadro() {
  cuadros++;
  cmds.push(['glFlush']);
  // (21/10, para que en el celular no baje de 60) un cuadro en camino: antes el juego mandaba el cuadro y esperaba a
  // que la pagina lo dibujara para recien calcular el siguiente, y los dos tiempos se sumaban. Ahora calcula el
  // siguiente mientras la pagina dibuja este, y espera (como el retrazado vertical) recien antes de mandar el proximo.
  // El juicio no cambia: cada toque va con su hora a la cola de 240 Hz.
  if (cuadroEnCamino) { Atomics.wait(I, 0, 0, 200); Atomics.store(I, 0, 0); }
  postMessage({ tipo: 'cuadro', cmds, n: cuadros, luces: [K.luces.a4, K.luces.a6] }, transferir);
  cmds = []; transferir = []; cuadroEnCamino = true;
  // pausas largas (cargas): anotarlas para saber cuanto tarda cada una
  const ahora = performance.now(), dt = ultimoCuadro ? ahora - ultimoCuadro : 0;
  if (dt > 500) postMessage({ tipo: 'registro', s: `pausa de ${Math.round(dt)} ms (cargando)` });
  // jugando: un cuadro de mas de 40 ms (se ve como un tiron) se anota, con las texturas que subio
  else if (dt > 40 && C.r32(0x1CA6A0) === 2 && trabados++ < 40) postMessage({ tipo: 'registro', s: `tiron: cuadro de ${Math.round(dt)} ms en la cancion ${C.r32(0x2B3A68)} (${subidas.n} texturas, ${Math.round(subidas.bytes / 1024)} KB)` });
  subidas.n = 0; subidas.bytes = 0;
  correrTics();
  ultimoCuadro = performance.now();
  if (online) seguirOnline(); else if (seguidorSolo) seguidorSolo.seguir();
  if (atraccion) seguirAtraccion();
  estirarFin();
  // PANEL DE MODIFICADORES del modo solo (OPCIONES, 21/10): lo elegido antes de jugar se escribe en las opciones de los
  // dos jugadores [0x1CFB0C]/[0x1CFB10] y en la skin [0x2AC088] mientras se esta en la seleccion (10/11): el estado 1
  // los lee al cargar la cancion (JUEGO_REGLAS 4.3). Reemplaza a los codigos de la seleccion.
  if (modsSolo && (C.r32(0x1CA6A0) === 10 || C.r32(0x1CA6A0) === 11)) { C.w32(0x1CFB0C, modsSolo.opciones | 0); C.w32(0x1CFB10, modsSolo.opciones | 0); C.w32(0x2AC088, modsSolo.skin | 0); }
  // desafio: la seleccion ya se ve (estado 11): la pagina saca el cartel de "preparando" (online.js)
  if (avisarEleccion && C.r32(0x1CA6A0) === 11) { avisarEleccion = false; postMessage({ tipo: 'eleccionLista' }); }
  // sin corte por MISS (siempre en el online; en solo si OPCIONES > SIN CORTE, Charles 20/10): el juego corta con
  // HEY MAN cuando los MISS seguidos (+0x18 de cada jugador) pasan de 50 [C 0x2c224]. Se frenan en 40 en cada cuadro:
  // en un cuadro no entran 10 MISS, asi que nunca llega, y el numero rojo de fallos se sigue viendo (hasta 40).
  if (sinCorte) for (const p of [0x1CFB7C, 0x1CFBA5]) if (C.r16(p + 0x18) > 40) C.w16(p + 0x18, 40);
  // juego libre (COIN SETTING en FREE o la marca [0x307904]): la pagina esconde el boton MONEDA del celular. Mientras
  // la intro o la demo fingen que pide monedas, sigue siendo libre.
  if (cuadros % 30 === 0) {
    const libre = !!(atraccion && atraccion.fingiendo) || C.r8(0x30790A) === 0 || C.r8(0x307904) === 1;
    if (libre !== avisoLibre) { avisoLibre = libre; postMessage({ tipo: 'libre', libre }); }
  }
}

// ---------- TODO DESBLOQUEADO (OPCIONES, Charles 20/10): las ocultas de CRAZY desde la primera cancion ----------
// En el original se agregan de a una al pasar etapas en XX (7, 20, 21; JUEGO_REGLAS 3.4). Aca van en game.cfg desde
// el principio, y como 0x2EEE8 las vuelve a agregar sin fijarse si estan, despues de cada llamada se sacan los repetidos
// de la lista XX (cancion + marca). Listas: cancion 0x2B3600 + 50*modo, nivel 0x2B372C, marca 0x2B3858, cantidad 0x2B3984.
const OCULTAS_XX = [[7, 4], [20, 4], [21, 5]];
function desbloquear(bytes) {
  const lineas = new TextDecoder('latin1').decode(bytes).split(/\r?\n/);
  const i = lineas.findIndex((l) => /^MODENAME\s+XX\b/.test(l.trim()));
  if (i < 0) return bytes;
  let fin = lineas.findIndex((l, k) => k > i && /^MODENAME\b/.test(l.trim())); if (fin < 0) fin = lineas.length;
  const ya = new Set(lineas.slice(i, fin).map((l) => l.trim().split(/\s+/)).filter((p) => p[0] === 'SONG').map((p) => +p[1]));
  const nuevas = OCULTAS_XX.filter(([n]) => !ya.has(n)).map(([n, nivel]) => `SONG   ${String(n).padStart(2)}    ${nivel}   0`);
  lineas.splice(i + 1, 0, ...nuevas);
  postMessage({ tipo: 'registro', s: `todo desbloqueado: ${nuevas.length} ocultas en CRAZY desde el principio` });
  return Uint8Array.from(lineas.join('\r\n'), (ch) => ch.charCodeAt(0) & 255);
}
function deduplicarXX() {
  const m = 2, n = C.r8(0x2B3984 + m), visto = new Set();
  let k = 0;
  for (let i = 0; i < n; i++) {
    const c = C.r8(0x2B3600 + 50 * m + i), nivel = C.r8(0x2B372C + 50 * m + i), marca = C.r8(0x2B3858 + 50 * m + i);
    if (visto.has(c * 256 + marca)) continue;
    visto.add(c * 256 + marca);
    C.w8(0x2B3600 + 50 * m + k, c); C.w8(0x2B372C + 50 * m + k, nivel); C.w8(0x2B3858 + 50 * m + k, marca); k++;
  }
  C.w8(0x2B3984 + m, k);
}
// ---------- canciones propias (editor, EDITOR_MASTER.md etapa 2; build de Edge y PC) ----------
// guardado\canciones\canciones.json: [{ n (82-99), nombre, video (el remix cuyo fondo usa), pasos: { NORMAL|HARD|CRAZY|DOUBLE:
// { nivel } } }]. Sus archivos (NN.aud, dNN.aud, tNN.pnz, NN_xx.not) estan en esa carpeta; el fondo BGA\NN.dat es el del
// remix elegido (no se crea ningun .DAT). Se suman a la lista de cada modo en el que tengan pasos.
let propias = [];
function cargarPropias() {
  propias = [];
  try { const b = traer(BASE + 'guardado/canciones/canciones.json'); if (b) propias = (JSON.parse(new TextDecoder().decode(b)).canciones || []).filter(c => c.n >= 82 && c.n <= 99); } catch (e) { propias = []; }
  if (propias.length) postMessage({ tipo: 'registro', s: `canciones propias: ${propias.map(c => c.n).join(', ')}` });
}
const LISTA_DE = { NORMAL: 'NORMAL', HARD: 'HARD', CRAZY: 'XX', DOUBLE: 'DOUBLE' };
function sumarPropias(bytes) {
  if (!propias.length) return bytes;
  const lineas = new TextDecoder('latin1').decode(bytes).split(/\r?\n/);
  for (const c of propias) for (const [modo, d] of Object.entries(c.pasos || {})) {
    const lista = LISTA_DE[modo]; if (!lista) continue;
    const i = lineas.findIndex((l) => new RegExp(`^MODENAME\\s+${lista}\\b`).test(l.trim()));
    if (i >= 0) lineas.splice(i + 1, 0, `SONG   ${c.n}   ${Math.max(1, Math.min(12, d.nivel | 0 || 5))}   0`);
    if (modo === 'HARD') { const b = lineas.findIndex((l) => /^MODENAME\s+BATTLE\b/.test(l.trim())); if (b >= 0) lineas.splice(b + 1, 0, `SONG   ${c.n}   ${Math.max(1, Math.min(12, d.nivel | 0 || 5))}   0`); }
  }
  return Uint8Array.from(lineas.join('\r\n'), (ch) => ch.charCodeAt(0) & 255);
}
function archivoPropio(r) {          // r en minuscula: 'step/82_h1.not', 'audio/82.aud', 'audio/d82.aud', 'title/t82.pnz', 'bga/82.dat'
  const m = /^(step|audio|title|bga)\/([dt]?)(\d\d)(_[a-z0-9]+)?\.(not|aud|pnz|dat)$/.exec(r);
  if (!m) return null;
  const c = propias.find((p) => p.n === +m[3]); if (!c) return null;
  if (m[1] === 'bga') return traer(BASE + `disco/bga/${String(c.video || 28).padStart(2, '0')}.dat`);
  const b = traer(BASE + 'guardado/canciones/' + r.slice(r.indexOf('/') + 1));
  return b && m[1] === 'audio' && !m[2] && b.length > TOPE_PLACA ? recortarAud(b, c.n) : b;
}
// La seleccion dibuja las caratulas chicas de los costados con las piezas de STITLE.SP2, una por cancion del disco y
// buscadas por su numero (como mucho 73): con una propia (82-99) leia fuera de la tabla y se caia ("Offset is outside
// the bounds", f_31740 < f_32270, 20/10). Mientras dibujan (0x31154, 0x31740, 0x31D20, llamadas desde la ruleta 0x32270)
// la propia se cambia en las listas por el remix de su video, y se vuelve a poner al terminar: la caratula grande (por
// archivo, TITLE\tNN.pnz), la vista previa y el "run" siguen viendo el numero de verdad.
function instalarDibujoPropias() {
  for (const dir of [0x31154, 0x31740, 0x31D20]) {
    C.HLE[dir] = () => {
      const cambiados = [];
      for (let m = 0; m < 6; m++) for (let i = 0, n = C.r8(0x2B3984 + m); i < n; i++) {
        const a = 0x2B3600 + 50 * m + i, c = propias.find((p) => p.n === C.r8(a));
        if (c) { cambiados.push([a, c.n]); C.w8(a, c.video || 28); }
      }
      try { C.FN[dir](); } finally { for (const [a, v] of cambiados) C.w8(a, v); }
      return -4;
    };
  }
}
// Canciones mas largas que la placa: la cabina lee el .AUD entero a un bufer de 0x27FA60 bytes (2,6 MB, CABINA 4.1).
// Al juego se le da una copia recortada (cuadros MP3 enteros, con su Adler-32) y, cuando la manda a sonar, la pagina
// recibe la cancion completa (K.musica.arrancar, abajo); el final lo marca la pagina, asi que dura lo que dura.
const TOPE_PLACA = 2600000, musicaLarga = new Map();
const ESPEJO_B = (() => { const t = new Uint8Array(256); for (let i = 0; i < 256; i++) { let r = 0; for (let b = 0; b < 8; b++) if (i & (1 << b)) r |= 0x80 >> b; t[i] = r; } return t; })();
function recortarAud(c, n) {
  const K = C.M8.subarray(0x13BF90, 0x13BF90 + 1024), h = new DataView(c.buffer, c.byteOffset).getUint32(0, true);
  const claro = new Uint8Array(c.length - 4); for (let i = 0; i < claro.length; i++) claro[i] = ESPEJO_B[c[4 + i]] ^ K[(h + i) & 1023];
  musicaLarga.set(n, claro);
  let fin = 0; for (let i = 0; i + 4 < claro.length && i < TOPE_PLACA - 8;) { const L = largoCuadro(claro, i); if (!L) { i++; continue; } if (i + L > TOPE_PLACA - 8) break; i += L; fin = i; }
  const corto = claro.subarray(0, fin); let a = 1, s = 0; for (const x of corto) { a = (a + x) % 65521; s = (s + a) % 65521; }
  const h2 = ((s << 16) | a) >>> 0, o = new Uint8Array(fin + 4); new DataView(o.buffer).setUint32(0, h2, true);
  for (let i = 0; i < fin; i++) o[4 + i] = ESPEJO_B[corto[i] ^ K[(h2 + i) & 1023]];
  postMessage({ tipo: 'registro', s: `cancion propia ${n}: ${(claro.length / 1048576).toFixed(1)} MB, a la placa van ${(fin / 1048576).toFixed(1)} MB y suena entera` });
  return o;
}
function largoCuadro(b, i) {         // largo de un cuadro MP3 (MPEG-1/2 capa III) que empieza en i, o 0
  if (b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) return 0;
  const ver = (b[i + 1] >> 3) & 3, capa = (b[i + 1] >> 1) & 3, br = b[i + 2] >> 4, sr = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
  if (capa !== 1 || br === 0 || br === 15 || sr === 3 || ver === 1) return 0;
  const KB1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], KB2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }[ver][sr];
  return ver === 3 ? Math.floor(144000 * KB1[br] / SR) + pad : Math.floor(72000 * KB2[br] / SR) + pad;
}
// ---------- la cancion entera (Charles, 20/10: "cuando terminan los pasos se corta y pasa al evaluation, cuando tiene que
// esperar que termine la cancion") ----------
// La etapa termina cuando la fila [0x1CFC00] pasa el fin [0x1CFC0C] (N en el formato A, ultima flecha + 4 en el B) y ahi
// la cabina corta la musica aunque el MP3 siga (JUEGO_REGLAS 2.6, paso 7). Al empezar cada etapa el fin se lleva a la
// fila en que termina la musica (con los BPM, desfases y cambios de la tabla, JUEGO_REGLAS 5) y las filas agregadas se
// vacian (notas '0', largas 0: no queda nada de la cancion anterior). Tope 2047: las tablas son de 2048 filas.
const duracionMusica = new Map();          // numero de cancion -> segundos (cadena de cuadros MP3 de su .AUD)
let finEstirado = false, practica = false, avisarEleccion = false, modsSolo = null;
function segundosMp3(b) {
  let i = 0, s = 0;
  while (i + 4 <= b.length) {
    const L = largoCuadro(b, i); if (!L) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, sr = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }[ver][(b[i + 2] >> 2) & 3];
    s += (ver === 3 ? 1152 : 576) / sr; i += L;
  }
  return s;
}
function estirarFin() {
  if (C.r32(0x1CA6A0) !== 2) { finEstirado = false; return; }
  if (finEstirado) return;
  finEstirado = true;
  const T = duracionMusica.get(C.r32(0x2B3A68));
  // la demo de la cabina queda como era; en la practica (un tramo de la cancion) termina con el tramo
  if (!T || practica || (C.r32(0x1CFB08) & 0x100000)) return;
  const fpp = C.r32(0x29D1D8) | 0, bpm = [], val = [], cam = [];
  for (let i = 0; i < 10; i++) { bpm.push(C.rf32(0x29D160 + 4 * i)); val.push(C.r32(0x29D188 + 4 * i) | 0); cam.push(C.r32(0x29D1B0 + 4 * i) | 0); }
  let s = 0;
  if (cam[0] !== 0) { s = 9; for (let i = 0; i < 9; i++) if (T * 100 < cam[i]) { s = i; break; } }
  if (!(fpp > 0 && bpm[s] > 0)) return;
  const fin = C.r32(0x1CFC0C) | 0, nuevo = Math.min(2047, Math.ceil((T - val[s] / 100) * bpm[s] / 60 * fpp) + 1);
  if (nuevo <= fin) return;
  for (let f = Math.max(0, fin + 1); f <= nuevo; f++) { C.M8.fill(0x30, 0x29F230 + 14 * f, 0x29F230 + 14 * f + 14); C.M8.fill(0, 0x2A6230 + 10 * f, 0x2A6230 + 10 * f + 10); }
  C.w32(0x1CFC0C, nuevo);
  postMessage({ tipo: 'registro', s: `cancion entera: el fin pasa de la fila ${fin} a la ${nuevo} (musica ${T.toFixed(1)} s)` });
}
// ---------- FONDO (OPCIONES, Charles 21/10): el video de la cancion atenuado, o SIN VIDEO (la caratula de la cancion) ----------
// El video de la cancion es lo primero de cada cuadro del estado 2 (0x2C04C); despues van las flechas. Hay dos clases:
// los de Andamiro los dibuja bga_dibujar (0x37750, llamado desde 0x2C679) y los de F2 System su reproductor de escenas
// (0x40D28, llamado desde 0x2C641 o 0x2C669; ANDAMIRO_MOTOR 4.3 y F2_FORMATOS 2.2). Se los reconoce por la direccion de
// vuelta (la que el juego deja en la pila): asi los menus, la seleccion, la apertura y las notas quedan como son.
// Despues del video va un rectangulo negro de pantalla entera (en las coordenadas de 640 x 480 del juego, como su propio
// cuadro de 0x2C5A2) con la transparencia elegida: se oscurece solo el fondo. SIN VIDEO no lo dibuja (alivia al
// aparato) y la pagina pone la caratula (principal.js fondoCancion).
function instalarFondoBga(f) {
  const atenuar = f === 'titulo' ? 1 : Math.max(0, Math.min(0.95, +f || 0));
  if (!atenuar) return;
  postMessage({ tipo: 'registro', s: `fondo de la cancion: ${f === 'titulo' ? 'SIN VIDEO' : 'atenuado ' + Math.round(atenuar * 100) + ' %'}` });
  const tapar = () => {
    grabador.glDisable(0x0DE1); grabador.glColor4f(0, 0, 0, atenuar);
    grabador.glBegin(7); grabador.glVertex2i(0, 0); grabador.glVertex2i(640, 0); grabador.glVertex2i(640, 480); grabador.glVertex2i(0, 480); grabador.glEnd();
    grabador.glEnable(0x0DE1);
    if (f === 'titulo') cmds.push(['fondoCancion', C.r32(0x2B3A68)]);
    grabador.glColor4f(1, 1, 1, 1);
  };
  for (const [dir, vueltas] of [[0x37750, [0x2C67E]], [0x40D28, [0x2C646, 0x2C66E]]]) {
    C.HLE[dir] = () => {
      const deCancion = vueltas.includes(C.r32(C.R[C.ESP] >>> 0)) && !(C.r32(0x1CFB08) & 0x100000);
      if (!deCancion) { C.FN[dir](); return -4; }
      if (f === 'titulo') { tapar(); return 0; }
      C.FN[dir](); tapar(); return -4;
    };
  }
}
// ---------- FLECHAS AL CENTRO (OPCIONES, Charles 21/10: "si se juega uno solo, ponerlo en el centro o que quede en su
// lugar") ----------
// Con un solo jugador (y no DOUBLE, que ya usa todo el ancho) el carril se corre al medio de la pantalla: las flechas
// (0x24DB0), los receptores y explosiones (0x27158), el cartel del juicio y el combo (0x27CC4) y 0x23B50/0x23DB4 se
// dibujan con un corrimiento horizontal (glTranslatef entre glPushMatrix y glPopMatrix). Medido en una captura: los
// receptores del jugador 1 van de x ~36 a ~282 (centro ~159), asi que +161 los deja en el medio; los del jugador 2, -161.
// La vida y el puntaje quedan en su lugar.
const CARRIL_CENTRO = [0x24DB0, 0x27158, 0x27CC4, 0x23B50, 0x23DB4];
function instalarCarrilCentro() {
  for (const dir of CARRIL_CENTRO) {
    C.HLE[dir] = () => {
      const b = C.r32(0x1CFB08), uno = (b & 3) === 1 || (b & 3) === 2;
      if (C.r32(0x1CA6A0) !== 2 || !uno || (b & 0x80)) { C.FN[dir](); return -4; }
      grabador.glPushMatrix(); grabador.glTranslatef((b & 3) === 1 ? 161 : -161, 0, 0);
      C.FN[dir]();
      grabador.glPopMatrix();
      return -4;
    };
  }
}
function instalarDesbloqueado() { C.HLE[0x2EEE8] = () => { C.FN[0x2EEE8](); deduplicarXX(); return -4; }; }

// ---------- partida online: la cancion arranca sola a la hora acordada, y se informa el marcador ----------
// En vez del logo (estado 13, 0x3B064, lo primero que hace la espera despues de arrancar), se espera la hora y se
// ejecuta el comando de consola del propio juego, como la seleccion y la demo (0x35FB8):
// "run NN_h1.not -S NN.dat" (o NN_db.not -D en DOUBLE), con las banderas de un jugador y del modo en [0x1CFB08].
let online = null, demo = null, corrio = false, vioJuego = false, finalMandado = false;
const BANDERA = { NORMAL: 0x10, HARD: 0x20, CRAZY: 0x400, DOUBLE: 0x80 }, SUFIJO = { NORMAL: 'n1', HARD: 'h1', CRAZY: 'x1', DOUBLE: 'db' };
const COMANDO = 0x2AFCD8;   // el lugar donde la demo arma su comando (la demo no corre en el online)
// ---------- fondo del menu: la pantalla de titulo de verdad, con sus animaciones originales ----------
// En vez del logo (estado 13) va directo al titulo (19 -> 20). Con COIN SETTING en FREE [0x30790A] = 0 (solo en
// memoria: no se graba la EEPROM) el titulo se queda para siempre, sin pedir monedas (JUEGO_REGLAS 2.1).
// El teclado no le llega (principal.js): es solo el fondo que se mueve como en la cabina.
function instalarFondo() {
  C.HLE[0x3B064] = () => { C.w8(0x30790A, 0); C.w32(0x1CA6A0, 19); return 0; };
}
// ---------- desafio online: se elige con la pantalla de seleccion de verdad (Charles, 20/10) ----------
// En vez del logo va directo a la seleccion (estado 10, etapa 0, P1 sumado, FREE solo en memoria): el juego lee
// game.cfg, pone la ruleta, la musica, el reloj y los codigos de opciones, todo como en la cabina. Cuando el jugador
// confirma, el juego ejecuta "run ..." por la consola (0x35FB8): ahi se lo frena, se le pasa a la pagina el comando, las
// banderas de modo [0x1CFB08], la cancion [0x2B3A68], las opciones de P1 [0x1CFB0C] y la skin [0x2AC088] (por si metio
// codigos), y se queda esperando que la pagina lo corte.
function instalarEleccion() {
  C.HLE[0x3B064] = () => { C.w8(0x30790A, 0); C.w32(0x1CFB08, 1); C.w32(0x1CFB04, 0); C.w32(0x1CA6A0, 10); return 0; };
  C.HLE[0x35FB8] = () => {
    const cmd = C.leerTexto(C.R[C.EAX] >>> 0, 80).trim();
    const m = { tipo: 'eleccion', cmd, banderas: C.r32(0x1CFB08), cancion: C.r32(0x2B3A68), opciones: C.r32(0x1CFB0C), skin: C.r32(0x2AC088) };
    postMessage({ tipo: 'registro', s: `eleccion: ${cmd} (banderas 0x${(m.banderas >>> 0).toString(16)}, opciones 0x${(m.opciones >>> 0).toString(16)}, skin ${m.skin})` });
    postMessage(m);
    for (;;) { correrTics(); Atomics.wait(espera, 0, 0, 20); }   // hasta que la pagina lo corte (I[13])
  };
}
function instalarOnline() {
  C.HLE[0x3B064] = () => {
    if (corrio) { C.FN[0x3B064](); return -4; }
    corrio = true;
    const guardados = Int32Array.from(C.R);
    postMessage({ tipo: 'registro', s: 'online: esperando la hora de arranque' });
    // (21/10) cargado y listo: la pagina avisa al salon, y la hora de verdad llega cuando los dos estan listos (D[3]);
    // hasta entonces vale la que vino al arrancar (la de respaldo)
    postMessage({ tipo: 'listoOnline' });
    while (Date.now() < (D[3] > 0 ? D[3] : online.inicioMs)) { correrTics(); Atomics.wait(espera, 0, 0, 10); }
    const nn = String(online.cancion).padStart(2, '0'), doble = online.modo === 'DOUBLE';
    // el comando y las banderas que armo la seleccion de verdad del que desafio (instalarEleccion); si no vienen
    // (desafios de antes), los de siempre por modo
    const cmd = online.cmd || `run ${nn}_${SUFIJO[online.modo]}.not ${doble ? '-D' : '-S'} ${nn}.dat`;
    // (online.dos: la prueba VERSUS del editor, con los dos jugadores)
    C.w32(0x1CFB08, online.cmd ? ((online.banderas | 1) & (online.dos ? -1 : ~2)) : (1 | BANDERA[online.modo]));
    // los modificadores y la skin de cada uno (pantalla MODIFICADORES de online.js): opciones de P1 y [0x2AC088]
    C.w32(0x1CFB0C, online.opciones | 0); C.w32(0x2AC088, online.skin | 0); C.w32(0x2AF80C, 0);
    // run espera que pasen 1200 tics (5 s) desde el ultimo reinicio del contador [0x1CA6D0] (JUEGO_REGLAS 2.5, paso 14).
    // Desde la seleccion ya pasaron siempre; aca recien se prendio, y dentro de este reemplazo el reloj no corre.
    C.w32(0x1CA6D0, 1200);
    // el numero de cancion de la ruleta [0x2B3A68]: lo usan el cargador de la musica (0x3CD74) y el RUSH
    C.w32(0x2B3A68, online.cancion);
    for (let i = 0; i < cmd.length; i++) C.w8(COMANDO + i, cmd.charCodeAt(i));
    C.w8(COMANDO + cmd.length, 0);
    postMessage({ tipo: 'registro', s: 'online: ' + cmd });
    C.R[C.EAX] = COMANDO; C.llamar(0x35FB8, 0);
    C.R.set(guardados);
    return 0;
  };
}
// ---------- modo solo: lo que necesita el ranking (solo.js; se vuelve a crear en cada juego) ----------
let solo = false, seguidorSolo = null, sinCorte = false;

// ---------- modo solo: intro la primera vez y demo si nadie toca (Charles, 20/10) ----------
// En FREE el juego va directo al titulo y se queda ahi: ni logo, ni opening, ni demo (JUEGO_REGLAS 2.1). Para verlos
// se le hace creer que pide monedas (COIN SETTING [0x30790A] = 5, solo en memoria) y, en cuanto alguien toca algo,
// vuelve a FREE y a la espera (estado 0), que en FREE pasa al titulo enseguida (probado en Node: del opening al
// titulo en 1 cuadro). En la demo (estado 2) basta con volver a FREE: el juego la corta solo.
// - intro: desde el arranque hasta que llega al titulo (logo de Andamiro 8 s y opening 17 s). La pagina la pide solo
//   la primera vez y si esta prendida en OPCIONES.
// - demo: si en el titulo nadie toca nada por ESPERA_DEMO, la atraccion de la cabina: una cancion de muestra (35 s),
//   el logo, el opening, el titulo... DEMO SOUND [0x307908] segun OPCIONES.
// Si en el menu de servicio se puso que pida monedas de verdad, nada de esto hace falta y no se toca.
const ESPERA_DEMO = 20000;
let atraccion = null, huboToque = false, avisoLibre = null;
function conMonedas(datos, monedas) {        // la EEPROM con otro COIN SETTING y su Adler-32 rehecho (CABINA 5.2)
  const d = Uint8Array.from(datos);
  d[0x7E] = monedas;
  let a = 1, b = 0;
  for (let i = 0x78; i < 0x80; i++) { a = (a + d[i]) % 65521; b = (b + a) % 65521; }
  new DataView(d.buffer).setUint32(0x74, ((b << 16) | a) >>> 0, true);
  return d;
}
function seguirAtraccion() {
  const a = atraccion, est = C.r32(0x1CA6A0), ahora = performance.now();
  C.w8(0x307908, a.sonido ? 1 : 0);
  const toco = huboToque; huboToque = false;
  if (a.fingiendo) {
    const llegoAlTitulo = a.fingiendo === 'intro' && est === 20;
    if (toco || llegoAlTitulo) {
      a.fingiendo = null; a.quietoDesde = ahora;
      C.w8(0x30790A, 0);
      if (est !== 2) { C.w32(0x1CA6A0, 0); K.musica.parar(); }
      postMessage({ tipo: 'registro', s: toco ? 'atraccion: alguien toco, al titulo' : 'atraccion: termino la intro' });
    }
    return;
  }
  if (toco || (est !== 19 && est !== 20)) { a.quietoDesde = ahora; return; }
  if (a.demo && ahora - a.quietoDesde > ESPERA_DEMO) {
    a.fingiendo = 'demo'; C.w8(0x30790A, 5);
    postMessage({ tipo: 'registro', s: 'atraccion: nadie toca, demo' });
  }
}

// ---------- velocidad elegida con 1 a 9 (principal.js, I[12]; 0 = la del juego) ----------
// 0x24DB0 dibuja las flechas de un jugador. Saca la velocidad v de sus opciones ([0x1CFB0C]/[0x1CFB10] y las al azar
// [0x1CFB14]/[0x1CFB18]: bits 8/4/2 -> x8/x4/x2, si no x1), la deja en ECX y llama a glColor3f (0xDB394, vuelve a
// 0x24E6E); despues todo lo que mide en pantalla (alto de cada fila, largo de las flechas largas) es por ECX.
// glColor3f no toca ECX, asi que a la vuelta de esa llamada se reemplaza v por N. Es solo como se ven: el juzgado
// va por tiempo, no cambia. (No sirve multiplicar [0x1CFB3C]: es la posicion del scroll, no una distancia.)
let ultimaVelocidad = 0;
function instalarVelocidad() {
  const glColor3f = C.HLE[0xDB394];
  C.HLE[0xDB394] = () => {
    const vuelve = C.r32(C.R[C.ESP]) === 0x24E6E, pila = glColor3f();
    if (vuelve) {
      const n = Atomics.load(I, 12);
      if (n >= 1 && n <= 9) {
        if (n !== ultimaVelocidad) postMessage({ tipo: 'registro', s: `velocidad x${n} (el juego tenia x${C.R[1]})` });
        C.R[1] = n;
      }
      ultimaVelocidad = n;
    }
    return pila;
  };
}
// P1 en 0x1CFB7C: puntaje +0, ratio +4 (float), vida +8, combo +0x14, combo maximo +0x16, MISS +0x22 (JUEGO_REGLAS 6)
function marcadorP1() {
  const p = 0x1CFB7C, ratio = C.rf32(p + 4), miss = C.r16(p + 0x22);
  const nota = ratio >= 1 && miss === 0 ? 'S' : ratio >= 0.9 ? 'A' : ratio >= 0.8 ? 'B' : ratio >= 0.7 ? 'C' : ratio >= 0.6 ? 'D' : 'F';
  return { puntaje: C.r32(p) >>> 0, ratio, vida: C.r32(p + 8), combo: C.r16(p + 0x14), comboMax: C.r16(p + 0x16), miss, nota };
}
// (mejora 8, "cuando juego contra alguien quiero ver tambien lo que el hace"): con el marcador van los juicios que hubo
// desde el envio anterior, en orden (P G O B M: PERFECT GREAT GOOD BAD MISS, de las cuentas +0x1A..+0x22 de P1), los
// paneles que se pisaron en ese rato (bits de la placa) y las cuentas enteras. El rival los muestra (online.js).
let vivoAntes = null, vivoJuicios = '', vivoPads = 0;
function seguirVivo() {
  const p = 0x1CFB7C, c = [0x1A, 0x1C, 0x1E, 0x20, 0x22].map((o) => C.r16(p + o));
  if (vivoAntes) for (let i = 0; i < 5; i++) for (let d = c[i] - vivoAntes[i]; d > 0 && vivoJuicios.length < 24; d--) vivoJuicios += 'PGOBM'[i];
  vivoAntes = c; vivoPads |= (K.entradas.p1 | (K.entradas.p2 << 5)) & 0x3FF;
  return c;
}
function seguirOnline() {
  if (!corrio || finalMandado) return;
  const est = C.r32(0x1CA6A0);
  if (est === 2 || est === 4 || est === 5) {
    if (est === 2) vioJuego = true;
    const cuentas = est === 2 ? seguirVivo() : vivoAntes || [0, 0, 0, 0, 0];
    if (cuadros % 15 === 0) {
      postMessage({ tipo: 'marcador', ...marcadorP1(), jugando: true, juicios: vivoJuicios, pads: vivoPads, cuentas });
      vivoJuicios = ''; vivoPads = 0;
    }
    return;
  }
  // salio del juego o del resultado (etapa siguiente, GAME OVER, la espera): termino la partida
  if (vioJuego) {
    finalMandado = true;
    const m = marcadorP1();
    if (est !== 10 && est !== 11) m.nota = 'F';     // FAIL o HEY MAN: no paso por la etapa siguiente
    postMessage({ tipo: 'marcador', ...m, jugando: false, terminado: true });
  }
}

// ---------- opciones de la cabina cuando no hay nada guardado ----------
// Charles (19/10): "que las opciones por defecto ya esten en freeplay sin poner la ficha y que aparezca la pantalla de
// how to play". Sin EEPROM guardada, en vez de una vacia (el juego cargaria las de fabrica: 5 monedas, sin ayuda) va
// una valida (CABINA 5.2): 'PIU4', Adler-32 de los 8 bytes de ajustes y los ajustes de fabrica salvo COIN SETTING = 0
// (FREE) y SHOW HELP = ON (bga\03.dat antes de cada juego). Lo que se cambie en el menu de servicio se guarda igual.
// El online usa siempre las de fabrica (5 monedas, sin ayuda) y no graba: en FREE la espera salta directo al titulo y
// nunca pasa por el logo (0x3B064), que es donde el online mete su "run" (se quedaba en CARGANDO, 19/10). Asi
// ademas los dos juegan con las mismas reglas, tenga cada uno lo que tenga guardado.
function eepromPorDefecto(monedas = 0, ayuda = 1) {
  const d = new Uint8Array(128).fill(0xFF);
  const ajustes = [0, 1, 0, 0, 0, ayuda, monedas, 1];   // libre, LEVEL NORMAL, STAGE BREAK OFF, STAGE COUNT 0, DEMO SOUND OFF, SHOW HELP, monedas por credito (0 = FREE), ?
  d.set([0x50, 0x49, 0x55, 0x34], 0x70);      // 'PIU4' (0x34554950)
  let a = 1, b = 0;
  for (const x of ajustes) { a = (a + x) % 65521; b = (b + a) % 65521; }
  new DataView(d.buffer).setUint32(0x74, ((b << 16) | a) >>> 0, true);
  d.set(ajustes, 0x78);
  return d;
}

// ---------- musica ----------
// Precarga (Charles, 20/10: "al principio de las canciones se pone un poco en pausa los pasos... en algunos equipos"):
// el reloj de los pasos va con la musica, y la pagina tiene que decodificar el MP3 antes de tocarlo; en un equipo lento
// eso tarda 1-3 s y los pasos esperan. Apenas el juego abre el .AUD (mientras carga el fondo y los pasos), se descifra
// aca (CABINA 4.1: Adler-32 + llave del exe) y la pagina lo va decodificando; cuando arranca, ya esta listo.
function precargarMusica(c, r) {
  try {
    if (c.length < 1000) return;
    const K = C.M8.subarray(0x13BF90, 0x13BF90 + 1024), h = new DataView(c.buffer, c.byteOffset).getUint32(0, true);
    const n = +(/(\d\d)\.aud$/.exec(r) || [])[1], larga = /^audio\/\d\d\.aud$/.test(r) ? musicaLarga.get(n) : null;
    let claro = larga ? larga.slice() : null;
    if (!claro) { claro = new Uint8Array(c.length - 4); for (let i = 0; i < claro.length; i++) claro[i] = ESPEJO_B[c[4 + i]] ^ K[(h + i) & 1023]; }
    if (/^audio\/\d\d\.aud$/.test(r)) duracionMusica.set(n, segundosMp3(claro));   // la cancion entera (estirarFin)
    postMessage({ tipo: 'precarga', bytes: claro }, [claro.buffer]);
  } catch (err) { /* sin precarga: se decodifica al arrancar, como antes */ }
}
K.musica.arrancar = (bytes) => {
  D[0] = -1; D[2] = 0;
  // cancion propia mas larga que la placa (recortarAud): a la pagina va la completa
  const larga = musicaLarga.get(C.r32(0x2B3A68));
  if (larga && bytes.length > 100000) bytes = larga.slice();
  postMessage({ tipo: 'musica', bytes }, [bytes.buffer]);
};
K.musica.parar = () => { D[0] = -1; postMessage({ tipo: 'parar' }); };
K.musica.segundos = () => (D[0] < 0 ? -1 : D[0] + (ahoraAbs() - D[1]) / 1000);
K.musica.termino = () => D[2] === 1;
K.efectos.tocar = (efecto, voz, lazo) => postMessage({ tipo: 'efecto', efecto, voz, lazo });

// ---------- reinicio: otro juego en el mismo hilo ----------
// Antes la pagina cerraba este hilo y abria otro para cada juego (fondo del menu -> partida -> fondo...). En la
// notebook (Celeron, 2 nucleos) el segundo tardaba 23 s en arrancar (telemetria 19/10: el viejo seguia ocupando la
// maquina mientras moria). Ahora la pagina levanta I[13]; el juego la ve en el proximo cuadro (correrTics), se corta
// con esta excepcion, avisa "reiniciado" y queda libre para el proximo "iniciar", que deja todo como recien abierto.
class Reinicio extends Error {}
let volcados = null;                       // el codigo y los datos de Piu.exe: se bajan una sola vez
function dejarComoNuevo() {
  C.M8.fill(0); C.R.fill(0);
  Object.assign(C.F, { op: 0, a: 0, b: 0, r: 0, n: 32, cf: 0, zf: 0, sf: 0, of: 0, pf: 0, df: 0 });
  C.FP.st.fill(0); C.FP.top = 0; C.FP.sw = 0; C.FP.cw = 0x037F;
  delete C.HLE[0x3B064]; delete C.HLE[0x35FB8]; delete C.HLE[0x2EEE8]; delete C.HLE[0x37750]; delete C.HLE[0x40D28];
  for (const d of CARRIL_CENTRO) delete C.HLE[d];          // FLECHAS AL CENTRO
  for (const d of [0x31154, 0x31740, 0x31D20]) delete C.HLE[d];   // los ponen el fondo, el online o la eleccion; G.instalarGL repone glColor3f
  S.reiniciarSistema(); reiniciarZlib();
  Object.assign(K.entradas, { p1: 0, p2: 0, botones: 0 }); Object.assign(K.luces, { a4: 0, a6: 0, cambios: 0 }); K.musica.sonando = false;
  Object.assign(G.estadoGL, { viewport: [0, 0, 640, 480], cuadros: 0 });
  cmds = []; transferir = []; sigTex = 1;
  t0 = 0; tics = 0; cuadros = 0; ultimoCuadro = 0;
  entradas.fill(0); ultimoCambio.clear(); cola.length = 0;
  corrio = false; vioJuego = false; finalMandado = false; ultimaVelocidad = 0;
  vivoAntes = null; vivoJuicios = ''; vivoPads = 0; cuadroEnCamino = false; trabados = 0;
}

// ---------- arranque ----------
let corridas = 0;
onmessage = (e) => {
  if (e.data.tipo !== 'iniciar') return;
  I = new Int32Array(e.data.I); D = new Float64Array(e.data.D); Q = new Float64Array(e.data.Q);
  if (corridas++) dejarComoNuevo();
  anotarEntradas = !!e.data.anotarEntradas;
  leidos = e.data.leidos | 0;              // los toques de antes de abrir este juego no cuentan
  online = e.data.online || null;
  demo = e.data.demo || null;
  solo = !!e.data.solo;
  sinCorte = !!online || !!e.data.sinCorte;
  practica = !!e.data.practica;
  avisarEleccion = !!e.data.eleccion;
  modsSolo = solo && e.data.modsSolo ? e.data.modsSolo : null;
  seguidorSolo = solo ? crearSeguidorSolo((m) => postMessage(m)) : null;
  if (online) instalarOnline();
  else if (e.data.eleccion) instalarEleccion();
  if (e.data.desbloqueado) instalarDesbloqueado();
  if (e.data.fondoBga && !e.data.fondo && !e.data.eleccion) instalarFondoBga(e.data.fondoBga);
  if (e.data.carrilCentro && !e.data.fondo && !e.data.eleccion) instalarCarrilCentro();
  else if (e.data.fondo) instalarFondo();
  try {
    if (!volcados) volcados = [traer(BASE + 'volcados/codigo_0x20000.bin'), traer(BASE + 'volcados/datos_0x130000.bin')];
    C.cargar(0x20000, volcados[0]);
    C.cargar(0x130000, volcados[1]);
    aplicarArreglos(demo);
    // (en el online las propias no: si la cancion es propia viene en el paquete, ya revisado, y es la del que desafio)
    if (demo || e.data.fondo || online) propias = []; else cargarPropias();
    if (propias.length) instalarDibujoPropias();
    // PAQUETE de una cancion propia en el online (online.js + paquete.js; EDITOR_MASTER.md etapas 3 y 4): sus pasos y su
    // musica, ya rearmados desde cero, y el fondo es el video REMIX del disco que eligio quien la hizo
    const pq = online && e.data.paquete, nPq = pq ? String(online.cancion).padStart(2, '0') : '';
    const delPaquete = (r) => {
      if (r === 'step/' + pq.archivo) return pq.not;
      if (r === `audio/${nPq}.aud`) return pq.aud.length > TOPE_PLACA ? recortarAud(pq.aud, online.cancion) : pq.aud;
      if (r === `bga/${nPq}.dat`) return traer(BASE + `disco/bga/${String(pq.video).padStart(2, '0')}.dat`);
      return null;
    };
    musicaLarga.clear();
    S.fijarLectorDeArchivos((ruta) => {
      if (Atomics.load(I, 13) === 1) throw new Reinicio();   // mientras arranca no hay cuadros: cortar tambien al abrir archivos
      // en minuscula: en el hosting (Linux) los nombres distinguen mayusculas y el disco se sube todo en minuscula
      const r = ruta.replace(/\\/g, '/').replace(/^[a-z]:\//i, '').replace(/^\.\//, '').replace(/^piu\//i, '').toLowerCase();
      // PROBAR del editor: sus pasos en vez de los del disco (online.js probarPasos)
      if (e.data.pasos && r === 'step/' + e.data.pasos.archivo) return e.data.pasos.bytes;
      // canciones propias del editor (82-99): sus archivos desde guardado\canciones, el fondo es el del remix elegido
      const propio = pq ? delPaquete(r) : propias.length ? archivoPropio(r) : null;
      if (propio) { if (/^audio\/[dr]?\d\d\.aud$/.test(r)) precargarMusica(propio, r); return propio; }
      if (r === 'game.cfg') {
        let cfg = null;
        // la demo web (port\config.json): su propia lista, game_demo.cfg (tools\armar_demo_web.mjs)
        if (demo) cfg = traer(BASE + 'port/game_demo.cfg');
        // desafio en la build de Edge: solo las canciones del online (tools\armar_demo_web.mjs arma game_online.cfg)
        else if (e.data.eleccion) cfg = traer(BASE + 'port/game_online.cfg');
        // F7 "lista con todo" (I[11] = 1) o TODO DESBLOQUEADO: en vez del game.cfg del disco, el que suma los pasos que
        // nunca se ofrecian (app\port\game_con_todo.cfg, tools\armar_lista_con_todo.mjs). Se lee al empezar cada credito.
        if (!cfg && (Atomics.load(I, 11) === 1 || e.data.desbloqueado)) {
          postMessage({ tipo: 'registro', s: 'lista con todo: game_con_todo.cfg' });
          cfg = traer(BASE + 'port/game_con_todo.cfg');
        }
        if (!cfg) cfg = traer(BASE + 'disco/' + r);
        // las canciones propias van en el modo solo y en la PC/build (en la web no hay)
        // (y en la seleccion del desafio de la build: una propia viaja al rival en un paquete)
        const conPropias = cfg && !online ? sumarPropias(cfg) : cfg;
        return conPropias && e.data.desbloqueado ? desbloquear(conPropias) : conPropias;
      }
      const b = traer(BASE + 'disco/' + r);
      if (b && /^audio\/[dr]?\d\d\.aud$/.test(r)) precargarMusica(b, r);
      return b;
    });
    S.fijarAnotar((s) => postMessage({ tipo: 'registro', s }));
    // EEPROM de la cabina (opciones del menu de servicio): en la PC la guarda el servidor en guardado\eeprom.bin; en
    // el hosting no hay donde, asi que va al navegador (la pagina la guarda y la manda al arrancar, e.data.eeprom)
    const ee = traer(BASE + 'guardado/eeprom.bin') || e.data.eeprom;
    // (la seleccion del desafio tambien: en FREE la espera no pasa por el logo, donde instalarEleccion la manda a elegir)
    K.eeprom.datos.set(online || e.data.eleccion ? eepromPorDefecto(5, 0) : ee && ee.length === 128 ? ee : eepromPorDefecto());
    // modo solo en FREE: intro y demo (seguirAtraccion). Para la intro el juego arranca creyendo que pide monedas.
    atraccion = null; huboToque = false; avisoLibre = null;
    if (solo && e.data.atraccion && K.eeprom.datos[0x7E] === 0) {
      const o = e.data.atraccion;
      atraccion = { demo: !!o.demo, sonido: !!o.sonido, fingiendo: o.intro ? 'intro' : null, quietoDesde: performance.now() };
      if (o.intro) K.eeprom.datos.set(conMonedas(K.eeprom.datos, 5));
    }
    K.eeprom.guardar = (datos) => {
      // el fondo del menu nunca graba (tiene COIN SETTING en FREE solo en memoria), ni el online (las de fabrica fijas)
      if (e.data.fondo || online || e.data.eleccion) { postMessage({ tipo: 'registro', s: 'eeprom: el fondo del menu y el online no graban' }); return; }
      let ok = false;
      try { const x = new XMLHttpRequest(); x.open('PUT', BASE + 'guardado/eeprom.bin', false); x.send(datos); ok = x.status >= 200 && x.status < 300; }
      catch (err) { /* sin servidor que guarde */ }
      postMessage({ tipo: 'eeprom', datos, enServidor: ok });
    };
    // "PSP" de DOS en 0 y entorno en 0x1000, como en tools\recompilador\arrancar.mjs
    C.M8.fill(0, 0, 0x2000); C.w16(0x2C, 0x100); C.M8[0x81] = 13;
    const entorno = 'PATH=C:\\\0DOS4G=QUIET\0FX_GLIDE_NO_SPLASH=1\0\0\x01\0C:\\PIU\\PIU.EXE\0';
    for (let i = 0; i < entorno.length; i++) C.M8[0x1000 + i] = entorno.charCodeAt(i);
    C.R[C.ESP] = S.ARRANQUE.esp;
    G.instalarGL(grabador);
    instalarVelocidad();                   // va despues: envuelve glColor3f
    t0 = performance.now();
    postMessage({ tipo: 'listo' });
    C.FN[S.ARRANQUE.eip]();
    postMessage({ tipo: 'fin', motivo: 'el programa termino' });
  } catch (err) {
    if (err instanceof Reinicio) { Atomics.store(I, 13, 0); postMessage({ tipo: 'reiniciado' }); return; }
    postMessage({ tipo: 'fin', motivo: (err && err.message) || String(err), pila: (err && err.stack || '').split('\n').filter(l => /f_[0-9a-f]+/.test(l)).slice(0, 8).map(l => l.trim().replace(/\(.*\)/, '')).join(' < ') });
  }
};
