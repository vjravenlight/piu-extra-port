// Prueba de app/motor/f2.js con TODOS los archivos de F2 de descifrado\graficos.
// Uso (con el Node de R.A.V.E.N):  node tools\probar_f2.mjs   [-v para ver cada advertencia]
// 1) Lee cada .vsl, .tc, .ifl, .jtx, .nt, .pix y .rhy y cuenta cuantos se leyeron bien.
// 2) Arma cada escena (carpeta con main.vsl) como el juego y recorre TODOS sus cuadros: que esten los .tc, .ifl e
//    imagenes, que los indices esten dentro de rango, y que el dibujo (con un OpenGL de mentira) no falle.
// No escribe nada en disco. Rutas relativas a esta carpeta.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..', 'descifrado', 'graficos');
const f2 = await import(pathToFileURL(path.join(aqui, '..', 'app', 'motor', 'f2.js')).href);
const detallado = process.argv.includes('-v');

const archivos = [];
(function recorrer(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) recorrer(p); else archivos.push(p);
  }
})(raiz);
const rel = (p) => path.relative(raiz, p);
const latin1 = (b) => Buffer.from(b).toString('latin1');

// ------------------------------------------------------------------ 1) cada archivo por separado
const lectores = {
  '.vsl': (b) => { const v = f2.leerVSL(b); if (v.sobrante) throw new Error(`sobran ${v.sobrante} bytes`); return v; },
  '.tc': (b) => { const t = f2.leerTC(b); if (t.sobrante) throw new Error(`sobran ${t.sobrante} bytes`); return t; },
  '.ifl': (b) => { const l = f2.leerIFL(latin1(b)); if (!l.length) throw new Error('lista vacia'); return l; },
  '.jtx': (b) => f2.leerJTX(b),
  '.nt': (b) => f2.leerNT(b),
  '.pix': (b) => { const r = f2.leerPIX(b); if (!r.recursos.length) throw new Error('sin recursos'); return r; },
  '.rhy': (b) => { const r = f2.leerRHY(b); if (!r.tcs.length) throw new Error('no aparece ningun .tc'); return r; },
};
const cuenta = {};
const vacios = [];
const fallas = [];
for (const p of archivos) {
  const ext = path.extname(p).toLowerCase();
  if (!lectores[ext]) continue;
  const c = (cuenta[ext] ||= { ok: 0, error: 0, vacio: 0 });
  const b = fs.readFileSync(p);
  if (b.length === 0) { c.vacio++; vacios.push(rel(p)); continue; }
  try { lectores[ext](b); c.ok++; } catch (e) { c.error++; fallas.push(`${rel(p)}: ${e.message}`); }
}

// ------------------------------------------------------------------ 2) escenas completas
// OpenGL de mentira: cuenta llamadas y vertices (sirve para verificar que dibujarEscena recorre todo sin fallar).
// Para que la prueba tarde poco, el dibujo completo se hace en 1 de cada CADA cuadros; el estado, en todos.
const CADA = 30;
const falso = { llamadas: 0, vertices: 0, sig: 1, glGenTextures(n, d) { for (let i = 0; i < n; i++) d.push(this.sig++); }, glVertex3f() { this.vertices++; } };
for (const f of ['glDisable', 'glEnable', 'glCullFace', 'glMatrixMode', 'glPushMatrix', 'glPopMatrix', 'glLoadIdentity', 'gluPerspective',
  'gluLookAt', 'glMultMatrixf', 'glColor4fv', 'glMaterialfv', 'glMaterialf', 'glLineWidth', 'glBlendFunc', 'glTexParameteri', 'glTexEnvf',
  'glBindTexture', 'glBegin', 'glEnd', 'glTexCoord2f', 'glPixelStorei', 'glTexImage2D']) falso[f] = function () { this.llamadas++; };

function dimensiones(buf) {
  if (buf[0] === 0x89) { const i = f2.infoPNG(buf); return { ancho: i.ancho, alto: i.alto, info: i }; }
  const b = f2.leerBMP(buf); return { ancho: b.ancho, alto: b.alto, info: { problemas: [] } };
}

// El juego solo carga main.vsl, pero tambien se arman los otros .vsl que quedaron (empty\CONGR).
const escenas = archivos.filter((p) => /\.vsl$/i.test(p));
const resumen = [];
let escenasMal = 0, avisosTotal = 0;
for (const archivoVsl of escenas) {
  const dir = path.dirname(archivoVsl);
  const nombre = /main\.vsl$/i.test(archivoVsl) ? rel(dir) : rel(archivoVsl);
  const enCarpeta = new Map(fs.readdirSync(dir).map((n) => [f2.minusculas(n), path.join(dir, n)]));
  const leer = (n) => { const p = enCarpeta.get(f2.minusculas(n)); return p ? fs.readFileSync(p) : null; };
  const avisos = [];
  try {
    const vsl = f2.leerVSL(fs.readFileSync(archivoVsl));
    if (vsl.declarados >= 100) avisos.push(`declara ${vsl.declarados} .tc (el original lee 99)`);
    const fuente = {
      tc: (n) => { const b = leer(n); if (!b) return null; if (!b.length) throw new Error(`${n} esta vacio en el paquete original`); return b; },
      texto: (n) => { const b = leer(n); return b ? latin1(b) : null; },
    };
    const escena = f2.armarEscena(vsl, fuente);

    // imagenes de cada textura (con las reglas de nombres del juego: primero .png, despues .bmp)
    const imagenes = new Map();
    const imagen = (n) => {
      if (!imagenes.has(n)) {
        const b = leer(n);
        if (!b) { imagenes.set(n, null); return null; }
        const d = dimensiones(b);
        for (const pr of d.info.problemas) avisos.push(`${n}: ${pr}`);
        imagenes.set(n, { ancho: d.ancho, alto: d.alto, rgba: new Uint8Array(d.ancho * d.alto * 4), tieneAlfa: !!d.info.tieneAlfa });
      }
      return imagenes.get(n);
    };
    const ids = f2.crearTexturasGL(falso, escena, imagen);
    // las que el juego tampoco puede cargar: no es error de lectura, el original las dibuja sin textura
    for (const t of escena.texturas) if (t.error) avisos.push(`textura que el original no carga (sale sin textura): ${t.error}`);

    // texturas sin textura (heredan la ultima enlazada), indices fuera de rango, y dibujo de todos los cuadros
    const sinTextura = new Set();
    let fueraTC = 0, sinMatriz = 0, malIndice = 0;
    for (let n = 0; n < vsl.numCuadros; n++) {
      const est = f2.estadoCuadro(escena, n);
      for (const c of est.capas) {
        if (c.error) { malIndice++; continue; }
        if (c.fueraDeTC) fueraTC++;
        for (const o of c.objetos) {
          if (!o.matriz) sinMatriz++;
          for (const g of o.grupos) if (g.textura < 0) sinTextura.add(escena.materiales[g.material].nombre);
        }
      }
      if (n % CADA === 0 || n === vsl.numCuadros - 1) f2.dibujarEscena(falso, escena, n, (i) => ids[i]);
    }
    if (malIndice) avisos.push(`${malIndice} capas apuntan a un .tc que no esta en la lista`);
    if (fueraTC) avisos.push(`${fueraTC} capas piden un cuadro >= numCuadros del .tc (VslView no las dibuja; Piu si)`);
    if (sinMatriz) avisos.push(`${sinMatriz} objetos sin matriz para el cuadro pedido (el original leeria basura)`);
    if (sinTextura.size) avisos.push(`materiales sin textura (se dibujan con la ultima textura enlazada): ${[...sinTextura].join(', ')}`);
    resumen.push({ nombre, cuadros: vsl.numCuadros, seg: (vsl.numCuadros / 60).toFixed(1), tcs: vsl.tcs.length, materiales: escena.materiales.length, slots: escena.slots.length, texturas: escena.texturas.length, avisos });
  } catch (e) {
    escenasMal++;
    resumen.push({ nombre, error: e.message, avisos });
  }
  avisosTotal += avisos.length;
}

// ------------------------------------------------------------------ informe
console.log('Archivos de F2 en descifrado\\graficos');
for (const [ext, c] of Object.entries(cuenta).sort()) console.log(`  ${ext.padEnd(5)} ${String(c.ok).padStart(5)} bien   ${c.error} con error${c.vacio ? `   ${c.vacio} vacios (0 bytes en el paquete original)` : ''}`);
for (const v of vacios) console.log(`    vacio: ${v}`);
for (const f of fallas) console.log(`    ERROR ${f}`);
console.log(`\nEscenas (cada .vsl con su carpeta): ${escenas.length}, ${escenas.length - escenasMal} armadas y recorridas cuadro por cuadro, ${escenasMal} con error`);
for (const r of resumen) {
  if (r.error) { console.log(`  ERROR ${r.nombre}: ${r.error}`); continue; }
  const linea = `  ${r.nombre.padEnd(18)} ${String(r.cuadros).padStart(5)} cuadros (${r.seg} s)  ${String(r.tcs).padStart(2)} tc  ${String(r.materiales).padStart(3)} materiales  ${String(r.slots).padStart(3)} slots  ${String(r.texturas).padStart(3)} texturas`;
  console.log(linea + (r.avisos.length ? `  [${r.avisos.length} aviso${r.avisos.length > 1 ? 's' : ''}]` : ''));
  if (detallado) for (const a of r.avisos) console.log(`      - ${a}`);
}
const errores = Object.values(cuenta).reduce((s, c) => s + c.error, 0) + escenasMal;
console.log(`\nTotal: ${errores} errores, ${vacios.length} archivos vacios del original, ${avisosTotal} avisos (con -v se ven).`);
console.log(`OpenGL de mentira: ${falso.llamadas} llamadas, ${falso.vertices} vertices dibujados.`);
process.exitCode = errores ? 1 : 0;
