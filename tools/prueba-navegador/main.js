// Prueba la pagina en Chromium (Electron) sin mostrar ventana: abre una URL, aprieta teclas, saca capturas
// y anota lo que dice la pagina. Configuracion por variables de entorno (Electron se cierra si recibe una URL):
//   PIU_URL       pagina (por defecto http://localhost:8790/?tabla=60_N1&auto=1&empezar=1)
//   PIU_SEGUNDOS  cuanto dura la prueba (30)
//   PIU_TECLAS    teclas a apretar, "codigo@segundo,..." (ej. "KeyS@3.5,Equal@4")
//   PIU_SALIDA    carpeta para capturas y registro (por defecto ..\..\pruebas)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const url = process.env.PIU_URL || 'http://localhost:8790/?tabla=60_N1&auto=1&empezar=1';
const segundos = +(process.env.PIU_SEGUNDOS || 30);
const teclas = (process.env.PIU_TECLAS || '').split(',').filter(Boolean).map(t => { const [k, s] = t.split('@'); return { k, s: +s }; });
const toques = (process.env.PIU_TOQUES || '').split(',').filter(Boolean).map(t => { const [xy, s] = t.split('@'); const [x, y] = xy.split(':').map(Number); return { x, y, s: +s }; });
const salida = process.env.PIU_SALIDA || path.join(__dirname, '..', '..', 'pruebas');
fs.mkdirSync(salida, { recursive: true });
const registro = path.join(salida, 'navegador_log.txt');
fs.writeFileSync(registro, '');
console.log = (...a) => fs.appendFileSync(registro, a.join(' ') + '\n');
process.on('uncaughtException', (e) => { console.log('EXCEPCION', e.stack); app.quit(); });

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// cada prueba con su perfil: asi se pueden abrir dos a la vez (por ejemplo, dos jugadores del salon online)
app.setPath('userData', path.join(salida, 'perfil'));
// cada pedido a la pagina con un tope de 5 s: si se traba (GPU, compositor), la prueba sigue y lo anota
const conTope = (p, que) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(que + ': sin respuesta en 5 s')), 5000))]);
app.on('child-process-gone', (e, d) => console.log('[PROCESO CAIDO]', JSON.stringify(d)));
app.whenReady().then(async () => {
  // PIU_OFFSCREEN=1: dibujo "fuera de pantalla" a 60 cuadros (una ventana oculta normal frena requestAnimationFrame)
  const fuera = !!process.env.PIU_OFFSCREEN;
  // PIU_ANCHO / PIU_ALTO: tamano de la ventana (por ejemplo 400x860 para simular un celular en vertical)
  const w = new BrowserWindow({ width: +(process.env.PIU_ANCHO || 1280), height: +(process.env.PIU_ALTO || 960), useContentSize: true, show: false,
    webPreferences: { backgroundThrottling: false, offscreen: fuera } });
  if (fuera) { w.webContents.setFrameRate(60); w.webContents.on('paint', () => {}); }
  // sin sonido (Charles 21/10: "si vas a abrir el pump para probar hacelo muteado, estoy escuchando musica");
  // PIU_SONIDO=1 lo deja sonar
  if (!process.env.PIU_SONIDO) w.webContents.setAudioMuted(true);
  w.webContents.on('console-message', (e, nivel, msg) => console.log('[pagina]', msg));
  // si la pagina se cae o se cuelga, anotarlo (sin esto la prueba solo se queda quieta hasta que la cortan)
  w.webContents.on('render-process-gone', (e, d) => console.log('[PAGINA CAIDA]', JSON.stringify(d)));
  w.webContents.on('unresponsive', () => console.log('[PAGINA COLGADA] no responde'));
  await w.loadURL(url);
  const t0 = Date.now();
  let proxCaptura = 2;
  while ((Date.now() - t0) / 1000 < segundos) {
    await new Promise(r => setTimeout(r, 250));
    const s = (Date.now() - t0) / 1000;
    for (const p of teclas) if (!p.hecho && s >= p.s) {
      p.hecho = true;
      w.webContents.sendInputEvent({ type: 'keyDown', keyCode: p.k });
      if (p.k.length === 1) w.webContents.sendInputEvent({ type: 'char', keyCode: p.k });   // una letra: tambien se escribe
      setTimeout(() => w.webContents.sendInputEvent({ type: 'keyUp', keyCode: p.k }), 80);
    }
    // PIU_TOQUES="x:y@segundo,...": un toque (clic) en esa posicion de la ventana, como un dedo en el celular
    for (const p of toques) if (!p.hecho && s >= p.s) {
      p.hecho = true;
      w.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      setTimeout(() => w.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 }), 100);
    }
    // PIU_DESDE / PIU_CADA: desde que segundo sacar capturas mas seguidas y cada cuanto (por defecto cada 5 s)
    if (s >= proxCaptura) {
      proxCaptura += (process.env.PIU_DESDE && s >= +process.env.PIU_DESDE) ? +(process.env.PIU_CADA || 1) : 5;
      let info = '';
      try {
        info = await conTope(w.webContents.executeJavaScript(`JSON.stringify({
          piu: window.__piu ? { estado: window.__piu.estado, fps: window.__piu.fps, partida: window.__piu.partida } : undefined,
          gl1: window.__gl1, texto: (document.getElementById('estado') || {}).textContent,
          error: (document.getElementById('error') || {}).textContent })`), 'leer la pagina');
      } catch (e) { info = 'no pude leer la pagina: ' + e.message; }
      console.log(Math.round(s) + 's', info);
      // PIU_EVAL: una expresion de JS extra que se anota en cada captura (para depurar)
      if (process.env.PIU_EVAL) { try { console.log('  eval:', JSON.stringify(await conTope(w.webContents.executeJavaScript(process.env.PIU_EVAL), 'eval'))); } catch (e) { console.log('  eval fallo: ' + e.message); } }
      try { fs.writeFileSync(path.join(salida, 'captura_' + s.toFixed(1).padStart(5, '0') + '.png'), (await conTope(w.capturePage(), 'captura')).toPNG()); } catch (e) { console.log('  ' + e.message); }
    }
  }
  try { fs.writeFileSync(path.join(salida, 'captura_final.png'), (await conTope(w.capturePage(), 'captura')).toPNG()); } catch (e) { console.log(e.message); }
  // registro completo del port (app\port\principal.js), si la pagina lo tiene
  try {
    const todo = await conTope(w.webContents.executeJavaScript('window.__port ? window.__port.todo.join("\\n") : ""'), 'registro');
    if (todo) fs.writeFileSync(path.join(salida, 'registro_juego.txt'), todo);
  } catch (e) { console.log('no pude leer el registro del juego: ' + e.message); }
  app.quit();
});
