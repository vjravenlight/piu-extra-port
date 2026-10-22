// Prueba del motor de Andamiro (app\motor\andamiro.js) con todo lo que trae el disco.
// Uso: node probar_andamiro.mjs        (con el Node de R.A.V.E.N: 4_R.A.V.E.N\raven\runtime\node.exe)
// 1. Paquetes RES de extraido\: los abre como res_open (sumas Adler) y compara cada archivo con descifrado\graficos.
// 2. Todos los .spr y .sp2 de descifrado\graficos (con el tamano real de cada textura).
// 3. Todos los .BGA, con sus sprites, y el estado de cada objeto en varios tiempos.
// 4. Repite el dibujo con las llamadas OpenGL del original sobre un OpenGL de mentira y compara cada vertice con
//    la cuenta directa (matrizObjeto): asi se controla que las dos traducciones dicen lo mismo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..');
const A = await import(pathToFileURL(path.join(raiz, 'app', 'motor', 'andamiro.js')).href);
const graficos = path.join(raiz, 'descifrado', 'graficos');

const errores = [];
const err = (m) => { errores.push(m); };
const cuenta = new Map(); const sumar = (k, n = 1) => cuenta.set(k, (cuenta.get(k) || 0) + n);
function recorrer(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) recorrer(p, out); else out.push(p); } return out; }
const rel = (p) => path.relative(raiz, p);

// carpeta -> { nombreEnMinuscula: ruta }   (el juego busca sin mayusculas, sin recortar espacios)
const carpetas = new Map();
function archivosDe(dir) {
  if (!carpetas.has(dir)) { const m = new Map(); for (const f of fs.readdirSync(dir)) m.set(f.toLowerCase(), path.join(dir, f)); carpetas.set(dir, m); }
  return carpetas.get(dir);
}
const buscar = (dir, nombre) => archivosDe(dir).get(nombre.toLowerCase()) || null;
const infoPng = new Map();
function texturaEn(dir) {
  return (nombre) => {
    for (const n of A.archivosTextura(nombre)) {
      const r = buscar(dir, n); if (!r) continue;
      if (!infoPng.has(r)) {
        const b = fs.readFileSync(r);
        if (b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') { err(`${rel(r)}: no es un PNG`); infoPng.set(r, null); }
        else infoPng.set(r, { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), canales: { 0: 1, 2: 3, 4: 2, 6: 4 }[b[25]] ?? 0 });
      }
      return infoPng.get(r);
    }
    return null;
  };
}

// ---------------------------------------------------------------- 1. paquetes RES
const t0 = Date.now();
let paquetes = 0, archivosRes = 0, iguales = 0;
for (const sub of [path.join('extraido', 'Piu', 'Bga'), path.join('extraido', 'empty')]) {
  const dir = path.join(raiz, sub);
  if (!fs.existsSync(dir)) { err(`falta ${sub}`); continue; }
  for (const f of fs.readdirSync(dir).filter((x) => /\.dat$/i.test(x))) {
    const b = fs.readFileSync(path.join(dir, f));
    if (b.toString('latin1', 0, 4) !== 'RES\0') continue;
    paquetes++;
    let r; try { r = A.abrirRes(b); } catch (e) { err(`${sub}\\${f}: ${e.message}`); continue; }
    if (r.version !== 2) err(`${sub}\\${f}: version ${r.version}`);
    if (!r.datosOk) err(`${sub}\\${f}: Adler de los datos no coincide`);
    if (!r.adlerIndiceOk) err(`${sub}\\${f}: Adler del indice no coincide`);
    if (r.excedeBuffer) err(`${sub}\\${f}: mas de 6 MB de datos (el buffer del juego)`);
    const destino = path.join(graficos, sub.includes('empty') ? 'empty' : 'Bga', f.replace(/\.dat$/i, ''));
    for (const a of r.archivos) {
      archivosRes++;
      if (!a.ok) { err(`${sub}\\${f}: ${a.nombreOriginal} no pasa su Adler`); continue; }
      const otro = buscar(destino, a.nombre);
      if (!otro) { err(`${sub}\\${f}: ${a.nombre} no esta en ${rel(destino)}`); continue; }
      if (Buffer.compare(Buffer.from(r.leer(a.nombre)), fs.readFileSync(otro)) === 0) iguales++;
      else sumar('RES: distinto de lo descifrado (normal en PNG: el extractor les repone la firma)');
    }
  }
}
console.log(`RES: ${paquetes} paquetes, ${archivosRes} archivos, ${iguales} identicos a descifrado\\graficos (${Date.now() - t0} ms)`);

// ---------------------------------------------------------------- 2. sprites
const todos = recorrer(graficos);
const sprites = todos.filter((f) => /\.(spr|sp2)$/i.test(f));
const tipos = new Map(); let piezas = 0; const spritesVacios = [], objetosSinSprite = [];
for (const f of sprites) {
  const dir = path.dirname(f);
  let s; try { s = A.parsearSprite(path.basename(f), fs.readFileSync(f), { textura: texturaEn(dir) }); } catch (e) { err(`${rel(f)}: ${e.message}`); continue; }
  // lineas T y cuantas tienen su textura en el paquete (las otras el juego tambien las saltea en los .spr)
  const lineas = fs.readFileSync(f, 'latin1').split(/\r?\n/).map((l) => l.trim().split(/[ \t]+/)).filter((t) => /^T$/i.test(t[0]));
  const conTextura = lineas.filter((t) => texturaEn(dir)(/\.sp2$/i.test(f) ? t[2] : t[1])).length;
  const esperado = /\.sp2$/i.test(f) ? lineas.length : conTextura;
  if (s.num !== esperado) err(`${rel(f)}: ${s.num} piezas, se esperaban ${esperado} (${lineas.length} lineas T)`);
  if (conTextura < lineas.length) {
    sumar('sprites con alguna textura que no esta en su paquete');
    if (/\.sp2$/i.test(f)) sumar('piezas de .sp2 sin textura (la cabina las dibuja con la textura -1)', lineas.length - conTextura);
    else sumar('lineas T de .spr salteadas por eso (la cabina tambien las saltea)', lineas.length - conTextura);
  }
  if (!s.ok) { sumar('sprites que quedan sin piezas por eso'); spritesVacios.push(rel(f)); }
  if (s.num > A.LIMITES.PIEZAS) err(`${rel(f)}: ${s.num} piezas (mas de 80)`);
  for (const av of s.avisos) sumar('aviso de sprite: ' + av.replace(/^pieza \d+: /, '').replace(/textura \S+/, 'textura X').replace(/ de \d+x\d+/, ' de NxN'));
  for (let i = 0; i < s.num; i++) {
    const p = s.piezas[i];
    for (const k of ['u0', 'v0', 'u1', 'v1']) if (!Number.isFinite(p[k])) err(`${rel(f)}: pieza ${i} ${k} no es un numero`);
    if (p.x1 < p.x0 || p.y1 < p.y0) sumar('pieza con ancho o alto negativo');
  }
  piezas += s.num;
  const k = ['NINGUNO', 'TILE', 'ANI', 'PATTERN'][s.tipo] + ' ' + s.formato; tipos.set(k, (tipos.get(k) || 0) + 1);
}
console.log(`Sprites: ${sprites.length} archivos, ${piezas} piezas; tipos: ${[...tipos].map(([k, v]) => `${k}=${v}`).join(', ')}`);

// ---------------------------------------------------------------- 3 y 4. guiones BGA
// OpenGL de mentira: guarda la matriz como en OpenGL 1.x y transforma cada glVertex2i.
class GLFalso {
  constructor() { this.pila = [[1, 0, 0, 1, 0, 0]]; this.quads = []; this.tc = [0, 0]; this.col = null; this.tex = 0; this.v = []; }
  get m() { return this.pila[this.pila.length - 1]; }
  mul(n) { const [a, b, c, d, e, f] = this.m; this.pila[this.pila.length - 1] = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f]; }
  glPushMatrix() { this.pila.push([...this.m]); }
  glPopMatrix() { if (this.pila.length < 2) throw new Error('pila vacia'); this.pila.pop(); }
  glTranslatef(x, y, z) { if (z) throw new Error('z'); this.mul([1, 0, 0, 1, x, y]); }
  glScalef(x, y, z) { if (z !== 1) throw new Error('escala z'); this.mul([x, 0, 0, y, 0, 0]); }
  glRotatef(g, x, y, z) { if (x || y || z !== 1) throw new Error('eje'); const r = g * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); this.mul([c, s, -s, c, 0, 0]); }
  glColor4fv(v) { this.col = [...v]; }
  glBindTexture(o, id) { this.tex = id; }
  glBegin(p) { if (p !== 7) throw new Error('no es GL_QUADS'); this.v = []; }
  glTexCoord2f(s, t) { this.tc = [s, t]; }
  glVertex2i(x, y) { const [a, b, c, d, e, f] = this.m; this.v.push([a * x + c * y + e, A.ALTO - (b * x + d * y + f), this.tc[0], this.tc[1]]); }
  glEnd() { if (this.v.length !== 4) throw new Error('quad de ' + this.v.length); this.quads.push({ puntos: this.v, color: this.col, tex: this.tex }); }
}

const bgas = todos.filter((f) => /\.bga$/i.test(f));
let objetosUsados = 0, clavesTot = 0, quadsTot = 0, comparados = 0, maxDif = 0;
for (const f of bgas) {
  const dir = path.dirname(f);
  const textura = texturaEn(dir);
  const leer = (n) => { const r = buscar(dir, n); return r ? fs.readFileSync(r) : null; };
  let bga; try { bga = A.armarBga(fs.readFileSync(f), { leer, textura }); } catch (e) { err(`${rel(f)}: ${e.message}`); continue; }
  if (!bga.firmaOk) err(`${rel(f)}: no empieza con BGA\\0`);
  if (bga.bytesSobrantes !== 0) err(`${rel(f)}: sobran ${bga.bytesSobrantes} bytes despues de los 50 objetos`);
  for (const av of bga.avisos) sumar('aviso de BGA: ' + av.replace(/^objeto \d+ \([^)]*\): \d+ claves, \d+ pasan/, 'objeto con mas de 300 claves: las sobrantes pasan'));
  let fin = 0;
  for (const o of bga.objetos) {
    if (!o.nclaves) continue;
    objetosUsados++; clavesTot += o.nclaves;
    for (let k = 1; k < Math.min(o.nclaves, A.LIMITES.CLAVES); k++) if (o.claves[k].tiempo <= o.claves[k - 1].tiempo) err(`${rel(f)}: objeto ${o.indice}, tiempos fuera de orden en la clave ${k}`);
    fin = Math.max(fin, o.claves[Math.min(o.nclaves, A.LIMITES.CLAVES) - 1].tiempo);
    if (!o.datosSprite || !o.datosSprite.ok) {
      const motivo = !o.sprite ? 'sin nombre' : !/\.(spr|sp2|tga)$/i.test(o.sprite) ? `con nombre raro ${JSON.stringify(o.sprite)}` : 'que no carga';
      sumar(`objeto con claves y sprite ${motivo} (tampoco se ve en la cabina)`);
      if (o.sprite) objetosSinSprite.push(`${rel(f)} objeto ${o.indice} ${JSON.stringify(o.sprite)}`);
    }
  }
  // estado en varios tiempos + comparacion con el dibujo OpenGL
  const tiempos = [0, 1, 30, 60, 120, 600, 1200, 2400, 3600, 4800, Math.floor(fin / 2), fin - 1, fin, fin + 1];
  for (let i = 0; i < 40; i++) tiempos.push(Math.floor((fin + 60) * i / 40));
  for (const t of tiempos) {
    const q = A.quadsBga(bga, t);
    for (const x of q) for (const p of x.puntos) if (!p.every(Number.isFinite)) err(`${rel(f)}: t=${t} vertice no numerico`);
    const gl = new GLFalso();
    const idGL = (p) => p.textura;
    try { A.dibujarBga(gl, bga, t, idGL); } catch (e) { err(`${rel(f)}: dibujarBga t=${t}: ${e.message}`); continue; }
    if (gl.pila.length !== 1) err(`${rel(f)}: t=${t} la pila de matrices no vuelve a 1`);
    if (gl.quads.length !== q.length) { err(`${rel(f)}: t=${t} ${gl.quads.length} quads con OpenGL y ${q.length} con la cuenta`); continue; }
    quadsTot += q.length;
    for (let i = 0; i < q.length; i++) {
      if (gl.quads[i].tex !== q[i].textura) err(`${rel(f)}: t=${t} quad ${i} textura distinta`);
      for (let k = 0; k < 4; k++) for (let c = 0; c < 4; c++) {
        const d = Math.abs(gl.quads[i].puntos[k][c] - q[i].puntos[k][c]); comparados++;
        if (d > maxDif) maxDif = d;
        if (d > 1e-3 * Math.max(1, Math.abs(q[i].puntos[k][c]))) err(`${rel(f)}: t=${t} quad ${i} vertice ${k} difiere en ${d}`);
      }
      for (let c = 0; c < 4; c++) if (gl.quads[i].color[c] !== q[i].color[c]) err(`${rel(f)}: t=${t} quad ${i} color distinto`);
    }
  }
}
console.log(`BGA: ${bgas.length} guiones, ${objetosUsados} objetos con claves, ${clavesTot} claves; ${quadsTot} quads dibujados en las pruebas, ${comparados} coordenadas comparadas (dif. maxima ${maxDif.toExponential(2)})`);

// ---------------------------------------------------------------- 5. casos puntuales confirmados en el codigo
{
  const spr = A.parsearSprite('x.spr', 'TYPE TILE\r\nNUM 1\r\nT andamiro.tga 62 265 184 24 0 152 184 176\r\n', { textura: () => ({ ancho: 256, alto: 256 }) });
  const p = spr.piezas[0];
  if (!(p.x0 === 62 && p.y0 === 265 && p.x1 === 246 && p.y1 === 289 && p.u0 === 0 && p.v0 === 152 / 256 && p.u1 === 184 / 256 && p.v1 === 176 / 256)) err('caso .spr: las uv no son esquina/256');
  const s2 = A.parsearSprite('x.sp2', 'TYPE TILE\r\nNUM 1\r\nT ti5 bg15.tga 0 0 128 224 128 0 128 224\r\n');
  const q = s2.piezas[0];
  if (!(q.u0 === 0.5 && q.u1 === 1 && q.v1 === 224 / 256 && q.x1 === 128 && q.nombre === 'ti5')) err('caso .sp2: uv = (s, s+ancho)/256');
  const pat = A.parsearSprite('p.spr', 'TYPE PATTERN 1 4 3\r\nNUM 2\r\nT a.tga 0 0 10 20 0 0 10 20\r\nT b.tga 0 0 10 20 0 0 10 20\r\n');
  const cel = A.piezasDeSprite(pat, 0.25);                // corrimiento = trunc(2 * 0.75) = 1
  if (cel.length !== 12 || cel[0].textura !== 1 || cel[1].textura !== 0 || cel[1].dy !== 20 || cel[3].dx !== 10) err('caso PATTERN por columnas');
  const ani = A.parsearSprite('a.spr', 'TYPE ANI\r\nNUM 4\r\n' + 'T a.tga 0 0 1 1 0 0 1 1\r\n'.repeat(4));
  if (A.piezasDeSprite(ani, 0.999)[0].textura !== 3 || A.piezasDeSprite(ani, 0.5)[0].textura !== 2 || A.piezasDeSprite(ani, 0)[0].textura !== 0) err('caso ANI');
  if (A.ticBgaCancion(963) !== 240 || A.ticBgaCancion(-5) !== 0 || A.ticBgaCancion(2400, 180, 150) !== 720) err('caso tic de cancion');
  if (A.nombreGuion('BGA\\70.dat') !== '506.BGA' || A.nombreGuion('BGA\\67.dat') !== '67.BGA' || A.nombreGuion('bga\\70.dat') !== '70.BGA') err('caso nombre del guion');
  if (A.atoi('12345678910') !== -539222978 || A.atoi(' -12x') !== -12) err('caso atoi');
}

// ---------------------------------------------------------------- resumen
console.log('');
for (const [k, v] of [...cuenta].sort()) if (v) console.log(`  info (${v}): ${k}`);
console.log(`  sprites sin piezas: ${spritesVacios.slice(0, 8).join(', ')}${spritesVacios.length > 8 ? '...' : ''}`);
console.log(`  objetos de BGA con nombre de sprite que no se dibujan: ${objetosSinSprite.join('; ')}`);
console.log('');
if (errores.length) { console.log(`ERRORES: ${errores.length}`); for (const e of errores.slice(0, 60)) console.log('  ' + e); process.exitCode = 1; }
else console.log('ERRORES: 0');
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
