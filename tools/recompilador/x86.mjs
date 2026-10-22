// Decodificador de x86 de 32 bits (lo que usa el codigo de Pump It Up Extra, compilado con Watcom).
// decodificar(bytes, pos, dir) -> { dir, tam, op, ops: [operando...], rep, seg, o16 } o null si no lo conoce.
// Operandos: { t:'reg', r:'eax', n:4 } | { t:'imm', v, n } | { t:'mem', n, base, idx, esc, desp, seg } | { t:'rel', v } | { t:'st', i }

const R32 = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
const R16 = ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di'];
const R8 = ['al', 'cl', 'dl', 'bl', 'ah', 'ch', 'dh', 'bh'];
const SREG = ['es', 'cs', 'ss', 'ds', 'fs', 'gs'];
const CC = ['o', 'no', 'b', 'ae', 'e', 'ne', 'be', 'a', 's', 'ns', 'p', 'np', 'l', 'ge', 'le', 'g'];
const ARIT = ['add', 'or', 'adc', 'sbb', 'and', 'sub', 'xor', 'cmp'];
const ROT = ['rol', 'ror', 'rcl', 'rcr', 'shl', 'shr', 'sal', 'sar'];

const reg = (i, n) => ({ t: 'reg', r: n === 4 ? R32[i] : n === 2 ? R16[i] : R8[i], n });
const imm = (v, n) => ({ t: 'imm', v, n });

export function decodificar(b, p0, dir) {
  let p = p0, o16 = false, rep = null, seg = null;
  const u8 = () => b[p++];
  const s8 = () => { const v = b[p++]; return v > 127 ? v - 256 : v; };
  const u16 = () => { const v = b[p] | (b[p + 1] << 8); p += 2; return v; };
  const s32 = () => { const v = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24); p += 4; return v; };
  const u32 = () => s32() >>> 0;
  // prefijos
  for (;;) {
    const x = b[p];
    if (x === 0x66) { o16 = true; p++; }
    else if (x === 0xF3) { rep = 'rep'; p++; }
    else if (x === 0xF2) { rep = 'repne'; p++; }
    else if (x === 0x26 || x === 0x2E || x === 0x36 || x === 0x3E || x === 0x64 || x === 0x65) { seg = { 0x26: 'es', 0x2E: 'cs', 0x36: 'ss', 0x3E: 'ds', 0x64: 'fs', 0x65: 'gs' }[x]; p++; }
    else if (x === 0xF0) { p++; }          // lock
    else break;
  }
  const nv = o16 ? 2 : 4;                  // tamano de operando "v"
  let modrm = null;
  const leerModrm = () => {
    const m = u8(); const mod = m >> 6, r = (m >> 3) & 7, rm = m & 7;
    if (mod === 3) return { mod, r, rm, mem: null };
    let base = null, idx = null, esc = 1, desp = 0;
    if (rm === 4) {
      const s = u8(); esc = 1 << (s >> 6); const ix = (s >> 3) & 7, bs = s & 7;
      if (ix !== 4) idx = R32[ix];
      if (bs === 5 && mod === 0) desp = s32(); else base = R32[bs];
    } else if (rm === 5 && mod === 0) { desp = s32(); }
    else base = R32[rm];
    if (mod === 1) desp = s8(); else if (mod === 2) desp = s32();
    return { mod, r, rm, mem: { base, idx, esc, desp } };
  };
  const E = (n) => modrm.mem ? { t: 'mem', n, ...modrm.mem, seg } : reg(modrm.rm, n);
  const G = (n) => reg(modrm.r, n);
  const fin = (op, ops = [], extra = {}) => ({ dir, tam: p - p0, op, ops, rep, seg, o16, ...extra });

  const c = u8();
  // aritmetica clasica 00-3F
  if (c < 0x40 && (c & 7) < 6) {
    const op = ARIT[c >> 3], k = c & 7;
    if (k === 0) { modrm = leerModrm(); return fin(op, [E(1), G(1)]); }
    if (k === 1) { modrm = leerModrm(); return fin(op, [E(nv), G(nv)]); }
    if (k === 2) { modrm = leerModrm(); return fin(op, [G(1), E(1)]); }
    if (k === 3) { modrm = leerModrm(); return fin(op, [G(nv), E(nv)]); }
    if (k === 4) return fin(op, [reg(0, 1), imm(s8(), 1)]);
    if (k === 5) return fin(op, [reg(0, nv), imm(o16 ? u16() : s32(), nv)]);
  }
  if (c === 0x06 || c === 0x0E || c === 0x16 || c === 0x1E) return fin('push', [{ t: 'sreg', r: SREG[c >> 3] }]);
  if (c === 0x07 || c === 0x17 || c === 0x1F) return fin('pop', [{ t: 'sreg', r: SREG[c >> 3] }]);
  if (c >= 0x40 && c <= 0x47) return fin('inc', [reg(c - 0x40, nv)]);
  if (c >= 0x48 && c <= 0x4F) return fin('dec', [reg(c - 0x48, nv)]);
  if (c >= 0x50 && c <= 0x57) return fin('push', [reg(c - 0x50, nv)]);
  if (c >= 0x58 && c <= 0x5F) return fin('pop', [reg(c - 0x58, nv)]);
  if (c === 0x60) return fin('pushad'); if (c === 0x61) return fin('popad');
  if (c === 0x68) return fin('push', [imm(o16 ? u16() : s32(), nv)]);
  if (c === 0x6A) return fin('push', [imm(s8(), nv)]);
  if (c === 0x69) { modrm = leerModrm(); const a = E(nv); return fin('imul', [G(nv), a, imm(o16 ? u16() : s32(), nv)]); }
  if (c === 0x6B) { modrm = leerModrm(); const a = E(nv); return fin('imul', [G(nv), a, imm(s8(), nv)]); }
  if (c >= 0x70 && c <= 0x7F) { const d = s8(); return fin('j' + CC[c - 0x70], [{ t: 'rel', v: (dir + (p - p0) + d) >>> 0 }]); }
  if (c >= 0x80 && c <= 0x83) {
    modrm = leerModrm(); const n = (c & 1) ? nv : 1; const a = E(n);
    const v = c === 0x81 ? (o16 ? u16() : s32()) : s8();
    return fin(ARIT[modrm.r], [a, imm(v, n)]);
  }
  if (c === 0x84) { modrm = leerModrm(); return fin('test', [E(1), G(1)]); }
  if (c === 0x85) { modrm = leerModrm(); return fin('test', [E(nv), G(nv)]); }
  if (c === 0x86) { modrm = leerModrm(); return fin('xchg', [E(1), G(1)]); }
  if (c === 0x87) { modrm = leerModrm(); return fin('xchg', [E(nv), G(nv)]); }
  if (c >= 0x88 && c <= 0x8B) {
    modrm = leerModrm(); const n = (c & 1) ? nv : 1;
    return fin('mov', c & 2 ? [G(n), E(n)] : [E(n), G(n)]);
  }
  if (c === 0x8C) { modrm = leerModrm(); return fin('mov', [modrm.mem ? E(2) : reg(modrm.rm, nv), { t: 'sreg', r: SREG[modrm.r] }]); }
  if (c === 0x8E) { modrm = leerModrm(); return fin('mov', [{ t: 'sreg', r: SREG[modrm.r] }, E(2)]); }
  if (c === 0x8D) { modrm = leerModrm(); return fin('lea', [G(nv), E(nv)]); }
  if (c === 0x8F) { modrm = leerModrm(); return fin('pop', [E(nv)]); }
  if (c === 0x90) return fin('nop');
  if (c >= 0x91 && c <= 0x97) return fin('xchg', [reg(0, nv), reg(c - 0x90, nv)]);
  if (c === 0x98) return fin(o16 ? 'cbw' : 'cwde'); if (c === 0x99) return fin(o16 ? 'cwd' : 'cdq');
  if (c === 0x9B) return fin('wait'); if (c === 0x9C) return fin('pushfd'); if (c === 0x9D) return fin('popfd');
  if (c === 0x9E) return fin('sahf'); if (c === 0x9F) return fin('lahf');
  if (c >= 0xA0 && c <= 0xA3) {
    const n = (c & 1) ? nv : 1, m = { t: 'mem', n, base: null, idx: null, esc: 1, desp: s32(), seg };
    return fin('mov', c & 2 ? [m, reg(0, n)] : [reg(0, n), m]);
  }
  const cad = { 0xA4: ['movs', 1], 0xA5: ['movs', 0], 0xA6: ['cmps', 1], 0xA7: ['cmps', 0], 0xAA: ['stos', 1], 0xAB: ['stos', 0], 0xAC: ['lods', 1], 0xAD: ['lods', 0], 0xAE: ['scas', 1], 0xAF: ['scas', 0] }[c];
  if (cad) { const n = cad[1] ? 1 : nv; return fin(cad[0] + (n === 1 ? 'b' : n === 2 ? 'w' : 'd'), [], { n }); }
  if (c === 0xA8) return fin('test', [reg(0, 1), imm(s8(), 1)]);
  if (c === 0xA9) return fin('test', [reg(0, nv), imm(o16 ? u16() : s32(), nv)]);
  if (c >= 0xB0 && c <= 0xB7) return fin('mov', [reg(c - 0xB0, 1), imm(u8(), 1)]);
  if (c >= 0xB8 && c <= 0xBF) return fin('mov', [reg(c - 0xB8, nv), imm(o16 ? u16() : s32(), nv)]);
  if (c === 0xC0 || c === 0xC1 || (c >= 0xD0 && c <= 0xD3)) {
    modrm = leerModrm(); const n = (c & 1) ? nv : 1; const a = E(n);
    const cnt = c === 0xC0 || c === 0xC1 ? imm(u8(), 1) : (c === 0xD0 || c === 0xD1) ? imm(1, 1) : reg(1, 1);
    return fin(ROT[modrm.r], [a, cnt]);
  }
  if (c === 0xC2) return fin('ret', [imm(u16(), 2)]);
  if (c === 0xC3) return fin('ret');
  if (c === 0xC6 || c === 0xC7) { modrm = leerModrm(); const n = c === 0xC6 ? 1 : nv; const a = E(n); return fin('mov', [a, imm(n === 1 ? u8() : n === 2 ? u16() : s32(), n)]); }
  if (c === 0xC8) { const t = u16(); const l = u8(); return fin('enter', [imm(t, 2), imm(l, 1)]); }
  if (c === 0xC4 || c === 0xC5) { modrm = leerModrm(); if (!modrm.mem) return null; return fin(c === 0xC4 ? 'les' : 'lds', [G(nv), E(nv)]); }
  if (c === 0xEA || c === 0x9A) { const off = o16 ? u16() : u32(); const sel = u16(); return fin(c === 0xEA ? 'jmpf' : 'callf', [imm(off, 4), imm(sel, 2)]); }
  if (c === 0xCA) return fin('retf', [imm(u16(), 2)]);
  if (c === 0xCB) return fin('retf');
  if (c === 0xCF) return fin('iretd');
  if (c === 0xC9) return fin('leave');
  if (c === 0xCC) return fin('int3');
  if (c === 0xCD) return fin('int', [imm(u8(), 1)]);
  if (c === 0xE4) return fin('in', [reg(0, 1), imm(u8(), 1)]);
  if (c === 0xE5) return fin('in', [reg(0, nv), imm(u8(), 1)]);
  if (c === 0xE6) return fin('out', [imm(u8(), 1), reg(0, 1)]);
  if (c === 0xE7) return fin('out', [imm(u8(), 1), reg(0, nv)]);
  if (c === 0xEC) return fin('in', [reg(0, 1), reg(2, 2)]);
  if (c === 0xED) return fin('in', [reg(0, nv), reg(2, 2)]);
  if (c === 0xEE) return fin('out', [reg(2, 2), reg(0, 1)]);
  if (c === 0xEF) return fin('out', [reg(2, 2), reg(0, nv)]);
  if (c === 0xE8) { const d = s32(); return fin('call', [{ t: 'rel', v: (dir + (p - p0) + d) >>> 0 }]); }
  if (c === 0xE9) { const d = s32(); return fin('jmp', [{ t: 'rel', v: (dir + (p - p0) + d) >>> 0 }]); }
  if (c === 0xEB) { const d = s8(); return fin('jmp', [{ t: 'rel', v: (dir + (p - p0) + d) >>> 0 }]); }
  if (c === 0xE3) { const d = s8(); return fin('jecxz', [{ t: 'rel', v: (dir + (p - p0) + d) >>> 0 }]); }
  if (c === 0xE2) { const d = s8(); return fin('loop', [{ t: 'rel', v: (dir + (p - p0) + d) >>> 0 }]); }
  if (c === 0xF4) return fin('hlt'); if (c === 0xF5) return fin('cmc');
  if (c === 0xF6 || c === 0xF7) {
    modrm = leerModrm(); const n = c === 0xF6 ? 1 : nv; const a = E(n);
    const op = ['test', 'test', 'not', 'neg', 'mul', 'imul', 'div', 'idiv'][modrm.r];
    if (modrm.r < 2) return fin('test', [a, imm(n === 1 ? u8() : n === 2 ? u16() : s32(), n)]);
    return fin(op, [a]);
  }
  if (c === 0xF8) return fin('clc'); if (c === 0xF9) return fin('stc'); if (c === 0xFA) return fin('cli'); if (c === 0xFB) return fin('sti');
  if (c === 0xFC) return fin('cld'); if (c === 0xFD) return fin('std');
  if (c === 0xFE) { modrm = leerModrm(); return fin(modrm.r === 0 ? 'inc' : 'dec', [E(1)]); }
  if (c === 0xFF) {
    modrm = leerModrm(); const r = modrm.r;
    if (r === 0) return fin('inc', [E(nv)]); if (r === 1) return fin('dec', [E(nv)]);
    if (r === 2) return fin('call', [E(4)]); if (r === 4) return fin('jmp', [E(4)]);
    if (r === 3 && modrm.mem) return fin('callf', [E(6)]); if (r === 5 && modrm.mem) return fin('jmpf', [E(6)]);
    if (r === 6) return fin('push', [E(nv)]);
    return null;
  }
  // coma flotante x87
  if (c >= 0xD8 && c <= 0xDF) return x87(c);
  if (c === 0x0F) {
    const c2 = u8();
    if (c2 >= 0x80 && c2 <= 0x8F) { const d = s32(); return fin('j' + CC[c2 - 0x80], [{ t: 'rel', v: (dir + (p - p0) + d) >>> 0 }]); }
    if (c2 >= 0x90 && c2 <= 0x9F) { modrm = leerModrm(); return fin('set' + CC[c2 - 0x90], [E(1)]); }
    if (c2 === 0xAF) { modrm = leerModrm(); return fin('imul', [G(nv), E(nv)]); }
    if (c2 === 0xB6 || c2 === 0xB7 || c2 === 0xBE || c2 === 0xBF) { modrm = leerModrm(); const n = (c2 & 1) ? 2 : 1; return fin(c2 < 0xB8 ? 'movzx' : 'movsx', [G(nv), E(n)]); }
    if (c2 === 0xA2) return fin('cpuid'); if (c2 === 0x31) return fin('rdtsc');
    // instrucciones de segmentos (las usa el arranque de DOS4GW/Watcom)
    if (c2 === 0xA0) return fin('push', [{ t: 'sreg', r: 'fs' }]); if (c2 === 0xA1) return fin('pop', [{ t: 'sreg', r: 'fs' }]);
    if (c2 === 0xA8) return fin('push', [{ t: 'sreg', r: 'gs' }]); if (c2 === 0xA9) return fin('pop', [{ t: 'sreg', r: 'gs' }]);
    if (c2 === 0x00) { modrm = leerModrm(); const o = ['sldt', 'str', 'lldt', 'ltr', 'verr', 'verw', null, null][modrm.r]; return o ? fin(o, [E(2)]) : null; }
    if (c2 === 0x02 || c2 === 0x03) { modrm = leerModrm(); return fin(c2 === 0x02 ? 'lar' : 'lsl', [G(nv), E(2)]); }
    if (c2 === 0xB2 || c2 === 0xB4 || c2 === 0xB5) { modrm = leerModrm(); return fin({ 0xB2: 'lss', 0xB4: 'lfs', 0xB5: 'lgs' }[c2], [G(nv), E(nv)]); }
    if (c2 === 0xA4 || c2 === 0xAC) { modrm = leerModrm(); const a = E(nv); return fin(c2 === 0xA4 ? 'shld' : 'shrd', [a, G(nv), imm(u8(), 1)]); }
    if (c2 === 0xA5 || c2 === 0xAD) { modrm = leerModrm(); return fin(c2 === 0xA5 ? 'shld' : 'shrd', [E(nv), G(nv), reg(1, 1)]); }
    if (c2 === 0xA3 || c2 === 0xAB || c2 === 0xB3 || c2 === 0xBB) { modrm = leerModrm(); return fin({ 0xA3: 'bt', 0xAB: 'bts', 0xB3: 'btr', 0xBB: 'btc' }[c2], [E(nv), G(nv)]); }
    if (c2 === 0xBC || c2 === 0xBD) { modrm = leerModrm(); return fin(c2 === 0xBC ? 'bsf' : 'bsr', [G(nv), E(nv)]); }
    if (c2 >= 0x40 && c2 <= 0x4F) { modrm = leerModrm(); return fin('cmov' + CC[c2 - 0x40], [G(nv), E(nv)]); }
    return null;
  }
  return null;

  function x87(c) {
    modrm = leerModrm();
    const r = modrm.r, st = (i) => ({ t: 'st', i });
    if (modrm.mem) {
      const m = (n, tipo) => ({ ...E(n), f: tipo });
      switch (c) {
        case 0xD8: return fin(['fadd', 'fmul', 'fcom', 'fcomp', 'fsub', 'fsubr', 'fdiv', 'fdivr'][r], [m(4, 'f32')]);
        case 0xD9: return [() => fin('fld', [m(4, 'f32')]), null, () => fin('fst', [m(4, 'f32')]), () => fin('fstp', [m(4, 'f32')]), () => fin('fldenv', [m(28, 'env')]), () => fin('fldcw', [m(2, 'i16')]), () => fin('fnstenv', [m(28, 'env')]), () => fin('fnstcw', [m(2, 'i16')])][r]?.() ?? null;
        case 0xDA: return fin(['fiadd', 'fimul', 'ficom', 'ficomp', 'fisub', 'fisubr', 'fidiv', 'fidivr'][r], [m(4, 'i32')]);
        case 0xDB: return [() => fin('fild', [m(4, 'i32')]), null, () => fin('fist', [m(4, 'i32')]), () => fin('fistp', [m(4, 'i32')]), null, () => fin('fld', [m(10, 'f80')]), null, () => fin('fstp', [m(10, 'f80')])][r]?.() ?? null;
        case 0xDC: return fin(['fadd', 'fmul', 'fcom', 'fcomp', 'fsub', 'fsubr', 'fdiv', 'fdivr'][r], [m(8, 'f64')]);
        case 0xDD: return [() => fin('fld', [m(8, 'f64')]), null, () => fin('fst', [m(8, 'f64')]), () => fin('fstp', [m(8, 'f64')]), () => fin('frstor', [m(108, 'env')]), null, () => fin('fnsave', [m(108, 'env')]), () => fin('fnstsw', [m(2, 'i16')])][r]?.() ?? null;
        case 0xDE: return fin(['fiadd', 'fimul', 'ficom', 'ficomp', 'fisub', 'fisubr', 'fidiv', 'fidivr'][r], [m(2, 'i16')]);
        case 0xDF: return [() => fin('fild', [m(2, 'i16')]), null, () => fin('fist', [m(2, 'i16')]), () => fin('fistp', [m(2, 'i16')]), null, () => fin('fild', [m(8, 'i64')]), null, () => fin('fistp', [m(8, 'i64')])][r]?.() ?? null;
      }
      return null;
    }
    const i = modrm.rm;
    switch (c) {
      case 0xD8: return fin(['fadd', 'fmul', 'fcom', 'fcomp', 'fsub', 'fsubr', 'fdiv', 'fdivr'][r], [st(0), st(i)]);
      case 0xD9:
        if (r === 0) return fin('fld', [st(i)]);
        if (r === 1) return fin('fxch', [st(i)]);
        if (r === 2 && i === 0) return fin('fnop');
        if (r === 4) return [() => fin('fchs'), () => fin('fabs'), null, null, () => fin('ftst'), () => fin('fxam')][i]?.() ?? null;
        if (r === 5) return [() => fin('fld1'), () => fin('fldl2t'), () => fin('fldl2e'), () => fin('fldpi'), () => fin('fldlg2'), () => fin('fldln2'), () => fin('fldz')][i]?.() ?? null;
        if (r === 6) return [() => fin('f2xm1'), () => fin('fyl2x'), () => fin('fptan'), () => fin('fpatan'), () => fin('fxtract'), () => fin('fprem1'), () => fin('fdecstp'), () => fin('fincstp')][i]();
        if (r === 7) return [() => fin('fprem'), () => fin('fyl2xp1'), () => fin('fsqrt'), () => fin('fsincos'), () => fin('frndint'), () => fin('fscale'), () => fin('fsin'), () => fin('fcos')][i]();
        return null;
      case 0xDA: if (r === 5 && i === 1) return fin('fucompp'); return null;
      case 0xDB: if (r === 4 && i === 2) return fin('fnclex'); if (r === 4 && i === 3) return fin('fninit'); return null;
      case 0xDC: return fin(['fadd', 'fmul', 'fcom', 'fcomp', 'fsubr', 'fsub', 'fdivr', 'fdiv'][r], [st(i), st(0)]);
      case 0xDD: return [() => fin('ffree', [st(i)]), null, () => fin('fst', [st(i)]), () => fin('fstp', [st(i)]), () => fin('fucom', [st(i)]), () => fin('fucomp', [st(i)])][r]?.() ?? null;
      case 0xDE: if (r === 3 && i === 1) return fin('fcompp'); return fin(['faddp', 'fmulp', null, null, 'fsubrp', 'fsubp', 'fdivrp', 'fdivp'][r], [st(i), st(0)]);
      case 0xDF: if (r === 4 && i === 0) return fin('fnstsw', [reg(0, 2)]); return null;
    }
    return null;
  }
}
