// Informe de un disco de Pump It Up: que formatos trae y cuales ya sabe abrir la suite. Solo lee; no ejecuta nada del disco.
//   node tools\suite\mirar_version.mjs imagen.iso|imagen.bin [mas imagenes]
import { abrirImagen } from './imagen_cd.mjs';
import { detectar, abrirPaquete, escribirPaquete } from '../../app/suite/paquetes.js';
import { esPtx, decodificarPtx } from '../../app/suite/ptx.js';
import { esStf } from '../../app/suite/pasos_stf.js';

const legible = (b, n = 28) => Buffer.from(b.subarray(0, n)).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
const ext = (r) => (r.match(/\.([^./]*)$/) || [, '(sin)'])[1].toUpperCase();

for (const ruta of process.argv.slice(2)) {
  const im = abrirImagen(ruta);
  console.log(`\n################ ${ruta.split(/[\\/]/).pop()}`);
  console.log(`volumen "${im.volumen}", fecha ${im.fecha.slice(0, 8)}, ${im.pistas.length} pistas, ${im.archivos.length} archivos`);
  const porExt = {}, carpetas = {};
  for (const f of im.archivos) {
    const e = ext(f.ruta);
    (porExt[e] ||= { n: 0, b: 0, ej: f }); porExt[e].n++; porExt[e].b += f.tam;
    const c = f.ruta.split('/').slice(0, -1).join('/') || '/';
    (carpetas[c] ||= { n: 0, b: 0, ex: new Set() }); carpetas[c].n++; carpetas[c].b += f.tam; carpetas[c].ex.add(e);
  }
  console.log('-- carpetas');
  for (const [c, v] of Object.entries(carpetas).sort()) console.log(`  ${c}  ${v.n} archivos, ${Math.round(v.b / 1048576)} MB, ${[...v.ex].slice(0, 8).join(' ')}`);
  console.log('-- tipos (con los primeros bytes de un ejemplo)');
  for (const [e, v] of Object.entries(porExt).sort((a, c) => c[1].b - a[1].b).slice(0, 28)) {
    const q = new Uint8Array(im.leer({ lba: v.ej.lba, tam: Math.min(v.ej.tam, 64) }));
    console.log(`  ${e.padEnd(6)} ${String(v.n).padStart(5)}  ${String(Math.round(v.b / 1048576)).padStart(5)} MB  ${v.ej.ruta.split('/').pop().padEnd(18)} ${Buffer.from(q.subarray(0, 12)).toString('hex')}  ${legible(q)}`);
  }
  // Que reconoce la suite, mirando el contenido y no la extension.
  const rec = { paquetes: {}, identicos: 0, adentro: 0, ptx: 0, ptxBien: 0, stf: 0, otrosPaquete: [] }, adentro = {};
  const firmas = {};
  for (const f of im.archivos) {
    if (f.tam > 60 * 1048576) continue;                // el audio o video grande se mira aparte
    if (!/^(RES|DAT|PAK|PTX|STF|BIN|PNZ|AUD|NOT|STP)$/.test(ext(f.ruta))) { continue; }
    const b = new Uint8Array(im.leer(f)), t = detectar(b);
    if (t) {
      rec.paquetes[t] = (rec.paquetes[t] || 0) + 1;
      if (t !== 'RES?') {
        try {
          const p = abrirPaquete(b); rec.adentro += p.archivos.length;
          for (const a of p.archivos) { const x = ext(a.nombre); adentro[x] = (adentro[x] || 0) + 1; }
          if (Buffer.compare(Buffer.from(escribirPaquete(p)), Buffer.from(b)) === 0) rec.identicos++;
          for (const a of p.archivos) if (esPtx(a.datos)) { rec.ptx++; try { decodificarPtx(a.datos); rec.ptxBien++; } catch { /* se cuenta abajo */ } }
        } catch (e) { rec.otrosPaquete.push(`${f.ruta}: ${e.message}`); }
      } else rec.otrosPaquete.push(`${f.ruta}: version ${Buffer.from(b.subarray(4, 8)).readUInt32LE(0)}, ${legible(b, 40)}`);
    } else if (esPtx(b)) { rec.ptx++; try { decodificarPtx(b); rec.ptxBien++; } catch { /* se cuenta abajo */ } }
    else if (esStf(b)) rec.stf++;
    else { const k = `${ext(f.ruta)} ${Buffer.from(b.subarray(0, 4)).toString('hex')} ${legible(b, 8)}`; firmas[k] = (firmas[k] || 0) + 1; }
  }
  console.log('-- la suite reconoce');
  console.log(`  paquetes ${JSON.stringify(rec.paquetes)}, identicos al reescribir ${rec.identicos}, archivos adentro ${rec.adentro} ${JSON.stringify(adentro)}`);
  console.log(`  .PTX ${rec.ptxBien} abiertos de ${rec.ptx}; .STF ${rec.stf}`);
  rec.otrosPaquete.slice(0, 6).forEach(x => console.log('  sin abrir: ' + x));
  console.log('-- sin reconocer (extension, firma, cuantos)');
  Object.entries(firmas).sort((a, c) => c[1] - a[1]).slice(0, 16).forEach(([k, v]) => console.log(`  ${v}  ${k}`));
  im.cerrar();
}
