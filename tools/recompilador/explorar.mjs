// Explora todo el ejecutable con el descubridor de funciones y da un resumen (para el traductor).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Imagen, descubrir } from './cfg.mjs';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const vol = path.join(base, 'investigacion', 'volcados');
const img = new Imagen(fs.readFileSync(path.join(vol, 'codigo_0x20000.bin')), fs.readFileSync(path.join(vol, 'datos_0x130000.bin')));
const afl = fs.readFileSync(path.join(vol, 'funciones_afl.txt'), 'latin1').split(/\r?\n/).filter(l => l.startsWith('0x')).map(l => parseInt(l.split(/\s+/)[0], 16));
const MESA = [0x49000, 0xED000];   // provisorio: Mesa no se traduce (OpenGL va a WebGL)
const esMesa = (d) => d >= MESA[0] && d < MESA[1];
const entradas = [0x10E024, ...afl.filter(d => !esMesa(d))];
const t0 = Date.now();
const fns = descubrir(img, entradas, new Set(), esMesa);
let insts = 0, tablas = 0, indir = 0; const problemas = [], aMesa = new Map(), ops = new Map();
for (const f of fns.values()) {
  insts += f.insts.size; tablas += f.tablas.length; indir += f.indirectas.length;
  for (const p of f.problemas) problemas.push({ fn: f.entrada, ...p });
  for (const c of f.llamadas) if (esMesa(c)) aMesa.set(c, (aMesa.get(c) || 0) + 1);
  for (const x of f.insts.values()) ops.set(x.op, (ops.get(x.op) || 0) + 1);
}
console.log(`funciones: ${fns.size} · instrucciones: ${insts} · tablas de switch: ${tablas} · llamadas/saltos indirectos: ${indir} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log(`llamadas a Mesa: ${aMesa.size} funciones distintas`);
console.log(`instrucciones distintas: ${ops.size}: ` + [...ops.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' | '));
console.log(`problemas: ${problemas.length}`); for (const p of problemas.slice(0, 12)) console.log(`  fn 0x${p.fn.toString(16)} en 0x${p.dir.toString(16)}: ${p.motivo} [${[0, 1, 2, 3, 4, 5].map(i => img.u8(p.dir + i).toString(16).padStart(2, '0')).join(' ')}]`);
fs.writeFileSync(path.join(vol, 'llamadas_a_mesa.json'), JSON.stringify(Object.fromEntries([...aMesa.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ['0x' + k.toString(16), v])), null, 1));
