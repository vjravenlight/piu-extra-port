// Relevamiento del disco: que archivos pide el juego y cuales estan pero nunca se usan.
// Reglas sacadas del exe (investigacion\JUEGO_REGLAS.md): listas de game.cfg (3.1-3.4), ocultas de CRAZY (7, 20, 21),
// demo (2.1), vista previa D%02d, modo RUSH r%02d con su lista de exclusion (3.6), SOUND TEST (audios 1-48),
// ayuda (audio 03, bga\03.dat), final (audio 49, BGA\84.dat, solo por consola) y los nombres fijos que aparecen
// como texto dentro de Piu.exe. Escribe investigacion\ARCHIVOS_SIN_USAR.md. Uso: node archivos_sin_usar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const piu = path.join(base, 'extraido', 'Piu');
const vol = path.join(base, 'investigacion', 'volcados');
const nn = (n) => String(n).padStart(2, '0');

// ---------- todos los archivos del disco ----------
const archivos = [];
(function recorrer(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) recorrer(path.join(d, e.name), r); else archivos.push({ rel: r, bajo: r.toLowerCase(), tam: fs.statSync(path.join(d, e.name)).size });
  }
})(piu, '');

// ---------- textos dentro del exe (nombres de archivo fijos) ----------
const textos = new Set();
for (const f of ['codigo_0x20000.bin', 'datos_0x130000.bin']) {
  const b = fs.readFileSync(path.join(vol, f));
  let s = '';
  for (const c of b) {
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
    else { if (s.length >= 3) textos.add(s.toLowerCase().replace(/\\/g, '/')); s = ''; }
  }
}
const nombreEnExe = (bajo) => { const nombre = bajo.split('/').pop(); for (const t of textos) if (t.endsWith(nombre) || t.endsWith('/' + nombre)) return true; return false; };

// ---------- game.cfg ----------
const listas = {};
let modo = null;
for (const linea of fs.readFileSync(path.join(piu, 'game.cfg'), 'latin1').split(/\r?\n/)) {
  const p = linea.trim().split(/\s+/);
  if (p[0] === 'MODENAME') { modo = p[1]; listas[modo] = []; }
  else if (p[0] === 'SONG' && modo) listas[modo].push({ n: +p[1], marca: +p[3] });
}
const ocultas = [7, 20, 21];
const demo = [41, 44, 42, 15, 4, 17, 13, 16, 45, 47, 14, 6, 9, 40, 11, 5, 39, 19];
const enListas = new Set([...Object.values(listas).flat().map(s => s.n), ...ocultas]);
const exclusionRush = new Set([1, 2, 3, 5, 21, 28, 29, 36, 52, 57, 59, 61, 62, 63, 64, 65, 80, 81, 51, 54, 66]);

// ---------- quien pide cada archivo ----------
const usados = new Map();
const usar = (bajo, motivo) => { if (!usados.has(bajo)) usados.set(bajo, new Set()); usados.get(bajo).add(motivo); };
// pasos
for (const s of listas.NORMAL || []) { usar(`step/${nn(s.n)}_n1.not`, 'NORMAL'); usar(`step/${nn(s.n)}_n2.not`, 'NORMAL 2J'); }
for (const s of listas.HARD || []) { usar(`step/${nn(s.n)}_h1.not`, 'HARD'); usar(`step/${nn(s.n)}_h2.not`, 'HARD 2J'); }
for (const s of [...(listas.XX || []), ...ocultas.flatMap(n => [{ n, marca: 0 }, { n, marca: 2 }])]) {
  if (s.marca === 2) usar(`step/${nn(s.n)}_xd.not`, 'CRAZY doble');
  else { usar(`step/${nn(s.n)}_x1.not`, 'CRAZY'); usar(`step/${nn(s.n)}_x2.not`, 'CRAZY 2J'); }
}
for (const s of listas.DOUBLE || []) usar(`step/${nn(s.n)}_db.not`, 'DOUBLE');
for (const s of listas.BATTLE || []) usar(`step/${nn(s.n)}_h1.not`, 'BATTLE');
for (const s of listas.REMIX || []) {
  if (s.marca === 2) usar(`step/${nn(s.n)}_db.not`, 'REMIX doble');
  else { usar(`step/${nn(s.n)}_1.not`, 'REMIX'); usar(`step/${nn(s.n)}_2.not`, 'REMIX 2J'); }
}
for (const n of demo) usar(`step/${nn(n)}_h2.not`, 'demo');
// canciones: audio, vista previa, RUSH, fondo y caratula
for (const n of enListas) {
  usar(`audio/${nn(n)}.aud`, 'cancion'); usar(`audio/d${nn(n)}.aud`, 'vista previa');
  if (!exclusionRush.has(n)) usar(`audio/r${nn(n)}.aud`, 'RUSH');
  usar(`bga/${nn(n)}.dat`, 'fondo'); usar(`title/t${nn(n)}.pnz`, 'caratula');
}
for (const n of demo) { usar(`audio/${nn(n)}.aud`, 'demo'); usar(`bga/${nn(n)}.dat`, 'demo'); }
for (let n = 1; n <= 48; n++) { usar(`audio/${nn(n)}.aud`, 'SOUND TEST'); if (!exclusionRush.has(n)) usar(`audio/r${nn(n)}.aud`, 'SOUND TEST con RUSH'); }
usar('audio/01.aud', 'intro'); usar('audio/02.aud', 'musiquita de la seleccion'); usar('audio/03.aud', 'ayuda (SHOW HELP)');
usar('bga/03.dat', 'ayuda (SHOW HELP)');
usar('audio/49.aud', 'final (solo consola)'); usar('bga/84.dat', 'final (solo consola)');
usar('game.cfg', 'listas'); usar('piu.bin', 'efectos del chip'); usar('piu.exe', 'el juego'); usar('dos4gw.exe', 'arranque DOS'); usar('glide2x.ovl', 'placa 3dfx'); usar('start.bat', 'arranque DOS');
// nombres fijos que aparecen en el exe
for (const a of archivos) if (!usados.has(a.bajo) && /\.(dat|aud|pnz|sp2|not|cfg|bin|tga|vsl)$/.test(a.bajo) && nombreEnExe(a.bajo)) usar(a.bajo, 'nombre fijo en Piu.exe');

// ---------- informe ----------
const sinUsar = archivos.filter(a => !usados.has(a.bajo));
const faltan = [...usados.keys()].filter(k => k.includes('/') && !archivos.some(a => a.bajo === k) && !/^audio\/r|^audio\/d|^step\//.test(k));
const mb = (b) => (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
const grupos = {};
for (const a of sinUsar) { const g = a.bajo.split('/')[0]; (grupos[g] = grupos[g] || []).push(a); }
let md = `# Archivos del disco que el juego no usa\n\nGenerado con \`tools\\archivos_sin_usar.mjs\`. Disco: ${archivos.length} archivos (${mb(archivos.reduce((s, a) => s + a.tam, 0))}). **Sin usar: ${sinUsar.length} (${mb(sinUsar.reduce((s, a) => s + a.tam, 0))}).**\n\n`;
for (const [g, l] of Object.entries(grupos)) {
  md += `## ${g.toUpperCase()} (${l.length}, ${mb(l.reduce((s, a) => s + a.tam, 0))})\n\n${l.map(a => '`' + a.rel + '`').join(', ')}\n\n`;
}
fs.writeFileSync(path.join(base, 'investigacion', 'ARCHIVOS_SIN_USAR.md'), md);
console.log(md);
if (faltan.length) console.log('(nota: pedidos que no estan en el disco: ' + faltan.join(' ') + ')');
