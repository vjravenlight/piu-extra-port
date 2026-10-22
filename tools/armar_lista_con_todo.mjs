// Arma app\port\game_con_todo.cfg: el game.cfg original (intacto en el disco) + los pasos que el disco trae y el juego
// nunca ofrece (investigacion\ARCHIVOS_SIN_USAR.md). Se usa con F7 en el port ("lista con todo"), desde el proximo credito.
// Reglas (las del exe, investigacion\JUEGO_REGLAS.md 3.1-3.4):
// - una cancion entra a un modo solo si estan TODOS sus archivos: pasos de 1 y de 2 jugadores (o el doble), audio,
//   vista previa D%02d, fondo y caratula; si falta uno, el juego se cortaria al cargarlo;
// - cada lista tiene como maximo 50 entradas (en CRAZY se dejan 6 lugares para las 3 ocultas que se agregan jugando);
// - las estrellas salen de la densidad de notas, comparada con las canciones que ya estan en esa lista.
// Uso: node armar_lista_con_todo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerPasos } from '../app/motor/cifrados.js';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const piu = path.join(base, 'extraido', 'Piu');
const nn = (n) => String(n).padStart(2, '0');
const carpeta = (c) => fs.readdirSync(piu).find(n => n.toLowerCase() === c);
const hay = {};
for (const c of ['step', 'audio', 'bga', 'title']) hay[c] = new Set(fs.readdirSync(path.join(piu, carpeta(c))).map(n => n.toLowerCase()));
// notas / segundos, leyendo el .NOT del disco (app\motor\cifrados.js); los segundos redondeados a 0,1 como en el
// resumen.csv de convertir_pasos.ps1, que es lo que se usaba antes (21/10: asi sale la misma lista sin descifrado\)
const pasosStep = new Map(fs.readdirSync(path.join(piu, carpeta('step'))).map(n => [n.toLowerCase(), path.join(piu, carpeta('step'), n)]));
const densidades = new Map();
const densidad = (paso) => {
  if (densidades.has(paso)) return densidades.get(paso);
  const f = pasosStep.get(paso + '.not');
  let d = NaN;
  if (f) {
    const p = leerPasos(path.basename(f), new Uint8Array(fs.readFileSync(f)));
    const seg = p.filasPorPulso > 0 && p.bpms.length && p.bpms[0] > 0 ? p.ultimaFila / p.filasPorPulso * 60 / p.bpms[0] : 0;
    d = p.notas.length / (Math.round(seg * 10) / 10);
  }
  densidades.set(paso, d);
  return d;
};

// game.cfg original, tal cual (latin1 para no tocar los bytes del titulo en coreano)
const original = fs.readFileSync(path.join(piu, 'game.cfg'), 'latin1');
const lineas = original.split(/\r?\n/);
const listas = {};
let modo = null;
for (const l of lineas) {
  const p = l.trim().split(/\s+/);
  if (p[0] === 'MODENAME') { modo = p[1]; listas[modo] = []; }
  else if (p[0] === 'SONG' && modo) listas[modo].push({ n: +p[1], nivel: +p[2], marca: +p[3] });
}

// archivos que necesita cada entrada, segun el modo (JUEGO_REGLAS.md 3.3)
const pasosDe = {
  NORMAL: (n) => [`${nn(n)}_n1`, `${nn(n)}_n2`], HARD: (n) => [`${nn(n)}_h1`, `${nn(n)}_h2`], BATTLE: (n) => [`${nn(n)}_h1`],
  XX: (n, m) => (m === 2 ? [`${nn(n)}_xd`] : [`${nn(n)}_x1`, `${nn(n)}_x2`]), DOUBLE: (n) => [`${nn(n)}_db`],
};
const completa = (modo, n, marca) => pasosDe[modo](n, marca).every(p => hay.step.has(p + '.not')) &&
  hay.audio.has(`${nn(n)}.aud`) && hay.audio.has(`d${nn(n)}.aud`) && hay.bga.has(`${nn(n)}.dat`) && hay.title.has(`t${nn(n)}.pnz`);
// estrellas: el nivel de la cancion de la lista con la densidad mas parecida
function nivel(modo, n, marca) {
  const d = densidad(pasosDe[modo](n, marca)[0]);
  let mejor = null;
  for (const s of listas[modo]) {
    const ds = densidad(pasosDe[modo](s.n, s.marca)[0]);
    if (!isNaN(ds) && (!mejor || Math.abs(ds - d) < mejor.dif)) mejor = { dif: Math.abs(ds - d), nivel: s.nivel };
  }
  return mejor ? mejor.nivel : 3;
}

// candidatos: los pasos sin usar (ARCHIVOS_SIN_USAR.md), por modo; la lista ya dice si estan completos
const candidatos = [
  ['NORMAL', 5, 0], ['NORMAL', 11, 0], ['NORMAL', 43, 0], ['NORMAL', 19, 0],
  ['HARD', 43, 0], ['HARD', 49, 0], ['HARD', 8, 0],
  ['BATTLE', 8, 0], ['BATTLE', 43, 0], ['BATTLE', 49, 0],
  ['DOUBLE', 8, 0],
  ...[10, 22, 28, 55, 56, 57, 58, 59, 62, 63, 64, 65, 66, 69, 16, 5].map(n => ['XX', n, 0]),
  ['XX', 28, 2], ['XX', 16, 2],
];
const MAX = { NORMAL: 50, HARD: 50, BATTLE: 50, DOUBLE: 50, REMIX: 50, XX: 44 };
const agregadas = {}, afuera = [];
for (const [modo, n, marca] of candidatos) {
  const ya = listas[modo].some(s => s.n === n && (s.marca === 2) === (marca === 2));
  const motivo = ya ? 'ya estaba' : !completa(modo, n, marca) ? 'le faltan archivos (' + pasosDe[modo](n, marca).filter(p => !hay.step.has(p + '.not')).join(', ') + ')'
    : n === 19 ? 'es una prueba (13 s, 3 notas)' : listas[modo].length >= MAX[modo] ? `la lista ${modo} ya esta llena` : null;
  if (motivo) { afuera.push(`${modo} ${nn(n)}${marca === 2 ? ' doble' : ''}: ${motivo}`); continue; }
  const s = { n, nivel: nivel(modo, n, marca), marca };
  listas[modo].push(s);
  (agregadas[modo] = agregadas[modo] || []).push(s);
}

// escribir: el original linea por linea, con las nuevas al final de cada bloque MODENAME
const salida = [];
const nombre = (l) => { const p = l.trim().split(/\s+/); return p[0] === 'MODENAME' ? p[1] : null; };
let actual = null;
const cerrar = () => { if (actual && agregadas[actual]) { salida.push(`// --- agregadas por el port (lista con todo): pasos que el disco trae y el juego no ofrecia ---`); for (const s of agregadas[actual]) salida.push(`SONG   ${String(s.n).padStart(2)}   ${String(s.nivel).padStart(2)}   ${s.marca}`); } };
for (let i = 0; i < lineas.length; i++) {
  const m = nombre(lineas[i]);
  if (m) { cerrar(); actual = m; }
  // el bloque termina antes de las lineas vacias que preceden al MODENAME siguiente (o al final)
  salida.push(lineas[i]);
  const resto = lineas.slice(i + 1);
  if (actual && lineas[i].trim().startsWith('SONG') && !resto.some(l => l.trim().startsWith('SONG') && !nombre(l)) ) { cerrar(); actual = null; }
  else if (actual && lineas[i].trim().startsWith('SONG')) {
    const sig = resto.findIndex(l => l.trim() !== '');
    if (sig >= 0 && nombre(resto[sig])) { cerrar(); actual = null; }
  }
}
fs.writeFileSync(path.join(base, 'app', 'port', 'game_con_todo.cfg'), salida.join('\r\n'), 'latin1');

console.log('Agregadas:');
for (const [m, l] of Object.entries(agregadas)) console.log(`  ${m} (${listas[m].length} en total): ` + l.map(s => `${nn(s.n)}${s.marca === 2 ? ' doble' : ''} (${s.nivel})`).join(', '));
console.log('Quedaron afuera:'); for (const a of afuera) console.log('  ' + a);
