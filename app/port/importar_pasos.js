// IMPORTAR PASOS de otros programas (Charles 05/11: "que los pasos se puedan subir, not y ksf... direct move, sm o ssc").
// Formatos: investigacion\FORMATOS_EXTERNOS_Y_YOUTUBE.md. El archivo nunca se usa tal cual: se lee a un modelo en pulsos y
// se convierte a lo que el motor entiende (filas, tramos de BPM). Se devuelve lo mismo que leerPasos, mas un informe de lo
// que no se pudo pasar. Lo que viaja o se guarda es el .NOT que arma escribirNot.
//
// Limites del .NOT (JUEGO_REGLAS 4 a 6): 2048 filas, 10 tramos, solo flechas y largas. La fila r del tramo s cae en
// valores[s]/100 + r/fpp * 60/BPM[s] segundos, y cada tramo manda desde el instante cambios[s-1] (centesimas).
// - Un stop no puede frenar el reloj de filas: se dejan filas vacias (el tiempo queda bien, la flecha no se congela).
// - Un warp es un salto de filas: las notas de adentro no se pueden jugar y se descartan.
// - Con mas de 10 tramos, lo que sigue se ubica por tiempo sobre el ultimo tramo (y el informe dice cuanto se corrio).
export const TOPE_FILAS = 2048;
const TOPE_TRAMOS = 10;
const TOPE_BPM = 1000;                 // el que acepta el salon (pasosLimpios); un BPM mayor es un warp disfrazado
const FPP_POSIBLES = [2, 4, 3, 6];     // de 8 para arriba el juez del original no deja pisar a tiempo (informe, seccion 2)
const TOPE_ARCHIVO = 4 * 1048576;
const EPS = 1e-6;

// ---------- texto ----------
function decodificar(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* no es UTF-8 */ }
  for (const c of ['euc-kr', 'windows-1252']) { try { return new TextDecoder(c).decode(bytes); } catch (e) { /* ese navegador no lo tiene */ } }
  return String.fromCharCode(...bytes.subarray(0, 65536));
}
const numero = (v, porDefecto = 0) => { const n = parseFloat(String(v).trim()); return Number.isFinite(n) ? n : porDefecto; };
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, '');
// "pulso=valor,pulso=valor" de SM y SSC
function pares(v) {
  return String(v || '').split(',').map(s => s.split('=').map(x => x.trim())).filter(p => p.length >= 2 && p[0] !== '')
    .map(p => [numero(p[0], NaN), numero(p[1], NaN)]).filter(([b, x]) => Number.isFinite(b) && Number.isFinite(x)).sort((a, b) => a[0] - b[0]);
}
// las etiquetas #NOMBRE:valor; de SM y SSC, en orden. La barra \ escapa el caracter siguiente
function etiquetas(texto) {
  const t = sinComentarios(texto), o = []; let i = 0;
  while ((i = t.indexOf('#', i)) >= 0) {
    const d = t.indexOf(':', i); if (d < 0) break;
    let f = d + 1, v = '';
    for (; f < t.length && t[f] !== ';'; f++) {
      if (t[f] === '\\') { f++; v += t[f] || ''; continue; }
      if (t[f] === '#' && t[f - 1] === '\n') break;     // falta el ; pero empieza otra etiqueta (StepMania lo tolera)
      v += t[f];
    }
    o.push([t.slice(i + 1, d).trim().toUpperCase(), v]);
    i = f;
  }
  return o;
}

// ---------- modelo comun: { notas:[{beat,col,fin?}], tiempo:{ inicio, bpm, eventos }, inf } ----------
// eventos, por pulso: { beat, bpm } | { beat, pausa, despues } (stop o delay) | { beat, salto } (warp) | { beat, hora, bpm } (BUNKI)
const nuevoInforme = () => ({ minas: 0, falsas: 0, sonidos: 0, raras: 0, rolls: 0, lifts: 0, pausas: 0, efectos: new Set() });

const limpiarFilaSm = (s) => s.replace(/\{[^}]*\}|\[[^\]]*\]|<[^>]*>/g, '').trim();     // sin los datos extra entre llaves
function leerNotasSm(notas, columnas, desde, inf) {
  const salida = [], abiertas = new Array(10).fill(null), pads = notas.split('&');       // pump-routine: un bloque por jugador
  if (pads.length > 1) inf.efectos.add('rutina: los dos jugadores quedan juntos en DOUBLE');
  for (const pad of pads) pad.split(',').forEach((compas, m) => {
    const filas = compas.split(/\r?\n/).map(limpiarFilaSm).filter(Boolean);
    filas.forEach((fila, l) => {
      const beat = (m + l / filas.length) * 4;
      for (let c = 0; c < Math.min(fila.length, columnas); c++) {
        const k = fila[c], col = desde + c;
        if (k === '0') continue;
        if (k === '1') salida.push({ beat, col });
        else if (k === 'L') { salida.push({ beat, col }); inf.lifts++; }
        else if (k === '2' || k === '4') { abiertas[col] = beat; if (k === '4') inf.rolls++; }
        else if (k === '3') { if (abiertas[col] !== null) { salida.push({ beat: abiertas[col], col, fin: beat }); abiertas[col] = null; } }
        else if (k === 'M') inf.minas++;
        else if (k === 'F') inf.falsas++;
        else if (k === 'K') inf.sonidos++;
        else inf.raras++;
      }
    });
  });
  for (let col = 0; col < 10; col++) if (abiertas[col] !== null) salida.push({ beat: abiertas[col], col });     // larga sin cola
  return salida;
}

// ---------- KSF (Kick It Up) y KSF con las lineas de Direct Move ----------
const DIFICULTAD_KSF = [[/crazy|cz|nightmare|nm|wild|wd|hardcore|another/i, 'CRAZY'], [/hard|hd|freestyle|fs/i, 'HARD'], [/easy|ez|normal|beginner|practice/i, 'NORMAL']];
function leerKsf(texto, nombreArchivo) {
  const inf = nuevoInforme(), cab = {}, filas = [], lineas = sinComentarios(texto).split(/\r?\n/);
  let i = 0;
  for (; i < lineas.length; i++) {
    const m = /^\s*#([A-Z0-9_]+)\s*:(.*)$/i.exec(lineas[i]);
    if (!m) continue;
    const et = m[1].toUpperCase();
    if (et === 'STEP' || et === 'STEPS') { i++; break; }
    cab[et] = m[2].replace(/;\s*$/, '').trim();
  }
  for (; i < lineas.length; i++) { const l = lineas[i].trim(); if (l) filas.push(l); }
  if (!filas.length) throw new Error('este .ksf no trae pasos');
  // el tipo sale del nombre del archivo (y de #PLAYER); la pantalla de importar lo muestra
  const n = (nombreArchivo || '').toLowerCase();
  const media = /halfdouble|half-double|h_double|hdb/.test(n), doble = !media && (/double|nightmare|freestyle|(^|[_\- .])(db|nm|fs)([_\- .]|$)/.test(n) || /double/i.test(cab.PLAYER || ''));
  const versus = !media && !doble && /_2\./.test(n);
  const columnas = media ? 6 : doble || versus ? 10 : 5, desde = media ? 2 : 0;
  // (nightmare o crazy en un doble = CRAZY doble, el _xd de la cabina)
  let modo = doble || media ? (/nightmare|(^|[_\- .])nm([_\- .]|$)|crazy|(^|[_\- .])cz([_\- .]|$)/.test(n) ? 'CRAZY DOBLE' : 'DOUBLE') : 'HARD';
  if (!doble && !media) for (const [re, d] of DIFICULTAD_KSF) if (re.test(n)) { modo = d; break; }
  const bpm = numero(cab.BPM);
  if (!(bpm > 0)) throw new Error('este .ksf no dice el BPM');
  const inicio = numero(cab.STARTTIME) / 100, notas = [], eventos = [];
  const largaDesde = new Array(10).fill(null), ultimo4 = new Array(10).fill(0);
  const tickInicial = Math.max(1, numero(cab.TICKCOUNT, 4));
  let tick = tickInicial, beat = 0, bpmActual = bpm;
  const cerrar = (col) => { const d = largaDesde[col], h = ultimo4[col]; largaDesde[col] = null; notas.push(d === h ? { beat: d, col } : { beat: d, col, fin: h }); };
  for (const l of filas) {
    if (l[0] === '|') {                               // Direct Move: |T8| |B150| |D500| |E8|; los demas son efectos
      const que = l[1], v = numero(l.slice(2, -1));
      if (que === 'T' && v > 0) tick = v;
      else if (que === 'B' && v !== 0) { eventos.push({ beat, bpm: v }); bpmActual = v; }
      else if (que === 'D' && v > 0) { eventos.push({ beat, pausa: v / 1000, despues: false }); inf.pausas++; }
      else if (que === 'E' && v > 0) { eventos.push({ beat, pausa: 60 / bpmActual * v / tick, despues: false }); inf.pausas++; }
      else if ('XSFMC'.includes(que)) inf.efectos.add('velocidades y combos de Direct Move');
      continue;
    }
    if (l[0] === '#') continue;
    if (l.includes('2')) break;                       // fin: el documento dice "una linea con un 2"; el codigo, los 13
    for (let c = 0; c < columnas; c++) {
      const k = l[desde + c] || '0', col = desde + c;
      if (k === '4') { if (largaDesde[col] === null) largaDesde[col] = beat; ultimo4[col] = beat; continue; }
      if (largaDesde[col] !== null) cerrar(col);      // la larga termina en el ultimo 4, no en este
      if (k === '1') notas.push({ beat, col });
      else if (k === 'L') { notas.push({ beat, col }); inf.lifts++; }
      else if (k === 'M') inf.minas++;
      else if (k === 'F') inf.falsas++;
    }
    beat += 1 / tick;
  }
  for (let c = 0; c < 10; c++) if (largaDesde[c] !== null) cerrar(c);
  // BUNKI: a esa hora el grafico sigue "como si hubiera empezado en ese desfase". Sin STARTTIME2, de corrido
  let bAnterior = bpm, iniAnterior = inicio;
  for (const [cb, cs, ct] of [['BUNKI', 'BPM2', 'STARTTIME2'], ['BUNKI2', 'BPM3', 'STARTTIME3']]) {
    const hora = numero(cab[cb]) / 100, b2 = numero(cab[cs]);
    if (!(hora > 0) || !(b2 > 0)) continue;
    const ini2 = cab[ct] !== undefined ? numero(cab[ct]) / 100 : null;
    const b = ini2 !== null ? (hora - ini2) * b2 / 60 : (hora - iniAnterior) * bAnterior / 60;
    eventos.push({ beat: b, hora, bpm: b2 });
    bAnterior = b2; iniAnterior = hora - b * 60 / b2;
  }
  return [{ titulo: cab.TITLE || '', artista: '', descripcion: nombreArchivo || '', tipo: media || doble ? 'doble' : versus ? 'versus' : 'simple', modo, nivel: numero(cab.DIFFICULTY) | 0,
    notas, tiempo: { inicio, bpm, eventos }, inf, tick: tickInicial, audio: cab.SONGFILE || '', portada: cab.TITLEFILE || '', banner: cab.DISCFILE || '' }];
}

// ---------- SM y SSC ----------
const TIPOS = { 'pump-single': ['simple', 5, 0], 'pump-double': ['doble', 10, 0], 'pump-couple': ['versus', 10, 0], 'pump-halfdouble': ['doble', 6, 2], 'pump-routine': ['doble', 10, 0] };
const MODO_DIF = { Beginner: 'NORMAL', Easy: 'NORMAL', Medium: 'HARD', Hard: 'CRAZY', Challenge: 'CRAZY', Edit: 'CRAZY' };
function tiempoSm(c, inf) {
  const bpms = pares(c.BPMS).filter(([, b]) => b !== 0);
  if (!bpms.length) throw new Error('el archivo no dice el BPM');
  const eventos = bpms.slice(1).map(([beat, bpm]) => ({ beat, bpm }));
  for (const [beat, s] of pares(c.STOPS || c.FREEZES)) if (s !== 0) { eventos.push({ beat, pausa: s, despues: false }); inf.pausas++; }
  for (const [beat, s] of pares(c.DELAYS)) if (s !== 0) { eventos.push({ beat, pausa: s, despues: true }); inf.pausas++; }
  for (const [beat, largo] of pares(c.WARPS)) if (largo > 0) eventos.push({ beat, salto: largo });
  if ((c.SCROLLS && /=/.test(c.SCROLLS)) || (c.SPEEDS && /=/.test(c.SPEEDS))) inf.efectos.add('velocidades de la tabla');
  return { inicio: -numero(c.OFFSET), bpm: bpms[0][1], eventos };
}
function armarCartaSm(tipoTxt, descripcion, dif, nivel, notas, cab, propios) {
  const t = TIPOS[String(tipoTxt).trim().toLowerCase()];
  if (!t) return { rechazada: String(tipoTxt).trim() };
  const inf = nuevoInforme(), [tipo, columnas, desde] = t;
  const d = MODO_DIF[String(dif).trim()] || 'HARD';
  return { titulo: cab.TITLE || '', artista: cab.ARTIST || '', descripcion: String(descripcion || '').trim(), tipo, modo: tipo === 'doble' ? (d === 'CRAZY' ? 'CRAZY DOBLE' : 'DOUBLE') : d, nivel: numero(nivel) | 0,
    notas: leerNotasSm(notas, columnas, desde, inf), tiempo: tiempoSm({ ...cab, ...propios }, inf), inf, audio: cab.MUSIC || '', portada: cab.JACKET || cab.BACKGROUND || cab.BANNER || '', banner: cab.BANNER || cab.CDIMAGE || '' };
}
function leerSm(texto) {
  const cab = {}, cartas = [];
  for (const [et, v] of etiquetas(texto)) {
    if (et === 'NOTES' || et === 'NOTES2') { const p = v.split(':'); if (p.length >= 6) cartas.push(p); }
    else cab[et] = v.trim();
  }
  return cartas.map(p => armarCartaSm(p[0], p[1], p[2], p[3], p.slice(5).join(':'), cab, {}));
}
const TIEMPO_SSC = ['BPMS', 'STOPS', 'FREEZES', 'DELAYS', 'WARPS', 'OFFSET', 'SCROLLS', 'SPEEDS'];
function leerSsc(texto) {
  const cab = {}, cartas = []; let actual = null;
  for (const [et, v] of etiquetas(texto)) {
    if (et === 'NOTEDATA') { actual = {}; cartas.push(actual); continue; }
    if (actual) actual[et] = v; else cab[et] = v.trim();
  }
  return cartas.filter(c => c.NOTES || c.NOTES2).map((c) => {
    // con una sola etiqueta de tiempo en la dificultad, valen todas las de ella (changelog de SSC, v0.78): no se mezclan con las generales
    const propios = {};
    if (TIEMPO_SSC.some(k => c[k] !== undefined)) { for (const k of TIEMPO_SSC) propios[k] = c[k] !== undefined ? c[k] : ''; if (c.OFFSET === undefined) propios.OFFSET = cab.OFFSET; if (c.BPMS === undefined) propios.BPMS = cab.BPMS; }
    return armarCartaSm(c.STEPSTYPE, c.DESCRIPTION || c.CHARTNAME, c.DIFFICULTY, c.METER, c.NOTES || c.NOTES2, cab, propios);
  });
}

// ---------- el conversor: del modelo en pulsos a filas y tramos ----------
function elegirFpp(notas, preferido) {
  const puntos = []; for (const n of notas) { puntos.push(n.beat); if (n.fin !== undefined) puntos.push(n.fin); }
  const entra = (f) => puntos.every(b => { const x = b * f; return Math.abs(x - Math.round(x)) < 1 / 96 * f; });
  // el del archivo, si sirve: asi el editor muestra la misma grilla
  if (FPP_POSIBLES.includes(preferido) && entra(preferido)) return { fpp: preferido, exacto: true };
  for (const f of FPP_POSIBLES) if (entra(f)) return { fpp: f, exacto: true };
  return { fpp: 4, exacto: false };
}
// Los segmentos de la tabla, en orden: { beat, hora, bpm, fila } al empezar cada uno. saltoDesde = desde que pulso no se juega.
function armarSegmentos(t, fpp) {
  const evs = t.eventos.slice().sort((a, b) => a.beat - b.beat || (a.pausa ? 1 : 0) - (b.pausa ? 1 : 0));
  // si el pulso 0 cae antes de la musica, esas filas quedan afuera (lo que cae antes de arrancar no se puede jugar)
  const filaInicial = t.inicio < 0 ? -Math.ceil(-t.inicio * t.bpm / 60 * fpp) : 0;
  const lista = [{ beat: 0, hora: t.inicio, bpm: t.bpm, fila: filaInicial }];
  const horaEn = (s, b) => s.hora + (b - s.beat) * 60 / s.bpm, filaEn = (s, b) => s.fila + (b - s.beat) * fpp;
  for (const e of evs) {
    const s = lista[lista.length - 1];
    if (e.hora !== undefined) {                       // BUNKI: a esa hora va a ese pulso
      const llegaba = s.beat + (e.hora - s.hora) * s.bpm / 60, b = Math.max(e.beat, s.beat);
      lista.push({ beat: b, hora: e.hora, bpm: e.bpm, fila: filaEn(s, b), ...(b > llegaba + EPS ? { saltoDesde: llegaba } : {}) });
      continue;
    }
    if (e.beat < s.beat - EPS) continue;
    if (e.bpm !== undefined) lista.push({ beat: e.beat, hora: horaEn(s, e.beat), bpm: e.bpm, fila: filaEn(s, e.beat) });
    else if (e.salto !== undefined) lista.push({ beat: e.beat + e.salto, hora: horaEn(s, e.beat), bpm: s.bpm, fila: filaEn(s, e.beat + e.salto), saltoDesde: e.beat });
    else if (e.pausa < 0) {                           // stop negativo: un warp disfrazado
      const largo = -e.pausa * s.bpm / 60;
      lista.push({ beat: e.beat + largo, hora: horaEn(s, e.beat), bpm: s.bpm, fila: filaEn(s, e.beat + largo), saltoDesde: e.beat });
    } else lista.push({ beat: e.beat, hora: horaEn(s, e.beat) + e.pausa, bpm: s.bpm, fila: filaEn(s, e.beat) + Math.round(e.pausa * s.bpm / 60 * fpp), pausa: true, despues: e.despues });
  }
  // BPM negativo o enorme: tambien warps disfrazados. Lo que pasa antes de recuperar la hora maxima no se juega
  const limpio = []; let horaMax = -Infinity, deDonde = null;
  for (let i = 0; i < lista.length; i++) {
    const s = lista[i], sig = lista[i + 1], hasta = sig ? sig.beat : Infinity;
    if (s.bpm < 0 || s.bpm > TOPE_BPM) {              // este segmento no se puede tocar: el que sigue arranca con su hora calculada
      if (deDonde === null) deDonde = s.beat;
      horaMax = Math.max(horaMax, s.hora);
      if (sig && sig.hora !== undefined) { sig.hora = s.hora + (hasta - s.beat) * 60 / s.bpm; }
      continue;
    }
    if (s.hora < horaMax - EPS) {                     // recien cuenta cuando alcanza la hora maxima
      const adelanto = (horaMax - s.hora) * s.bpm / 60;
      if (s.beat + adelanto >= hasta) { if (sig) sig.hora = s.hora + (hasta - s.beat) * 60 / s.bpm; if (deDonde === null) deDonde = s.beat; continue; }
      limpio.push({ ...s, beat: s.beat + adelanto, hora: horaMax, fila: s.fila + adelanto * fpp, saltoDesde: deDonde !== null ? deDonde : s.beat });
      deDonde = null; continue;
    }
    limpio.push(deDonde !== null ? { ...s, saltoDesde: deDonde } : s);
    deDonde = null; horaMax = Math.max(horaMax, s.hora);
  }
  return limpio;
}
// Pasa una carta a lo que usa el editor (lo mismo que leerPasos), con sus avisos
export function convertirCarta(carta) {
  const { fpp, exacto } = elegirFpp(carta.notas, carta.tick), inf = carta.inf;
  const segs = armarSegmentos(carta.tiempo, fpp);
  // Tramos: una linea fila -> hora. Un segmento que cae sobre la misma linea (un stop que entra justo en filas) no gasta tramo.
  // Cuando el BPM baja el desfase da negativo: el motor lo divide con signo (0x28fb6, sar + idiv), asi que anda.
  const tramos = []; let aplanado = false;
  for (const s of segs) {
    const previo = tramos[tramos.length - 1];
    if (previo && Math.abs(previo.bpm - s.bpm) < EPS && Math.abs(previo.valor / 100 + s.fila / fpp * 60 / previo.bpm - s.hora) < 0.012) { s.tramo = previo; continue; }
    if (tramos.length >= TOPE_TRAMOS) { aplanado = true; s.tramo = null; continue; }
    const nuevo = { bpm: s.bpm, valor: Math.round((s.hora - s.fila / fpp * 60 / s.bpm) * 100), cambio: Math.round(s.hora * 100) };
    // un cambio antes de que arranque la musica, o a la misma hora que el anterior, reemplaza al anterior
    if (previo && nuevo.cambio <= (tramos.length > 1 ? previo.cambio : 0)) tramos[tramos.length - 1] = nuevo; else tramos.push(nuevo);
    s.tramo = nuevo;
  }
  const ultimoTramo = tramos[tramos.length - 1];
  const segDe = (beat) => { let k = 0; for (let i = 1; i < segs.length; i++) { const s = segs[i]; if (s.beat < beat - EPS || (Math.abs(s.beat - beat) <= EPS && (!s.pausa || s.despues))) k = i; else if (s.beat > beat + EPS) break; } return segs[k]; };
  const enSalto = (beat) => segs.some(s => s.saltoDesde !== undefined && beat >= s.saltoDesde - EPS && beat < s.beat - EPS);
  let saltadas = 0, corridas = 0, errorMax = 0, juntadas = 0, cortadas = 0, antes = 0;
  const filaDe = (beat) => {
    const s = segDe(beat), hora = s.hora + (beat - s.beat) * 60 / s.bpm, tr = s.tramo || ultimoTramo;
    const r = Math.round(s.tramo ? s.fila + (beat - s.beat) * fpp : (hora - tr.valor / 100) * tr.bpm / 60 * fpp);
    const err = Math.abs(tr.valor / 100 + r / fpp * 60 / tr.bpm - hora);
    if (err > 0.0075) corridas++;
    errorMax = Math.max(errorMax, err);
    return r;
  };
  const porFila = new Map(), largas = [], puestas = new Set(), tope = TOPE_FILAS - fpp * 2;
  // primero las largas: una flecha adentro de una larga del mismo panel no se puede jugar
  for (const n of carta.notas.filter(x => x.fin !== undefined).sort((a, b) => a.beat - b.beat)) {
    if (enSalto(n.beat)) { saltadas++; continue; }
    const d = filaDe(n.beat), h = Math.max(d, filaDe(n.fin));
    if (d < 0) { antes++; continue; }
    if (d >= tope) { cortadas++; continue; }
    if (largas.some(l => l[0] === n.col && l[2] >= d && l[1] <= h)) { juntadas++; continue; }
    if (h === d) porFila.set(d, (porFila.get(d) || 0) | (1 << n.col)); else largas.push([n.col, d, Math.min(h, tope)]);
  }
  for (const n of carta.notas.filter(x => x.fin === undefined)) {
    if (enSalto(n.beat)) { saltadas++; continue; }
    const r = filaDe(n.beat), clave = r * 10 + n.col;
    if (r < 0) { antes++; continue; }
    if (r >= tope) { cortadas++; continue; }
    if (puestas.has(clave) || largas.some(l => l[0] === n.col && r >= l[1] && r <= l[2])) { juntadas++; continue; }
    puestas.add(clave); porFila.set(r, (porFila.get(r) || 0) | (1 << n.col));
  }
  const notas = [];
  for (const [r, m] of porFila) for (let c = 0; c < 10; c++) if (m & (1 << c)) notas.push([r, c]);
  notas.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!notas.length && !largas.length) throw new Error('no quedo ninguna flecha para jugar');
  let ultima = 0; for (const n of notas) ultima = Math.max(ultima, n[0]); for (const l of largas) ultima = Math.max(ultima, l[2]);

  const avisos = [];
  if (inf.minas) avisos.push(`${inf.minas} minas descartadas`);
  if (inf.falsas) avisos.push(`${inf.falsas} flechas falsas descartadas`);
  if (inf.sonidos) avisos.push(`${inf.sonidos} sonidos automaticos descartados`);
  if (inf.raras) avisos.push(`${inf.raras} notas especiales descartadas`);
  if (inf.rolls) avisos.push(`${inf.rolls} rolls pasados a largas comunes`);
  if (inf.lifts) avisos.push(`${inf.lifts} lifts pasados a flechas comunes`);
  if (inf.pausas) avisos.push(`${inf.pausas} pausas: el tiempo va bien, pero la flecha no se congela`);
  if (saltadas) avisos.push(`${saltadas} notas adentro de un salto: no se pueden jugar`);
  if (antes) avisos.push(`${antes} notas antes de que arranque la musica: no se pueden jugar`);
  if (juntadas) avisos.push(`${juntadas} notas juntadas con otra`);
  if (cortadas) avisos.push(`${cortadas} notas cortadas: la tabla pasa las ${TOPE_FILAS} filas del juego`);
  if (!exacto || aplanado) avisos.push(`${aplanado ? `mas de ${TOPE_TRAMOS} cambios de BPM` : 'ritmo mas fino de lo que el juego marca'}: ${corridas} notas corridas, hasta ${Math.round(errorMax * 1000)} ms`);
  for (const e of inf.efectos) avisos.push(`${e}: se ignora`);

  return { titulo: carta.titulo, artista: carta.artista, descripcion: carta.descripcion, tipo: carta.tipo, modo: carta.modo, nivel: carta.nivel, audio: carta.audio, portada: carta.portada, banner: carta.banner,
    versus: carta.tipo === 'versus', doble: carta.tipo === 'doble', filasPorPulso: fpp, bpms: tramos.map(t => t.bpm), valores: tramos.map(t => t.valor), cambiosBpm: tramos.slice(1).map(t => t.cambio), numeroInterno: 0,
    notas, largas, ultimaFila: ultima, flechas: notas.length + largas.length, avisos };
}

// ---------- la entrada: nombre de archivo y bytes -> cartas convertidas. Las que no se pueden pasar quedan en .rechazadas ----------
export function importarPasos(nombre, bytes) {
  if (bytes.length > TOPE_ARCHIVO) throw new Error('el archivo es demasiado grande para ser de pasos');
  const e = ((/\.([a-z0-9]+)$/i.exec(nombre) || [])[1] || '').toLowerCase(), texto = decodificar(bytes);
  if (!['ksf', 'sm', 'ssc'].includes(e)) throw new Error('solo se aceptan .not, .ksf, .sm y .ssc');
  const cartas = e === 'ksf' ? leerKsf(texto, nombre) : e === 'sm' ? leerSm(texto) : leerSsc(texto);
  const salida = [], rechazadas = [];
  for (const c of cartas) {
    if (c.rechazada) { rechazadas.push(c.rechazada); continue; }
    try { salida.push(convertirCarta(c)); } catch (er) { rechazadas.push(er.message); }
  }
  if (!salida.length) {
    if (rechazadas.some(r => /^dance-/i.test(r))) throw new Error('este archivo no trae pasos de Pump (son de baile de 4 paneles)');
    throw new Error(rechazadas[0] || 'no encontre pasos en este archivo');
  }
  return { cartas: salida, rechazadas };
}

// ---------- la hora real de una fila y la fila de una hora, con todos los tramos (el editor; JUEGO_REGLAS 5) ----------
function tramoDeHora(e, cs) { const c = e.cambios || e.cambiosBpm || []; let s = 0; for (let i = 0; i < 9 && i + 1 < e.bpms.length; i++) { if (!(c[i] > 0) || (i && c[i] <= c[i - 1])) break; if (cs >= c[i]) s = i + 1; } return s; }
const fpp = (e) => e.porPulso || e.filasPorPulso;
export const filaDeHora = (e, seg) => { const s = tramoDeHora(e, seg * 100); return (seg - e.valores[s] / 100) * e.bpms[s] / 60 * fpp(e); };
export function horaDeFila(e, r) {
  const c = e.cambios || e.cambiosBpm || []; let s = 0;
  for (let i = 1; i < 10 && i < e.bpms.length; i++) { const hora = c[i - 1]; if (!(hora > 0) || (i > 1 && hora <= c[i - 2])) break; if (r >= (hora - e.valores[i]) / 100 * e.bpms[i] / 60 * fpp(e) - EPS) s = i; else break; }
  return e.valores[s] / 100 + r / fpp(e) * 60 / e.bpms[s];
}
