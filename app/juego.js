// Pump It Up Extra (arcade 2001) - prototipo jugable, 04/10/2026.
// Lee lo descifrado del disco desde /datos/: pasos (JSON), musica (MP3) y caratulas (PNG).
// Teclas: J1 Z Q S E C (abajo-izq, arriba-izq, centro, arriba-der, abajo-der) - J2 teclado numerico 1 7 5 9 3.
// F1 ayuda (TEST) - F2 SERVICE - F3 CLEAR - F4 COIN - F8 juego automatico - Esc volver.
// En juego: + / - desfase (10 ms), flechas arriba/abajo velocidad.

// se recalculan por cancion con las formulas del original (ver empezar)
const VENTANAS = [['PERFECT', 0.033], ['GREAT', 0.079], ['GOOD', 0.118], ['BAD', 0.168]];
let VENTANA_MAX = 0.168;
const PUNTOS = { PERFECT: 1000, GREAT: 500, GOOD: 100, BAD: 0, MISS: 0 };
const COLOR_JUICIO = { PERFECT: '#ffe066', GREAT: '#7cf29a', GOOD: '#6ec3ff', BAD: '#c79bff', MISS: '#ff5a6e' };
// panel dentro de un pad: 0 abajo-izq, 1 arriba-izq, 2 centro, 3 arriba-der, 4 abajo-der
const ANGULO = [-135, -45, 0, 45, 135];
const COLOR_PANEL = ['#3aa0ff', '#ff4060', '#ffd23f', '#ff4060', '#3aa0ff'];
const TECLAS = { KeyZ: 0, KeyQ: 1, KeyS: 2, KeyE: 3, KeyC: 4, Numpad1: 5, Numpad7: 6, Numpad5: 7, Numpad9: 8, Numpad3: 9 };
const ORDEN_TABLAS = ['N1', 'N2', 'H1', 'H2', 'X1', 'X2', 'X3', 'X4', 'DB', 'XD', '1', '2', 'B4'];

const lienzo = document.getElementById('lienzo');
const g = lienzo.getContext('2d');
const ayuda = document.getElementById('ayuda');
const cajaError = document.getElementById('error');
const params = new URLSearchParams(location.search);

window.addEventListener('error', (e) => { cajaError.textContent += 'Error: ' + e.message + '\n'; });
window.addEventListener('unhandledrejection', (e) => { cajaError.textContent += 'Error: ' + (e.reason && e.reason.message || e.reason) + '\n'; });

function leerLS(k, porDefecto) { try { const v = localStorage.getItem(k); return v === null ? porDefecto : JSON.parse(v); } catch (e) { return porDefecto; } }
function guardarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: no pasa nada */ } }

// ---------- estado general ----------
let estado = 'cargando';          // cargando | menu | jugando | resultado
let canciones = [];               // [{ num, tablas: [{archivo, formato, tipo, bpm, notas}] }]
let iCancion = 0, iTabla = 0;
const caratulas = {};
let auto = params.get('auto') === '1';
let creditos = 0;
let mostrarAyuda = false;
let aviso = { texto: '', hasta: 0 };
let velocidad = +params.get('vel') || leerLS('piu_velocidad', 2);
let actx = null;

// partida en curso
let P = null;

function avisar(texto, seg = 1.6) { aviso = { texto, hasta: performance.now() + seg * 1000 }; }

// ---------- carga del menu ----------
async function cargarMenu() {
  const r = await fetch('/datos/pasos/resumen.csv');
  if (!r.ok) throw new Error('No encuentro /datos/pasos/resumen.csv (falta correr tools\\convertir_pasos.ps1)');
  const lineas = (await r.text()).trim().split(/\r?\n/).slice(1);
  const porNum = new Map();
  for (const l of lineas) {
    const c = l.split(';');
    const archivo = c[0], num = archivo.slice(0, 2);
    if (!porNum.has(num)) porNum.set(num, []);
    porNum.get(num).push({ archivo: archivo.replace(/\.NOT$/i, ''), dif: archivo.replace(/^\d\d_/, '').replace(/\.NOT$/i, ''),
      formato: c[1], tipo: c[2], bpm: +c[3], notas: +c[7], largas: +c[8] });
  }
  canciones = [...porNum.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([num, tablas]) => {
    tablas.sort((a, b) => {
      const ia = ORDEN_TABLAS.indexOf(a.dif), ib = ORDEN_TABLAS.indexOf(b.dif);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.dif.localeCompare(b.dif);
    });
    return { num, tablas };
  });
  const pedida = params.get('tabla');
  const numInicial = pedida ? pedida.slice(0, 2) : '60';
  iCancion = Math.max(0, canciones.findIndex(c => c.num === numInicial));
  iTabla = pedida ? Math.max(0, canciones[iCancion].tablas.findIndex(t => t.archivo.toUpperCase() === pedida.toUpperCase())) : 0;
  estado = 'menu';
  if (params.get('empezar') === '1') empezarSeguro();
}

function empezarSeguro() {
  empezar().catch(e => { cajaError.textContent = 'No se pudo cargar: ' + (e && e.message || e); estado = 'menu'; P = null; });
}

function caratula(num) {
  if (!caratulas[num]) { const im = new Image(); im.src = '/datos/caratulas/T' + num + '.png'; caratulas[num] = im; }
  return caratulas[num];
}

// ---------- tiempo ----------
// tiempo (en el reloj del audio) de lo que se escucha en el instante performance.now() = pt
function relojAudible(pt) {
  let t = actx.currentTime;
  if (actx.getOutputTimestamp) {
    const ts = actx.getOutputTimestamp();
    if (ts && ts.contextTime > 0 && ts.performanceTime > 0) t = ts.contextTime + (pt - ts.performanceTime) / 1000;
  }
  return t;
}
// ajuste fino de oido, aparte del desfase del original que ya trae cada tabla (clave nueva: arranca en 0)
function desfaseActual() { return P ? leerLS('piu_ajuste_' + P.formato, 0) : 0; }
// segundos de cancion (en el tiempo de las flechas) para el instante pt
function tiempoCancion(pt) { return relojAudible(pt) - P.inicio - desfaseActual() / 1000; }

// ---------- empezar una cancion ----------
async function empezar() {
  const c = canciones[iCancion], info = c.tablas[iTabla];
  estado = 'cargando';
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  await actx.resume();
  const [tabla, datosAudio] = await Promise.all([
    fetch('/datos/pasos/' + info.archivo + '.json').then(r => { if (!r.ok) throw new Error('falta ' + info.archivo + '.json'); return r.json(); }),
    fetch('/datos/musica/' + c.num + '.mp3').then(r => { if (!r.ok) throw new Error('falta ' + c.num + '.mp3'); return r.arrayBuffer(); })
  ]);
  const audio = await actx.decodeAudioData(datosAudio);
  // Tiempo exacto del original (investigacion\JUEGO_REGLAS.md §5): la fila r del segmento s cae en
  // valores[s]/100 + r/fpp * 60/BPM[s] segundos; el segmento lo decide el reloj contra cambiosBpm (centesimas).
  const fpp = tabla.filasPorPulso || 4;
  const bpms = tabla.bpms.slice(), des = tabla.valores.slice(), cambio = tabla.cambiosBpm.slice();
  while (bpms.length < 10) bpms.push(120); while (des.length < 10) des.push(0); while (cambio.length < 10) cambio.push(0);
  for (let i = 1; i < 10; i++) if (cambio[i - 1] >= cambio[i]) cambio[i] = 9999999;    // como hace el cargador (0x22329)
  const segDeTiempo = (t) => { if (!cambio[0]) return 0; const cs = t * 100; for (let i = 0; i < 9; i++) if (cs < cambio[i]) return i; return 9; };
  const tFila = (f) => {
    for (let s = 0; s < 10; s++) { const t = des[s] / 100 + f / fpp * 60 / bpms[s]; if (segDeTiempo(t) === s) return t; }
    return des[0] / 100 + f / fpp * 60 / bpms[0];
  };
  const bpm = bpms[0] || 120;
  const doble = tabla.tipo === 'doble';
  const columnas = doble ? 10 : 5;
  const notas = [];
  for (const [f, col] of tabla.notas) if (col < columnas) notas.push({ t: tFila(f), col, fin: null, juicio: null, sost: false, finJuicio: null });
  for (const [col, d, h] of tabla.largas) if (col < columnas) notas.push({ t: tFila(d), col, fin: tFila(h), juicio: null, sost: false, finJuicio: null });
  notas.sort((a, b) => a.t - b.t || a.col - b.col);
  const luces = tabla.extras.map(([f, col]) => ({ t: tFila(f), col })).sort((a, b) => a.t - b.t);
  const cambiaBpm = !!cambio[0];
  // ventanas del original (en 1/60 de pulso: PERFECT <= BPM/30, GREAT <= BPM/15+2, GOOD <= BPM/10+3; 1/60 de pulso = 1/BPM s)
  VENTANAS[0][1] = 1 / 30; VENTANAS[1][1] = 1 / 15 + 2 / bpm; VENTANAS[2][1] = 1 / 10 + 3 / bpm; VENTANAS[3][1] = 1 / 10 + 3 / bpm + 0.05;
  VENTANA_MAX = VENTANAS[3][1];
  const fuente = actx.createBufferSource();
  fuente.buffer = audio;
  fuente.connect(actx.destination);
  const inicio = actx.currentTime + 1.2;
  fuente.start(inicio);
  P = { c, info, tabla, formato: tabla.formato, bpm, doble, columnas, notas, luces, cambiaBpm, fuente, inicio,
    duracion: audio.duration, primera: 0, primeraLuz: 0, apretada: new Array(10).fill(false), destello: new Array(10).fill(-9),
    luzVista: { 10: -9, 11: -9, 12: -9 }, juicio: null, juicioT: -9, combo: 0, maxCombo: 0, puntaje: 0,
    cuenta: { PERFECT: 0, GREAT: 0, GOOD: 0, BAD: 0, MISS: 0 }, terminada: false };
  fuente.onended = () => { if (P && P.fuente === fuente && estado === 'jugando') terminar(); };
  console.log('EMPIEZA ' + info.archivo + ' formato ' + tabla.formato + ' bpm ' + bpm + ' notas ' + notas.length + ' desfase ' + desfaseActual());
  estado = 'jugando';
}

function terminar() {
  if (!P || P.terminada) return;
  P.terminada = true;
  try { P.fuente.stop(); } catch (e) { /* ya estaba parada */ }
  const total = P.notas.length + P.notas.filter(n => n.fin !== null).length;
  const k = P.cuenta;
  P.precision = total ? (k.PERFECT * 100 + k.GREAT * 80 + k.GOOD * 50 + k.BAD * 20) / total : 0;
  P.nota = P.precision >= 95 ? 'S' : P.precision >= 85 ? 'A' : P.precision >= 75 ? 'B' : P.precision >= 60 ? 'C' : P.precision >= 45 ? 'D' : 'F';
  console.log('RESULTADO ' + JSON.stringify({ tabla: P.info.archivo, auto, cuenta: k, maxCombo: P.maxCombo, puntaje: P.puntaje, precision: Math.round(P.precision * 10) / 10, nota: P.nota }));
  estado = 'resultado';
}

// ---------- juicio ----------
function registrar(j, col) {
  P.cuenta[j]++;
  P.puntaje += PUNTOS[j];
  if (j === 'MISS' || j === 'BAD') P.combo = 0; else { P.combo++; P.maxCombo = Math.max(P.maxCombo, P.combo); }
  P.juicio = j; P.juicioT = performance.now();
  if (col !== undefined && j !== 'MISS') P.destello[col] = performance.now();
}

function tocar(col, t) {
  let mejor = null, md = Infinity;
  for (let i = P.primera; i < P.notas.length; i++) {
    const n = P.notas[i];
    if (n.t - t > VENTANA_MAX) break;
    if (n.juicio || n.col !== col) continue;
    const d = Math.abs(n.t - t);
    if (d < md) { md = d; mejor = n; }
  }
  if (!mejor || md > VENTANA_MAX) return;
  let j = 'BAD';
  for (const [nombre, v] of VENTANAS) if (md <= v) { j = nombre; break; }
  mejor.juicio = j;
  registrar(j, col);
  if (mejor.fin !== null) mejor.sost = true;
}

function soltar(col, t) {
  for (let i = P.primera; i < P.notas.length; i++) {
    const n = P.notas[i];
    if (n.t > t) break;
    if (n.col === col && n.sost && n.finJuicio === null && n.fin - t > 0.1) { n.sost = false; n.finJuicio = 'MISS'; registrar('MISS'); }
  }
}

function actualizar(ahora) {
  // juego automatico
  if (auto) {
    for (let i = P.primera; i < P.notas.length; i++) {
      const n = P.notas[i];
      if (n.t > ahora) break;
      if (!n.juicio) { n.juicio = 'PERFECT'; registrar('PERFECT', n.col); if (n.fin !== null) n.sost = true; }
    }
  }
  // flechas largas sostenidas hasta el final
  for (let i = P.primera; i < P.notas.length; i++) {
    const n = P.notas[i];
    if (n.t > ahora) break;
    if (n.fin !== null && n.sost && n.finJuicio === null) {
      if (auto) P.apretada[n.col] = true;
      if (ahora >= n.fin) { n.sost = false; n.finJuicio = 'PERFECT'; registrar('PERFECT', n.col); if (auto) P.apretada[n.col] = false; }
    }
  }
  // las que pasaron sin tocar
  for (let i = P.primera; i < P.notas.length; i++) {
    const n = P.notas[i];
    if (n.t > ahora - VENTANA_MAX) break;
    if (!n.juicio) { n.juicio = 'MISS'; registrar('MISS'); if (n.fin !== null) n.finJuicio = 'MISS'; }
  }
  // avanzar el puntero de las ya resueltas
  while (P.primera < P.notas.length) {
    const n = P.notas[P.primera];
    const resuelta = n.juicio && (n.fin === null || n.finJuicio !== null);
    if (resuelta && n.t < ahora - 0.5 && (n.fin === null || n.fin < ahora - 0.5)) P.primera++; else break;
  }
  // luces (columnas extra)
  while (P.primeraLuz < P.luces.length && P.luces[P.primeraLuz].t <= ahora) { const l = P.luces[P.primeraLuz++]; P.luzVista[l.col] = performance.now(); }
  // fin
  const ultima = P.notas.length ? Math.max(...P.notas.slice(-20).map(n => n.fin !== null ? n.fin : n.t)) : 0;
  if (ahora > P.duracion + 0.3 || (ahora > ultima + 2.5 && P.primera >= P.notas.length)) terminar();
}

// ---------- teclado ----------
const VEL_MIN = 1, VEL_MAX = 6;
window.addEventListener('keydown', (e) => {
  if (['F1', 'F2', 'F3', 'F4', 'F8', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'F1') { mostrarAyuda = !mostrarAyuda; return; }
  if (e.code === 'F2') { avisar('SERVICE (todavía no hace nada)'); return; }
  if (e.code === 'F3') { avisar('CLEAR (todavía no hace nada)'); return; }
  if (e.code === 'F4') { creditos++; avisar('CREDIT ' + creditos); return; }
  if (e.code === 'F8') { auto = !auto; avisar(auto ? 'Juego automático: SÍ' : 'Juego automático: NO'); return; }
  if (estado === 'menu') teclaMenu(e);
  else if (estado === 'jugando') teclaJuego(e);
  else if (estado === 'resultado' && (e.code === 'Enter' || e.code === 'Escape' || e.code === 'KeyS' || e.code === 'Numpad5')) { estado = 'menu'; P = null; }
});
window.addEventListener('keyup', (e) => {
  if (estado !== 'jugando' || !(e.code in TECLAS)) return;
  const col = P.doble ? TECLAS[e.code] : TECLAS[e.code] % 5;
  P.apretada[col] = false;
  if (!auto) soltar(col, tiempoCancion(e.timeStamp));
});

function teclaMenu(e) {
  const c = canciones[iCancion];
  if (e.code === 'ArrowLeft' || e.code === 'KeyZ' || e.code === 'Numpad1') { iCancion = (iCancion - 1 + canciones.length) % canciones.length; iTabla = 0; }
  else if (e.code === 'ArrowRight' || e.code === 'KeyC' || e.code === 'Numpad3') { iCancion = (iCancion + 1) % canciones.length; iTabla = 0; }
  else if (e.code === 'ArrowUp' || e.code === 'KeyQ' || e.code === 'Numpad7') iTabla = (iTabla - 1 + c.tablas.length) % c.tablas.length;
  else if (e.code === 'ArrowDown' || e.code === 'KeyE' || e.code === 'Numpad9') iTabla = (iTabla + 1) % c.tablas.length;
  else if (e.code === 'Enter' || e.code === 'KeyS' || e.code === 'Numpad5') { cajaError.textContent = ''; empezarSeguro(); }
}

function teclaJuego(e) {
  if (e.code === 'Escape') { P.terminada = true; try { P.fuente.stop(); } catch (x) { /* nada */ } estado = 'menu'; P = null; return; }
  if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
    const paso = (e.code === 'Equal' || e.code === 'NumpadAdd') ? 10 : -10;
    const v = desfaseActual() + paso;
    guardarLS('piu_ajuste_' + P.formato, v);
    avisar('Desfase (formato ' + P.formato + '): ' + (v > 0 ? '+' : '') + v + ' ms');
    console.log('DESFASE ' + P.formato + ' ' + v);
    return;
  }
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    velocidad = Math.min(VEL_MAX, Math.max(VEL_MIN, velocidad + (e.code === 'ArrowUp' ? 0.5 : -0.5)));
    guardarLS('piu_velocidad', velocidad);
    avisar('Velocidad ' + velocidad + 'x');
    return;
  }
  if (!(e.code in TECLAS)) return;
  const col = P.doble ? TECLAS[e.code] : TECLAS[e.code] % 5;
  P.apretada[col] = true;
  if (!auto) tocar(col, tiempoCancion(e.timeStamp));
}

// ---------- dibujo ----------
let ancho = 0, alto = 0;
function ajustar() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  ancho = Math.round(innerWidth * dpr); alto = Math.round(innerHeight * dpr);
  lienzo.width = ancho; lienzo.height = alto;
}
window.addEventListener('resize', ajustar);
ajustar();

function fondo(num, oscuridad) {
  g.fillStyle = '#05060a'; g.fillRect(0, 0, ancho, alto);
  const im = caratula(num);
  if (im.complete && im.naturalWidth) {
    const esc = Math.max(ancho / im.naturalWidth, alto / im.naturalHeight);
    const w = im.naturalWidth * esc, h = im.naturalHeight * esc;
    g.globalAlpha = 1 - oscuridad;
    g.drawImage(im, (ancho - w) / 2, (alto - h) / 2, w, h);
    g.globalAlpha = 1;
  }
}

function texto(t, x, y, tam, color, alin = 'center', peso = '600') {
  g.font = peso + ' ' + Math.round(tam) + 'px "Segoe UI", system-ui, sans-serif';
  g.textAlign = alin; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(t, x + Math.max(1, tam / 18), y + Math.max(1, tam / 18));
  g.fillStyle = color; g.fillText(t, x, y);
}

// flecha (o cuadrado del centro) centrada en x,y; panel 0..4
function flecha(x, y, s, panel, relleno, borde, alfa = 1) {
  g.save();
  g.globalAlpha = alfa;
  g.translate(x, y);
  g.beginPath();
  if (panel === 2) {
    const r = s * 0.36;
    g.rect(-r, -r, 2 * r, 2 * r);
  } else {
    g.rotate(ANGULO[panel] * Math.PI / 180);
    const a = s * 0.46;
    g.moveTo(0, -a); g.lineTo(a * 0.9, a * 0.05); g.lineTo(a * 0.35, a * 0.05); g.lineTo(a * 0.35, a * 0.8);
    g.lineTo(-a * 0.35, a * 0.8); g.lineTo(-a * 0.35, a * 0.05); g.lineTo(-a * 0.9, a * 0.05); g.closePath();
  }
  if (relleno) { g.fillStyle = relleno; g.fill(); }
  if (borde) { g.lineWidth = Math.max(2, s * 0.06); g.strokeStyle = borde; g.stroke(); }
  g.restore();
}

function dibujarMenu() {
  const c = canciones[iCancion];
  fondo(c.num, 0.25);
  g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, alto * 0.62, ancho, alto * 0.38);
  const u = alto / 30;
  texto('PUMP IT UP EXTRA · prototipo', u, u * 1.4, u * 1.1, '#ffd23f', 'left', '800');
  texto('Canción ' + c.num + '   (' + (iCancion + 1) + ' de ' + canciones.length + ')   ← →  o  Z / C', ancho / 2, alto * 0.67, u * 1.2, '#e9ecf5');
  const n = c.tablas.length, anchoChip = Math.min(ancho / (n + 1), u * 5.5);
  c.tablas.forEach((t, i) => {
    const x = ancho / 2 + (i - (n - 1) / 2) * anchoChip, y = alto * 0.76;
    const sel = i === iTabla;
    g.fillStyle = sel ? '#ffd23f' : 'rgba(255,255,255,0.12)';
    g.fillRect(x - anchoChip * 0.45, y - u * 1.1, anchoChip * 0.9, u * 2.2);
    texto(t.dif, x, y, u * 1.05, sel ? '#05060a' : '#e9ecf5', 'center', '800');
  });
  const t = c.tablas[iTabla];
  texto(t.archivo + ' · ' + (t.tipo === 'doble' ? 'DOBLE (los dos pads)' : 'simple') + ' · ' + t.bpm + ' BPM · ' + t.notas + ' notas' + (t.largas ? ' · ' + t.largas + ' largas' : '') + ' · formato ' + t.formato,
    ancho / 2, alto * 0.85, u * 0.85, '#8a90a6', 'center', '500');
  texto('↑ ↓  o  Q / E elige la tabla  ·  Enter o S para jugar  ·  F1 ayuda  ·  F8 automático' + (auto ? ' (SÍ)' : ''), ancho / 2, alto * 0.92, u * 0.8, '#8a90a6', 'center', '500');
}

function dibujarJuego() {
  const ahora = tiempoCancion(performance.now());
  actualizar(ahora);
  if (estado !== 'jugando') return;
  fondo(P.c.num, 0.8);
  const n = P.columnas;
  const u = Math.min(alto / 9, ancho / (n * 1.12 + 1.5));
  const paso = u * 1.04;
  const x0 = ancho / 2 - (n - 1) / 2 * paso;
  const ry = u * 1.15;
  const pxSeg = velocidad * (P.bpm / 60) * u * 1.4;
  const ahoraMs = performance.now();
  // luces de la cabina (columnas extra 10-12)
  [10, 11, 12].forEach((k, i) => {
    const vida = Math.max(0, 1 - (ahoraMs - P.luzVista[k]) / 160);
    const x = i === 0 ? u * 0.6 : i === 1 ? ancho - u * 0.6 : ancho / 2;
    g.fillStyle = 'rgba(255,' + (i === 2 ? 210 : 80) + ',' + (i === 2 ? 63 : 120) + ',' + (0.12 + 0.8 * vida) + ')';
    g.beginPath(); g.arc(x, alto - u * 0.6, u * 0.28, 0, Math.PI * 2); g.fill();
  });
  // receptores
  for (let col = 0; col < n; col++) {
    const x = x0 + col * paso, panel = col % 5;
    const brillo = Math.max(0, 1 - (ahoraMs - P.destello[col]) / 180);
    flecha(x, ry, u, panel, P.apretada[col] ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.06)', 'rgba(220,225,240,0.75)');
    if (brillo > 0) flecha(x, ry, u * (1 + 0.35 * (1 - brillo)), panel, null, COLOR_PANEL[panel], brillo);
  }
  // notas
  const tope = (alto - ry) / pxSeg + 0.2;
  for (let i = P.primera; i < P.notas.length; i++) {
    const nota = P.notas[i];
    if (nota.t - ahora > tope) break;
    const x = x0 + nota.col * paso, panel = nota.col % 5;
    if (nota.fin !== null) {
      if (nota.finJuicio === 'PERFECT' || (nota.finJuicio === 'MISS' && nota.fin < ahora)) continue;
      const yIni = nota.sost ? ry : ry + (nota.t - ahora) * pxSeg;
      const yFin = ry + (nota.fin - ahora) * pxSeg;
      if (yFin < ry - u) continue;
      g.fillStyle = nota.juicio === 'MISS' || nota.finJuicio === 'MISS' ? 'rgba(120,120,130,0.5)' : COLOR_PANEL[panel] + '99';
      g.fillRect(x - u * 0.28, Math.min(yIni, yFin), u * 0.56, Math.abs(yFin - yIni));
      flecha(x, yFin, u * 0.8, panel, COLOR_PANEL[panel], '#ffffff', 0.8);
      flecha(x, yIni, u, panel, COLOR_PANEL[panel], '#ffffff');
      continue;
    }
    if (nota.juicio && nota.juicio !== 'MISS') continue;
    const y = ry + (nota.t - ahora) * pxSeg;
    if (y < ry - u * 1.5) continue;
    flecha(x, y, u, panel, nota.juicio === 'MISS' ? '#555a66' : COLOR_PANEL[panel], '#ffffff');
  }
  // juicio y combo
  const edad = (ahoraMs - P.juicioT) / 1000;
  if (P.juicio && edad < 0.6) {
    const esc = 1 + Math.max(0, 0.25 - edad) * 0.8;
    texto(P.juicio, ancho / 2, alto * 0.48, u * 0.75 * esc, COLOR_JUICIO[P.juicio], 'center', '900');
    if (P.combo >= 4) texto(P.combo + ' COMBO', ancho / 2, alto * 0.48 + u * 0.85, u * 0.5, '#e9ecf5', 'center', '800');
  }
  // datos
  const um = alto / 34;
  texto(P.info.archivo + ' · ' + P.bpm + ' BPM' + (P.cambiaBpm ? ' · (cambia de BPM: puede desfasarse)' : ''), um, alto - um * 2.6, um * 0.9, '#c9cde0', 'left', '600');
  texto('Desfase ' + (desfaseActual() > 0 ? '+' : '') + desfaseActual() + ' ms (+/-) · Velocidad ' + velocidad + 'x (↑/↓) · Esc sale' + (auto ? ' · AUTOMÁTICO' : ''), um, alto - um * 1.2, um * 0.8, '#8a90a6', 'left', '500');
  texto(String(P.puntaje).padStart(7, '0'), ancho - um, um * 1.4, um * 1.3, '#ffd23f', 'right', '800');
  const avance = Math.max(0, Math.min(1, ahora / P.duracion));
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, alto - 4, ancho, 4);
  g.fillStyle = '#ffd23f'; g.fillRect(0, alto - 4, ancho * avance, 4);
}

function dibujarResultado() {
  fondo(P.c.num, 0.7);
  const u = alto / 26;
  texto(P.info.archivo, ancho / 2, u * 2.5, u * 1.3, '#e9ecf5', 'center', '800');
  texto(P.nota, ancho / 2, u * 7, u * 5, P.nota === 'S' ? '#ffd23f' : '#e9ecf5', 'center', '900');
  const filas = ['PERFECT', 'GREAT', 'GOOD', 'BAD', 'MISS'];
  filas.forEach((j, i) => {
    texto(j, ancho / 2 - u * 1, u * (12 + i * 1.6), u * 1.05, COLOR_JUICIO[j], 'right', '800');
    texto(String(P.cuenta[j]), ancho / 2 + u * 1, u * (12 + i * 1.6), u * 1.05, '#e9ecf5', 'left', '700');
  });
  texto('Combo máximo ' + P.maxCombo + '  ·  Precisión ' + P.precision.toFixed(1) + ' %  ·  Puntaje ' + P.puntaje, ancho / 2, u * 21, u * 0.9, '#c9cde0', 'center', '600');
  texto('Enter para volver', ancho / 2, u * 23.5, u * 0.8, '#8a90a6', 'center', '500');
}

function dibujarAyuda() {
  g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, ancho, alto);
  const u = alto / 26;
  const l = [
    'TECLAS', '',
    'Jugador 1:  Z ↙   Q ↖   S ●   E ↗   C ↘',
    'Jugador 2 (teclado numérico):  1 ↙   7 ↖   5 ●   9 ↗   3 ↘',
    'En las tablas simples sirven los dos juegos de teclas.', '',
    'Menú: ← → o Z / C cambia de canción · ↑ ↓ o Q / E elige tabla · Enter o S juega',
    'Jugando: + / − desfase de a 10 ms · ↑ ↓ velocidad · Esc vuelve al menú', '',
    'F1 esta ayuda (TEST) · F2 SERVICE · F3 CLEAR · F4 COIN · F8 juego automático',
    'Si las flechas llegan antes que la música, apretá +; si llegan después, −.'
  ];
  l.forEach((t, i) => texto(t, ancho / 2, u * (5 + i * 1.4), u * (i === 0 ? 1.3 : 0.85), i === 0 ? '#ffd23f' : '#e9ecf5', 'center', i === 0 ? '800' : '500'));
}

let cuadros = 0, ultimoSeg = performance.now(), fps = 0;
function bucle() {
  try {
    if (estado === 'menu') dibujarMenu();
    else if (estado === 'jugando') dibujarJuego();
    else if (estado === 'resultado') dibujarResultado();
    else { g.fillStyle = '#05060a'; g.fillRect(0, 0, ancho, alto); texto('Cargando…', ancho / 2, alto / 2, alto / 20, '#8a90a6'); }
    if (performance.now() < aviso.hasta) texto(aviso.texto, ancho / 2, alto * 0.3, alto / 26, '#ffd23f', 'center', '800');
    if (creditos > 0 && estado !== 'jugando') texto('CREDIT ' + creditos, ancho / 2, alto - alto / 40, alto / 40, '#c9cde0', 'center', '700');
    if (mostrarAyuda) dibujarAyuda();
    cuadros++;
    const t = performance.now();
    if (t - ultimoSeg >= 1000) { fps = cuadros; cuadros = 0; ultimoSeg = t; window.__piu.fps = fps; }
  } catch (e) {
    cajaError.textContent = 'Error: ' + (e && e.stack || e);
  }
  requestAnimationFrame(bucle);
}

window.__piu = {
  fps: 0,
  get estado() { return estado; },
  get partida() { return P ? { tabla: P.info.archivo, cuenta: P.cuenta, combo: P.combo, maxCombo: P.maxCombo, puntaje: P.puntaje, primera: P.primera, notas: P.notas.length } : null; }
};

ayuda.textContent = '';
requestAnimationFrame(bucle);
cargarMenu().catch(e => { cajaError.textContent = 'Error: ' + e.message; });
