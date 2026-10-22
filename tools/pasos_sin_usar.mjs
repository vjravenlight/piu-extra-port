// Cruza los .NOT de STEP\ con lo que game.cfg deja elegir (reglas del exe: investigacion\JUEGO_REGLAS.md 3.1-3.4)
// y muestra los pasos que estan en el disco pero el juego nunca carga. Uso: node pasos_sin_usar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const piu = path.join(base, 'extraido', 'Piu');
const buscar = (carpeta) => fs.readdirSync(piu).find(n => n.toLowerCase() === carpeta.toLowerCase());
const pasos = fs.readdirSync(path.join(piu, buscar('STEP'))).filter(n => /\.not$/i.test(n)).map(n => n.toLowerCase());
const audios = new Set(fs.readdirSync(path.join(piu, buscar('AUDIO'))).map(n => n.toLowerCase()));
const fondos = new Set(fs.readdirSync(path.join(piu, buscar('BGA'))).map(n => n.toLowerCase()));

// game.cfg: MODENAME <nombre> / SONG <nro> <nivel> <marca>
const listas = {};
let modo = null;
for (const linea of fs.readFileSync(path.join(piu, 'game.cfg'), 'latin1').split(/\r?\n/)) {
  const p = linea.trim().split(/\s+/);
  if (p[0] === 'MODENAME') { modo = p[1]; listas[modo] = []; }
  else if (p[0] === 'SONG' && modo) listas[modo].push({ n: +p[1], nivel: +p[2], marca: +p[3] });
}

// que archivos puede cargar el juego, y por que
const usados = new Map();
const usar = (archivo, motivo) => { archivo = archivo.toLowerCase(); if (!usados.has(archivo)) usados.set(archivo, []); usados.get(archivo).push(motivo); };
const nn = (n) => String(n).padStart(2, '0');
for (const s of listas.NORMAL || []) { usar(`${nn(s.n)}_n1.not`, 'NORMAL 1 jugador'); usar(`${nn(s.n)}_n2.not`, 'NORMAL 2 jugadores'); }
for (const s of listas.HARD || []) { usar(`${nn(s.n)}_h1.not`, 'HARD 1 jugador'); usar(`${nn(s.n)}_h2.not`, 'HARD 2 jugadores'); }
const xx = [...(listas.XX || [])];
for (const n of [7, 20, 21]) xx.push({ n, marca: 0, oculta: true }, { n, marca: 2, oculta: true });   // ocultas de CRAZY
for (const s of xx) {
  const o = s.oculta ? ' (oculta)' : '';
  if (s.marca === 2) usar(`${nn(s.n)}_xd.not`, 'CRAZY doble' + o);
  else { usar(`${nn(s.n)}_x1.not`, 'CRAZY 1 jugador' + o); usar(`${nn(s.n)}_x2.not`, 'CRAZY 2 jugadores' + o); }
}
for (const s of listas.DOUBLE || []) usar(`${nn(s.n)}_db.not`, 'DOUBLE');
for (const s of listas.BATTLE || []) usar(`${nn(s.n)}_h1.not`, 'BATTLE');
for (const s of listas.REMIX || []) {
  if (s.marca === 2) usar(`${nn(s.n)}_db.not`, 'REMIX doble');
  else { usar(`${nn(s.n)}_1.not`, 'REMIX 1 jugador'); usar(`${nn(s.n)}_2.not`, 'REMIX 2 jugadores'); }
}
for (const n of [41, 44, 42, 15, 4, 17, 13, 16, 45, 47, 14, 6, 9, 40, 11, 5, 39, 19]) usar(`${nn(n)}_h2.not`, 'demo');

const sinUsar = pasos.filter(p => !usados.has(p)).sort();
const faltan = [...usados.keys()].filter(p => !pasos.includes(p)).sort();
console.log(`Pasos en el disco: ${pasos.length} · los carga el juego: ${pasos.length - sinUsar.length} · nunca los carga: ${sinUsar.length}`);
const porCancion = new Map();
for (const p of sinUsar) { const n = p.slice(0, 2); if (!porCancion.has(n)) porCancion.set(n, []); porCancion.get(n).push(p.replace('.not', '')); }
for (const [n, l] of [...porCancion.entries()].sort()) {
  const conAudio = audios.has(`${n}.aud`) ? 'audio sí' : 'SIN audio';
  const conFondo = fondos.has(`${n}.dat`) ? 'fondo sí' : 'sin fondo';
  console.log(`  ${n}: ${l.join(' ')}  (${conAudio}, ${conFondo})`);
}
if (faltan.length) console.log('Pedidos por game.cfg pero que NO estan en el disco: ' + faltan.join(' '));
