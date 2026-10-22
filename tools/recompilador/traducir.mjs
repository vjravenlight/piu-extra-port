// Traductor x86 -> JavaScript del codigo de Piu.exe. Genera app\port\traducido.js (una funcion JS por funcion x86).
// Cada funcion: let pc; for(;;) switch(pc) { case <bloque>: ... }. Registros en R[], memoria con r32/w32..., banderas
// perezosas, FPU x87 y cadenas en app\port\cpu.js. Las llamadas empujan la direccion de retorno como el original.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Imagen, descubrir, candidatosPuntero } from './cfg.mjs';

const RI = { eax: 0, ecx: 1, edx: 2, ebx: 3, esp: 4, ebp: 5, esi: 6, edi: 7 };
const R16 = { ax: 0, cx: 1, dx: 2, bx: 3, sp: 4, bp: 5, si: 6, di: 7 };
const R8L = { al: 0, cl: 1, dl: 2, bl: 3 };
const R8H = { ah: 0, ch: 1, dh: 2, bh: 3 };
const hex = (v) => '0x' + (v >>> 0).toString(16);

function dirMem(o) {
  const p = [];
  if (o.base) p.push(`R[${RI[o.base]}]`);
  if (o.idx) p.push(o.esc === 1 ? `R[${RI[o.idx]}]` : `(R[${RI[o.idx]}]<<${Math.log2(o.esc)})`);
  if (!p.length) return hex(o.desp >>> 0);
  if (o.desp) p.push(String(o.desp | 0));
  return p.length === 1 ? p[0] : `(${p.join('+')}|0)`;
}
function leer(o, a) {
  switch (o.t) {
    case 'imm': return o.n === 1 ? String(o.v & 0xFF) : o.n === 2 ? String(o.v & 0xFFFF) : String(o.v | 0);
    case 'reg':
      if (o.n === 4) return `R[${RI[o.r]}]`;
      if (o.n === 2) return `(R[${R16[o.r]}]&65535)`;
      if (o.r in R8L) return `(R[${R8L[o.r]}]&255)`;
      return `((R[${R8H[o.r]}]>>8)&255)`;
    case 'mem': { const d = a ?? dirMem(o); return o.n === 4 ? `r32(${d})` : o.n === 2 ? `r16(${d})` : `r8(${d})`; }
    case 'sreg': return o.r === 'cs' ? '0x1b' : '0x23';
  }
  throw new Error('operando desconocido ' + JSON.stringify(o));
}
function escribir(o, v, a) {
  switch (o.t) {
    case 'reg':
      if (o.n === 4) return `R[${RI[o.r]}]=${v};`;
      if (o.n === 2) return `R[${R16[o.r]}]=(R[${R16[o.r]}]&-65536)|((${v})&65535);`;
      if (o.r in R8L) return `R[${R8L[o.r]}]=(R[${R8L[o.r]}]&-256)|((${v})&255);`;
      return `R[${R8H[o.r]}]=(R[${R8H[o.r]}]&-65281)|(((${v})&255)<<8);`;
    case 'mem': { const d = a ?? dirMem(o); return o.n === 4 ? `w32(${d},${v});` : o.n === 2 ? `w16(${d},${v});` : `w8(${d},${v});`; }
    case 'sreg': return `/*mov ${o.r} ignorado*/`;
  }
  throw new Error('destino desconocido ' + JSON.stringify(o));
}
// leer-modificar-escribir con la direccion calculada una sola vez
function rmw(o, f) {
  if (o.t === 'mem') return `{const d=${dirMem(o)};${escribir(o, f(leer(o, 'd')), 'd')}}`;
  return escribir(o, f(leer(o)));
}
const bits = (o) => (o.n || 4) * 8;

// valor de un operando de la FPU (memoria real/entera)
function fval(o) {
  const d = dirMem(o);
  switch (o.f) {
    case 'f32': return `rf32(${d})`; case 'f64': return `rf64(${d})`; case 'f80': return `rf80(${d})`;
    case 'i16': return `((r16(${d})<<16)>>16)`; case 'i32': return `r32(${d})`; case 'i64': return `rentero64(${d})`;
  }
  throw new Error('operando FPU ' + JSON.stringify(o));
}
const FOPS = { fadd: (d, s) => `${d}+${s}`, fmul: (d, s) => `${d}*${s}`, fsub: (d, s) => `${d}-${s}`, fsubr: (d, s) => `${s}-${d}`, fdiv: (d, s) => `${d}/${s}`, fdivr: (d, s) => `${s}/${d}` };

function x87(x) {
  const [a, b] = x.ops, op = x.op;
  const base = op.replace(/^fi(add|mul|sub|subr|div|divr)$/, 'f$1').replace(/p$/, '');
  if (FOPS[base] && op !== 'fcomp' && op !== 'fucomp') {
    if (a && a.t === 'mem') return `fset(0,${FOPS[base]('fst(0)', fval(a))});`;
    const d = a.i, s = b.i;
    return `fset(${d},${FOPS[base](`fst(${d})`, `fst(${s})`)});` + (op.endsWith('p') ? 'fpop();' : '');
  }
  switch (op) {
    case 'fld': return a.t === 'st' ? `fpush(fst(${a.i}));` : `fpush(${fval(a)});`;
    case 'fild': return `fpush(${fval(a)});`;
    case 'fst': case 'fstp': {
      let s;
      if (a.t === 'st') s = `fset(${a.i},fst(0));`;
      else { const d = dirMem(a); s = a.f === 'f32' ? `wf32(${d},fst(0));` : a.f === 'f64' ? `wf64(${d},fst(0));` : `wf80(${d},fst(0));`; }
      return s + (op === 'fstp' ? 'fpop();' : '');
    }
    case 'fist': case 'fistp': {
      const d = dirMem(a);
      const s = a.f === 'i16' ? `w16(${d},aEntero(fst(0),16));` : a.f === 'i32' ? `w32(${d},aEntero(fst(0),32));` : `wentero64(${d},aEntero(fst(0),64));`;
      return s + (op === 'fistp' ? 'fpop();' : '');
    }
    case 'fcom': case 'fcomp': case 'fucom': case 'fucomp': case 'ficom': case 'ficomp': {
      const v = !a ? 'fst(1)' : a.t === 'st' ? `fst(${a.i})` : fval(a);
      return `fcom(fst(0),${v});` + (op.endsWith('p') ? 'fpop();' : '');
    }
    case 'fcompp': case 'fucompp': return 'fcom(fst(0),fst(1));fpop();fpop();';
    case 'ftst': return 'fcom(fst(0),0);';
    case 'fxch': return `{const t=fst(0);fset(0,fst(${a.i}));fset(${a.i},t);}`;
    case 'fchs': return 'fset(0,-fst(0));';
    case 'fabs': return 'fset(0,Math.abs(fst(0)));';
    case 'fsqrt': return 'fset(0,Math.sqrt(fst(0)));';
    case 'fsin': return 'fset(0,Math.sin(fst(0)));FP.sw&=~0x400;';
    case 'fcos': return 'fset(0,Math.cos(fst(0)));FP.sw&=~0x400;';
    case 'fsincos': return '{const v=fst(0);fset(0,Math.sin(v));fpush(Math.cos(v));FP.sw&=~0x400;}';
    case 'fptan': return 'fset(0,Math.tan(fst(0)));fpush(1);FP.sw&=~0x400;';
    case 'fpatan': return '{const v=Math.atan2(fst(1),fst(0));fpop();fset(0,v);}';
    case 'frndint': return 'fset(0,redondear(fst(0)));';
    case 'fscale': return 'fset(0,fst(0)*Math.pow(2,Math.trunc(fst(1))));';
    case 'f2xm1': return 'fset(0,Math.pow(2,fst(0))-1);';
    case 'fyl2x': return '{const v=fst(1)*Math.log2(fst(0));fpop();fset(0,v);}';
    case 'fyl2xp1': return '{const v=fst(1)*Math.log2(1+fst(0));fpop();fset(0,v);}';
    case 'fprem': case 'fprem1': return `fset(0,${op === 'fprem' ? 'fst(0)%fst(1)' : 'fst(0)-Math.round(fst(0)/fst(1))*fst(1)'});FP.sw&=~0x400;`;
    case 'fld1': return 'fpush(1);'; case 'fldz': return 'fpush(0);'; case 'fldpi': return 'fpush(Math.PI);';
    case 'fldl2e': return 'fpush(Math.LOG2E);'; case 'fldln2': return 'fpush(Math.LN2);'; case 'fldlg2': return 'fpush(Math.LOG10E*Math.LN2/Math.LN10*Math.LN10*Math.log10(2)/Math.LOG10E/Math.LN2);';
    case 'fldl2t': return 'fpush(Math.log2(10));';
    case 'fnstsw': return a.t === 'reg' ? 'R[0]=(R[0]&-65536)|fstsw();' : `w16(${dirMem(a)},fstsw());`;
    case 'fldcw': return `FP.cw=r16(${dirMem(a)});`;
    case 'fnstcw': return `w16(${dirMem(a)},FP.cw);`;
    case 'fninit': return 'fninit();';
    case 'fnclex': return 'FP.sw&=~0x80FF;';
    case 'fincstp': return 'FP.top=(FP.top+1)&7;';
    case 'fdecstp': return 'FP.top=(FP.top-1)&7;';
    case 'ffree': case 'fnop': return '';
    case 'fxam': return '{const v=fst(0);const neg=(v<0||Object.is(v,-0))?1:0;let c=0;if(Number.isNaN(v))c=0x100;else if(!Number.isFinite(v))c=0x500;else if(v===0)c=0x4000;else c=0x400;FP.sw=(FP.sw&~0x4700)|c|(neg<<9);}';
  }
  throw new Error('instruccion FPU sin traducir: ' + op);
}

// ---------- banderas: quien las lee, quien las pisa (para no calcularlas cuando nadie las va a leer) ----------
const LEE = new Set(['adc', 'sbb', 'rcl', 'rcr', 'lahf', 'pushfd', 'cmc', 'into']);
const ESCRIBE_TODO = new Set(['add', 'sub', 'cmp', 'and', 'or', 'xor', 'test', 'neg', 'imul', 'mul', 'div', 'idiv', 'sahf', 'popfd', 'scasb', 'scasw', 'scasd', 'cmpsb', 'cmpsw', 'cmpsd']);
function leeBanderas(x) {
  const op = x.op;
  if (LEE.has(op)) return true;
  if (op[0] === 'j' && op !== 'jmp' && op !== 'jmpf' && op !== 'jecxz') return true;
  if (op.startsWith('set') || op.startsWith('cmov')) return true;
  // ret e int se consideran lectores (rutinas de asm que devuelven el estado en CF; "stc; int 21h").
  // call NO: el codigo compilado nunca deja banderas vivas a traves de una llamada (la funcion llamada las pisa).
  if (op === 'ret' || op === 'int' || op === 'iretd') return true;
  if (['rol', 'ror', 'shl', 'sal', 'shr', 'sar'].includes(op) && x.ops[1].t !== 'imm') return true;      // cuenta en CL: puede ser 0
  if (['rol', 'ror', 'clc', 'stc', 'bt', 'bts', 'btr', 'btc', 'lar', 'lsl', 'verr', 'verw'].includes(op)) return true; // pisan solo algunas
  return false;
}
function pisaBanderas(x) {
  const op = x.op;
  if (ESCRIBE_TODO.has(op) || op === 'call' || op === 'callf') return true;
  if (['shl', 'sal', 'shr', 'sar'].includes(op) && x.ops[1].t === 'imm' && (x.ops[1].v & 31) !== 0) return true;
  return false;
}
// vivoDespues: Map dir -> si las banderas pueden leerse despues de esa instruccion
function vidaDeBanderas(f) {
  const dirs = [...f.insts.keys()].sort((p, q) => q - p);
  const antes = new Map(), despues = new Map();
  const sucesores = (x) => {
    const op = x.op, sig = x.dir + x.tam, a = x.ops[0], s = [];
    if (op === 'ret' || op === 'iretd' || op === 'hlt' || op === 'retf' || op === 'jmpf') return s;
    if (op === 'jmp') {
      if (a.t === 'rel') { if (f.insts.has(a.v)) s.push(a.v); else s.push(-1); }
      else { const t = f.tablas.find(t => t.dir === x.dir); if (t) s.push(...t.destinos); else s.push(-1); }
      return s;
    }
    if ((op[0] === 'j' && op !== 'jmp') || op === 'loop' || op === 'jecxz') s.push(f.insts.has(a.v) ? a.v : -1);
    s.push(f.insts.has(sig) ? sig : -1);
    return s;
  };
  // punto fijo minimo: vivas solo si algun camino llega a una instruccion que las lee (o a un destino desconocido)
  for (const d of dirs) { antes.set(d, false); despues.set(d, false); }
  const suc = new Map(dirs.map(d => [d, sucesores(f.insts.get(d))]));
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const d of dirs) {
      const x = f.insts.get(d);
      let vivo = false;
      for (const s of suc.get(d)) if (s === -1 || antes.get(s)) { vivo = true; break; }
      const incdec = x.op === 'inc' || x.op === 'dec';
      const v = leeBanderas(x) || (incdec ? vivo : (vivo && !pisaBanderas(x)));
      if (despues.get(d) !== vivo || antes.get(d) !== v) { despues.set(d, vivo); antes.set(d, v); cambio = true; }
    }
  }
  return despues;
}

// condicion fusionada para "cmp a,b" / "test a,b" seguido de jcc (sin pasar por las banderas)
function condFusionada(cmp, cc) {
  const [a, b] = cmp.ops, n = (a.n || 4) * 8, A = leer(a), B = leer(b);
  const s = (v) => n === 32 ? `(${v})` : n === 16 ? `((${v})<<16>>16)` : `((${v})<<24>>24)`;
  const u = (v) => n === 32 ? `((${v})>>>0)` : `(${v})`;
  if (cmp.op === 'cmp') {
    switch (cc) {
      case 'e': return `${u(A)}===${u(B)}`; case 'ne': return `${u(A)}!==${u(B)}`;
      case 'l': return `${s(A)}<${s(B)}`; case 'ge': return `${s(A)}>=${s(B)}`; case 'le': return `${s(A)}<=${s(B)}`; case 'g': return `${s(A)}>${s(B)}`;
      case 'b': return `${u(A)}<${u(B)}`; case 'ae': return `${u(A)}>=${u(B)}`; case 'be': return `${u(A)}<=${u(B)}`; case 'a': return `${u(A)}>${u(B)}`;
      case 's': return `${s(`(${A})-(${B})`)}<0`; case 'ns': return `${s(`(${A})-(${B})`)}>=0`;
    }
  } else {   // test: resultado r = A & B, CF = OF = 0
    const r = `(${A})&(${B})`, neg = n === 32 ? `((${r})<0)` : `(((${r})&${n === 16 ? 0x8000 : 0x80})!==0)`;
    switch (cc) {
      case 'e': case 'be': return `(${r})===0`; case 'ne': case 'a': return `(${r})!==0`;
      case 's': case 'l': return neg; case 'ns': case 'ge': return `!${neg}`;
      case 'le': return `((${r})===0||${neg})`; case 'g': return `((${r})!==0&&!${neg})`;
      case 'b': return 'false'; case 'ae': return 'true';
    }
  }
  return null;
}

// version sin banderas (cuando nadie las lee)
const OPTIMIZABLES = new Set(['add', 'sub', 'and', 'or', 'xor', 'cmp', 'test', 'inc', 'dec', 'neg', 'shl', 'sal', 'shr', 'sar', 'imul']);
function sinBanderas(x) {
  if (!OPTIMIZABLES.has(x.op) || !x.ops.length) return null;
  if (x.op === 'imul' && x.ops.length === 1) return null;
  const [a, b] = x.ops, op = x.op, n = bits(a);
  const s = (v) => n === 32 ? `(${v})` : n === 16 ? `((${v})<<16>>16)` : `((${v})<<24>>24)`;
  switch (op) {
    case 'add': return rmw(a, (v) => n === 32 ? `(${v}+${leer(b)})|0` : `${v}+${leer(b)}`);
    case 'sub': return rmw(a, (v) => n === 32 ? `(${v}-${leer(b)})|0` : `${v}-${leer(b)}`);
    case 'and': case 'or': case 'xor': {
      const ch = op === 'and' ? '&' : op === 'or' ? '|' : '^';
      if (op === 'xor' && a.t === 'reg' && b.t === 'reg' && a.r === b.r) return escribir(a, '0');
      return rmw(a, (v) => `${v}${ch}${leer(b)}`);
    }
    case 'cmp': case 'test': return '';
    case 'inc': return rmw(a, (v) => n === 32 ? `(${v}+1)|0` : `${v}+1`);
    case 'dec': return rmw(a, (v) => n === 32 ? `(${v}-1)|0` : `${v}-1`);
    case 'neg': return rmw(a, (v) => n === 32 ? `(-${v})|0` : `-${v}`);
    case 'shl': case 'sal': if (b.t === 'imm') return rmw(a, (v) => `${v}<<${b.v & 31}`); break;
    case 'shr': if (b.t === 'imm') return rmw(a, (v) => n === 32 ? `(${v}>>>${b.v & 31})|0` : `${v}>>>${b.v & 31}`); break;
    case 'sar': if (b.t === 'imm') return rmw(a, (v) => `${s(v)}>>${b.v & 31}`); break;
    case 'imul': if (x.ops.length === 2) return rmw(a, (v) => `Math.imul(${v},${leer(b)})`); if (x.ops.length === 3) return escribir(a, `Math.imul(${leer(b)},${leer(x.ops[2])})`); break;
  }
  return null;
}

export function traducirInst(x, f, vivoDespues = true) {
  const [a, b, c] = x.ops, op = x.op, sig = x.dir + x.tam;
  if (!vivoDespues) { const js = sinBanderas(x); if (js !== null) return js; }
  const dentro = (t) => f.insts.has(t);
  const salto = (t) => dentro(t) ? `pc=${hex(t)};continue;` : `saltar(${hex(t)});return;`;
  if (op[0] === 'f' && op !== 'fij') return x87(x);
  switch (op) {
    case 'mov': return escribir(a, leer(b));
    case 'movzx': return escribir(a, leer(b));
    case 'movsx': return escribir(a, b.n === 1 ? `((${leer(b)})<<24>>24)` : `((${leer(b)})<<16>>16)`);
    case 'lea': return escribir(a, dirMem(b));
    case 'xchg': {
      if (a.t === 'mem') return `{const d=${dirMem(a)};const t=${leer(a, 'd')};${escribir(a, leer(b), 'd')}${escribir(b, 't')}}`;
      return `{const t=${leer(a)};${escribir(a, leer(b))}${escribir(b, 't')}}`;
    }
    case 'add': case 'sub': case 'adc': case 'sbb': return rmw(a, (v) => `${op}(${v},${leer(b)},${bits(a)})`);
    case 'cmp': return `sub(${leer(a)},${leer(b)},${bits(a)});`;
    case 'and': case 'or': case 'xor': {
      const ch = op === 'and' ? '&' : op === 'or' ? '|' : '^';
      if (op === 'xor' && a.t === 'reg' && b.t === 'reg' && a.r === b.r) return escribir(a, '0') + `fij(3,0,0,0,${bits(a)});`;
      return rmw(a, (v) => `logica(${v}${ch}${leer(b)},${bits(a)})`);
    }
    case 'test': return `logica(${leer(a)}&${leer(b)},${bits(a)});`;
    case 'inc': case 'dec': case 'neg': return rmw(a, (v) => `${op}(${v},${bits(a)})`);
    case 'not': return rmw(a, (v) => `~${v}`);
    case 'shl': case 'sal': case 'shr': case 'sar': case 'rol': case 'ror': case 'rcl': case 'rcr': {
      const cnt = b.t === 'imm' ? String(b.v & 31) : '(R[1]&31)';
      const fn = op === 'sal' ? 'shl' : op;
      return rmw(a, (v) => `${fn}(${v},${cnt},${bits(a)})`);
    }
    case 'imul':
      if (!b) return `imul1(${leer(a)},${bits(a)});`;
      if (!c) return rmw(a, (v) => `imul2(${v},${leer(b)},${bits(a)})`);
      return escribir(a, `imul2(${leer(b)},${leer(c)},${bits(a)})`);
    case 'mul': return `mul1(${leer(a)},${bits(a)});`;
    case 'div': return `div1(${leer(a)},${bits(a)});`;
    case 'idiv': return `idiv1(${leer(a)},${bits(a)});`;
    case 'cdq': return 'R[2]=R[0]>>31;';
    case 'cwde': return 'R[0]=(R[0]<<16)>>16;';
    case 'cbw': return 'R[0]=(R[0]&-65536)|(((R[0]<<24)>>24)&65535);';
    case 'cwd': return 'R[2]=(R[2]&-65536)|((((R[0]<<16)>>16)>>15)&65535);';
    case 'push': return a.t === 'sreg' ? `push(${leer(a)});` : `push(${leer(a)});`;
    case 'pop': return a.t === 'sreg' ? 'pop();' : a.t === 'reg' ? escribir(a, 'pop()') : `{const v=pop();${escribir(a, 'v')}}`;
    case 'pushad': return 'pushad();'; case 'popad': return 'popad();';
    case 'pushfd': return 'pushfd();'; case 'popfd': return 'popfd();';
    case 'leave': return 'R[4]=R[5];R[5]=pop();';
    case 'enter': return `push(R[5]);R[5]=R[4];R[4]-=${a.v};`;
    case 'call': return a.t === 'rel' ? `llamar(${hex(a.v)},${hex(sig)});` : `llamar(${leer(a)}>>>0,${hex(sig)});`;
    case 'ret': return `R[4]+=${4 + (a ? a.v : 0)};return;`;
    case 'jmp':
      if (a.t === 'rel') return salto(a.v);
      return `pc=${leer(a)}>>>0;continue;`;
    case 'loop': return `if((R[1]=(R[1]-1)|0)!==0){${salto(a.v)}}`;
    case 'jecxz': return `if(R[1]===0){${salto(a.v)}}`;
    case 'movsb': case 'movsw': case 'movsd': return `movs(${x.n},${x.rep ? 1 : 0});`;
    case 'stosb': case 'stosw': case 'stosd': return `stos(${x.n},${x.rep ? 1 : 0});`;
    case 'lodsb': case 'lodsw': case 'lodsd': return `lods(${x.n});`;
    case 'scasb': case 'scasw': case 'scasd': return `scas(${x.n},${x.rep ? `'${x.rep}'` : 'null'});`;
    case 'cmpsb': case 'cmpsw': case 'cmpsd': return `cmps(${x.n},${x.rep ? `'${x.rep}'` : 'null'});`;
    case 'in': {
      const p = b.t === 'imm' ? String(b.v & 0xFF) : '(R[2]&65535)';
      return a.n === 1 ? `R[0]=(R[0]&-256)|(IO.inb(${p})&255);` : a.n === 2 ? `R[0]=(R[0]&-65536)|(IO.inw(${p})&65535);` : `R[0]=IO.ind(${p});`;
    }
    case 'out': {
      const p = a.t === 'imm' ? String(a.v & 0xFF) : '(R[2]&65535)';
      return b.n === 1 ? `IO.outb(${p},R[0]&255);` : b.n === 2 ? `IO.outw(${p},R[0]&65535);` : `IO.outd(${p},R[0]);`;
    }
    case 'int': return `IO.int(${a.v});`;
    case 'int3': return `throw new Error('int3 en ${hex(x.dir)}');`;
    case 'cli': case 'sti': case 'hlt': return `IO.sistema('${op}');`;
    case 'clc': return 'fijarCf(0);'; case 'stc': return 'fijarCf(1);'; case 'cmc': return 'fijarCf(1-cf());';
    case 'cld': return 'F.df=0;'; case 'std': return 'F.df=1;';
    case 'sahf': return 'sahf();'; case 'lahf': return 'lahf();';
    case 'nop': case 'wait': return '';
    case 'cpuid': return 'R[0]=0;R[3]=0;R[1]=0;R[2]=0;';
    // segmentos en modelo plano: selectores ficticios, limite de 4 GB, acceso permitido
    case 'lar': return escribir(a, '0x00CFFB00') + 'explicitas(cf(),1,0,0,0);';
    case 'lsl': return escribir(a, '-1') + 'explicitas(cf(),1,0,0,0);';
    case 'verr': case 'verw': return 'explicitas(cf(),1,0,0,0);';
    case 'sldt': case 'str': return escribir(a, '0');
    case 'lldt': case 'ltr': return '';
    case 'les': case 'lds': case 'lss': case 'lfs': case 'lgs': return escribir(a, leer(b));
    case 'iretd': return 'R[4]+=12;return;';                               // saca EIP, CS y EFLAGS
    // llamada lejana por memoria = encadenar con una interrupcion vieja de DOS (pushfd + call far [vector]).
    // Ese manejador viejo no existe: se simula uno que solo hace iretd (saca EIP, CS y los EFLAGS empujados).
    case 'callf': if (a.t === 'mem') return 'R[4]+=4;'; return `throw new Error('salto lejano (${op}) en ${hex(x.dir)}');`;
    case 'jmpf': case 'retf': return `throw new Error('salto lejano (${op}) en ${hex(x.dir)}');`;
    case 'rdtsc': return '{const t=Math.floor(performance.now()*1e3);R[0]=t|0;R[2]=0;}';
  }
  if (op[0] === 'j') { const cc = op.slice(1); return `if(c_${cc}()){${salto(a.v)}}`; }
  if (op.startsWith('set')) return escribir(a, `c_${op.slice(3)}()`);
  if (op.startsWith('cmov')) return `if(c_${op.slice(4)}()){${escribir(a, leer(b))}}`;
  throw new Error('instruccion sin traducir: ' + op + ' en ' + hex(x.dir));
}

const TERMINA = new Set(['ret', 'jmp', 'hlt', 'retf', 'jmpf', 'iretd']);
export const estadisticas = { sinBanderas: 0, fusionadas: 0, total: 0 };
const FUSIONABLES = new Set(['e', 'ne', 'l', 'ge', 'le', 'g', 'b', 'ae', 'be', 'a', 's', 'ns']);
export function generarFuncion(f) {
  const dirs = [...f.insts.keys()].sort((p, q) => p - q);
  const vivo = vidaDeBanderas(f);
  let s = `FN[${hex(f.entrada)}]=function f_${f.entrada.toString(16)}(){let pc=${hex(f.entrada)};for(;;)switch(pc){\n`;
  const fusionado = new Set();      // jcc que se emiten con la condicion del cmp/test anterior
  for (let k = 0; k < dirs.length; k++) {
    const d = dirs[k], x = f.insts.get(d);
    const contiguo = k > 0 && dirs[k - 1] + f.insts.get(dirs[k - 1]).tam === d;
    if (f.inicioBloque.has(d) || !contiguo) s += `case ${hex(d)}:`;
    let js;
    estadisticas.total++;
    try {
      const y = f.insts.get(d + x.tam);
      const cc = y && y.op[0] === 'j' && y.op !== 'jmp' && y.op !== 'jecxz' ? y.op.slice(1) : null;
      if ((x.op === 'cmp' || x.op === 'test') && cc && FUSIONABLES.has(cc) && !f.inicioBloque.has(y.dir) && vivo.get(y.dir) === false) {
        const cond = condFusionada(x, cc);
        if (cond) { fusionado.add(y.dir); y.condicion = cond; js = ''; estadisticas.fusionadas++; }
      }
      if (js === undefined && fusionado.has(d)) {
        const t = x.ops[0].v;
        js = `if(${x.condicion}){${f.insts.has(t) ? `pc=${hex(t)};continue;` : `saltar(${hex(t)});return;`}}`;
      }
      if (js === undefined) { const v = vivo.get(d) !== false; if (!v && sinBanderas(x) !== null) estadisticas.sinBanderas++; js = traducirInst(x, f, v); }
    } catch (e) { js = `throw new Error(${JSON.stringify(e.message)});`; f.sinTraducir = (f.sinTraducir || 0) + 1; }
    s += js + '\n';
    const sig = d + x.tam;
    if (!(TERMINA.has(x.op)) && (k + 1 >= dirs.length || dirs[k + 1] !== sig)) s += `pc=${hex(sig)};continue;\n`;
  }
  s += 'default:saltar(pc);return;}};\n';
  return s;
}

// ---------- programa ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const vol = path.join(base, 'investigacion', 'volcados');
  const img = new Imagen(fs.readFileSync(path.join(vol, 'codigo_0x20000.bin')), fs.readFileSync(path.join(vol, 'datos_0x130000.bin')));
  // donde empieza cada funcion (de la lista 'afl' de radare2; funciones.txt tiene solo las direcciones)
  const afl = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'funciones.txt'), 'latin1').split(/\r?\n/).filter(l => l.startsWith('0x')).map(l => parseInt(l.split(/\s+/)[0], 16));
  const esMesa = (d) => d >= 0x49000 && d < 0xED000;     // provisorio: Mesa no se traduce
  // entradas extra encontradas al correr (punteros que no se descubren solos)
  const extra = path.join(path.dirname(fileURLToPath(import.meta.url)), 'entradas_extra.json');
  const extras = fs.existsSync(extra) ? JSON.parse(fs.readFileSync(extra, 'utf8')).map(v => parseInt(v, 16)) : [];
  let entradas = [0x10E024, ...afl.filter(d => !esMesa(d)), ...extras];
  let fns = descubrir(img, entradas, new Set(), esMesa);
  for (let vuelta = 0; vuelta < 5; vuelta++) {          // sumar las funciones que solo se usan por puntero
    const cand = candidatosPuntero(img, fns, esMesa);
    if (!cand.length) break;
    entradas = [...entradas, ...cand];
    fns = descubrir(img, entradas, new Set(), esMesa);
    console.log(`vuelta ${vuelta + 1}: +${cand.length} punteros a funciones -> ${fns.size} funciones`);
  }
  let js = '// GENERADO por tools\\recompilador\\traducir.mjs a partir de Piu.exe. No editar a mano.\n' +
    "import { R, F, FP, IO, FN, r8, r16, r32, w8, w16, w32, push, pop, fij, add, adc, sub, sbb, logica, inc, dec, neg, shl, shr, sar, rol, ror, rcl, rcr, imul1, imul2, mul1, div1, idiv1, movs, stos, lods, scas, cmps, sahf, lahf, fijarCf, cf, explicitas, pushfd, popfd, pushad, popad, llamar, saltar, fninit, fst, fset, fpush, fpop, fcom, fstsw, redondear, rf32, rf64, rf80, wf32, wf64, wf80, rentero64, wentero64, aEntero, c_o, c_no, c_b, c_ae, c_e, c_ne, c_be, c_a, c_s, c_ns, c_p, c_np, c_l, c_ge, c_le, c_g } from './cpu.js';\n";
  let sinTraducir = 0;
  for (const f of [...fns.values()].sort((p, q) => p.entrada - q.entrada)) { js += generarFuncion(f); sinTraducir += f.sinTraducir || 0; }
  const salida = process.argv[2] ? path.resolve(process.argv[2]) : path.join(base, 'app', 'port', 'traducido.js');   // (otra salida: para comparar)
  fs.writeFileSync(salida, js);
  console.log(`traducidas ${fns.size} funciones -> ${salida} (${(js.length / 1048576).toFixed(1)} MB); instrucciones sin traducir: ${sinTraducir}`);
  console.log(`banderas: ${estadisticas.sinBanderas} instrucciones sin calcularlas, ${estadisticas.fusionadas} comparaciones fusionadas con su salto (de ${estadisticas.total})`);
}
