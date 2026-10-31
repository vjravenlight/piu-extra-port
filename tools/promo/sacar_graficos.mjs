// Saca del disco los graficos del juego que usan las placas de promocion (promo\promo.html): logo y fondo del titulo,
// marco y barras de la seleccion, numeros cromados, notas, flechas, la letra, nieve y destellos. Van a promo\graficos\.
// Uso: node tools\promo\sacar_graficos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirPaquete } from '../../app/motor/cifrados.js';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bga = path.join(base, 'extraido', 'Piu', 'Bga');
const sale = path.join(base, 'promo', 'graficos');
fs.mkdirSync(sale, { recursive: true });
const PIDO = {
  'TITLE.DAT': ['BG11', 'BG12', 'BG13', 'BG14', 'BG15', 'LG1', 'LG2', 'LG3', 'LG4', 'LG5', 'LIGHT01', 'LIGHT05', 'LIGHT25'],
  'SELECT.DAT': ['GLOW', 'BAR1', 'BAR2', 'BAR3', 'MODE1', 'MODE2', 'SHIFT', 'ARR', 'TIME', 'MODENAME'],
  'GRADE.DAT': ['NUM', 'WIN', 'LOSE', 'SSS', 'AAA', 'BBB'],
  '00.DAT': ['FONT', 'ARROW01', 'ARROW03', 'EVENT'],
  'SNOW.DAT': ['SNOW'],
};
const archivoDe = (n) => fs.readdirSync(bga).find((f) => f.toLowerCase() === n.toLowerCase());
let n = 0;
for (const [dat, nombres] of Object.entries(PIDO)) {
  const p = abrirPaquete(new Uint8Array(fs.readFileSync(path.join(bga, archivoDe(dat)))));
  for (const nombre of nombres) {
    const a = p.archivos.find((x) => x.nombre.toUpperCase() === nombre + '.PNG');
    if (!a) { console.log(`  no esta ${nombre}.PNG en ${dat}`); continue; }
    fs.writeFileSync(path.join(sale, nombre.toLowerCase() + '.png'), a.datos()); n++;
  }
}
console.log(`${n} graficos en ${sale}`);
