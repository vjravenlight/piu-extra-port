// Lo que la pagina del port (app\port\principal.js) puede pedirle a la ventana: salir (Esc) y prender o apagar la
// pantalla completa (doble clic o F11). Con window.piuBuild el juego usa el ranking y el online del hosting.
// Tambien junta los errores de la pagina en window.__errores (para la prueba PIU_PRUEBA).
const { contextBridge, ipcRenderer, webFrame } = require('electron');
contextBridge.exposeInMainWorld('piuBuild', {
  salir: () => ipcRenderer.send('salir'),
  pantallaCompleta: (si) => ipcRenderer.send('pantallaCompleta', !!si),
  estaCompleta: () => ipcRenderer.sendSync('estaCompleta'),
});
webFrame.executeJavaScript("window.__errores = []; addEventListener('error', (e) => window.__errores.push((e.message || e.type) + ' ' + (e.filename || '') + ':' + (e.lineno || '')));");
