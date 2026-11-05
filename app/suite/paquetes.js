// Suite de Pump It Up: abre y vuelve a escribir paquetes de cualquier version conocida.
// Sin archivos del disco ni llaves: la llave de .AUD y .PNZ la pasa quien llama, sacada del disco del jugador.
//
//   RES1  Pump It Up The 2nd Dance Floor (y lo que use lo mismo). Sin cifrado ni sumas. Cabecera de 16, 24 por archivo.
//   RES2  Pump It Up Extra. XOR, sumas Adler-32. Cabecera de 24, 28 por archivo. investigacion\ANDAMIRO_MOTOR.md, seccion 1.
//   F2    F2 System, fondos de Extra. Sin cifrar. Indice desde 0x4C, 40 por archivo. investigacion\F2_FORMATOS.md.
//   AUD y PNZ de Extra: investigacion\CABINA.md, seccion 4.1.
//
// Regla: abrir y escribir sin cambios da el mismo archivo, byte por byte (tools\suite\probar_suite.mjs lo controla).
// Por eso se guarda todo lo que no se entiende (rellenos, restos de los nombres) en vez de tirarlo.

const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
const p32 = (b, o, v) => { b[o] = v & 255; b[o + 1] = v >>> 8 & 255; b[o + 2] = v >>> 16 & 255; b[o + 3] = v >>> 24 & 255; };
const texto = (b, o, n) => { let s = ''; for (let i = 0; i < n && b[o + i]; i++) s += String.fromCharCode(b[o + i]); return s; };

export function adler32(b) {
  let a = 1, c = 0;
  for (let i = 0; i < b.length;) { const fin = Math.min(i + 3800, b.length); for (; i < fin; i++) { a += b[i]; c += a; } a %= 65521; c %= 65521; }
  return ((c << 16) | a) >>> 0;
}

// XOR de Andamiro: k arranca en 0xD2 y suma 0x95 por byte (RES v4: 0xEF y 0x4F). Cifrar y descifrar son lo mismo.
export function xorAndamiro(b, k0 = 0xD2, paso = 0x95) {
  const o = new Uint8Array(b.length); let k = k0;
  for (let i = 0; i < b.length; i++) { o[i] = b[i] ^ k; k = (k + paso) & 255; }
  return o;
}

// RES3 (Perfect Collection, Banya): igual a RES2, con cantidad y tamano cambiados de lugar en la cabecera.
// RES4 (Prex 3): otras constantes, y entre el indice y los datos hay 0x44 bytes + un salto (u32 en +0x40 de ese bloque).
const FORMAS = {
  RES1: { cabecera: 16, entrada: 24, nombre: 16, cifrado: false, cCantidad: 8, cDatos: 12 },
  RES2: { cabecera: 24, entrada: 28, nombre: 16, cifrado: true, k0: 0xD2, paso: 0x95, cCantidad: 8, cDatos: 12 },
  RES3: { cabecera: 24, entrada: 28, nombre: 16, cifrado: true, k0: 0xD2, paso: 0x95, cCantidad: 12, cDatos: 8 },
  RES4: { cabecera: 24, entrada: 28, nombre: 16, cifrado: true, k0: 0xEF, paso: 0x4F, cCantidad: 8, cDatos: 12, bloque: true },
  F2: { cabecera: 0x4C, entrada: 40, nombre: 32, cifrado: false },
};

const FIRMA_F2 = [0x66, 0x61, 0x21, 0x5E];

// Dice que es sin confiar en la extension. 'RES?' = la firma es de RES, pero es una version que no conocemos.
export function detectar(b) {
  if (b.length >= 16 && b[0] === 0x52 && b[1] === 0x45 && b[2] === 0x53 && b[3] === 0) {
    const v = u32(b, 4);
    if (v === 1) return 'RES1';
    if (v === 2) return 'RES2';
    if (v === 3) return 'RES3';
    if (v === 4) return 'RES4';
    return 'RES?';
  }
  if (b.length >= 0x4C && FIRMA_F2.every((x, i) => b[0x38 + i] === x)) return 'F2';
  return null;
}

export function abrirPaquete(b) {
  const formato = detectar(b);
  if (!formato || !FORMAS[formato]) throw new Error('Paquete que no conozco: ' + (formato || 'sin firma'));
  const f = FORMAS[formato];
  const n = formato === 'F2' ? u32(b, 0x34) : u32(b, f.cCantidad);
  const finIndice = f.cabecera + n * f.entrada;
  if (finIndice > b.length) throw new Error('El indice se pasa del archivo');
  const indice = f.cifrado ? xorAndamiro(b.subarray(f.cabecera, finIndice), f.k0, f.paso) : b.subarray(f.cabecera, finIndice);
  // En F2 las posiciones son desde el principio del archivo. En RES, desde donde empiezan los datos.
  const base = formato === 'F2' ? 0 : f.bloque ? finIndice + 0x44 + u32(b, finIndice + 0x40) : finIndice;

  const archivos = [];
  for (let i = 0; i < n; i++) {
    const e = i * f.entrada;
    // RES: tamano y posicion. F2: al reves.
    const tam = u32(indice, e + f.nombre + (formato === 'F2' ? 4 : 0)), pos = u32(indice, e + f.nombre + (formato === 'F2' ? 0 : 4));
    if (base + pos + tam > b.length) throw new Error(`El archivo ${i} se pasa del paquete`);
    const crudo = b.subarray(base + pos, base + pos + tam);
    archivos.push({
      nombre: texto(indice, e, f.nombre),
      campoNombre: indice.slice(e, e + f.nombre),          // puede traer restos despues del cero
      orden: i, pos, tam,
      datos: f.cifrado ? xorAndamiro(crudo, f.k0, f.paso) : crudo.slice(),
      suma: f.cifrado ? u32(indice, e + 24) : null,
    });
  }

  // Lo que hay entre archivos se guarda tal cual. Dos entradas pueden compartir el mismo lugar.
  const enDisco = archivos.slice().sort((x, y) => x.pos - y.pos || x.orden - y.orden);
  let cursor = finIndice - base;
  const raros = [];
  const primero = enDisco.length ? enDisco[0].pos : cursor;
  const antes = primero > cursor ? b.slice(base + cursor, base + primero) : new Uint8Array(0);
  if (enDisco.length) cursor = primero;
  for (const a of enDisco) {
    if (a.pos < cursor) {
      const anterior = enDisco[enDisco.indexOf(a) - 1];
      if (anterior && anterior.pos === a.pos && anterior.tam === a.tam) a.mismoLugarQue = anterior;
      else raros.push(`${a.nombre} se pisa con el anterior`);
    }
    if (a.mismoLugarQue) { a.relleno = new Uint8Array(0); continue; }
    const fin = a.pos + a.tam, sig = enDisco.slice(enDisco.indexOf(a) + 1).find(x => x.pos >= fin);
    const hasta = sig ? sig.pos : b.length - base;
    a.relleno = hasta > fin ? b.slice(base + fin, base + hasta) : new Uint8Array(0);   // los rellenos en RES2 siguen cifrados: no se tocan
    cursor = Math.max(cursor, fin);
  }
  return { formato, cabecera: b.slice(0, f.cabecera), antes, archivos, raros };
}

export function escribirPaquete(p) {
  const f = FORMAS[p.formato];
  if (!f) throw new Error('Formato que no se escribir: ' + p.formato);
  const n = p.archivos.length, finIndice = f.cabecera + n * f.entrada;
  const base = p.formato === 'F2' ? 0 : f.bloque ? finIndice + p.antes.length : finIndice;
  const enDisco = p.archivos.map((a, i) => ({ a, i })).sort((x, y) => (x.a.pos ?? Infinity) - (y.a.pos ?? Infinity) || x.i - y.i).map(x => x.a);

  // Se calcula primero donde cae cada uno y despues se escribe.
  let cursor = f.bloque ? 0 : finIndice - base + p.antes.length;
  const lugar = new Map(), piezas = [];
  for (const a of enDisco) {
    if (a.mismoLugarQue && a.mismoLugarQue.datos === a.datos) { lugar.set(a, lugar.get(a.mismoLugarQue)); continue; }
    if (a.mismoLugarQue && p.archivos.includes(a.mismoLugarQue) && igual(a.mismoLugarQue.datos, a.datos)) { lugar.set(a, lugar.get(a.mismoLugarQue)); continue; }
    const crudo = f.cifrado ? xorAndamiro(a.datos, f.k0, f.paso) : a.datos;
    lugar.set(a, cursor);
    piezas.push(crudo); cursor += crudo.length;
    if (a.relleno && a.relleno.length) { piezas.push(a.relleno); cursor += a.relleno.length; }
  }

  const salida = new Uint8Array(base + cursor);
  salida.set(p.cabecera, 0);
  const indice = new Uint8Array(n * f.entrada);
  p.archivos.forEach((a, i) => {
    const e = i * f.entrada;
    indice.set(a.campoNombre || campoDeNombre(a.nombre, f.nombre), e);
    p32(indice, e + f.nombre + (p.formato === 'F2' ? 4 : 0), a.datos.length);
    p32(indice, e + f.nombre + (p.formato === 'F2' ? 0 : 4), lugar.get(a));
    if (f.cifrado) p32(indice, e + 24, adler32(a.datos));
  });
  salida.set(f.cifrado ? xorAndamiro(indice, f.k0, f.paso) : indice, f.cabecera);
  let o = finIndice;
  salida.set(p.antes, o); o += p.antes.length;
  const iniDatos = f.bloque ? o : finIndice;
  for (const q of piezas) { salida.set(q, o); o += q.length; }

  if (p.formato === 'F2') p32(salida, 0x34, n);
  else {
    p32(salida, f.cCantidad, n); p32(salida, f.cDatos, o - iniDatos);
    if (f.cifrado) { p32(salida, 0x10, adler32(indice)); p32(salida, 0x14, adler32(salida.subarray(iniDatos, o))); }
  }
  return salida;
}

function igual(x, y) { if (x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; }

function campoDeNombre(nombre, largo) {
  if (nombre.length >= largo) throw new Error(`Nombre muy largo (maximo ${largo - 1}): ${nombre}`);
  if (/[^\x20-\x7e]/.test(nombre)) throw new Error('El nombre solo puede tener letras comunes: ' + nombre);
  const o = new Uint8Array(largo);
  for (let i = 0; i < nombre.length; i++) o[i] = nombre.charCodeAt(i);
  return o;
}

// El juego busca sin distinguir mayusculas.
const buscar = (p, nombre) => p.archivos.find(a => a.nombre.toLowerCase() === nombre.toLowerCase());

export function ponerArchivo(p, nombre, datos) {
  const a = buscar(p, nombre);
  if (a) {
    for (const otro of p.archivos) if (otro.mismoLugarQue === a) { otro.datos = otro.datos.slice(); otro.mismoLugarQue = null; }
    a.datos = datos; a.mismoLugarQue = null; return p;
  }
  p.archivos.push({ nombre, campoNombre: campoDeNombre(nombre, FORMAS[p.formato].nombre), datos, relleno: new Uint8Array(0) });
  return p;
}

export function sacarArchivo(p, nombre) {
  const a = buscar(p, nombre);
  if (!a) return false;
  for (const otro of p.archivos) if (otro.mismoLugarQue === a) otro.mismoLugarQue = null;
  p.archivos.splice(p.archivos.indexOf(a), 1);
  return true;
}

// Paquete nuevo, vacio. 'F2' necesita una cabecera de la que partir: la de un paquete del disco del jugador.
export function paqueteNuevo(formato, cabeceraF2) {
  const f = FORMAS[formato];
  if (!f) throw new Error('Formato que no se escribir: ' + formato);
  let cabecera = new Uint8Array(f.cabecera);
  if (formato === 'F2') { if (!cabeceraF2) throw new Error('F2 necesita una cabecera de ejemplo'); cabecera = cabeceraF2.slice(0, f.cabecera); }
  else { cabecera.set([0x52, 0x45, 0x53, 0]); p32(cabecera, 4, +formato[3]); }
  return { formato, cabecera, antes: new Uint8Array(f.bloque ? 0x44 : 0), archivos: [], raros: [] };
}

// --------------------------------------------------------------- .AUD y .PNZ de Extra
const ESPEJO = new Uint8Array(256);
for (let x = 0; x < 256; x++) { let r = 0; for (let b = 0; b < 8; b++) if (x & (1 << b)) r |= 1 << (7 - b); ESPEJO[x] = r; }

// Da null si la llave no corresponde o el archivo esta danado: el encabezado es la suma del contenido.
export function descifrarAudPnz(c, llave) {
  const h = u32(c, 0), o = new Uint8Array(c.length - 4);
  for (let i = 0; i < o.length; i++) o[i] = ESPEJO[c[4 + i]] ^ llave[(h + i) & 1023];
  return adler32(o) === h ? o : null;
}

export function cifrarAudPnz(claro, llave) {
  const h = adler32(claro), o = new Uint8Array(claro.length + 4);
  p32(o, 0, h);
  for (let i = 0; i < claro.length; i++) o[4 + i] = ESPEJO[claro[i] ^ llave[(h + i) & 1023]];
  return o;
}

// ENC1, los .AUD y .PNZ de Prex 3 (0x418F45). Cabecera de 0x8C con el tamano en +0x84 y un salto en +0x88,
// el salto, los 4 bytes de suma, el contenido cifrado como en Extra con otra llave, y un resto que el juego no lee.
export const esEnc1 = (c) => c.length >= 0x8C && c[0] === 0x45 && c[1] === 0x4E && c[2] === 0x43 && c[3] === 0x31;

export function descifrarEnc1(c, llave) {
  if (!esEnc1(c)) return null;
  const tam = u32(c, 0x84), ini = 0x8C + u32(c, 0x88);
  if (ini + 4 + tam > c.length) return null;
  const h = u32(c, ini), o = new Uint8Array(tam);
  for (let i = 0; i < tam; i++) o[i] = ESPEJO[c[ini + 4 + i]] ^ llave[(h + i) & 1023];
  if (adler32(o) !== h) return null;
  return { datos: o, cabecera: c.slice(0, ini), cola: c.slice(ini + 4 + tam) };
}

// Sin cabecera propia usa una minima, sin relleno, y sin cola.
export function cifrarEnc1(claro, llave, cabecera = null, cola = new Uint8Array(0)) {
  const cab = cabecera ? cabecera.slice() : new Uint8Array(0x8C);
  if (!cabecera) cab.set([0x45, 0x4E, 0x43, 0x31]);
  p32(cab, 0x84, claro.length);
  const h = adler32(claro), o = new Uint8Array(cab.length + 4 + claro.length + cola.length);
  o.set(cab, 0); p32(o, cab.length, h);
  for (let i = 0; i < claro.length; i++) o[cab.length + 4 + i] = ESPEJO[claro[i] ^ llave[(h + i) & 1023]];
  o.set(cola, cab.length + 4 + claro.length);
  return o;
}
