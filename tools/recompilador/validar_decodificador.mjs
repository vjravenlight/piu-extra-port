// Compara el decodificador propio (x86.mjs) con el desarmado de radare2 (investigacion\volcados\desarmado_juego.txt):
// mismo nombre de instruccion y mismo largo, instruccion por instruccion.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodificar } from './x86.mjs';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const vol = path.join(base, 'investigacion', 'volcados');
const cod = fs.readFileSync(path.join(vol, 'codigo_0x20000.bin'));
const lineas = fs.readFileSync(path.join(vol, 'desarmado_juego.txt'), 'latin1').split(/\r?\n/);

const insts = [];
for (const l of lineas) {
  if (l.startsWith('===FN')) { insts.push(null); continue; }
  const m = /0x000([0-9a-f]{5})\s+(.*)$/.exec(l);
  if (!m) continue;
  let txt = m[2].replace(/\s*;.*$/, '').trim();
  if (!/^[a-z]/.test(txt)) continue;
  insts.push({ dir: parseInt(m[1], 16), txt });
}
const norm = (t) => {
  let [a, ...resto] = t.split(/\s+/);
  if (a === 'rep' || a === 'repne' || a === 'repe' || a === 'lock') a = resto[0];
  return a;
};
const alias = { 'jnb': 'jae', 'jnae': 'jb', 'jz': 'je', 'jnz': 'jne', 'jc': 'jb', 'jnc': 'jae', 'sal': 'shl', 'fstsw': 'fnstsw', 'fwait': 'wait', 'cmpsb': 'cmpsb', 'stosd': 'stosd' };
let ok = 0, malNombre = 0, malLargo = 0, nulos = 0;
const ejemplos = { nombre: [], largo: [], nulo: [] };
for (let i = 0; i < insts.length; i++) {
  const x = insts[i]; if (!x) continue;
  const d = decodificar(cod, x.dir - 0x20000, x.dir);
  if (!d) { nulos++; if (ejemplos.nulo.length < 15) ejemplos.nulo.push(`0x${x.dir.toString(16)} ${x.txt} [${[...cod.subarray(x.dir - 0x20000, x.dir - 0x20000 + 6)].map(v => v.toString(16).padStart(2, '0')).join(' ')}]`); continue; }
  const r2 = alias[norm(x.txt)] || norm(x.txt), mio = alias[d.op] || d.op;
  if (r2 !== mio) { malNombre++; if (ejemplos.nombre.length < 15) ejemplos.nombre.push(`0x${x.dir.toString(16)} r2="${x.txt}" mio="${d.op}"`); continue; }
  const sig = insts[i + 1];
  if (sig && sig.dir > x.dir && sig.dir - x.dir < 16 && sig.dir - x.dir !== d.tam) {
    malLargo++; if (ejemplos.largo.length < 15) ejemplos.largo.push(`0x${x.dir.toString(16)} "${x.txt}" largo mio ${d.tam} vs ${sig.dir - x.dir}`); continue;
  }
  ok++;
}
console.log(`instrucciones: ${ok + malNombre + malLargo + nulos} · bien ${ok} · nombre distinto ${malNombre} · largo distinto ${malLargo} · no decodificadas ${nulos}`);
for (const [k, v] of Object.entries(ejemplos)) if (v.length) console.log(`--- ${k} ---\n  ` + v.join('\n  '));
