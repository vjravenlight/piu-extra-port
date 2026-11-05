// Lee una imagen de CD (.bin + .cue) sin ejecutar nada de adentro: pistas y archivos de la pista de datos.
// Sirve para discos de varias sesiones, donde las posiciones de ISO9660 son absolutas del disco.
import { openSync, readSync, fstatSync, readFileSync, closeSync } from 'node:fs';

const FORMA = { 'MODE1/2352': [2352, 16], 'MODE2/2352': [2352, 24], 'MODE1/2048': [2048, 0], 'MODE2/2336': [2336, 8] };

export function leerCue(ruta) {
  const pistas = [];
  for (const l of readFileSync(ruta, 'latin1').split(/\r?\n/)) {
    let m;
    if ((m = l.match(/^\s*TRACK\s+(\d+)\s+(\S+)/))) pistas.push({ n: +m[1], tipo: m[2], inicio: null });
    else if ((m = l.match(/^\s*INDEX\s+01\s+(\d+):(\d+):(\d+)/)) && pistas.length) pistas[pistas.length - 1].inicio = (+m[1] * 60 + +m[2]) * 75 + +m[3];
  }
  return pistas;
}

export function abrirImagen(rutaBin, rutaCue = rutaBin.replace(/\.[^.\\/]+$/, '.cue')) {
  const fd = openSync(rutaBin, 'r'), tam = fstatSync(fd).size;
  // Un .iso es una sola pista de datos, sin .cue.
  const pistas = /\.iso$/i.test(rutaBin) ? [{ n: 1, tipo: 'MODE1/2048', inicio: 0 }] : leerCue(rutaCue);
  const datos = pistas.filter(p => FORMA[p.tipo]);
  if (!datos.length) throw new Error('La imagen no tiene pista de datos');
  const pista = datos[datos.length - 1], [paso, salto] = FORMA[pista.tipo];
  const sector = (n) => { const b = Buffer.alloc(2048); readSync(fd, b, 0, 2048, n * paso + salto); return b; };
  const pvd = sector(pista.inicio + 16);
  if (pvd.subarray(1, 6).toString('latin1') !== 'CD001') throw new Error('La pista de datos no es ISO9660');

  // Hay imagenes que guardan posiciones relativas a la pista y otras absolutas: manda donde este la raiz de verdad.
  const raiz = pvd.subarray(156, 190), lbaRaiz = raiz.readUInt32LE(2), largoRaiz = raiz.readUInt32LE(10);
  const esRaiz = (n) => { if (n < 0 || n * paso >= tam) return false; const d = sector(n); return d[0] >= 34 && d[32] === 1 && d[33] === 0; };
  const corrimiento = esRaiz(lbaRaiz) ? 0 : esRaiz(lbaRaiz + pista.inicio) ? pista.inicio : null;
  if (corrimiento === null) throw new Error('No encontre la raiz del disco');

  const leer = (lba, largo) => {
    const n = Math.ceil(largo / 2048), o = Buffer.alloc(n * 2048);
    for (let i = 0; i < n; i++) readSync(fd, o, i * 2048, 2048, (lba + corrimiento + i) * paso + salto);
    return o.subarray(0, largo);
  };
  const lista = [];
  const dir = (lba, largo, r) => {
    const d = leer(lba, largo);
    for (let p = 0; p < d.length;) {
      const l = d[p];
      if (!l) { p = (Math.floor(p / 2048) + 1) * 2048; continue; }
      const nl = d[p + 32];
      if (!(nl === 1 && d[p + 33] < 2)) {
        const n = d.subarray(p + 33, p + 33 + nl).toString('latin1').replace(/;\d+$/, ''), ext = d.readUInt32LE(p + 2), t = d.readUInt32LE(p + 10);
        if (d[p + 25] & 2) dir(ext, t, r + n + '/'); else lista.push({ ruta: r + n, lba: ext, tam: t });
      }
      p += l;
    }
  };
  dir(lbaRaiz, largoRaiz, '/');
  return { pistas, pista, archivos: lista, leer: (f) => leer(f.lba, f.tam), cerrar: () => closeSync(fd),
    fecha: pvd.subarray(813, 829).toString('latin1'), volumen: pvd.subarray(40, 72).toString('latin1').trim() };
}
