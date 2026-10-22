// Prueba de app\motor\disco.js y cifrados.js: abre el .bin original, deduce la llave desde el disco y descifra todo,
// comparando byte por byte con lo que sacaron las herramientas de PowerShell (descifrado\...).
// Uso: node tools\probar_disco.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(aqui, '..');
const { Disco } = await import(pathToFileURL(path.join(base, 'app', 'motor', 'disco.js')).href);
const C = await import(pathToFileURL(path.join(base, 'app', 'motor', 'cifrados.js')).href);

const bin = fs.readdirSync(base).find(n => n.toLowerCase().endsWith('.bin'));
const fd = fs.openSync(path.join(base, bin), 'r');
const lector = { tam: fs.fstatSync(fd).size, async leer(pos, n) { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, pos); return new Uint8Array(b.buffer, b.byteOffset, n); } };
const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
const t0 = Date.now();
const fallas = [];
const ok = (cond, msg) => { if (!cond) fallas.push(msg); return cond; };

const disco = await Disco.abrir(lector);
const lista = disco.lista();
console.log(`Disco: ${disco.sesiones.length} sesiones ${JSON.stringify(disco.sesiones)}, ${lista.length} archivos (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
ok(lista.length === 825, 'se esperaban 825 archivos');

// llave deducida del disco vs la guardada
let t = Date.now();
const llave = C.derivarLlave(await disco.leer('Piu/Audio/05.AUD'));
const guardada = fs.readFileSync(path.join(base, 'tools', 'llave_audio_1024.bin'));
let iguales = 0; for (let i = 0; i < 1024; i++) if (llave[i] === guardada[i]) iguales++;
console.log(`Llave deducida del disco: ${iguales}/1024 bytes iguales a la guardada (${((Date.now() - t) / 1000).toFixed(1)} s)`);
ok(iguales === 1024, 'la llave deducida no coincide');

const comparar = (archivoDisco, bytes) => fs.existsSync(archivoDisco) && sha(fs.readFileSync(archivoDisco)) === sha(bytes);

// musica
t = Date.now(); let nOk = 0, nTot = 0;
for (const a of lista.filter(a => /\/audio\/[^/]+\.aud$/i.test(a.ruta))) {
  nTot++;
  const mp3 = C.descifrarAudio(await disco.leer(a.ruta), llave);
  const nom = path.basename(a.ruta).replace(/\.aud$/i, '.mp3');
  if (ok(mp3 && comparar(path.join(base, 'descifrado', 'musica', nom), mp3), 'musica distinta: ' + a.ruta)) nOk++;
}
console.log(`Musica: ${nOk}/${nTot} iguales (${((Date.now() - t) / 1000).toFixed(1)} s)`);

// caratulas
t = Date.now(); nOk = 0; nTot = 0;
for (const a of lista.filter(a => /\/title\/[^/]+\.pnz$/i.test(a.ruta))) {
  nTot++;
  const png = C.descifrarPnz(await disco.leer(a.ruta), llave);
  const nom = path.basename(a.ruta).replace(/\.pnz$/i, '.png');
  if (ok(png && comparar(path.join(base, 'descifrado', 'caratulas', nom), png), 'caratula distinta: ' + a.ruta)) nOk++;
}
console.log(`Caratulas: ${nOk}/${nTot} iguales (${((Date.now() - t) / 1000).toFixed(1)} s)`);

// pasos (comparacion del contenido JSON, sin importar el orden de las claves)
const canon = (x) => Array.isArray(x) ? '[' + x.map(canon).join(',') + ']' : (x && typeof x === 'object') ? '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}' : JSON.stringify(x);
t = Date.now(); nOk = 0; nTot = 0;
for (const a of lista.filter(a => /\/step\/[^/]+\.not$/i.test(a.ruta))) {
  nTot++;
  const nombre = path.basename(a.ruta).toUpperCase();
  const obj = C.leerPasos(nombre, await disco.leer(a.ruta));
  const ref = path.join(base, 'descifrado', 'pasos', nombre.replace(/\.NOT$/, '.json'));
  const igual = fs.existsSync(ref) && canon(obj) === canon(JSON.parse(fs.readFileSync(ref, 'utf8')));
  if (ok(igual, 'pasos distintos: ' + a.ruta)) nOk++;
}
console.log(`Pasos: ${nOk}/${nTot} iguales (${((Date.now() - t) / 1000).toFixed(1)} s)`);

// paquetes de graficos
t = Date.now(); nOk = 0; nTot = 0; let paquetes = 0;
for (const a of lista.filter(a => /^(piu\/bga|empty)\/[^/]+\.dat$/i.test(a.ruta))) {
  paquetes++;
  const p = C.abrirPaquete(await disco.leer(a.ruta));
  const carpeta = /^empty\//i.test(a.ruta) ? 'empty' : 'Bga';
  const dir = path.join(base, 'descifrado', 'graficos', carpeta, path.basename(a.ruta).replace(/\.dat$/i, '').toUpperCase());
  const ultimo = new Map(); p.archivos.forEach((x, i) => ultimo.set(x.nombre.toLowerCase(), i));
  p.archivos.forEach((x, i) => {
    if (ultimo.get(x.nombre.toLowerCase()) !== i) return;     // nombre repetido: en disco quedo el ultimo
    nTot++;
    if (ok(comparar(path.join(dir, x.nombre), x.datos()), 'grafico distinto: ' + a.ruta + ' / ' + x.nombre)) nOk++;
  });
}
console.log(`Graficos: ${paquetes} paquetes, ${nOk}/${nTot} archivos iguales (${((Date.now() - t) / 1000).toFixed(1)} s)`);

fs.closeSync(fd);
console.log(fallas.length ? `FALLAS (${fallas.length}):\n  ` + fallas.slice(0, 20).join('\n  ') : 'TODO IGUAL');
console.log(`Total: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
