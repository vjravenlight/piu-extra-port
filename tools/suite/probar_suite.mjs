// Prueba de la suite contra discos reales. Solo lee los discos; no escribe nada.
//   node tools\suite\probar_suite.mjs [imagen.bin ...]
// 1) Abre cada paquete y lo vuelve a escribir: tiene que salir identico, byte por byte.
// 2) Le cambia un archivo y le agrega otro: lo tiene que entender el lector del motor del port (mismo que el exe).
// 3) .AUD y .PNZ de Extra: descifrar da la suma del encabezado, y cifrar devuelve el mismo archivo.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirPaquete, escribirPaquete, ponerArchivo, detectar, descifrarAudPnz, cifrarAudPnz, sacarArchivo, paqueteNuevo } from '../../app/suite/paquetes.js';
import { abrirRes } from '../../app/motor/andamiro.js';
import { abrirPaquete as abrirMotor } from '../../app/motor/cifrados.js';
import { abrirImagen } from './imagen_cd.mjs';
import { leerStf, escribirStf } from '../../app/suite/pasos_stf.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const igual = (a, b) => a.length === b.length && Buffer.compare(a, b) === 0;
const todos = (d, re, o = []) => { for (const n of readdirSync(d)) { const r = join(d, n); if (statSync(r).isDirectory()) todos(r, re, o); else if (re.test(n)) o.push(r); } return o; };
let fallas = 0;
const falla = (s) => { fallas++; if (fallas <= 25) console.log('  FALLA ' + s); };

function probarPaquetes(titulo, items) {
  const cuenta = {}; let rellenos = 0, compartidos = 0, raros = 0, archivos = 0, cambio = 0, otros = 0;
  for (const { nombre, bytes } of items) {
    const tipo = detectar(bytes);
    if (!tipo) { otros++; continue; }
    const c = (cuenta[tipo] ||= { paquetes: 0, identicos: 0 });
    c.paquetes++;
    let p;
    try { p = abrirPaquete(bytes); } catch (e) { falla(`${nombre}: ${e.message}`); continue; }
    archivos += p.archivos.length; raros += p.raros.length;
    if (p.raros.length) p.raros.slice(0, 2).forEach(r => console.log(`  raro ${nombre}: ${r}`));
    rellenos += p.archivos.filter(a => a.relleno && a.relleno.length).length + (p.antes.length ? 1 : 0);
    compartidos += p.archivos.filter(a => a.mismoLugarQue).length;
    for (const a of p.archivos) if (a.nombre && a.suma !== null && a.suma !== adlerDe(a.datos)) falla(`${nombre}:${a.nombre} suma mal`);
    const s = escribirPaquete(p);
    if (igual(Buffer.from(s), bytes)) c.identicos++;
    else {
      let i = 0; const lim = Math.min(s.length, bytes.length); while (i < lim && s[i] === bytes[i]) i++;
      falla(`${nombre} (${tipo}) distinto en el byte ${i} de ${bytes.length}, salio de ${s.length}`);
    }
    // Cambiar y agregar: tiene que leerlo el motor.
    const q = abrirPaquete(bytes);
    if (!q.archivos.length) continue;
    const victima = q.archivos.find(a => a.nombre && a.tam > 0);
    if (!victima) continue;
    const nuevo = new Uint8Array(1000).map((_, i) => (i * 7) & 255), extra = new Uint8Array([1, 2, 3, 4, 5]);
    ponerArchivo(q, victima.nombre, nuevo); ponerArchivo(q, 'SUITE.TXT', extra);
    const sal = escribirPaquete(q), r = abrirPaquete(sal);
    const ver = (n) => r.archivos.find(a => a.nombre.toLowerCase() === n.toLowerCase());
    if (!ver(victima.nombre) || !igual(Buffer.from(ver(victima.nombre).datos), Buffer.from(nuevo))) { falla(`${nombre}: no quedo el archivo cambiado`); continue; }
    if (!ver('SUITE.TXT') || !igual(Buffer.from(ver('SUITE.TXT').datos), Buffer.from(extra))) { falla(`${nombre}: no quedo el agregado`); continue; }
    for (const a of p.archivos) { if (!a.nombre || a.nombre.toLowerCase() === victima.nombre.toLowerCase()) continue; const b = ver(a.nombre); if (!b || !igual(Buffer.from(b.datos), Buffer.from(a.datos))) { falla(`${nombre}: se rompio ${a.nombre}`); break; } }
    if (tipo === 'RES2') {
      const m = abrirRes(sal);
      if (m.archivos.length !== q.archivos.length) falla(`${nombre}: el motor ve ${m.archivos.length}`);
      const malos = m.archivos.filter(a => a.nombre && a.sumaOk === false).length;
      if (malos) falla(`${nombre}: el motor ve ${malos} sumas mal`);
    }
    if (tipo === 'F2' || tipo === 'RES2') {
      const m = abrirMotor(sal), e = m.archivos.find(a => a.nombre === 'SUITE.TXT');
      if (!e || !igual(Buffer.from(e.datos()), Buffer.from(extra))) falla(`${nombre}: cifrados.js no lee el agregado`);
    }
    cambio++;
  }
  console.log(`\n== ${titulo}`);
  for (const [t, c] of Object.entries(cuenta)) console.log(`  ${t}: ${c.identicos} de ${c.paquetes} identicos`);
  console.log(`  archivos adentro ${archivos}; entradas compartidas ${compartidos}; con relleno ${rellenos}; raros ${raros}; cambiar y agregar bien ${cambio}; sin firma de paquete ${otros}`);
}
let adlerDe; { const m = await import('../../app/suite/paquetes.js'); adlerDe = m.adler32; }

// --- Extra
const dirBga = join(raiz, 'extraido', 'Piu', 'Bga'), dirEmpty = join(raiz, 'extraido', 'empty');
if (existsSync(dirBga)) {
  const rutas = [...todos(dirBga, /\.dat$/i), ...(existsSync(dirEmpty) ? todos(dirEmpty, /\.dat$/i) : [])];
  probarPaquetes('Extra: paquetes', rutas.map(r => ({ nombre: r.slice(raiz.length + 1), bytes: readFileSync(r) })));

  // --- .AUD y .PNZ: la llave del exe es la de tools rotada 518 (CABINA 4.1). Se prueban los dos sentidos.
  const base = readFileSync(join(raiz, 'tools', 'llave_audio_1024.bin'));
  const giro = (g) => { const o = new Uint8Array(1024); for (let i = 0; i < 1024; i++) o[i] = base[(i + g) & 1023]; return o; };
  const muestra = readFileSync(join(raiz, 'extraido', 'Piu', 'Audio', '05.AUD'));
  const llave = [giro(518), giro(1024 - 518), giro(0)].find(k => descifrarAudPnz(muestra, k));
  if (!llave) falla('ninguna rotacion de la llave abre 05.AUD');
  else {
    const rutas2 = [...todos(join(raiz, 'extraido', 'Piu', 'Audio'), /\.aud$/i), ...todos(join(raiz, 'extraido', 'Piu', 'TITLE'), /\.pnz$/i)];
    let bien = 0, mal = 0;
    for (const r of rutas2) {
      const c = readFileSync(r), d = descifrarAudPnz(c, llave);
      if (!d) { mal++; falla(`${r.slice(raiz.length + 1)}: la suma no da`); continue; }
      if (igual(Buffer.from(cifrarAudPnz(d, llave)), c)) bien++; else { mal++; falla(`${r.slice(raiz.length + 1)}: al cifrar sale otro`); }
    }
    console.log(`\n== Extra: .AUD y .PNZ\n  ${bien} de ${rutas2.length} identicos al volver a cifrar; ${mal} mal`);
  }
}

// --- Paquete nuevo desde cero
{
  for (const t of ['RES1', 'RES2', 'RES3', 'RES4']) {
    const p = paqueteNuevo(t); ponerArchivo(p, 'HOLA.SPR', new Uint8Array([84, 89, 80, 69])); ponerArchivo(p, 'CHAU.PNG', new Uint8Array(300).fill(9));
    const b = escribirPaquete(p), r = abrirPaquete(b);
    const ok = r.formato === t && r.archivos.length === 2 && r.archivos[1].datos.length === 300 && r.archivos[1].datos[299] === 9;
    const extra = t === 'RES2' ? abrirRes(b).archivos.length === 2 : true;
    if (!ok || !extra) falla('paquete nuevo ' + t);
    sacarArchivo(p, 'hola.spr');
    if (abrirPaquete(escribirPaquete(p)).archivos.length !== 1) falla('sacar archivo ' + t);
  }
  console.log('\n== Paquete nuevo RES1 a RES4: armado');
}

// --- Otras versiones, de imagen de CD
for (const bin of process.argv.slice(2)) {
  const im = abrirImagen(bin);
  console.log(`\n== Imagen ${bin}\n  fecha ${im.fecha.slice(0, 8)}, ${im.pistas.length} pistas, ${im.archivos.length} archivos`);
  const items = im.archivos.filter(f => /\.(RES|DAT)$/i.test(f.ruta) && !/^\/AUDIO\//i.test(f.ruta)).map(f => ({ nombre: f.ruta, bytes: Buffer.from(im.leer(f)) }));
  probarPaquetes('paquetes', items);
  const stf = im.archivos.filter(f => /\.STF$/i.test(f.ruta));
  let stfBien = 0;
  for (const f of stf) {
    const b = new Uint8Array(im.leer(f));
    try { if (igual(Buffer.from(escribirStf(leerStf(b))), Buffer.from(b))) stfBien++; else falla(`${f.ruta}: distinto`); } catch (e) { falla(`${f.ruta}: ${e.message}`); }
  }
  if (stf.length) console.log(`\n== pasos .STF\n  ${stfBien} de ${stf.length} identicos`);
  // .PNZ y .AUD de PC. Las llaves salen de los exe descomprimidos (nunca van en el codigo): PIU_EXES = carpeta.
  if (process.env.PIU_EXES) {
    const m = await import('../../app/suite/paquetes.js');
    const llaveDe = (arch, a) => readFileSync(join(process.env.PIU_EXES, arch)).subarray(a, a + 1024);
    const lp = llaveDe('prex.abierto.bin', 0x43758), lb = llaveDe('banya.abierto.bin', 0x2a110);
    const cifr = im.archivos.filter(f => /\.(PNZ|AUD)$/i.test(f.ruta));
    let iguales = 0, pngs = 0, mp3s = 0;
    for (const f of cifr) {
      const c = new Uint8Array(im.leer(f));
      if (m.esEnc1(c)) {
        const r = m.descifrarEnc1(c, lp);
        if (!r) { falla(`${f.ruta}: ENC1 no abre`); continue; }
        if (r.datos[0] === 0x89) pngs++; else mp3s++;
        if (igual(Buffer.from(m.cifrarEnc1(r.datos, lp, r.cabecera, r.cola)), Buffer.from(c))) iguales++; else falla(`${f.ruta}: ENC1 distinto`);
      } else {
        const d = m.descifrarAudPnz(c, lb);
        if (!d) { falla(`${f.ruta}: no abre`); continue; }
        if (d[0] === 0x89) pngs++; else mp3s++;
        if (igual(Buffer.from(m.cifrarAudPnz(d, lb)), Buffer.from(c))) iguales++; else falla(`${f.ruta}: distinto`);
      }
    }
    if (cifr.length) console.log(`\n== .PNZ y .AUD\n  ${iguales} de ${cifr.length} identicos al volver a cifrar; ${pngs} PNG, ${mp3s} MP3`);
  }
  im.cerrar();
}
console.log(fallas ? `\nFALLAS: ${fallas}` : '\nTodo bien.');
process.exit(fallas ? 1 : 0);
