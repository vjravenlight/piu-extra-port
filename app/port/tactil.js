// Celulares y tablets: los 5 paneles de la cabina en la pantalla, con las flechas del propio juego (00.dat:
// ARROW01 = flechas rojas y azules, ARROW03 = el centro con las huellas) y, detras, el video del juego borroso.
// - Vertical: el juego arriba y los paneles abajo, en cruz como en la cabina (↖ ↗ / ● / ↙ ↘).
// - Horizontal: el juego en el medio y los paneles repartidos a los costados (↖ ↙ a la izquierda, ↗ ↘ a la derecha,
//   el centro de los dos lados).
// Los paneles le mandan al juego lo mismo que el teclado (P1) y, en los menus, hacen de flechas (↖ ↗ suben, ↙ ↘ bajan,
// ● elige). Hay ademas ATRAS (Esc) y CHAT (T). En PC no aparece nada de esto: ?tactil lo fuerza para probar.
import { abrirPaquete } from '../motor/cifrados.js';

export const esTactil = new URLSearchParams(location.search).has('tactil') ||
  (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);

const PADS = [   // bit de la placa, tecla equivalente (P1) y como se dibuja la flecha
  { id: 'ui', bit: 0x01, tecla: 'KeyQ', espejoX: false, espejoY: false, color: 'rojo' },
  { id: 'ud', bit: 0x02, tecla: 'KeyE', espejoX: true, espejoY: false, color: 'rojo' },
  { id: 'c', bit: 0x04, tecla: 'KeyS', centro: true },
  { id: 'di', bit: 0x08, tecla: 'KeyZ', espejoX: false, espejoY: true, color: 'azul' },
  { id: 'dd', bit: 0x10, tecla: 'KeyC', espejoX: true, espejoY: true, color: 'azul' },
];
// el segundo juego de paneles (OPCIONES > PANELES: DOS, para DOUBLE): son los del jugador 2 (grupo 1 de la placa;
// en DOUBLE, las 5 columnas de la derecha). En los menus hacen de numerico.
const TECLA2 = { ui: 'Numpad7', ud: 'Numpad9', c: 'Numpad5', di: 'Numpad1', dd: 'Numpad3' };
const PADS2 = PADS.map((p) => ({ ...p, id: p.id + '2', base: p.id, tecla: TECLA2[p.id], jugador: 1 }));
for (const p of PADS) { p.base = p.id; p.jugador = 0; }
let dos = false, ultimoLugar = null;
const activos = () => (dos ? [...PADS, ...PADS2] : PADS);
const redibujar = () => { for (const p of activos()) { dibujarPad(p); if (p.lienzo2) { const l = p.lienzo; p.lienzo = p.lienzo2; dibujarPad(p); p.lienzo = l; } } };
export function fijarDos(v) { dos = !!v; if (ultimoLugar) ubicar(...ultimoLugar); }
// OPCIONES (mejora 16, Charles 20/10): el tamano de los paneles (0,8 a 1,3 del que entra) y vibrar al pisar
let tamano = 1, vibrar = true;
export function fijarTamano(k) { tamano = Math.max(0.6, Math.min(1.5, +k || 1)); if (ultimoLugar) ubicar(...ultimoLugar); }
export function fijarVibrar(v) { vibrar = !!v; }
let capa, fondos = [], botones = [], imagenes = null, alPad = () => {}, alTecla = () => {};
const apretados = new Map();   // puntero -> id del pad que pisa
const estadoPad = {};          // id -> apretado

async function cargarFlechas() {
  const r = await fetch(new URL('../disco/bga/00.dat', location.href));
  const p = abrirPaquete(new Uint8Array(await r.arrayBuffer())), m = {};
  for (const a of p.archivos) m[a.nombre.toUpperCase()] = a;
  const img = (n) => createImageBitmap(new Blob([m[n].datos()], { type: 'image/png' }));
  imagenes = { flechas: await img('ARROW01.PNG'), centro: await img('ARROW03.PNG') };
  redibujar();
}
// celdas de 70x70 (ARROW541.SP2): roja maciza en (0,70), azul en (140,140); centro con huellas en (0,140) de ARROW03
function dibujarPad(p) {
  const c = p.lienzo; if (!c || !imagenes) return;
  const x = c.getContext('2d'), t = c.width, on = estadoPad[p.id];
  x.clearRect(0, 0, t, t);
  x.save();
  x.globalAlpha = on ? 1 : 0.82;
  if (on) { x.shadowColor = p.centro ? '#ffb030' : p.color === 'rojo' ? '#ff4040' : '#40a0ff'; x.shadowBlur = t * 0.25; }
  x.translate(t / 2, t / 2);
  const s = on ? 0.96 : 0.9;
  x.scale((p.espejoX ? -1 : 1) * s, (p.espejoY ? -1 : 1) * s);
  // 2 px hacia adentro de cada celda: en los bordes se cuelan las lineas de la grilla de la hoja
  if (p.centro) x.drawImage(imagenes.centro, 2, 142, 66, 66, -t / 2, -t / 2, t, t);
  else x.drawImage(imagenes.flechas, p.color === 'rojo' ? 2 : 142, p.color === 'rojo' ? 72 : 142, 66, 66, -t / 2, -t / 2, t, t);
  x.restore();
}

function crear() {
  capa = document.createElement('div');
  capa.id = 'tactil';
  capa.style.cssText = 'position:fixed;inset:0;touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:none;';
  // dos fondos (abajo, o izquierda y derecha) con el video del juego estirado y borroso
  for (let i = 0; i < 2; i++) {
    const f = document.createElement('canvas'); f.width = 160; f.height = 120;
    f.style.cssText = 'position:absolute;filter:blur(10px) brightness(.55) saturate(1.3);pointer-events:none;';
    capa.appendChild(f); fondos.push(f);
  }
  for (const p of PADS) for (const lado of [0, 1]) {
    if (!p.centro && lado === 1) continue;   // el centro va repetido en los dos costados (horizontal)
    const c = document.createElement('canvas'); c.width = c.height = 140;
    c.style.cssText = 'position:absolute;pointer-events:none;';
    capa.appendChild(c);
    if (lado === 0) p.lienzo = c; else p.lienzo2 = c;
  }
  for (const p of PADS2) {
    const c = document.createElement('canvas'); c.width = c.height = 140;
    c.style.cssText = 'position:absolute;pointer-events:none;display:none;';
    capa.appendChild(c); p.lienzo = c;
  }
  for (const [txt, tecla] of [['ATRÁS', 'Escape'], ['CHAT', 'KeyT'], ['MONEDA', 'F4']]) {
    const b = document.createElement('div');
    b.textContent = txt; b.dataset.tecla = tecla;
    b.style.cssText = 'position:absolute;padding:6px 12px;border-radius:8px;background:rgba(0,0,40,.65);color:#ffd23f;font:700 13px "Segoe UI",system-ui,sans-serif;border:1px solid #5fd0ff;pointer-events:none;';
    capa.appendChild(b); botones.push(b);
  }
  document.body.appendChild(capa);
  // los toques se reciben en toda la pantalla y se reparten por posicion (permite deslizar de un panel a otro)
  const op = { passive: false };
  addEventListener('pointerdown', tocar, op); addEventListener('pointermove', tocar, op);
  addEventListener('pointerup', soltar, op); addEventListener('pointercancel', soltar, op);
  // (Charles 21/10: "jugando me quedo el boton del medio fijo") a veces el aparato no avisa que se levanto un dedo
  // (varios a la vez, el dedo se va por el borde): cuando ya no queda ninguno apoyado, se sueltan todos los paneles.
  // Tambien si la pagina pierde el foco (una notificacion, otra app).
  const soltarTodo = () => { if (apretados.size) { apretados.clear(); actualizarPads(); } };
  for (const t of ['touchend', 'touchcancel']) addEventListener(t, (e) => { if (!e.touches || e.touches.length === 0) soltarTodo(); }, { passive: true });
  addEventListener('blur', soltarTodo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) soltarTodo(); });
}
function padEn(x, y) {
  for (const p of activos()) for (const c of [p.lienzo, p.lienzo2]) {
    if (!c || c.style.display === 'none') continue;
    const r = c.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (Math.hypot(x - cx, y - cy) < r.width * 0.52) return p;
  }
  return null;
}
function botonEn(x, y) {
  for (const b of botones) { if (b.style.display === 'none') continue; const r = b.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return b; }
  return null;
}
function actualizarPads() {
  const ahora = new Set(apretados.values());
  for (const p of [...PADS, ...PADS2]) {
    const on = ahora.has(p.id);
    if (!!estadoPad[p.id] !== on) {
      estadoPad[p.id] = on; alPad(p, on);
      if (on && vibrar && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* sin vibrador */ } } dibujarPad(p); if (p.lienzo2) { const l = p.lienzo; p.lienzo = p.lienzo2; dibujarPad(p); p.lienzo = l; }
    }
  }
}
function tocar(e) {
  if (e.type === 'pointermove' && !apretados.has(e.pointerId)) return;
  if (e.type === 'pointerdown') { const b = botonEn(e.clientX, e.clientY); if (b) { e.preventDefault(); alTecla(b.dataset.tecla); return; } }
  const p = padEn(e.clientX, e.clientY);
  if (e.type === 'pointerdown' && !p) return;      // tocar fuera de los paneles: lo maneja la pagina (doble toque, etc.)
  e.preventDefault();
  if (p) apretados.set(e.pointerId, p.id); else apretados.set(e.pointerId, null);
  actualizarPads();
}
function soltar(e) { if (!apretados.has(e.pointerId)) return; apretados.delete(e.pointerId); actualizarPads(); }

// ubica todo segun el cuadro del juego (rect, en px de la ventana) y la orientacion
export function ubicar(rect, vw, vh) {
  ultimoLugar = [rect, vw, vh];
  if (!capa) return;
  const vertical = vh > vw;
  for (const p of PADS2) p.lienzo.style.display = 'none';
  if (dos) return ubicarDos(rect, vw, vh, vertical);
  const pon = (el, x, y, t) => { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = el.style.height = t + 'px'; el.style.display = ''; };
  // el fondo borroso se pasa 24 px de cada lado: si no, el desenfoque deja bordes oscuros
  const fondo = (f, x, y, w, h) => Object.assign(f.style, { left: (x - 24) + 'px', top: (y - 24) + 'px', width: (w + 48) + 'px', height: (h + 48) + 'px', display: w > 8 && h > 8 ? '' : 'none' });
  capa.style.overflow = 'hidden';
  if (vertical) {
    const top = rect.y + rect.h, alto = vh - top, ancho = vw;
    fondo(fondos[0], 0, top, vw, alto);
    fondos[1].style.display = 'none';
    // cruz en el espacio de abajo, juntos como los paneles de la cabina, arrimados al juego. 20/10 (Charles: "estan un
    // poco separados, mas grandes y mas juntos"): ~15 % mas grandes y los centros a 0,75 del tamano (antes 0,9):
    // en diagonal quedan pegados sin pisarse (la zona de toque es un circulo de 0,52)
    const t = Math.min(ancho / 2.7, (alto - 52) / 2.55, 200) * tamano, paso = t * 0.75;
    const cx = vw / 2, cy = top + 44 + paso + t / 2 + Math.max(0, (alto - 44 - 2 * paso - t) * 0.25);
    const pos = { ui: [-1, -1], ud: [1, -1], c: [0, 0], di: [-1, 1], dd: [1, 1] };
    for (const p of PADS) { const [i, j] = pos[p.id]; pon(p.lienzo, cx + i * paso - t / 2, cy + j * paso - t / 2, t); if (p.lienzo2) p.lienzo2.style.display = 'none'; }
    botones[0].style.left = '10px'; botones[0].style.top = (top + 8) + 'px';
    botones[1].style.left = (vw - 80) + 'px'; botones[1].style.top = (top + 8) + 'px';
    botones[2].style.left = (vw - 100) + 'px'; botones[2].style.top = (vh - 40) + 'px';
  } else {
    const izq = rect.x, der = vw - rect.x - rect.w;
    fondo(fondos[0], 0, 0, izq, vh);
    fondo(fondos[1], rect.x + rect.w, 0, der, vh);
    // si los costados son angostos (tablet casi 4:3), los paneles se apoyan sobre el borde del juego
    // (20/10: mas grandes y las de arriba y abajo lo mas cerca del centro que se puede sin que las zonas de toque se
    // pisen: el centro esta corrido 0,55 del tamano hacia adentro, asi que van a 0,8 de alto de el; mas adentro taparia la
    // primera columna de flechas del juego)
    // y sin meterse debajo de ATRAS (arriba a la izquierda) ni de MONEDA (abajo a la derecha): ATRAS saca del juego
    const lado = Math.max(izq, der), t = Math.max(56, Math.min(lado * 0.85, vh / 2.9, (vh / 2 - 46) / 1.3)) * tamano;
    const arriba = vh * 0.5 - t * 0.8, abajo = vh - arriba;
    const colI = Math.max(t * 0.6, izq / 2), colD = vw - Math.max(t * 0.6, der / 2);
    pon(PADS[0].lienzo, colI - t / 2 - t * 0.2, arriba - t / 2, t);            // ↖
    pon(PADS[3].lienzo, colI - t / 2 - t * 0.2, abajo - t / 2, t);             // ↙
    pon(PADS[2].lienzo, colI - t / 2 + t * 0.35, vh * 0.5 - t / 2, t * 0.9);   // ● izquierda
    pon(PADS[1].lienzo, colD - t / 2 + t * 0.2, arriba - t / 2, t);            // ↗
    pon(PADS[4].lienzo, colD - t / 2 + t * 0.2, abajo - t / 2, t);             // ↘
    pon(PADS[2].lienzo2, colD - t / 2 - t * 0.35, vh * 0.5 - t / 2, t * 0.9);  // ● derecha
    botones[0].style.left = '8px'; botones[0].style.top = '8px';
    botones[1].style.left = (vw - 70) + 'px'; botones[1].style.top = '8px';
    botones[2].style.left = (vw - 90) + 'px'; botones[2].style.top = (vh - 38) + 'px';
  }
  redibujar();
}
// dos juegos de paneles: una cruz entera por jugador. Vertical: lado a lado abajo del juego. Horizontal: una a cada
// costado (en un celular acostado quedan chicas: es para tablets)
function ubicarDos(rect, vw, vh, vertical) {
  const pon = (el, x, y, t) => { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = el.style.height = t + 'px'; el.style.display = ''; };
  const fondo = (f, x, y, w, h) => Object.assign(f.style, { left: (x - 24) + 'px', top: (y - 24) + 'px', width: (w + 48) + 'px', height: (h + 48) + 'px', display: w > 8 && h > 8 ? '' : 'none' });
  const pos = { ui: [-1, -1], ud: [1, -1], c: [0, 0], di: [-1, 1], dd: [1, 1] };
  const cruz = (lista, cx, cy, t) => { const paso = t * 0.75; for (const p of lista) { const [i, j] = pos[p.base]; pon(p.lienzo, cx + i * paso - t / 2, cy + j * paso - t / 2, t); if (p.lienzo2) p.lienzo2.style.display = 'none'; } };
  if (vertical) {
    const top = rect.y + rect.h, alto = vh - top;
    fondo(fondos[0], 0, top, vw, alto); fondos[1].style.display = 'none';
    const t = Math.min(vw / 5.2, (alto - 52) / 2.55, 160) * tamano, cy = top + 44 + t * 0.75 + t / 2 + Math.max(0, (alto - 44 - 2.5 * t) * 0.25);
    cruz(PADS, vw * 0.25, cy, t); cruz(PADS2, vw * 0.75, cy, t);
    botones[0].style.left = '10px'; botones[0].style.top = (top + 8) + 'px';
    botones[1].style.left = (vw - 80) + 'px'; botones[1].style.top = (top + 8) + 'px';
    botones[2].style.left = (vw - 100) + 'px'; botones[2].style.top = (vh - 40) + 'px';
  } else {
    const izq = rect.x, der = vw - rect.x - rect.w;
    fondo(fondos[0], 0, 0, izq, vh); fondo(fondos[1], rect.x + rect.w, 0, der, vh);
    const lado = Math.min(izq, der), t = Math.max(40, Math.min(lado / 2.55, (vh - 92) / 2.5)) * tamano;
    cruz(PADS, izq / 2, vh / 2, t); cruz(PADS2, vw - der / 2, vh / 2, t);
    botones[0].style.left = '8px'; botones[0].style.top = '8px';
    botones[1].style.left = (vw - 70) + 'px'; botones[1].style.top = '8px';
    botones[2].style.left = (vw - 90) + 'px'; botones[2].style.top = (vh - 38) + 'px';
  }
  redibujar();
}
// copia el cuadro actual (juego o menu) a los fondos borrosos
export function pintarFondo(fuente) {
  if (!capa || !fuente || !fuente.width) return;
  for (const f of fondos) if (f.style.display !== 'none') { try { f.getContext('2d').drawImage(fuente, 0, 0, f.width, f.height); } catch (e) { /* sin cuadro */ } }
}
// que botones extra se ven: CHAT solo en el salon, MONEDA solo jugando solo
export function mostrarBotones({ chat, moneda }) {
  if (botones[1]) botones[1].style.visibility = chat ? 'visible' : 'hidden';
  if (botones[2]) botones[2].style.visibility = moneda ? 'visible' : 'hidden';
}
export async function iniciarTactil(cfg) {
  if (!esTactil) return false;
  alPad = cfg.alPad; alTecla = cfg.alTecla;
  crear();
  try { await cargarFlechas(); } catch (e) { console.error('sin flechas para los paneles', e); }
  // los lienzos pueden perder lo dibujado (al pasar a pantalla completa, o si el celular reinicia la placa de video):
  // se redibujan cada medio segundo, que no cuesta nada
  setInterval(redibujar, 500);
  return true;
}
