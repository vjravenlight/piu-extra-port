// Prepara el DISCO PROPIO en el navegador (archivos.js; Charles 21/10: "que tire la carpeta o bin del mismo"): lo mismo
// que tools\preparar\preparar.mjs en la PC, pero aca, con el disco que elige el jugador, y sin mandarlo a ningun lado.
// 1. saca la carpeta Piu del disco (.bin/.iso con app\motor\disco.js) o la toma de la carpeta elegida
// 2. carga Piu.exe y saca el codigo y los datos (preparar\exe_le.mjs)
// 3. traduce el codigo a JavaScript (preparar\traducir.mjs)
// 4. arma las listas (preparar\listas.mjs, preparar\canciones_online.mjs)
// Todo queda en el almacen 'piu-disco-1' (Cache Storage). Se le manda { imagen: File } o { carpeta: [{ ruta, file }] }.
import { Disco, lectorDeArchivo, lectorDeIso, esIso } from '../motor/disco.js';
import { leerPasos } from '../motor/cifrados.js';
import { cargarLE, sacarVolcados } from '../preparar/exe_le.mjs';
import { traducirCodigo } from '../preparar/traducir.mjs';
import { armarListaConTodo, bytesATexto, textoABytes } from '../preparar/listas.mjs';
import { listaOnline } from '../preparar/canciones_online.mjs';

const ALMACEN = 'piu-disco-1';                       // (el mismo de archivos.js)
const BASE = new URL('../', self.location.href).href;
const clave = (rel) => BASE + '__disco_propio__/' + rel.replace(/\\/g, '/').toLowerCase();
// el Piu.exe de Pump It Up Extra (R4, 08/03/2001): todo el port (direcciones, reemplazos) es para este
const PIU_EXE = 'fbc29b8b0cb8ab5b69f15ed0289109d18b401a1a22ca2c28bf4a0eff9cef89cc';
const avisar = (paso, texto, parte = 0) => postMessage({ tipo: 'progreso', paso, texto, parte });
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

// los archivos de la carpeta Piu del disco: [{ ruta (en minuscula, sin 'piu/'), tam, leer() }]
async function archivosDe(datos) {
  if (datos.imagen) {
    const l = lectorDeArchivo(datos.imagen);
    const disco = await Disco.abrir(esIso(datos.imagen.name, datos.imagen.size) ? lectorDeIso(l) : l);
    const lista = disco.lista().filter((a) => /^piu\//i.test(a.ruta));
    return lista.map((a) => ({ ruta: a.ruta.slice(4).toLowerCase(), tam: a.tam, leer: () => disco.leer(a.ruta) }));
  }
  // carpeta: la que tiene Piu.exe es la raiz (sirve elegir la de Piu o la de arriba)
  const exe = datos.carpeta.find((a) => /(^|\/)piu\.exe$/i.test(a.ruta));
  if (!exe) return [];
  const raiz = exe.ruta.slice(0, exe.ruta.length - 'piu.exe'.length).toLowerCase();
  return datos.carpeta.filter((a) => a.ruta.toLowerCase().startsWith(raiz))
    .map((a) => ({ ruta: a.ruta.slice(raiz.length).toLowerCase(), tam: a.file.size, leer: async () => new Uint8Array(await a.file.arrayBuffer()) }));
}

async function preparar(datos) {
  avisar(1, 'Leyendo el disco...');
  const archivos = await archivosDe(datos);
  const exe = archivos.find((a) => a.ruta === 'piu.exe');
  if (!exe) throw new Error(datos.imagen ? 'En esa imagen no esta Piu\\Piu.exe: no parece el disco de Pump It Up Extra.' : 'En esa carpeta no esta Piu.exe: elegi la carpeta Piu del disco (o la de arriba).');
  // de cero: si habia un disco preparado a medias, se borra
  await caches.delete(ALMACEN);
  const almacen = await caches.open(ALMACEN);
  const total = archivos.reduce((s, a) => s + a.tam, 0);
  let hecho = 0, n = 0;
  const guardados = new Map();                     // ruta -> bytes de los chicos que hacen falta despues (pasos, game.cfg)
  for (const a of archivos) {
    const b = await a.leer();
    await almacen.put(clave('disco/' + a.ruta), new Response(b));
    if (/^step\/.*\.not$/.test(a.ruta) || a.ruta === 'game.cfg' || a.ruta === 'piu.exe') guardados.set(a.ruta, b);
    hecho += a.tam; n++;
    if (n % 10 === 0 || n === archivos.length) avisar(1, `Sacando los archivos del disco: ${n} de ${archivos.length} (${Math.round(hecho / 1048576)} MB)`, hecho / total);
  }

  avisar(2, 'Cargando Piu.exe...');
  const bytesExe = guardados.get('piu.exe');
  const suma = hex(await crypto.subtle.digest('SHA-256', bytesExe));
  const volcados = sacarVolcados(cargarLE(bytesExe));
  for (const [nombre, b] of Object.entries(volcados)) await almacen.put(clave('volcados/' + nombre), new Response(b));

  avisar(3, 'Traduciendo el juego a JavaScript (puede tardar un minuto)...');
  const texto = async (f) => { const r = await fetch(BASE + 'preparar/' + f); return r.ok ? r.text() : ''; };
  const t = traducirCodigo(volcados['codigo_0x20000.bin'], volcados['datos_0x130000.bin'], await texto('funciones.txt'), await texto('entradas_extra.json'));
  await almacen.put(clave('port/traducido.js'), new Response(t.js, { headers: { 'Content-Type': 'text/javascript' } }));

  avisar(4, 'Armando las listas de canciones...');
  const hay = { step: new Set(), audio: new Set(), bga: new Set(), title: new Set() };
  for (const a of archivos) { const [c, nombre] = a.ruta.split('/'); if (nombre && hay[c]) hay[c].add(nombre); }
  const cfg = guardados.get('game.cfg');
  if (!cfg) throw new Error('En el disco no esta game.cfg.');
  const lista = armarListaConTodo(bytesATexto(cfg), hay, (nombre) => guardados.get('step/' + nombre) || null, leerPasos);
  await almacen.put(clave('port/game_con_todo.cfg'), new Response(textoABytes(lista.texto)));
  await almacen.put(clave('port/game_online.cfg'), new Response(textoABytes(listaOnline(lista.texto))));

  const listo = { version: 1, fecha: new Date().toISOString(), archivos: archivos.length, mb: Math.round(total / 1048576), piuExe: suma, mismoExe: suma === PIU_EXE, funciones: t.funciones };
  await almacen.put(clave('listo.json'), new Response(JSON.stringify(listo), { headers: { 'Content-Type': 'application/json' } }));
  return listo;
}

onmessage = (e) => {
  preparar(e.data).then((listo) => postMessage({ tipo: 'listo', listo }),
    (err) => postMessage({ tipo: 'error', texto: (err && err.message) || String(err) }));
};
