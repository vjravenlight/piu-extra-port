// Pump It Up Extra para Linux y Mac (y Windows, si se quiere): ventana de Electron con el juego adentro, igual que la
// build de Edge (tools\build_edge\PumpItUpExtra.cs). Un servidor local en 127.0.0.1 sirve el juego con los encabezados
// de aislamiento (COOP/COEP: el port necesita memoria compartida) y guarda lo que el juego graba, con los mismos nombres
// y topes que la build de Edge: EEPROM, opciones, canciones propias (guardado\canciones) y "tu version" de los pasos
// (guardado\ediciones). Ranking y online: los del hosting (online.js usa la API de ravenlight.net si hay window.piuBuild).
// Lo guardado va al lado del programa (la carpeta se puede copiar entera); en Mac, adentro de la .app no se puede
// escribir sin romperla, asi que va a la carpeta de datos del usuario (~/Library/Application Support/Pump It Up Extra).
// Lo arma tools\armar_multiplataforma.ps1: este archivo va a resources/app/ con juego/ (port, motor, volcados, disco).
// Esc sale; F11 o doble clic cambian la pantalla completa. PIU_PRUEBA=carpeta: prueba sin ventana (capturas y registro).
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const raizJuego = path.join(__dirname, 'juego');
const raizVolcados = path.join(raizJuego, 'volcados');
const raizDisco = path.join(raizJuego, 'disco');
const prueba = process.env.PIU_PRUEBA || '';
function carpetaGuardado() {
  if (prueba) return path.join(prueba, 'guardado');
  if (process.platform === 'darwin' || process.env.APPIMAGE) return path.join(app.getPath('userData'), 'guardado');
  const alLado = path.join(path.dirname(process.execPath), 'guardado');
  try { fs.mkdirSync(alLado, { recursive: true }); fs.accessSync(alLado, fs.constants.W_OK); return alLado; }
  catch (e) { return path.join(app.getPath('userData'), 'guardado'); }     // carpeta de solo lectura: a la del usuario
}
let raizGuardado = '';

// indice del disco en minusculas: el juego pide "bga\00.dat", "AUDIO\01.AUD", "STEP\60_N1.NOT"...
const indiceDisco = new Map();
(function recorrer(d, rel) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) recorrer(path.join(d, e.name), r); else indiceDisco.set(r.toLowerCase(), path.join(d, e.name));
  }
})(raizDisco, '');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.css': 'text/css; charset=utf-8' };
const AISLAR = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
// lo que el juego puede grabar, con su tope (los mismos nombres que la build de Edge y tools\servidor.mjs)
function tope(url) {
  if (url === '/guardado/eeprom.bin') return { exacto: 128 };
  if (url === '/guardado/opciones.json') return { max: 4096 };
  const m = /^\/guardado\/(canciones|ediciones)\/([^/]+)$/.exec(url); if (!m) return null;
  const n = m[2].toLowerCase(), num = '(8[2-9]|9\\d)';
  if (m[1] === 'ediciones') return /^\d\d_([nhx][12]|db)\.not$/.test(n) ? { max: 262144, sub: 'ediciones', n } : null;
  if (new RegExp(`^${num}_([nhx][12]|db)\\.not$`).test(n)) return { max: 262144, sub: 'canciones', n };
  if (new RegExp(`^d${num}\\.aud$`).test(n)) return { max: 614400, sub: 'canciones', n };
  if (new RegExp(`^${num}\\.aud$`).test(n)) return { max: 16777216, sub: 'canciones', n };
  if (new RegExp(`^t${num}\\.pnz$`).test(n)) return { max: 2097152, sub: 'canciones', n };
  if (n === 'canciones.json') return { max: 65536, sub: 'canciones', n };
  return null;
}
function servirArchivo(req, res, ruta) {
  const st = fs.statSync(ruta);
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store', ...AISLAR });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(ruta).pipe(res);
}
const noHay = (res, c = 404) => { res.writeHead(c, AISLAR); res.end(); };

const servidor = http.createServer((req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const t = url.startsWith('/guardado/') ? tope(url) : null;
    if (url.startsWith('/guardado/')) {
      if (!t) return noHay(res);
      const ruta = t.sub ? path.join(raizGuardado, t.sub, t.n) : path.join(raizGuardado, path.basename(url));
      if (req.method === 'PUT') {
        const partes = []; let largo = 0, demasiado = false;
        req.on('data', (c) => { largo += c.length; if (largo > (t.exacto || t.max)) demasiado = true; else partes.push(c); });
        req.on('end', () => {
          const datos = Buffer.concat(partes);
          if (demasiado || (t.exacto ? datos.length !== t.exacto : datos.length === 0)) return noHay(res, 400);
          fs.mkdirSync(path.dirname(ruta), { recursive: true });
          fs.writeFileSync(ruta + '.tmp', datos); fs.renameSync(ruta + '.tmp', ruta);
          noHay(res, 204);
        });
        return;
      }
      return fs.existsSync(ruta) ? servirArchivo(req, res, ruta) : noHay(res);
    }
    if (url.startsWith('/disco/')) {
      const p = indiceDisco.get(url.slice('/disco/'.length).replace(/\\/g, '/').toLowerCase());
      return p ? servirArchivo(req, res, p) : noHay(res);
    }
    let raiz = raizJuego, rel = url.endsWith('/') ? url + 'index.html' : url;
    if (url.startsWith('/volcados/')) { raiz = raizVolcados; rel = url.slice('/volcados/'.length); }
    const ruta = path.normalize(path.join(raiz, rel));
    if (!ruta.startsWith(raiz)) return noHay(res, 403);
    if (!fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) return noHay(res);
    servirArchivo(req, res, ruta);
  } catch (e) { noHay(res, 500); }
});

// una sola copia abierta; el sonido arranca sin clic, como la cabina al prenderla
if (!app.requestSingleInstanceLock()) app.quit();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setName('Pump It Up Extra');
Menu.setApplicationMenu(null);

let ventana = null;
app.whenReady().then(() => {
  raizGuardado = carpetaGuardado();
  servidor.listen(0, '127.0.0.1', () => {
    ventana = new BrowserWindow({
      width: 1280, height: 960, fullscreen: !prueba, backgroundColor: '#000000', title: 'Pump It Up Extra', autoHideMenuBar: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, offscreen: !!prueba },
    });
    if (!prueba) ventana.once('ready-to-show', () => ventana.show());
    ventana.on('closed', () => { ventana = null; app.quit(); });
    ventana.loadURL(`http://127.0.0.1:${servidor.address().port}/port/`);
    if (prueba) probar();
  });
});
app.on('second-instance', () => { if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); } });
app.on('window-all-closed', () => app.quit());

async function probar() {
  fs.mkdirSync(prueba, { recursive: true });
  const consola = [];
  ventana.webContents.on('console-message', (e) => consola.push(`${e.level} ${e.message} (${(e.sourceId || '').split('/').pop()}:${e.lineNumber})`));
  ventana.webContents.on('render-process-gone', (e, d) => consola.push('SE CAYO: ' + JSON.stringify(d)));
  servidor.on('request', (req) => consola.push('pedido ' + req.method + ' ' + req.url));
  ventana.webContents.setFrameRate(60);
  ventana.webContents.setAudioMuted(true);        // las pruebas en la PC de Charles van sin sonido (21/10)
  const esperar = (s) => new Promise((r) => setTimeout(r, s * 1000));
  for (const s of [10, 40]) { await esperar(s === 10 ? 10 : 30); fs.writeFileSync(path.join(prueba, `build_${s}s.png`), (await ventana.webContents.capturePage()).toPNG()); }
  const todo = await ventana.webContents.executeJavaScript('JSON.stringify({ build: !!window.piuBuild, aislado: crossOriginIsolated, menu: window.__port && window.__port.menu(), errores: window.__errores || null, ultimos: window.__port && window.__port.ultimos })');
  fs.writeFileSync(path.join(prueba, 'build_registro.json'), todo + '\nguardado: ' + raizGuardado + '\n' + consola.join('\n'));
  app.quit();
}

ipcMain.on('salir', () => app.quit());
ipcMain.on('pantallaCompleta', (e, si) => { if (ventana) ventana.setFullScreen(!!si); });
ipcMain.on('estaCompleta', (e) => { e.returnValue = !!(ventana && ventana.isFullScreen()); });
