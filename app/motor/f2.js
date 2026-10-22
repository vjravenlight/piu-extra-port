// Formatos de F2 System (Pump It Up Extra, 2001): escenas .vsl, animaciones .tc, listas de cuadros .ifl,
// y los archivos de edicion que quedaron en el disco (.rhy, .nt, .jtx, .pix).
// Todo sale del codigo original, leido con radare2:
//   - VslView_v16.exe (el visor de escenas de F2, Win32 + OpenGL), direcciones 0x40xxxx.
//   - Piu.exe (el juego, DOS + Mesa + Voodoo), direcciones 0x3xxxx / 0x4xxxx (se abre con bin.relocs.apply=true).
// Explicacion completa, byte a byte y con lo que esta confirmado o deducido: investigacion\F2_FORMATOS.md.
//
// Modulo ES, sin dependencias: anda en el navegador y en Node. Las entradas binarias pueden ser ArrayBuffer,
// Uint8Array/Buffer o DataView; los textos (.ifl), string.
//
//   leerVSL(bytes)            guion de escena: lista de .tc y, por cuadro (60 por segundo), 3 capas {tc, cuadro}
//   leerTC(bytes)             animacion 3D: materiales (con texturas), objetos (triangulos) y una matriz por cuadro
//   leerIFL(texto)            lista de cuadros de una textura animada
//   armarEscena(vsl, fuente)  junta todo como lo hace el juego (tablas globales de materiales, "slots" y texturas)
//   estadoCuadro(escena, n)   que se dibuja en el cuadro n (calculo puro, sin OpenGL)
//   dibujarEscena(gl, ...)    repite UNA POR UNA las llamadas OpenGL del juego (0x40D28) sobre la API de gl1.js
//   crearTexturasGL(gl, ...)  sube las texturas como el juego (0x3DF94): 1555 sin mascara, 4444 con mascara
//   leerBMP / infoPNG / aplicarClaveNegra / mezclarMascara   las reglas de imagen del juego
//   leerJTX / leerNT / leerPIX / leerRHY   archivos que el juego NO lee (restos de las herramientas de F2)

// ------------------------------------------------------------------------------------------------ constantes

// Enumerados de OpenGL que usa el motor (los mismos numeros que gl1.js).
export const GL = Object.freeze({
  TRIANGLES: 0x0004, LINE_LOOP: 0x0002, ZERO: 0, ONE: 1, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303,
  BACK: 0x0405, FRONT_AND_BACK: 0x0408, CULL_FACE: 0x0B44, DEPTH_TEST: 0x0B71, BLEND: 0x0BE2, TEXTURE_2D: 0x0DE1,
  MODELVIEW: 0x1700, PROJECTION: 0x1701, AMBIENT: 0x1200, DIFFUSE: 0x1201, SPECULAR: 0x1202, EMISSION: 0x1600,
  SHININESS: 0x1601, TEXTURE_ENV: 0x2300, TEXTURE_ENV_MODE: 0x2200, MODULATE: 0x2100, TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_MIN_FILTER: 0x2801, TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, LINEAR: 0x2601, CLAMP: 0x2900,
  REPEAT: 0x2901, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, RGBA4: 0x8056, RGB5_A1: 0x8057, UNPACK_ALIGNMENT: 0x0CF5,
});

// Banderas del material (campo 0x20 del registro de material). Las que usa el codigo de dibujo (0x3FE54 / 0x4036E0):
export const BANDERA = Object.freeze({
  ALAMBRE: 0x004,  // glLineWidth(ancho de linea); en VslView ademas dibuja GL_LINE_LOOP (0x401DD0). Ningun .tc la usa.
  SUMA: 0x010,     // mezcla aditiva: glBlendFunc(GL_ONE, GL_ONE)
  ALFA: 0x020,     // mezcla por alfa: glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)
  CLAMP_S: 0x400,  // GL_TEXTURE_WRAP_S = GL_CLAMP (si no, GL_REPEAT)
  CLAMP_T: 0x800,  // GL_TEXTURE_WRAP_T = GL_CLAMP (si no, GL_REPEAT)
  // 0x002, 0x080, 0x200 aparecen en los archivos pero el codigo no las mira (vienen del exportador de 3D Studio).
});

// Camara fija de todas las escenas de F2 (Piu.exe 0x40D5F y 0x40D9D; VslView 0x401811, con floats en vez de doubles).
export const CAMARA = Object.freeze({
  fovy: 73.74,            // grados (double 0x40526F5C28F5C28F)
  aspecto: 1.3333,        // double 0x3FF55532617C1BDA (no es 4/3 exacto: 1.3333)
  cerca: 0.01, lejos: 15.0,
  ojo: [0, 0, 3.2], centro: [0, 0, -1], arriba: [0, 1, 0],
  // Consecuencia: en el plano z = 0 se ve x en [-3.2, 3.2] e y en [-2.4, 2.4]  ->  1 unidad = 100 pixeles de 640x480.
});

export const TIEMPO = Object.freeze({
  CUADROS_POR_SEGUNDO: 60,  // un registro del .vsl = 1/60 s (GetVisual 0x4010E0; Piu: reloj de 240 Hz / 4)
  TICS_POR_SEGUNDO: 240,    // reloj del juego (Piu 0x212BF: temporizador a 240.0 Hz)
  TICS_POR_CUADRO: 4,       // Piu 0x2C484: cuadro = tics / 4
  TICS_POR_CUADRO_MP3: 6.2688, // Piu 0x3D0FE: cada 256 cuadros MP3 entregados, reloj = cuadros * 6.2688 (float 0x40C89A02)
  CUADROS_APERTURA: 1020,   // la apertura (BGA\open.dat) avanza un cuadro por vuelta hasta 0x3FC (Piu 0x3AF8B)
});

export const UMBRAL_ALFA = 0x3F7D70A4;  // 0.99 en float; el juego compara los bits como entero con signo (0x3FF80)
const UN_TERCIO = Math.fround(1 / 3);   // 0x3EAAAAAB, la de sgl_MixImage (Piu 0x130CF7, VslView 0x4112AC)

// Limites de las tablas del original.
export const LIMITES = Object.freeze({ TCS: 99, MATERIALES: 500, SLOTS: 500, TEXTURAS: 500, LINEA_IFL: 100, LADO_PNG: 256 });

// ------------------------------------------------------------------------------------------------ utilidades

export function bytesDe(x) {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  throw new TypeError('se esperaba ArrayBuffer, Uint8Array o DataView');
}
const vistaDe = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

// Cadena C (latin1) de un campo de largo fijo: hasta el primer 0. Lo que sigue al 0 es basura de memoria del editor.
export function cadenaC(u8, ini, largo) {
  let s = '';
  for (let i = ini, fin = Math.min(u8.length, ini + largo); i < fin && u8[i] !== 0; i++) s += String.fromCharCode(u8[i]);
  return s;
}

// tolower de C: solo A-Z (los bytes coreanos quedan igual). El juego pasa a minusculas todos los nombres (0x401FF0 / 0x40B7C).
export const minusculas = (s) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

// Extension como la calcula el original (0x401F40): el nombre se parte en '.', la segunda parte incluye el punto
// y termina en el punto siguiente; una barra invertida vuelve a empezar la parte actual.
export function partesF2(nombre) {
  const partes = ['', ''];
  let k = 0;
  for (const c of nombre) {
    if (c === '.') { k++; if (k >= 2) break; }
    partes[k] += c;
    if (c === '\\') partes[k] = '';
  }
  return { base: partes[0], extension: k >= 1 ? partes[1] : '' };
}
export const extensionF2 = (nombre) => partesF2(nombre).extension;

// Nombres que prueba el juego para una imagen (Piu 0x3E09A): si la extension es .bmp, primero base + ".png" (asi
// venian empaquetadas; base = lo anterior al primer punto, sin carpetas) y despues el nombre tal cual.
// Cualquier otra extension da "sgl_Load_Image - is not yet loadable".
export function nombresImagen(nombre) {
  const n = minusculas(nombre);
  const { base, extension } = partesF2(n);
  if (extension !== '.bmp') return [];
  return [base + '.png', n];
}

const f32bits = new DataView(new ArrayBuffer(4));
const bitsDeFloat = (f) => { f32bits.setFloat32(0, f, true); return f32bits.getInt32(0, true); };

// ------------------------------------------------------------------------------------------------ .vsl

// Guion de escena. Lectura: VslView 0x4016E0, Piu 0x40C30. Escritura (compilador del editor): GetVisual 0x401420.
//   u32 cantidad de .tc (si es >= 100 el original la baja a 99 y NO saltea los nombres sobrantes)
//   cantidad x char[32] nombre del .tc (relleno con 0)
//   u32 cantidad de cuadros
//   cuadros x 12 bytes: i16 tc[3] (indice en la lista, -1 = capa vacia), i16 cuadroTC[3]
export function leerVSL(datos) {
  const u8 = bytesDe(datos), dv = vistaDe(u8);
  if (u8.length < 8) throw new Error('VSL: archivo demasiado corto');
  const declarados = dv.getInt32(0, true);
  let cantidad = declarados;
  if (cantidad >= 100) cantidad = LIMITES.TCS;          // cmp eax, 0x64 / jl  (0x40172B, Piu 0x40C73)
  const tcs = [];
  let p = 4;
  for (let i = 0; i < cantidad; i++, p += 32) {
    if (p + 32 > u8.length) throw new Error('VSL: la lista de .tc se corta');
    tcs.push(cadenaC(u8, p, 32));
  }
  if (p + 4 > u8.length) throw new Error('VSL: falta la cantidad de cuadros');
  const numCuadros = dv.getInt32(p, true); p += 4;
  if (numCuadros < 0 || p + numCuadros * 12 > u8.length) throw new Error(`VSL: ${numCuadros} cuadros no entran en el archivo`);
  const cuadros = new Int16Array(numCuadros * 6);
  for (let i = 0; i < numCuadros * 6; i++) cuadros[i] = dv.getInt16(p + i * 2, true);
  p += numCuadros * 12;
  return {
    tcs, declarados, numCuadros, cuadros, sobrante: u8.length - p,
    // capa k (0..2) del cuadro i: { tc: indice o -1, cuadro: cuadro dentro del .tc }
    capa(i, k) { return { tc: cuadros[i * 6 + k], cuadro: cuadros[i * 6 + 3 + k] }; },
  };
}

// Cuadro de la escena para un momento de la cancion (Piu: tics de 240 Hz desde el comienzo, / 4, 0x2C484).
export const cuadroDeTics = (tics240) => Math.max(0, Math.trunc(tics240 / TIEMPO.TICS_POR_CUADRO));
export const cuadroDeSegundos = (s) => cuadroDeTics(Math.floor(s * TIEMPO.TICS_POR_SEGUNDO));

// ------------------------------------------------------------------------------------------------ .tc

// Animacion de F2 ("Tch2Tc" la arma desde la exportacion de 3D Studio). Lectura: VslView 0x4021C0, Piu 0x40528.
//   u32 cantidad de materiales; cada material (VslView 0x4019F0, Piu 0x3EFC8):
//     char[32] nombre; i32 tieneTextura; i32 campo2 (no se usa)
//     si tieneTextura: i32 cantidad de pares; pares x (char[32] imagen o .ifl, char[32] mascara o .ifl) (solo vale el 1.o)
//     i32 n = cantidad de claves (> 0)
//     float[4][n] difuso (es el color: glColor4fv), float[4][n] ambiente, float[4][n] especular, float[4][n] emision
//     float[n] brillo; u32 banderas; i32 campo28 (siempre 200, no se usa); u32[2] extra (siempre 0, no se usa)
//   i32 numCuadros (VslView no dibuja cuadros >= este numero; Piu no lo mira)
//   i32 msPorCuadro (33 o 41: 30 o 24 cuadros por segundo de 3D Studio; ningun programa lo usa)
//   u32 cantidad de objetos; cada objeto (VslView 0x4023B0, Piu 0x40750):
//     u32 g; g x char[32] material de cada grupo; g x i32 vertices del grupo
//     vertices x { float x, y, z, u, v }  (todos los grupos seguidos; se dibujan como GL_TRIANGLES)
//     i32 m; m x 12 floats = matriz de 4 filas x 3 (ejes X, Y, Z y traslacion), una por cuadro (0x402130 / 0x40490)
export function leerTC(datos) {
  const u8 = bytesDe(datos), dv = vistaDe(u8);
  let p = 0;
  const necesito = (n, que) => { if (n < 0 || p + n > u8.length) throw new Error(`TC: se corta en ${que} (byte ${p})`); };
  const i32 = (que) => { necesito(4, que); const v = dv.getInt32(p, true); p += 4; return v; };
  const u32 = (que) => { necesito(4, que); const v = dv.getUint32(p, true); p += 4; return v; };
  const nombre32 = (que) => { necesito(32, que); const s = cadenaC(u8, p, 32); p += 32; return s; };
  const floats = (n, que) => { necesito(n * 4, que); const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = dv.getFloat32(p + i * 4, true); p += n * 4; return a; };

  const numMat = i32('cantidad de materiales');
  if (numMat < 0 || numMat > LIMITES.MATERIALES) throw new Error(`TC: ${numMat} materiales`);
  const materiales = [];
  for (let m = 0; m < numMat; m++) {
    const nombre = nombre32('nombre de material');
    const tieneTextura = i32('tieneTextura');
    const campo2 = i32('campo2');
    const mapas = [];
    if (tieneTextura) {
      const pares = i32('cantidad de mapas');
      if (pares < 0 || pares > 1000) throw new Error(`TC: ${pares} mapas en "${nombre}"`);
      for (let t = 0; t < pares; t++) mapas.push({ color: nombre32('mapa'), alfa: nombre32('mascara') });
    }
    const claves = i32('claves');
    if (claves <= 0) throw new Error(`TC: el material "${nombre}" tiene ${claves} claves (el original lo rechaza)`);
    necesito(claves * 68, 'claves del material');
    const difuso = floats(claves * 4), ambiente = floats(claves * 4), especular = floats(claves * 4), emision = floats(claves * 4);
    const brillo = floats(claves);
    const banderas = u32('banderas');
    const campo28 = i32('campo28');
    const extra = [u32('extra'), u32('extra')];
    materiales.push({ nombre, tieneTextura, campo2, mapas, claves, difuso, ambiente, especular, emision, brillo, banderas, campo28, extra, anchoLinea: 1 });
  }
  const numCuadros = i32('numCuadros');
  const msPorCuadro = i32('msPorCuadro');
  const numObj = i32('cantidad de objetos');
  if (numObj < 0 || numObj > 100000) throw new Error(`TC: ${numObj} objetos`);
  const objetos = [];
  for (let o = 0; o < numObj; o++) {
    const g = i32('grupos');
    if (g < 0 || g > 1000) throw new Error(`TC: ${g} grupos`);
    const mats = [];
    for (let k = 0; k < g; k++) mats.push(nombre32('material del grupo'));
    const cantidades = new Int32Array(g);
    let total = 0;
    for (let k = 0; k < g; k++) { cantidades[k] = i32('vertices del grupo'); if (cantidades[k] < 0) throw new Error('TC: grupo negativo'); total += cantidades[k]; }
    const vertices = floats(total * 5, 'vertices');
    const numMatrices = i32('matrices');
    if (numMatrices < 0) throw new Error('TC: matrices negativas');
    const crudas = floats(numMatrices * 12, 'matrices');
    // Matriz de OpenGL (por columnas), exactamente como la arma 0x402130: m[0..2]=f0..2, m[4..6]=f3..5,
    // m[8..10]=f6..8, m[12..14]=f9..11, m[3]=m[7]=m[11]=0, m[15]=1.
    const matrices = new Float32Array(numMatrices * 16);
    for (let k = 0; k < numMatrices; k++) {
      const f = k * 12, d = k * 16;
      for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) matrices[d + c * 4 + r] = crudas[f + c * 3 + r];
      matrices[d + 15] = 1;
    }
    objetos.push({ materiales: mats, cantidades, vertices, numMatrices, matrices });
  }
  return { materiales, numCuadros, msPorCuadro, objetos, sobrante: u8.length - p };
}

// ------------------------------------------------------------------------------------------------ .ifl

// Lista de cuadros (formato de 3D Studio). Lectura: VslView 0x402790 + 0x401ED0, Piu 0x3DABC + 0x40A44.
// Se lee de a una linea de hasta 100 caracteres (una linea mas larga se parte en dos). Una linea vacia o sin
// palabras TERMINA la lista; las que empiezan con ';' se saltean; de cada linea vale solo la primera palabra.
// No hay contador de repeticiones: para que un cuadro dure mas, el archivo lo repite.
export function leerIFL(texto) {
  const s = String(texto).replace(/\r\n?/g, '\n');      // se abre en modo texto ("rt")
  const nombres = [];
  let i = 0;
  const leerLinea = () => {
    let linea = '';
    while (linea.length < LIMITES.LINEA_IFL && i < s.length) {
      const c = s[i++];
      if (c === '\n') return linea;
      linea += c;
    }
    return linea;
  };
  for (;;) {
    const linea = leerLinea();
    if (linea.length === 0) break;
    if (linea[0] === ';') continue;
    const palabra = linea.split(/[ \t\n\v\f\r]+/).find((x) => x.length > 0);
    if (!palabra) break;
    nombres.push(minusculas(palabra));
  }
  return nombres;
}

// Los cuadros de una textura (sgl_RegistryFileName: VslView 0x402790, Piu 0x3DABC).
// color y alfa son los dos nombres del material; cada uno puede ser una imagen o un .ifl.
// leerTexto(nombre) -> contenido del .ifl o null. Devuelve [{ color, alfa, mascara }] (mascara = alfa tiene > 2 letras).
export function cuadrosDeTextura(color, alfa, leerTexto) {
  const lista = (nombre, vacioPermitido) => {
    const n = minusculas(nombre || '');
    if (n.length === 0) { if (vacioPermitido) return ['']; throw new Error('textura sin nombre'); }
    if (extensionF2(n) !== '.ifl') return [n];
    const t = leerTexto(n);
    if (t == null) throw new Error(`sgl_RegistryFileName - Can't find ${n}`);
    const l = leerIFL(t);
    if (!l.length) throw new Error(`sgl_RegistryFileName - ${n} is empty file!`);
    return l;
  };
  let colores = lista(color, false), alfas = lista(alfa, true);
  if (colores.length > 1 && alfas.length === 1) alfas = colores.map(() => alfas[0]);
  else if (colores.length === 1 && alfas.length > 1) colores = alfas.map(() => colores[0]);
  else if (colores.length !== alfas.length) { const n = Math.min(colores.length, alfas.length); colores = colores.slice(0, n); alfas = alfas.slice(0, n); }
  return colores.map((c, k) => ({ color: c, alfa: alfas[k], mascara: alfas[k].length > 2 }));
}

// ------------------------------------------------------------------------------------------------ imagenes

// BMP de 24 bits como sgl_Load_BMP (VslView 0x403110, Piu 0x3E808): filas de abajo hacia arriba en el archivo,
// quedan de arriba hacia abajo en memoria (la fila 0 de la textura es la de ARRIBA de la imagen); sin relleno de
// filas (los anchos son potencias de 2); alfa = 0 si el pixel es negro puro, si no 255.
export function leerBMP(datos) {
  const u8 = bytesDe(datos), dv = vistaDe(u8);
  if (u8.length < 54 || u8[0] !== 0x42 || u8[1] !== 0x4d) throw new Error('BMP: no es un BMP');
  const ancho = dv.getInt32(18, true), alto = dv.getInt32(22, true), bits = dv.getUint16(28, true);
  if (bits !== 24) throw new Error(`BMP: ${bits} bits por pixel (el original solo lee 24)`);
  const filaArchivo = ancho * 3;
  if (54 + filaArchivo * alto > u8.length) throw new Error('BMP: datos incompletos');
  const rgba = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    const o = 54 + y * filaArchivo, d = (alto - 1 - y) * ancho * 4;
    for (let x = 0; x < ancho; x++) {
      const b = u8[o + x * 3], g = u8[o + x * 3 + 1], r = u8[o + x * 3 + 2];
      rgba[d + x * 4] = r; rgba[d + x * 4 + 1] = g; rgba[d + x * 4 + 2] = b;
      rgba[d + x * 4 + 3] = r + g + b === 0 ? 0 : 255;
    }
  }
  return { ancho, alto, rgba, tieneAlfa: false };
}

// Cabecera de un PNG. El juego (Piu 0x3EB30) exige lados <= 256 y tipo de color con el bit 2 (RGB o RGBA).
export function infoPNG(datos) {
  const u8 = bytesDe(datos), dv = vistaDe(u8);
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (u8.length < 33 || firma.some((v, i) => u8[i] !== v)) throw new Error('PNG: firma invalida');
  const ancho = dv.getUint32(16), alto = dv.getUint32(20), profundidad = u8[24], tipoColor = u8[25], entrelazado = u8[28];
  const problemas = [];
  if (ancho > LIMITES.LADO_PNG || alto > LIMITES.LADO_PNG) problemas.push('invalid file size (mas de 256)');
  if (!(tipoColor & 2)) problemas.push('invalid color type');
  if (tipoColor === 3) problemas.push('paleta: el juego no le agrega alfa (solo lo hace con el tipo 2)');
  return { ancho, alto, profundidad, tipoColor, entrelazado, tieneAlfa: tipoColor === 4 || tipoColor === 6, problemas };
}

// Regla del color clave del juego para imagenes sin canal alfa (PNG tipo 2, Piu 0x3EE1E; BMP): negro puro = transparente.
export function aplicarClaveNegra(rgba) {
  for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = rgba[i] + rgba[i + 1] + rgba[i + 2] === 0 ? 0 : 255;
  return rgba;
}

// sgl_MixImage (VslView 0x402F90, Piu 0x3E670): el alfa sale de la mascara, (R+G+B) * 0.33333334 truncado.
export function mezclarMascara(color, mascara) {
  if (color.ancho !== mascara.ancho || color.alto !== mascara.alto) throw new Error('sgl_MixImage - image size is different');
  const d = color.rgba, m = mascara.rgba;
  for (let i = 0; i < d.length; i += 4) d[i + 3] = Math.trunc((m[i] + m[i + 1] + m[i + 2]) * UN_TERCIO);
  return color;
}

// Lo que guardaba la Voodoo (formato interno pedido por el juego, Piu 0x3E34D): GL_RGB5_A1 (5 bits por color, alfa de
// 1 bit) sin mascara y GL_RGBA4 (4 bits) con mascara. Deducido: Mesa 3.x trunca al bajar de bits y la placa vuelve a
// 8 bits repitiendo los bits altos. Sirve para imitar los escalones de color del original; no se aplica solo.
export function cuantizarComoVoodoo(rgba, conMascara) {
  const o = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    if (conMascara) {
      for (let c = 0; c < 4; c++) { const v = rgba[i + c] >> 4; o[i + c] = (v << 4) | v; }
    } else {
      for (let c = 0; c < 3; c++) { const v = rgba[i + c] >> 3; o[i + c] = (v << 3) | (v >> 2); }
      o[i + 3] = rgba[i + 3] >> 7 ? 255 : 0;
    }
  }
  return o;
}

// ------------------------------------------------------------------------------------------------ escena

// Arma la escena como el juego: carga los .tc en el orden del .vsl y llena tres tablas globales.
//   - materiales: uno por NOMBRE (en minusculas). Si dos .tc traen un material con el mismo nombre, vale la
//     definicion del primero (sgl_CreateMaterial devuelve el que ya existe: VslView 0x403500, Piu 0x3FBD4).
//   - slots: uno por cada material de cada .tc (VslView 0x4019F0): { material, claves (las del .tc que lo creo),
//     texturas (cuadros de la textura), tieneTextura }.
//   - texturas: una por par (imagen, mascara), compartidas (sgl con contador de referencias).
// Cada grupo de un objeto usa el PRIMER slot de toda la escena cuyo material tiene ese nombre (0x401C50 / 0x3F250),
// aunque sea de otro .tc.
// fuente = { tc(nombre) -> bytes|objeto|null, texto(nombre) -> string|null }
export function armarEscena(vsl, fuente) {
  const escena = { vsl, tcs: [], materiales: [], slots: [], texturas: [], porNombre: new Map(), porTextura: new Map() };
  const idTextura = (c) => {
    const clave = c.color + '\u0000' + c.alfa;
    if (!escena.porTextura.has(clave)) { escena.porTextura.set(clave, escena.texturas.length); escena.texturas.push(c); }
    return escena.porTextura.get(clave);
  };
  vsl.tcs.forEach((nombreTC, i) => {
    const crudo = fuente.tc(minusculas(nombreTC));
    if (crudo == null) throw new Error(`error : Can't Load  ${nombreTC}! (falta el .tc ${i})`);
    const tc = crudo.materiales ? crudo : leerTC(crudo);
    const slotsDelTC = [];
    for (const m of tc.materiales) {
      const nombre = minusculas(m.nombre);
      let id = escena.porNombre.get(nombre);
      if (id === undefined) {
        if (escena.materiales.length >= LIMITES.MATERIALES) throw new Error('sgl_CreateMaterial - max material num');
        id = escena.materiales.length; escena.porNombre.set(nombre, id); escena.materiales.push({ ...m, nombre });
      }
      const slot = { material: id, claves: m.claves, tieneTextura: false, texturas: [], mascaras: [], tc: i };
      if (m.tieneTextura) {
        const par = m.mapas[0] || { color: '', alfa: '' };
        const cuadros = cuadrosDeTextura(par.color, par.alfa, fuente.texto || (() => null));
        slot.tieneTextura = true;
        slot.texturas = cuadros.map(idTextura);
        slot.mascaras = cuadros.map((c) => c.mascara);
      }
      if (escena.slots.length >= LIMITES.SLOTS) throw new Error('demasiados slots');
      slotsDelTC.push(escena.slots.length); escena.slots.push(slot);
    }
    const objetos = tc.objetos.map((o) => {
      let base = 0;
      const grupos = o.materiales.map((nm, k) => {
        const id = escena.porNombre.get(minusculas(nm));
        const slot = id === undefined ? -1 : escena.slots.findIndex((s) => s.material === id);
        if (slot < 0) throw new Error(`error : Can't Load  ${nombreTC}! (material "${nm}" desconocido)`);
        const g = { slot, primerVertice: base, cantidad: o.cantidades[k] };
        base += o.cantidades[k];
        return g;
      });
      return { ...o, grupos };
    });
    escena.tcs.push({ nombre: nombreTC, tc, slots: slotsDelTC, objetos });
  });
  if (escena.texturas.length > LIMITES.TEXTURAS) throw new Error('sgl_GetBlankTextureSlot - max texture num');
  return escena;
}

// Modo de mezcla de un grupo (Piu 0x3FF24; VslView 0x40378C hace lo mismo con 0.99 en coma flotante).
export function modoMezcla(material, clave, conMascara) {
  if (material.banderas & BANDERA.SUMA) return 'suma';
  if (material.banderas & BANDERA.ALFA) return 'alfa';
  if (bitsDeFloat(material.difuso[clave * 4 + 3]) < UMBRAL_ALFA || conMascara) return 'alfa';
  return 'opaco';
}

// Que se dibuja en el cuadro n de la escena (calculo puro). Orden = orden de dibujo (no hay prueba de profundidad):
// capa 0, 1, 2; dentro de cada .tc, los objetos en orden; dentro de cada objeto, los grupos en orden.
export function estadoCuadro(escena, n) {
  const { vsl } = escena;
  const capas = [];
  if (!(n >= 0 && n < vsl.numCuadros)) return { cuadro: n, capas };   // Piu 0x40DD2: fuera de la escena no dibuja nada
  for (let k = 0; k < 3; k++) {
    const { tc: iTC, cuadro } = vsl.capa(n, k);
    if (iTC < 0) continue;
    const t = escena.tcs[iTC];
    if (!t) { capas.push({ capa: k, tc: iTC, cuadroTC: cuadro, error: 'indice de .tc fuera de la lista', objetos: [] }); continue; }
    const capa = { capa: k, tc: iTC, cuadroTC: cuadro, fueraDeTC: cuadro >= t.tc.numCuadros, objetos: [] };
    for (const o of t.objetos) {
      const ok = cuadro >= 0 && cuadro < o.numMatrices;
      const obj = { matriz: ok ? o.matrices.subarray(cuadro * 16, cuadro * 16 + 16) : null, grupos: [] };
      for (const g of o.grupos) {
        const s = escena.slots[g.slot], m = escena.materiales[s.material];
        const clave = mod(cuadro, s.claves);
        const ti = s.tieneTextura ? mod(cuadro, s.texturas.length) : -1;
        const mascara = ti >= 0 ? s.mascaras[ti] : false;
        obj.grupos.push({
          slot: g.slot, material: s.material, clave, color: m.difuso.subarray(clave * 4, clave * 4 + 4),
          textura: ti >= 0 ? s.texturas[ti] : -1, mascara, mezcla: modoMezcla(m, clave, mascara),
          wrapS: m.banderas & BANDERA.CLAMP_S ? GL.CLAMP : GL.REPEAT, wrapT: m.banderas & BANDERA.CLAMP_T ? GL.CLAMP : GL.REPEAT,
          vertices: o.vertices.subarray(g.primerVertice * 5, (g.primerVertice + g.cantidad) * 5),
        });
      }
      capa.objetos.push(obj);
    }
    capas.push(capa);
  }
  return { cuadro: n, capas };
}
// idiv de x86: el resto tiene el signo del dividendo
const mod = (a, b) => a - Math.trunc(a / b) * b;

// ------------------------------------------------------------------------------------------------ dibujo

// Repite las llamadas OpenGL del juego para el cuadro n (Piu 0x40D28 -> 0x40720 -> 0x408F4 -> 0x3F298/0x3FE54/0x3DA54).
// gl: objeto con la API de gl1.js. idGL(texturaDeEscena) -> nombre de textura de OpenGL (ver crearTexturasGL).
// Detalles que se respetan a proposito porque cambian lo que se ve:
//   - el material se aplica ANTES de enlazar su textura, asi que el GL_TEXTURE_WRAP que pide un material queda en la
//     textura que estaba enlazada antes (la del grupo anterior), no en la suya;
//   - un material sin textura no apaga GL_TEXTURE_2D: se dibuja con la ultima textura enlazada;
//   - el color se pone dos veces (glColor4fv en el material y otra vez antes de glBegin), siempre el difuso.
export function dibujarEscena(gl, escena, n, idGL) {
  const { vsl } = escena;
  gl.glDisable(GL.DEPTH_TEST); gl.glEnable(GL.CULL_FACE); gl.glCullFace(GL.BACK);
  gl.glMatrixMode(GL.PROJECTION); gl.glPushMatrix(); gl.glLoadIdentity();
  gl.gluPerspective(CAMARA.fovy, CAMARA.aspecto, CAMARA.cerca, CAMARA.lejos);
  gl.glMatrixMode(GL.MODELVIEW); gl.glPushMatrix(); gl.glLoadIdentity();
  gl.gluLookAt(...CAMARA.ojo, ...CAMARA.centro, ...CAMARA.arriba);
  if (n >= 0 && n < vsl.numCuadros) {
    for (let k = 0; k < 3; k++) {
      const { tc: iTC, cuadro } = vsl.capa(n, k);
      if (iTC < 0 || !escena.tcs[iTC]) continue;
      for (const o of escena.tcs[iTC].objetos) dibujarObjeto(gl, escena, o, cuadro, idGL);
    }
  }
  gl.glMatrixMode(GL.MODELVIEW); gl.glPopMatrix();
  gl.glMatrixMode(GL.PROJECTION); gl.glPopMatrix();          // el juego deja GL_PROJECTION como modo actual
  gl.glDisable(GL.DEPTH_TEST); gl.glDisable(GL.CULL_FACE);
  gl.glEnable(GL.BLEND); gl.glBlendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
}

// Un objeto (Piu 0x408F4). Si el cuadro no tiene matriz, el original leeria memoria ajena: aca no se dibuja.
export function dibujarObjeto(gl, escena, o, cuadro, idGL) {
  if (!(cuadro >= 0 && cuadro < o.numMatrices)) return;
  gl.glPushMatrix();
  gl.glMultMatrixf(o.matrices.subarray(cuadro * 16, cuadro * 16 + 16));
  for (const g of o.grupos) {
    aplicarSlot(gl, escena, g.slot, cuadro, idGL);
    const s = escena.slots[g.slot], m = escena.materiales[s.material];
    const clave = mod(cuadro, s.claves);
    gl.glColor4fv(m.difuso.subarray(clave * 4, clave * 4 + 4));        // 0x3F350 -> glColor4fv
    gl.glBegin(GL.TRIANGLES);
    const v = o.vertices;
    for (let i = g.primerVertice, fin = g.primerVertice + g.cantidad; i < fin; i++) {
      gl.glTexCoord2f(v[i * 5 + 3], v[i * 5 + 4]);
      gl.glVertex3f(v[i * 5], v[i * 5 + 1], v[i * 5 + 2]);
    }
    gl.glEnd();
  }
  gl.glPopMatrix();
}

// Material + textura de un grupo (Piu 0x3F298 -> 0x3FE54 y 0x3DA54).
export function aplicarSlot(gl, escena, iSlot, cuadro, idGL) {
  const s = escena.slots[iSlot], m = escena.materiales[s.material];
  const clave = mod(cuadro, s.claves);
  const ti = s.tieneTextura ? mod(cuadro, s.texturas.length) : -1;
  const mascara = ti >= 0 ? s.mascaras[ti] : false;
  const v4 = (a) => a.subarray(clave * 4, clave * 4 + 4);
  gl.glColor4fv(v4(m.difuso));
  if (gl.glMaterialfv) {                         // sin GL_LIGHTING no cambian nada; se mandan por fidelidad
    gl.glMaterialfv(GL.FRONT_AND_BACK, GL.AMBIENT, v4(m.ambiente));
    gl.glMaterialfv(GL.FRONT_AND_BACK, GL.DIFFUSE, v4(m.difuso));
    gl.glMaterialfv(GL.FRONT_AND_BACK, GL.SPECULAR, v4(m.especular));
    gl.glMaterialfv(GL.FRONT_AND_BACK, GL.EMISSION, v4(m.emision));
    gl.glMaterialf(GL.FRONT_AND_BACK, GL.SHININESS, m.brillo[clave]);
  }
  if (m.banderas & BANDERA.ALAMBRE) gl.glLineWidth(m.anchoLinea);
  const modo = modoMezcla(m, clave, mascara);
  if (modo === 'suma') { gl.glEnable(GL.BLEND); gl.glBlendFunc(GL.ONE, GL.ONE); }
  else if (modo === 'alfa') { gl.glEnable(GL.BLEND); gl.glBlendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA); }
  else { gl.glBlendFunc(GL.ONE, GL.ZERO); gl.glDisable(GL.BLEND); }
  gl.glTexParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, m.banderas & BANDERA.CLAMP_S ? GL.CLAMP : GL.REPEAT);
  gl.glTexParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, m.banderas & BANDERA.CLAMP_T ? GL.CLAMP : GL.REPEAT);
  if (ti >= 0) {
    gl.glTexEnvf(GL.TEXTURE_ENV, GL.TEXTURE_ENV_MODE, GL.MODULATE);
    gl.glBindTexture(GL.TEXTURE_2D, idGL(s.texturas[ti]) || 0);  // 0 = textura que no cargo: sin imagen, sin textura
    gl.glEnable(GL.TEXTURE_2D);
  }
}

// Imagen RGBA de una textura de la escena con las reglas del juego.
// imagen(nombre) -> { ancho, alto, rgba (Uint8Array, filas de arriba hacia abajo), tieneAlfa } o null;
// se llama con los nombres de nombresImagen() en orden (primero el .png).
// Si el juego no puede cargarla devuelve { error }: nombre que no termina en ".bmp" segun su cuenta (por ejemplo
// "no_back..bmp", escena 11), imagen que no esta, o mascara de otro tamano. En ese caso el juego NO aborta: guarda
// el numero -1 y al dibujar enlaza la textura 0 de OpenGL, que no tiene imagen, asi que el grupo sale SIN textura
// (solo el color del material). Piu 0x3D934 no mira el error y 0x3DA54 lee fuera de la tabla (deducido el efecto:
// [0x592050] > 0 y [0x592820] = 0). VslView, en cambio, deja enlazada la textura anterior.
export function rgbaDeTextura(tex, imagen) {
  const buscar = (n) => {
    const alternativas = nombresImagen(n);
    if (!alternativas.length) return { error: `sgl_Load_Image - '${n}' is not yet loadable (la extension no es .bmp)` };
    for (const alt of alternativas) { const im = imagen(alt); if (im) return im; }
    return { error: `sgl_Load_PNG / sgl_Load_BMP - can't find ${n} (ni .png ni .bmp)` };
  };
  const c = buscar(tex.color);
  if (c.error) return c;
  const rgba = Uint8Array.from(c.rgba);
  if (!c.tieneAlfa) aplicarClaveNegra(rgba);
  const out = { ancho: c.ancho, alto: c.alto, rgba };
  if (tex.mascara) {
    const m = buscar(tex.alfa);
    if (m.error) return m;
    if (m.ancho !== out.ancho || m.alto !== out.alto) return { error: `sgl_MixImage - Maybe ${tex.color} and ${tex.alfa} 's image size is different!` };
    mezclarMascara(out, m);
  }
  return out;
}

// Sube todas las texturas como el juego (Piu 0x3E2F4..0x3E39F). Devuelve el arreglo de nombres de OpenGL;
// idGL para dibujarEscena es (i) => ids[i]. Las que el juego no puede cargar quedan en 0 (sin textura) y con
// escena.texturas[i].error explicando por que.
export function crearTexturasGL(gl, escena, imagen) {
  return escena.texturas.map((tex) => {
    const r = rgbaDeTextura(tex, imagen);
    if (r.error) { tex.error = r.error; return 0; }
    const { ancho, alto, rgba } = r;
    const ids = [];
    gl.glGenTextures(1, ids);
    gl.glBindTexture(GL.TEXTURE_2D, ids[0]);
    if (gl.glPixelStorei) gl.glPixelStorei(GL.UNPACK_ALIGNMENT, 1);
    gl.glTexParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
    gl.glTexParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
    gl.glTexImage2D(GL.TEXTURE_2D, 0, tex.mascara ? GL.RGBA4 : GL.RGB5_A1, ancho, alto, 0, GL.RGBA, GL.UNSIGNED_BYTE, rgba);
    return ids[0];
  });
}

// Matrices de la camara (por columnas), para quien dibuje sin gl1.js. Mismas cuentas que gluPerspective/gluLookAt de Mesa.
export function matrizProyeccion() {
  const y = CAMARA.cerca * Math.tan(CAMARA.fovy * Math.PI / 360), x = y * CAMARA.aspecto;
  const n = CAMARA.cerca, f = CAMARA.lejos, m = new Float32Array(16);
  m[0] = n / x; m[5] = n / y; m[10] = -(f + n) / (f - n); m[11] = -1; m[14] = -2 * f * n / (f - n);
  return m;
}
export function matrizVista() {
  const [ex, ey, ez] = CAMARA.ojo, [cx, cy, cz] = CAMARA.centro, [ux, uy, uz] = CAMARA.arriba;
  const norm = (v) => { const l = Math.hypot(...v); return l ? v.map((a) => a / l) : v; };
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const z = norm([ex - cx, ey - cy, ez - cz]);
  const xx = norm(cruz([ux, uy, uz], z)), yy = norm(cruz(z, xx));
  const m = new Float32Array(16);
  m[0] = xx[0]; m[4] = xx[1]; m[8] = xx[2];
  m[1] = yy[0]; m[5] = yy[1]; m[9] = yy[2];
  m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
  m[12] = -(xx[0] * ex + xx[1] * ey + xx[2] * ez);
  m[13] = -(yy[0] * ex + yy[1] * ey + yy[2] * ez);
  m[14] = -(z[0] * ex + z[1] * ey + z[2] * ez);
  m[15] = 1;
  return m;
}

// ------------------------------------------------------------------------------------------------ archivos que el juego no lee

// .jtx (solo en las escenas 09, 29, 39, 41 y 44): textura cruda de 16 bits. Ningun programa del disco la lee;
// estructura deducida de los datos.
//   u32 formato (2), u32 ancho, u32 alto, u32 (1), u32 (30), 40 bytes de basura de memoria, ancho*alto x u16 pixeles.
// Los pixeles parecen ARGB 4444 (nibble alto = alfa): rampas 0x0111 -> 0xF111 en los bordes de las letras.
export function leerJTX(datos) {
  const u8 = bytesDe(datos), dv = vistaDe(u8);
  if (u8.length < 60) throw new Error('JTX: demasiado corto');
  const formato = dv.getUint32(0, true), ancho = dv.getUint32(4, true), alto = dv.getUint32(8, true);
  const campo3 = dv.getUint32(12, true), campo4 = dv.getUint32(16, true);
  if (60 + ancho * alto * 2 !== u8.length) throw new Error(`JTX: ${ancho}x${alto} no coincide con el tamano`);
  const pixeles = new Uint16Array(ancho * alto);
  for (let i = 0; i < pixeles.length; i++) pixeles[i] = dv.getUint16(60 + i * 2, true);
  return {
    formato, ancho, alto, campo3, campo4, basura: u8.slice(20, 60), pixeles,
    rgba() { const o = new Uint8Array(ancho * alto * 4); pixeles.forEach((v, i) => { o[i * 4] = ((v >> 8) & 15) * 17; o[i * 4 + 1] = ((v >> 4) & 15) * 17; o[i * 4 + 2] = (v & 15) * 17; o[i * 4 + 3] = (v >> 12) * 17; }); return o; },
  };
}

// .nt (solo en la escena 44): pasos de musica del editor de F2 ("Techno"). Ningun programa del disco lo lee;
// estructura deducida:
//   u32 n; n x 224 bytes { float bpm; 54 u32 de datos; u32 tiempo en ms del paso (paso = semicorchea) }
//   cola: u32 k, k x char[32] nombre de .TCH, y mas datos sin descifrar.
export function leerNT(datos) {
  const u8 = bytesDe(datos), dv = vistaDe(u8);
  if (u8.length < 4) throw new Error('NT: demasiado corto');
  const n = dv.getUint32(0, true);
  if (4 + n * 224 > u8.length) throw new Error(`NT: ${n} pasos no entran`);
  const pasos = [];
  for (let i = 0; i < n; i++) {
    const o = 4 + i * 224;
    const campos = new Uint32Array(54);
    for (let k = 0; k < 54; k++) campos[k] = dv.getUint32(o + 4 + k * 4, true);
    pasos.push({ bpm: dv.getFloat32(o, true), campos, tiempoMs: dv.getUint32(o + 220, true) });
  }
  let p = 4 + n * 224;
  const cola = { nombres: [] };
  if (p + 4 <= u8.length) {
    const k = dv.getUint32(p, true);
    if (p + 4 + k * 32 > u8.length) throw new Error(`NT: ${k} nombres no entran`);
    for (let j = 0; j < k; j++) cola.nombres.push(cadenaC(u8, p + 4 + j * 32, 32));
    p += 4 + k * 32;
  }
  cola.resto = u8.slice(p);
  return { pasos, cola };
}

// .pix (PREVIEW.PIX, escenas 09, 15 y 39): una "resource fork" de Macintosh (vista previa de Photoshop con
// recursos PICT). Formato publico de Apple, todo en big endian. El juego no la lee.
export function leerPIX(datos) {
  const u8 = bytesDe(datos), dv = vistaDe(u8);
  if (u8.length < 16) throw new Error('PIX: demasiado corto');
  const ofDatos = dv.getUint32(0), ofMapa = dv.getUint32(4), largoDatos = dv.getUint32(8), largoMapa = dv.getUint32(12);
  if (ofDatos + largoDatos > u8.length || ofMapa + largoMapa > u8.length || largoMapa < 30) throw new Error('PIX: no es una resource fork');
  const ofTipos = ofMapa + dv.getUint16(ofMapa + 24), ofNombres = ofMapa + dv.getUint16(ofMapa + 26);
  const nTipos = (dv.getUint16(ofTipos) + 1) & 0xffff;
  const recursos = [];
  for (let t = 0; t < nTipos; t++) {
    const e = ofTipos + 2 + t * 8;
    const tipo = String.fromCharCode(u8[e], u8[e + 1], u8[e + 2], u8[e + 3]);
    const cuantos = dv.getUint16(e + 4) + 1, ofRefs = ofTipos + dv.getUint16(e + 6);
    for (let r = 0; r < cuantos; r++) {
      const q = ofRefs + r * 12;
      const id = dv.getInt16(q), ofNombre = dv.getUint16(q + 2), ofDato = dv.getUint32(q + 4) & 0xffffff;
      const d = ofDatos + ofDato, largo = dv.getUint32(d);
      if (d + 4 + largo > u8.length) throw new Error(`PIX: recurso ${tipo} ${id} fuera del archivo`);
      let nombre = null;
      if (ofNombre !== 0xffff) { const s = ofNombres + ofNombre; nombre = cadenaC(u8, s + 1, u8[s]); }
      recursos.push({ tipo, id, nombre, atributos: u8[q + 4], datos: u8.slice(d + 4, d + 4 + largo) });
    }
  }
  return { recursos };
}

// .rhy (main.rhy en OPEN1 y en la 52): proyecto del editor de ritmo de F2 (Wwp.exe / RhyView), guardado con la
// serializacion de MFC (CArchive). GetVisual_v16.exe lo COMPILA a main.vsl (0x4015B0: Loading / Converting / Saving
// ".vsl"). El juego no lo lee. Lectura PARCIAL: cabecera y las cadenas de MFC (largo de 1 byte + texto) que nombran
// .tc y la musica .tmm, en el orden en que aparecen.
export function leerRHY(datos) {
  const u8 = bytesDe(datos), dv = vistaDe(u8);
  if (u8.length < 8) throw new Error('RHY: demasiado corto');
  const version = dv.getUint32(0, true), campo1 = dv.getUint32(4, true);
  const cadenas = [];
  for (let i = 8; i < u8.length - 4; i++) {
    const n = u8[i];
    if (n < 4 || i + 1 + n > u8.length) continue;
    let ok = true, s = '';
    for (let k = 0; k < n && ok; k++) { const c = u8[i + 1 + k]; if (c < 0x20 || c === 0x7f) ok = false; else s += String.fromCharCode(c); }
    if (ok && /\.(tc|tmm|tch|mp3|wav)$/i.test(s)) { cadenas.push({ pos: i, texto: s }); i += n; }
  }
  const tcs = [...new Set(cadenas.filter((c) => /\.tc$/i.test(c.texto)).map((c) => c.texto))];
  const musica = [...new Set(cadenas.filter((c) => !/\.tc$/i.test(c.texto)).map((c) => c.texto))];
  // los tempos se guardan como double (120.0 = 0x405E000000000000) en registros de 32 bytes al comienzo
  let tempos = 0;
  for (let i = 8; i + 8 <= Math.min(u8.length, 0x10000); i++) { const d = dv.getFloat64(i, true); if (d >= 60 && d <= 300 && Number.isInteger(d * 10) && (u8[i] === 0 || u8[i + 1] === 0)) tempos++; }
  return { version, campo1, cadenas, tcs, musica, posiblesTempos: tempos, parcial: true };
}
