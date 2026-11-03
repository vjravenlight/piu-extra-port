// Prueba archivos.js leerRom (la ROM de los sonidos que elige el jugador con disco propio) con los archivos de verdad:
// bios\pumpitup.zip y bios\pumpitup\piu10.u9 se aceptan; lo demas se rechaza. Hace falta la ROM: no anda sin ella.
// Uso: node tools\probar_rom.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { leerRom } = await import(pathToFileURL(path.join(raiz, 'app/port/archivos.js')).href);
const bios = path.join(raiz, 'bios');
const verdadera = fs.readFileSync(path.join(bios, 'pumpitup', 'piu10.u9'));
const archivo = (b) => new Blob([b]);
let errores = 0;
async function acepta(nombre, b) {
  try { const r = await leerRom(archivo(b)); const ok = Buffer.compare(Buffer.from(r), verdadera) === 0; console.log(`${ok ? 'bien' : 'MAL '}  ${nombre}: acepta, ${r.length} bytes, ${ok ? 'identica' : 'DISTINTA'}`); if (!ok) errores++; }
  catch (e) { console.log(`MAL   ${nombre}: la rechazo (${e.message})`); errores++; }
}
async function rechaza(nombre, b) {
  try { await leerRom(archivo(b)); console.log(`MAL   ${nombre}: la acepto`); errores++; }
  catch (e) { console.log(`bien  ${nombre}: rechazada`); }
}
await acepta('pumpitup.zip', fs.readFileSync(path.join(bios, 'pumpitup.zip')));
await acepta('piu10.u9 suelto', verdadera);
await rechaza('piu10.u8 (otra del mismo set, mismo largo)', fs.readFileSync(path.join(bios, 'pumpitup', 'piu10.u8')));
await rechaza('un zip sin la ROM', Buffer.from('504b0506000000000000000000000000000000000000', 'hex'));
await rechaza('un archivo cualquiera', Buffer.alloc(1000, 7));
await rechaza('un .u9 con un byte cambiado', (() => { const b = Buffer.from(verdadera); b[1000] ^= 1; return b; })());
console.log(errores ? `\n${errores} ERRORES` : '\n0 errores');
process.exit(errores ? 1 : 0);
