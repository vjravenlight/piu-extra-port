// Descubre las funciones del ejecutable y su grafo de control (bloques, saltos, tablas de switch, llamadas),
// usando el decodificador propio sobre la imagen de memoria (codigo y datos con las direcciones resueltas).
import { decodificar } from './x86.mjs';

export const COD_INI = 0x20000, COD_FIN = 0x117000, DAT_INI = 0x130000;

export class Imagen {
  constructor(cod, dat) { this.cod = cod; this.dat = dat; }
  enCodigo(d) { return d >= COD_INI && d < COD_INI + this.cod.length; }
  u8(d) { if (this.enCodigo(d)) return this.cod[d - COD_INI]; const o = d - DAT_INI; return o >= 0 && o < this.dat.length ? this.dat[o] : 0; }
  u32(d) { return (this.u8(d) | (this.u8(d + 1) << 8) | (this.u8(d + 2) << 16) | (this.u8(d + 3) << 24)) >>> 0; }
  inst(d) { return this.enCodigo(d) ? decodificar(this.cod, d - COD_INI, d) : null; }
}

const TERMINA = new Set(['ret', 'jmp', 'hlt', 'iretd', 'retf', 'jmpf']);

// Recorre una funcion desde su entrada. 'externas' = direcciones que no se traducen (se resuelven con HLE).
export function analizarFuncion(img, entrada, externas, conocidas = new Set()) {
  const insts = new Map();          // dir -> instruccion
  const pendientes = [entrada];
  const llamadas = new Set(), indirectas = [], tablas = [], problemas = [];
  const inicioBloque = new Set([entrada]);
  while (pendientes.length) {
    let d = pendientes.pop();
    while (!insts.has(d)) {
      const x = img.inst(d);
      if (!x) { problemas.push({ dir: d, motivo: 'no decodifica' }); break; }
      insts.set(d, x);
      const sig = d + x.tam, op = x.op, a = x.ops[0];
      if (op === 'call') {
        if (a.t === 'rel') llamadas.add(a.v); else indirectas.push(d);
      } else if (op[0] === 'j' && op !== 'jmp') {         // salto condicional
        pendientes.push(a.v); inicioBloque.add(a.v); inicioBloque.add(sig);
      } else if (op === 'loop' || op === 'jecxz') {
        pendientes.push(a.v); inicioBloque.add(a.v); inicioBloque.add(sig);
      } else if (op === 'jmp') {
        if (a.t === 'rel') {
          if (externas.has(a.v) || (conocidas.has(a.v) && a.v !== entrada) || !img.enCodigo(a.v)) { llamadas.add(a.v); x.cola = true; }   // salto de cola a otra funcion
          else { pendientes.push(a.v); inicioBloque.add(a.v); }
        } else if (a.t === 'mem' && a.desp && ((a.idx && a.esc === 4 && !a.base) || (a.base && !a.idx))) {
          // switch: jmp [idx*4 + tabla]; el limite sale del "cmp idx, N" anterior.
          // Tambien jmp [reg + tabla] con el registro ya multiplicado por 4 ("shl ecx, 2" o un puntero que avanza de
          // a 4): GAME OPTION 0x386d5 ("cmp ebx, 4; ja; jmp [ecx+0x38540]") y 0x10efcf ("cmp cl, 8; ja; ...").
          // Ahi el cmp es sobre otro registro: se toma el cmp con inmediato mas cercano.
          const conBase = !a.idx;
          const tabla = a.desp >>> 0; let n = 0;
          for (let b = d - 1, k = 0; k < 40 && b > entrada; b--, k++) {
            const y = insts.get(b);
            if (y && y.op === 'cmp' && y.ops[0].t === 'reg' && (conBase || y.ops[0].r === a.idx) && y.ops[1].t === 'imm') { n = (y.ops[1].v >>> 0) + 1; break; }
          }
          // el limite puede compararse contra otro registro (p. ej. "cmp bl, 0xd" + "mov dl, bl"): se toma tambien
          // la cantidad de entradas seguidas que apuntan a codigo valido cerca de la funcion, y se usa la mayor.
          // Con [reg + tabla] manda el cmp (la tabla de 0x38540 sigue pegada a otra tabla de la misma funcion).
          let n2 = 0;
          while (n2 < 256) { const t = img.u32(tabla + n2 * 4); if (!img.enCodigo(t) || t < entrada - 0x2000 || t > entrada + 0x20000 || !img.inst(t)) break; n2++; }
          n = conBase ? (n || n2) : Math.max(n, n2);
          const destinos = [];
          for (let i = 0; i < n; i++) { const t = img.u32(tabla + i * 4); destinos.push(t); pendientes.push(t); inicioBloque.add(t); }
          tablas.push({ dir: d, tabla, n, destinos });
        } else indirectas.push(d);
        break;
      }
      if (TERMINA.has(op)) break;
      d = sig;
    }
  }
  return { entrada, insts, inicioBloque, llamadas: [...llamadas], indirectas, tablas, problemas };
}

// Punteros a funciones: valores de 32 bits (en los datos alineados y en inmediatos de las instrucciones) que apuntan
// al codigo, a una instruccion que no esta adentro de una funcion ya descubierta.
export function candidatosPuntero(img, funciones, esExterna = () => false) {
  const cubiertas = new Set();
  for (const f of funciones.values()) for (const d of f.insts.keys()) cubiertas.add(d);
  const cand = new Set();
  const probar = (v) => { if (img.enCodigo(v) && !esExterna(v) && !funciones.has(v) && !cubiertas.has(v) && img.inst(v)) cand.add(v); };
  for (let o = 0; o + 4 <= img.dat.length; o += 4) probar(img.u32(0x130000 + o));
  // tablas empaquetadas (por ejemplo las de inicializacion de Watcom, de 6 bytes): punteros sin alinear, solo si
  // apuntan justo despues de un ret / relleno, o a la direccion siguiente al final de una funcion conocida
  const finales = new Set();
  for (const f of funciones.values()) for (const x of f.insts.values()) if (x.op === 'ret' || x.op === 'jmp') finales.add(x.dir + x.tam);
  const pareceInicio = (v) => { const p = img.u8(v - 1); return finales.has(v) || p === 0xC3 || p === 0x90 || p === 0xCC || (img.u8(v - 3) === 0xC2); };
  for (let o = 0; o + 4 <= img.dat.length; o++) { const v = img.u32(0x130000 + o); if (v & 3 && img.enCodigo(v) && pareceInicio(v)) probar(v); }
  // punteros explicitos en el codigo (push/mov de una direccion de codigo): siempre son funciones, aunque se superpongan
  const explicito = (v) => { if (img.enCodigo(v) && !esExterna(v) && !funciones.has(v) && img.inst(v)) cand.add(v); };
  for (const f of funciones.values()) for (const x of f.insts.values()) for (const op of x.ops) {
    if (op.t === 'imm' && op.n === 4) {
      const v = op.v >>> 0; explicito(v);
      // estructuras empaquetadas que el codigo usa (p. ej. la info de tipo de C++ de Watcom: constructor en +1)
      if (v >= 0x130000 && v < 0x130000 + img.dat.length) for (let k = 0; k < 16; k++) { const p = img.u32(v + k); if (p !== v) explicito(p); }
    }
  }
  return [...cand];
}

// Descubre todas las funciones alcanzables desde las entradas dadas.
export function descubrir(img, entradas, externas, esExterna = () => false) {
  const funciones = new Map(), cola = [...entradas], conocidas = new Set(entradas);
  while (cola.length) {
    const e = cola.pop();
    if (funciones.has(e) || externas.has(e) || esExterna(e) || !img.enCodigo(e)) continue;
    const f = analizarFuncion(img, e, externas, conocidas);
    for (const c of f.llamadas) conocidas.add(c);
    funciones.set(e, f);
    for (const c of f.llamadas) if (!funciones.has(c)) cola.push(c);
  }
  return funciones;
}
