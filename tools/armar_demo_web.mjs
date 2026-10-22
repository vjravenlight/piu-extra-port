// Arma la demo web (9 canciones, online, celulares) en build\web-demo\, lista para subir a una carpeta del hosting.
// - el juego (app\port, gl1.js, cifrados.js), el salon (app\online\api.php) y el codigo de Piu.exe (volcados);
// - del disco, solo lo comun y lo de las 9 canciones (mas las 3 ocultas de CRAZY, 7/20/21, que el juego agrega solo),
//   TODO EN MINUSCULA (el hosting es Linux: los nombres distinguen mayusculas, y el port pide todo en minuscula);
// - port\game_demo.cfg: la lista de game_con_todo.cfg recortada a las 9; port\config.json: { demo, canciones, atrae };
// - .htaccess: aislamiento (COOP/COEP) para la memoria compartida, CSP propia, sin indexar ni listar.
// Uso: node armar_demo_web.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANCIONES, OCULTAS, REMIX, listaOnline } from './canciones_online.mjs';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const piu = path.join(base, 'extraido', 'Piu');
const destino = path.join(base, 'build', 'web-demo');
// las canciones (y por que estan): canciones_online.mjs
const nn = (n) => String(n).padStart(2, '0');

fs.rmSync(destino, { recursive: true, force: true });   // es salida de este script: se arma de cero cada vez
const copiar = (desde, hasta) => { fs.mkdirSync(path.dirname(hasta), { recursive: true }); fs.copyFileSync(desde, hasta); };
let bytes = 0, archivos = 0;
const sumar = (f) => { bytes += fs.statSync(f).size; archivos++; };

// 1. el juego y el salon
for (const f of fs.readdirSync(path.join(base, 'app', 'port'))) copiar(path.join(base, 'app', 'port', f), path.join(destino, 'port', f));
for (const f of ['gl1.js', 'cifrados.js']) copiar(path.join(base, 'app', 'motor', f), path.join(destino, 'motor', f));
for (const f of ['api.php', 'filtro.php']) copiar(path.join(base, 'app', 'online', f), path.join(destino, 'online', f));
for (const f of ['codigo_0x20000.bin', 'datos_0x130000.bin']) copiar(path.join(base, 'investigacion', 'volcados', f), path.join(destino, 'volcados', f));

// 2. el disco: lo comun + las canciones, en minuscula
const todos = [];
(function recorrer(d, rel) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) recorrer(path.join(d, e.name), r); else todos.push(r); } })(piu, '');
const lista = new Set([...CANCIONES, ...OCULTAS, ...REMIX].map(nn));
const sirve = (r) => {
  const b = r.toLowerCase(), [carpeta, nombre] = b.includes('/') ? b.split('/') : ['', b];
  if (carpeta === '') return ['game.cfg', 'piu.bin'].includes(nombre);
  if (carpeta === 'step') return lista.has(nombre.slice(0, 2));
  if (carpeta === 'audio') { const m = /^[dr]?(\d\d)\.aud$/.exec(nombre); return !!m && (lista.has(m[1]) || (!/^[dr]/.test(nombre) && ['01', '02', '03'].includes(m[1]))); }
  if (carpeta === 'title') { const m = /^t(\d\d)\.pnz$/.exec(nombre); return !!m && lista.has(m[1]); }
  if (carpeta === 'bga') {
    if (!nombre.endsWith('.dat')) return false;                       // las herramientas de Andamiro no
    const m = /^(\d\d)\.dat$/.exec(nombre);
    return m ? lista.has(m[1]) || ['00', '03', '81'].includes(m[1]) : true;   // 00 graficos, 03 ayuda, 81 logo; el resto con nombre
  }
  return false;
};
for (const r of todos) if (sirve(r)) { const d = path.join(destino, 'disco', ...r.toLowerCase().split('/')); copiar(path.join(piu, r), d); sumar(d); }

// 3. la lista de la demo y su configuracion
const demoCfg = listaOnline(fs.readFileSync(path.join(base, 'app', 'port', 'game_con_todo.cfg'), 'latin1'));
fs.writeFileSync(path.join(destino, 'port', 'game_demo.cfg'), demoCfg, 'latin1');
// la misma lista para la seleccion de los desafios en la build de Edge (que tiene el disco entero): asi se elige solo
// entre las canciones que tambien tiene la web (trabajador.js, modo eleccion)
fs.writeFileSync(path.join(base, 'app', 'port', 'game_online.cfg'), demoCfg, 'latin1');
const steps = new Set(todos.filter(r => r.toLowerCase().startsWith('step/')).map(r => r.toLowerCase().slice(5)));
const atrae = CANCIONES.filter(n => steps.has(`${nn(n)}_h2.not`));
fs.writeFileSync(path.join(destino, 'port', 'config.json'), JSON.stringify({ demo: true, canciones: CANCIONES, atrae }, null, 1));

// 4. reglas del servidor y la entrada
fs.writeFileSync(path.join(destino, '.htaccess'), [
  '# Demo de Pump It Up Extra (prueba privada de Charles: sin links desde el sitio y sin indexar)',
  'Options -Indexes',
  'DirectoryIndex index.html',
  '<IfModule mod_headers.c>',
  '  # memoria compartida del port: aislamiento de origen',
  '  Header always set Cross-Origin-Opener-Policy "same-origin"',
  '  Header always set Cross-Origin-Embedder-Policy "require-corp"',
  '  Header always set Cross-Origin-Resource-Policy "same-origin"',
  '  Header always set X-Robots-Tag "noindex, nofollow, noarchive"',
  '  Header set Content-Security-Policy "default-src \'self\'; script-src \'self\'; worker-src \'self\'; connect-src \'self\'; img-src \'self\' data: blob:; media-src \'self\' blob:; style-src \'self\' \'unsafe-inline\'; object-src \'none\'; base-uri \'self\'; frame-ancestors \'self\'"',
  '  # el codigo y la configuracion se revisan siempre (Charles, 20/10: "me sigue cacheando lo anterior"); los',
  '  # archivos grandes del disco (videos, musica) se pueden guardar un dia',
  '  <FilesMatch "\\.(js|mjs|html|json|cfg|php)$">',
  '    Header set Cache-Control "no-cache, must-revalidate"',
  '  </FilesMatch>',
  '  <FilesMatch "\\.(dat|aud|pnz|not|bin)$">',
  '    Header set Cache-Control "public, max-age=86400"',
  '  </FilesMatch>',
  '</IfModule>',
  '# el cache propio de LiteSpeed (el servidor del hosting) no se usa en la demo',
  '<IfModule LiteSpeed>',
  '  CacheDisable public /',
  '</IfModule>',
  '<IfModule mod_mime.c>',
  '  AddType text/javascript .js .mjs',
  '  AddType application/octet-stream .dat .aud .not .pnz .bin .cfg',
  '</IfModule>',
  '<IfModule mod_deflate.c>',
  '  AddOutputFilterByType DEFLATE text/javascript application/javascript application/json text/html',
  '</IfModule>',
  '',
].join('\n'));
fs.writeFileSync(path.join(destino, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(destino, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=port/"><title>Pump It Up Extra</title><a href="port/">Pump It Up Extra</a>\n');

let total = 0, n = 0;
(function medir(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) medir(p); else { total += fs.statSync(p).size; n++; } } })(destino);
console.log(`Listo: ${destino}`);
console.log(`  ${n} archivos, ${(total / 1048576).toFixed(1)} MB (del disco: ${archivos} archivos, ${(bytes / 1048576).toFixed(1)} MB)`);
console.log(`  canciones: ${CANCIONES.join(', ')} (+ ocultas ${OCULTAS.join(', ')}); atraccion con: ${atrae.join(', ')}`);
