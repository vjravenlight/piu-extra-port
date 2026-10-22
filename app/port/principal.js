// Pagina del port: dibuja lo que manda el hilo del juego (trabajador.js) con la capa OpenGL 1.x sobre WebGL,
// toca la musica que el juego descifro, y pasa el teclado a la cabina simulada por memoria compartida.
import { GL1 } from '../motor/gl1.js';
import * as Menu from './online.js';
import * as T from './tactil.js';
import * as M from './mando.js';

const lienzo = document.getElementById('pantalla');
const estado = document.getElementById('estado');
const cajaLuces = document.getElementById('luces');
const capas = [lienzo, document.getElementById('menu'), document.getElementById('hud')];

// 10 luces de pads (bits 0-9 de 0x2A4) + halogenas/neon (0x2A6): solo para ver que se mueven
for (let i = 0; i < 14; i++) cajaLuces.appendChild(document.createElement('i'));

// ---------- pantalla 4:3 al tamano de la ventana ----------
// PC: centrada y lo mas grande que entre. Celular o tablet (tactil.js): en vertical arriba de todo y los paneles
// abajo; en horizontal en el medio, dejando los costados para los paneles.
// En vertical, mientras se juega, el cuadro se agranda un poco (ZOOM_VERTICAL) y queda CENTRADO, recortando lo mismo
// de cada lado (Charles, 19/10: con 1,3 pegado a la izquierda "no se ve centrado"). 1,1 es lo maximo sin cortar la
// primera columna de flechas del jugador 1, que arranca a 36 px del borde de los 640. En los menus se ve entero.
let gl = null, escala = 1, jugandoEnVertical = false, zoomJuego = 1;
const ZOOM_VERTICAL = 1.1;
// (21/10, "que todo se adapte bien a la resolucion, 4:3, 16:9 o las que fueren") en PC el cuadro se achica tambien por
// debajo de 640 x 480 (antes, en una ventana chica, se cortaba); con PANTALLA: ESTIRAR ocupa toda la ventana. A los
// costados de una pantalla ancha va una copia borrosa del juego (fondoLados), como en el celular.
let modoPantalla = 'original';
const fondoLados = document.createElement('canvas');
fondoLados.width = 160; fondoLados.height = 120;
fondoLados.style.cssText = 'position:fixed;left:-30px;top:-30px;width:calc(100% + 60px);height:calc(100% + 60px);z-index:0;pointer-events:none;filter:blur(18px) brightness(.45) saturate(1.2);display:none;';
document.body.prepend(fondoLados);
function pintarLados(fuente) { try { fondoLados.getContext('2d').drawImage(fuente, 0, 0, 160, 120); } catch (e) { /* sin cuadro */ } }
let ultimoBorroso = 0;
function ajustar() {
  const vw = window.innerWidth, vh = window.innerHeight;
  let w, h, zoom = 1;
  if (!T.esTactil && modoPantalla === 'estirar') { w = vw; h = vh; }
  else if (!T.esTactil) { const k = Math.min(vw / 640, vh / 480); w = 640 * k; h = 480 * k; }
  else if (vh > vw) {
    zoom = jugandoEnVertical ? ZOOM_VERTICAL : 1;
    w = vw * zoom; h = w * 0.75;
    if (h > vh * 0.6) { h = vh * 0.6; w = h * 4 / 3; zoom = Math.max(1, w / vw); }
  }
  else { h = vh; w = h * 4 / 3; const lado = vw * 0.17; if (w > vw - 2 * lado) { w = vw - 2 * lado; h = w * 0.75; } }
  zoomJuego = zoom; Menu.fijarZoom(zoom);
  const r = { x: Math.round((vw - w) / 2), y: T.esTactil && vh > vw ? 0 : Math.round((vh - h) / 2), w: Math.round(w), h: Math.round(h) };
  escala = Math.max(1, Math.floor(r.w / 640 * (window.devicePixelRatio || 1) * 100) / 100);
  for (const c of capas) Object.assign(c.style, { inset: 'auto', margin: '0', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  fondoLados.style.display = !T.esTactil && (r.w < vw - 8 || r.h < vh - 8) ? '' : 'none';
  T.ubicar(r, vw, vh);
}
ajustar();
addEventListener('resize', ajustar);

// ---------- memoria compartida ----------
if (!crossOriginIsolated) { estado.textContent = 'Falta el aislamiento (COOP/COEP): abrilo con JUGAR.cmd'; throw new Error('sin crossOriginIsolated'); }
const sabI = new SharedArrayBuffer(64 * 4), sabD = new SharedArrayBuffer(8 * 8);
const I = new Int32Array(sabI), D = new Float64Array(sabD);
D[0] = -1;

// ---------- teclado -> cabina (bits de la placa, como app\port\cabina.js) ----------
// orden de la placa: bit 0 arriba-izq, 1 arriba-der, 2 centro, 3 abajo-izq, 4 abajo-der.
// Grupo 0 = pads P1 (puerto 0x2A8), 1 = pads P2 (0x2AA), 2 = botones (0x2A8, bits 9-15).
// Cada apretar/soltar va con su hora a una cola (Q, 256 lugares; I[10] = cuantos se escribieron): el hilo del juego
// lo aplica en el tic de 240 Hz que le toca, asi no se pierden toques cortos ni los que caen durante una carga.
let TECLAS = { KeyZ: [0, 0x08], KeyQ: [0, 0x01], KeyS: [0, 0x04], KeyE: [0, 0x02], KeyC: [0, 0x10],
  Numpad1: [1, 0x08], Numpad7: [1, 0x01], Numpad5: [1, 0x04], Numpad9: [1, 0x02], Numpad3: [1, 0x10],
  F1: [2, 1 << 9], F4: [2, 1 << 10], F2: [2, 1 << 14], F3: [2, 1 << 15] };
// En el online cada uno juega como jugador 1 en su PC, con la parte del teclado que eligio en CONTROLES
// (izquierda, derecha con letras para las notebooks sin numerico, el numerico o todos); los botones de la cabina no
// van (nada de monedas ni menu de servicio). La derecha es la izquierda en espejo: U O arriba, K centro, M . abajo.
let P1 = { KeyZ: 0x08, KeyQ: 0x01, KeyS: 0x04, KeyE: 0x02, KeyC: 0x10 }, NUM = { Numpad1: 0x08, Numpad7: 0x01, Numpad5: 0x04, Numpad9: 0x02, Numpad3: 0x10 };
// (21/10) TECLAS propias (OPCIONES > TECLAS): { p1: { ui: 'KeyQ', ... }, p2: { ... } } reemplazan a las de fabrica
const BIT_PANEL = { ui: 0x01, ud: 0x02, c: 0x04, di: 0x08, dd: 0x10 };
const P1_FABRICA = { ...P1 }, NUM_FABRICA = { ...NUM };
function fijarTeclas(t) {
  const deMapa = (m, fab) => { if (!m) return { ...fab }; const o = {}; for (const [p, k] of Object.entries(m)) if (BIT_PANEL[p] && k) o[k] = BIT_PANEL[p]; return Object.keys(o).length === 5 ? o : { ...fab }; };
  P1 = deMapa(t && t.p1, P1_FABRICA); NUM = deMapa(t && t.p2, NUM_FABRICA);
  const botones = { F1: [2, 1 << 9], F4: [2, 1 << 10], F2: [2, 1 << 14], F3: [2, 1 << 15] };
  TECLAS = { ...botones };
  for (const [k, b] of Object.entries(P1)) TECLAS[k] = [0, b];
  for (const [k, b] of Object.entries(NUM)) TECLAS[k] = [1, b];
  if (!trabajador) mapa = TECLAS;
}
const DER = { KeyM: 0x08, KeyU: 0x01, KeyK: 0x04, KeyO: 0x02, Period: 0x10 };
// por si algun teclado o navegador manda el numerico con Bloq Num apagado como Inicio/RePag/Fin/AvPag (el 5 es Clear)
const NUM_SIN_BLOQ = { End: 0x08, Home: 0x01, Clear: 0x04, PageUp: 0x02, PageDown: 0x10 };
function teclasOnline(controles) {
  const m = {}, juegos = { izquierda: [P1], derecha: [DER], numerico: [NUM, NUM_SIN_BLOQ], ambos: [P1, DER, NUM, NUM_SIN_BLOQ] }[controles] || [P1];
  for (const j of juegos) for (const [k, b] of Object.entries(j)) m[k] = [0, b];
  return m;
}
let mapa = TECLAS;
const sabQ = new SharedArrayBuffer(512 * 8), Q = new Float64Array(sabQ);
const apretadas = new Set();
function anotar(grupo, bit, abajo) {
  const w = Atomics.load(I, 10), j = (w & 255) * 2;
  Q[j] = performance.timeOrigin + performance.now(); Q[j + 1] = grupo * 0x20000 + bit * 2 + (abajo ? 1 : 0);
  Atomics.store(I, 10, w + 1);
}
// cuenta de teclas de cada partida online (va en un reporte al terminar): cuantas veces llego cada una, cuantas
// juntas como maximo y las que llegaron sin ser del juego (p. ej. el numerico con Bloq Num apagado)
let teclasPartida = { veces: {}, otras: {}, juntas: 0 };
function tecla(e, abajo) {
  if (!trabajador) return;                         // en el menu las teclas son del menu
  const t = mapa[e.code];
  if (!t) { if (abajo && enOnline && !e.repeat) teclasPartida.otras[e.code || e.key] = (teclasPartida.otras[e.code || e.key] || 0) + 1; return; }
  e.preventDefault();
  if (abajo === apretadas.has(e.code)) return;   // repeticion automatica del teclado
  if (abajo) apretadas.add(e.code); else apretadas.delete(e.code);
  if (abajo) { teclasPartida.veces[e.code] = (teclasPartida.veces[e.code] || 0) + 1; teclasPartida.juntas = Math.max(teclasPartida.juntas, apretadas.size); }
  anotar(t[0], t[1], abajo);
}
addEventListener('keydown', (e) => tecla(e, true));
addEventListener('keyup', (e) => tecla(e, false));
// si la ventana pierde el foco con teclas apretadas, soltarlas (si no quedan pisadas para siempre)
addEventListener('blur', () => { for (const c of apretadas) if (mapa[c]) anotar(mapa[c][0], mapa[c][1], false); apretadas.clear(); });

// ---------- musica ----------
let actx = null, fuente = null, inicioAudio = 0, latencia = 0, volumen = 1, ganancia = null;   // (21/10) VOLUMEN de OPCIONES
// precargas: el hilo del juego manda cada .AUD apenas lo abre (trabajador.js precargarMusica) y aca se va decodificando;
// al arrancar se busca por su huella (largo + primeros 16 KB). Asi en un equipo lento los pasos no esperan al MP3.
const precargas = new Map();
function huellaAudio(b) { let h = 2166136261; const n = Math.min(b.length, 16384); for (let i = 0; i < n; i++) h = Math.imul(h ^ b[i], 16777619); return b.length + ':' + (h >>> 0); }
function precargarAudio(bytes) {
  const k = huellaAudio(bytes);
  if (precargas.has(k)) return;
  while (precargas.size >= 3) precargas.delete(precargas.keys().next().value);
  precargas.set(k, audio().decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).catch(() => null));
}
async function tocarMusica(bytes) {
  pararMusica();
  try {
    const pre = precargas.get(huellaAudio(bytes));
    const audio = (pre && await pre) || await actx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    if (!ganancia) { ganancia = actx.createGain(); ganancia.connect(actx.destination); }
    ganancia.gain.value = volumen;
    fuente = actx.createBufferSource(); fuente.buffer = audio; fuente.connect(ganancia);
    const f = fuente;
    fuente.onended = () => { if (fuente === f) D[2] = 1; };
    inicioAudio = actx.currentTime + 0.03;
    // modo practica (mejora 13, editor.js practicar): desde un punto de la cancion y mas lenta; el reloj del juego la sigue (bucle)
    const pr = cfgActual.practica;
    if (pr) { fuente.playbackRate.value = pr.velocidad; fuente.start(inicioAudio, Math.max(0, pr.desde)); } else fuente.start(inicioAudio);
  } catch (e) { registrar('no se pudo decodificar la musica: ' + e.message); }
}
function pararMusica() { if (fuente) { try { fuente.stop(); } catch (e) { /* ya parada */ } fuente = null; } D[0] = -1; }
function relojAudible() {
  let t = actx.currentTime;
  if (actx.getOutputTimestamp) { const ts = actx.getOutputTimestamp(); if (ts.contextTime > 0) t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000; }
  return t;
}

// ---------- FONDO SIN VIDEO (OPCIONES > FONDO: trabajador.js instalarFondoBga) ----------
// En vez del video, la caratula de la cancion (TITLE\tNN.pnz), de pantalla entera. El juego manda "fondoCancion" en
// cada cuadro; la primera vez se pide la imagen al menu (online.js portadaFondo) y queda en una textura propia
// (900000 + numero: el juego nunca usa numeros asi). Mientras carga, el fondo queda negro.
const portadasFondo = new Map();
function fondoCancion(n) {
  const e = portadasFondo.get(n);
  if (!e) {
    portadasFondo.set(n, { lista: false });
    Menu.portadaFondo(n).then((img) => {
      if (!img) return;
      const c = new OffscreenCanvas(1024, 512), x = c.getContext('2d'); x.drawImage(img, 0, 0, 640, 480);
      portadasFondo.set(n, { lista: false, rgba: new Uint8Array(x.getImageData(0, 0, 1024, 512).data.buffer) });
    }).catch(() => {});
    return;
  }
  if (!e.rgba && !e.lista) return;
  const previa = this.texActual, id = 900000 + n;
  this.glBindTexture(0x0DE1, id);
  if (e.rgba) {
    this.glTexParameteri(0x0DE1, 0x2801, 0x2601); this.glTexParameteri(0x0DE1, 0x2800, 0x2601);
    this.glTexImage2D(0x0DE1, 0, 0x1908, 1024, 512, 0, 0x1908, 0x1401, e.rgba);
    e.rgba = null; e.lista = true;
  }
  this.glColor4f(1, 1, 1, 1);
  this.glBegin(7);
  this.glTexCoord2f(0, 480 / 512); this.glVertex2i(0, 0); this.glTexCoord2f(640 / 1024, 480 / 512); this.glVertex2i(640, 0);
  this.glTexCoord2f(640 / 1024, 0); this.glVertex2i(640, 480); this.glTexCoord2f(0, 0); this.glVertex2i(0, 480);
  this.glEnd();
  this.glBindTexture(0x0DE1, previa);
}

// ---------- registro y estado ----------
const ultimos = [], todo = [];
function registrar(s) {
  ultimos.push(s); if (ultimos.length > 6) ultimos.shift();
  todo.push(Math.round(performance.now() / 100) / 10 + ' s  ' + s); if (todo.length > 3000) todo.shift();
}
let cuadrosRecibidos = 0, cuadrosDesdeArranque = 0, cuadrosSeg = 0, ultimoSeg = performance.now(), fin = '';

// ---------- el hilo del juego ----------
let pendientes = [], trabajador = null, enOnline = false;
// ---------- pantalla completa, Esc y datos de prueba ----------
// Arranca en pantalla completa (el clic o la tecla de inicio lo permiten). Doble clic la prende o la apaga.
// Esc: el navegador sale solo de la pantalla completa; en la build (Electron) cierra el juego.
// F9 muestra u oculta los datos de prueba (cuadros por segundo y registro); ?depurar los deja a la vista.
function pantallaCompleta(prender) {
  if (window.piuBuild) return window.piuBuild.pantallaCompleta(prender);   // la build maneja su ventana
  try {
    if (prender && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else if (!prender && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch (e) { /* sin pantalla completa */ }
}
const enPantallaCompleta = () => (window.piuBuild ? window.piuBuild.estaCompleta() : !!document.fullscreenElement);
// En el celular no: dos toques rapidos en los paneles cuentan como doble clic y la apagaban en medio de la cancion
// (Charles, 19/10: "si uno aprieta varios botones se sale de la pantalla completa"). Ahi va al reves: si se perdio
// (el gesto de atras del sistema, una notificacion), el proximo toque la vuelve a poner. El toque largo no abre menu.
addEventListener('dblclick', () => { if (!T.esTactil) pantallaCompleta(!enPantallaCompleta()); });
if (T.esTactil && !new URLSearchParams(location.search).has('sinpantallacompleta')) {
  addEventListener('pointerup', () => { if (!enPantallaCompleta()) pantallaCompleta(true); });
  addEventListener('contextmenu', (e) => e.preventDefault());
}
addEventListener('keydown', (e) => {
  if (e.code === 'F9') { e.preventDefault(); document.body.classList.toggle('depurar'); }
  else if (e.code === 'F11' && window.piuBuild) { e.preventDefault(); pantallaCompleta(!enPantallaCompleta()); }
  else if (e.code === 'Escape') {
    // con el juego andando, Esc vuelve al menu (en el online, abandona la partida); en el menu, sale
    if (trabajador && !modoFondo) { e.preventDefault(); if (!(enOnline && Menu.abandonar())) { terminar(); Menu.juegoCerrado(); } }
    else if (window.piuBuild) window.piuBuild.salir();
  }
});
if (new URLSearchParams(location.search).has('depurar')) document.body.classList.add('depurar');

// ---------- opciones del port (no son de la cabina): se guardan en guardado\opciones.json ----------
// F7 = lista con todo: suma los pasos que el disco trae y el juego nunca ofrecia (vale desde el proximo credito,
// que es cuando el juego lee game.cfg). I[11] le avisa al hilo del juego.
const opciones = { listaConTodo: false };
const cajaAviso = document.getElementById('aviso');
let tapaAviso = 0;
function avisar(texto) {
  if (!cajaAviso) return;
  cajaAviso.textContent = texto; cajaAviso.classList.add('ver');
  clearTimeout(tapaAviso); tapaAviso = setTimeout(() => cajaAviso.classList.remove('ver'), 3500);
}
// En la PC las guarda el servidor (guardado\); en el hosting no hay donde, asi que van al navegador (localStorage)
const GUARDADO = new URL('../guardado/opciones.json', location.href).href;
const leerLocal = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const grabarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
const opcionesListas = fetch(GUARDADO).then(r => (r.ok ? r.json() : null)).catch(() => null).then(o => {
  if (!o) { try { o = JSON.parse(leerLocal('piu_opciones') || 'null'); } catch (e) { o = null; } }
  if (o && typeof o === 'object') Object.assign(opciones, o);
  Atomics.store(I, 11, opciones.listaConTodo ? 1 : 0);
  return opciones;
});
function guardarOpciones(parcial) {
  Object.assign(opciones, parcial);
  grabarLocal('piu_opciones', JSON.stringify(opciones));
  fetch(GUARDADO, { method: 'PUT', body: JSON.stringify(opciones) }).catch(() => {});
}
// la EEPROM de la cabina en el navegador (cuando no la guarda un servidor)
// (piu_eeprom2: las guardadas antes del 19/10 tenian las de fabrica, 5 monedas y sin ayuda; con la clave nueva se
// toman las opciones por defecto de ahora, FREE y HOW TO PLAY, trabajador.js eepromPorDefecto)
const EEPROM_LOCAL = 'piu_eeprom2';
const eepromLocal = () => { const s = leerLocal(EEPROM_LOCAL); if (!s) return null; try { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); } catch (e) { return null; } };
// port\config.json solo existe en la demo subida al hosting: { demo: true, canciones: [...], atrae: [...] }
const configListo = fetch('config.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
addEventListener('keydown', (e) => {
  if (e.code !== 'F7' || e.repeat) return;
  e.preventDefault();
  opciones.listaConTodo = !opciones.listaConTodo;
  Atomics.store(I, 11, opciones.listaConTodo ? 1 : 0);
  guardarOpciones({});
  avisar(opciones.listaConTodo ? 'LISTA CON TODO: SÍ — 26 pasos más, desde el próximo crédito' : 'LISTA CON TODO: NO — la lista original de la cabina, desde el próximo crédito');
});
// 1 a 9 (los de arriba de las letras, no los del numerico, que son del jugador 2) = velocidad de las flechas x1 a x9
// para los dos jugadores, al instante y aunque se este jugando; 0 = la del juego (sus trucos de velocidad).
// Solo en la PC: en el celular no hay teclado. I[12] le avisa al hilo del juego (trabajador.js, 0x24DB0).
opcionesListas.then(() => Atomics.store(I, 12, opciones.velocidad | 0));
addEventListener('keydown', (e) => {
  const n = /^Digit([0-9])$/.exec(e.code);
  if (!n || T.esTactil || e.repeat || /^(INPUT|TEXTAREA)$/.test(e.target.tagName || '')) return;
  e.preventDefault();
  const v = +n[1];
  Atomics.store(I, 12, v);
  guardarOpciones({ velocidad: v });
  avisar(v ? `VELOCIDAD x${v}` : 'VELOCIDAD: LA DEL JUEGO (sus trucos)');
});

// el audio se habilita con el primer clic o tecla (el navegador no deja antes); en la build ya viene permitido
function audio() { if (!actx) actx = new AudioContext(); if (actx.state === 'suspended') actx.resume().catch(() => {}); return actx; }
addEventListener('keydown', audio, { once: true });
addEventListener('pointerdown', audio, { once: true });

// cfg.online = { cancion, modo, inicioMs, controles }: partida online (la cancion arranca sola a esa hora)
// cfg.fondo = true: la pantalla de titulo de verdad detras del menu (sin teclado ni sonido propio; trabajador.js)
let modoFondo = false, ultimoCuadroFondo = 0, juegoLibre = true;
function arrancar(cfg = {}) {
  if (trabajador) terminar();
  modoFondo = !!cfg.fondo;
  registrar(cfg.online ? `pagina: arranca el juego online (${cfg.online.cancion} ${cfg.online.modo}, controles ${cfg.online.controles})` : modoFondo ? 'pagina: arranca el fondo del menu' : cfg.eleccion ? 'pagina: arranca la seleccion del desafio' : 'pagina: arranca el juego solo');
  if (!modoFondo) {
    document.body.classList.add('jugando');
    if (!window.piuBuild && !new URLSearchParams(location.search).has('sinpantallacompleta')) pantallaCompleta(true);
    audio();
  }
  if (!gl) {
    // resolucion de dibujo: la de la pantalla entera (va a pantalla completa), no la de la ventana de antes
    const dpr = window.devicePixelRatio || 1;
    escala = Math.max(escala, Math.floor(Math.min(screen.width / 640, screen.height / 480) * dpr * 100) / 100);
    lienzo.width = Math.round(640 * escala); lienzo.height = Math.round(480 * escala);
    gl = new GL1(lienzo, { escala, profundidad: false });
    gl.fondoCancion = fondoCancion;
    requestAnimationFrame(bucle);
  }
  enOnline = !!cfg.online;
  teclasPartida = { veces: {}, otras: {}, juntas: 0 };
  mapa = modoFondo ? {} : enOnline ? teclasOnline(cfg.online.controles) : cfg.eleccion ? teclasOnline(cfg.eleccion.controles) : TECLAS;
  // DOUBLE en el online: son 10 columnas, las 5 de la derecha son las del jugador 2 (grupo 1). Izquierda = letras de
  // la izquierda; derecha = U O K M . y el numerico
  if (enOnline && cfg.online.dos) mapa = TECLAS;     // prueba VERSUS del editor: jugador 1 letras, jugador 2 numerico
  else if (enOnline && (cfg.online.modo === 'DOUBLE' || (cfg.online.banderas & 0x80))) {
    mapa = {};
    for (const [k, b] of Object.entries(P1)) mapa[k] = [0, b];
    for (const t of [DER, NUM]) for (const [k, b] of Object.entries(t)) mapa[k] = [1, b];
  }
  fin = ''; D[0] = -1; D[2] = 0; D[3] = 0; cuadrosDesdeArranque = 0; Atomics.store(I, 0, 0);
  if (!hilo) hilo = crearHilo();
  trabajador = hilo; corriendo = true; cfgActual = cfg;
  ultimoCuadroVisto = performance.now();
  // ?entradas=1 en la direccion: anotar cada toque que recibe el juego (para depurar)
  const mia = ++corrida;
  configListo.then((conf) => {
    if (mia !== corrida) return;
    aIniciar = { tipo: 'iniciar', I: sabI, D: sabD, Q: sabQ, leidos: Atomics.load(I, 10), online: cfg.online || null, fondo: modoFondo, solo: !!cfg.solo, atraccion: cfg.atraccion || null, eleccion: !!cfg.eleccion, desbloqueado: !!cfg.desbloqueado, sinCorte: !!cfg.sinCorte, pasos: cfg.pasos || null, paquete: cfg.paquete || null, practica: !!cfg.practica,
      // OPCIONES del menu (online.js op): el fondo de la cancion atenuado o SIN VIDEO
      fondoBga: (opciones.online || {}).fondo || 0, modsSolo: cfg.modsSolo || null, carrilCentro: (opciones.online || {}).carril === 'centro' && !(cfg.online && !cfg.pasos),   // (en el online, a la derecha va el rival)
      demo: conf.demo ? conf : null, eeprom: eepromLocal(), anotarEntradas: new URLSearchParams(location.search).has('entradas') };
    mandarPendiente();
  });
}
// ---------- el hilo del juego: uno solo, que se reusa (trabajador.js, "reinicio") ----------
// Para cortar un juego se levanta I[13]; el hilo avisa "reiniciado" y recien ahi recibe el proximo "iniciar". Si en
// 3 s no contesta (trabado en una carga), se cierra y se abre otro, como antes.
let hilo = null, hiloLibre = false, aIniciar = null, cortarDesde = 0, corriendo = false, cfgActual = {}, corrida = 0, esperandoCorte = false;
function mandarPendiente() {
  if (!aIniciar || !hiloLibre || !hilo) return;
  const m = aIniciar; aIniciar = null; hiloLibre = false;
  hilo.postMessage(m);
}
function crearHilo() {
  const h = new Worker('./trabajador.js', { type: 'module' });
  hiloLibre = true;
  h.onmessage = (e) => {
    if (h !== hilo) return;
    const m = e.data, cfg = cfgActual;
    if (m.tipo === 'reiniciado') { hiloLibre = true; esperandoCorte = false; mandarPendiente(); return; }
    if (m.tipo === 'fin') {
      hiloLibre = true;
      // se cayo justo mientras se lo cortaba: ya esta libre, y la bandera no tiene que quedar para el proximo
      if (esperandoCorte) { esperandoCorte = false; Atomics.store(I, 13, 0); mandarPendiente(); return; }
    }
    if (!corriendo || esperandoCorte) { mandarPendiente(); return; }   // restos del juego que se acaba de cortar
    if (m.tipo === 'cuadro') { pendientes.push(m); cuadrosRecibidos++; cuadrosDesdeArranque++; ultimoCuadroVisto = performance.now(); if (modoFondo) ultimoCuadroFondo = ultimoCuadroVisto; }
    else if (m.tipo === 'musica') tocarMusica(m.bytes);
    else if (m.tipo === 'precarga') precargarAudio(m.bytes);
    else if (m.tipo === 'parar') { pararMusica(); registrar('musica: el juego la corta'); }
    else if (m.tipo === 'registro') registrar(m.s);
    else if (m.tipo === 'efecto') registrar(`efecto #${m.efecto} (sin muestras todavia)`);
    else if (m.tipo === 'marcador') {
      Menu.marcador(m);
      if (m.terminado && !cfg.pasos) {
        const tp = teclasPartida, lista = (o) => Object.entries(o).map(([k, n]) => `${k} ${n}`).join(', ') || 'ninguna';
        reportar(`info: partida online terminada (${cfg.online.cancion} ${cfg.online.modo}, controles ${cfg.online.controles}, ${m.puntaje} puntos, nota ${m.nota}, MISS ${m.miss}) · teclas: ${lista(tp.veces)} · juntas como maximo ${tp.juntas} · otras: ${lista(tp.otras)}`, true);
      }
    }
    else if (m.tipo === 'ruleta') Menu.ruletaSolo(m);          // modo solo: la cancion del centro de la seleccion
    else if (m.tipo === 'libre') juegoLibre = m.libre;          // FREE PLAY: sin boton MONEDA en el celular
    else if (m.tipo === 'eleccion') Menu.eleccionHecha(m);     // desafio: la cancion elegida en la seleccion de verdad
    else if (m.tipo === 'listoOnline') Menu.onlineListo();       // el juego del online cargo: se avisa al salon
    else if (m.tipo === 'eleccionLista') Menu.eleccionLista();   // desafio: la seleccion ya se ve
    else if (m.tipo === 'etapa') { registrar(`etapa: J${m.jugador} cancion ${m.cancion} ${m.modo} ${m.puntaje} puntos, nota ${m.nota}`); Menu.etapaSolo(m); }
    else if (m.tipo === 'sesion') { registrar(`sesion terminada: ${m.etapas.length} etapa(s)`); Menu.sesionSolo(m); }
    else if (m.tipo === 'eeprom') grabarLocal(EEPROM_LOCAL, btoa(String.fromCharCode(...m.datos)));
    else if (m.tipo === 'fin') { fin = 'FIN: ' + m.motivo + (m.pila ? '\n' + m.pila : ''); console.log(fin); document.body.classList.add('depurar'); reportar(fin); }
  };
  h.onerror = (e) => {
    if (h !== hilo) return;
    fin = 'ERROR en el hilo del juego: ' + e.message; reportar(fin);
    h.terminate(); hilo = null; if (trabajador) trabajador = null;   // el proximo juego abre uno nuevo
  };
  return h;
}
// el hilo no contesto al pedido de cortar: se cierra y se abre otro (como antes de reusarlo)
setInterval(() => {
  if (!hilo || hiloLibre || Atomics.load(I, 13) !== 1 || performance.now() - cortarDesde < 3000) return;
  registrar('pagina: el hilo del juego no contesto en 3 s; se abre otro');
  hilo.terminate(); Atomics.store(I, 13, 0); esperandoCorte = false;
  hilo = crearHilo(); if (trabajador) trabajador = hilo;
  mandarPendiente();
}, 500);
// cierra el juego (vuelve el menu): corta el juego en el hilo, para la musica y borra la pantalla
function terminar() {
  if (trabajador) {
    trabajador = null; corriendo = false; aIniciar = null; corrida++;
    if (!hiloLibre) { Atomics.store(I, 13, 1); esperandoCorte = true; cortarDesde = performance.now(); }
    registrar('pagina: juego cerrado');
  }
  pararMusica(); pendientes = [];
  for (const c of apretadas) if (mapa[c]) anotar(mapa[c][0], mapa[c][1], false);
  apretadas.clear(); enOnline = false; mapa = TECLAS; modoFondo = false; ultimoCuadroFondo = 0;
  document.body.classList.remove('jugando');
  if (gl) { gl.glClearColor(0, 0, 0, 1); gl.glClear(0x4000); gl.glFlush(); }
}

Menu.iniciarMenu({ arrancar, terminar, audio, opciones: () => opcionesListas, guardarOpciones, avisar, paneles: (dos) => T.fijarDos(dos),
  tactil: { tamano: T.fijarTamano, vibrar: T.fijarVibrar }, mando: { fijarMapa: M.fijarMapa, aprender: M.aprender, hay: M.hayMando },
  desfase: (ms) => { latencia = Math.max(-0.3, Math.min(0.3, (+ms || 0) / 1000)); }, relojAudio: () => (actx ? relojAudible() : 0),
  // la hora de arranque del online, cuando los dos estan listos (trabajador.js la mira en D[3]); 0 = la de respaldo
  fijarInicio: (ms) => { D[3] = ms > 0 ? ms : 0; },
  pantalla: (m) => { modoPantalla = m === 'estirar' ? 'estirar' : 'original'; ajustar(); },
  teclas: fijarTeclas, volumen: (v) => { volumen = Math.max(0, Math.min(1, +v)); if (ganancia) ganancia.gain.value = volumen; },
  hayCuadros: () => !!trabajador && !modoFondo && performance.now() - ultimoCuadroVisto < 1500 && cuadrosDesdeArranque > 0,
  hayFondo: () => modoFondo && performance.now() - ultimoCuadroFondo < 1000 });
// detras de los menus corre la pantalla de titulo de verdad; cuando no hay juego andando y se esta en un menu, se prende
// ('cargando' tambien: el juego tarda unos segundos en llegar a su titulo, mejor que empiece a la par del menu)
const MENUS = ['cargando', 'menu', 'controles', 'opciones', 'usb', 'teclas', 'avatar', 'mods', 'editor', 'nick', 'sala', 'esperando', 'elegir', 'ranking', 'resultado'];
setInterval(() => { if (!trabajador && MENUS.includes(Menu.estadoMenu().pantalla) && !new URLSearchParams(location.search).has('sinfondo')) arrancar({ fondo: true }); }, 500);

// ---------- telemetria: si el juego se cae o se traba, un reporte corto al servidor del salon ----------
// (app\online\api.php, accion "reporte" -> online\datos\reportes.jsonl). Lleva las ultimas lineas del registro del
// juego, la pantalla, el aparato y el tamano de la ventana. Como mucho uno cada 30 s.
let ultimoReporte = 0, ultimoCuadroVisto = 0;
function reportar(motivo, siempre = false) {   // siempre: los informes (no los errores) no esperan los 30 s
  const ahora = performance.now();
  if (!siempre && ahora - ultimoReporte < 30000) return;
  if (!siempre) ultimoReporte = ahora;
  const cuerpo = { accion: 'reporte', motivo: String(motivo).slice(0, 300), pantalla: Menu.estadoMenu().pantalla, nick: (opciones.online || {}).nick || '',
    agente: navigator.userAgent, tam: `${innerWidth}x${innerHeight} x${devicePixelRatio}${T.esTactil ? ' tactil' : ''}`, registro: todo.slice(-60) };
  try { fetch(Menu.API, { method: 'POST', body: JSON.stringify(cuerpo), keepalive: true }).catch(() => {}); } catch (e) { /* sin red */ }
}
addEventListener('error', (e) => reportar('error en la pagina: ' + (e.message || e.type) + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')));
addEventListener('unhandledrejection', (e) => reportar('promesa sin atender: ' + (e.reason && e.reason.message || e.reason)));
// trabado: el juego andando pero sin cuadros nuevos por mas de 15 s (las cargas largas en un celular pueden tardar)
setInterval(() => {
  if (!trabajador || fin || modoFondo) return;     // el fondo del menu no cuenta (al arrancar no dibuja mientras carga)
  if (performance.now() - ultimoCuadroVisto > 15000) { reportar('trabado: 15 s sin cuadros'); ultimoCuadroVisto = performance.now(); }
}, 3000);

// ---------- celulares y tablets: los paneles en pantalla (tactil.js) ----------
// Con el juego andando, un panel es el pad del jugador 1 (lo mismo que su tecla). En los menus hace de tecla.
const teclaFalsa = (code, abajo) => dispatchEvent(new KeyboardEvent(abajo ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
// ---------- alfombras, joysticks y gamepads USB (mando.js): en el juego, pads de la placa; en los menus, flechas ----------
const TECLA_MENU = [{ 1: 'KeyQ', 2: 'KeyE', 4: 'KeyS', 8: 'KeyZ', 16: 'KeyC' }, { 1: 'Numpad7', 2: 'Numpad9', 4: 'Numpad5', 8: 'Numpad1', 16: 'Numpad3' }];
M.iniciarMandos({
  avisar,
  // (en el online cada uno es el jugador 1 en su PC: el 2.o mando solo cuenta en DOUBLE, que usa los dos pads, o en VERSUS del editor)
  alPad: (jugador, bit, on) => { audio(); if (trabajador && !modoFondo) anotar(enOnline && !(cfgActual.online.dos || cfgActual.online.modo === 'DOUBLE') ? 0 : jugador, bit, on); else if (on) { const k = TECLA_MENU[jugador][bit]; teclaFalsa(k, true); setTimeout(() => teclaFalsa(k, false), 80); } },
  alBoton: (code) => { audio(); teclaFalsa(code, true); setTimeout(() => teclaFalsa(code, false), 80); },
});
T.iniciarTactil({
  alPad: (p, on) => { audio(); if (trabajador && !modoFondo) anotar(p.jugador || 0, p.bit, on); else if (on) teclaFalsa(p.tecla, true); },
  alTecla: (code) => { audio(); teclaFalsa(code, true); setTimeout(() => teclaFalsa(code, false), 120); },
}).then((si) => {
  if (!si) return;
  ajustar();
  // el video de fondo de los paneles: con el juego lo copia bucle(); en los menus, el menu
  const menu = document.getElementById('menu');
  (function fondoMenu() {
    const p = Menu.estadoMenu().pantalla;
    if (!trabajador) T.pintarFondo(menu);
    T.mostrarBotones({ chat: p === 'sala', moneda: !!trabajador && !enOnline && !modoFondo && !juegoLibre });
    // al empezar o terminar de jugar, la vertical cambia de tamano (ZOOM_VERTICAL)
    const jugando = !!trabajador && (p === 'oculto' || p === 'jugando');
    if (jugando !== jugandoEnVertical) { jugandoEnVertical = jugando; ajustar(); }
    setTimeout(fondoMenu, 100);
  })();
});

let desconocidas = new Set();
function bucle() {
  // reloj de la musica para el juego
  // (mejora 9: menos el desfase calibrado de este aparato, OPCIONES > CALIBRAR; positivo = el sonido o el toque llegan tarde)
  if (fuente && actx) { const pos = (relojAudible() - inicioAudio) * ((cfgActual.practica && cfgActual.practica.velocidad) || 1) - latencia; D[1] = performance.timeOrigin + performance.now(); D[0] = pos >= 0 ? pos : -1; }
  // dibujar lo que llego y liberar al juego para el cuadro siguiente
  if (pendientes.length) {
    for (const m of pendientes) {
      // (21/10) sin copiar cada comando (c.slice): menos basura en el celular; ninguna funcion de gl1 cuenta sus argumentos
      for (const c of m.cmds) {
        const f = gl[c[0]];
        if (f) f.call(gl, c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10]);
        else if (!desconocidas.has(c[0])) { desconocidas.add(c[0]); registrar('sin implementar: ' + c[0]); }
      }
      const l = m.luces; [...cajaLuces.children].forEach((el, i) => el.classList.toggle('on', i < 10 ? !!(l[0] & (1 << i)) : !!(l[1] & (1 << (i - 10)))));
    }
    pendientes = [];
    Atomics.store(I, 0, 1); Atomics.notify(I, 0);
    // recien dibujado: se puede copiar (cada 100 ms: el desenfoque cuesta en el celular y a la vista no cambia; 21/10)
    const tb = performance.now();
    if (tb - ultimoBorroso >= 100) {
      ultimoBorroso = tb;
      if (T.esTactil) T.pintarFondo(lienzo);
      else if (fondoLados.style.display !== 'none') pintarLados(lienzo);
    }
  }
  const ahora = performance.now();
  if (ahora - ultimoSeg >= 1000) { cuadrosSeg = cuadrosRecibidos; cuadrosRecibidos = 0; ultimoSeg = ahora; }
  estado.textContent = `${cuadrosSeg} cuadros/s` + (fin ? '\n' + fin : '') + (ultimos.length ? '\n' + ultimos.join('\n') : '');
  window.__port = { cuadrosSeg, fin, ultimos, todo, menu: Menu.estadoMenu, arrancar };   // menu: para las pruebas (en que pantalla esta)
  requestAnimationFrame(bucle);
}
