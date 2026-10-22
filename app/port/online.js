// Menu principal, nickname, controles, salon online (chat, desafios), marcador del rival, resultado y ranking.
// Todo dibujado con los graficos del propio juego, que se leen y descifran del mismo disco que usa el juego:
// TITLE.DAT (fondo y logo, armados con los mosaicos de TITLE.SP2), SELECT.DAT (carteles de modo, marco, botones),
// GRADE.DAT (S A B C D F, WIN, LOSE), 00.DAT (la letra FONT.PNG: grilla de 8x15, ASCII desde el espacio) y las
// caratulas TITLE\tNN.pnz. La llave de las caratulas y la musica esta en los datos del exe (0x13BF90, corrida 518).
// El salon habla con ../online/api.php (app\online). La pagina (principal.js) le presta arrancar/terminar el juego.
import { abrirPaquete, descifrarPnz, descifrarAudio, leerPasos } from '../motor/cifrados.js';
import { esTactil } from './tactil.js';
import { iniciarEditor, abrirEditor, dibujarEditor, teclaEditor, volverDePrueba, archivoDe } from './editor.js';
import { revisarPaquete } from './paquete.js';

export const CANCIONES = [
  { n: 60, nombre: 'BEETHOVEN VIRUS', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 12, nombre: 'MR. LARPUS', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 8, nombre: 'EXTRAVAGANZA', modos: ['HARD', 'CRAZY', 'DOUBLE'] },
  { n: 23, nombre: 'TURKEY MARCH', modos: ['HARD', 'CRAZY', 'DOUBLE'] },
  { n: 58, nombre: 'RUN TO YOU', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 15, nombre: 'JA-CHAEK', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 13, nombre: 'BIG MONEY', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 67, nombre: 'SLAM', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 19, nombre: 'FINAL AUDITION', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  // 9 mas (20/10)
  { n: 44, nombre: 'LAZENCA, SAVE US', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 9, nombre: 'FUNKY JOCKEY', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 40, nombre: 'MONKEY MAGIC', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 11, nombre: 'STARIAN', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 42, nombre: 'BLIND FAITH', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 10, nombre: 'PUMPING JUMPING', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 64, nombre: 'HA YEO GA', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 48, nombre: 'FEVER', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 22, nombre: 'FIRST LOVE', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  // 4 mas (20/10)
  { n: 63, nombre: 'PIL SEUNG', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 65, nombre: 'YOU IN FANTASY', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 66, nombre: 'BONACCIA', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
  { n: 47, nombre: 'PIERROT', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  // 10 mas (20/10 22:10; los nombres, de sus caratulas)
  { n: 4, nombre: 'YA HWA', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 6, nombre: 'MEORI CHIWO', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 14, nombre: 'WAYO WAYO', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 16, nombre: 'CAUTION', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 24, nombre: 'CHAJGIL BARAE', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 26, nombre: 'ANOTHER TRUTH', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 33, nombre: 'PASSION', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 45, nombre: 'BAT NOL I', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 55, nombre: 'MU HON', modos: ['NORMAL', 'HARD', 'DOUBLE'] },
  { n: 61, nombre: 'OUR MEMORIES', modos: ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE'] },
];
const CREDITOS = 'CREDITS BY RAVENLIGHT - RAVENLIGHT.NET';
// ---------- conexion con el salon (ranking y online): se prueba al arrancar y cada 30 s ----------
let conexion = null;
async function probarConexion() {
  try { const r = await fetch(API, { method: 'POST', body: JSON.stringify({ accion: 'ranking' }) }); conexion = r.ok; if (r.ok) { const j = await r.json(); ranking = ranking || j; rankingSolo = rankingSolo || j.solo; } }
  catch (e) { conexion = false; }
}
setTimeout(() => { probarConexion(); setInterval(probarConexion, 30000); }, 1500);
// el aviso, arriba a la derecha: verde si responde, gris si no
function h_conexion(s, ok) {
  x.fillStyle = 'rgba(0,0,30,.6)'; x.fillRect(634 - s.length * 8 - 22, 4, s.length * 8 + 22, 18);
  x.fillStyle = ok ? '#7dff7a' : ok === false ? '#ff5a5a' : '#8a90a6'; x.beginPath(); x.arc(634 - s.length * 8 - 12, 13, 4, 0, 7); x.fill();
  texto(x, s, 632 - s.length * 8, 6, 1, ok ? 'verde' : 'gris');
}
const nn = (n) => String(n).padStart(2, '0');
const cancion = (n) => CANCIONES.find(c => c.n === n);
// las que la seleccion de verdad tambien ofrece: las ocultas de CRAZY y el remix de REMIX (no tienen caratula cargada)
const OTRAS = { 7: 'TRASH MAN', 20: 'HOLIDAY', 21: 'RADETZKY CAN CAN', 52: 'REMIX IGNITION + EXTRA', 32: 'REMIX SELECT + GOODBYE', 53: 'REMIX KISS + SHE WAS PRETTY' };
const nombreDe = (n) => (cancion(n) || {}).nombre || OTRAS[n] || `CANCION ${n}`;
// el modo segun las banderas de [0x1CFB08] que deja la seleccion (JUEGO_REGLAS 3.3)
const modoDe = (b) => (b & 0x80 ? 'DOUBLE' : b & 0x400 ? 'CRAZY' : b & 0x100 ? 'REMIX' : b & 0x20 ? 'HARD' : 'NORMAL');
// en la web, el salon del mismo sitio; en la build de Edge (window.piuBuild), el del hosting: ranking y online compartidos
export const API = window.piuBuild ? 'https://ravenlight.net/piu/online/api.php' : new URL('../online/api.php', location.href).href;
const DISCO = new URL('../disco/', location.href).href;
const VOLCADOS = new URL('../volcados/', location.href).href;

// ---------- recursos del juego ----------
const R = { listo: false };
async function traer(url) { const r = await fetch(url); if (!r.ok) throw new Error('falta ' + url); return new Uint8Array(await r.arrayBuffer()); }
const imagen = (bytes) => createImageBitmap(new Blob([bytes], { type: 'image/png' }));
async function paquete(nombre) {
  const p = abrirPaquete(await traer(DISCO + ('bga/' + nombre).toLowerCase()));   // en minuscula: el hosting distingue
  const m = {};
  for (const a of p.archivos) m[a.nombre.toUpperCase()] = a;
  return { png: (n) => imagen(m[n.toUpperCase()].datos()), texto: (n) => new TextDecoder('latin1').decode(m[n.toUpperCase()].datos()) };
}
// mosaicos de 256 (la pantalla de 640x480 son 2,5 x 2 piezas, como en TITLE.SP2)
function armar640(p) {
  const c = new OffscreenCanvas(640, 480), x = c.getContext('2d');
  x.drawImage(p[0], 0, 0); x.drawImage(p[1], 256, 0); x.drawImage(p[2], 0, 0, 256, 224, 0, 256, 256, 224); x.drawImage(p[3], 0, 0, 256, 224, 256, 256, 256, 224);
  x.drawImage(p[4], 0, 0, 128, 256, 512, 0, 128, 256); x.drawImage(p[4], 128, 0, 128, 224, 512, 256, 128, 224);
  return c;
}
function teñir(img, color) {
  const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, img.width, img.height);
  return c;
}
async function cargarRecursos() {
  if (R.listo) return;
  const datos = await traer(VOLCADOS + 'datos_0x130000.bin'), e = datos.subarray(0x13bf90 - 0x130000, 0x13bf90 - 0x130000 + 1024);
  R.llave = new Uint8Array(1024); for (let i = 0; i < 1024; i++) R.llave[i] = e[(i + 518) % 1024];
  const [t, s, g, o, nv] = await Promise.all(['TITLE.DAT', 'SELECT.DAT', 'GRADE.DAT', '00.DAT', 'SNOW.DAT'].map(paquete));
  R.fondo = armar640(await Promise.all(['BG11', 'BG12', 'BG13', 'BG14', 'BG15'].map(n => t.png(n + '.PNG'))));
  // nieve (SNOW.DAT: un copo de 32x32) y destellos de la pantalla de titulo (LIGHT01 grande, LIGHT05/25 de a 4 chicos)
  R.copo = await nv.png('SNOW.PNG');
  [R.destello, R.destellos1, R.destellos2] = await Promise.all(['LIGHT01', 'LIGHT05', 'LIGHT25'].map(n => t.png(n + '.PNG')));
  R.logo = armar640(await Promise.all(['LG1', 'LG2', 'LG3', 'LG4', 'LG5'].map(n => t.png(n + '.PNG'))));
  [R.modo1, R.modo2, R.marco, R.boton, R.flechas] = await Promise.all(['MODE1', 'MODE2', 'GLOW', 'SHIFT', 'ARR'].map(n => s.png(n + '.PNG')));
  // para el ranking (20/10, "como el juego original"): las barras de color y los nombres de modo de la seleccion y
  // los numeros cromados de la pantalla de resultado
  [R.bar1, R.bar2, R.bar3, R.nombresModo] = await Promise.all(['BAR1', 'BAR2', 'BAR3', 'MODENAME'].map(n => s.png(n + '.PNG')));
  R.numeros = await g.png('NUM.PNG');
  R.reloj = await s.png('TIME.PNG');
  R.notas = {}; for (const l of ['S', 'A', 'B', 'C', 'D', 'F']) R.notas[l] = await g.png(l + l + l + '.PNG');
  [R.gano, R.perdio] = await Promise.all([g.png('WIN.PNG'), g.png('LOSE.PNG')]);
  R.evento = await o.png('EVENT.PNG');
  [R.arrow01, R.arrow03] = await Promise.all([o.png('ARROW01.PNG'), o.png('ARROW03.PNG')]);   // las flechas del editor
  // (21/10) las skins de flechas 1-8 de bga\arrow.dat, para mostrarlas con su dibujo: de cada ARROWn.SP2 la primera
  // pieza ("T arrow0 hoja.tga  x y w h  xs ys ws hs": los cuatro ultimos son el pedazo de la hoja)
  // (y todas sus piezas, para el AVATAR: OPCIONES > AVATAR, 21/10)
  try {
    const a = await paquete('ARROW.DAT'), hojas = new Map(); R.skins = {};
    for (let n = 1; n <= 8; n++) {
      const piezas = [];
      for (const l of a.texto(`ARROW${n}.SP2`).split(/\r?\n/).filter((s) => /^T\s/.test(s.trim()))) {
        const p = l.trim().split(/\s+/), hoja = p[2].replace(/\.tga$/i, '.PNG');
        if (!hojas.has(hoja)) hojas.set(hoja, await a.png(hoja));
        piezas.push({ img: hojas.get(hoja), sx: +p[7], sy: +p[8], sw: +p[9], sh: +p[10] });
      }
      if (piezas.length) R.skins[n] = { ...piezas[0], piezas: piezas.slice(0, 8) };
    }
  } catch (e) { R.skins = null; }
  const letra = await o.png('FONT.PNG');
  R.letras = { blanco: letra, amarillo: teñir(letra, '#ffd23f'), celeste: teñir(letra, '#5fd0ff'), rojo: teñir(letra, '#ff5a5a'), gris: teñir(letra, '#8a90a6'), verde: teñir(letra, '#7dff7a') };
  R.caratulas = {};
  await Promise.all(CANCIONES.map(async (c) => { R.caratulas[c.n] = await imagen(descifrarPnz(await traer(DISCO + `title/t${nn(c.n)}.pnz`), R.llave)); }));
  R.listo = true;
}
// el cartel de cada modo dentro de MODE1/MODE2 (filas medidas: 1-77, 82-157, 162-237)
const CARTEL = { NORMAL: ['modo1', 1], HARD: ['modo1', 82], CRAZY: ['modo1', 162], DOUBLE: ['modo2', 1], BATTLE: ['modo2', 82] };
function cartel(x, modo, cx, cy, ancho) {
  if (!CARTEL[modo]) { texto(x, modo, cx, cy - 15, 2, 'amarillo', true); return; }   // REMIX no tiene cartel en SELECT.DAT
  const [hoja, y0] = CARTEL[modo], alto = ancho * 77 / 256;
  x.drawImage(R[hoja], 0, y0, 256, 77, cx - ancho / 2, cy - alto / 2, ancho, alto);
}
// texto con la letra del juego (las letras que no tiene, como la ñ o las tildes, salen con una letra comun)
function texto(x, s, px, py, esc = 2, color = 'blanco', centro = false) {
  s = String(s);
  const w = 8 * esc, h = 15 * esc;
  if (centro) px -= (s.length * w) / 2;
  const hoja = R.letras[color];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i), k = c - 32;
    if (k >= 0 && k < 95) x.drawImage(hoja, (k % 32) * 8, Math.floor(k / 32) * 15, 8, 15, px + i * w, py, w, h);
    else { x.fillStyle = color === 'blanco' ? '#fff' : color === 'amarillo' ? '#ffd23f' : '#5fd0ff'; x.font = `bold ${h * 0.8}px sans-serif`; x.textBaseline = 'top'; x.fillText(s[i], px + i * w, py); }
  }
}

// ---------- estado de la interfaz ----------
let J = null;                      // lo que presta principal.js
let lienzo, x, entrada;            // canvas de la interfaz y el <input> escondido para escribir
let pantalla = 'cargando', cursor = 0, cursor2 = 0, mensaje = '', mensajeHasta = 0, escribiendo = false;
const op = { nick: '', controles: 'izquierda', intro: true, demo: true, demoSonido: true, panelesDos: false, desbloqueado: false, sinCorte: false,
  tamanoPads: 1, vibrar: true, usb: null, desfase: 0, fondo: 0, cuenta: 5, teclas: null, volumen: 1, panelMods: false, pin: '', vistaRival: 'juego', carril: 'lugar', avatar: null, pantalla: 'original',
  mods: { velocidad: 1, vanish: 0, mirror: false, random: false, banda: false, azar: false, skin: 0 } };
let introVista = false;            // la intro del modo solo, una sola vez por visita
const sala = { yo: null, jugadores: [], chat: [], desafios: [], partida: null, chatDesde: 0, desfase: 0, sondeo: 0, errores: 0 };
let elegido = { cancion: 0, modo: 0, rival: null }, ranking = null, resultado = null, previa = null;
// modo solo (20/10): nombre, ranking del servidor (api.php solo_*), cancion del centro de la seleccion y etapas jugadas
let destinoNick = 'online', soloNick = '', rankingSolo = null, ruleta = null, soloEtapas = [], sesionFin = null, paginaRanking = 0;

function avisar(s, seg = 3) { mensaje = s; mensajeHasta = performance.now() + seg * 1000; }
async function api(cuerpo) {
  const r = await fetch(API, { method: 'POST', body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({ error: 'el salon no respondio bien' }));
  if (j.error) throw Object.assign(new Error(j.error), { codigo: r.status });
  if (j.ahora) sala.desfase = j.ahora * 1000 - Date.now();
  return j;
}
const credencial = () => ({ id: sala.yo.id, clave: sala.yo.clave });
const ahoraServidor = () => Date.now() + sala.desfase;

// ---------- vistas previas (AUDIO\Dnn.AUD) al elegir cancion, con el mismo audio que la pagina ----------
let audioCtx = null, fuentePrevia = null;
async function tocarPrevia(n) {
  pararPrevia();
  try {
    audioCtx = audioCtx || J.audio();
    const mp3 = descifrarAudio(await traer(DISCO + `audio/d${nn(n)}.aud`), R.llave);
    if (!mp3 || elegido.cancion !== CANCIONES.findIndex(c => c.n === n)) return;
    const b = await audioCtx.decodeAudioData(mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength));
    pararPrevia();
    fuentePrevia = audioCtx.createBufferSource(); fuentePrevia.buffer = b; fuentePrevia.connect(audioCtx.destination); fuentePrevia.start();
  } catch (e) { /* sin vista previa */ }
}
function pararPrevia() { if (fuentePrevia) { try { fuentePrevia.stop(); } catch (e) { /* ya parada */ } fuentePrevia = null; } }

// ---------- opciones guardadas (nickname y controles) ----------
async function cargarOpciones() {
  try { Object.assign(op, JSON.parse(localStorage.getItem('piu_online') || '{}')); } catch (e) { /* sin almacenamiento */ }
  const o = await J.opciones();
  if (o && o.online) Object.assign(op, o.online);
}
function guardarOpciones() {
  try { localStorage.setItem('piu_online', JSON.stringify(op)); } catch (e) { /* sin almacenamiento */ }
  J.guardarOpciones({ online: { ...op } });
}
// la clave al azar de este aparato: es el dueño de "tu version" en el hosting y de los edits de la comunidad. Va con las
// opciones (en la build, guardado\opciones.json: su localStorage cambia con el puerto de cada arranque)
function claveDueno() {
  if (!/^[a-f0-9]{32}$/.test(op.clave || '')) {
    let k = null; try { k = localStorage.getItem('piu_clave_pasos'); } catch (e) { /* sin almacenamiento */ }
    if (!/^[a-f0-9]{32}$/.test(k || '')) k = [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
    op.clave = k; guardarOpciones();
  }
  return op.clave;
}

// ---------- sala: consulta periodica ----------
let consultando = false;
async function sondear() {
  if (!sala.yo || consultando) return;          // una consulta por vez (en un celular lento no se apilan)
  consultando = true;
  try {
    const e = await api(pantalla === 'mirando' ? { accion: 'mirar', ...credencial(), partida: mirar.id, chatDesde: sala.chatDesde } : { accion: 'estado', ...credencial(), chatDesde: sala.chatDesde });
    sala.errores = 0;
    if (pantalla === 'mirando' && e.mirada) mirar.datos = e.mirada;
    actualizarSala(e);
  } catch (err) {
    if (err.codigo === 401) { sala.yo = null; pantalla = 'menu'; avisar('Se corto la conexion con el salon'); }
    else if (++sala.errores === 5) avisar('El salon no responde...');
  } finally { consultando = false; }
}
function actualizarSala(e) {
  sala.jugadores = e.jugadores; sala.desafios = e.desafios;
  // solo los nuevos: algunas respuestas (desafiar, responder, chat) traen el chat entero y se repetia
  for (const m of e.chat) if (m.n > sala.chatDesde) { sala.chat.push(m); sala.chatDesde = m.n; }
  sala.chat = sala.chat.slice(-40);
  const antes = sala.partida;
  sala.partida = e.partida;
  // (21/10) los dos ya cargaron: la hora de arranque de verdad (el salon la pone con la cuenta configurada)
  if (e.partida && e.partida.arrancada) J.fijarInicio(e.partida.inicio * 1000 - sala.desfase);
  // una cancion propia que me mandan: se empieza a bajar y a revisar apenas llega el desafio
  for (const d of e.desafios) if (!d.mio && d.paquete && !paquetes.has(d.paquete.pq)) bajarPaquete(d);
  // (mejora 11) una del disco: su musica y su video se bajan mientras se espera que acepten
  for (const d of e.desafios) if (!d.paquete) precalentar(d.cancion);
  if (e.partida && !antes && (pantalla === 'sala' || pantalla === 'esperando' || pantalla === 'elegir')) empezarPartida(e.partida);
  if (pantalla === 'esperando' && !e.partida && !e.desafios.some(d => d.mio)) { pantalla = 'sala'; avisar('No aceptaron el desafio (o se vencio)'); }
  pruebaAutomatica();
}
// solo para las pruebas: ?desafiar=Nick (desafia a la primera cancion apenas lo ve) y ?aceptar (acepta solo)
const Q = new URLSearchParams(location.search);
function pruebaAutomatica() {
  if (pantalla !== 'sala') return;
  const otro = Q.get('desafiar') && sala.jugadores.find(j => j.nick === Q.get('desafiar') && j.estado === 'sala');
  if (otro && !sala.desafios.some(d => d.mio)) {
    pantalla = 'esperando';
    api({ accion: 'desafiar', ...credencial(), a: otro.id, cancion: +(Q.get('cancion') || 60), modo: Q.get('modo') || 'NORMAL' }).then(actualizarSala).catch(er => { avisar(er.message); pantalla = 'sala'; });
  }
  const d = Q.has('aceptar') && sala.desafios.find(d => !d.mio);
  if (d) api({ accion: 'responder', ...credencial(), desafio: d.id, acepta: true }).then(actualizarSala).catch(() => {});
}
setInterval(() => { if (sala.yo && pantalla !== 'jugando') sondear(); }, 700);

// ---------- partida ----------
function empezarPartida(p) {
  pararPrevia();
  // cancion propia: tiene que estar recibida y revisada (paquete.js); si no, no se juega
  const est = p.paquete && paquetes.get(p.paquete.pq);
  if (p.paquete && (!est || est.estado !== 'listo')) { avisar('La cancion propia no llego entera: se cancela la partida', 5); volverASala(); return; }
  pantalla = 'cuenta';
  resultado = null;
  vistas.clear(); prepararCarril(p);           // el carril del rival "como en el juego"
  // el juego arranca la cancion a la hora acordada (p.inicio, del servidor) pasada a la hora de esta PC, con el comando
  // que armo la seleccion del que desafio y los modificadores de cada uno
  J.arrancar({ online: { cancion: p.cancion, modo: p.modo, inicioMs: p.inicio * 1000 - sala.desfase, controles: op.controles,
    cmd: p.cmd || '', banderas: p.banderas | 0, opciones: aBits(op.mods), skin: op.mods.skin | 0 },
    paquete: est ? { archivo: est.limpio.meta.archivo, video: est.limpio.meta.video, not: est.limpio.not, aud: est.limpio.aud } : null });
  avisar(`${nombreCon(p)} · ${p.modo}`, 5);
}
// ---------- mejora 11 (Charles 20/10): cargar la cancion del desafio mientras se espera ----------
// Apenas hay un desafio (mandado o recibido) se piden su .AUD y su .DAT: quedan en la cache del navegador (el hosting
// los deja un dia, .htaccess) y cuando arranca la partida el juego los lee de ahi, sin esperar la red.
const calientes = new Set();
function precalentar(n) {
  if (calientes.has(n) || !(n > 0 && n < 82)) return;
  calientes.add(n);
  for (const a of [`audio/${nn(n)}.aud`, `bga/${nn(n)}.dat`]) fetch(DISCO + a).then((r) => r.arrayBuffer()).catch(() => calientes.delete(n));
}
// ---------- canciones propias en el online (EDITOR_MASTER.md etapas 3 y 4; Charles 20/10) ----------
// El que desafia con una propia (82-99, solo existen en la build) la sube de a trozos antes de desafiar; el que recibe
// la baja mientras decide y la revisa entera (paquete.js: cada archivo rearmado desde cero) antes de poder aceptar.
// El servidor la revisa igual al recibirla (api.php cerrarPaquete). El .DAT no viaja: el fondo es un video REMIX.
const TROZO = 524288, paquetes = new Map();       // pq -> { estado: bajando|listo|error, progreso, limpio, error }
let subida = null;                                 // { progreso } mientras sube la propia
const nombreCon = (d) => (d && d.paquete ? d.paquete.nombre + ' (PROPIA)' : nombreDe(d.cancion));
const portadaDe = (n, paq) => { const e = paq && paquetes.get(paq.pq); return e && e.limpio ? e.limpio.portada : cancion(n) ? R.caratulas[n] : null; };
const aBase64 = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); };
const deBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const GUARDADO_PROPIAS = () => new URL('../guardado/canciones/', location.href).href;
async function datosPropia(n) {
  const r = await fetch(GUARDADO_PROPIAS() + 'canciones.json', { cache: 'no-store' });
  const c = r.ok ? ((await r.json()).canciones || []).find((s) => s.n === n) : null;
  if (!c) throw new Error('no encuentro esa cancion propia');
  return c;
}
async function subirPropia(e) {
  const n = e.cancion, c = await datosPropia(n), archivo = ((/run (\d\d_[a-z0-9]+\.not)/i.exec(e.cmd) || [])[1] || '').toLowerCase();
  const crudo = { not: await traer(GUARDADO_PROPIAS() + archivo), aud: await traer(GUARDADO_PROPIAS() + `${n}.aud`), pnz: await traer(GUARDADO_PROPIAS() + `t${n}.pnz`) };
  // la misma revision que va a hacer el otro: si la propia no la pasa, mejor saberlo aca
  const limpio = await revisarPaquete(crudo, { archivo, video: c.video, nombre: c.nombre, artista: c.artista }, n, R.llave);
  const partes = { not: limpio.not, aud: limpio.aud, pnz: crudo.pnz }, total = limpio.not.length + limpio.aud.length + crudo.pnz.length;
  let pq = '', hecho = 0;
  subida = { progreso: 0 };
  try {
    for (const [tipo, b] of Object.entries(partes)) for (let i = 0, k = 0; i < b.length; i += TROZO, k++) {
      const r = await api({ accion: 'paquete_trozo', ...credencial(), pq, tipo, parte: k, datos: aBase64(b.subarray(i, i + TROZO)) });
      pq = r.pq; hecho += Math.min(TROZO, b.length - i); subida.progreso = hecho / total;
    }
  } finally { subida = null; }
  paquetes.set(pq, { estado: 'listo', progreso: 1, limpio });
  return { pq, meta: limpio.meta };
}
async function bajarPaquete(d) {
  const meta = d.paquete; if (paquetes.has(meta.pq)) return;
  const est = { estado: 'bajando', progreso: 0 }; paquetes.set(meta.pq, est);
  try {
    const crudo = {}, PESO = { not: 0.03, aud: 0.9, pnz: 0.07 }; let base = 0;
    for (const tipo of ['not', 'aud', 'pnz']) {
      const trozos = []; let partes = 1;
      for (let k = 0; k < partes; k++) {
        const r = await api({ accion: 'paquete_bajar', ...credencial(), pq: meta.pq, tipo, parte: k });
        partes = Math.min(r.partes | 0, 20); trozos.push(deBase64(r.datos));
        est.progreso = base + PESO[tipo] * (k + 1) / partes;
      }
      const largo = trozos.reduce((s, t) => s + t.length, 0), b = new Uint8Array(largo); let o = 0; for (const t of trozos) { b.set(t, o); o += t.length; }
      crudo[tipo] = b; base += PESO[tipo];
    }
    est.limpio = await revisarPaquete(crudo, meta, d.cancion, R.llave);
    est.estado = 'listo'; est.progreso = 1;
  } catch (er) {
    est.estado = 'error'; est.error = er.message;
    // si no pasa la revision, se rechaza solo (nunca se juega con algo que no cierra)
    if (sala.desafios.some((o) => o.id === d.id)) api({ accion: 'responder', ...credencial(), desafio: d.id, acepta: false }).then(actualizarSala).catch(() => {});
    avisar('La cancion que te mandaron no paso la revision: se rechazo el desafio', 6);
  }
}
// ---------- PROBAR del editor: la cancion arranca sola en el juego de verdad con los pasos del editor ----------
// Como el online (trabajador.js instalarOnline: "run ..." por la consola, sin corte por MISS) pero el .NOT lo da el
// editor (cfg.pasos: el lector de archivos lo entrega en vez del del disco). Al terminar o con Esc vuelve a la grilla.
// practica (mejora 13, editor.js practicar): { desde (s de la cancion), velocidad } y se repite sola hasta Esc
let practicaActual = null;
function probarPasos(e, bytes, practica = null) {
  // VERSUS (_2): con los dos jugadores sumados (teclas de la izquierda = jugador 1, numerico = jugador 2)
  const n = nn(e.cancion), doble = e.modo === 'DOUBLE', archivo = archivoDe(e);
  const banderas = ({ NORMAL: 0x10, HARD: 0x20, CRAZY: 0x400, DOUBLE: 0x80 }[e.modo] || 0x20) | (e.versus ? 3 : 1);
  pantalla = 'probando';
  practicaActual = practica ? { e, bytes, practica } : null;
  J.arrancar({ online: { cancion: e.cancion, modo: e.modo, inicioMs: Date.now() + 300, controles: op.controles, cmd: `run ${archivo} ${doble ? '-D' : '-S'} ${n}.dat`,
    banderas, dos: !!e.versus, opciones: aBits(op.mods), skin: op.mods.skin | 0 }, pasos: { archivo, bytes }, practica });
  if (practica) avisar(`PRACTICA AL ${Math.round(practica.velocidad * 100)}%: se repite hasta que apretes ${esTactil ? 'ATRAS' : 'ESC'}`, 4);
}

// ---------- desafio: elegir con la seleccion de verdad y despues los modificadores (Charles, 20/10) ----------
// El juego arranca directo en su pantalla de seleccion (trabajador.js, instalarEleccion): ruleta, musica, reloj,
// codigos. Al confirmar, en vez de jugar avisa que eligio (eleccionHecha) y se pasa a MODIFICADORES; con LISTO va el
// desafio. El que recibe tambien elige sus modificadores antes de aceptar: son de cada uno (solo cambian como se ven
// las flechas), el comando de la cancion es el mismo para los dos.
// (21/10) hasta que la seleccion se ve (trabajador.js avisa "eleccionLista") hay un cartel, no la pantalla en negro
let eleccionVisible = false;
export function eleccionLista() { eleccionVisible = true; }
// la caratula de una cancion para el FONDO SIN VIDEO (principal.js fondoCancion): la del disco, la propia o la del paquete
export async function portadaFondo(n) {
  if (R.caratulas && R.caratulas[n]) return R.caratulas[n];
  const pq = sala.partida && sala.partida.paquete && paquetes.get(sala.partida.paquete.pq);
  if (n >= 82 && pq && pq.limpio) return pq.limpio.portada;
  const url = n >= 82 ? GUARDADO_PROPIAS() + `t${n}.pnz` : DISCO + `title/t${nn(n)}.pnz`;
  const png = descifrarPnz(await traer(url), R.llave);
  return png ? imagen(png) : null;
}
// (21/10) el juego del online ya cargo: se avisa al salon; la cuenta arranca cuando los dos estan listos
export function onlineListo() {
  if (!sala.yo || !sala.partida) return;
  api({ accion: 'listo', ...credencial() }).then(actualizarSala).catch(() => {});
}
function empezarEleccion(r) {
  elegido = { rival: r, eleccion: null };
  pantalla = 'eligiendo'; eleccionVisible = false;
  J.arrancar({ eleccion: { controles: op.controles }, desbloqueado: op.desbloqueado });
}
export function eleccionHecha(m) {
  if (pantalla !== 'eligiendo' || !elegido.rival) return;
  elegido.eleccion = { ...m, modo: modoDe(m.banderas) };
  precalentar(m.cancion);
  if (m.cancion >= 82) datosPropia(m.cancion).then((c) => { if (elegido.eleccion) elegido.eleccion.nombre = c.nombre + ' (PROPIA)'; }).catch(() => {});
  J.terminar();
  // si metio codigos en la seleccion, arrancan con esos; si no, con los que uso la ultima vez
  abrirMods('desafiar', {}, m.opciones || m.skin ? deBits(m.opciones, m.skin) : null);
}
// ---------- modificadores: las opciones del jugador [0x1CFB0C] (JUEGO_REGLAS 3.5) y la skin de flechas [0x2AC088] ----------
const FILAS_MODS = ['velocidad', 'vanish', 'mirror', 'random', 'banda', 'azar', 'skin', 'listo'];
const VALORES_MODS = { velocidad: [1, 2, 4, 8], vanish: [0, 1, 2], mirror: [false, true], random: [false, true], banda: [false, true], azar: [false, true], skin: [0, 1, 2, 3, 4, 5, 6, 7, 8] };
const NOMBRE_MODS = { velocidad: 'VELOCIDAD', vanish: 'VANISH', mirror: 'MIRROR', random: 'RANDOM', banda: 'BANDA OCULTA', azar: 'VELOCIDAD AL AZAR', skin: 'SKIN DE FLECHAS', listo: '' };
const AYUDA_MODS = { velocidad: 'LAS FLECHAS SUBEN MAS RAPIDO (MAS SEPARADAS)', vanish: 'SE BORRAN ANTES DE LLEGAR, O NO SE VEN', mirror: 'LOS PASOS EN ESPEJO',
  random: 'LOS PASOS CAMBIADOS DE LUGAR AL AZAR', banda: 'UNA BANDA TAPA EL MEDIO DEL RECORRIDO', azar: 'LA VELOCIDAD CAMBIA SOLA DURANTE LA CANCION',
  skin: 'EL DIBUJO DE LAS FLECHAS (ARROW.DAT)', listo: '' };
const aBits = (m) => (m.velocidad === 8 ? 8 : m.velocidad === 4 ? 4 : m.velocidad === 2 ? 2 : 0) | (m.vanish === 1 ? 0x10 : m.vanish === 2 ? 0x80 : 0) |
  (m.mirror ? 0x20 : 0) | (m.random ? 0x40 : 0) | (m.banda ? 0x100 : 0) | (m.azar ? 0x200 : 0);
const deBits = (b, skin) => ({ velocidad: b & 8 ? 8 : b & 4 ? 4 : b & 2 ? 2 : 1, vanish: b & 0x80 ? 2 : b & 0x10 ? 1 : 0, mirror: !!(b & 0x20),
  random: !!(b & 0x40), banda: !!(b & 0x100), azar: !!(b & 0x200), skin: Math.max(0, Math.min(8, skin | 0)) });
let mods = null, modsDestino = '', modsDatos = {};
function abrirMods(destino, datos, iniciales) {
  modsDestino = destino; modsDatos = datos || {};
  mods = { ...(op.mods || deBits(0, 0)), ...(iniciales || {}) };
  pantalla = 'mods'; cursor = FILAS_MODS.length - 1;     // arranca parado en LISTO: si no quiere cambiar nada, un toque
}
function cambiarMod(f, paso) {
  const vs = VALORES_MODS[f], i = vs.indexOf(mods[f]);
  mods[f] = vs[(i + paso + vs.length) % vs.length];
  // las que se pisan entre si, como los codigos del original
  if (f === 'banda' && mods.banda) { mods.vanish = 0; mods.random = false; }
  if ((f === 'vanish' && mods.vanish) || (f === 'random' && mods.random)) mods.banda = false;
  if (f === 'azar' && mods.azar) mods.velocidad = 1;
  if (f === 'velocidad' && mods.velocidad !== 1) mods.azar = false;
}
function confirmarMods() {
  op.mods = { ...mods }; guardarOpciones();
  if (modsDestino === 'solo') { empezarSolo(op.nick); return; }
  if (modsDestino === 'desafiar') {
    const e = elegido.eleccion;
    // una propia primero se sube (subirPropia); despues va el desafio con su paquete
    (e.cancion >= 82 ? subirPropia(e) : Promise.resolve(null))
      .then((pq) => api({ accion: 'desafiar', ...credencial(), a: elegido.rival.id, cancion: e.cancion, modo: e.modo, cmd: e.cmd, banderas: e.banderas, espera: op.cuenta, ...(pq ? { paquete: pq.pq, meta: pq.meta } : {}) }))
      .then(r => { actualizarSala(r); pantalla = 'esperando'; }).catch(er => { avisar(er.message, 5); pantalla = 'sala'; });
    pantalla = 'esperando';
  } else {
    const d = modsDatos.desafio, est = d.paquete && paquetes.get(d.paquete.pq);
    if (d.paquete && (!est || est.estado !== 'listo')) { avisar(est && est.estado === 'error' ? 'Esa cancion no paso la revision' : 'Todavia se esta recibiendo la cancion: espera un poco'); return; }
    api({ accion: 'responder', ...credencial(), desafio: modsDatos.desafio.id, acepta: true }).then(actualizarSala).catch(er => { avisar(er.message); pantalla = 'sala'; });
    pantalla = 'sala';
  }
}
function teclaMods(k) {
  // con los 5 paneles: ↖ sube, ↗ baja, ↙ ↘ cambian el valor, el centro cambia (o confirma en LISTO)
  const sube = ['ArrowUp', 'KeyQ', 'KeyU', 'Numpad7'], baja = ['ArrowDown', 'KeyE', 'KeyO', 'Numpad9'];
  const izq = ['ArrowLeft', 'KeyZ', 'KeyM', 'Numpad1'], der = ['ArrowRight', 'KeyC', 'Period', 'Numpad3'];
  const f = FILAS_MODS[cursor];
  if (sube.includes(k)) cursor = (cursor + FILAS_MODS.length - 1) % FILAS_MODS.length;
  else if (baja.includes(k)) cursor = (cursor + 1) % FILAS_MODS.length;
  else if (izq.includes(k) && f !== 'listo') cambiarMod(f, -1);
  else if ((der.includes(k) || OK.includes(k)) && f !== 'listo') cambiarMod(f, 1);
  else if (OK.includes(k)) confirmarMods();
  else if (k === 'Escape') {
    if (modsDestino === 'aceptar') api({ accion: 'responder', ...credencial(), desafio: modsDatos.desafio.id, acepta: false }).then(actualizarSala).catch(() => {});
    if (modsDestino === 'solo') { pantalla = 'menu'; cursor = 0; return; }
    pantalla = 'sala';
  }
}
function dibujarMods(t) {
  caja(80, 26, 480, 428, 0.88);
  texto(x, 'MODIFICADORES', 320, 36, 3, 'amarillo', true);
  const sub = modsDestino === 'solo' ? `JUGAR SOLO COMO ${op.nick}` : modsDestino === 'desafiar' && elegido.eleccion ? `${elegido.eleccion.nombre || nombreDe(elegido.eleccion.cancion)} - ${elegido.eleccion.modo} - VS ${elegido.rival.nick}`
    : modsDatos.desafio ? `${modsDatos.desafio.nick} TE DESAFIA: ${nombreCon(modsDatos.desafio)} - ${modsDatos.desafio.modo}` : '';
  texto(x, sub.slice(0, 56), 320, 82, 1, 'celeste', true);
  const valor = (f) => f === 'velocidad' ? `X${mods.velocidad}` : f === 'vanish' ? ['NO', 'VANISH', 'SIN FLECHAS'][mods.vanish]
    : f === 'skin' ? (mods.skin ? `${mods.skin}` : 'NORMAL') : mods[f] ? 'SI' : 'NO';
  FILAS_MODS.forEach((f, i) => {
    const y = 108 + i * 36, sel = i === cursor;
    barra(sel ? 'oro' : 'violeta', 100, y - 6, 440, 30, sel ? 0.85 : 0.3);
    if (f === 'listo') { texto(x, modsDestino === 'aceptar' ? 'LISTO: ACEPTAR' : modsDestino === 'solo' ? 'LISTO: JUGAR' : 'LISTO: DESAFIAR', 320, y, 2, sel ? 'amarillo' : 'verde', true); return; }
    texto(x, NOMBRE_MODS[f], 116, y, 2, sel ? 'amarillo' : 'blanco');
    // (21/10) la skin con su dibujo, no con un numero
    if (f === 'skin' && iconoSkin(mods.skin, 470, y - 4, 26)) { if (sel) { texto(x, '<', 440, y, 2, 'amarillo'); texto(x, '>', 504, y, 2, 'amarillo'); } return; }
    const v = (sel ? '< ' : '') + valor(f) + (sel ? ' >' : '');
    texto(x, v, 524 - v.length * 16, y, 2, sel ? 'amarillo' : 'celeste');
  });
  texto(x, AYUDA_MODS[FILAS_MODS[cursor]], 320, 400, 1, 'celeste', true);
  texto(x, esTactil ? 'ARRIBA IZQ/DER = SUBIR/BAJAR   ABAJO = CAMBIAR   ATRAS = VOLVER' : 'ARRIBA/ABAJO = ELEGIR   IZQ/DER = CAMBIAR   ESC = VOLVER', 320, 424, 1, 'gris', true);
}

// el dibujo de una skin de flechas (0 = la comun del juego, 1-8 las de bga\arrow.dat); false si no se puede
function iconoSkin(n, px, py, t) {
  if (!n) { if (!R.arrow01) return false; x.drawImage(R.arrow01, 2, 72, 66, 66, px, py, t, t); return true; }
  const s = R.skins && R.skins[n]; if (!s) return false;
  x.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, px, py, t, t); return true;
}
// ---------- AVATAR (Charles 21/10: "agregar en el perfil un sistema de avatar imagen, usemos todas las flechas") ----------
// Un avatar es [skin, pieza]: una de las flechas del juego (la comun: 3 piezas; las skins de bga\arrow.dat: hasta 8 cada
// una). Se elige en OPCIONES > AVATAR; va al perfil (api.php 'avatar') y al salon (al entrar), y lo ven los demas.
function piezasAvatar() {
  const l = [[0, 0], [0, 1], [0, 2]];
  for (let s = 1; s <= 8; s++) { const k = R.skins && R.skins[s]; if (k) k.piezas.forEach((_, i) => l.push([s, i])); }
  return l;
}
function dibujarAvatar(av, px, py, t) {
  if (!Array.isArray(av)) return false;
  const [s, i] = av;
  if (!s) {
    if (!R.arrow01 || !R.arrow03) return false;
    if (i === 2) x.drawImage(R.arrow03, 2, 142, 66, 66, px, py, t, t);
    else x.drawImage(R.arrow01, i ? 142 : 2, i ? 142 : 72, 66, 66, px, py, t, t);
    return true;
  }
  const p = R.skins && R.skins[s] && R.skins[s].piezas[i]; if (!p) return false;
  x.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, px, py, t, t); return true;
}
const av = { i: 0 };
function abrirAvatar() { const l = piezasAvatar(); av.i = Math.max(0, l.findIndex((a) => op.avatar && a[0] === op.avatar[0] && a[1] === op.avatar[1])); pantalla = 'avatar'; }
function teclaAvatar(k) {
  const l = piezasAvatar(), COL = 12;
  if (['ArrowLeft', 'KeyZ', 'Numpad1'].includes(k)) av.i = (av.i + l.length - 1) % l.length;
  else if (['ArrowRight', 'KeyC', 'Numpad3'].includes(k)) av.i = (av.i + 1) % l.length;
  else if (['ArrowUp', 'KeyQ', 'Numpad7'].includes(k)) av.i = Math.max(0, av.i - COL);
  else if (['ArrowDown', 'KeyE', 'Numpad9'].includes(k)) av.i = Math.min(l.length - 1, av.i + COL);
  else if (OK.includes(k)) {
    op.avatar = l[av.i]; guardarOpciones(); pantalla = 'opciones'; perfil = null;
    if (op.nick) api({ accion: 'avatar', nick: op.nick, pin: op.pin, avatar: op.avatar }).then(() => avisar('Avatar guardado')).catch((er) => avisar(er.message));
  } else if (k === 'Escape') pantalla = 'opciones';
}
function dibujarElegirAvatar(t) {
  caja(60, 30, 520, 420, 0.88);
  texto(x, 'AVATAR', 320, 42, 3, 'amarillo', true);
  const l = piezasAvatar(), COL = 12, T = 36;
  l.forEach((a, n) => {
    const px = 78 + (n % COL) * 42, py = 100 + Math.floor(n / COL) * 42, sel = n === av.i;
    x.fillStyle = sel ? 'rgba(255,210,63,.35)' : 'rgba(255,255,255,.06)'; x.fillRect(px - 3, py - 3, T + 6, T + 6);
    if (sel) { x.strokeStyle = '#ffd23f'; x.lineWidth = 2; x.strokeRect(px - 3, py - 3, T + 6, T + 6); }
    dibujarAvatar(a, px, py, T);
  });
  // la elegida, grande, abajo
  dibujarAvatar(l[av.i], 288, 352, 64);
  texto(x, esTactil ? 'IZQ/DER Y ARRIBA = ELEGIR   CENTRO = LISTO   ATRAS = VOLVER' : 'FLECHAS = ELEGIR   ENTER = LISTO   ESC = VOLVER', 320, 426, 1, 'gris', true);
}
// lo llama principal.js con el marcador del jugador (cada ~0,25 s) y al final
let ultimoEnvio = 0;
const vivoEnvio = { juicios: '', pads: 0 };      // (mejora 8) lo que paso entre envio y envio al salon
export function marcador(m) {
  if (pantalla === 'probando') {                 // la prueba del editor termino (la practica vuelve a empezar)
    if (m.terminado) { J.terminar(); if (practicaActual) { const p = practicaActual; setTimeout(() => { if (pantalla === 'probando') probarPasos(p.e, p.bytes, p.practica); }, 600); } else { pantalla = 'editor'; volverDePrueba(); } }
    return;
  }
  if (!sala.yo || !sala.partida) return;
  if (pantalla === 'cuenta' && m.jugando) pantalla = 'jugando';
  vivoEnvio.juicios = (vivoEnvio.juicios + (m.juicios || '')).slice(-40); vivoEnvio.pads |= m.pads | 0;
  const ahora = performance.now();
  if (!m.terminado && ahora - ultimoEnvio < 450) return;
  ultimoEnvio = ahora;
  const vivo = { juicios: vivoEnvio.juicios, pads: vivoEnvio.pads }; vivoEnvio.juicios = ''; vivoEnvio.pads = 0;
  api({ accion: 'marcador', ...credencial(), ...m, ...vivo }).then(e => { if (e) actualizarSala(e); }).catch(() => {});
  if (m.terminado) terminarPartida(m);
}
function terminarPartida(m) {
  resultado = { yo: m, desde: performance.now() };
  pantalla = 'resultado';
  J.terminar();
  // esperar un poco el puntaje final del rival
  setTimeout(sondear, 600); setTimeout(sondear, 1600);
}
function volverASala() {
  api({ accion: 'volver', ...credencial() }).then(actualizarSala).catch(() => {});
  sala.partida = null; pantalla = 'sala'; cursor = 0;
}
export function abandonar() {   // Esc en medio de la partida
  if (!sala.partida) return false;
  J.terminar(); avisar('Abandonaste la partida'); volverASala();
  return true;
}
function rival() {
  const p = sala.partida; if (!p || !sala.yo) return null;
  const id = Object.keys(p.jugadores).find(k => k !== sala.yo.id);
  return id ? p.jugadores[id] : null;
}

// ---------- teclado ----------
// los tres juegos de teclas (principal.js, teclasOnline): izquierda Q E S Z C, derecha U O K M . y el numerico
const ARRIBA = ['ArrowUp', 'KeyQ', 'KeyE', 'KeyU', 'KeyO', 'Numpad7', 'Numpad9'], ABAJO = ['ArrowDown', 'KeyZ', 'KeyC', 'KeyM', 'Period', 'Numpad1', 'Numpad3'];
const OK = ['Enter', 'KeyS', 'KeyK', 'Numpad5', 'NumpadEnter', 'Space'];
const CONTROLES = ['izquierda', 'derecha', 'numerico', 'ambos'];
function tecla(e) {
  if (pantalla === 'jugando' || pantalla === 'cuenta' || pantalla === 'oculto' || pantalla === 'eligiendo' || pantalla === 'probando') return false;
  if (pantalla === 'editor') { if (escribiendo) return false; return teclaEditor(e.code, e); }
  const k = e.code;
  if (pantalla === 'nick' || escribiendo) {
    // los paneles del celular (tactil.js: teclas falsas, sin isTrusted): el centro confirma, ATRAS vuelve
    if (!e.isTrusted) { if (OK.includes(k)) confirmarTexto(); else if (k === 'Escape') cancelarTexto(); return true; }
    return false;                                          // el teclado de verdad va al <input>
  }
  e.preventDefault();
  const listas = { menu: MENU.length, controles: CONTROLES.length, opciones: FILAS_OPCIONES.length };
  if (pantalla === 'menu' || pantalla === 'controles' || pantalla === 'opciones') {
    // pads de arriba (↖ ↗) suben, los de abajo (↙ ↘) bajan; el centro elige
    // (21/10) en OPCIONES, izquierda/derecha ajustan sin entrar: el desfase de a 5 ms y el volumen de a 10 %
    const fila = pantalla === 'opciones' && FILAS_OPCIONES[cursor];
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && (fila === 'calibrar' || fila === 'volumen')) {
      const s = k === 'ArrowLeft' ? -1 : 1;
      if (fila === 'calibrar') { op.desfase = Math.max(-300, Math.min(300, op.desfase + 5 * s)); J.desfase(op.desfase); }
      else { op.volumen = Math.max(0, Math.min(1, Math.round(op.volumen * 10 + s) / 10)); J.volumen(op.volumen); }
      guardarOpciones(); return true;
    }
    if (ARRIBA.includes(k)) cursor = (cursor + listas[pantalla] - 1) % listas[pantalla];
    else if (ABAJO.includes(k)) cursor = (cursor + 1) % listas[pantalla];
    else if (OK.includes(k)) elegirOpcion();
    else if (k === 'Escape') {
      if (pantalla === 'controles') { pantalla = 'opciones'; cursor = 0; }
      else if (pantalla === 'opciones') { pantalla = 'menu'; cursor = MENU.indexOf('opciones'); }
      else return false;
    }
    return true;
  }
  if (pantalla === 'sala') {
    const otros = sala.jugadores.filter(j => j.id !== sala.yo.id);
    if (sala.desafios.some(d => !d.mio)) {                  // me desafiaron: aceptar o rechazar
      const d = sala.desafios.find(d => !d.mio);
      if (OK.includes(k)) abrirMods('aceptar', { desafio: d });          // antes de aceptar, los modificadores de cada uno
      else if (k === 'Escape' || k === 'Backspace') api({ accion: 'responder', ...credencial(), desafio: d.id, acepta: false }).then(actualizarSala).catch(() => {});
      return true;
    }
    if (ARRIBA.includes(k)) cursor = Math.max(0, cursor - 1);
    else if (ABAJO.includes(k)) cursor = Math.min(Math.max(0, otros.length - 1), cursor + 1);
    else if (k === 'KeyT' || k === 'Tab') { escribiendo = true; entrada.value = ''; entrada.maxLength = 120; entrada.focus(); }
    else if (k === 'KeyR') { pantalla = 'ranking'; pedirRanking(); }
    else if (OK.includes(k)) {
      const r = otros[cursor];
      if (!r) avisar('Todavia no hay nadie mas en la sala');
      else if (r.estado !== 'sala') { if (r.partida) empezarMirar(r); else avisar(`${r.nick} esta jugando`); }   // (mejora 17) mirar su partida
      else empezarEleccion(r);
    } else if (k === 'Escape') { api({ accion: 'salir', ...credencial() }).catch(() => {}); sala.yo = null; pantalla = 'menu'; cursor = 1; }
    return true;
  }
  if (pantalla === 'elegir') {
    const c = CANCIONES[elegido.cancion];
    if (k === 'ArrowLeft' || k === 'KeyZ' || k === 'KeyM' || k === 'Numpad1') { elegido.cancion = (elegido.cancion + CANCIONES.length - 1) % CANCIONES.length; elegido.modo = 0; tocarPrevia(CANCIONES[elegido.cancion].n); }
    else if (k === 'ArrowRight' || k === 'KeyC' || k === 'Period' || k === 'Numpad3') { elegido.cancion = (elegido.cancion + 1) % CANCIONES.length; elegido.modo = 0; tocarPrevia(CANCIONES[elegido.cancion].n); }
    else if (k === 'ArrowUp' || k === 'KeyQ' || k === 'KeyU' || k === 'Numpad7') elegido.modo = (elegido.modo + c.modos.length - 1) % c.modos.length;
    else if (k === 'ArrowDown' || k === 'KeyE' || k === 'KeyO' || k === 'Numpad9') elegido.modo = (elegido.modo + 1) % c.modos.length;
    else if (OK.includes(k)) {
      api({ accion: 'desafiar', ...credencial(), a: elegido.rival.id, cancion: c.n, modo: c.modos[elegido.modo] })
        .then(e => { actualizarSala(e); pantalla = 'esperando'; }).catch(er => { avisar(er.message); pantalla = 'sala'; });
    } else if (k === 'Escape') { pararPrevia(); pantalla = 'sala'; }
    return true;
  }
  if (pantalla === 'mods') { teclaMods(k); return true; }
  if (pantalla === 'calibrar') { teclaCalibrar(k, e); return true; }
  if (pantalla === 'teclas') { teclaTeclas(e); return true; }
  if (pantalla === 'avatar') { teclaAvatar(k); return true; }
  if (pantalla === 'mirando') { if (k === 'Escape' || k === 'Backspace') pantalla = 'sala'; return true; }
  if (pantalla === 'usb') {
    if (k === 'Escape') { J.mando.aprender(null); pantalla = 'opciones'; }
    else if (k === 'KeyB') { J.mando.aprender(null); op.usb = null; J.mando.fijarMapa(null); guardarOpciones(); avisar('Mando USB: la distribucion comun'); pantalla = 'opciones'; }
    return true;
  }
  if (pantalla === 'esperando') { if (k === 'Escape') { pantalla = 'sala'; } return true; }
  if (pantalla === 'resultado') { if ((OK.includes(k) || k === 'Escape') && performance.now() - resultado.desde > 1500) volverASala(); return true; }
  if (pantalla === 'ranking') {
    const izq = ['ArrowLeft', 'KeyZ', 'KeyM', 'Numpad1', 'KeyQ', 'KeyU', 'Numpad7'], der = ['ArrowRight', 'KeyC', 'Period', 'Numpad3', 'KeyE', 'KeyO', 'Numpad9'];
    if (izq.includes(k)) paginaRanking = (paginaRanking + PAGINAS_RANKING.length - 1) % PAGINAS_RANKING.length;
    else if (der.includes(k)) paginaRanking = (paginaRanking + 1) % PAGINAS_RANKING.length;
    else if (k === 'Escape' || OK.includes(k) || k === 'KeyR') { pantalla = sala.yo ? 'sala' : 'menu'; sesionFin = null; }
    return true;
  }
  return false;
}
function elegirOpcion() {
  if (pantalla === 'controles') {
    op.controles = CONTROLES[cursor]; guardarOpciones();
    avisar('Controles: ' + NOMBRE_CONTROLES[op.controles]); pantalla = 'opciones'; cursor = 0; return;
  }
  if (pantalla === 'opciones') {
    const f = FILAS_OPCIONES[cursor];
    if (f === 'controles') { pantalla = 'controles'; cursor = Math.max(0, CONTROLES.indexOf(op.controles)); }
    else if (f === 'nombre') { destinoNick = 'cambiar'; pedirNick(); return; }
    else if (f === 'avatar') { abrirAvatar(); return; }
    else if (f === 'pantalla') { op.pantalla = op.pantalla === 'estirar' ? 'original' : 'estirar'; J.pantalla(op.pantalla); }
    else if (f === 'pin') { if (!op.nick) { avisar('Primero elegi tu nombre'); return; } destinoNick = 'pin'; pantalla = 'nick'; entrada.value = ''; entrada.maxLength = 8; entrada.focus(); return; }
    else if (f === 'paneles') { op.panelesDos = !op.panelesDos; J.paneles(op.panelesDos); }
    else if (f === 'tamano') { op.tamanoPads = TAMANOS[(TAMANOS.indexOf(op.tamanoPads) + 1) % TAMANOS.length] || 1; J.tactil.tamano(op.tamanoPads); }
    else if (f === 'vibrar') { op.vibrar = !op.vibrar; J.tactil.vibrar(op.vibrar); if (op.vibrar && navigator.vibrate) navigator.vibrate(30); }
    else if (f === 'usb') { abrirUsb(); return; }
    else if (f === 'calibrar') { abrirCalibrar(); return; }
    else if (f === 'teclas') { abrirTeclas(); return; }
    else if (f === 'volumen') { op.volumen = Math.round(op.volumen * 10) >= 10 ? 0 : Math.min(1, Math.round(op.volumen * 10 + 1) / 10); J.volumen(op.volumen); }
    else if (f === 'fondo') op.fondo = FONDOS[(FONDOS.indexOf(op.fondo) + 1) % FONDOS.length];
    else if (f === 'cuenta') op.cuenta = CUENTAS[(CUENTAS.indexOf(op.cuenta) + 1) % CUENTAS.length];
    else if (f === 'panelmods') op.panelMods = !op.panelMods;
    else if (f === 'carril') op.carril = op.carril === 'centro' ? 'lugar' : 'centro';
    else if (f === 'rival') op.vistaRival = { juego: 'datos', datos: 'no', no: 'juego' }[op.vistaRival] || 'datos';
    else if (f === 'intro') op.intro = !op.intro;
    else if (f === 'demo') op.demo = !op.demo;
    else if (f === 'sonido') op.demoSonido = !op.demoSonido;
    else if (f === 'desbloqueado') op.desbloqueado = !op.desbloqueado;
    else if (f === 'sincorte') op.sinCorte = !op.sinCorte;
    else { pantalla = 'menu'; cursor = MENU.indexOf('opciones'); }
    guardarOpciones();
    return;
  }
  const m = MENU[cursor];
  // el nombre se pide una sola vez (Charles 21/10); se cambia en OPCIONES > TU NOMBRE
  if (m === 'solo') { destinoNick = 'solo'; if (op.nick) jugarSolo(); else pedirNick(); }
  else if (m === 'online') { destinoNick = 'online'; if (op.nick) entrarSala(op.nick); else pedirNick(); }
  else if (m === 'ranking') { pantalla = 'ranking'; pedirRanking(); }
  else if (m === 'editor') { pantalla = 'editor'; abrirEditor(); }               // EDITOR de pasos (editor.js)
  else if (m === 'opciones') { pantalla = 'opciones'; cursor = 0; }
  else if (m === 'salir') window.piuBuild.salir();
}
// el menu principal. En la web desde el celular no va el EDITOR (y con el, la PRACTICA): Charles, 21/10; en la PC, la
// build de Edge y la APK (window.piuBuild) si
// (21/10: "el editor en android ocultalo, de momento": tampoco en la APK). SALIR abajo en las builds y la APK (Charles
// 21/10), que tienen como cerrarse (window.piuBuild.salir); en la web no hay
const MENU = ['solo', 'online', 'ranking', ...(esTactil && !(window.piuBuild && !window.piuBuild.android) ? [] : ['editor']), 'opciones', ...(window.piuBuild ? ['salir'] : [])];
const NOMBRE_MENU = { solo: 'JUGAR SOLO', online: 'ONLINE', ranking: 'RANKING', editor: 'EDITOR', opciones: 'OPCIONES', salir: 'SALIR' };
const NOMBRE_CONTROLES = { izquierda: 'IZQUIERDA (Z Q S E C)', derecha: 'DERECHA (U O K M .)', numerico: 'NUMERICO (1 7 5 9 3)', ambos: 'TODOS' };
const CORTO_CONTROLES = { izquierda: 'IZQUIERDA', derecha: 'DERECHA', numerico: 'NUMERICO', ambos: 'TODOS' };
// OPCIONES (20/10): intro, demo y su sonido son del modo solo (trabajador.js, seguirAtraccion); PANELES solo en
// celulares y tablets (tactil.js: uno o dos juegos de paneles, el segundo para DOUBLE)
// (mejoras 10 y 16, 21/10: MANDO USB en todos; TAMANO DE PANELES y VIBRAR en el celular)
const FILAS_OPCIONES = ['nombre', 'pin', 'avatar', 'controles', ...(esTactil ? ['paneles', 'tamano', 'vibrar'] : ['teclas', 'pantalla']), 'usb', 'calibrar', 'volumen', 'fondo', 'carril', 'panelmods', 'cuenta', 'rival', 'intro', 'demo', 'sonido', 'desbloqueado', 'sincorte', 'volver'];
const TAMANOS = [0.8, 0.9, 1, 1.1, 1.2, 1.3];
// (21/10) FONDO: el video de la cancion normal, atenuado o SIN VIDEO (la caratula); CUENTA: segundos antes de arrancar el
// online, desde que los dos cargaron (la del que desafia es la que vale)
const FONDOS = [0, 0.25, 0.5, 0.75, 'titulo'], CUENTAS = [3, 5, 8, 10];
const nombreFondo = (f) => (f === 'titulo' ? 'SIN VIDEO' : f ? `ATENUADO ${Math.round(f * 100)}%` : 'NORMAL');
const AYUDA_OPCIONES = { sincorte: 'EN SOLO, LA CANCION NO SE CORTA CON 50 MISS (EN ONLINE NUNCA)', desbloqueado: 'LAS OCULTAS DE CRAZY Y LOS PASOS EXTRA DESDE EL PRINCIPIO', controles: 'CON QUE PARTE DEL TECLADO SE JUEGA EL ONLINE', paneles: 'DOS JUEGOS DE PANELES PARA JUGAR DOUBLE',
  tamano: 'MAS GRANDES O MAS CHICOS (SE VE AL TOQUE)', vibrar: 'EL CELULAR VIBRA UN POQUITO EN CADA PISADA',
  nombre: 'CON EL QUE JUGAS EN SOLO, ONLINE Y RANKING (SE PIDE UNA SOLA VEZ)',
  pin: 'CON CLAVE, NADIE MAS PUEDE USAR TU NOMBRE (EN OTRO APARATO, PONELA ACA)',
  avatar: 'UNA FLECHA DEL JUEGO QUE TE REPRESENTA: PERFIL, SALON Y ONLINE',
  usb: 'ALFOMBRA, JOYSTICK O GAMEPAD: CENTRO = PISAR CADA PANEL PARA APRENDERLO',
  calibrar: 'FLECHAS FUERA DE TIEMPO: CENTRO = TOCAR AL RITMO; IZQ/DER = DE A 5 MS',
  fondo: 'EL VIDEO DE LA CANCION: MAS OSCURO, O SOLO SU CARATULA (ALIVIA AL APARATO)',
  teclas: 'ELEGIR LA TECLA DE CADA PANEL, JUGADOR 1 Y 2 (CENTRO = EMPEZAR)',
  pantalla: '4:3 COMO LA CABINA (A LOS COSTADOS, EL JUEGO BORROSO) O ESTIRADO A TODO EL MONITOR',
  panelmods: 'EN SOLO, ANTES DE JUGAR: VELOCIDAD, VANISH, MIRROR, SKIN... (EN VEZ DE LOS CODIGOS)',
  rival: 'EN EL ONLINE: SUS FLECHAS Y LO QUE PISA, SOLO SU PUNTAJE, O NADA',
  carril: 'JUGANDO DE A UNO: LAS FLECHAS EN EL MEDIO DE LA PANTALLA (NO EN EL ONLINE)',
  volumen: 'LA MUSICA DEL JUEGO (CENTRO O IZQ/DER = CAMBIAR)',
  cuenta: 'SEGUNDOS ANTES DE EMPEZAR, CUANDO LOS DOS YA CARGARON',
  intro: 'LOGO DE ANDAMIRO Y OPENING LA 1.a VEZ EN SOLO', demo: 'SI NADIE TOCA EN 20 S, EL JUEGO MUESTRA LA DEMO',
  sonido: 'MUSICA EN LA DEMO (DEMO SOUND DE LA CABINA)', volver: '' };
const TECLAS_CONTROLES = { izquierda: 'Z Q S E C', derecha: 'U O K M .  (SIN NUMERICO)', numerico: '1 7 5 9 3 DEL NUMERICO', ambos: 'LAS TRES JUNTAS' };
// ---------- CALIBRAR (mejora 9): el desfase de este aparato ----------
// Suenan 20 golpes a 120 BPM (los 4 primeros de preparacion) y se toca un panel en cada uno. La mediana de cuanto
// llegan tarde (o antes) los toques respecto del golpe, en el reloj de lo que se oye (principal.js relojAudible), es
// el desfase: cubre la demora del sonido (parlantes bluetooth, algunos celulares) y la de la pantalla tactil. El juego
// corre su reloj de la musica esa cantidad (principal.js bucle). Se guarda con las opciones.
const cal = { inicio: 0, toques: [], fin: false, resultado: null };
const GOLPES = 20, PREPARA = 4, INTERVALO = 0.5;
function abrirCalibrar() {
  J.terminar();                                   // el titulo de fondo tiene musica: tapa los golpes
  const ctx = J.audio(); pantalla = 'calibrar';
  Object.assign(cal, { inicio: ctx.currentTime + 1, toques: [], fin: false, resultado: null });
  for (let k = 0; k < GOLPES; k++) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = cal.inicio + k * INTERVALO;
    o.frequency.value = k < PREPARA ? 660 : k % 4 === 0 ? 1320 : 990; g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.08);
  }
}
function toqueCalibrar(e) {
  if (cal.fin) return;
  const ahora = J.relojAudio() - Math.max(0, performance.now() - e.timeStamp) / 1000, k = Math.round((ahora - cal.inicio) / INTERVALO);
  if (k < PREPARA || k >= GOLPES) return;
  const d = ahora - (cal.inicio + k * INTERVALO);
  if (Math.abs(d) < INTERVALO * 0.45) cal.toques.push(d * 1000);
}
function cerrarCalibrar() {
  cal.fin = true;
  const v = cal.toques.slice().sort((a, b) => a - b);
  // (el reloj de la pagina no tiene aplicado el desfase anterior: lo medido es el desfase entero)
  cal.resultado = v.length >= 6 ? Math.round(v[Math.floor(v.length / 2)]) : null;
}
function dibujarCalibrar(t) {
  caja(80, 40, 480, 400, 0.88);
  texto(x, 'CALIBRAR', 320, 52, 3, 'amarillo', true);
  const ahora = J.relojAudio(), k = Math.floor((ahora - cal.inicio) / INTERVALO);
  if (!cal.fin && ahora > cal.inicio + GOLPES * INTERVALO + 0.3) cerrarCalibrar();
  if (!cal.fin) {
    texto(x, k < PREPARA ? 'ESCUCHA EL RITMO...' : 'TOCA UN PANEL EN CADA GOLPE', 320, 110, 2, 'blanco', true);
    const fase = (ahora - cal.inicio) / INTERVALO - k, latido = k >= 0 && fase < 0.25 ? 1 - fase / 0.25 : 0;
    x.fillStyle = `rgba(255,210,63,${0.25 + 0.75 * latido})`; x.beginPath(); x.arc(320, 250, 50 + 25 * latido, 0, 7); x.fill();
    texto(x, k < 0 ? '' : k < PREPARA ? String(PREPARA - k) : `${Math.min(GOLPES, k + 1) - PREPARA} / ${GOLPES - PREPARA}`, 320, 236, 2, 'blanco', true);
    texto(x, `TOQUES: ${cal.toques.length}`, 320, 340, 1, 'celeste', true);
  } else if (cal.resultado === null) {
    texto(x, 'NO ALCANZARON LOS TOQUES', 320, 200, 2, 'rojo', true);
    texto(x, 'CENTRO = PROBAR OTRA VEZ   ATRAS = SALIR', 320, 260, 1, 'gris', true);
  } else {
    texto(x, 'TU DESFASE', 320, 150, 2, 'blanco', true);
    texto(x, `${cal.resultado > 0 ? '+' : ''}${cal.resultado} MS`, 320, 190, 4, 'amarillo', true);
    texto(x, cal.resultado > 15 ? 'EL SONIDO O EL TOQUE LLEGAN TARDE: SE COMPENSA' : cal.resultado < -15 ? 'TOCAS UN POCO ANTES: SE COMPENSA' : 'CASI PERFECTO', 320, 260, 1, 'celeste', true);
    texto(x, `ANTES: ${op.desfase} MS`, 320, 290, 1, 'gris', true);
    texto(x, esTactil ? 'ABAJO IZQ / DER = RETOCAR DE A 5 MS' : 'IZQ / DER = RETOCAR DE A 5 MS', 320, 320, 1, 'celeste', true);
    texto(x, 'CENTRO = GUARDAR   R = PROBAR OTRA VEZ   ATRAS = NO GUARDAR', 320, 380, 1, 'verde', true);
  }
}
function teclaCalibrar(k, e) {
  if (k === 'Escape') { pantalla = 'opciones'; return; }
  if (!cal.fin) { if ([...OK, ...ARRIBA, ...ABAJO].includes(k)) toqueCalibrar(e); return; }
  // (21/10) el resultado se puede retocar de a 5 ms (↙ ↘ en los paneles, o izq/der)
  if (cal.resultado !== null && ['ArrowLeft', 'KeyZ', 'Numpad1', 'ArrowRight', 'KeyC', 'Numpad3'].includes(k)) {
    cal.resultado = Math.max(-300, Math.min(300, cal.resultado + (['ArrowLeft', 'KeyZ', 'Numpad1'].includes(k) ? -5 : 5))); return;
  }
  if (k === 'KeyR' || (cal.resultado === null && OK.includes(k))) abrirCalibrar();
  else if (cal.resultado !== null && OK.includes(k)) { op.desfase = Math.max(-300, Math.min(300, cal.resultado)); J.desfase(op.desfase); guardarOpciones(); avisar(`Desfase guardado: ${op.desfase} ms`); pantalla = 'opciones'; }
}
// ---------- TECLAS (21/10, "lo del teclado tambien"): la tecla de cada panel, jugador 1 y 2 (principal.js fijarTeclas) ----------
const tec = { paso: 0, nuevo: { p1: {}, p2: {} } };
const RESERVADAS = new Set(['Escape', 'Backspace', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'Tab']);
function abrirTeclas() { pantalla = 'teclas'; tec.paso = 0; tec.nuevo = { p1: {}, p2: {} }; }
function teclaTeclas(e) {
  const k = e.code;
  if (k === 'Escape') { pantalla = 'opciones'; return; }
  if (k === 'Backspace') { op.teclas = null; J.teclas(null); guardarOpciones(); avisar('Teclas de fabrica: Z Q S E C y el numerico 1 7 5 9 3'); pantalla = 'opciones'; return; }
  if (!k || RESERVADAS.has(k) || e.repeat) return;
  const jug = tec.paso < 5 ? 'p1' : 'p2', panel = PANELES_USB[tec.paso % 5][0];
  if ([...Object.values(tec.nuevo.p1), ...Object.values(tec.nuevo.p2)].includes(k)) { avisar('Esa tecla ya es de otro panel'); return; }
  tec.nuevo[jug][panel] = k; tec.paso++;
  if (tec.paso >= 10) { op.teclas = { p1: { ...tec.nuevo.p1 }, p2: { ...tec.nuevo.p2 } }; J.teclas(op.teclas); guardarOpciones(); avisar('Teclas guardadas'); pantalla = 'opciones'; }
}
function dibujarTeclas(t) {
  caja(80, 40, 480, 400, 0.88);
  texto(x, 'TECLAS', 320, 52, 3, 'amarillo', true);
  const jug = tec.paso < 5 ? 1 : 2, [, nombre] = PANELES_USB[Math.min(tec.paso, 9) % 5];
  texto(x, `JUGADOR ${jug}: APRETA LA TECLA DEL PANEL`, 320, 110, 1.5, 'blanco', true);
  texto(x, nombre, 320, 140, 2, Math.floor(t * 3) % 2 ? 'amarillo' : 'celeste', true);
  for (let j = 0; j < 2; j++) PANELES_USB.forEach(([id, , i, k], n) => {
    const cx = 220 + j * 200 + i * 48, cy = 260 + k * 48, paso = j * 5 + n, hecho = paso < tec.paso, ahora = paso === tec.paso;
    x.fillStyle = hecho ? 'rgba(125,255,122,.5)' : ahora ? (Math.floor(t * 4) % 2 ? 'rgba(255,210,63,.9)' : 'rgba(255,210,63,.4)') : 'rgba(255,255,255,.12)';
    x.fillRect(cx - 21, cy - 21, 42, 42);
    const k2 = tec.nuevo[j ? 'p2' : 'p1'][id];
    texto(x, k2 ? k2.replace(/^Key|^Digit/, '').replace('Numpad', 'N').slice(0, 4) : ['↖', '↗', '●', '↙', '↘'][n], cx, cy - 7, 1, 'blanco', true);
  });
  texto(x, 'JUGADOR 1', 220, 200, 1, 'celeste', true); texto(x, 'JUGADOR 2', 420, 200, 1, 'celeste', true);
  texto(x, `${tec.paso} DE 10`, 320, 380, 1, 'celeste', true);
  texto(x, 'ESC = CANCELAR   BORRAR = VOLVER A LAS DE FABRICA', 320, 410, 1, 'gris', true);
}
// ---------- MANDO USB (mejora 10): se pisa cada panel una vez y queda aprendido (mando.js) ----------
const PANELES_USB = [['ui', 'ARRIBA A LA IZQUIERDA', -1, -1], ['ud', 'ARRIBA A LA DERECHA', 1, -1], ['c', 'EL CENTRO', 0, 0], ['di', 'ABAJO A LA IZQUIERDA', -1, 1], ['dd', 'ABAJO A LA DERECHA', 1, 1]];
const usb = { paso: 0, nuevo: {}, nombre: '' };
function abrirUsb() {
  pantalla = 'usb'; usb.paso = 0; usb.nuevo = {}; usb.nombre = (J.mando.hay()[0] || '').slice(0, 44);
  const pedir = () => J.mando.aprender((control, nombre) => {
    if (pantalla !== 'usb') return;
    if (Object.values(usb.nuevo).includes(control)) { avisar('Ese ya es otro panel: pisa el que se ve marcado'); pedir(); return; }
    usb.nombre = nombre.slice(0, 44); usb.nuevo[PANELES_USB[usb.paso][0]] = control; usb.paso++;
    if (usb.paso < PANELES_USB.length) { pedir(); return; }
    op.usb = { ...usb.nuevo }; J.mando.fijarMapa(op.usb); guardarOpciones();
    avisar('Mando USB aprendido: ya se juega con el'); pantalla = 'opciones';
  });
  pedir();
}
function dibujarUsb(t) {
  caja(80, 40, 480, 400, 0.88);
  texto(x, 'MANDO USB', 320, 52, 3, 'amarillo', true);
  texto(x, usb.nombre || 'CONECTA LA ALFOMBRA O EL MANDO Y APRETA ALGO', 320, 100, 1, usb.nombre ? 'verde' : 'gris', true);
  const [, nombre] = PANELES_USB[Math.min(usb.paso, 4)];
  texto(x, 'PISA (O APRETA) EL PANEL', 320, 130, 2, 'blanco', true);
  texto(x, nombre, 320, 160, 2, Math.floor(t * 3) % 2 ? 'amarillo' : 'celeste', true);
  // el pad de la cabina con el panel que se pide marcado y los ya aprendidos en verde
  PANELES_USB.forEach(([id, , i, j], k) => {
    const cx = 320 + i * 70, cy = 290 + j * 70, hecho = k < usb.paso, ahora = k === usb.paso;
    x.fillStyle = hecho ? 'rgba(125,255,122,.55)' : ahora ? (Math.floor(t * 4) % 2 ? 'rgba(255,210,63,.9)' : 'rgba(255,210,63,.4)') : 'rgba(255,255,255,.12)';
    x.fillRect(cx - 30, cy - 30, 60, 60);
    x.strokeStyle = 'rgba(255,255,255,.5)'; x.strokeRect(cx - 30, cy - 30, 60, 60);
    texto(x, ['↖', '↗', '●', '↙', '↘'][k], cx, cy - 12, 1.6, 'blanco', true);
  });
  texto(x, `${usb.paso} DE 5`, 320, 390, 1, 'celeste', true);
  texto(x, 'ESC = CANCELAR   B = VOLVER A LA DISTRIBUCION COMUN', 320, 414, 1, 'gris', true);
}
// lo escrito en el <input> escondido: el nickname o un mensaje del chat
function confirmarTexto() {
  const v = entrada.value.trim();
  if (pantalla === 'nick' && destinoNick === 'pin') { ponerClave(v); return; }
  if (pantalla === 'nick') {
    if (v.length < 2) avisar('Minimo 2 letras');
    else if (destinoNick === 'solo' || destinoNick === 'cambiar') {
      // el servidor revisa el nombre (filtro.php); sin servidor (la build de Edge) se juega igual, sin ranking
      api({ accion: 'nombre', nick: v, pin: op.pin }).then(() => true).catch(er => (er.codigo === 400 || er.codigo === 403 ? (avisar(er.message, 5), false) : true)).then(ok => {
        if (!ok || pantalla !== 'nick') return;
        entrada.blur(); op.nick = v.slice(0, 16); guardarOpciones(); perfil = null;
        if (destinoNick === 'cambiar') { pantalla = 'opciones'; cursor = 0; avisar(`Tu nombre: ${op.nick}`); } else jugarSolo();
      });
    }
    else { entrada.blur(); entrarSala(v); }
  }
  else if (escribiendo) { if (v) api({ accion: 'chat', ...credencial(), texto: v }).then(actualizarSala).catch(() => {}); escribiendo = false; entrada.blur(); }
}
// CLAVE DEL NOMBRE (21/10): poner una (si el nombre no tenia), entrar con la que ya tiene (otro aparato), cambiarla
// (si aca ya estaba puesta) o sacarla (vacia). La guarda api.php (datos/nombres.json, con password_hash).
async function ponerClave(v) {
  entrada.blur();
  const volver = (s) => { pantalla = 'opciones'; cursor = FILAS_OPCIONES.indexOf('pin'); if (s) avisar(s, 5); };
  if (v !== '' && !/^\d{4,8}$/.test(v)) { avisar('La clave son de 4 a 8 numeros'); return; }
  try {
    if (v === '') { await api({ accion: 'proteger', nick: op.nick, pin: op.pin, pinNuevo: '' }); op.pin = ''; guardarOpciones(); return volver('Tu nombre quedo sin clave'); }
    let r = null;
    try { r = await api({ accion: 'nombre', nick: op.nick, pin: v }); } catch (er) { if (er.codigo !== 403) throw er; }
    if (r && r.protegido) { op.pin = v; guardarOpciones(); return volver('Clave aceptada: en este aparato ya podes usar tu nombre'); }
    // sin clave todavia: se le pone; con otra clave: se cambia (hace falta la de antes, guardada en este aparato)
    await api({ accion: 'proteger', nick: op.nick, pin: op.pin, pinNuevo: v });
    op.pin = v; guardarOpciones(); volver(r ? `${op.nick} quedo protegido con clave` : 'Clave cambiada');
  } catch (er) { volver(er.codigo === 403 ? 'Esa no es la clave de ese nombre' : er.message); }
}
function cancelarTexto() {
  entrada.blur();
  if (pantalla === 'nick' && destinoNick === 'pin') { pantalla = 'opciones'; return; }
  if (pantalla === 'nick') { if (destinoNick === 'cambiar') { pantalla = 'opciones'; cursor = 0; } else { pantalla = 'menu'; cursor = destinoNick === 'solo' ? 0 : 1; } } else escribiendo = false;
}
// ---------- modo solo con ranking ----------
// con PANEL DE MODIFICADORES (OPCIONES, 21/10) primero se eligen; si no, directo a jugar
function jugarSolo() { if (op.panelMods) abrirMods('solo'); else empezarSolo(op.nick); }
function empezarSolo(nick) {
  soloNick = nick; ruleta = null; soloEtapas = []; sesionFin = null;
  pantalla = 'oculto';
  api({ accion: 'ranking' }).then(r => { ranking = r; rankingSolo = r.solo; }).catch(() => {});
  J.arrancar({ solo: { nick }, desbloqueado: op.desbloqueado, sinCorte: op.sinCorte, atraccion: { intro: op.intro && !introVista, demo: op.demo, sonido: op.demoSonido },
    modsSolo: op.panelMods ? { opciones: aBits(op.mods), skin: op.mods.skin | 0 } : null });
  introVista = true;
}
const nickJugador = (j) => (j === 2 ? soloNick.slice(0, 13) + ' 2P' : soloNick);   // el 2.o jugador, con el numerico
// lo llama principal.js con lo que avisa el juego (trabajador.js, seguirSolo)
export function ruletaSolo(m) { ruleta = m.cancion ? m : null; }
export function etapaSolo(m) {
  if (!soloNick) return;
  soloEtapas.push(m);
  api({ accion: 'solo_etapa', nick: nickJugador(m.jugador), pin: op.pin, cancion: m.cancion, modo: m.modo, puntaje: m.puntaje, nota: m.nota, combo: m.combo | 0 })
    .then(r => { rankingSolo = r; }).catch((er) => { if (er.codigo === 403) avisar(er.message, 6); });
}
// la sesion termino (el juego volvio al titulo) o se salio con Esc despues de jugar: total al ranking y la tabla de 20
// (21/10, Charles: "tras una partida no tiene que hacer nada; cuando yo elija volver, que vuelva al menu principal") la
// sesion se anota en el ranking sin cambiar de pantalla: se sigue jugando en la cabina. Con ATRAS (juegoCerrado) se
// anota lo que falte y se vuelve al MENU PRINCIPAL (no a la tabla del ranking).
export function sesionSolo() {
  if (!soloNick || !soloEtapas.length) return false;
  const tot = {};
  for (const e of soloEtapas) { const t = tot[e.jugador] || (tot[e.jugador] = { puntaje: 0, etapas: 0 }); t.puntaje += e.puntaje; t.etapas++; }
  const yo = tot[1] ? 1 : 2;
  sesionFin = { nick: nickJugador(yo), puntaje: tot[yo].puntaje, etapas: tot[yo].etapas };
  soloEtapas = [];
  for (const [j, t] of Object.entries(tot)) api({ accion: 'solo_sesion', nick: nickJugador(+j), pin: op.pin, puntaje: t.puntaje, etapas: t.etapas }).then(r => { rankingSolo = r; }).catch(() => avisar('No se pudo guardar en el ranking'));
  avisar(`Sesion anotada en el ranking: ${sesionFin.puntaje} puntos en ${sesionFin.etapas} cancion${sesionFin.etapas === 1 ? '' : 'es'}`, 4);
  return true;
}
function pedirNick() { pantalla = 'nick'; entrada.value = op.nick || ''; entrada.maxLength = 16; entrada.focus(); }
async function entrarSala(nick) {
  try {
    const r = await api({ accion: 'entrar', nick, pin: op.pin, avatar: op.avatar });
    sala.yo = r; sala.chat = []; sala.chatDesde = 0; cursor = 0;
    op.nick = r.nick; guardarOpciones();
    pantalla = 'sala'; sondear();
  } catch (e) { avisar(e.message); pedirNick(); }
}
// (no borra lo que habia: con el servidor lento, la tabla quedaba vacia hasta que llegaba la respuesta)
async function pedirRanking() {
  paginaRanking = 0;
  if (op.nick) api({ accion: 'perfil', nick: op.nick }).then((r) => { perfil = r.perfil || false; }).catch(() => {});
  try { ranking = await api({ accion: 'ranking' }); rankingSolo = ranking.solo || rankingSolo; } catch (e) { avisar('No se pudo leer el ranking'); } }

// ---------- dibujo ----------
function dibujar() {
  requestAnimationFrame(dibujar);
  if (!R.listo) {   // el menu todavia carga: negro, o el titulo de verdad si ya llego
    if (J.hayFondo()) { if (!vivoDesde) vivoDesde = performance.now() - 1000; x.clearRect(0, 0, 640, 480); }
    else { x.fillStyle = '#000'; x.fillRect(0, 0, 640, 480); }
    return;
  }
  const oculto = pantalla === 'oculto' || pantalla === 'jugando' || pantalla === 'eligiendo' || pantalla === 'probando';
  lienzo.style.display = oculto ? 'none' : '';
  if (oculto) return;                      // mientras se juega no se dibuja el menu (en un celular cada cuadro cuenta)
  const t = performance.now() / 1000;
  // detras corre la pantalla de titulo de verdad (principal.js, el juego en modo fondo): el menu se dibuja encima,
  // transparente. Mientras arranca (o si no hay), el fondo armado con los mosaicos del titulo.
  const vivo = J.hayFondo(), deMenu = ['menu', 'controles', 'opciones', 'nick'].includes(pantalla);
  if (vivo && !vivoDesde) vivoDesde = performance.now(); else if (!vivo) vivoDesde = 0;
  if (pantalla === 'cuenta') { dibujarCuenta(t); }
  else {
    if (vivo) {
      x.clearRect(0, 0, 640, 480);
      // el titulo armado se desvanece sobre el de verdad cuando este aparece (Charles, 19/10: "en principio se ve el
      // menu viejo y despues carga"): estan en el mismo lugar, asi que se ve como que el titulo empieza a moverse
      const a = 1 - (performance.now() - vivoDesde) / 700;
      if (a > 0 && deMenu) { x.globalAlpha = a; tituloArmado(t); x.globalAlpha = 1; }
      if (!deMenu) { x.fillStyle = 'rgba(0,0,25,.5)'; x.fillRect(0, 0, 640, 480); x.fillStyle = 'rgba(0,0,25,.85)'; x.fillRect(0, 428, 640, 52); }   // el pie del titulo ("FREE PLAY") no
    }
    else if (deMenu) tituloArmado(t);
    else x.drawImage(R.fondo, 0, 0);
    // al cambiar de pantalla, lo nuevo aparece con un fundido y sube un poco (como las transiciones del juego)
    if (pantalla !== cambio.pantalla) { cambio.pantalla = pantalla; cambio.desde = performance.now(); }
    const e = Math.min(1, (performance.now() - cambio.desde) / 260), ee = 1 - Math.pow(1 - e, 3);
    x.save(); x.globalAlpha = ee; x.translate(0, (1 - ee) * 18);
    if (pantalla === 'menu' || pantalla === 'controles' || pantalla === 'opciones' || pantalla === 'nick') dibujarMenu(t, vivo);
    else if (pantalla === 'sala' || pantalla === 'esperando') dibujarSala(t);
    else if (pantalla === 'elegir') dibujarElegir(t);
    else if (pantalla === 'resultado') dibujarResultado(t);
    else if (pantalla === 'ranking') dibujarRanking(t);
    else if (pantalla === 'mods') dibujarMods(t);
    else if (pantalla === 'editor') dibujarEditor(x, t);
    else if (pantalla === 'usb') dibujarUsb(t);
    else if (pantalla === 'calibrar') dibujarCalibrar(t);
    else if (pantalla === 'teclas') dibujarTeclas(t);
    else if (pantalla === 'avatar') dibujarElegirAvatar(t);
    else if (pantalla === 'mirando') dibujarMirando(t);
    x.restore();
    if (pantalla === 'sala' || pantalla === 'esperando' || pantalla === 'elegir' || pantalla === 'ranking' || pantalla === 'mods' || pantalla === 'resultado') nieve(0.35);
  }
  if (mensaje && performance.now() < mensajeHasta) {
    x.fillStyle = 'rgba(0,0,0,.8)'; x.fillRect(0, 444, 640, 30);
    texto(x, mensaje.slice(0, 39), 320, 452, 2, 'amarillo', true);
  }
}
// recuadro con el marco celeste de la seleccion (SELECT.DAT GLOW) en los grandes, como las ventanas del juego
function caja(x0, y0, w, h, a = 0.62) {
  x.fillStyle = `rgba(0,0,30,${a})`; x.fillRect(x0, y0, w, h);
  if (h > 60 && R.marco) { x.save(); x.globalAlpha = 0.85; x.drawImage(R.marco, 0, 29, 256, 197, x0 - 6, y0 - 6, w + 12, h + 12); x.restore(); }
}
// los numeros grandes del reloj de la seleccion (SELECT.DAT TIME: 1-4 / 5-8 / 9 0 en tres filas de 84 px), centrados
const RELOJ = { 1: [4, 40, 0], 2: [60, 107, 0], 3: [116, 165, 0], 4: [170, 222, 0], 5: [3, 53, 85], 6: [58, 108, 85], 7: [119, 159, 85], 8: [168, 217, 85], 9: [2, 52, 170], 0: [59, 108, 170] };
function numerosReloj(s, cx, py, alto) {
  const k = alto / 84, ds = [...String(s)].map(c => RELOJ[c]).filter(Boolean);
  let px = cx - ds.reduce((a, d) => a + (d[1] - d[0] + 6) * k, 0) / 2;
  for (const d of ds) { const w = d[1] - d[0] + 1; x.drawImage(R.reloj, d[0], d[2], w, 84, px, py, w * k, alto); px += (w + 6) * k; }
}

// ---------- nieve y destellos (con los graficos del titulo) ----------
const copos = Array.from({ length: 90 }, () => ({ x: Math.random() * 640, y: Math.random() * 480, t: 5 + Math.random() * 14, v: 18 + Math.random() * 46, f: Math.random() * 6.3, a: 0.35 + Math.random() * 0.55 }));
let ultimoCopo = performance.now();
function nieve(cantidad = 1) {
  const ahora = performance.now(), dt = Math.min(0.1, (ahora - ultimoCopo) / 1000); ultimoCopo = ahora;
  x.save(); x.globalCompositeOperation = 'lighter';
  const n = Math.floor(copos.length * cantidad);
  for (let i = 0; i < n; i++) {
    const c = copos[i];
    c.y += c.v * dt; c.x += Math.sin(ahora / 900 + c.f) * 12 * dt;
    if (c.y > 490) { c.y = -20; c.x = Math.random() * 640; }
    x.globalAlpha = c.a; x.drawImage(R.copo, 0, 0, 32, 32, c.x - c.t / 2, c.y - c.t / 2, c.t, c.t);
  }
  x.restore();
}
function destellos(t) {
  x.save(); x.globalCompositeOperation = 'lighter';
  // dos destellos grandes que respiran detras del logo, como en la pantalla de titulo
  for (const [cx, cy, fase] of [[150, 70, 0], [500, 150, 2.1]]) {
    const k = 0.75 + 0.25 * Math.sin(t * 1.3 + fase), tam = 230 * k;
    x.globalAlpha = 0.55 * k; x.drawImage(R.destello, cx - tam / 2, cy - tam / 2, tam, tam);
  }
  // los chicos titilan y viajan despacio
  for (let i = 0; i < 6; i++) {
    const hoja = i % 2 ? R.destellos2 : R.destellos1, celda = i % 4;
    const cx = (90 + i * 97 + t * (8 + i * 3)) % 680 - 20, cy = 40 + ((i * 131) % 380);
    x.globalAlpha = 0.35 + 0.35 * Math.sin(t * (1.7 + i * 0.3) + i);
    x.drawImage(hoja, (celda % 2) * 128, Math.floor(celda / 2) * 128, 128, 128, cx - 40, cy - 40, 80, 80);
  }
  x.restore();
}
// mientras el juego de fondo arranca (unos segundos: carga sus paquetes), el titulo armado con sus mismos mosaicos y
// el logo (LG1-5) a tamano completo en 0,0, que es donde lo pone el juego; asi el paso al de verdad casi no se nota
let vivoDesde = 0;
const cambio = { pantalla: '', desde: 0 };   // para la transicion de entrada de cada pantalla (dibujar)
function tituloArmado(t) {
  x.drawImage(R.fondo, 0, 0);
  destellos(t);
  x.drawImage(R.logo, 0, 0);
}
function dibujarMenu(t, vivo) {
  // con la pantalla de titulo de verdad atras, el logo y sus destellos ya los anima el juego: solo va la nieve
  nieve(vivo ? 0.6 : 1);
  {   // tapa el pie del titulo ("FREE PLAY", creditos): ahi van las opciones
    const g = x.createLinearGradient(0, 250, 0, 480);
    g.addColorStop(0, 'rgba(0,0,30,0)'); g.addColorStop(0.25, 'rgba(0,0,30,.55)'); g.addColorStop(0.7, 'rgba(0,0,30,.94)'); g.addColorStop(1, 'rgba(0,0,30,1)');
    x.fillStyle = g; x.fillRect(0, 250, 640, 230);
  }
  if (pantalla === 'nick') {
    caja(110, 290, 420, 120);
    texto(x, destinoNick === 'pin' ? 'CLAVE DEL NOMBRE (4 A 8 NUMEROS; VACIA = SACARLA)' : destinoNick === 'solo' || destinoNick === 'cambiar' ? 'TU NOMBRE PARA EL RANKING' : 'TU NICKNAME', 320, 302, destinoNick === 'pin' ? 1.2 : 2, 'celeste', true);
    texto(x, (destinoNick === 'pin' ? '*'.repeat((entrada.value || '').length) : (entrada.value || '')) + (Math.floor(t * 2) % 2 ? '_' : ' '), 320, 340, 3, 'amarillo', true);
    texto(x, esTactil ? 'CENTRO O "IR" = ENTRAR   ATRAS = VOLVER' : 'ENTER = ENTRAR   ESC = VOLVER', 320, 390, 1, 'gris', true);
    if (esTactil && document.activeElement !== entrada) texto(x, 'TOCA ACA PARA ESCRIBIR', 320, 418, 1, 'celeste', true);
    return;
  }
  const si = (v) => (v ? 'SI' : 'NO');
  const items = pantalla === 'menu' ? MENU.map((m) => NOMBRE_MENU[m])
    : pantalla === 'opciones' ? FILAS_OPCIONES.map((f) => ({ nombre: `TU NOMBRE: ${op.nick || '-'}`, pin: `CLAVE DEL NOMBRE: ${op.pin ? 'PUESTA' : 'SIN CLAVE'}`, avatar: `AVATAR: ${op.avatar ? 'ELEGIDO' : 'NINGUNO'}`, controles: `CONTROLES: ${CORTO_CONTROLES[op.controles]}`, paneles: `PANELES: ${op.panelesDos ? 'DOS' : 'UNO'}`,
      tamano: `TAMANO DE PANELES: ${Math.round(op.tamanoPads * 100)}%`, vibrar: `VIBRAR AL PISAR: ${si(op.vibrar)}`,
      usb: `MANDO USB: ${op.usb ? 'APRENDIDO' : 'COMUN'}${J.mando.hay().length ? ' (CONECTADO)' : ''}`, calibrar: `CALIBRAR: ${op.desfase > 0 ? '+' : ''}${op.desfase} MS`,
      fondo: `FONDO: ${nombreFondo(op.fondo)}`, cuenta: `CUENTA DEL ONLINE: ${op.cuenta} S`, panelmods: `PANEL DE MODIFICADORES: ${si(op.panelMods)}`,
      carril: `FLECHAS DE UNO SOLO: ${op.carril === 'centro' ? 'AL CENTRO' : 'EN SU LUGAR'}`,
      rival: `RIVAL EN PANTALLA: ${{ juego: 'COMO EL JUEGO', datos: 'SOLO DATOS', no: 'NO' }[op.vistaRival] || 'COMO EL JUEGO'}`,
      teclas: `TECLAS: ${op.teclas ? 'PROPIAS' : 'DE FABRICA'}`, pantalla: `PANTALLA: ${op.pantalla === 'estirar' ? 'ESTIRAR' : '4:3 ORIGINAL'}`, volumen: `VOLUMEN: ${Math.round(op.volumen * 100)}%`,
      intro: `INTRO: ${si(op.intro)}`, demo: `DEMO: ${si(op.demo)}`, sonido: `SONIDO DEMO: ${si(op.demoSonido)}`, desbloqueado: `TODO DESBLOQUEADO: ${si(op.desbloqueado)}`, sincorte: `SIN CORTE: ${si(op.sinCorte)}`, volver: 'VOLVER' }[f]))
    : ['IZQUIERDA', 'DERECHA', 'NUMERICO', 'TODOS'];
  // mas de 8 filas (OPCIONES en el celular): se ven 8 y la lista corre con el cursor
  const VIS = 8, desde = items.length > VIS ? Math.max(0, Math.min(cursor - 3, items.length - VIS)) : 0, vistos = items.slice(desde, desde + VIS);
  const n = vistos.length, paso = n > 7 ? 22 : n > 6 ? 24 : n > 5 ? 27 : n > 4 ? 30 : 33, y0 = n > 7 ? 256 : n > 6 ? 260 : n > 5 ? 266 : n > 4 ? 272 : 278;
  const esc = n > 7 ? 1.4 : n > 6 ? 1.6 : 2;            // con 7 filas la letra un poco mas chica para que no se pisen
  if (desde > 0) texto(x, '^', 320, y0 - 20, 1, 'celeste', true);
  if (desde + VIS < items.length) texto(x, 'v', 320, y0 + n * paso - 6, 1, 'celeste', true);
  // cada opcion en su franja; la elegida con el marco celeste, en amarillo, con las bolitas de SHIFT a los costados
  vistos.forEach((s, k) => {
    const i = desde + k, y = y0 + k * paso, sel = i === cursor;
    const g = x.createLinearGradient(140, 0, 500, 0);
    g.addColorStop(0, 'rgba(0,0,40,0)'); g.addColorStop(0.5, sel ? 'rgba(10,30,90,.85)' : 'rgba(0,0,40,.6)'); g.addColorStop(1, 'rgba(0,0,40,0)');
    x.fillStyle = g; x.fillRect(140, y - 6, 360, 30);
    if (sel) {
      x.drawImage(R.marco, 0, 29, 256, 197, 170, y - 8, 300, 33);
      const b = 4 * Math.sin(t * 6);
      x.drawImage(R.boton, 192, 0, 32, 32, 136 + b, y - 5, 26, 26); x.drawImage(R.boton, 192, 0, 32, 32, 478 - b, y - 5, 26, 26);
    }
    texto(x, s, 320, y, esc, sel ? 'amarillo' : 'blanco', true);
  });
  const dia = rankingSolo && rankingSolo.dia && cancion(rankingSolo.dia.cancion);
  const pie = pantalla === 'menu' ? (dia ? `CANCION DEL DIA: ${dia.nombre} (RANKING > CANCION DEL DIA)` : `CONTROLES: ${NOMBRE_CONTROLES[op.controles]}`) : pantalla === 'opciones' ? AYUDA_OPCIONES[FILAS_OPCIONES[cursor]] : `TECLAS: ${TECLAS_CONTROLES[CONTROLES[cursor]]}`;
  texto(x, pie, 320, y0 + n * paso + 10, 1, 'celeste', true);
  texto(x, 'FLECHAS O PADS = MOVER   ENTER O CENTRO = ELEGIR', 320, 452, 1, 'gris', true);
  texto(x, 'PUMP IT UP EXTRA (C) ANDAMIRO 2001', 6, 466, 1, 'gris');
  texto(x, CREDITOS, 634 - CREDITOS.length * 8, 466, 1, 'celeste');     // Charles, 20/10: en la web y en la build de Edge
  // si el ranking y el salon del hosting responden (en la build de Edge puede no haber internet)
  const est = conexion === null ? 'CONECTANDO...' : conexion ? 'EN LINEA: RANKING Y ONLINE' : 'SIN CONEXION: SIN RANKING NI ONLINE';
  h_conexion(est, conexion);
}
function dibujarSala(t) {
  texto(x, 'SALON ONLINE', 20, 14, 3, 'amarillo');
  texto(x, sala.yo ? sala.yo.nick : '', 620 - (sala.yo ? sala.yo.nick.length : 0) * 16, 22, 2, 'celeste');
  // jugadores
  caja(16, 62, 250, 340);
  texto(x, 'JUGADORES', 28, 70, 2, 'celeste');
  const otros = sala.jugadores.filter(j => j.id !== sala.yo.id);
  if (!otros.length) texto(x, 'ESPERANDO A ALGUIEN...', 28, 108, 1, 'gris');
  otros.slice(0, 9).forEach((j, i) => {
    const y = 104 + i * 32, sel = i === cursor;
    barra(sel ? 'oro' : j.estado === 'sala' ? 'azul' : 'rojo', 20, y - 6, 242, 30, sel ? 0.9 : 0.55);
    const conAvatar = dibujarAvatar(j.avatar, 24, y - 3, 26);
    texto(x, j.nick.slice(0, conAvatar ? 8 : 10), conAvatar ? 54 : 32, y, 2, 'blanco');
    texto(x, j.estado === 'sala' ? 'LIBRE' : sel && j.partida ? 'MIRAR' : 'JUGANDO', 194, y + 4, 1, j.estado === 'sala' ? 'verde' : 'rojo');
  });
  // chat
  caja(278, 62, 346, 340);
  texto(x, 'CHAT', 290, 70, 2, 'celeste');
  const lineas = [];
  for (const m of sala.chat) {
    const s = m.sistema ? '* ' + m.texto : `${m.nick}: ${m.texto}`;
    for (let i = 0; i < s.length; i += 40) lineas.push({ s: s.slice(i, i + 40), sistema: !!m.sistema });
  }
  lineas.slice(-17).forEach((l, i) => texto(x, l.s, 290, 100 + i * 16, 1, l.sistema ? 'gris' : 'blanco'));
  if (escribiendo) { caja(278, 376, 346, 26, 0.9); texto(x, '> ' + entrada.value.slice(-38) + (Math.floor(t * 2) % 2 ? '_' : ''), 288, 382, 1, 'amarillo'); }
  // ayuda o desafio
  const desafio = sala.desafios.find(d => !d.mio);
  if (desafio) dibujarDesafio(desafio, t);
  else if (pantalla === 'esperando') {
    caja(80, 150, 480, 150, 0.85);
    const d = sala.desafios.find(d => d.mio);
    texto(x, 'ESPERANDO QUE ACEPTE', 320, 170, 2, 'amarillo', true);
    if (d) { texto(x, d.nick, 320, 210, 3, 'celeste', true); texto(x, `${nombreCon(d)} - ${d.modo}`, 320, 256, 1, 'blanco', true); }
    else if (subida) texto(x, `SUBIENDO TU CANCION ${Math.round(subida.progreso * 100)}%`, 320, 230, 2, 'celeste', true);
    texto(x, 'ESC = CANCELAR', 320, 280, 1, 'gris', true);
  }
  texto(x, escribiendo && esTactil ? 'CENTRO O "IR" = ENVIAR   ATRAS = CANCELAR' : esTactil ? 'CENTRO = DESAFIAR (O MIRAR)   ATRAS = SALIR' : 'ENTER = DESAFIAR (O MIRAR SI JUEGA)   T = CHAT   R = RANKING   ESC = SALIR', 320, 414, 1, 'gris', true);
}
function dibujarDesafio(d, t) {
  caja(60, 110, 520, 270, 0.92);
  cartel(x, 'BATTLE', 320, 145, 300);
  texto(x, `${d.nick} TE DESAFIA`, 320, 182, 2, 'amarillo', true);
  const portada = portadaDe(d.cancion, d.paquete);
  if (portada) x.drawImage(portada, 90, 212, 160, 120);
  texto(x, nombreCon(d).slice(0, 18), 270, 232, 2, 'blanco'); cartel(x, d.modo, 410, 290, 200);
  // cancion propia: llega en un paquete, se revisa entera y recien ahi se puede aceptar
  const est = d.paquete && paquetes.get(d.paquete.pq);
  if (d.paquete) texto(x, !est || est.estado === 'bajando' ? `CANCION PROPIA: RECIBIENDO ${Math.round((est ? est.progreso : 0) * 100)}%` : est.estado === 'listo' ? 'CANCION PROPIA: RECIBIDA Y REVISADA' : 'NO PASO LA REVISION: ' + est.error.toUpperCase().slice(0, 30), 320, 334, 1, !est || est.estado === 'bajando' ? 'celeste' : est.estado === 'listo' ? 'verde' : 'rojo', true);
  texto(x, 'ENTER = ACEPTAR    ESC = NO', 320, 350, 2, Math.floor(t * 3) % 2 ? 'celeste' : 'blanco', true);
}
function dibujarElegir(t) {
  texto(x, `DESAFIO A ${elegido.rival.nick}`, 320, 14, 2, 'amarillo', true);
  const c = CANCIONES[elegido.cancion];
  x.drawImage(R.marco, 0, 29, 256, 197, 150, 48, 340, 260);
  x.drawImage(R.caratulas[c.n], 168, 64, 304, 228);
  // las de los costados, mas chicas
  const izq = CANCIONES[(elegido.cancion + CANCIONES.length - 1) % CANCIONES.length], der = CANCIONES[(elegido.cancion + 1) % CANCIONES.length];
  x.globalAlpha = 0.55; x.drawImage(R.caratulas[izq.n], 8, 120, 136, 102); x.drawImage(R.caratulas[der.n], 496, 120, 136, 102); x.globalAlpha = 1;
  x.drawImage(R.flechas, 0, 128, 128, 128, 30, 228, 64, 64); x.drawImage(R.flechas, 128, 128, 128, 128, 546, 228, 64, 64);
  texto(x, c.nombre, 320, 314, 2, 'blanco', true);
  cartel(x, c.modos[elegido.modo], 320, 366, 230);
  texto(x, `MODO ${elegido.modo + 1}/${c.modos.length}`, 320, 396, 1, 'gris', true);
  x.drawImage(R.boton, 3, 28, 173, 147, 520, 330, 87, 74);
  texto(x, 'IZQ/DER = CANCION   ARRIBA/ABAJO = MODO   ENTER = DESAFIAR', 320, 420, 1, 'gris', true);
}
function dibujarCuenta(t) {
  x.drawImage(R.fondo, 0, 0);
  const p = sala.partida; if (!p) return;
  const portada = portadaDe(p.cancion, p.paquete), falta = Math.max(0, (p.inicio * 1000 - ahoraServidor()) / 1000);
  if (portada) x.drawImage(portada, 176, 10, 288, 216);
  const r = rival();
  texto(x, `${sala.yo.nick}  VS  ${r ? r.nick : '?'}`, 320, 234, 2, 'amarillo', true);
  cartel(x, p.modo, 320, 300, 220);
  // (21/10) la cuenta arranca cuando los dos cargaron el juego; hasta ahi, quien falta
  if (!p.arrancada) {
    const listos = p.listos || {}, yoListo = !!listos[sala.yo.id], puntos = '...'.slice(0, 1 + Math.floor(t * 2.5) % 3);
    texto(x, yoListo ? `ESPERANDO QUE CARGUE ${r ? r.nick : 'EL RIVAL'}${puntos}` : `CARGANDO EL JUEGO${puntos}`, 320, 370, 1.5, 'celeste', true);
  } else if (falta > 0.4) {      // el numero grande del reloj de la seleccion, que late en cada segundo
    const f = falta % 1, k = 1 + 0.25 * Math.max(0, f - 0.7) / 0.3;
    texto(x, 'ARRANCA EN', 320, 352, 1, 'celeste', true);
    numerosReloj(Math.ceil(falta), 320, 370 - (k - 1) * 40, 70 * k);
  } else texto(x, 'CARGANDO...', 320, 404, 2, 'blanco', true);
}
function dibujarResultado(t) {
  const yo = resultado.yo, r = rival();
  const termino = r && r.terminado;
  caja(30, 30, 580, 400, 0.75);
  texto(x, 'RESULTADO', 320, 44, 3, 'amarillo', true);
  const fila = (nick, m, y, color) => {
    barra(color, 44, y - 8, 420, 92, 0.45);
    texto(x, nick, 60, y, 2, 'celeste');
    numerosCromo(String(m ? m.puntaje || 0 : 0).padStart(7, '0'), 300, y + 32, 34);
    if (m && m.nota && R.notas[m.nota]) x.drawImage(R.notas[m.nota], 470, y - 10, 90, 90);
    if (m && m.combo !== undefined) texto(x, `COMBO MAX ${m.comboMax || m.combo || 0}`, 260, y + 44, 1, 'gris');
  };
  fila(sala.yo.nick, yo, 100, 'azul');
  fila(r ? r.nick : 'RIVAL', r, 230, 'rojo');
  if (!termino) texto(x, 'ESPERANDO EL PUNTAJE DEL RIVAL...', 320, 360, 1, 'gris', true);
  else {
    const gane = (yo.puntaje || 0) > (r.puntaje || 0), empate = (yo.puntaje || 0) === (r.puntaje || 0);
    if (!empate) x.drawImage(gane ? R.gano : R.perdio, 0, gane ? 51 : 63, 256, gane ? 153 : 129, 230, 320, 180, gane ? 108 : 90);
    else texto(x, 'EMPATE', 320, 360, 3, 'amarillo', true);
  }
  // (21/10, Charles: "cuando termine una cancion en online que te vaya al panel") vuelve solo al salon: 6 s despues de
  // tener los dos puntajes, o a los 25 s si el del rival no llega. ENTER vuelve antes.
  const ahora = performance.now();
  if (termino && !resultado.ambos) resultado.ambos = ahora;
  const vuelta = resultado.ambos ? resultado.ambos + 6000 : resultado.desde + 25000;
  if (ahora >= vuelta) { volverASala(); return; }
  if (ahora - resultado.desde > 1500) texto(x, `VUELVE AL SALON EN ${Math.ceil((vuelta - ahora) / 1000)}   ${esTactil ? 'CENTRO' : 'ENTER'} = YA`, 320, 438, 1, 'gris', true);
}
// tres tablas que se pasan con izquierda/derecha: las 20 mejores sesiones del modo solo (sumando sus canciones), el
// mejor de cada cancion (solo u online, cualquier modo) y los jugadores del online por partidas ganadas.
// Con la interfaz del juego (Charles, 20/10: "como te dije en la intro, usando los assets y como esta animado todo"):
// el titulo de fondo con sus destellos y la nieve, las barras de color de la seleccion (SELECT.DAT BAR1-3), los
// numeros cromados de la pantalla de resultado (GRADE.DAT NUM), los nombres de modo (MODENAME) y los botones SHIFT.
// Las filas entran deslizandose una tras otra y un brillo pasa por las tres primeras.
const PAGINAS_RANKING = ['MEJORES 20 SESIONES (SOLO)', 'MEJOR DE CADA CANCION', 'ONLINE: PARTIDAS GANADAS', 'ESTA SEMANA (SOLO)', 'CANCION DEL DIA', 'TU PERFIL'];
let perfil = null;
// (mejora 14) el perfil del nombre con el que se juega: lo que junta api.php (anotarPerfil) en solo y en el online
function dibujarPerfil(t, fila) {
  if (!op.nick) { texto(x, 'JUGA EN SOLO U ONLINE CON TU NOMBRE Y APARECE ACA', 320, 200, 1.2, 'gris', true); return; }
  if (!perfil) { texto(x, perfil === null ? 'CARGANDO...' : `${op.nick}: TODAVIA SIN PARTIDAS`, 320, 200, 1.5, 'gris', true); return; }
  const p = perfil;
  if (dibujarAvatar(p.avatar || op.avatar, 320 - p.nick.length * 9 - 50, 76, 40)) { /* el avatar a la izquierda del nombre */ }
  texto(x, p.nick, 320, 84, 2.2, 'amarillo', true);
  texto(x, `JUGANDO DESDE ${p.desde}`, 320, 118, 1, 'gris', true);
  const datos = [['CANCIONES', String(p.canciones)], ['MEJOR PUNTAJE', String(p.mejor)], ['COMBO MAXIMO', String(p.combo)], ['ONLINE', `${p.online.G}G ${p.online.P}P ${p.online.E}E`]];
  datos.forEach(([n, v], i) => {
    const py = 140 + i * 34; fila(i, 22, py, 290, 28, i === 1 ? 'oro' : 'violeta', 0.6);
    texto(x, n, 34, py + 7, 1, 'celeste');
    if (/^\d+$/.test(v)) numerosCromo(v, 304, py + 5, 18); else texto(x, v, 304 - v.length * 8, py + 7, 1, 'amarillo');
  });
  // las notas, con las letras de GRADE.DAT y cuantas de cada una
  ['S', 'A', 'B', 'C', 'D', 'F'].forEach((l, i) => {
    const px = 30 + i * 47; if (R.notas[l]) x.drawImage(R.notas[l], px, 290, 40, 40);
    texto(x, String(p.notas[l] || 0), px + 20, 334, 1, 'blanco', true);
  });
  texto(x, 'ULTIMAS CANCIONES', 470, 132, 1.2, 'celeste', true);
  (p.historial || []).slice(0, 10).forEach((h, i) => {
    const py = 152 + i * 27, ent = fila(i + 4, 328, py, 290, 24, h.online === 'G' ? 'verde' : h.online === 'P' ? 'rojo' : 'azul', 0.45), dx = -(1 - ent) * 340;
    if (ent < 0.05) return;
    texto(x, nombreDe(h.cancion).slice(0, 14), 336 + dx, py + 5, 1, 'blanco');
    texto(x, `${(h.modo || '').slice(0, 1)} ${h.nota || '-'}${h.online ? ' ' + h.online : ''}`, 456 + dx, py + 5, 1, 'amarillo');
    numerosCromo(String(h.puntaje), 612 + dx, py + 3, 16);
  });
  texto(x, 'G = GANADA  P = PERDIDA  E = EMPATE (ONLINE)', 470, 430, 1, 'gris', true);
}
const DIGITOS = [[0, 22], [26, 43], [49, 70], [75, 97], [101, 124], [128, 151], [155, 178], [181, 200], [204, 226], [232, 255]];
function numerosCromo(s, derecha, py, alto) {        // GRADE.DAT NUM: 0-9 en y 195-232, alineados a la derecha
  const k = alto / 38;
  let px = derecha;
  for (let i = s.length - 1; i >= 0; i--) {
    const d = DIGITOS[+s[i]];
    if (!d) { px -= 8 * k; continue; }
    const w = d[1] - d[0] + 1;
    px -= w * k; x.drawImage(R.numeros, d[0], 195, w, 38, px, py, w * k, alto); px -= 2 * k;
  }
}
const BARRAS = { oro: ['bar1', 0], rojo: ['bar1', 128], azul: ['bar2', 0], verde: ['bar2', 128], violeta: ['bar3', 0] };
function barra(color, px, py, w, h, a = 1) {          // la parte ancha de arriba de cada barra (SELECT.DAT, 2 por hoja)
  const [img, sy] = BARRAS[color];
  x.save(); x.globalAlpha = a; x.drawImage(R[img], 0, sy + 4, 212, 44, px, py, w, h); x.restore();
}
const MODOS_Y = { NORMAL: 3, HARD: 35, CRAZY: 67, DOUBLE: 99, REMIX: 131, BATTLE: 163 };
function nombreModo(modo, cx, py, alto) {             // SELECT.DAT MODENAME: un renglon de 27 px por modo
  const y0 = MODOS_Y[modo];
  if (y0 === undefined) { texto(x, modo, cx, py, 1, 'amarillo', true); return; }
  const k = alto / 27; x.drawImage(R.nombresModo, 0, y0, 256, 27, cx - 128 * k, py, 256 * k, alto);
}
const animRanking = { pagina: -1, desde: 0, ultimo: 0 };
function dibujarRanking(t) {
  const ahora = performance.now();
  if (animRanking.pagina !== paginaRanking || ahora - animRanking.ultimo > 300) { animRanking.pagina = paginaRanking; animRanking.desde = ahora; }
  animRanking.ultimo = ahora;
  const entra = (i) => { const e = Math.max(0, Math.min(1, (ahora - animRanking.desde - i * 55) / 320)); return 1 - Math.pow(1 - e, 3); };
  if (!J.hayFondo()) destellos(t);
  // titulo que late como el logo, y la tabla entre los botones SHIFT
  const k = 1 + 0.04 * Math.max(0, Math.sin(t * Math.PI * 2 * 1.35));
  texto(x, 'RANKING', 320, 16, 3 * k, 'amarillo', true);
  const titulo = PAGINAS_RANKING[paginaRanking], bw = titulo.length * 6 + 40, b = 4 * Math.sin(t * 6);
  texto(x, titulo, 320, 62, 1.5, 'celeste', true);
  x.drawImage(R.boton, 192, 0, 32, 32, 320 - bw - 26 + b, 56, 26, 26); x.drawImage(R.boton, 192, 0, 32, 32, 320 + bw - b, 56, 26, 26);
  const solo = rankingSolo || (ranking && ranking.solo);
  if (!ranking && !solo) { texto(x, 'CARGANDO...', 320, 200, 2, 'blanco', true); return; }
  const fila = (i, px, py, w, h, color, a) => { const e = entra(i); barra(color, px - (1 - e) * 340, py, w, h, a * e); return e; };
  const brillo = (px, py, w, h) => {                  // la luz que pasa por las tres primeras cada 3 s
    const s = ((ahora / 1000) % 3) / 3 * (w + 200) - 100;
    x.save(); x.globalCompositeOperation = 'lighter';
    const g = x.createLinearGradient(px + s - 60, 0, px + s + 60, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(px, py, w, h); x.restore();
  };
  if (paginaRanking === 5) dibujarPerfil(t, fila);
  else if (paginaRanking === 4) {                    // (mejora 15) la cancion del dia: su caratula y los 10 mejores de hoy
    const d = solo && solo.dia, c = d && cancion(d.cancion);
    if (!d || !c) { texto(x, 'CARGANDO...', 320, 200, 2, 'blanco', true); return; }
    x.drawImage(R.marco, 0, 29, 256, 197, 14, 96, 250, 192); x.drawImage(R.caratulas[c.n], 26, 108, 226, 170);
    texto(x, c.nombre.slice(0, 18), 139, 296, 1.5, 'amarillo', true);
    texto(x, 'HOY, EN CUALQUIER MODO', 139, 322, 1, 'celeste', true);
    texto(x, 'JUGALA EN SOLO Y ENTRA', 139, 346, 1, 'gris', true);
    if (!d.lista.length) texto(x, 'NADIE LA JUGO HOY: SE EL PRIMERO', 450, 200, 1, 'gris', true);
    d.lista.slice(0, 10).forEach((e, i) => {
      const px = 280, py = 96 + i * 31, w = 340, h = 26, yo = String(e.nick).toLowerCase() === String(op.nick || '').toLowerCase();
      const ent = fila(i, px, py, w, h, yo ? 'verde' : i === 0 ? 'oro' : i === 1 ? 'azul' : i === 2 ? 'rojo' : 'violeta', i < 3 || yo ? 0.95 : 0.5), dx = -(1 - ent) * 340;
      if (ent < 0.05) return;
      x.save(); x.globalAlpha = ent;
      texto(x, String(i + 1), px + dx + 18, py + 5, 1.2, 'blanco', true);
      texto(x, String(e.nick).slice(0, 14), px + dx + 36, py + 6, 1, i < 3 ? 'blanco' : 'celeste');
      texto(x, (e.modo || '').slice(0, 6), px + dx + 160, py + 6, 1, 'gris');
      numerosCromo(String(e.puntaje), px + dx + w - 8, py + 4, 18);
      x.restore();
      if (i < 3 && ent >= 1) brillo(px, py, w, h);
    });
  } else if (paginaRanking === 0 || paginaRanking === 2 || paginaRanking === 3) {
    const lista = paginaRanking !== 2 ? ((solo && (paginaRanking === 3 ? solo.semana && solo.semana.sesiones : solo.sesiones)) || []).map(e => ({ nick: e.nick, puntaje: e.puntaje }))
      : Object.entries((ranking && ranking.jugadores) || {}).sort((a, b) => b[1].ganadas - a[1].ganadas || b[1].mejor - a[1].mejor).map(([n, e]) => ({ nick: n, ganadas: e.ganadas, perdidas: e.perdidas }));
    if (paginaRanking === 0 && sesionFin) texto(x, `TU SESION: ${sesionFin.puntaje} PUNTOS EN ${sesionFin.etapas} CANCION${sesionFin.etapas === 1 ? '' : 'ES'}`, 320, 86, 1, 'verde', true);
    if (paginaRanking === 3 && solo && solo.semana) texto(x, `SEMANA ${String(solo.semana.id).slice(-2)} - SE VACIA CADA LUNES`, 320, 86, 1, 'gris', true);
    if (!lista.length) texto(x, paginaRanking === 2 && !ranking ? 'CARGANDO...' : paginaRanking === 0 ? 'TODAVIA NO HAY SESIONES' : paginaRanking === 3 ? 'NADIE JUGO ESTA SEMANA: SE EL PRIMERO' : 'TODAVIA NO HAY PARTIDAS', 320, 200, 1.5, 'gris', true);
    lista.slice(0, 20).forEach((e, i) => {
      const px = i < 10 ? 22 : 328, py = 104 + (i % 10) * 31, w = 290, h = 26;
      const yo = paginaRanking === 0 && sesionFin && String(e.nick).toLowerCase() === sesionFin.nick.toLowerCase();
      const color = yo ? 'verde' : i === 0 ? 'oro' : i === 1 ? 'azul' : i === 2 ? 'rojo' : 'violeta';
      const a = yo ? 0.75 + 0.25 * Math.sin(t * 8) : i < 3 ? 0.95 : 0.5;
      const ent = fila(i, px, py, w, h, color, a), dx = -(1 - ent) * 340;
      if (ent < 0.05) return;
      x.save(); x.globalAlpha = ent;
      texto(x, String(i + 1), px + dx + 18, py + 5, 1.2, i < 3 || yo ? 'blanco' : 'gris', true);
      texto(x, String(e.nick).slice(0, 16), px + dx + 36, py + 6, 1, yo ? 'blanco' : i < 3 ? 'blanco' : 'celeste');
      if (paginaRanking !== 2) numerosCromo(String(e.puntaje), px + dx + w - 8, py + 4, 18);
      else texto(x, `${e.ganadas}G ${e.perdidas}P`, px + dx + w - 8 - `${e.ganadas}G ${e.perdidas}P`.length * 8, py + 6, 1, 'amarillo');
      x.restore();
      if (i < 3 && ent >= 1) brillo(px, py, w, h);
    });
  } else {
    const mejores = [...Object.entries((solo && solo.canciones) || {}), ...Object.entries((ranking && ranking.mejores) || {})];
    const filas = Math.ceil(CANCIONES.length / 2), alto = Math.min(38, Math.floor(330 / filas));
    CANCIONES.forEach((c, i) => {
      const px = i < filas ? 22 : 328, py = 90 + (i % filas) * alto, w = 290;
      const top = mejores.filter(([k]) => +k.split(' ')[0] === c.n).map(([k, l]) => ({ modo: k.split(' ')[1], ...(l[0] || {}) })).filter(e => e.nick).sort((a, b) => b.puntaje - a.puntaje)[0];
      const ent = fila(i, px, py, w, alto - 2, top ? 'azul' : 'violeta', top ? 0.6 : 0.35), dx = -(1 - ent) * 340;
      if (ent < 0.05) return;
      x.save(); x.globalAlpha = ent;
      if (R.caratulas[c.n]) x.drawImage(R.caratulas[c.n], px + dx + 4, py + 1, 34, alto - 4);
      texto(x, c.nombre.slice(0, 29), px + dx + 44, py + 1, 1, 'blanco');
      if (top) {
        texto(x, String(top.nick).slice(0, 12), px + dx + 44, py + 15, 1, 'amarillo');
        numerosCromo(String(top.puntaje), px + dx + 222, py + 14, 13);
        nombreModo(top.modo, px + dx + 258, py + 16, 8);
      } else texto(x, 'SIN PUNTAJES TODAVIA', px + dx + 44, py + 15, 1, 'gris');
      x.restore();
    });
  }
  texto(x, esTactil ? 'FLECHAS = OTRA TABLA   CENTRO O ATRAS = VOLVER' : 'IZQ/DER = OTRA TABLA   ENTER O ESC = VOLVER', 320, 452, 1, 'gris', true);
}

// ---------- marcador del rival sobre el juego ----------
// en vertical el cuadro se agranda y se corta de los dos lados (principal.js): el marcador se corre a lo que se ve
let hud = null, zoomHud = 1;
export function fijarZoom(z) { zoomHud = z || 1; }
function dibujarHud() {
  requestAnimationFrame(dibujarHud);
  const verSolo = pantalla === 'oculto' && soloNick && ruleta, verEleccion = pantalla === 'eligiendo' && elegido.rival;
  const ver = (pantalla === 'jugando' && sala.partida) || verSolo || verEleccion;
  hud.style.display = ver ? '' : 'none';
  if (!ver || !R.listo) return;
  const h = hud.getContext('2d'), r = rival();
  h.clearRect(0, 0, 640, 480);
  if (verSolo) { dibujarTop3(h); return; }
  if (verEleccion) {      // arriba, chiquito, sobre la seleccion de verdad: a quien se desafia y como volver
    const xh = x; x = h;
    if (!eleccionVisible) {    // mientras carga la seleccion (antes: pantalla negra con la musiquita)
      if (R.fondo) h.drawImage(R.fondo, 0, 0); else { h.fillStyle = '#000'; h.fillRect(0, 0, 640, 480); }
      caja(120, 170, 400, 120, 0.88);
      texto(x, 'PREPARANDO LA SELECCION' + '...'.slice(0, 1 + Math.floor(performance.now() / 400) % 3), 320, 196, 2, 'amarillo', true);
      texto(x, `DESAFIO A ${elegido.rival.nick}`, 320, 240, 1.4, 'celeste', true);
    }
    const s = `DESAFIO A ${elegido.rival.nick} - ${esTactil ? 'ATRAS' : 'ESC'} = VOLVER`;
    h.fillStyle = 'rgba(0,0,30,.75)'; h.fillRect(320 - s.length * 4 - 8, 456, s.length * 8 + 16, 20);
    texto(x, s, 320, 459, 1, 'amarillo', true);
    x = xh; return;
  }
  const bx = Math.round(640 - (640 - 640 / zoomHud) / 2) - 216;      // borde derecho de lo que se ve
  if (op.vistaRival === 'no') return;
  const xh = x; x = h;
  const id = sala.partida && Object.keys(sala.partida.jugadores).find(k => k !== sala.yo.id), doble = sala.partida && sala.partida.modo === 'DOUBLE';
  if (op.vistaRival !== 'datos' && !doble && carril.notas) dibujarCarrilRival(r || { nick: 'RIVAL' }, vistaDe(id, r), bx + 14, sala.partida);
  else dibujarVivo(r || { nick: 'RIVAL' }, vistaDe(id, r), bx, 8, doble);
  if (sala.partida && sala.partida.miran) texto(x, `${sala.partida.miran} MIRANDO`, bx + 200 - `${sala.partida.miran} MIRANDO`.length * 8, 136, 1, 'gris');
  x = xh;
}
// ---------- mejoras 8 y 17: un jugador en vivo (el rival en el HUD, o los dos en MIRAR) ----------
// Cada ~0,45 s llegan del salon sus juicios en orden, los paneles que piso y sus cuentas (trabajador.js seguirVivo):
// los juicios se reparten en ese rato para que se vean de a uno, como en la cabina, y los paneles se prenden.
const vistas = new Map();
const JUICIOS = { P: ['PERFECT', 'celeste'], G: ['GREAT', 'verde'], O: ['GOOD', 'amarillo'], B: ['BAD', 'rojo'], M: ['MISS', 'gris'] };
function vistaDe(id, j) {
  if (!vistas.has(id)) vistas.set(id, { seq: -1, cola: [], pads: 0, padsHasta: 0, ultimo: '', ultimoT: 0, golpes: [] });
  const v = vistas.get(id), ahora = performance.now();
  if (j && j.seq !== undefined && j.seq !== v.seq) {
    const s = j.juicios || '';
    if (v.seq >= 0) for (let i = 0; i < s.length; i++) v.cola.push({ c: s[i], t: ahora + i * 450 / s.length });
    v.seq = j.seq; if (j.pads) { v.pads = j.pads; v.padsHasta = ahora + 350; }
  }
  while (v.cola.length && v.cola[0].t <= ahora) { const e = v.cola.shift(); v.ultimo = e.c; v.ultimoT = e.t; v.golpes.push(e.c); }
  return v;
}
// ---------- RIVAL COMO EN EL JUEGO (Charles 21/10: "que vayan apareciendo las flechas y se aprieten de acuerdo a la otra
// persona, y que el puntaje este abajo") ----------
// Un carril chico a la derecha con los pasos de verdad de la cancion (el mismo .NOT que juegan los dos), que suben con
// el tiempo de la partida (la hora de arranque compartida). Los receptores se prenden con los paneles que pisa el rival y
// cada juicio suyo hace explotar la flecha mas cercana. Va RETRASO segundos atrasado: sus datos llegan cada ~0,45 s.
const carril = { notas: null, archivo: '' }, RETRASO = 0.9;
function tiempoFila(p, r) {                     // JUEGO_REGLAS 5: la fila r cae en valores[s]/100 + r/fpp * 60/BPM[s]
  const fpp = p.filasPorPulso || 4, cam = p.cambiosBpm || [];
  for (let s = 0; s < 10; s++) {
    const t = (p.valores[s] || 0) / 100 + r / fpp * 60 / (p.bpms[s] || p.bpms[0] || 120);
    const desde = s ? cam[s - 1] : 0, hasta = cam[s] && (s === 0 || cam[s] > cam[s - 1]) ? cam[s] : Infinity;
    if (cam[0] === 0 || (t * 100 >= desde && t * 100 < hasta)) return t;
  }
  return (p.valores[0] || 0) / 100 + r / fpp * 60 / (p.bpms[0] || 120);
}
async function prepararCarril(p) {
  carril.notas = null; carril.archivo = '';
  const archivo = ((/run (\d\d_[a-z0-9]+\.not)/i.exec(p.cmd || '') || [])[1] || `${nn(p.cancion)}_h1.not`).toLowerCase();
  try {
    const pq = p.paquete && paquetes.get(p.paquete.pq);
    const bytes = pq && pq.limpio ? pq.limpio.not : await traer(DISCO + 'step/' + archivo);
    const pasos = leerPasos(archivo.toUpperCase(), bytes), notas = [];
    for (const [r, col] of pasos.notas) if (col < 5) notas.push({ t: tiempoFila(pasos, r), col, hecha: '' });
    for (const [col, d, f] of pasos.largas) if (col < 5) notas.push({ t: tiempoFila(pasos, d), fin: tiempoFila(pasos, f), col, hecha: '' });
    notas.sort((a, b) => a.t - b.t);
    carril.notas = notas; carril.archivo = archivo;
  } catch (e) { carril.notas = null; }
}
function flechaCarril(col, px, py, t, alfa) {
  const k = col % 5, img = k === 2 ? R.arrow03 : R.arrow01; if (!img) return;
  x.save(); x.globalAlpha = alfa; x.translate(px + t / 2, py + t / 2);
  x.scale(k === 3 || k === 4 ? -1 : 1, k === 0 || k === 4 ? -1 : 1);
  if (k === 2) x.drawImage(img, 2, 142, 66, 66, -t / 2, -t / 2, t, t);
  else if (k === 1 || k === 3) x.drawImage(img, 2, 72, 66, 66, -t / 2, -t / 2, t, t);
  else x.drawImage(img, 142, 142, 66, 66, -t / 2, -t / 2, t, t);
  x.restore();
}
function dibujarCarrilRival(j, v, px, p) {
  const ahora = performance.now(), W = 36, ancho = W * 5, arriba = 64, abajo = 430, vel = 260;   // px por segundo
  const tSeg = (ahoraServidor() / 1000 - p.inicio) - RETRASO;
  x.fillStyle = 'rgba(0,0,20,.55)'; x.fillRect(px - 6, 8, ancho + 12, 464);
  const avatarRival = (sala.jugadores.find((o) => o.nick === j.nick) || {}).avatar;
  if (dibujarAvatar(avatarRival, px, 10, 22)) texto(x, (j.nick || '?').slice(0, 12), px + 28, 14, 1.2, 'celeste');
  else texto(x, (j.nick || '?').slice(0, 14), px + ancho / 2, 14, 1.2, 'celeste', true);
  // los juicios que fueron llegando: cada uno marca la flecha sin juzgar mas cercana al receptor
  while (v.golpes.length) {
    const c = v.golpes.shift(); let mejor = null;
    for (const n of carril.notas) { if (n.hecha) continue; if (n.t > tSeg + 0.6) break; if (!mejor || Math.abs(n.t - tSeg) < Math.abs(mejor.t - tSeg)) mejor = n; }
    if (mejor) { mejor.hecha = c; mejor.cuando = ahora; }
  }
  // receptores (se prenden con los paneles que piso)
  const prendido = ahora < v.padsHasta ? v.pads : 0;
  for (let c = 0; c < 5; c++) {
    flechaCarril(c, px + c * W + 2, arriba, W - 4, prendido & (1 << c) ? 1 : 0.35);
    if (prendido & (1 << c)) { x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(px + c * W + 2, arriba, W - 4, W - 4); }
  }
  // flechas que suben (las juzgadas se van con un destello)
  x.save(); x.beginPath(); x.rect(px - 6, arriba - 4, ancho + 12, abajo - arriba + 4); x.clip();
  for (const n of carril.notas) {
    const y = arriba + (n.t - tSeg) * vel;
    if (y > abajo + W) break;
    const yf = n.fin !== undefined ? arriba + (n.fin - tSeg) * vel : y;
    if (yf < arriba - W && (!n.hecha || ahora - n.cuando > 300)) continue;
    if (n.fin !== undefined) { x.fillStyle = 'rgba(255,190,60,.45)'; x.fillRect(px + n.col * W + W * 0.3, Math.max(arriba, y) + W / 2, W * 0.4, Math.max(0, yf - Math.max(arriba, y))); }
    if (n.hecha) { const e = (ahora - n.cuando) / 300; if (e < 1) { x.fillStyle = `rgba(255,255,200,${0.7 * (1 - e)})`; x.fillRect(px + n.col * W, arriba - 2, W, W); } continue; }
    flechaCarril(n.col, px + n.col * W + 2, y, W - 4, 1);
  }
  x.restore();
  // el ultimo juicio en el medio del carril, y el puntaje abajo (numeros cromados de GRADE.DAT)
  const edad = (ahora - v.ultimoT) / 1000;
  if (v.ultimo && edad < 0.6) { const [n, c] = JUICIOS[v.ultimo]; x.save(); x.globalAlpha = Math.min(1, (0.6 - edad) / 0.25); texto(x, n, px + ancho / 2, 240, 1.6, c, true); x.restore(); }
  if (j.combo > 3) texto(x, `${j.combo} COMBO`, px + ancho / 2, 268, 1, 'blanco', true);
  const vida = Math.max(0, Math.min(1000, j.vida || 0)) / 1000;
  x.fillStyle = '#222'; x.fillRect(px, 36, ancho, 7); x.fillStyle = vida > 0.3 ? '#7dff7a' : '#ff5a5a'; x.fillRect(px, 36, ancho * vida, 7);
  numerosCromo(String(j.puntaje || 0).padStart(7, '0'), px + ancho, 438, 24);
  if (j.terminado) texto(x, 'TERMINO', px + ancho / 2, 408, 1, 'gris', true);
}
function dibujarVivo(j, v, px, py, doble) {
  const ahora = performance.now();
  v.golpes.length = 0;                          // (solo los usa el carril "como en el juego")
  x.fillStyle = 'rgba(0,0,30,.72)'; x.fillRect(px, py, 208, 124);
  texto(x, j.nick || '?', px + 8, py + 6, 1, 'celeste');
  if (j.terminado) texto(x, 'TERMINO', px + 144, py + 6, 1, 'gris');
  texto(x, String(j.puntaje || 0).padStart(7, '0'), px + 8, py + 22, 2, 'amarillo');
  texto(x, `COMBO ${j.combo || 0}`, px + 8, py + 52, 1, 'blanco');
  const vida = Math.max(0, Math.min(1000, j.vida || 0)) / 1000;
  x.fillStyle = '#222'; x.fillRect(px + 116, py + 52, 84, 8); x.fillStyle = vida > 0.3 ? '#7dff7a' : '#ff5a5a'; x.fillRect(px + 116, py + 52, 84 * vida, 8);
  // los paneles que piso (una cruz; dos en DOUBLE)
  const prendido = ahora < v.padsHasta ? v.pads : 0, POS = [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], COL = ['#ff4040', '#ff4040', '#ffb030', '#40a0ff', '#40a0ff'];
  for (let lado = 0; lado < (doble ? 2 : 1); lado++) POS.forEach(([i, k], b) => {
    const cx = px + 30 + lado * 50 + i * 12, cy = py + 90 + k * 12, on = prendido & (1 << (b + 5 * lado));
    x.fillStyle = on ? COL[b] : 'rgba(255,255,255,.15)'; x.fillRect(cx - 5, cy - 5, 10, 10);
  });
  // el ultimo juicio, que salta y se va apagando
  const edad = (ahora - v.ultimoT) / 1000;
  if (v.ultimo && edad < 0.6) {
    const [n, c] = JUICIOS[v.ultimo], k = 1.6 + 0.5 * Math.max(0, 0.15 - edad) / 0.15;
    x.save(); x.globalAlpha = Math.min(1, (0.6 - edad) / 0.25); texto(x, n, px + (doble ? 156 : 132), py + 80, k, c, true); x.restore();
  }
  const cu = j.cuentas || [0, 0, 0, 0, 0];
  texto(x, `P${cu[0]} G${cu[1]} O${cu[2]} B${cu[3]} M${cu[4]}`.slice(0, 25), px + 8, py + 110, 1, 'gris');
}
// ---------- MIRAR (mejora 17): en el salon, ENTER sobre alguien que esta JUGANDO ----------
const mirar = { id: '', datos: null, fin: 0 };
function empezarMirar(j) { Object.assign(mirar, { id: j.partida, datos: null, fin: 0 }); pantalla = 'mirando'; sondear(); }
function dibujarMirando(t) {
  x.drawImage(R.fondo, 0, 0);
  const p = mirar.datos;
  texto(x, 'EN VIVO', 320, 10, 3, Math.floor(t * 2) % 2 ? 'rojo' : 'amarillo', true);
  if (!p) { texto(x, 'CONECTANDO...', 320, 220, 2, 'blanco', true); return; }
  if (p.terminada) { texto(x, 'LA PARTIDA TERMINO', 320, 220, 2, 'blanco', true); if (!mirar.fin) mirar.fin = performance.now(); if (performance.now() - mirar.fin > 3000) pantalla = 'sala'; return; }
  const portada = portadaDe(p.cancion, p.paquete);
  if (portada) x.drawImage(portada, 236, 52, 168, 126);
  texto(x, `${nombreCon(p)} - ${p.modo}`.slice(0, 50), 320, 186, 1.2, 'blanco', true);
  const ids = Object.keys(p.jugadores);
  ids.slice(0, 2).forEach((id, i) => dibujarVivo(p.jugadores[id], vistaDe(id, p.jugadores[id]), i ? 400 : 32, 214, p.modo === 'DOUBLE'));
  texto(x, 'VS', 320, 260, 3, 'amarillo', true);
  const falta = Math.max(0, (p.inicio * 1000 - ahoraServidor()) / 1000);
  if (falta > 0.5) texto(x, `ARRANCA EN ${Math.ceil(falta)}`, 320, 300, 1.5, 'celeste', true);
  if (p.miran) texto(x, `${p.miran} MIRANDO`, 320, 360, 1, 'gris', true);
  texto(x, esTactil ? 'ATRAS = VOLVER AL SALON' : 'ESC = VOLVER AL SALON', 320, 440, 1, 'gris', true);
}

// modo solo, en la seleccion del juego: los 3 mejores de la cancion del centro en ese modo (abajo a la izquierda,
// debajo de la caratula chica y al lado del reloj)
function dibujarTop3(h) {
  const izq = Math.round((640 - 640 / zoomHud) / 2) + 6;     // borde izquierdo de lo que se ve
  const l = ((((rankingSolo || {}).canciones) || {})[`${ruleta.cancion} ${ruleta.modo}`] || []).slice(0, 3);
  h.fillStyle = 'rgba(0,0,30,.75)'; h.fillRect(izq, 302, 200, 68);
  const xh = x; x = h;
  texto(x, `TOP 3 ${ruleta.modo}`, izq + 8, 306, 1, 'celeste');
  // siempre las 3 filas con nombre y puntaje (Charles, 20/10); las que todavia no tienen a nadie, con rayas
  for (let i = 0; i < 3; i++) {
    const e = l[i];
    texto(x, `${i + 1} ${e ? String(e.nick).slice(0, 12) : '------------'}`, izq + 8, 323 + i * 15, 1, !e ? 'gris' : i === 0 ? 'amarillo' : 'blanco');
    texto(x, e ? String(e.puntaje).padStart(7) : '-------', izq + 136, 323 + i * 15, 1, e ? 'blanco' : 'gris');
  }
  x = xh;
}

// ---------- arranque (lo llama principal.js) ----------
export async function iniciarMenu(juego) {
  J = juego;
  lienzo = document.getElementById('menu'); x = lienzo.getContext('2d');
  hud = document.getElementById('hud');
  entrada = document.getElementById('escribir');
  // El Enter del teclado del celular muchas veces llega sin "code" (solo key 'Enter' o keyCode 13), y el boton
  // "Ir" envia el formulario: se toman las tres cosas (Charles, 19/10: "en el celular puedo poner el nombre pero no
  // puedo dar enter"). Ademas, con los paneles: el centro confirma y ATRAS vuelve (tecla(), mas abajo).
  entrada.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13) { e.preventDefault(); confirmarTexto(); }
    else if (e.key === 'Escape' || e.code === 'Escape') { e.preventDefault(); cancelarTexto(); }
  });
  if (entrada.form) entrada.form.addEventListener('submit', (e) => { e.preventDefault(); confirmarTexto(); });
  // tocar el cuadro del juego vuelve a abrir el teclado del celular si se cerro
  addEventListener('click', (e) => {
    if ((pantalla !== 'nick' && !escribiendo) || document.activeElement === entrada) return;
    const r = lienzo.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) entrada.focus();
  });
  addEventListener('keydown', (e) => { if (tecla(e)) e.stopImmediatePropagation(); }, true);
  addEventListener('beforeunload', () => { if (sala.yo) navigator.sendBeacon(API, JSON.stringify({ accion: 'salir', ...credencial() })); });
  requestAnimationFrame(dibujar); requestAnimationFrame(dibujarHud);
  await cargarOpciones();
  J.paneles(op.panelesDos); J.tactil.tamano(op.tamanoPads); J.tactil.vibrar(op.vibrar); J.mando.fijarMapa(op.usb); J.desfase(op.desfase); J.teclas(op.teclas); J.volumen(op.volumen); J.pantalla(op.pantalla);
  iniciarEditor({ texto, caja, R, CANCIONES, traer, DISCO, API, avisar, lienzo, pantalla: () => pantalla,
    audio: () => (audioCtx = audioCtx || J.audio()), salir: () => { pantalla = 'menu'; cursor = Math.max(0, MENU.indexOf('editor')); }, probar: probarPasos,
    clave: claveDueno, nick: () => op.nick || soloNick, fijarNick: (n) => { op.nick = n; guardarOpciones(); }, pin: () => op.pin });
  const t0 = performance.now();
  try { await cargarRecursos(); } catch (e) { console.error(e); avisar('No pude cargar los graficos: ' + e.message, 10); }
  console.log(`menu: graficos del juego listos en ${Math.round(performance.now() - t0)} ms`);
  pantalla = 'menu'; cursor = 0;
  // para las pruebas: ?nick=Fulano&online entra directo al salon
  const q = new URLSearchParams(location.search);
  if (q.has('online')) entrarSala(q.get('nick') || op.nick || 'PRUEBA' + Math.floor(Math.random() * 100));
}
// la pagina avisa que el juego (modo solo) se cerro: volver al menu
export function juegoCerrado() {
  if (pantalla === 'probando') { practicaActual = null; pantalla = 'editor'; volverDePrueba(); return; }   // Esc en la prueba del editor
  if (pantalla === 'eligiendo') { pantalla = 'sala'; return; }     // Esc en la seleccion del desafio: vuelve al salon
  if (pantalla === 'oculto') { sesionSolo(); pantalla = 'menu'; cursor = 0; ruleta = null; }   // ATRAS: al menu principal
}
export const estadoMenu = () => ({ pantalla, ruleta, sala: { yo: sala.yo && sala.yo.nick, jugadores: sala.jugadores.length, partida: !!sala.partida }, resultado });
