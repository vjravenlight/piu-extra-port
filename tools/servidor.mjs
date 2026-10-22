// Servidor local para jugar en la PC: sirve app\ en /, descifrado\ en /datos/ (con Range, para el audio),
// el disco extraido (extraido\Piu) en /disco/ sin distinguir mayusculas, e investigacion\volcados en /volcados/.
// Manda los encabezados de aislamiento (COOP/COEP) que hacen falta para la memoria compartida del port.
// Uso: JUGAR.cmd (o: node servidor.mjs [puerto]). Variable PIU_NO_ABRIR=1 para no abrir el navegador.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizApp = path.join(aqui, '..', 'app');
const raizDatos = path.join(aqui, '..', 'descifrado');
const raizVolcados = path.join(aqui, '..', 'investigacion', 'volcados');
const raizDisco = path.join(aqui, '..', 'extraido', 'Piu');
// lo que el juego graba (por ahora solo la EEPROM de 128 bytes: opciones del menu de servicio).
// PIU_GUARDADO cambia la carpeta (las pruebas usan la suya y no tocan las opciones de Charles).
const raizGuardado = process.env.PIU_GUARDADO || path.join(aqui, '..', 'guardado');
// eeprom.bin: exactamente 128 bytes; opciones.json (opciones del port, como F7): hasta 4 KB
const GUARDABLES = { '/guardado/eeprom.bin': { exacto: 128 }, '/guardado/opciones.json': { max: 4096 } };
// los nombres que acepta guardado\canciones\ y su tope (pasos, musica hasta lo que lee la placa, vista previa, portada)
function topeCancion(n) {
  const num = '(8[2-9]|9\\d)';
  if (new RegExp(`^${num}_([nhx][12]|db)\\.not$`).test(n)) return 262144;
  if (new RegExp(`^d${num}\\.aud$`).test(n)) return 614400;
  if (new RegExp(`^${num}\\.aud$`).test(n)) return 16777216;   // entera: si pasa la placa (2,6 MB) el juego recibe una recortada
  if (new RegExp(`^t${num}\\.pnz$`).test(n)) return 2097152;
  if (n === 'canciones.json') return 65536;
  return 0;
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
const puerto0 = +(process.argv[2] || 8790);

// ---------- salon online: /online/* va al PHP (app\online\api.php), como en el hosting ----------
// En la PC se usa el PHP portatil de ravenlight-web. PIU_ONLINE_DATOS cambia la carpeta de datos del salon (pruebas).
const raizOnline = path.join(aqui, '..', 'app', 'online');
// (en otra PC o en Linux/Mac: el php que haya instalado; sin PHP el juego anda igual, sin salon local)
const phpCharles = path.join(aqui, '..', '..', '..', '2_Ravenlight.net', 'ravenlight-web', '_herramientas', 'php', 'php.exe');
const php = fs.existsSync(phpCharles) ? phpCharles : 'php';
const puertoPhp = puerto0 + 61;
let procesoPhp = null;
if (fs.existsSync(raizOnline)) {
  procesoPhp = spawn(php, ['-S', `127.0.0.1:${puertoPhp}`, '-t', raizOnline], { stdio: 'ignore', windowsHide: true, env: process.env });
  procesoPhp.on('error', () => { procesoPhp = null; console.log('(sin PHP: el salon online local no anda; el juego si)'); });
  process.on('exit', () => { try { if (procesoPhp) procesoPhp.kill(); } catch (e) { /* ya cerrado */ } });
  for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => process.exit(0));
}
function alSalon(req, res) {
  const r = http.request({ host: '127.0.0.1', port: puertoPhp, path: req.url.slice('/online'.length) || '/', method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${puertoPhp}` } }, (pr) => {
    res.writeHead(pr.statusCode, { ...pr.headers, 'Cross-Origin-Resource-Policy': 'same-origin' });
    pr.pipe(res);
  });
  r.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"error":"no esta el servidor del salon (falta PHP)"}'); });
  req.pipe(r);
}
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };

function servirArchivo(req, res, ruta) {
  const st = fs.statSync(ruta);
  const tipo = TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
  const rango = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
  const cab = { 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
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

const servidor = http.createServer((req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url.startsWith('/online/')) return alSalon(req, res);
    if (url in GUARDABLES) {
      const ruta = path.join(raizGuardado, path.basename(url));
      if (req.method === 'PUT') {
        const partes = [];
        req.on('data', (c) => partes.push(c));
        req.on('end', () => {
          const datos = Buffer.concat(partes);
          const lim = GUARDABLES[url];
          if (lim.exacto ? datos.length !== lim.exacto : (datos.length === 0 || datos.length > lim.max)) { res.writeHead(400); return res.end('tamano incorrecto'); }
          fs.mkdirSync(raizGuardado, { recursive: true });
          fs.writeFileSync(ruta, datos);
          res.writeHead(204, { 'Cross-Origin-Resource-Policy': 'same-origin' }); res.end();
        });
        return;
      }
      if (!fs.existsSync(ruta)) { res.writeHead(404, { 'Cross-Origin-Resource-Policy': 'same-origin' }); return res.end('no existe'); }
      return servirArchivo(req, res, ruta);
    }
    // canciones propias del editor (EDITOR_MASTER.md etapa 2): guardado\canciones\, solo estos nombres (numeros 82-99)
    // y con tope de tamano por tipo; no se puede escribir nada mas
    // "tu version" de los pasos de una cancion del disco (editor, G): guardado\ediciones\, solo NN_xx.not; el original del
    // disco nunca se toca
    if (url.startsWith('/guardado/canciones/') || url.startsWith('/guardado/ediciones/')) {
      const edicion = url.startsWith('/guardado/ediciones/'), n = url.slice(20).toLowerCase();
      const tope = edicion ? (/^\d\d_([nhx][12]|db)\.not$/.test(n) ? 262144 : 0) : topeCancion(n);
      if (!tope) { res.writeHead(404); return res.end('nombre no permitido'); }
      const ruta = path.join(raizGuardado, edicion ? 'ediciones' : 'canciones', n);
      if (req.method === 'PUT') {
        const partes = []; let total = 0;
        req.on('data', (c) => { total += c.length; if (total <= tope) partes.push(c); });
        req.on('end', () => {
          if (total === 0 || total > tope) { res.writeHead(400); return res.end('tamano incorrecto'); }
          fs.mkdirSync(path.dirname(ruta), { recursive: true });
          fs.writeFileSync(ruta, Buffer.concat(partes));
          res.writeHead(204, { 'Cross-Origin-Resource-Policy': 'same-origin' }); res.end();
        });
        return;
      }
      if (!fs.existsSync(ruta)) { res.writeHead(404, { 'Cross-Origin-Resource-Policy': 'same-origin' }); return res.end('no existe'); }
      return servirArchivo(req, res, ruta);
    }
    if (url.startsWith('/disco/')) {
      const p = indiceDisco.get(url.slice('/disco/'.length).replace(/\\/g, '/').toLowerCase());
      if (!p) { res.writeHead(404); return res.end('no existe'); }
      return servirArchivo(req, res, p);
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
});

function abrir(p) {
  const url = `http://localhost:${p}/port/`;
  console.log('Pump It Up Extra en ' + url + '  (el prototipo viejo sigue en http://localhost:' + p + '/)  (cerra esta ventana para apagarlo)');
  if (!process.env.PIU_NO_ABRIR) exec(process.platform === 'win32' ? `cmd /c start "" "${url}"` : `${process.platform === 'darwin' ? 'open' : 'xdg-open'} "${url}"`);
}

let puerto = puerto0;
servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && puerto < puerto0 + 10) { puerto++; servidor.listen(puerto, '127.0.0.1'); }
  else { console.error(e.message); process.exit(1); }
});
servidor.on('listening', () => abrir(puerto));
servidor.listen(puerto, '127.0.0.1');
