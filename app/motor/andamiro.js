// Motor de animacion de Andamiro (Pump It Up Extra, Piu.exe del 08/03/2001), traducido del codigo original.
// Explicacion completa, con las direcciones de cada funcion: investigacion\ANDAMIRO_MOTOR.md.
//
// Que hay aca (modulo ES, sin dependencias, anda en el navegador y en Node):
//   - Paquetes RES:  abrirRes(bytes)                       -> res_open 0x36970 / res_fopen 0x36BD4 / res_fgets 0x36CE0
//   - Sprites:       parsearSprite(nombre, bytes, opciones) -> 0x35320 (+ 0x34E04 TYPE, 0x34CB0 linea T de .sp2)
//   - Guiones BGA:   parsearBga(bytes, opciones)           -> 0x374A0 (con la memoria emulada, ver "desborde")
//   - Estado en t:   estadoObjeto / estadoBga / piezasDeSprite / quadsBga  (calculo puro, sin dibujar)
//   - Dibujo:        dibujarBga(gl, ...) repite UNA POR UNA las llamadas OpenGL del original (0x37750 -> 0x3779C
//                    -> 0x34794 -> 0x346C4) sobre cualquier objeto con la API de gl1.js (glPushMatrix, glTranslatef...).
//
// Convenciones del original:
//   - Pantalla 640x480. OpenGL con glOrtho(0,640,0,480,0,1): origen ABAJO a la izquierda, y hacia arriba.
//   - Los BGA y sus sprites usan coordenadas de pantalla con y hacia ABAJO (el codigo hace 480 - y).
//   - Las pantallas (titulo, seleccion...) dibujan piezas sueltas con y hacia ARRIBA (0x34618).
//   - Tiempo de un BGA: tics de 1/60 s (en el juego: reloj de 240 Hz / 4; en las demas pantallas: un tic por cuadro).

export const ANCHO = 640, ALTO = 480;
export const TIPO = Object.freeze({ NINGUNO: 0, TILE: 1, ANI: 2, PATTERN: 3 });
export const LIMITES = Object.freeze({ PIEZAS: 80, OBJETOS: 50, CLAVES: 300, TEXTURAS: 128, LINEA: 250, RES_ABIERTOS: 4, RES_BUFFER: 0x600000 });
// Tamanos de las estructuras en memoria (bytes), tal cual Piu.exe
export const TAM = Object.freeze({ PIEZA: 0x2c, SPRITE: 0xddc, CLAVE: 0x2c, OBJETO: 0x41b0, BGA: 0xcd478, CAB_BGA: 0x18,
  OBJ_NOMBRE: 0x00, OBJ_NCLAVES: 0x40, OBJ_SPRITE: 0x44, OBJ_CLAVES: 0xe20, SPR_PIEZAS: 0x1c });

const f32 = Math.fround;
const i16 = (v) => (v << 16) >> 16;
const UN_256 = f32(1 / 256);           // 0x3B800000, la constante de 0x1305BB / 0x1305DB / 0x1305FB
const DELIM = ' \t\r\n';               // 0x13BD60

// ---------------------------------------------------------------- utilidades de la biblioteca de C de Watcom
const texto = (b, ini = 0, fin = b.length) => { let s = ''; for (let i = ini; i < fin && b[i]; i++) s += String.fromCharCode(b[i]); return s; };
const aBytes = (d) => d == null ? null : d instanceof Uint8Array ? d : typeof d === 'string' ? Uint8Array.from(d, (c) => c.charCodeAt(0) & 255) : new Uint8Array(d.buffer ?? d, d.byteOffset ?? 0, d.byteLength ?? d.length);

/** stricmp de Watcom (0x10E5CE): solo pasa A-Z a minuscula. */
export function stricmp(a, b) {
  for (let i = 0; ; i++) {
    let x = i < a.length ? a.charCodeAt(i) & 255 : 0, y = i < b.length ? b.charCodeAt(i) & 255 : 0;
    if (x >= 65 && x <= 90) x += 32; if (y >= 65 && y <= 90) y += 32;
    if (x !== y || !y) return x - y;
  }
}
/** atoi de Watcom (0x10E859): blancos, signo, digitos; desborda como int de 32 bits. atoi(NULL) se toma como 0. */
export function atoi(s) {
  if (s == null) return 0;
  let i = 0; while (i < s.length && ' \t\n\v\f\r'.includes(s[i])) i++;
  const neg = s[i] === '-'; if (s[i] === '+' || s[i] === '-') i++;
  let v = 0; while (i < s.length && s[i] >= '0' && s[i] <= '9') { v = (Math.imul(v, 10) + (s.charCodeAt(i) - 48)) | 0; i++; }
  return neg ? (-v | 0) : v;
}
/** strtok sobre una copia de la linea (como la del original, con estado). */
class Strtok {
  constructor(s) { this.s = s; this.p = 0; }
  sig(delim = DELIM) {
    const s = this.s; while (this.p < s.length && delim.includes(s[this.p])) this.p++;
    if (this.p >= s.length) return null;
    const ini = this.p; while (this.p < s.length && !delim.includes(s[this.p])) this.p++;
    const t = s.slice(ini, this.p); if (this.p < s.length) this.p++; return t;
  }
}
/** 0x2E7AC: lo que queda despues de la ultima '\'. */
export const nombreBase = (n) => n.slice(n.lastIndexOf('\\') + 1);
/** 0x2E758: reemplaza desde el PRIMER punto por la extension nueva (si no hay punto, no cambia nada). */
export function cambiarExtension(n, ext) { const p = n.indexOf('.'); return p < 0 ? n : n.slice(0, p) + ext; }
/** Archivo que abre tex_load (0x338BC) para una textura: primero NOMBRE.PNG y, si no esta, NOMBRE.PTX. */
export const archivosTextura = (n) => [cambiarExtension(n, '.PNG'), cambiarExtension(n, '.PTX')];

/** Adler-32 (0x36854). */
export function adler32(b, ini = 0, n = b.length - ini) {
  let a = 1, c = 0;
  for (let i = ini, f = ini + n; i < f; i++) { a = (a + b[i]) % 65521; c = (c + a) % 65521; }
  return ((c << 16) | a) >>> 0;
}
/** XOR de Andamiro (0x3689C): k arranca en 0xD2 y suma 0x95 por byte. Cambia el arreglo en el lugar. */
export function xorAndamiro(b, ini = 0, n = b.length - ini) {
  let k = 0xd2; for (let i = ini, f = ini + n; i < f; i++) { b[i] ^= k; k = (k + 0x95) & 255; }
  return b;
}

// ---------------------------------------------------------------- paquetes RES (res_open 0x36970)
/**
 * Abre un paquete RES de Andamiro igual que res_open:
 *  cabecera 24 bytes: "RES\0", u32 version (2), u32 cantidad, u32 tamDatos, u32 adler del indice descifrado
 *  (el juego no lo mira), u32 adler de los datos CIFRADOS (si no coincide suma un error en 0x1CA6B4 y sigue).
 *  Indice: cantidad x 28 bytes (nombre[16], tam, pos desde el comienzo de los datos, adler del archivo descifrado),
 *  cifrado como UN solo flujo. Cada archivo se descifra aparte (la llave vuelve a 0xD2). Si el adler de un archivo
 *  no coincide, el juego le borra el nombre: queda imposible de encontrar.
 */
export function abrirRes(bytes) {
  const b = aBytes(bytes);
  if (b.length < 24) throw new Error('RES: archivo demasiado corto');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const firma = texto(b, 0, 4);
  if (firma !== 'RES') throw new Error('RES: no empieza con RES\\0');
  const version = dv.getUint32(4, true), cantidad = dv.getUint32(8, true), tamDatos = dv.getUint32(12, true);
  const adlerIndice = dv.getUint32(16, true), adlerDatos = dv.getUint32(20, true);
  const finIndice = 24 + cantidad * 28;
  if (finIndice > b.length) throw new Error('RES: indice cortado');
  const indice = new Uint8Array(cantidad * 28); indice.set(b.subarray(24, finIndice)); xorAndamiro(indice);
  const datos = new Uint8Array(tamDatos); datos.set(b.subarray(finIndice, Math.min(b.length, finIndice + tamDatos)));
  const datosOk = adler32(datos) === adlerDatos;
  const di = new DataView(indice.buffer, indice.byteOffset, indice.byteLength);
  const archivos = [];
  for (let e = 0; e < cantidad; e++) {
    const o = e * 28;
    const a = { nombre: texto(indice, o, o + 16), tam: di.getUint32(o + 16, true), pos: di.getUint32(o + 20, true), adler: di.getUint32(o + 24, true), ok: true };
    if (a.pos + a.tam > tamDatos) { a.ok = false; a.nombreOriginal = a.nombre; a.nombre = ''; archivos.push(a); continue; }
    xorAndamiro(datos, a.pos, a.tam);
    if (adler32(datos, a.pos, a.tam) !== a.adler) { a.ok = false; a.nombreOriginal = a.nombre; a.nombre = ''; }  // memset(nombre,0,16) en 0x36B9E
    archivos.push(a);
  }
  return {
    version, cantidad, tamDatos, adlerIndice, adlerIndiceOk: adler32(indice) === adlerIndice, adlerDatos, datosOk,
    excedeBuffer: tamDatos > LIMITES.RES_BUFFER, archivos,
    /** res_fopen (0x36BD4): busqueda lineal con stricmp, el primero que coincide. */
    buscar(nombre) { return archivos.find((a) => a.nombre && stricmp(a.nombre, nombre) === 0) || null; },
    leer(nombre) { const a = this.buscar(nombre); return a ? datos.subarray(a.pos, a.pos + a.tam) : null; },
  };
}

/**
 * Lineas tal como las entrega res_fgets (0x36CE0) con tope 250: corta en '\r' (que se vuelve '\n' y SALTEA el byte
 * siguiente, que se supone '\n'), en un byte 0 o al final. Un resultado de largo 0 termina la lectura.
 */
export function lineasRes(bytes, tope = LIMITES.LINEA) {
  const b = aBytes(bytes), lineas = [];
  let pos = 0;
  for (;;) {
    let i = 0, p = pos, s = '', largo;
    for (;;) {
      if (p >= b.length) { largo = i; pos += i; break; }
      const c = b[p];
      if (c === 0) { largo = i; pos += i; break; }
      if (c === 13) { s += '\n'; largo = i + 1; pos += i + 2; break; }
      s += String.fromCharCode(c); p++; i++;
      if (i >= tope) { largo = i; pos += i; break; }
    }
    if (!largo) return lineas;
    lineas.push(s);
  }
}

// ---------------------------------------------------------------- sprites .spr / .sp2 / .tga (0x35320)
function piezaVacia() { return { nombre: '', textura: '', archivo: '', indiceTextura: 0, x0: 0, y0: 0, x1: 0, y1: 0, u0: 0, v0: 0, u1: 0, v1: 0, crudo: null }; }

/** TYPE (0x34E04): pone modo y dims en 0 y despues el tipo; PATTERN lee tres enteros. */
function leerTipo(spr, tk) {
  spr.patron.modo = 0; spr.patron.crudo = 0;
  const t = tk.sig();
  if (t != null && stricmp(t, 'TILE') === 0) spr.tipo = TIPO.TILE;
  else if (t != null && stricmp(t, 'ANI') === 0) spr.tipo = TIPO.ANI;
  else if (t != null && stricmp(t, 'PATTERN') === 0) {
    spr.tipo = TIPO.PATTERN;
    spr.patron.modo = atoi(tk.sig());
    const a = atoi(tk.sig()), c = atoi(tk.sig());
    spr.patron.crudo = ((a << 16) + c) | 0;
  } else spr.tipo = TIPO.NINGUNO;
  spr.patron.columnas = spr.patron.crudo >> 16;      // se lee con sar 16
  spr.patron.filas = spr.patron.crudo & 0xff;         // se lee con and 0xFF
}

/**
 * Lee un sprite como sprite_load (0x35320). La extension decide el formato (comparando sin mayusculas):
 *  - "tga": una sola pieza con la textura entera (x 0..ancho, y 0..alto, uv 0..1), TILE.
 *  - "spr": lineas "T textura x y ancho alto s0 t0 s1 t1" (s1,t1 son la ESQUINA, no el tamano) y uv = s*(256 div ancho)/256.
 *           Si la textura no carga o mide 0, la linea se saltea.
 *  - "sp2": lineas "T nombre textura x y ancho alto s t ancho alto" y uv = s/256 SIEMPRE (supone texturas de 256).
 *  - TYPE TILE|ANI|PATTERN modo columnas filas;  NUM n: el numero se IGNORA, solo borra las 80 piezas.
 * opciones.textura(nombre) -> { ancho, alto, indice? } | null : datos de la textura (como la tabla de 0x2B4B0C).
 *   Sin esta funcion se supone 256x256 (lo de casi todas). Para .spr, null = la textura no cargo.
 * Devuelve { nombre, formato, tipo, num, patron:{modo,columnas,filas,crudo}, piezas:[...], ok, avisos:[] }.
 */
export function parsearSprite(nombre, bytes, opciones = {}) {
  const texInfo = opciones.textura || null;
  const spr = { nombre, formato: '', tipo: TIPO.NINGUNO, num: 0, patron: { modo: 0, columnas: 0, filas: 0, crudo: 0 },
    piezas: [], ok: false, avisos: [], nombreGuardado: '', huboTipo: false, huboNum: false };
  const pieza = (i) => { while (spr.piezas.length <= i) spr.piezas.push(piezaVacia()); return spr.piezas[i]; };
  const borrarPiezas = () => { spr.huboNum = true; for (let i = 0; i < spr.piezas.length; i++) spr.piezas[i] = piezaVacia(); };
  const tk0 = new Strtok(nombre);
  tk0.sig('.');
  const ext = tk0.sig(' .');
  const fmt = ext == null ? '' : stricmp(ext, 'tga') === 0 ? 'tga' : stricmp(ext, 'spr') === 0 ? 'spr' : stricmp(ext, 'sp2') === 0 ? 'sp2' : '';
  spr.formato = fmt;
  if (!fmt) { spr.avisos.push(`extension desconocida: ${nombre}`); return spr; }   // 0x3587A: devuelve 0 sin copiar el nombre

  if (fmt === 'tga') {
    borrarPiezas();
    const inf = texInfo ? texInfo(nombre) : { ancho: 256, alto: 256 };
    if (!inf) { spr.avisos.push(`no carga la textura ${nombre}`); spr.nombreGuardado = nombreBase(nombre).slice(0, 16); return spr; }
    const p = pieza(0);
    Object.assign(p, { textura: nombre, archivo: archivosTextura(nombre)[0], indiceTextura: inf.indice ?? 0, x0: 0, y0: 0, x1: i16(inf.ancho), y1: i16(inf.alto), u0: 0, v0: 0, u1: 1, v1: 1 });
    spr.num = 1; spr.tipo = TIPO.TILE; spr.ok = true; return spr;
  }
  if (bytes == null) { spr.avisos.push(`falta el archivo ${nombre}`); spr.nombreGuardado = nombreBase(nombre).slice(0, 16); return spr; }

  for (const linea of lineasRes(bytes)) {
    const tk = new Strtok(linea);
    const t0 = tk.sig(); if (t0 == null) continue;
    if (stricmp(t0, 'T') === 0) {
      const n = spr.num;
      if (n >= LIMITES.PIEZAS) spr.avisos.push(`mas de 80 piezas (el original pisa memoria): pieza ${n}`);
      if (fmt === 'spr') {                                  // 0x354F2
        const tex = tk.sig();
        if (tex == null) { spr.avisos.push('linea T sin textura (el original llamaria tex_load(NULL))'); continue; }
        const inf = texInfo ? texInfo(tex) : { ancho: 256, alto: 256 };
        if (!inf) { spr.avisos.push(`linea salteada: no carga la textura ${tex}`); continue; }
        const W = inf.ancho | 0, H = inf.alto | 0;
        if (!W || !H) { spr.avisos.push(`linea salteada: textura ${tex} de tamano 0`); continue; }
        const qW = Math.trunc(256 / W), qH = Math.trunc(256 / H);
        if (!qW || !qH) spr.avisos.push(`textura ${tex} de mas de 256: el original calcula uv = 0`);
        const p = pieza(n);
        const x = atoi(tk.sig()), y = atoi(tk.sig()), w = atoi(tk.sig()), h = atoi(tk.sig());
        const s0 = atoi(tk.sig()), t0b = atoi(tk.sig()), s1 = atoi(tk.sig()), t1 = atoi(tk.sig());
        p.textura = tex; p.archivo = archivosTextura(tex)[0]; p.indiceTextura = inf.indice ?? 0;
        p.x0 = i16(x); p.y0 = i16(y); p.x1 = i16(p.x0 + w); p.y1 = i16(p.y0 + h);
        p.u0 = f32(Math.imul(s0, qW) * UN_256); p.v0 = f32(Math.imul(t0b, qH) * UN_256);
        p.u1 = f32(Math.imul(s1, qW) * UN_256); p.v1 = f32(Math.imul(t1, qH) * UN_256);
        p.crudo = [x, y, w, h, s0, t0b, s1, t1];
        spr.num = n + 1;
      } else {                                              // 0x34CB0 (.sp2): no controla nada
        const p = pieza(n);
        p.nombre = tk.sig() ?? '';
        const tex = tk.sig();
        const inf = tex == null ? null : texInfo ? texInfo(tex) : { ancho: 256, alto: 256 };
        if (!inf) spr.avisos.push(`pieza ${n}: no carga la textura ${tex} (el original guarda -1 y la dibuja igual)`);
        else if (inf.ancho !== 256 || inf.alto !== 256) spr.avisos.push(`pieza ${n}: textura ${tex} de ${inf.ancho}x${inf.alto}, uv calculadas como si fuera 256x256 (igual que el original)`);
        const x = atoi(tk.sig()), y = atoi(tk.sig()), w = atoi(tk.sig()), h = atoi(tk.sig());
        const s = atoi(tk.sig()), t = atoi(tk.sig()), sw = atoi(tk.sig()), sh = atoi(tk.sig());
        p.textura = tex ?? ''; p.archivo = tex ? archivosTextura(tex)[0] : ''; p.indiceTextura = inf ? (inf.indice ?? 0) : -1;
        p.x0 = i16(x); p.y0 = i16(y); p.x1 = i16(w + p.x0); p.y1 = i16(p.y0 + h);
        p.u0 = f32(s * UN_256); p.v0 = f32(t * UN_256);
        p.u1 = f32(f32(sw * UN_256) + p.u0); p.v1 = f32(f32(sh * UN_256) + p.v0);
        p.crudo = [x, y, w, h, s, t, sw, sh];
        spr.num = n + 1;
      }
    } else if (stricmp(t0, 'TYPE') === 0) { spr.huboTipo = true; leerTipo(spr, tk); }
    else if (stricmp(t0, 'NUM') === 0) { tk.sig(); borrarPiezas(); }       // el numero no se usa
  }
  spr.num = i16(spr.num);
  spr.ok = spr.num !== 0;
  if (!spr.ok) spr.nombreGuardado = nombreBase(nombre).slice(0, 16);      // 0x35766: solo si fallo
  return spr;
}

// ---------------------------------------------------------------- guiones .BGA (bga_load 0x374A0)
/** Nombre del guion dentro del paquete: 'BGA\70.dat' -> '506.BGA', 'BGA\10.dat' -> '501.BGA', 'BGA\72.dat' -> '308.BGA'. */
export function nombreGuion(rutaDat) {
  const esp = { 'BGA\\70.dat': '506.dat', 'BGA\\10.dat': '501.dat', 'BGA\\72.dat': '308.dat' };   // comparacion exacta (memcmp)
  const base = esp[rutaDat] ?? nombreBase(rutaDat);
  return cambiarExtension(base, '.BGA');
}

function leerClave(dv, o) {
  return { tiempo: dv.getInt16(o, true), visible: dv.getInt16(o + 2, true),
    x: dv.getFloat32(o + 4, true), y: dv.getFloat32(o + 8, true), cx: dv.getFloat32(o + 12, true), cy: dv.getFloat32(o + 16, true),
    escala: dv.getFloat32(o + 20, true), giro: dv.getFloat32(o + 24, true),
    r: dv.getFloat32(o + 28, true), g: dv.getFloat32(o + 32, true), b: dv.getFloat32(o + 36, true), a: dv.getFloat32(o + 40, true) };
}

/**
 * Escribe en la imagen de memoria lo que sprite_load deja en la estructura del sprite (para emular el desborde):
 * num=0 al entrar; TYPE escribe tipo, modo y dims; NUM borra las 80 piezas; cada T escribe su pieza (.spr no escribe
 * el nombre de la pieza); si fallo, copia el nombre (16 bytes). El numero de textura de cada pieza depende de la tabla
 * de texturas del momento: se usa pieza.indiceTextura (0 si no se sabe).
 */
function escribirSprite(mem, dv, o, spr) {
  const PZ = o + TAM.SPR_PIEZAS;
  const limpiar = () => mem.fill(0, PZ, PZ + LIMITES.PIEZAS * TAM.PIEZA);
  dv.setInt16(o + 0x12, 0, true);                                          // num = 0 al entrar
  if (!spr.formato) return;                                                // extension desconocida: nada mas
  if (spr.formato === 'tga') { limpiar(); if (spr.ok) { dv.setInt16(o + 0x10, TIPO.TILE, true); dv.setInt16(o + 0x12, 1, true); } }
  else {
    if (spr.huboNum) limpiar();
    if (spr.huboTipo) { dv.setInt16(o + 0x10, spr.tipo, true); dv.setInt32(o + 0x14, spr.patron.modo, true); dv.setInt32(o + 0x18, spr.patron.crudo, true); }
    dv.setInt16(o + 0x12, spr.num, true);
  }
  for (let i = 0; i < spr.piezas.length && i < LIMITES.PIEZAS; i++) {
    const p = spr.piezas[i], q = PZ + i * TAM.PIEZA;
    if (!p.crudo && spr.formato !== 'tga') continue;                        // pieza borrada por NUM: ya quedo en 0
    if (spr.formato === 'tga' && !spr.ok) continue;
    if (spr.formato === 'sp2') { mem.fill(0, q, q + 16); for (let k = 0; k < 16 && k < p.nombre.length; k++) mem[q + k] = p.nombre.charCodeAt(k) & 255; }   // (strcpy: un nombre largo seguiria pisando; despues tex_load pisa +0x10)
    dv.setInt32(q + 0x10, p.indiceTextura, true);
    dv.setInt16(q + 0x14, p.x0, true); dv.setInt16(q + 0x16, p.y0, true); dv.setInt16(q + 0x18, p.x1, true); dv.setInt16(q + 0x1a, p.y1, true);
    dv.setFloat32(q + 0x1c, p.u0, true); dv.setFloat32(q + 0x20, p.v0, true); dv.setFloat32(q + 0x24, p.u1, true); dv.setFloat32(q + 0x28, p.v1, true);
  }
  if (!spr.ok && spr.nombreGuardado != null && spr.formato !== '') {         // copia del nombre si fallo (16 bytes, strncpy)
    mem.fill(0, o, o + 16); for (let k = 0; k < 16 && k < spr.nombreGuardado.length; k++) mem[o + k] = spr.nombreGuardado.charCodeAt(k) & 255;
  }
}

/**
 * Lee un guion .BGA como bga_load (0x374A0). Formato (todo little endian):
 *   "BGA\0"; u32 -> bga+4 (BPM con que se armo); u32 -> bga+8; u32 -> bga+0   (el juego nunca los usa)
 *   y despues, para cada uno de los 50 objetos, en orden: nombre[64] del sprite, u32 cantidad de claves, claves x 44 bytes:
 *     i16 tiempo (tics de 1/60 s), i16 visible, f32 x, y, cx, cy, escala, giro (grados), r, g, b, a.
 *   Si el archivo se termina antes (los de 40 objetos), el resto queda en 0.
 * El original reserva 300 claves por objeto y NO controla el limite: si un objeto trae mas, las sobrantes caen encima
 * del objeto siguiente, que despues se pisa con su nombre, su cantidad y su sprite. Esto se emula: cada objeto trae
 * `claves` tal cual las ve el dibujo del original y `clavesArchivo` tal cual estan en el archivo.
 * opciones.sprites(nombre) -> sprite de parsearSprite | null : para emular tambien lo que escribe sprite_load
 *   (si no se pasa, solo se emula la lectura; alcanza para todos los casos del disco, ver ANDAMIRO_MOTOR.md).
 */
export function parsearBga(bytes, opciones = {}) {
  const b = aBytes(bytes);
  const EXTRA = 0x10000;                                                    // memoria que sigue a la estructura (en Piu.exe: 0x29D160...)
  const mem = new Uint8Array(TAM.BGA + EXTRA), dv = new DataView(mem.buffer);
  const fb = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 0;
  const fread = (dst, tam, n) => {                                          // res_fread 0x36D9C
    const total = tam * n; if (total <= 0) return 0;
    const k = Math.max(0, Math.min(total, b.length - pos, mem.length - dst));
    mem.set(b.subarray(pos, pos + k), dst); pos += k; return k;
  };
  const firma = texto(b, 0, Math.min(4, b.length));
  pos = Math.min(4, b.length);                                              // la firma va a una variable aparte (0x3077EC) y no se controla
  fread(4, 4, 1); fread(8, 4, 1); fread(0, 4, 1);
  const clavesArchivo = [];
  for (let i = 0; i < LIMITES.OBJETOS; i++) {
    const o = TAM.CAB_BGA + i * TAM.OBJETO;
    const p0 = pos;
    fread(o + TAM.OBJ_NOMBRE, 64, 1);
    fread(o + TAM.OBJ_NCLAVES, 4, 1);
    const n = dv.getInt32(o + TAM.OBJ_NCLAVES, true);
    const pk = pos;
    fread(o + TAM.OBJ_CLAVES, TAM.CLAVE, n);
    const lista = [];
    for (let k = 0; n > 0 && k < n && pk + (k + 1) * TAM.CLAVE <= b.length; k++) lista.push(leerClave(fb, pk + k * TAM.CLAVE));
    clavesArchivo.push({ nombre: texto(b, p0, Math.min(b.length, p0 + 64)), claves: lista });
  }
  const sobra = b.length - pos;
  // sprite_load de los 50 objetos, despues de leer todo (0x3771C)
  const sprites = [];
  for (let i = 0; i < LIMITES.OBJETOS; i++) {
    const o = TAM.CAB_BGA + i * TAM.OBJETO;
    const nombre = texto(mem, o, o + 64);
    const spr = opciones.sprites ? opciones.sprites(nombre) : null;
    sprites.push(spr);
    if (spr) escribirSprite(mem, dv, o + TAM.OBJ_SPRITE, spr);
  }
  const objetos = [];
  const avisos = [];
  for (let i = 0; i < LIMITES.OBJETOS; i++) {
    const o = TAM.CAB_BGA + i * TAM.OBJETO;
    const n = dv.getInt32(o + TAM.OBJ_NCLAVES, true);
    const claves = [];
    for (let k = 0; k < n; k++) {
      const q = o + TAM.OBJ_CLAVES + k * TAM.CLAVE;
      if (q + TAM.CLAVE > mem.length) { avisos.push(`objeto ${i}: clave ${k} fuera de la memoria emulada`); break; }
      claves.push(leerClave(dv, q));
    }
    const desbordadas = Math.max(0, n - LIMITES.CLAVES);
    if (desbordadas) avisos.push(`objeto ${i} (${texto(mem, o, o + 64)}): ${n} claves, ${desbordadas} pasan el limite de 300 y quedan pisadas como en el original`);
    if (desbordadas && i === LIMITES.OBJETOS - 1) avisos.push(`objeto 49 desborda fuera de la estructura (en Piu.exe pisa la tabla de BPM 0x29D160)`);
    objetos.push({ indice: i, sprite: texto(mem, o, o + 64), spriteArchivo: clavesArchivo[i].nombre, nclaves: n, claves,
      clavesArchivo: clavesArchivo[i].claves, desbordadas, datosSprite: sprites[i] });
  }
  const cab = new DataView(mem.buffer, 0, 12);
  return { firma, firmaOk: firma === 'BGA', cabecera: { campo0: cab.getInt32(0, true), bpm: cab.getInt32(4, true), campo8: cab.getInt32(8, true) },
    objetos, bytesSobrantes: sobra, avisos };
}

/**
 * Guion listo para estadoBga / quadsBga / dibujarBga, con sus sprites cargados como en bga_load:
 *   leer(nombre) -> bytes | null       (buscar en el paquete SIN mayusculas y sin recortar espacios, como res_fopen)
 *   textura(nombre) -> { ancho, alto, indice? } | null
 * Un nombre de sprite con un espacio al final ('x.spr ') se reconoce como .spr pero no se encuentra: igual que en la cabina.
 */
export function armarBga(bytesBga, { leer = () => null, textura } = {}) {
  const cache = new Map();
  const sprites = (nombre) => {
    if (!cache.has(nombre)) {
      const tk = new Strtok(nombre); tk.sig('.'); const ext = tk.sig(' .');
      const conArchivo = ext != null && (stricmp(ext, 'spr') === 0 || stricmp(ext, 'sp2') === 0);
      cache.set(nombre, parsearSprite(nombre, conArchivo ? leer(nombre) : null, { textura }));
    }
    return cache.get(nombre);
  };
  return parsearBga(bytesBga, { sprites });
}

// ---------------------------------------------------------------- estado en un tiempo t (calculo puro)
/** Fundido global (0x37488): multiplica r,g,b por `rgb` y a por `alfa`. El juego lo deja en (1,1) salvo en la nota. */
export const FUNDIDO_NORMAL = Object.freeze({ rgb: 1, alfa: 1 });

/**
 * Lo que hace 0x3779C/0x37183 con un objeto en el tic t (entero). Devuelve null si no se dibuja.
 * { k0, k1, fase, x, y, cx, cy, escala, giro, r, g, b, a, terminado } — fase = fraccion entre las dos claves (0..1),
 * que es el "t" que recibe el sprite (cuadro de ANI, corrimiento de PATTERN).
 */
export function estadoObjeto(obj, t, fundido = FUNDIDO_NORMAL) {
  const K = obj.claves, n = K.length;
  if (!n) return null;
  if (t < K[0].tiempo) return null;
  let k = 0; while (k < n && !(K[k].tiempo > t)) k++;
  if (k === n) return null;                                                 // paso la ultima clave: ya no se dibuja (devuelve 1)
  const G = f32(fundido.rgb), A = f32(fundido.alfa);
  if (k === 0) {                                                            // inalcanzable en la practica (0x371C3), se traduce igual
    const c = K[0]; if (!c.visible) return null;
    return { k0: 0, k1: 0, fase: 0, x: c.x, y: c.y, cx: c.cx, cy: c.cy, escala: c.escala, giro: c.giro,
      r: f32(c.r * G), g: f32(c.g * G), b: f32(c.b * G), a: f32(c.a * A) };
  }
  const a = K[k - 1], c = K[k];
  if (!a.visible) return null;
  const f = f32((t - a.tiempo) / (c.tiempo - a.tiempo));
  const L = (u, v) => u + (v - u) * f;
  return { k0: k - 1, k1: k, fase: f,
    x: f32(L(a.x, c.x)), y: f32(L(a.y, c.y)), cx: a.cx, cy: a.cy,           // el pivote NO se interpola: es el de k0
    escala: f32(L(a.escala, c.escala)), giro: f32(L(a.giro, c.giro)),
    r: f32(L(a.r, c.r) * G), g: f32(L(a.g, c.g) * G), b: f32(L(a.b, c.b) * G), a: f32(L(a.a, c.a) * A) };
}

/** Todos los objetos que se dibujan en el tic t, en el orden del original (0 primero, 49 arriba). t < 0 cuenta como 0. */
export function estadoBga(bga, t, fundido = FUNDIDO_NORMAL) {
  const tt = t < 0 ? 0 : t | 0, out = [];
  for (const obj of bga.objetos) { const e = estadoObjeto(obj, tt, fundido); if (e) out.push({ objeto: obj, estado: e }); }
  return out;
}

/**
 * Que piezas dibuja 0x34794 para un sprite con fase `fase` (0..1). Cada elemento: { geometria, textura, dx, dy }:
 *  geometria/textura = indices de pieza (PATTERN usa la geometria y las uv de la pieza 0 con la textura de otra),
 *  dx, dy = corrimiento de la celda en coordenadas del sprite (y hacia abajo).
 */
export function piezasDeSprite(spr, fase) {
  const num = spr.num, out = [];
  if (num <= 0) return out;                                                 // (el original leeria basura antes de la pieza 0)
  if (spr.tipo === TIPO.ANI) {
    let c = Math.trunc(num * f32(fase));                                    // fild num; fmul t (sin redondear); __CHP trunca; fistp
    if (!(num > c)) c = num - 1;
    out.push({ geometria: c, textura: c, dx: 0, dy: 0 });
  } else if (spr.tipo === TIPO.PATTERN) {
    const cols = spr.patron.columnas, filas = spr.patron.filas;
    const p0 = spr.piezas[0] || piezaVacia();
    const W = p0.x1, H = p0.y1;                                             // paso de la grilla = esquina de la pieza 0
    const corr = Math.trunc(num * f32(1 - f32(fase)));
    const idx = (i) => { const r = (corr + i) % num; return r; };          // idiv: resto con signo
    if (spr.patron.modo !== 0) {                                            // por columnas
      for (let c = 0; c < cols; c++) for (let f = 0; f < filas; f++) out.push({ geometria: 0, textura: idx(c * filas + f), dx: c * W, dy: f * H });
    } else {                                                                // por filas
      for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++) out.push({ geometria: 0, textura: idx(f * cols + c), dx: c * W, dy: f * H });
    }
  } else {
    for (let i = num - 1; i >= 0; i--) out.push({ geometria: i, textura: i, dx: 0, dy: 0 });   // de la ultima a la primera
  }
  return out;
}

/**
 * Matriz afin (pantalla con y hacia abajo) que arma 0x37183: punto del sprite (px,py) -> pantalla.
 * X = x + cx + e*((px-cx)*cos + (py-cy)*sen);  Y = y + cy + e*(-(px-cx)*sen + (py-cy)*cos)   (giro en grados, antihorario)
 * Devuelve [a, b, c, d, e, f] con X = a*px + c*py + e, Y = b*px + d*py + f.
 */
export function matrizObjeto(est) {
  const th = est.giro * Math.PI / 180, co = Math.cos(th), se = Math.sin(th), s = est.escala;
  const a = s * co, b = -s * se, c = s * se, d = s * co;
  const e = est.x + est.cx - a * est.cx - c * est.cy, f = est.y + est.cy - b * est.cx - d * est.cy;
  return [a, b, c, d, e, f];
}

/** Los cuadrilateros del tic t, listos para cualquier dibujante: { textura, archivo, puntos:[[X,Y,u,v] x4], color:[r,g,b,a], objeto } */
export function quadsBga(bga, t, fundido = FUNDIDO_NORMAL) {
  const out = [];
  for (const { objeto, estado } of estadoBga(bga, t, fundido)) {
    const spr = objeto.datosSprite; if (!spr) continue;
    const [a, b, c, d, e, f] = matrizObjeto(estado);
    const P = (px, py, u, v) => [a * px + c * py + e, b * px + d * py + f, u, v];
    for (const el of piezasDeSprite(spr, estado.fase)) {
      const g = spr.piezas[el.geometria], tx = spr.piezas[el.textura]; if (!g || !tx) continue;
      const x0 = g.x0 + el.dx, x1 = g.x1 + el.dx, y0 = g.y0 + el.dy, y1 = g.y1 + el.dy;
      out.push({ objeto: objeto.indice, textura: tx.textura, archivo: tx.archivo, color: [estado.r, estado.g, estado.b, estado.a],
        puntos: [P(x0, y0, g.u0, g.v0), P(x1, y0, g.u1, g.v0), P(x1, y1, g.u1, g.v1), P(x0, y1, g.u0, g.v1)] });
    }
  }
  return out;
}

/**
 * Tic del BGA durante una cancion (0x2C484): t240 = reloj de 240 Hz desde que arranca la musica (en la cabina, un
 * temporizador de 240 Hz corregido con los cuadros MP3 que decodifica la placa; en la PC: segundos de audio * 240).
 * Si se juega la version R (mas rapida), el tic se multiplica por bpmActual / bpmOriginal (0x2C542).
 */
export function ticBgaCancion(t240, bpmActual = null, bpmOriginal = null) {
  let t = t240 < 0 ? 0 : t240 | 0;
  t = (t / 4) | 0;                                                          // division entera hacia cero
  if (bpmActual != null && bpmOriginal) t = Math.trunc(t * f32(bpmActual) / f32(bpmOriginal));
  return t;
}

// ---------------------------------------------------------------- dibujo con las mismas llamadas OpenGL
// `gl` es cualquier objeto con la API de gl1.js (glPushMatrix, glTranslatef, glBindTexture...).
// `idGL(pieza)` devuelve el numero de textura de OpenGL de esa pieza (el que dio cargarTextura).
const GL_QUADS = 7, GL_TEXTURE_2D = 0x0de1;

/** 0x346C4: pieza con y hacia abajo (480 - y). */
export function dibujarPiezaInvertida(gl, p) {
  gl.glBegin(GL_QUADS);
  gl.glTexCoord2f(p.u0, p.v0); gl.glVertex2i(p.x0, ALTO - p.y0);
  gl.glTexCoord2f(p.u1, p.v0); gl.glVertex2i(p.x1, ALTO - p.y0);
  gl.glTexCoord2f(p.u1, p.v1); gl.glVertex2i(p.x1, ALTO - p.y1);
  gl.glTexCoord2f(p.u0, p.v1); gl.glVertex2i(p.x0, ALTO - p.y1);
  gl.glEnd();
}
/** 0x34618: pieza con y hacia arriba (la usan titulo, seleccion, notas...). */
export function dibujarPiezaDerecha(gl, p) {
  gl.glBegin(GL_QUADS);
  gl.glTexCoord2f(p.u0, p.v0); gl.glVertex2i(p.x0, p.y1);
  gl.glTexCoord2f(p.u1, p.v0); gl.glVertex2i(p.x1, p.y1);
  gl.glTexCoord2f(p.u1, p.v1); gl.glVertex2i(p.x1, p.y0);
  gl.glTexCoord2f(p.u0, p.v1); gl.glVertex2i(p.x0, p.y0);
  gl.glEnd();
}
/** 0x346A0: enlaza la textura de la pieza y la dibuja derecha. */
export function dibujarPieza(gl, p, idGL) { gl.glBindTexture(GL_TEXTURE_2D, idGL(p)); dibujarPiezaDerecha(gl, p); }
/** 0x33490: pieza centrada en (x,y) (y hacia arriba). */
export function dibujarPiezaCentrada(gl, x, y, p, idGL) {
  gl.glPushMatrix(); gl.glTranslatef(f32(x - ((p.x1 / 2) | 0)), f32(y - ((p.y1 / 2) | 0)), 0); dibujarPieza(gl, p, idGL); gl.glPopMatrix();
}
/** 0x334F4: pieza centrada y escalada. */
export function dibujarPiezaEscalada(gl, x, y, p, escala, idGL) {
  const s = f32(escala);
  gl.glPushMatrix(); gl.glTranslatef(f32(x - p.x1 * s * 0.5), f32(y - p.y1 * s * 0.5), 0); gl.glScalef(s, s, 1); dibujarPieza(gl, p, idGL); gl.glPopMatrix();
}
/** 0x33630: pieza centrada con mezcla aditiva (glBlendFunc(1,1)) y vuelta a la normal. */
export function dibujarPiezaAditiva(gl, x, y, p, idGL) {
  gl.glPushMatrix(); gl.glTranslatef(f32(x - ((p.x1 / 2) | 0)), f32(y - ((p.y1 / 2) | 0)), 0);
  gl.glEnable(0x0be2); gl.glBlendFunc(1, 1); dibujarPieza(gl, p, idGL);
  gl.glEnable(0x0be2); gl.glBlendFunc(0x0302, 0x0303); gl.glPopMatrix();
}

/** 0x34794: dibuja un sprite con fase t (0..1) con las llamadas del original. */
export function dibujarSprite(gl, spr, t, idGL) {
  const P = spr.piezas, num = spr.num;
  if (spr.tipo === TIPO.ANI) {
    let c = Math.trunc(num * f32(t)); if (!(num > c)) c = num - 1;
    if (c < 0 || !P[c]) return;
    gl.glBindTexture(GL_TEXTURE_2D, idGL(P[c])); dibujarPiezaInvertida(gl, P[c]);
  } else if (spr.tipo === TIPO.PATTERN) {
    if (num <= 0 || !P[0]) return;
    const cols = spr.patron.columnas, filas = spr.patron.filas, W = P[0].x1, H = -P[0].y1;
    const corr = Math.trunc(num * f32(1 - f32(t)));
    if (spr.patron.modo !== 0) {
      for (let c = 0; c < cols; c++) { let y = 0; for (let f = 0; f < filas; f++) {
        gl.glPushMatrix(); gl.glTranslatef(c * W, y, 0);
        gl.glBindTexture(GL_TEXTURE_2D, idGL(P[(corr + c * filas + f) % num])); dibujarPiezaInvertida(gl, P[0]);
        y += H; gl.glPopMatrix(); } }
    } else {
      for (let f = 0; f < filas; f++) { let x = 0; for (let c = 0; c < cols; c++) {
        gl.glPushMatrix(); gl.glTranslatef(x, f * H, 0);
        gl.glBindTexture(GL_TEXTURE_2D, idGL(P[(corr + f * cols + c) % num])); dibujarPiezaInvertida(gl, P[0]);
        x += W; gl.glPopMatrix(); } }
    }
  } else {
    for (let i = num - 1; i >= 0; i--) { if (!P[i]) continue; gl.glBindTexture(GL_TEXTURE_2D, idGL(P[i])); dibujarPiezaInvertida(gl, P[i]); }
  }
}

/** 0x3779C + 0x37183: un objeto del guion en el tic t. Devuelve 1 si llego a dibujar o termino, 0 si no (como el original). */
export function dibujarObjeto(gl, obj, t, idGL, fundido = FUNDIDO_NORMAL) {
  const K = obj.claves; if (!K.length) return 0;
  if (t < K[0].tiempo) return 0;
  const e = estadoObjeto(obj, t, fundido);
  if (!e) { let k = 0; while (k < K.length && !(K[k].tiempo > t)) k++; return k === K.length ? 1 : 0; }
  gl.glPushMatrix();
  gl.glTranslatef(0, ALTO, 0);
  gl.glTranslatef(e.x, f32(-e.y), 0);
  gl.glTranslatef(e.cx, f32(-e.cy), 0);
  gl.glRotatef(e.giro, 0, 0, 1);
  gl.glScalef(e.escala, e.escala, 1);
  gl.glTranslatef(f32(-e.cx), e.cy, 0);
  gl.glTranslatef(0, -ALTO, 0);
  gl.glColor4fv([e.r, e.g, e.b, e.a]);
  if (obj.datosSprite) dibujarSprite(gl, obj.datosSprite, e.fase, idGL);
  gl.glPopMatrix();
  return 1;
}

/** 0x37750: los 50 objetos en orden, con t < 0 llevado a 0. */
export function dibujarBga(gl, bga, t, idGL, fundido = FUNDIDO_NORMAL) {
  const tt = t < 0 ? 0 : t | 0;
  for (const obj of bga.objetos) dibujarObjeto(gl, obj, tt, idGL, fundido);
}

/**
 * Parte OpenGL de tex_load (0x338BC): glPixelStorei(UNPACK_ALIGNMENT,1), glGenTextures, glBindTexture,
 * GL_CLAMP en s y t, GL_LINEAR en MAG y MIN, glTexImage2D con formato segun los canales del PNG
 * (1 -> GL_LUMINANCE, 3 -> GL_RGB, 4 -> GL_RGBA; formato interno = formato). Devuelve el id de OpenGL.
 * imagen = { ancho, alto, canales, pixeles: Uint8Array de ancho*alto*canales, filas de arriba hacia abajo }.
 */
export function cargarTextura(gl, imagen) {
  const fmt = imagen.canales === 4 ? 0x1908 : imagen.canales === 3 ? 0x1907 : imagen.canales === 1 ? 0x1909 : null;
  if (fmt == null) throw new Error(`textura de ${imagen.canales} canales: el original no le asigna formato`);
  if (gl.glPixelStorei) gl.glPixelStorei(0x0cf5, 1);
  const id = gl.glGenTextures(1)[0];
  gl.glBindTexture(GL_TEXTURE_2D, id);
  gl.glTexParameterf(GL_TEXTURE_2D, 0x2802, 0x2900);
  gl.glTexParameterf(GL_TEXTURE_2D, 0x2803, 0x2900);
  gl.glTexParameteri(GL_TEXTURE_2D, 0x2800, 0x2601);
  gl.glTexParameteri(GL_TEXTURE_2D, 0x2801, 0x2601);
  gl.glTexImage2D(GL_TEXTURE_2D, 0, fmt, imagen.ancho, imagen.alto, 0, fmt, 0x1401, imagen.pixeles);
  return id;
}

/** Estado de OpenGL que deja el arranque (0x20DCC) y que usa todo el motor de Andamiro. */
export function configurarGL(gl) {
  gl.glClearColor(0, 0, 0, 1);
  gl.glDisable(0x0b44);                 // GL_CULL_FACE
  gl.glDisable(0x0b71);                 // GL_DEPTH_TEST
  gl.glDepthFunc(0x0203);               // GL_LEQUAL
  gl.glEnable(0x0b57);                  // GL_COLOR_MATERIAL
  gl.glShadeModel(0x1d00);              // GL_FLAT
  gl.glEnable(0x0bd0);                  // GL_DITHER
  gl.glEnable(0x0be2);                  // GL_BLEND
  gl.glBlendFunc(0x0302, 0x0303);       // SRC_ALPHA, ONE_MINUS_SRC_ALPHA
  gl.glTexEnvi(0x2300, 0x2200, 0x2100); // GL_TEXTURE_ENV_MODE = GL_MODULATE
  gl.glEnable(GL_TEXTURE_2D);
  gl.glViewport(0, 0, ANCHO, ALTO);
  gl.glMatrixMode(0x1701); gl.glLoadIdentity(); gl.glOrtho(0, ANCHO, 0, ALTO, 0, 1);
  gl.glMatrixMode(0x1700); gl.glLoadIdentity();
}
