// Texturas .PTX de Andamiro: un JPEG casero. Leido de Piu.exe de Extra (0x434AC), que todavia lo sabe abrir.
//
// Cabecera de 16 bytes: "PTX\0", u16 0x100, u16 ancho/8, u16 alto/8, u16 tipo (0x81 RGB, 0x82 RGBA), u16 calidad, u16 0.
// Despues, un canal atras del otro (Y, Cb, Cr y a veces alfa), cada uno arrancando en un byte entero.
// Cada canal: bloques de 8x8 de izquierda a derecha y de arriba abajo, sin submuestreo.
// Huffman: las tablas estandar de JPEG (Anexo K). Brillo y alfa usan las de luminancia; Cb y Cr, las de crominancia.
// Cuantizacion: la tabla de luminancia para TODOS los canales, por 100/calidad. La de crominancia se calcula y no se usa.
//
// Todas las tablas son del estandar de JPEG: no hace falta nada del juego.

const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const CUANT = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const AAN = [16384, 22725, 21407, 19266, 16384, 12873, 8867, 4520, 22725, 31521, 29692, 26722, 22725, 17855, 12299, 6270, 21407, 29692, 27969, 25172, 21407, 16819, 11585, 5906, 19266, 26722, 25172, 22654, 19266, 15137, 10426, 5315, 16384, 22725, 21407, 19266, 16384, 12873, 8867, 4520, 12873, 17855, 16819, 15137, 12873, 10114, 6967, 3552, 8867, 12299, 11585, 10426, 8867, 6967, 4799, 2446, 4520, 6270, 5906, 5315, 4520, 3552, 2446, 1247];

const DC_LARGOS = [[0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]];
const DC_VALORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_LARGOS = [[0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125], [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119]];
const AC_VALORES = [
  [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa],
  [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa],
];

function armarHuffman(largos, valores) {
  const leer = new Map(), escribir = new Map();
  let codigo = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    for (let i = 0; i < largos[l - 1]; i++, k++, codigo++) { leer.set(l * 65536 + codigo, valores[k]); escribir.set(valores[k], [l, codigo]); }
    codigo <<= 1;
  }
  return { leer, escribir };
}
const DC = [0, 1].map(c => armarHuffman(DC_LARGOS[c], DC_VALORES));
const AC = [0, 1].map(c => armarHuffman(AC_LARGOS[c], AC_VALORES[c]));
const CLASE = [0, 1, 1, 0];   // Y, Cb, Cr, alfa

export const tablasPtx = { DC, AC, ZIGZAG, CUANT, AAN };   // para comparar contra el exe

// Lo que hace 0x43910 con la tabla de luminancia.
function cuantizacion(calidad) {
  const q = new Int32Array(64);
  for (let i = 0; i < 64; i++) q[i] = (Math.trunc(Math.imul(AAN[i], CUANT[i] * 100) / calidad) + 2048) >> 12;
  return q;
}

class LectorBits {
  constructor(b, ini) { this.b = b; this.ini = ini; this.pos = 0; }
  bits(n) { let v = 0; for (let i = 0; i < n; i++, this.pos++) v = (v << 1) | ((this.b[this.ini + (this.pos >> 3)] ?? 0) >> (7 - (this.pos & 7)) & 1); return v; }
  simbolo(t) {
    let c = 0;
    for (let l = 1; l <= 16; l++) { c = (c << 1) | this.bits(1); const s = t.leer.get(l * 65536 + c); if (s !== undefined) return s; }
    throw new Error('.PTX: codigo Huffman que no existe');
  }
  extender(n) { if (!n) return 0; const v = this.bits(n); return v & (1 << (n - 1)) ? v : v - (1 << n) + 1; }
}

const limitar = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
// La salida de la transformada pasa por una tabla de 1024: da la vuelta igual que en el juego y le suma 128.
const salida = (x) => { const m = (x >> 5) & 1023, s = m < 512 ? m : m - 1024; return limitar(s + 128); };

// Transformada inversa rapida (0x43C20), en enteros de 32 bits como el original.
function inversa(c, q, sal, o, ws) {
  for (let i = 0; i < 8; i++) {
    if (!c[i + 8] && !c[i + 16] && !c[i + 24] && !c[i + 32] && !c[i + 40] && !c[i + 48] && !c[i + 56]) {
      const d = Math.imul(c[i], q[i]);
      for (let k = 0; k < 8; k++) ws[i + k * 8] = d;
      continue;
    }
    let t0 = Math.imul(c[i], q[i]), t1 = Math.imul(c[i + 16], q[i + 16]), t2 = Math.imul(c[i + 32], q[i + 32]), t3 = Math.imul(c[i + 48], q[i + 48]);
    const a10 = t0 + t2 | 0, a11 = t0 - t2 | 0, a13 = t1 + t3 | 0, a12 = (Math.imul(t1 - t3 | 0, 362) >> 8) - a13 | 0;
    t0 = a10 + a13 | 0; t3 = a10 - a13 | 0; t1 = a11 + a12 | 0; t2 = a11 - a12 | 0;
    const t4i = Math.imul(c[i + 8], q[i + 8]), t5i = Math.imul(c[i + 24], q[i + 24]), t6i = Math.imul(c[i + 40], q[i + 40]), t7i = Math.imul(c[i + 56], q[i + 56]);
    const z13 = t6i + t5i | 0, z10 = t6i - t5i | 0, z11 = t4i + t7i | 0, z12 = t4i - t7i | 0;
    const t7 = z11 + z13 | 0, b11 = Math.imul(z11 - z13 | 0, 362) >> 8, z5 = Math.imul(z10 + z12 | 0, 473) >> 8;
    const b10 = (Math.imul(z12, 277) >> 8) - z5 | 0, b12 = (Math.imul(z10, -669) >> 8) + z5 | 0;
    const t6 = b12 - t7 | 0, t5 = b11 - t6 | 0, t4 = b10 + t5 | 0;
    ws[i] = t0 + t7 | 0; ws[i + 56] = t0 - t7 | 0; ws[i + 8] = t1 + t6 | 0; ws[i + 48] = t1 - t6 | 0;
    ws[i + 16] = t2 + t5 | 0; ws[i + 40] = t2 - t5 | 0; ws[i + 32] = t3 + t4 | 0; ws[i + 24] = t3 - t4 | 0;
  }
  for (let f = 0; f < 8; f++) {
    const r = f * 8, w0 = ws[r], w1 = ws[r + 1], w2 = ws[r + 2], w3 = ws[r + 3], w4 = ws[r + 4], w5 = ws[r + 5], w6 = ws[r + 6], w7 = ws[r + 7];
    const a10 = w0 + w4 | 0, a11 = w0 - w4 | 0, a13 = w2 + w6 | 0, a12 = (Math.imul(w2 - w6 | 0, 362) >> 8) - a13 | 0;
    const t0 = a10 + a13 | 0, t3 = a10 - a13 | 0, t1 = a11 + a12 | 0, t2 = a11 - a12 | 0;
    const z13 = w5 + w3 | 0, z10 = w5 - w3 | 0, z11 = w1 + w7 | 0, z12 = w1 - w7 | 0;
    const t7 = z11 + z13 | 0, b11 = Math.imul(z11 - z13 | 0, 362) >> 8, z5 = Math.imul(z10 + z12 | 0, 473) >> 8;
    const b10 = (Math.imul(z12, 277) >> 8) - z5 | 0, b12 = (Math.imul(z10, -669) >> 8) + z5 | 0;
    const t6 = b12 - t7 | 0, t5 = b11 - t6 | 0, t4 = b10 + t5 | 0;
    sal[o + r] = salida(t0 + t7); sal[o + r + 7] = salida(t0 - t7); sal[o + r + 1] = salida(t1 + t6); sal[o + r + 6] = salida(t1 - t6);
    sal[o + r + 2] = salida(t2 + t5); sal[o + r + 5] = salida(t2 - t5); sal[o + r + 4] = salida(t3 + t4); sal[o + r + 3] = salida(t3 - t4);
  }
}

export function esPtx(b) { return b.length >= 16 && b[0] === 0x50 && b[1] === 0x54 && b[2] === 0x58 && b[3] === 0 && b[4] === 0 && b[5] === 1; }

export function leerCabeceraPtx(b) {
  if (!esPtx(b)) throw new Error('No es un .PTX');
  const u16 = (o) => b[o] | b[o + 1] << 8, tipo = u16(10);
  if (tipo !== 0x81 && tipo !== 0x82) throw new Error('.PTX de tipo desconocido: ' + tipo);
  return { ancho: u16(6) * 8, alto: u16(8) * 8, tipo, canales: tipo === 0x81 ? 3 : 4, calidad: u16(12) };
}

// Devuelve { ancho, alto, canales, calidad, pixeles } con pixeles = RGB o RGBA.
export function decodificarPtx(b) {
  const c = leerCabeceraPtx(b), { ancho, alto, canales } = c;
  const q = cuantizacion(c.calidad), bloques = (ancho * alto) / 64, planos = [];
  let o = 16;
  const coef = new Int32Array(64), ws = new Int32Array(64);
  for (let can = 0; can < canales; can++) {
    const clase = CLASE[can], plano = new Uint8Array(ancho * alto), r = new LectorBits(b, o);
    let pred = 0;
    for (let bl = 0; bl < bloques; bl++) {
      coef.fill(0);
      pred += r.extender(r.simbolo(DC[clase]));
      coef[0] = pred;
      for (let k = 1; k < 64;) {
        const s = r.simbolo(AC[clase]), corrida = s >> 4, tam = s & 15;
        if (!corrida && !tam) break;
        k += corrida;
        if (k >= 64) break;
        coef[ZIGZAG[k]] = r.extender(tam);
        k++;
      }
      inversa(coef, q, plano, bl * 64, ws);
    }
    planos.push(plano);
    o += (r.pos + 7) >> 3;
  }
  // Los bloques estan uno atras del otro en cada plano: se pasan a una imagen comun.
  const pixeles = new Uint8Array(ancho * alto * canales), Y = planos[0], B = planos[1], R = planos[2], A = planos[3];
  const anchoB = ancho / 8;
  for (let bl = 0; bl < bloques; bl++) {
    const bx = bl % anchoB, by = (bl - bx) / anchoB;
    for (let f = 0; f < 8; f++) for (let x = 0; x < 8; x++) {
      const i = bl * 64 + f * 8 + x, y = Y[i], cb = B[i] - 128, cr = R[i] - 128, d = ((by * 8 + f) * ancho + bx * 8 + x) * canales;
      pixeles[d] = limitar(y + ((Math.imul(cr, 91881) + 32768) >> 16));
      pixeles[d + 1] = limitar(y + ((Math.imul(cb, -22554) + 32768 + Math.imul(cr, -46802)) >> 16));
      pixeles[d + 2] = limitar(y + ((Math.imul(cb, 116130) + 32768) >> 16));
      if (canales === 4) pixeles[d + 3] = A[i];
    }
  }
  return { ancho, alto, canales, calidad: c.calidad, pixeles, consumido: o };
}

class EscritorBits {
  constructor() { this.o = []; this.acu = 0; this.n = 0; }
  bits(v, n) { for (let i = n - 1; i >= 0; i--) { this.acu = (this.acu << 1) | ((v >>> i) & 1); if (++this.n === 8) { this.o.push(this.acu); this.acu = 0; this.n = 0; } } }
  cerrar() { if (this.n) { this.o.push(this.acu << (8 - this.n)); this.acu = 0; this.n = 0; } }
}

const COS = (() => { const t = new Float64Array(64); for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) t[x * 8 + u] = Math.cos((2 * x + 1) * u * Math.PI / 16) * (u ? 1 : Math.SQRT1_2) / 2; return t; })();
const categoria = (v) => { let a = Math.abs(v), n = 0; while (a) { n++; a >>= 1; } return n; };

// pixeles = RGB (canales 3) o RGBA (canales 4). Lados multiplos de 8, hasta 256 (el juego no acepta mas).
export function codificarPtx({ ancho, alto, canales, pixeles }, calidad = 300) {
  if (ancho % 8 || alto % 8 || ancho < 8 || alto < 8 || ancho > 256 || alto > 256) throw new Error('.PTX: los lados tienen que ser multiplos de 8, hasta 256');
  if (canales !== 3 && canales !== 4) throw new Error('.PTX: tiene que ser RGB o RGBA');
  if (calidad < 1 || calidad > 65535) throw new Error('.PTX: calidad fuera de rango');
  const piezas = [], cab = new Uint8Array(16), p16 = (o, v) => { cab[o] = v & 255; cab[o + 1] = v >> 8; };
  cab.set([0x50, 0x54, 0x58, 0]); p16(4, 256); p16(6, ancho / 8); p16(8, alto / 8); p16(10, canales === 3 ? 0x81 : 0x82); p16(12, calidad);
  piezas.push(cab);
  const paso = CUANT.map(v => v * 100 / calidad);
  const entrada = new Float64Array(64), medio = new Float64Array(64), fre = new Float64Array(64);
  for (let can = 0; can < canales; can++) {
    const clase = CLASE[can], w = new EscritorBits();
    let pred = 0;
    for (let by = 0; by < alto / 8; by++) for (let bx = 0; bx < ancho / 8; bx++) {
      for (let f = 0; f < 8; f++) for (let x = 0; x < 8; x++) {
        const i = ((by * 8 + f) * ancho + bx * 8 + x) * canales, r = pixeles[i], g = pixeles[i + 1], b = pixeles[i + 2];
        entrada[f * 8 + x] = (can === 0 ? 0.299 * r + 0.587 * g + 0.114 * b
          : can === 1 ? -0.168736 * r - 0.331264 * g + 0.5 * b + 128
            : can === 2 ? 0.5 * r - 0.418688 * g - 0.081312 * b + 128 : pixeles[i + 3]) - 128;
      }
      for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) {       // primero por filas y despues por columnas
        let s = 0;
        for (let x = 0; x < 8; x++) s += entrada[y * 8 + x] * COS[x * 8 + u];
        medio[y * 8 + u] = s;
      }
      for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
        let s = 0;
        for (let y = 0; y < 8; y++) s += medio[y * 8 + u] * COS[y * 8 + v];
        fre[v * 8 + u] = s;
      }
      const dc = Math.round(fre[0] / paso[0]), dif = dc - pred;
      pred = dc;
      const n = categoria(dif);
      if (n > 11) throw new Error('.PTX: valor fuera de rango');
      const [l, c] = DC[clase].escribir.get(n);
      w.bits(c, l);
      if (n) w.bits(dif < 0 ? dif + (1 << n) - 1 : dif, n);
      let corrida = 0;
      for (let k = 1; k < 64; k++) {
        let a = Math.round(fre[ZIGZAG[k]] / paso[ZIGZAG[k]]);
        if (a > 1023) a = 1023; else if (a < -1023) a = -1023;
        if (!a) { corrida++; continue; }
        while (corrida > 15) { const [lz, cz] = AC[clase].escribir.get(0xF0); w.bits(cz, lz); corrida -= 16; }
        const m = categoria(a), [la, ca] = AC[clase].escribir.get(corrida << 4 | m);
        w.bits(ca, la); w.bits(a < 0 ? a + (1 << m) - 1 : a, m);
        corrida = 0;
      }
      if (corrida) { const [le, ce] = AC[clase].escribir.get(0); w.bits(ce, le); }
    }
    w.cerrar();
    piezas.push(Uint8Array.from(w.o));
  }
  const total = piezas.reduce((s, q) => s + q.length, 0), o = new Uint8Array(total);
  let d = 0;
  for (const q of piezas) { o.set(q, d); d += q.length; }
  return o;
}
