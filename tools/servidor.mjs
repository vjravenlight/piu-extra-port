// Servidor del juego: sirve app\ en /, el disco extraido (extraido\Piu) en /disco/ sin distinguir mayusculas,
// investigacion\volcados en /volcados/ y lo que usa el navegador para preparar un disco propio en /preparar/.
// Manda los encabezados de aislamiento (COOP/COEP) que hacen falta para la memoria compartida del port.
// Dos usos:
// - JUGAR.cmd / jugar.sh: para jugar en esta compu (http://localhost:8790/port/).
// - SERVIDOR.cmd / servidor.sh (Charles 21/10: "que se active como web server y la gente lo pueda correr con el puerto"):
//   --preguntar hace las preguntas; o a mano: node servidor.mjs [puerto] --red [--salon=ravenlight|propio] [--tunel] [--sin-disco]
//   --red      escucha en la red (la misma wifi), con HTTPS propio (certificado.mjs): el juego lo necesita fuera de localhost
//   --salon    el salon online y el ranking: el de ravenlight.net (se le pasan los pedidos) o uno propio (PHP, api.php)
//   --tunel    ademas lo abre a internet con un tunel gratis de Cloudflare (sin abrir puertos); por internet nunca se
//              reparte el disco: cada jugador pone el suyo (app\port\archivos.js)
//   --sin-disco no reparte el disco aunque este (cada uno pone el suyo); tambien PIU_SIN_DISCO=1
// Variables: PIU_NO_ABRIR=1 (no abrir el navegador), PIU_GUARDADO (otra carpeta de guardado, para pruebas).
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { certificadoPropio } from './certificado.mjs';
import { qrEnTexto } from './qr.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const proyecto = path.join(aqui, '..');
const raizApp = path.join(proyecto, 'app');
const raizDatos = path.join(proyecto, 'descifrado');
const raizVolcados = path.join(proyecto, 'investigacion', 'volcados');
const raizDisco = path.join(proyecto, 'extraido', 'Piu');
const herramientas = path.join(proyecto, '.herramientas');
// lo que el juego graba (por ahora solo la EEPROM de 128 bytes: opciones del menu de servicio).
// PIU_GUARDADO cambia la carpeta (las pruebas usan la suya y no tocan las opciones de Charles).
const raizGuardado = process.env.PIU_GUARDADO || path.join(proyecto, 'guardado');

// ---------- opciones ----------
const args = process.argv.slice(2);
const bandera = (n) => args.some((a) => a === '--' + n || a.startsWith('--' + n + '='));
const valor = (n) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
let puerto0 = +(args.find((a) => /^\d+$/.test(a)) || 8790);
let red = bandera('red'), tunel = bandera('tunel'), sinDisco = bandera('sin-disco') || !!process.env.PIU_SIN_DISCO, salon = valor('salon');
if (bandera('preguntar')) await preguntar();
if (tunel) { red = true; sinDisco = true; }
const conHttps = red && !bandera('http');

async function preguntar() {
  const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n  PUMP IT UP EXTRA - modo servidor\n  (Enter = lo que esta entre corchetes)\n');
  const p = (await rl.question(`  1. Puerto [${puerto0}]: `)).trim();
  if (/^\d{2,5}$/.test(p)) puerto0 = +p;
  console.log('\n  2. Salon online y ranking:\n     1 = el de ravenlight.net (todos juntos)\n     2 = uno propio de este servidor (solo los que entran aca)');
  salon = (await rl.question('     [1]: ')).trim() === '2' ? 'propio' : 'ravenlight';
  console.log('\n  3. Abrirlo tambien a internet? Con un tunel gratis de Cloudflare: te da una direccion https para pasarle a\n     quien quieras, sin tocar el router. Por internet cada jugador pone su propio disco.');
  tunel = /^s/i.test((await rl.question('     s/n [n]: ')).trim());
  red = true;
  rl.close();
}

// indice del disco en minusculas: el juego pide "bga\00.dat", "AUDIO\01.AUD", "STEP\60_N1.NOT"...
const indiceDisco = new Map();
(function recorrer(d, rel) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) recorrer(path.join(d, e.name), r); else indiceDisco.set(r.toLowerCase(), path.join(d, e.name));
  }
})(raizDisco, '');
const hayDisco = indiceDisco.size > 0 && fs.existsSync(path.join(raizVolcados, 'codigo_0x20000.bin'));
// la carpeta preparar\ de las builds y la web: nombre publicado -> archivo en tools\ (la misma lista usan los armadores)
const ARCHIVOS_PREPARAR = JSON.parse(fs.readFileSync(path.join(aqui, 'preparar', 'archivos_navegador.json'), 'utf8'));

// ---------- bajar herramientas (PHP en Windows, el tunel de Cloudflare) ----------
function pedir(url, enArchivo) {
  return new Promise((ok, mal) => {
    https.get(url, { headers: { 'User-Agent': 'piu-extra-port' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return pedir(new URL(r.headers.location, url).href, enArchivo).then(ok, mal); }
      if (r.statusCode !== 200) { r.resume(); return mal(new Error(`${url}: ${r.statusCode}`)); }
      if (enArchivo) { const f = fs.createWriteStream(enArchivo); r.pipe(f); f.on('finish', () => f.close(() => ok(enArchivo))); f.on('error', mal); }
      else { const partes = []; r.on('data', (c) => partes.push(c)); r.on('end', () => ok(Buffer.concat(partes))); }
    }).on('error', mal);
  });
}
const suma = (archivo) => crypto.createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');
const carpetaNueva = () => { const d = path.join(herramientas, '.bajando-' + crypto.randomBytes(4).toString('hex')); fs.mkdirSync(d, { recursive: true }); return d; };

// ---------- salon online ----------
// propio: /online/* va al PHP (app\online\api.php), como en el hosting. ravenlight: se le pasan los pedidos al de
// ravenlight.net (desde aca, asi el hosting no tiene que aceptar pedidos de cualquier pagina).
const raizOnline = path.join(proyecto, 'app', 'online');
const phpCharles = path.join(proyecto, '..', '..', '2_Ravenlight.net', 'ravenlight-web', '_herramientas', 'php', 'php.exe');
const phpPropio = path.join(herramientas, 'php', process.platform === 'win32' ? 'php.exe' : 'php');
function buscarPhp() {
  if (fs.existsSync(phpCharles)) return phpCharles;
  if (fs.existsSync(phpPropio)) return phpPropio;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['php'], { encoding: 'utf8' });
  return r.status === 0 ? 'php' : null;
}
// PHP portatil oficial (windows.php.net) para Windows, con su suma; en Linux/Mac hay que tenerlo instalado
async function conseguirPhp() {
  if (process.platform !== 'win32') return null;
  try {
    console.log('  Bajando PHP portatil (windows.php.net), una sola vez...');
    const lista = JSON.parse((await pedir('https://windows.php.net/downloads/releases/releases.json')).toString());
    const rama = Object.keys(lista).filter((k) => /^8\.\d+$/.test(k)).sort((a, b) => +a.split('.')[1] - +b.split('.')[1]).pop();
    const clave = Object.keys(lista[rama]).find((k) => /^nts-vs\d+-x64$/.test(k));
    const zip = lista[rama][clave].zip, tmp = carpetaNueva(), archivo = path.join(tmp, zip.path);
    await pedir('https://windows.php.net/downloads/releases/' + zip.path, archivo);
    if (suma(archivo) !== zip.sha256) throw new Error('el PHP bajado no coincide con su suma oficial');
    const x = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archivo}' -DestinationPath '${path.join(herramientas, 'php')}' -Force`], { stdio: 'inherit' });
    fs.rmSync(tmp, { recursive: true, force: true });
    // (30/10) el zip viene sin php.ini: sin el, mbstring (nombres con Ñ y tildes) no esta prendido
    if (x.status === 0) fs.writeFileSync(path.join(herramientas, 'php', 'php.ini'), 'extension_dir = "ext"\r\nextension = mbstring\r\n');
    return x.status === 0 && fs.existsSync(phpPropio) ? phpPropio : null;
  } catch (e) { console.log('  No pude bajar PHP: ' + e.message); return null; }
}
let php = buscarPhp();
if (salon === null) salon = php ? 'propio' : 'ravenlight';       // JUGAR.cmd: el propio si hay PHP; si no, el de ravenlight.net
if (salon === 'propio' && !php) php = await conseguirPhp();
if (salon === 'propio' && !php) { console.log('  Sin PHP no hay salon propio: uso el de ravenlight.net.'); salon = 'ravenlight'; }
const puertoPhp = puerto0 + 61;
let procesoPhp = null;
if (salon === 'propio') {
  procesoPhp = spawn(php, ['-S', `127.0.0.1:${puertoPhp}`, '-t', raizOnline], { stdio: 'ignore', windowsHide: true, env: process.env });
  procesoPhp.on('error', () => { procesoPhp = null; console.log('  (PHP no arranco: el salon local no anda; el juego si)'); });
}
const procesos = [];
process.on('exit', () => { for (const p of [procesoPhp, ...procesos]) try { if (p) p.kill(); } catch (e) { /* ya cerrado */ } });
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => process.exit(0));
function alSalon(req, res) {
  const responder = (pr) => { res.writeHead(pr.statusCode, { 'Content-Type': pr.headers['content-type'] || 'application/json', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin' }); pr.pipe(res); };
  const fallo = () => { if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"error":"no contesta el servidor del salon"}'); } };
  let r;
  if (salon === 'ravenlight') {
    if (!/^\/online\/api\.php(\?|$)/.test(req.url)) { res.writeHead(404); return res.end(); }
    const h = { 'Content-Type': req.headers['content-type'] || 'application/json' };
    if (req.headers['content-length']) h['Content-Length'] = req.headers['content-length'];
    r = https.request('https://ravenlight.net/piu' + req.url, { method: req.method, headers: h }, responder);
  } else {
    r = http.request({ host: '127.0.0.1', port: puertoPhp, path: req.url.slice('/online'.length) || '/', method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${puertoPhp}` } }, responder);
  }
  r.on('error', fallo);
  req.pipe(r);
}

// ---------- archivos ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const AISLAR = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
function servirArchivo(req, res, ruta) {
  const st = fs.statSync(ruta);
  const tipo = TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
  const rango = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
  const cab = { 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', ...AISLAR };
  if (rango) {
    const ini = +rango[1], fin = rango[2] ? Math.min(+rango[2], st.size - 1) : st.size - 1;
    res.writeHead(206, { ...cab, 'Content-Range': `bytes ${ini}-${fin}/${st.size}`, 'Content-Length': fin - ini + 1 });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(ruta, { start: ini, end: fin }).pipe(res);
  } else {
    res.writeHead(200, { ...cab, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(ruta).pipe(res);
  }
}
// los nombres que acepta guardado\canciones\ y su tope (pasos, musica hasta lo que lee la placa, vista previa, portada)
const GUARDABLES = { '/guardado/eeprom.bin': { exacto: 128 }, '/guardado/opciones.json': { max: 4096 } };
function topeCancion(n) {
  const num = '(8[2-9]|9\\d)';
  if (new RegExp(`^${num}_([nhx][12]|db)\\.not$`).test(n)) return 262144;
  if (new RegExp(`^d${num}\\.aud$`).test(n)) return 614400;
  if (new RegExp(`^${num}\\.aud$`).test(n)) return 16777216;   // entera: si pasa la placa (2,6 MB) el juego recibe una recortada
  if (new RegExp(`^t${num}\\.pnz$`).test(n)) return 2097152;
  if (new RegExp(`^v${num}\\.(mp4|webm)$`).test(n)) return 209715200;   // el video propio de fondo (editor, tecla V)
  if (n === 'canciones.json') return 65536;
  return 0;
}
function recibir(req, res, tope, exacto, guardar) {
  const partes = []; let total = 0;
  req.on('data', (c) => { total += c.length; if (total <= tope) partes.push(c); });
  req.on('end', () => {
    if (total === 0 || total > tope || (exacto && total !== exacto)) { res.writeHead(400); return res.end('tamano incorrecto'); }
    guardar(Buffer.concat(partes));
    res.writeHead(204, { 'Cross-Origin-Resource-Policy': 'same-origin' }); res.end();
  });
}

// ---------- puente (31/10): sin memoria compartida, como en la APK con la WebView (Servidor.java hace lo mismo) ----------
// La pagina deja su copia del estado (I, D, Q: 4416 bytes) y el ultimo cuadro que dibujo; el hilo del juego la pide con
// XHR sincronico cada vez que espera (app\port\trabajador.js). Aca sirve para probarlo en la PC con ?puente=1.
const P = { estado: null, mostrado: 0, esperan: new Set(), archivos: new Map(), piden: new Map() };
const binario = (res, b) => { res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': b.length, 'Cache-Control': 'no-store', ...AISLAR }); res.end(b); };
function alPuente(req, res, u) {
  const que = u.pathname.slice('/puente/'.length), q = u.searchParams;
  const sinNada = (codigo) => { res.writeHead(codigo, { 'Cache-Control': 'no-store', ...AISLAR }); res.end(); };
  const cuerpo = (f) => { const partes = []; req.on('data', (c) => partes.push(c)); req.on('end', () => f(Buffer.concat(partes))); };
  if (que === 'estado' && req.method === 'POST') return cuerpo((d) => {
    if (d.length !== 4416) return sinNada(400);
    P.estado = d; P.mostrado = Math.max(P.mostrado, +q.get('mostrado') || 0);
    for (const w of P.esperan) if (P.mostrado >= w.cuadro) w.listo();
    sinNada(204);
  });
  if (que === 'esperar') {
    const ms = Math.min(1000, Math.max(0, +q.get('ms') || 0)), cuadro = +q.get('cuadro') || 0;
    const listo = () => { clearTimeout(w.t); P.esperan.delete(w); if (P.estado) binario(res, P.estado); else sinNada(204); };
    const w = { cuadro: cuadro || Infinity, listo, t: null };
    if (cuadro && P.mostrado >= cuadro) return listo();
    w.t = setTimeout(listo, ms); P.esperan.add(w);
    return;
  }
  if (que === 'archivo') {
    const ruta = q.get('ruta') || '';
    if (req.method === 'POST') return cuerpo((d) => {
      const b = q.has('falta') ? null : d;
      const r = P.piden.get(ruta);
      if (r) { P.piden.delete(ruta); clearTimeout(r.t); if (b) binario(r.res, b); else { r.res.writeHead(404, AISLAR); r.res.end(); } } else P.archivos.set(ruta, b);
      sinNada(204);
    });
    if (P.archivos.has(ruta)) { const b = P.archivos.get(ruta); P.archivos.delete(ruta); return b ? binario(res, b) : sinNada(404); }
    const t = setTimeout(() => { P.piden.delete(ruta); sinNada(404); }, 60000);
    P.piden.set(ruta, { res, t });
    return;
  }
  sinNada(404);
}

function atender(req, res) {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url.startsWith('/puente/')) return alPuente(req, res, new URL(req.url, 'http://x'));
    if (url.startsWith('/online/')) return alSalon(req, res);
    // pruebas del disco propio: PIU_DISCO_PRUEBA = ruta de una imagen, la pagina la toma de aca (?discoDePrueba=...)
    if (url === '/disco-de-prueba.bin' && process.env.PIU_DISCO_PRUEBA) return servirArchivo(req, res, process.env.PIU_DISCO_PRUEBA);
    if (url === '/rom-de-prueba.bin' && process.env.PIU_ROM_PRUEBA) return servirArchivo(req, res, process.env.PIU_ROM_PRUEBA);
    // sin disco: como un servidor sin nada de Andamiro (cada jugador pone su disco: app\port\archivos.js)
    if ((sinDisco || !hayDisco) && /^\/(disco|volcados|datos)\/|^\/port\/(traducido\.js|game_[a-z]+\.cfg)$/i.test(url)) { res.writeHead(404); return res.end('sin disco'); }
    // en la red, lo guardado es de esta compu: los demas guardan en su navegador (como en la web)
    if (red && url.startsWith('/guardado/')) { res.writeHead(404, { 'Cross-Origin-Resource-Policy': 'same-origin' }); return res.end(); }
    if (url in GUARDABLES) {
      const ruta = path.join(raizGuardado, path.basename(url)), lim = GUARDABLES[url];
      if (req.method === 'PUT') return recibir(req, res, lim.exacto || lim.max, lim.exacto, (d) => { fs.mkdirSync(raizGuardado, { recursive: true }); fs.writeFileSync(ruta, d); });
      if (!fs.existsSync(ruta)) { res.writeHead(404, { 'Cross-Origin-Resource-Policy': 'same-origin' }); return res.end('no existe'); }
      return servirArchivo(req, res, ruta);
    }
    // canciones propias del editor (EDITOR_MASTER.md etapa 2): guardado\canciones\, solo estos nombres (numeros 82-99)
    // y con tope de tamano por tipo; "tu version" de los pasos de una cancion del disco (editor, G): guardado\ediciones\,
    // solo NN_xx.not; el original del disco nunca se toca
    if (url.startsWith('/guardado/canciones/') || url.startsWith('/guardado/ediciones/')) {
      const edicion = url.startsWith('/guardado/ediciones/'), n = url.slice(20).toLowerCase();
      const tope = edicion ? (/^\d\d_([nhx][12]|db)\.not$/.test(n) ? 262144 : 0) : topeCancion(n);
      if (!tope) { res.writeHead(404); return res.end('nombre no permitido'); }
      const ruta = path.join(raizGuardado, edicion ? 'ediciones' : 'canciones', n);
      if (req.method === 'PUT') return recibir(req, res, tope, 0, (d) => { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, d); });
      if (!fs.existsSync(ruta)) { res.writeHead(404, { 'Cross-Origin-Resource-Policy': 'same-origin' }); return res.end('no existe'); }
      return servirArchivo(req, res, ruta);
    }
    // (30/10) la ROM de efectos de la placa (bios\pumpitup\piu10.u9, la que encontro Charles): app\port\efectos.js
    if (url === '/efectos/piu10.u9') {
      const rom = path.join(proyecto, 'bios', 'pumpitup', 'piu10.u9');
      if (sinDisco || !fs.existsSync(rom)) { res.writeHead(404); return res.end('sin la ROM de efectos'); }
      return servirArchivo(req, res, rom);
    }
    if (url.startsWith('/disco/')) {
      const p = indiceDisco.get(url.slice('/disco/'.length).replace(/\\/g, '/').toLowerCase());
      if (!p) { res.writeHead(404); return res.end('no existe'); }
      return servirArchivo(req, res, p);
    }
    // /preparar/: lo que usa el navegador para preparar un disco propio (app\port\instalador.js); en las builds es la
    // carpeta juego\preparar, aca sale de tools\ (ARCHIVOS_PREPARAR)
    if (url.startsWith('/preparar/')) {
      const p = ARCHIVOS_PREPARAR[url.slice('/preparar/'.length)];
      if (!p) { res.writeHead(404); return res.end('no existe'); }
      return servirArchivo(req, res, path.join(aqui, p));
    }
    let raiz = raizApp, rel = url === '/' ? 'index.html' : url;
    if (url.endsWith('/')) rel = url + 'index.html';
    if (url.startsWith('/datos/')) { raiz = raizDatos; rel = url.slice('/datos/'.length); }
    if (url.startsWith('/volcados/')) { raiz = raizVolcados; rel = url.slice('/volcados/'.length); }
    const ruta = path.normalize(path.join(raiz, rel));
    if (!ruta.startsWith(raiz)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { res.writeHead(404); return res.end('no existe'); }
    servirArchivo(req, res, ruta);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}

// ---------- red: direcciones y certificado ----------
const ipsDeRed = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
// el certificado queda guardado (asi los celulares no vuelven a avisar cada vez); se rehace si cambian las direcciones
function certificado() {
  const d = path.join(raizGuardado, 'servidor'), ips = ['127.0.0.1', ...ipsDeRed()].sort();
  const f = (n) => path.join(d, n);
  try {
    if (fs.readFileSync(f('direcciones.txt'), 'utf8') === ips.join(',')) return { key: fs.readFileSync(f('llave.pem')), cert: fs.readFileSync(f('certificado.pem')) };
  } catch (e) { /* no hay o cambio */ }
  const c = certificadoPropio(ips, ['localhost', os.hostname().toLowerCase()]);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(f('llave.pem'), c.llave); fs.writeFileSync(f('certificado.pem'), c.certificado); fs.writeFileSync(f('direcciones.txt'), ips.join(','));
  return { key: c.llave, cert: c.certificado };
}

// ---------- tunel de Cloudflare (cloudflared, el programa oficial; "quick tunnel": sin cuenta) ----------
async function conseguirCloudflared() {
  const win = process.platform === 'win32', mac = process.platform === 'darwin', arm = process.arch === 'arm64';
  const nombre = win ? 'cloudflared-windows-amd64.exe' : mac ? `cloudflared-darwin-${arm ? 'arm64' : 'amd64'}.tgz` : `cloudflared-linux-${arm ? 'arm64' : 'amd64'}`;
  const dest = path.join(herramientas, 'cloudflared', win ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(dest)) return dest;
  console.log('  Bajando el tunel de Cloudflare (github.com/cloudflare/cloudflared), una sola vez...');
  const ultima = JSON.parse((await pedir('https://api.github.com/repos/cloudflare/cloudflared/releases/latest')).toString());
  const a = ultima.assets.find((x) => x.name === nombre);
  if (!a) throw new Error('no encuentro ' + nombre + ' en la ultima version');
  const tmp = carpetaNueva(), archivo = path.join(tmp, nombre);
  await pedir(a.browser_download_url, archivo);
  if (a.digest && a.digest.startsWith('sha256:') && suma(archivo) !== a.digest.slice(7)) throw new Error('el cloudflared bajado no coincide con su suma');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (mac) spawnSync('tar', ['-xzf', archivo, '-C', path.dirname(dest)]); else fs.copyFileSync(archivo, dest);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!win) fs.chmodSync(dest, 0o755);
  return dest;
}
async function abrirTunel(puerto) {
  try {
    const cf = await conseguirCloudflared();
    const p = spawn(cf, ['tunnel', '--no-autoupdate', '--url', `${conHttps ? 'https' : 'http'}://localhost:${puerto}`, ...(conHttps ? ['--no-tls-verify'] : [])], { windowsHide: true });
    procesos.push(p);
    let visto = false;
    const mirar = (d) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(d.toString());
      if (m && !visto) { visto = true; console.log(`\n  POR INTERNET:     ${m[0]}/port/\n  (pasale esa direccion a quien quieras; cambia cada vez que se abre el servidor)\n`); mostrarQR(m[0] + '/port/', 'POR INTERNET'); }
    };
    p.stdout.on('data', mirar); p.stderr.on('data', mirar);
    p.on('exit', (c) => { if (!visto) console.log('  El tunel no arranco (codigo ' + c + '). La red local sigue andando.'); });
  } catch (e) { console.log('  No pude abrir el tunel: ' + e.message + '. La red local sigue andando.'); }
}

// (30/10) la direccion tambien como QR (tools\qr.mjs): los celulares entran apuntando la camara
function mostrarQR(url, titulo) {
  try {
    console.log(`  ${titulo}: apunta la camara del celular aca`);
    console.log(qrEnTexto(url).split('\n').map((l) => '  ' + l).join('\n') + '\n');
  } catch (e) { /* direccion demasiado larga: queda la de texto */ }
}

// ---------- arrancar ----------
const servidor = conHttps ? https.createServer(certificado(), atender) : http.createServer(atender);
const esquema = conHttps ? 'https' : 'http';
function listo(p) {
  const local = `${esquema}://localhost:${p}/port/`;
  if (!red) {
    console.log('Pump It Up Extra en ' + local + '  (cerra esta ventana para apagarlo)');
  } else {
    console.log('\n  ===============================================================');
    console.log('  PUMP IT UP EXTRA - servidor andando');
    console.log(`  En esta compu:    ${local}`);
    for (const ip of ipsDeRed()) console.log(`  En la misma wifi: ${esquema}://${ip}:${p}/port/`);
    console.log(`  Salon online:     ${salon === 'ravenlight' ? 'el de ravenlight.net (todos juntos)' : 'propio de este servidor'}`);
    console.log(`  Disco:            ${!sinDisco && hayDisco ? 'el de esta compu (los de la wifi no necesitan el suyo)' : 'cada jugador pone el suyo la primera vez'}`);
    if (conHttps) console.log('  La primera vez cada aparato avisa "la conexion no es privada": tocar\n  "Configuracion avanzada" y despues "Continuar" (el certificado es de este servidor).');
    console.log('  Si Windows pregunta por el Firewall, tocar "Permitir acceso".');
    console.log('  Para apagarlo, cerrar esta ventana.');
    console.log('  ===============================================================\n');
    // (30/10) el QR de la wifi: la de la red de casa (192.168...) si hay varias
    const ips = ipsDeRed(), ip = ips.find((x) => x.startsWith('192.168.')) || ips[0];
    if (ip) mostrarQR(`${esquema}://${ip}:${p}/port/`, 'EN LA MISMA WIFI');
    if (tunel) abrirTunel(p);
  }
  if (!process.env.PIU_NO_ABRIR) exec(process.platform === 'win32' ? `cmd /c start "" "${local}"` : `${process.platform === 'darwin' ? 'open' : 'xdg-open'} "${local}"`);
}
let puerto = puerto0;
const donde = process.env.PIU_ESCUCHAR || (red ? '0.0.0.0' : '127.0.0.1');     // (PIU_ESCUCHAR: pruebas sin abrir la red)
servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && puerto < puerto0 + 10) { puerto++; servidor.listen(puerto, donde); }
  else { console.error(e.message); process.exit(1); }
});
servidor.on('listening', () => listo(puerto));
servidor.listen(puerto, donde);
