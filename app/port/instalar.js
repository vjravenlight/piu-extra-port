// Pantalla "PONE TU DISCO" (disco propio, archivos.js): cuando el servidor no trae el juego, el jugador elige la imagen
// de su disco (.bin con su .cue, o .iso) o la carpeta con los archivos ya sacados. instalador.js lo prepara en un hilo
// aparte y queda guardado en este navegador; el disco no sale del aparato.
const ESTILO = `
#disco { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: radial-gradient(circle at 50% 30%, #1d2340, #000 70%); color: #e9ecf5; font: 16px "Segoe UI", system-ui, sans-serif; }
#disco .caja { max-width: 560px; width: 100%; text-align: center; }
#disco h1 { margin: 0 0 4px; font-size: 30px; letter-spacing: 2px; color: #ffd23f; }
#disco h2 { margin: 0 0 20px; font-size: 14px; font-weight: 400; color: #8a90a6; letter-spacing: 1px; }
#disco p { margin: 0 0 14px; line-height: 1.45; color: #c8cde0; }
#disco .botones { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 18px 0 10px; }
#disco button { font: 600 15px "Segoe UI", system-ui, sans-serif; padding: 12px 18px; border-radius: 8px; border: 2px solid #ffd23f;
  background: #ffd23f; color: #111; cursor: pointer; }
#disco button.otro { background: transparent; color: #ffd23f; }
#disco button:disabled { opacity: .4; cursor: default; }
#disco .soltar { margin-top: 8px; padding: 18px; border: 2px dashed #3a4060; border-radius: 10px; color: #8a90a6; font-size: 14px; }
#disco.encima .soltar { border-color: #ffd23f; color: #ffd23f; }
#disco .barra { height: 10px; background: #22263a; border-radius: 5px; overflow: hidden; margin: 18px 0 8px; display: none; }
#disco .barra i { display: block; height: 100%; width: 0; background: #ffd23f; transition: width .2s; }
#disco .estado { min-height: 22px; font-size: 14px; color: #c8cde0; }
#disco .error { color: #ff6b6b; }
#disco .chico { font-size: 12px; color: #6f7590; margin-top: 18px; }
#disco a { color: #5fd0ff; }
#disco input { display: none; }`;

const PASOS = ['', 'Disco', 'Piu.exe', 'Traduccion', 'Listas'];

export function pedirDisco() {
  return new Promise((listo) => {
    const estilo = document.createElement('style'); estilo.textContent = ESTILO; document.head.appendChild(estilo);
    const d = document.createElement('div'); d.id = 'disco';
    d.innerHTML = `<div class="caja">
      <h1>PUMP IT UP EXTRA</h1><h2>PORT DE RAVENLIGHT</h2>
      <p>Para jugar hace falta <b>el disco original de la cabina</b> (Pump It Up Extra, 2001).</p>
      <p>Elegí la imagen del disco: el <b>.bin</b> (con su .cue), el <b>.iso</b>, o la <b>carpeta</b> con los archivos ya sacados.
      Se prepara una sola vez (un par de minutos) y queda guardado en este aparato. <b>El disco no se sube a ningún lado.</b></p>
      <div class="botones"><button class="bin">ELEGIR EL .BIN O EL .ISO</button><button class="otro carpeta">ELEGIR LA CARPETA</button></div>
      <div class="soltar">o arrastralo y soltalo acá</div>
      <div class="barra"><i></i></div><div class="estado"></div>
      <div class="chico">Necesita unos 700 MB libres. Guía: <a href="https://github.com/vjravenlight/piu-extra-port/blob/main/GUIA.md" target="_blank" rel="noopener">paso a paso</a></div>
      <input type="file" class="archivo" accept=".bin,.iso,.cue,.img" multiple><input type="file" class="dir" webkitdirectory multiple></div>`;
    document.body.appendChild(d);
    const $ = (s) => d.querySelector(s), estado = $('.estado'), barra = $('.barra'), relleno = $('.barra i');
    const decir = (t, error) => { estado.textContent = t; estado.classList.toggle('error', !!error); };
    let ocupado = false;
    const botones = (si) => d.querySelectorAll('button').forEach((b) => { b.disabled = !si; });
    $('.bin').onclick = () => $('.archivo').click();
    $('.carpeta').onclick = () => $('.dir').click();
    $('.archivo').onchange = (e) => elegidos([...e.target.files].map((f) => ({ ruta: f.name, file: f })));
    $('.dir').onchange = (e) => elegidos([...e.target.files].map((f) => ({ ruta: f.webkitRelativePath || f.name, file: f })));
    d.addEventListener('dragover', (e) => { e.preventDefault(); d.classList.add('encima'); });
    d.addEventListener('dragleave', () => d.classList.remove('encima'));
    d.addEventListener('drop', async (e) => {
      e.preventDefault(); d.classList.remove('encima');
      if (ocupado) return;
      elegidos(await soltados(e.dataTransfer));
    });

    // pruebas automaticas (tools\servidor.mjs con PIU_DISCO_PRUEBA): ?discoDePrueba=/disco-de-prueba.bin lo elige solo
    const dePrueba = new URLSearchParams(location.search).get('discoDePrueba');
    if (dePrueba) fetch(dePrueba).then((r) => r.blob()).then((b) => elegidos([{ ruta: 'prueba.bin', file: new File([b], 'prueba.bin') }]));
    // lo elegido: una imagen (.bin o .iso; el .cue solo dice como se llama el .bin) o los archivos de una carpeta
    function elegidos(lista) {
      if (ocupado || !lista.length) return;
      const imagen = lista.find((a) => /\.(bin|iso|img)$/i.test(a.ruta) && a.file.size > 100e6);
      const exe = lista.find((a) => /(^|\/)piu\.exe$/i.test(a.ruta));
      if (imagen) return empezar({ imagen: imagen.file }, `${imagen.file.name} (${Math.round(imagen.file.size / 1048576)} MB)`);
      if (exe) return empezar({ carpeta: lista }, `la carpeta (${lista.length} archivos)`);
      if (lista.some((a) => /\.cue$/i.test(a.ruta))) return decir('Elegiste el .cue: elegí el .bin que está al lado (es el archivo grande).', true);
      decir('Eso no es el disco: elegí el .bin o el .iso (el archivo grande), o la carpeta donde está Piu.exe.', true);
    }
    async function empezar(datos, que) {
      ocupado = true; botones(false); barra.style.display = 'block'; relleno.style.width = '0';
      decir('Preparando ' + que + '...');
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* lo decide el navegador */ }
      try {
        const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
        if (est && est.quota && est.quota - (est.usage || 0) < 600e6) decir(`Ojo: este navegador deja guardar poco (${Math.round((est.quota - (est.usage || 0)) / 1048576)} MB). Si falla, liberá espacio.`, true);
      } catch (e) { /* sin dato */ }
      const h = new Worker('./instalador.js', { type: 'module' });
      h.onmessage = (e) => {
        const m = e.data;
        if (m.tipo === 'progreso') {
          decir(`${m.paso}/4 · ${m.texto}`);
          relleno.style.width = Math.round(((m.paso - 1) + (m.parte || 0)) / 4 * 100) + '%';
        } else if (m.tipo === 'listo') {
          relleno.style.width = '100%';
          decir(m.listo.mismoExe ? '¡Listo! Arrancando...' : 'Listo, pero ese Piu.exe es de otra versión del disco: puede no andar bien. Arrancando...');
          h.terminate();
          setTimeout(() => { d.remove(); estilo.remove(); listo(m.listo); }, m.listo.mismoExe ? 600 : 3500);
        } else if (m.tipo === 'error') {
          h.terminate(); ocupado = false; botones(true);
          decir('No se pudo: ' + m.texto, true);
        }
      };
      h.onerror = (e) => { ocupado = false; botones(true); decir('No se pudo preparar: ' + (e.message || 'error en el instalador'), true); };
      h.postMessage(datos);
    }
  });
}

// lo que se solto: archivos sueltos o una carpeta entera (se recorre)
async function soltados(dt) {
  const salida = [], entradas = [...(dt.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entradas.length) return [...dt.files].map((f) => ({ ruta: f.name, file: f }));
  const leerDir = (dir) => new Promise((ok) => { const r = dir.createReader(), todas = []; (function mas() { r.readEntries((l) => { if (!l.length) ok(todas); else { todas.push(...l); mas(); } }, () => ok(todas)); })(); });
  async function recorrer(e, camino) {
    if (e.isFile) { const f = await new Promise((ok, mal) => e.file(ok, mal)); salida.push({ ruta: camino + e.name, file: f }); }
    else if (e.isDirectory) for (const h of await leerDir(e)) await recorrer(h, camino + e.name + '/');
  }
  for (const e of entradas) await recorrer(e, '');
  return salida;
}
