// inflate de zlib 1.1.3 y el filtro de filas de libpng 1.0.6, en JavaScript nativo en lugar de traducidos.
// Descomprimir los PNG era ~70 % del tiempo de carga (medido con PIU_MEDIR en tools\recompilador\arrancar.mjs).
// Hacen lo mismo que el original: mismos bytes de salida, mismos campos del z_stream, mismos codigos de retorno y
// mismos mensajes de error (los textos de zlib que estan en los datos del exe). libpng sigue siendo la traducida.
//   inflate(z = EAX, flush = EDX)                                0x106554
//   inflateEnd(z = EAX)                                           0x1063A0 (se envuelve: libera el estado nativo)
//   png_read_filter_row(png = EAX, info = EDX, fila = EBX, previa = ECX, filtro = pila)   0x101284 (ret 4)
// z_stream (32 bits): next_in 0, avail_in 4, total_in 8, next_out 0xC, avail_out 0x10, total_out 0x14, msg 0x18,
// state 0x1C, ..., adler 0x30. Estado interno de zlib: nowrap en +0xC, wbits en +0x10.
import { R, M8, HLE, FN, EAX, EDX, EBX, ECX, ESP, r32, w32 } from './cpu.js';

const Z_OK = 0, Z_STREAM_END = 1, Z_NEED_DICT = 2, Z_STREAM_ERROR = -2, Z_DATA_ERROR = -3, Z_BUF_ERROR = -5, Z_FINISH = 4;
const MSG = {
  metodo: 0x13ae28, ventana: 0x13ae44, cabecera: 0x13ae58, diccionario: 0x13ae70, chequeo: 0x13ae80,
  tipo: 0x13adac, guardado: 0x13adc0, demasiados: 0x13ade0, repeticion: 0x13ae04, literal: 0x13ac6c, distancia: 0x13ac54,
  bitsSobre: 0x13acbc, bitsIncompleto: 0x13ace4, litSobre: 0x13ad08, litIncompleto: 0x13ad2c,
  distSobre: 0x13ad4c, distIncompleto: 0x13ad6c, distVacio: 0x13ad88,
};
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDEN = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// Tabla de Huffman para leer el bit menos significativo primero: entrada = (largo << 16) | simbolo (largo 0 = invalido).
// Devuelve 'vacia', 'sobre' (sobresuscripta) o { t, bits, mascara, incompleta } con el mismo criterio que huft_build
// de zlib 1.1.3 (incompleta solo cuenta si el codigo mas largo pasa de 1 bit).
function armarTabla(largos, n) {
  const cuenta = new Uint16Array(16);
  let max = 0;
  for (let i = 0; i < n; i++) { const l = largos[i]; if (l) { cuenta[l]++; if (l > max) max = l; } }
  if (max === 0) return 'vacia';
  let sobra = 1;
  for (let l = 1; l <= 15; l++) { sobra = sobra * 2 - cuenta[l]; if (sobra < 0) return 'sobre'; }
  const sig = new Uint16Array(16);
  for (let l = 1, c = 0; l <= 15; l++) { c = (c + cuenta[l - 1]) << 1; sig[l] = c; }
  const tam = 1 << max, t = new Int32Array(tam);
  for (let s = 0; s < n; s++) {
    const L = largos[s];
    if (!L) continue;
    let cod = sig[L]++, rev = 0;
    for (let i = 0; i < L; i++) { rev = (rev << 1) | (cod & 1); cod >>= 1; }
    for (let j = rev; j < tam; j += 1 << L) t[j] = (L << 16) | s;
  }
  return { t, bits: max, mascara: tam - 1, incompleta: sobra > 0 && max !== 1 };
}
const FIJA_LIT = (() => { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288); return armarTabla(l, 288); })();
const FIJA_DIST = armarTabla(new Uint8Array(30).fill(5), 30);

const CABECERA = 0, DICT = 1, DICT0 = 2, TIPO = 3, GUARDADO = 4, COPIA = 5, TABLA = 6, CODIGOS = 7, SECO = 8, CHEQUEO = 9, HECHO = 10, MALO = 11;
const FALTA = { falta: true };   // se acabo la entrada en medio de un paso: se deshace el paso y se sigue en la proxima llamada

class Inflador {
  constructor(wbits) {
    this.wbits = wbits; this.W = 1 << wbits; this.ventana = new Uint8Array(this.W);
    this.q = new Uint8Array(4096);   // bytes tomados del z_stream durante el paso actual (por si hay que deshacerlo)
  }
  reiniciar(sinCabecera) {
    this.sinCabecera = sinCabecera; this.modo = sinCabecera ? TIPO : CABECERA;
    this.bb = 0; this.bk = 0; this.qn = 0; this.qp = 0;
    this.w = 0; this.pend = 0;        // posicion de escritura en la ventana y bytes todavia sin entregar
    this.final = 0; this.resto = 0; this.lit = null; this.dist = null;
    this.s1 = 1; this.s2 = 0; this.usado = false;
  }
  // ---- entrada ----
  tomar() {
    if (this.qp < this.qn) return this.q[this.qp++];
    if (this.ai === 0) return -1;
    const b = M8[this.ni];
    this.ni = (this.ni + 1) >>> 0; this.ai--; this.ti = (this.ti + 1) >>> 0; this.tomados++;
    this.q[this.qn++] = b; this.qp++;
    return b;
  }
  bits(n) {
    while (this.bk < n) { const b = this.tomar(); if (b < 0) throw FALTA; this.bb |= b << this.bk; this.bk += 8; }
    const v = this.bb & ((1 << n) - 1);
    this.bb >>>= n; this.bk -= n;
    return v;
  }
  simbolo(tab) {
    for (;;) {
      const e = tab.t[this.bb & tab.mascara], L = e >>> 16;
      if (L !== 0 && L <= this.bk) { this.bb >>>= L; this.bk -= L; return e & 0xFFFF; }
      if (this.bk >= tab.bits) return -1;
      const b = this.tomar(); if (b < 0) throw FALTA;
      this.bb |= b << this.bk; this.bk += 8;
    }
  }
  marcar() { this.cbb = this.bb; this.cbk = this.bk; this.cqp = this.qp; }
  volver() { this.bb = this.cbb; this.bk = this.cbk; this.qp = this.cqp; }
  confirmar() {
    if (this.qp >= this.qn) this.qp = this.qn = 0;
    else { this.q.copyWithin(0, this.qp, this.qn); this.qn -= this.qp; this.qp = 0; }
  }
  // ---- salida: de la ventana al next_out, con el adler32 de lo entregado (como inflate_flush) ----
  entregar() {
    let n = Math.min(this.pend, this.ao);
    if (!n) return;
    const Wm = this.W - 1;
    let desde = (this.w - this.pend) & Wm;
    this.pend -= n; this.ao -= n; this.to = (this.to + n) >>> 0; this.entregados += n;
    while (n) {
      const k = Math.min(n, this.W - desde), trozo = this.ventana.subarray(desde, desde + k);
      M8.set(trozo, this.no);
      if (!this.sinCabecera) this.adler(trozo);
      this.no = (this.no + k) >>> 0; desde = (desde + k) & Wm; n -= k;
    }
  }
  adler(b) {
    let s1 = this.s1, s2 = this.s2, i = 0;
    while (i < b.length) {
      const fin = Math.min(b.length, i + 5552);
      for (; i < fin; i++) { s1 += b[i]; s2 += s1; }
      s1 %= 65521; s2 %= 65521;
    }
    this.s1 = s1; this.s2 = s2;
  }
  error(msg) { this.modo = MALO; this.msg = msg; return Z_DATA_ERROR; }
  // volver al llamador entregando lo que se pueda (como el LEAVE de zlib); sin avance = Z_BUF_ERROR
  salir(f) { this.entregar(); return (this.tomados || this.entregados) ? (f === Z_FINISH ? Z_BUF_ERROR : Z_OK) : Z_BUF_ERROR; }

  correr(f) {
    const V = this.ventana, Wm = this.W - 1, lleno = this.W - 259;
    try {
      for (;;) {
        this.entregar();
        switch (this.modo) {
          case CABECERA: {
            this.marcar();
            const cmf = this.bits(8), flg = this.bits(8);
            this.confirmar();
            if ((cmf & 0xF) !== 8) return this.error(MSG.metodo);
            if ((cmf >> 4) + 8 > this.wbits) return this.error(MSG.ventana);
            if (((cmf << 8) + flg) % 31) return this.error(MSG.cabecera);
            this.modo = (flg & 0x20) ? DICT : TIPO;
            break;
          }
          case DICT: {
            this.marcar();
            const id = ((this.bits(8) << 24) | (this.bits(8) << 16) | (this.bits(8) << 8) | this.bits(8)) >>> 0;
            this.confirmar();
            this.adlerFijo = id; this.modo = DICT0;
            return Z_NEED_DICT;
          }
          case DICT0: this.modo = MALO; this.msg = MSG.diccionario; return Z_STREAM_ERROR;
          case TIPO: {
            this.marcar();
            const v = this.bits(3);
            this.confirmar();
            this.final = v & 1;
            const tipo = v >> 1;
            if (tipo === 0) { this.bb = 0; this.bk = 0; this.modo = GUARDADO; }   // el resto del byte no se usa
            else if (tipo === 1) { this.lit = FIJA_LIT; this.dist = FIJA_DIST; this.modo = CODIGOS; }
            else if (tipo === 2) this.modo = TABLA;
            else return this.error(MSG.tipo);
            break;
          }
          case GUARDADO: {
            this.marcar();
            const len = this.bits(16), nlen = this.bits(16);
            this.confirmar();
            if (len !== (~nlen & 0xFFFF)) return this.error(MSG.guardado);
            this.resto = len;
            this.modo = len ? COPIA : (this.final ? SECO : TIPO);
            break;
          }
          case COPIA: {
            while (this.resto) {
              if (this.pend >= this.W - 1) { this.entregar(); if (this.pend >= this.W - 1) return this.salir(f); }
              let n = Math.min(this.resto, this.W - 1 - this.pend, this.ai + this.qn - this.qp);
              if (!n) return this.salir(f);
              this.resto -= n; this.pend += n;
              while (n--) { V[this.w] = this.tomar(); this.w = (this.w + 1) & Wm; }
              this.confirmar();
            }
            this.modo = this.final ? SECO : TIPO;
            break;
          }
          case TABLA: {
            this.marcar();
            const nlit = this.bits(5) + 257, ndist = this.bits(5) + 1, ncod = this.bits(4) + 4;
            if (nlit > 286 || ndist > 30) { this.confirmar(); return this.error(MSG.demasiados); }
            const lc = new Uint8Array(19);
            for (let i = 0; i < ncod; i++) lc[ORDEN[i]] = this.bits(3);
            const tc = armarTabla(lc, 19);
            if (tc === 'sobre') { this.confirmar(); return this.error(MSG.bitsSobre); }
            if (tc === 'vacia' || tc.incompleta) { this.confirmar(); return this.error(MSG.bitsIncompleto); }
            const total = nlit + ndist, largos = new Uint8Array(total);
            for (let i = 0; i < total;) {
              const s = this.simbolo(tc);
              if (s < 0) { this.confirmar(); return this.error(MSG.repeticion); }
              if (s < 16) { largos[i++] = s; continue; }
              let rep, val = 0;
              if (s === 16) { rep = 3 + this.bits(2); if (i < 1) { this.confirmar(); return this.error(MSG.repeticion); } val = largos[i - 1]; }
              else if (s === 17) rep = 3 + this.bits(3);
              else rep = 11 + this.bits(7);
              if (i + rep > total) { this.confirmar(); return this.error(MSG.repeticion); }
              while (rep--) largos[i++] = val;
            }
            this.confirmar();
            const tl = armarTabla(largos, nlit);
            if (tl === 'sobre') return this.error(MSG.litSobre);
            if (tl === 'vacia' || tl.incompleta) return this.error(MSG.litIncompleto);
            const td = armarTabla(largos.subarray(nlit), ndist);
            if (td === 'sobre') return this.error(MSG.distSobre);
            if (td === 'vacia') { if (nlit > 257) return this.error(MSG.distVacio); }
            else if (td.incompleta) return this.error(MSG.distIncompleto);
            this.lit = tl; this.dist = td === 'vacia' ? null : td; this.modo = CODIGOS;
            break;
          }
          case CODIGOS: {
            const lit = this.lit, dist = this.dist;
            for (;;) {
              if (this.pend > lleno) { this.entregar(); if (this.pend > lleno) return this.salir(f); }
              this.marcar();
              const s = this.simbolo(lit);
              if (s < 256) {
                if (s < 0) { this.confirmar(); return this.error(MSG.literal); }
                this.confirmar();
                V[this.w] = s; this.w = (this.w + 1) & Wm; this.pend++;
                continue;
              }
              if (s === 256) { this.confirmar(); this.modo = this.final ? SECO : TIPO; break; }
              const li = s - 257;
              if (li >= 29) { this.confirmar(); return this.error(MSG.literal); }
              let largo = LBASE[li] + (LEXTRA[li] ? this.bits(LEXTRA[li]) : 0);
              const d = dist ? this.simbolo(dist) : -1;
              if (d < 0 || d >= 30) { this.confirmar(); return this.error(MSG.distancia); }
              const distancia = DBASE[d] + (DEXTRA[d] ? this.bits(DEXTRA[d]) : 0);
              this.confirmar();
              let de = (this.w - distancia) & Wm, w = this.w;
              this.pend += largo;
              while (largo--) { V[w] = V[de]; w = (w + 1) & Wm; de = (de + 1) & Wm; }
              this.w = w;
            }
            break;
          }
          case SECO:   // termino el ultimo bloque: primero se entrega todo (como el DRY de zlib)
            if (this.pend) return this.salir(f);
            this.bb = 0; this.bk = 0;
            this.modo = this.sinCabecera ? HECHO : CHEQUEO;
            break;
          case CHEQUEO: {
            this.marcar();
            const v = ((this.bits(8) << 24) | (this.bits(8) << 16) | (this.bits(8) << 8) | this.bits(8)) >>> 0;
            this.confirmar();
            if (v !== (((this.s2 << 16) | this.s1) >>> 0)) return this.error(MSG.chequeo);
            this.modo = HECHO;
            break;
          }
          case HECHO: return Z_STREAM_END;
          default: return Z_DATA_ERROR;   // MALO
        }
      }
    } catch (e) {
      if (e !== FALTA) throw e;
      this.volver();
      return this.salir(f);
    }
  }
}

// estado nativo de cada z_stream (por direccion); se libera en inflateEnd
const estados = new Map();
const sobrantes = [];
export function reiniciarZlib() { estados.clear(); }   // al volver a arrancar el programa en el mismo hilo

HLE[0x106554] = () => {
  const z = R[EAX] >>> 0, f = R[EDX] | 0;
  const estado = z ? r32(z + 0x1C) >>> 0 : 0;
  if (!z || !estado || !r32(z)) { R[EAX] = Z_STREAM_ERROR; return 0; }
  let st = estados.get(z);
  const ti = r32(z + 8) >>> 0, to = r32(z + 0x14) >>> 0;
  if (!st || st.estado !== estado || (ti === 0 && to === 0 && st.usado)) {   // nuevo, o inflateInit / inflateReset
    const wbits = r32(estado + 0x10), sinCabecera = r32(estado + 0xC) !== 0;
    if (!st || st.wbits !== wbits) {
      st = null;
      for (let i = 0; i < sobrantes.length; i++) if (sobrantes[i].wbits === wbits) { st = sobrantes.splice(i, 1)[0]; break; }
      if (!st) st = new Inflador(wbits);
    }
    st.reiniciar(sinCabecera); st.estado = estado; estados.set(z, st);
  }
  st.ni = r32(z) >>> 0; st.ai = r32(z + 4) >>> 0; st.ti = ti;
  st.no = r32(z + 0xC) >>> 0; st.ao = r32(z + 0x10) >>> 0; st.to = to;
  st.tomados = 0; st.entregados = 0; st.msg = 0; st.adlerFijo = -1;
  const ret = st.correr(f);
  if (st.tomados) st.usado = true;
  w32(z, st.ni); w32(z + 4, st.ai); w32(z + 8, st.ti);
  w32(z + 0xC, st.no); w32(z + 0x10, st.ao); w32(z + 0x14, st.to);
  if (st.msg) w32(z + 0x18, st.msg);
  if (st.adlerFijo >= 0) w32(z + 0x30, st.adlerFijo);
  else if (!st.sinCabecera) w32(z + 0x30, ((st.s2 << 16) | st.s1) >>> 0);
  R[EAX] = ret;
  return 0;
};

// inflateEnd: el original libera lo suyo; aca se suelta el estado nativo (las ventanas se reusan)
HLE[0x1063A0] = () => {
  const z = R[EAX] >>> 0, st = estados.get(z);
  if (st) { estados.delete(z); if (sobrantes.length < 8) sobrantes.push(st); }
  FN[0x1063A0]();   // corre el original con la misma pila: su "ret" ya saca la direccion de vuelta
  return -4;
};

// png_read_filter_row: deshace el filtro de una fila (Sub, Up, Average, Paeth) igual que libpng 1.0.6
HLE[0x101284] = () => {
  const filtro = r32(R[ESP] + 4);
  if (filtro < 0 || filtro > 4) { FN[0x101284](); return -4; }   // filtro invalido: el original avisa y pone 0
  const info = R[EDX] >>> 0, fila = R[EBX] >>> 0, previa = R[ECX] >>> 0;
  const n = r32(info + 4) >>> 0, bpp = (M8[info + 0xB] + 7) >> 3;
  const a = M8;
  switch (filtro) {
    case 1: for (let i = bpp; i < n; i++) a[fila + i] = a[fila + i] + a[fila + i - bpp]; break;
    case 2: for (let i = 0; i < n; i++) a[fila + i] = a[fila + i] + a[previa + i]; break;
    case 3:
      for (let i = 0; i < bpp; i++) a[fila + i] = a[fila + i] + (a[previa + i] >> 1);
      for (let i = bpp; i < n; i++) a[fila + i] = a[fila + i] + ((a[previa + i] + a[fila + i - bpp]) >> 1);
      break;
    case 4:
      for (let i = 0; i < bpp; i++) a[fila + i] = a[fila + i] + a[previa + i];
      for (let i = bpp; i < n; i++) {
        const x = a[fila + i - bpp], b = a[previa + i], c = a[previa + i - bpp];
        const pa = Math.abs(b - c), pb = Math.abs(x - c), pc = Math.abs(b - c + x - c);
        a[fila + i] = a[fila + i] + ((pa <= pb && pa <= pc) ? x : (pb <= pc) ? b : c);
      }
      break;
  }
  return 4;
};
