// Arma app\port\game_con_todo.cfg: el game.cfg original (intacto en el disco) + los pasos que el disco trae y el juego
// nunca ofrece (investigacion\ARCHIVOS_SIN_USAR.md). Se usa con F7 en el port ("lista con todo"), desde el proximo credito.
// Las reglas estan en preparar\listas.mjs (la misma cuenta la hace el navegador con el disco propio).
// Uso: node armar_lista_con_todo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerPasos } from '../app/motor/cifrados.js';
import { armarListaConTodo } from './preparar/listas.mjs';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const piu = path.join(base, 'extraido', 'Piu');
const nn = (n) => String(n).padStart(2, '0');
const carpeta = (c) => fs.readdirSync(piu).find(n => n.toLowerCase() === c);
const hay = {};
for (const c of ['step', 'audio', 'bga', 'title']) hay[c] = new Set(fs.readdirSync(path.join(piu, carpeta(c))).map(n => n.toLowerCase()));
const pasos = new Map(fs.readdirSync(path.join(piu, carpeta('step'))).map(n => [n.toLowerCase(), path.join(piu, carpeta('step'), n)]));
const leerNot = (n) => (pasos.has(n) ? new Uint8Array(fs.readFileSync(pasos.get(n))) : null);

// game.cfg original, tal cual (latin1 para no tocar los bytes del titulo en coreano)
const original = fs.readFileSync(path.join(piu, fs.readdirSync(piu).find(n => n.toLowerCase() === 'game.cfg')), 'latin1');
const r = armarListaConTodo(original, hay, leerNot, leerPasos);
fs.writeFileSync(path.join(base, 'app', 'port', 'game_con_todo.cfg'), r.texto, 'latin1');

console.log('Agregadas:');
for (const [m, l] of Object.entries(r.agregadas)) console.log(`  ${m} (${r.listas[m].length} en total): ` + l.map(s => `${nn(s.n)}${s.marca === 2 ? ' doble' : ''} (${s.nivel})`).join(', '));
console.log('Quedaron afuera:'); for (const a of r.afuera) console.log('  ' + a);
