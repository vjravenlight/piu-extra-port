// Entorno de ejecucion del codigo traducido de Piu.exe (x86 de 32 bits, modelo plano).
// Memoria plana, registros, banderas perezosas, FPU x87 y operaciones de cadena.
// El codigo traducido (generado por tools\recompilador\traducir.mjs) usa estos nombres cortos.

export const TAM_MEMORIA = 0x4000000;              // 64 MB de espacio de direcciones
export const buf = new ArrayBuffer(TAM_MEMORIA);
export const M = new DataView(buf);
export const M8 = new Uint8Array(buf);
// registros: 0 eax, 1 ecx, 2 edx, 3 ebx, 4 esp, 5 ebp, 6 esi, 7 edi
export const R = new Int32Array(8);
export const EAX = 0, ECX = 1, EDX = 2, EBX = 3, ESP = 4, EBP = 5, ESI = 6, EDI = 7;

// ---------- memoria ----------
export const r8 = (a) => M8[a >>> 0];
export const r16 = (a) => M.getUint16(a >>> 0, true);
export const r32 = (a) => M.getInt32(a >>> 0, true);
export const w8 = (a, v) => { M8[a >>> 0] = v; };
export const w16 = (a, v) => { M.setUint16(a >>> 0, v & 0xFFFF, true); };
export const w32 = (a, v) => { M.setInt32(a >>> 0, v | 0, true); };
export const push = (v) => { R[ESP] -= 4; M.setInt32(R[ESP] >>> 0, v | 0, true); };
export const pop = () => { const v = M.getInt32(R[ESP] >>> 0, true); R[ESP] += 4; return v; };
export function cargar(direccion, bytes) { M8.set(bytes, direccion); }
export function leerTexto(a, max = 4096) { let s = ''; for (let i = 0; i < max; i++) { const c = M8[(a + i) >>> 0]; if (!c) break; s += String.fromCharCode(c); } return s; }
export function escribirTexto(a, s) { for (let i = 0; i < s.length; i++) M8[a + i] = s.charCodeAt(i) & 0xFF; M8[a + s.length] = 0; }

// ---------- banderas (perezosas) ----------
// F.op: 0 explicitas, 1 suma, 2 resta, 3 logica, 4 inc, 5 dec, 6 desplazamiento, 7 neg, 8 imul (cf/of en F.cf)
// F.a, F.b: operandos; F.r: resultado; F.n: bits (8/16/32); F.cf/F.zf/F.sf/F.of/F.pf para el modo explicito
export const F = { op: 0, a: 0, b: 0, r: 0, n: 32, cf: 0, zf: 0, sf: 0, of: 0, pf: 0, df: 0 };
const msk = (n) => n === 32 ? 0xFFFFFFFF : n === 16 ? 0xFFFF : 0xFF;
const sgn = (v, n) => n === 32 ? v | 0 : n === 16 ? (v << 16) >> 16 : (v << 24) >> 24;
const uns = (v, n) => n === 32 ? v >>> 0 : v & msk(n);
export function fij(op, a, b, r, n) { F.op = op; F.a = a; F.b = b; F.r = r; F.n = n; }
export function cf() {
  switch (F.op) {
    case 0: case 6: case 8: case 4: case 5: return F.cf;
    case 1: return (uns(F.a, F.n) + uns(F.b, F.n) + (F.carry || 0)) > msk(F.n) ? 1 : 0;
    case 2: return (uns(F.a, F.n) < uns(F.b, F.n) + (F.carry || 0)) ? 1 : 0;
    case 3: return 0;
    case 7: return uns(F.a, F.n) !== 0 ? 1 : 0;
  }
  return 0;
}
export function zf() { return F.op === 0 ? F.zf : (uns(F.r, F.n) === 0 ? 1 : 0); }
export function sf() { return F.op === 0 ? F.sf : (sgn(F.r, F.n) < 0 ? 1 : 0); }
export function of() {
  const n = F.n, a = sgn(F.a, n), b = sgn(F.b, n), r = sgn(F.r, n);
  switch (F.op) {
    case 0: case 6: case 8: return F.of;
    case 1: return ((a ^ r) & (b ^ r)) < 0 ? 1 : 0;
    case 2: return ((a ^ b) & (a ^ r)) < 0 ? 1 : 0;
    case 3: return 0;
    case 4: return r === sgn(1 << (n - 1), n) ? 1 : 0;           // inc: desborda al pasar a negativo maximo
    case 5: return a === sgn(1 << (n - 1), n) ? 1 : 0;           // dec: desde el negativo maximo
    case 7: return a === sgn(1 << (n - 1), n) ? 1 : 0;
  }
  return 0;
}
export function pf() {
  if (F.op === 0) return F.pf;
  let v = F.r & 0xFF; v ^= v >> 4; v ^= v >> 2; v ^= v >> 1; return (v & 1) ? 0 : 1;
}
// condiciones de los saltos
export const c_o = () => of(), c_no = () => 1 - of();
export const c_b = () => cf(), c_ae = () => 1 - cf();
export const c_e = () => zf(), c_ne = () => 1 - zf();
export const c_be = () => cf() | zf(), c_a = () => (cf() | zf()) ^ 1;
export const c_s = () => sf(), c_ns = () => 1 - sf();
export const c_p = () => pf(), c_np = () => 1 - pf();
export const c_l = () => sf() ^ of(), c_ge = () => 1 - (sf() ^ of());
export const c_le = () => zf() | (sf() ^ of()), c_g = () => 1 - (zf() | (sf() ^ of()));
// antes de inc/dec: guardar el acarreo actual (inc/dec no lo tocan)
export function guardarCf() { F.cf = cf(); }
export function explicitas(c, z, s, o, p) { F.op = 0; F.cf = c; F.zf = z; F.sf = s; F.of = o; F.pf = p; }
// sahf: SF ZF AF PF CF desde AH
export function sahf() { const ah = (R[EAX] >> 8) & 0xFF; guardarParaExplicitas(); F.op = 0; F.sf = (ah >> 7) & 1; F.zf = (ah >> 6) & 1; F.pf = (ah >> 2) & 1; F.cf = ah & 1; }
function guardarParaExplicitas() { if (F.op !== 0) { const c = cf(), z = zf(), s = sf(), o = of(), p = pf(); F.cf = c; F.zf = z; F.sf = s; F.of = o; F.pf = p; } }
export function lahf() { const v = (sf() << 7) | (zf() << 6) | (pf() << 2) | 2 | cf(); R[EAX] = (R[EAX] & ~0xFF00) | (v << 8); }
export function fijarCf(v) { guardarParaExplicitas(); F.op = 0; F.cf = v ? 1 : 0; }
export function pushfd() { push((cf()) | (pf() << 2) | (zf() << 6) | (sf() << 7) | (F.df << 10) | (of() << 11) | 0x202); }
export function popfd() { const v = pop(); F.op = 0; F.cf = v & 1; F.pf = (v >> 2) & 1; F.zf = (v >> 6) & 1; F.sf = (v >> 7) & 1; F.df = (v >> 10) & 1; F.of = (v >> 11) & 1; }

// ---------- aritmetica con banderas ----------
export function add(a, b, n) { const r = sgn(a + b, n); fij(1, a, b, r, n); F.carry = 0; return r; }
export function adc(a, b, n) { const c = cf(); const r = sgn(a + b + c, n); fij(1, a, b, r, n); F.carry = c; return r; }
export function sub(a, b, n) { const r = sgn(a - b, n); fij(2, a, b, r, n); F.carry = 0; return r; }
export function sbb(a, b, n) { const c = cf(); const r = sgn(a - b - c, n); fij(2, a, b, r, n); F.carry = c; return r; }
export function logica(r, n) { r = sgn(r, n); fij(3, 0, 0, r, n); return r; }
export function inc(a, n) { guardarCf(); const r = sgn(a + 1, n); fij(4, a, 1, r, n); return r; }
export function dec(a, n) { guardarCf(); const r = sgn(a - 1, n); fij(5, a, 1, r, n); return r; }
export function neg(a, n) { const r = sgn(-a, n); fij(7, a, 0, r, n); return r; }
export function shl(a, c, n) {
  c &= 31; if (!c) return a;
  const u = uns(a, n), r = sgn(c < 32 ? u << c : 0, n);
  const ult = c <= n ? (u >>> (n - c)) & 1 : 0;
  fij(6, a, c, r, n); F.cf = ult; F.of = c === 1 ? (((r >>> (n - 1)) & 1) ^ ult) : 0; return r;
}
export function shr(a, c, n) {
  c &= 31; if (!c) return a;
  const u = uns(a, n), r = sgn(u >>> c, n);
  fij(6, a, c, r, n); F.cf = (u >>> (c - 1)) & 1; F.of = c === 1 ? (u >>> (n - 1)) & 1 : 0; return r;
}
export function sar(a, c, n) {
  c &= 31; if (!c) return a;
  const s = sgn(a, n), r = sgn(s >> Math.min(c, 31), n);
  fij(6, a, c, r, n); F.cf = (s >> Math.min(c - 1, 31)) & 1; F.of = 0; return r;
}
export function rol(a, c, n) { c &= 31; const k = c % n; if (!c) return a; const u = uns(a, n); const r = sgn(k ? ((u << k) | (u >>> (n - k))) : u, n); guardarParaExplicitas(); F.op = 0; F.cf = r & 1; return r; }
export function ror(a, c, n) { c &= 31; const k = c % n; if (!c) return a; const u = uns(a, n); const r = sgn(k ? ((u >>> k) | (u << (n - k))) : u, n); guardarParaExplicitas(); F.op = 0; F.cf = (uns(r, n) >>> (n - 1)) & 1; return r; }
export function rcl(a, c, n) { c = (c & 31) % (n + 1); let u = uns(a, n), carry = cf(); for (let i = 0; i < c; i++) { const nc = (u >>> (n - 1)) & 1; u = uns((u << 1) | carry, n); carry = nc; } guardarParaExplicitas(); F.op = 0; F.cf = carry; return sgn(u, n); }
export function rcr(a, c, n) { c = (c & 31) % (n + 1); let u = uns(a, n), carry = cf(); for (let i = 0; i < c; i++) { const nc = u & 1; u = (u >>> 1) | (carry << (n - 1)); u = uns(u, n); carry = nc; } guardarParaExplicitas(); F.op = 0; F.cf = carry; return sgn(u, n); }
// multiplicaciones y divisiones
// producto de 32x32 bits sin signo -> [bajo, alto] sin BigInt (en mitades de 16 bits)
function mulU32(a, b) {
  a >>>= 0; b >>>= 0;
  const al = a & 0xFFFF, ah = a >>> 16, bl = b & 0xFFFF, bh = b >>> 16;
  const ll = al * bl, lh = al * bh, hl = ah * bl, hh = ah * bh;
  const medio = (ll >>> 16) + (lh & 0xFFFF) + (hl & 0xFFFF);
  const bajo = ((medio & 0xFFFF) << 16) | (ll & 0xFFFF);
  const alto = hh + (lh >>> 16) + (hl >>> 16) + Math.floor(medio / 65536);
  return [bajo | 0, alto | 0];
}
export function imul2(a, b, n) {
  // el producto exacto como double sirve para saber si desborda: si entra en 32 bits, el double es exacto
  const exacto = sgn(a, n) * sgn(b, n), r = sgn(Math.imul(a, b), n);
  fij(8, a, b, r, n); F.cf = F.of = (exacto !== r) ? 1 : 0; return r;
}
export function mul1(v, n) {   // mul r/m: EDX:EAX = EAX * v
  if (n === 32) { const [lo, hi] = mulU32(R[EAX], v); R[EAX] = lo; R[EDX] = hi; F.op = 0; F.cf = F.of = hi !== 0 ? 1 : 0; }
  else if (n === 8) { const p = (R[EAX] & 0xFF) * (v & 0xFF); R[EAX] = (R[EAX] & ~0xFFFF) | (p & 0xFFFF); F.op = 0; F.cf = F.of = (p >> 8) ? 1 : 0; }
  else { const p = (R[EAX] & 0xFFFF) * (v & 0xFFFF); R[EAX] = (R[EAX] & ~0xFFFF) | (p & 0xFFFF); R[EDX] = (R[EDX] & ~0xFFFF) | ((p >>> 16) & 0xFFFF); F.op = 0; F.cf = F.of = (p >>> 16) ? 1 : 0; }
}
export function imul1(v, n) {
  if (n === 32) {
    const a = R[EAX], b = v | 0, neg = (a < 0) !== (b < 0);
    let [lo, hi] = mulU32(Math.abs(a), Math.abs(b));
    if (neg) { lo = ~lo; hi = ~hi; lo = (lo + 1) | 0; if (lo === 0) hi = (hi + 1) | 0; }   // complemento a dos de 64 bits
    R[EAX] = lo; R[EDX] = hi; F.op = 0; F.cf = F.of = (hi !== (lo >> 31)) ? 1 : 0;
  }
  else if (n === 8) { const p = ((R[EAX] << 24) >> 24) * ((v << 24) >> 24); R[EAX] = (R[EAX] & ~0xFFFF) | (p & 0xFFFF); F.op = 0; F.cf = F.of = (p !== ((p << 24) >> 24)) ? 1 : 0; }
  else { const p = ((R[EAX] << 16) >> 16) * ((v << 16) >> 16); R[EAX] = (R[EAX] & ~0xFFFF) | (p & 0xFFFF); R[EDX] = (R[EDX] & ~0xFFFF) | ((p >> 16) & 0xFFFF); F.op = 0; F.cf = F.of = (p !== ((p << 16) >> 16)) ? 1 : 0; }
}
export function div1(v, n) {
  if (n === 32) {
    const dd = v >>> 0; if (!dd) throw new Error('division por cero');
    if (R[EDX] === 0) { const a = R[EAX] >>> 0; R[EAX] = Math.floor(a / dd) | 0; R[EDX] = (a % dd) | 0; return; }   // caso comun, sin BigInt
    const d = BigInt(dd); const num = (BigInt(R[EDX] >>> 0) << 32n) | BigInt(R[EAX] >>> 0); const q = num / d; if (q > 0xFFFFFFFFn) throw new Error('desborde en div'); R[EAX] = Number(q) | 0; R[EDX] = Number(num % d) | 0;
  }
  else if (n === 8) { const d = v & 0xFF; if (!d) throw new Error('division por cero'); const num = R[EAX] & 0xFFFF; R[EAX] = (R[EAX] & ~0xFFFF) | (Math.floor(num / d) & 0xFF) | ((num % d) << 8); }
  else { const d = v & 0xFFFF; if (!d) throw new Error('division por cero'); const num = (((R[EDX] & 0xFFFF) << 16) | (R[EAX] & 0xFFFF)) >>> 0; R[EAX] = (R[EAX] & ~0xFFFF) | (Math.floor(num / d) & 0xFFFF); R[EDX] = (R[EDX] & ~0xFFFF) | (num % d); }
}
export function idiv1(v, n) {
  if (n === 32) {
    const d = v | 0; if (!d) throw new Error('division por cero');
    if (R[EDX] === (R[EAX] >> 31)) { const a = R[EAX]; const q = (a / d) | 0; if (q === -2147483648 && d === -1 && a === -2147483648) throw new Error('desborde en idiv'); R[EAX] = q; R[EDX] = (a % d) | 0; return; }
    const num = (BigInt(R[EDX]) << 32n) | BigInt(R[EAX] >>> 0); const q = num / BigInt(d); R[EAX] = Number(BigInt.asIntN(32, q)); R[EDX] = Number(BigInt.asIntN(32, num % BigInt(d)));
  } else if (n === 8) { const d = (v << 24) >> 24; if (!d) throw new Error('division por cero'); const num = (R[EAX] << 16) >> 16; const q = Math.trunc(num / d), r = num % d; R[EAX] = (R[EAX] & ~0xFFFF) | (q & 0xFF) | ((r & 0xFF) << 8); }
  else { const d = (v << 16) >> 16; if (!d) throw new Error('division por cero'); const num = ((R[EDX] & 0xFFFF) << 16) | (R[EAX] & 0xFFFF); const q = Math.trunc(num / d), r = num % d; R[EAX] = (R[EAX] & ~0xFFFF) | (q & 0xFFFF); R[EDX] = (R[EDX] & ~0xFFFF) | (r & 0xFFFF); }
}

// ---------- cadenas (con o sin rep); direccion: F.df ----------
function paso(n) { return F.df ? -n : n; }
export function movs(n, rep) {
  let c = rep ? R[ECX] >>> 0 : 1;
  if (!F.df && rep && n === 4 && c > 64) { M8.copyWithin(R[EDI] >>> 0, R[ESI] >>> 0, (R[ESI] >>> 0) + c * 4); R[ESI] += c * 4; R[EDI] += c * 4; R[ECX] = 0; return; }
  const p = paso(n);
  while (c--) { if (n === 1) w8(R[EDI], r8(R[ESI])); else if (n === 2) w16(R[EDI], r16(R[ESI])); else w32(R[EDI], r32(R[ESI])); R[ESI] += p; R[EDI] += p; }
  if (rep) R[ECX] = 0;
}
export function stos(n, rep) {
  let c = rep ? R[ECX] >>> 0 : 1; const p = paso(n);
  while (c--) { if (n === 1) w8(R[EDI], R[EAX]); else if (n === 2) w16(R[EDI], R[EAX]); else w32(R[EDI], R[EAX]); R[EDI] += p; }
  if (rep) R[ECX] = 0;
}
export function lods(n) { const p = paso(n); const v = n === 1 ? r8(R[ESI]) : n === 2 ? r16(R[ESI]) : r32(R[ESI]); if (n === 1) R[EAX] = (R[EAX] & ~0xFF) | v; else if (n === 2) R[EAX] = (R[EAX] & ~0xFFFF) | v; else R[EAX] = v; R[ESI] += p; }
// scas/cmps: rep = 'rep' (repe) o 'repne'
export function scas(n, rep) {
  const p = paso(n), a = n === 1 ? R[EAX] & 0xFF : n === 2 ? R[EAX] & 0xFFFF : R[EAX];
  const leer = () => n === 1 ? r8(R[EDI]) : n === 2 ? r16(R[EDI]) : r32(R[EDI]);
  if (!rep) { sub(a, leer(), n); R[EDI] += p; return; }
  while ((R[ECX] >>> 0) !== 0) { const v = leer(); R[EDI] += p; R[ECX]--; sub(a, v, n); const z = zf(); if (rep === 'rep' ? !z : z) break; }
}
export function cmps(n, rep) {
  const p = paso(n);
  const leer = (d) => n === 1 ? r8(d) : n === 2 ? r16(d) : r32(d);
  if (!rep) { sub(leer(R[ESI]), leer(R[EDI]), n); R[ESI] += p; R[EDI] += p; return; }
  while ((R[ECX] >>> 0) !== 0) { const a = leer(R[ESI]), b = leer(R[EDI]); R[ESI] += p; R[EDI] += p; R[ECX]--; sub(a, b, n); const z = zf(); if (rep === 'rep' ? !z : z) break; }
}

// ---------- FPU x87 ----------
export const FP = { st: new Float64Array(8), top: 0, sw: 0, cw: 0x037F };
export const fst = (i) => FP.st[(FP.top + i) & 7];
export const fset = (i, v) => { FP.st[(FP.top + i) & 7] = v; };
export const fpush = (v) => { FP.top = (FP.top - 1) & 7; FP.st[FP.top] = v; };
export const fpop = () => { const v = FP.st[FP.top]; FP.top = (FP.top + 1) & 7; return v; };
export function fcom(a, b) {   // compara ST0 (a) con b: C3 C2 C0
  let c0 = 0, c2 = 0, c3 = 0;
  if (Number.isNaN(a) || Number.isNaN(b)) { c0 = c2 = c3 = 1; } else if (a < b) c0 = 1; else if (a === b) c3 = 1;
  FP.sw = (FP.sw & ~0x4500) | (c0 << 8) | (c2 << 10) | (c3 << 14);
}
export function fstsw() { return (FP.sw & ~0x3800) | ((FP.top & 7) << 11); }
export function redondear(v) {   // segun el control de redondeo (bits 10-11 de cw)
  const rc = (FP.cw >> 10) & 3;
  if (rc === 3) return Math.trunc(v); if (rc === 1) return Math.floor(v); if (rc === 2) return Math.ceil(v);
  const f = Math.floor(v), d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1);
}
export const f32a = (v) => Math.fround(v);
export function rf32(a) { return M.getFloat32(a >>> 0, true); }
export function rf64(a) { return M.getFloat64(a >>> 0, true); }
export function wf32(a, v) { M.setFloat32(a >>> 0, v, true); }
export function wf64(a, v) { M.setFloat64(a >>> 0, v, true); }
export function rf80(a) {    // real de 80 bits -> double
  const lo = M.getUint32(a, true), hi = M.getUint32(a + 4, true), se = M.getUint16(a + 8, true);
  const s = se & 0x8000 ? -1 : 1, e = se & 0x7FFF; if (!e && !lo && !hi) return 0 * s;
  return s * (hi * 4294967296 + lo) * Math.pow(2, e - 16383 - 63);
}
export function wf80(a, v) {
  const s = v < 0 || Object.is(v, -0) ? 0x8000 : 0; v = Math.abs(v);
  if (v === 0) { M.setUint32(a, 0, true); M.setUint32(a + 4, 0, true); M.setUint16(a + 8, s, true); return; }
  let e = Math.floor(Math.log2(v)); let m = v / Math.pow(2, e); if (m >= 2) { m /= 2; e++; } if (m < 1) { m *= 2; e--; }
  const mant = BigInt(Math.round(m * 2 ** 52)) << 11n;
  M.setUint32(a, Number(mant & 0xFFFFFFFFn), true); M.setUint32(a + 4, Number(mant >> 32n), true); M.setUint16(a + 8, s | (e + 16383), true);
}
export function rentero64(a) { return Number(M.getBigInt64(a >>> 0, true)); }
export function wentero64(a, v) { M.setBigInt64(a >>> 0, BigInt(Math.trunc(v)), true); }
export function aEntero(v, bits) {   // fist/fistp: fuera de rango -> "indefinido entero"
  const r = redondear(v);
  const lim = bits === 16 ? 32768 : bits === 32 ? 2147483648 : 9223372036854775808;
  if (!(r >= -lim && r < lim)) return bits === 16 ? -32768 : bits === 32 ? -2147483648 : -9223372036854775808;
  return r;
}

// ---------- llamadas ----------
// F_[dir] = funciones traducidas; HLE[dir] = reemplazos en JS (bibliotecas, sistema). Las llamadas empujan la
// direccion de retorno igual que el original, para que la pila quede identica.
export const FN = Object.create(null);
export const HLE = Object.create(null);
export const traza = { faltantes: new Map(), llamadas: 0 };
export function llamar(dir, retorno) {
  push(retorno);
  traza.llamadas++;
  const h = HLE[dir];                                        // un reemplazo tiene prioridad sobre lo traducido
  if (h) { const n = h() | 0; R[ESP] += 4 + n; return; }   // el reemplazo hace de "ret" (n = bytes de argumentos que limpia)
  const f = FN[dir];
  if (f) { f(); return; }
  traza.faltantes.set(dir, (traza.faltantes.get(dir) || 0) + 1);
  throw new Error('Falta la funcion 0x' + (dir >>> 0).toString(16));
}
// salto (no llamada) a otra funcion: la direccion de retorno que esta en la pila es la de quien nos llamo
export function saltar(dir) {
  const h = HLE[dir];
  if (h) { const n = h() | 0; R[ESP] += 4 + n; return; }
  const f = FN[dir];
  if (f) { f(); return; }
  traza.faltantes.set(dir, (traza.faltantes.get(dir) || 0) + 1);
  throw new Error('Falta la funcion 0x' + (dir >>> 0).toString(16) + ' (salto)');
}
export function pushad() { const t = R[ESP]; push(R[EAX]); push(R[ECX]); push(R[EDX]); push(R[EBX]); push(t); push(R[EBP]); push(R[ESI]); push(R[EDI]); }
export function popad() { R[EDI] = pop(); R[ESI] = pop(); R[EBP] = pop(); pop(); R[EBX] = pop(); R[EDX] = pop(); R[ECX] = pop(); R[EAX] = pop(); }
export function fninit() { FP.top = 0; FP.sw = 0; FP.cw = 0x037F; FP.st.fill(0); }
// entrada/salida y servicios: los define el anfitrion (port del juego o pruebas)
export const IO = {
  inb: (p) => 0xFF, inw: (p) => 0xFFFF, ind: (p) => -1,
  outb: (p, v) => {}, outw: (p, v) => {}, outd: (p, v) => {},
  int: (n) => { throw new Error('Interrupcion sin reemplazo: 0x' + n.toString(16)); },
  sistema: (op) => {}   // cli, sti, hlt...
};
