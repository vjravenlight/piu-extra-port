// Deja el port listo para jugar a partir del disco de la cabina (que el repositorio no trae: es de Andamiro).
// 1. saca los archivos del disco (.cue/.bin o .iso) a extraido\Piu
// 2. carga Piu.exe y saca el codigo y los datos a investigacion\volcados (comprueba que sea el exe de Extra)
// 3. traduce el codigo a JavaScript: app\port\traducido.js
// 4. arma las listas de canciones: app\port\game_con_todo.cfg (F7) y app\port\game_online.cfg (desafios)
// Uso: node tools/preparar/preparar.mjs [imagen del disco]   (sin imagen, busca un .cue, .bin o .iso en la carpeta del proyecto)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extraer } from './extraer_disco.mjs';
import { cargarLE, sacarVolcados } from './cargar_exe.mjs';
import { listaOnline } from '../canciones_online.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(aqui, '..', '..');
const disco = path.join(base, 'extraido');
const piu = path.join(disco, 'Piu');
const volcados = path.join(base, 'investigacion', 'volcados');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// el Piu.exe de Pump It Up Extra (R4, 08/03/2001) y sus volcados: todo el port (direcciones, reemplazos) es para este
const PIU_EXE = 'fbc29b8b0cb8ab5b69f15ed0289109d18b401a1a22ca2c28bf4a0eff9cef89cc';
const VOLCADOS = { 'codigo_0x20000.bin': '87de28cc588422d9908fe707aff8081cc8504f205cc7985f0360b2dff6052bde', 'datos_0x130000.bin': '9fa1f61a6d5d870c4bada1c8d6e964400ac20aafb727bf561e66d5126113ca30' };

function paso(n, texto) { console.log(`\n${n}/4 ${texto}`); }
function buscarImagen() {
  const c = fs.readdirSync(base).filter((f) => /\.(cue|iso|bin)$/i.test(f));
  return c.find((f) => /\.cue$/i.test(f)) || c.find((f) => /\.iso$/i.test(f)) || c.find((f) => /\.bin$/i.test(f));
}

async function main() {
  const exe = () => fs.readdirSync(piu).find((f) => f.toLowerCase() === 'piu.exe');
  paso(1, 'disco');
  if (fs.existsSync(piu) && exe()) console.log(`  ya esta ${piu} (para volver a sacarlo, mover esa carpeta a otro lado)`);
  else {
    const imagen = process.argv[2] || buscarImagen();
    if (!imagen) throw new Error('no encuentro la imagen del disco: pone el .cue y el .bin (o el .iso) de Pump It Up Extra en la carpeta del proyecto, o pasale la ruta');
    await extraer(path.resolve(base, imagen), disco, { avisar: (s) => console.log('  ' + s) });
  }

  paso(2, 'Piu.exe -> codigo y datos');
  const bytes = fs.readFileSync(path.join(piu, exe()));
  if (sha(bytes) !== PIU_EXE) console.log('  OJO: este Piu.exe no es el que se uso para el port (otra version del disco?). Sigo, pero puede no andar.');
  fs.mkdirSync(volcados, { recursive: true });
  for (const [nombre, datos] of Object.entries(sacarVolcados(cargarLE(bytes)))) {
    fs.writeFileSync(path.join(volcados, nombre), datos);
    console.log(`  ${nombre}: ${datos.length} bytes ${sha(datos) === VOLCADOS[nombre] ? '(igual al del port)' : '(DISTINTO al del port)'}`);
  }

  paso(3, 'traduccion a JavaScript (un minuto)');
  const t = spawnSync(process.execPath, [path.join(base, 'tools', 'recompilador', 'traducir.mjs')], { stdio: 'inherit' });
  if (t.status !== 0) throw new Error('fallo la traduccion');

  paso(4, 'listas de canciones');
  const l = spawnSync(process.execPath, [path.join(base, 'tools', 'armar_lista_con_todo.mjs')], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (l.status !== 0) throw new Error('fallo armar_lista_con_todo.mjs');
  const conTodo = fs.readFileSync(path.join(base, 'app', 'port', 'game_con_todo.cfg'), 'latin1');
  fs.writeFileSync(path.join(base, 'app', 'port', 'game_online.cfg'), listaOnline(conTodo), 'latin1');
  console.log('  game_con_todo.cfg y game_online.cfg listos');

  console.log('\nListo. Para jugar: JUGAR.cmd (Windows) o ./jugar.sh (Linux y Mac). Para armar las versiones: ver el README.');
}
main().catch((e) => { console.error('\nERROR: ' + e.message); process.exit(1); });
