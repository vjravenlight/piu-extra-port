// Muestra instrucciones de Piu.exe con el decodificador propio. Uso: node ver.mjs 0xDIRECCION [cantidad]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Imagen } from './cfg.mjs';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const vol = path.join(base, 'investigacion', 'volcados');
const img = new Imagen(fs.readFileSync(path.join(vol, 'codigo_0x20000.bin')), fs.readFileSync(path.join(vol, 'datos_0x130000.bin')));
const hex = (v) => '0x' + (v >>> 0).toString(16);
const op = (o) => {
  if (o.t === 'reg' || o.t === 'sreg') return o.r;
  if (o.t === 'imm') return hex(o.v >>> 0);
  if (o.t === 'rel') return hex(o.v);
  if (o.t === 'st') return `st(${o.i})`;
  const p = []; if (o.base) p.push(o.base); if (o.idx) p.push(o.idx + (o.esc > 1 ? '*' + o.esc : '')); if (o.desp || !p.length) p.push(hex(o.desp >>> 0));
  return `${{ 1: 'byte', 2: 'word', 4: 'dword', 8: 'qword', 10: 'tbyte' }[o.n] || ''} [${p.join('+')}]`;
};
let d = parseInt(process.argv[2], 16); const n = +(process.argv[3] || 40);
for (let i = 0; i < n; i++) {
  const x = img.inst(d);
  if (!x) { console.log(hex(d) + '  ??  ' + [0, 1, 2, 3].map(k => img.u8(d + k).toString(16).padStart(2, '0')).join(' ')); break; }
  let txt = (x.rep ? x.rep + ' ' : '') + x.op + ' ' + x.ops.map(op).join(', ');
  const ref = x.ops.find(o => (o.t === 'imm' && o.n === 4 && (o.v >>> 0) >= 0x130000 && (o.v >>> 0) < 0x1CB000) || (o.t === 'mem' && !o.base && !o.idx));
  if (ref) { const a = ref.t === 'imm' ? ref.v >>> 0 : ref.desp >>> 0; let s = ''; for (let k = 0; k < 40; k++) { const c = img.u8(a + k); if (c < 32 || c > 126) break; s += String.fromCharCode(c); } if (s.length > 3) txt += `   ; "${s}"`; }
  console.log(hex(d) + '  ' + txt);
  d += x.tam;
}
