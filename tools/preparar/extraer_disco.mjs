// Saca los archivos del disco de la cabina (la imagen que tiene cada uno) a extraido\Piu, sin programas aparte.
// Acepta el .cue (busca su .bin), el .bin (MODE2/2352, multisesion: el de la cabina) o un .iso de 2048 bytes por sector.
// Lo lee app\motor\disco.js (el mismo lector que puede usar el navegador). Solo se saca la carpeta Piu (la del juego):
// --todo saca tambien empty\ (el kit de F2, 200 MB, que el juego no usa).
// Uso: node extraer_disco.mjs <imagen> <carpeta de salida> [--todo]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Disco } from '../../app/motor/disco.js';

// lector de un archivo del disco duro, por tramos (el .bin pesa 730 MB: no se carga entero)
function lectorDeArchivo(ruta) {
  const fd = fs.openSync(ruta, 'r'), tam = fs.fstatSync(fd).size;
  return { tam, fd, async leer(pos, n) { const b = Buffer.alloc(Math.max(0, Math.min(n, tam - pos))); fs.readSync(fd, b, 0, b.length, pos); return new Uint8Array(b.buffer, b.byteOffset, b.length); } };
}
// un .iso (2048 por sector) visto como sectores crudos de 2352 en modo 1, que es lo que entiende disco.js
function lectorDeIso(ruta) {
  const l = lectorDeArchivo(ruta), n = Math.floor(l.tam / 2048);
  const bcd = (v) => ((Math.floor(v / 10) << 4) | (v % 10));
  return {
    tam: n * 2352, fd: l.fd,
    async leer(pos, cuanto) {
      const salida = new Uint8Array(cuanto), primero = Math.floor(pos / 2352), ultimo = Math.floor((pos + cuanto - 1) / 2352);
      const datos = await l.leer(primero * 2048, (ultimo - primero + 1) * 2048);
      for (let s = primero; s <= ultimo; s++) {
        const crudo = new Uint8Array(2352), lba = s + 150;
        crudo.set([0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0], 0);
        crudo[12] = bcd(Math.floor(lba / 4500)); crudo[13] = bcd(Math.floor(lba / 75) % 60); crudo[14] = bcd(lba % 75); crudo[15] = 1;
        crudo.set(datos.subarray((s - primero) * 2048, (s - primero + 1) * 2048), 16);
        const desde = Math.max(pos, s * 2352), hasta = Math.min(pos + cuanto, (s + 1) * 2352);
        salida.set(crudo.subarray(desde - s * 2352, hasta - s * 2352), desde - pos);
      }
      return salida;
    },
  };
}

export function abrirImagen(ruta) {
  let r = path.resolve(ruta);
  if (r.toLowerCase().endsWith('.cue')) {
    const m = /^\s*FILE\s+"(.+?)"/mi.exec(fs.readFileSync(r, 'latin1'));
    if (!m) throw new Error('el .cue no dice que .bin usa');
    r = path.join(path.dirname(r), path.basename(m[1]));
  }
  if (!fs.existsSync(r)) throw new Error('no existe ' + r);
  const tam = fs.statSync(r).size;
  const iso = r.toLowerCase().endsWith('.iso') || (tam % 2352 !== 0 && tam % 2048 === 0);
  return { ruta: r, lector: iso ? lectorDeIso(r) : lectorDeArchivo(r), iso };
}

// nombre seguro para el disco duro: nada de ".." ni separadores ni caracteres que Windows no acepta
const limpio = (n) => (n === '.' || n === '..' ? '_' : n.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_'));

export async function extraer(imagen, salida, { todo = false, avisar = console.log } = {}) {
  const { ruta, lector, iso } = abrirImagen(imagen);
  try {
    const disco = await Disco.abrir(lector);
    const lista = disco.lista().filter((a) => todo || /^piu\//i.test(a.ruta));
    if (!lista.some((a) => /^piu\/piu\.exe$/i.test(a.ruta))) throw new Error('en esta imagen no esta Piu\\Piu.exe: no parece el disco de Pump It Up Extra');
    avisar(`${path.basename(ruta)} (${iso ? 'ISO' : 'BIN'}, ${disco.sesiones.length} sesion${disco.sesiones.length === 1 ? '' : 'es'}): ${lista.length} archivos`);
    let bytes = 0, hechos = 0;
    for (const a of lista) {
      const destino = path.join(salida, ...a.ruta.split('/').map(limpio));
      if (!path.resolve(destino).startsWith(path.resolve(salida) + path.sep)) throw new Error('ruta rara en el disco: ' + a.ruta);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, await disco.leer(a.ruta));
      bytes += a.tam; hechos++;
      if (hechos % 100 === 0) avisar(`  ${hechos} de ${lista.length} (${Math.round(bytes / 1048576)} MB)`);
    }
    avisar(`Listo: ${hechos} archivos, ${Math.round(bytes / 1048576)} MB en ${salida}`);
  } finally { fs.closeSync(lector.fd); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), todo = args.includes('--todo'), [imagen, salida] = args.filter((a) => a !== '--todo');
  if (!imagen || !salida) { console.log('Uso: node extraer_disco.mjs <imagen .cue/.bin/.iso> <carpeta de salida> [--todo]'); process.exit(1); }
  extraer(imagen, salida, { todo }).catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
}
