// Arranca Piu.exe traducido desde su punto de entrada (en Node, sin pantalla) y muestra hasta donde llega:
// llamadas a DOS/DPMI, archivos abiertos, puertos y la primera funcion que falte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const imp = (p) => import(pathToFileURL(path.join(base, p)).href);
const C = await imp('app/port/cpu.js');
await imp('app/port/traducido.js');
// PIU_SIN_HLE_PNG=1: descomprimir los PNG con zlib/libpng traducidos (para comparar con app\port\zlib_hle.js)
if (!process.env.PIU_SIN_HLE_PNG) await imp('app/port/zlib_hle.js');
const S = await imp('app/port/sistema.js');
const vol = path.join(base, 'investigacion', 'volcados');
C.cargar(0x20000, fs.readFileSync(path.join(vol, 'codigo_0x20000.bin')));
C.cargar(0x130000, fs.readFileSync(path.join(vol, 'datos_0x130000.bin')));
(await imp('app/port/arreglos.js')).aplicarArreglos();

// archivos: rutas de DOS relativas a la carpeta PIU del disco, sin distinguir mayusculas
const raiz = path.join(base, 'extraido', 'Piu');
const indice = new Map();
(function recorrer(d, rel) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '\\' + e.name : e.name; if (e.isDirectory()) recorrer(path.join(d, e.name), r); else indice.set(r.toLowerCase(), path.join(d, e.name)); } })(raiz, '');
S.fijarLectorDeArchivos((ruta) => {
  let r = ruta.replace(/\//g, '\\').replace(/^[a-z]:\\/i, '').replace(/^\.\\/, '').replace(/^piu\\/i, '').toLowerCase();
  // PIU_CON_TODO=1: la lista con todo (F7 en el port)
  if (r === 'game.cfg' && process.env.PIU_CON_TODO) return new Uint8Array(fs.readFileSync(path.join(base, 'app', 'port', 'game_con_todo.cfg')));
  // PIU_PASOS="15_h1.not=C:\...\otro.not": esos pasos en vez de los del disco (para probar lo que escribe el editor)
  for (const s of (process.env.PIU_PASOS || '').split(';').filter(Boolean)) { const [n, f] = s.split('='); if (r === 'step\\' + n.toLowerCase()) return new Uint8Array(fs.readFileSync(f)); }
  const p = indice.get(r); return p ? new Uint8Array(fs.readFileSync(p)) : null;
});

// "PSP" de DOS en la direccion 0: linea de comandos vacia; entorno en 0x1000
C.M8.fill(0, 0, 0x2000);
C.w16(0x2C, 0x100);                     // segmento del entorno -> 0x1000
const entorno = 'PATH=C:\\\0DOS4G=QUIET\0FX_GLIDE_NO_SPLASH=1\0\0\x01\0C:\\PIU\\PIU.EXE\0';
for (let i = 0; i < entorno.length; i++) C.M8[0x1000 + i] = entorno.charCodeAt(i);
C.M8[0x80] = 0; C.M8[0x81] = 13;

// OpenGL: un doble que solo cuenta y corta despues de N cuadros; en cada cuadro, 4 tics del reloj de 240 Hz
const G = await imp('app/port/gl_hle.js');
const K = await imp('app/port/cabina.js');
const CUADROS = +(process.argv[2] || 120);
class Parar extends Error {}
let sigTex = 1, inicioMusica = -1;
K.musica.arrancar = (b) => { inicioMusica = G.estadoGL.cuadros; console.log(`  [musica] arranca: ${b.length} bytes, empieza con ${[...b.slice(0, 4)].map(v => v.toString(16).padStart(2, '0')).join(' ')}`); };
K.musica.parar = () => { inicioMusica = -1; };
K.musica.segundos = () => inicioMusica < 0 ? -1 : (G.estadoGL.cuadros - inicioMusica) / 60;
K.efectos.tocar = (e, v) => console.log(`  [efecto] #${e} voz ${v} (cuadro ${G.estadoGL.cuadros})`);
let tics = 0;
const seguidorSolo = process.env.PIU_SOLO ? (await imp('app/port/solo.js')).crearSeguidorSolo((m) => console.log(`  [solo] ${JSON.stringify(m)} (cuadro ${G.estadoGL.cuadros})`)) : null;
const guion = (process.argv[3] || '').split(',').filter(Boolean).map(t => { const [d, tecla, dura] = t.split(':'); return { desde: +d, tecla, dura: +(dura || 6) }; });
// PIU_VER="0x307874:4,0x307905:1": variables que se muestran en cada tecla (direccion:bytes)
const verLista = (process.env.PIU_VER || '').split(',').filter(Boolean).map(s => { const [d, t] = s.split(':'); return [Number(d), +(t || 4)]; });
const verVariables = () => verLista.map(([d, t]) => ` [0x${d.toString(16)}]=${t === 1 ? C.r8(d) : t === 2 ? C.r16(d) : C.r32(d)}`).join('');
// huella de todas las texturas subidas (FNV-1a), para comprobar que un cambio no altera ni un pixel
let huella = 0x811c9dc5 | 0, texturas = 0, bytesTex = 0;
process.on('exit', () => console.log(`texturas: ${texturas} (${bytesTex} bytes), huella 0x${(huella >>> 0).toString(16)}`));
const doble = new Proxy({
  glGenTextures: (n) => Array.from({ length: n }, () => sigTex++),
  glTexImage2D: (...a) => {
    const d = a[8]; texturas++;
    if (d) { bytesTex += d.length; for (let i = 0; i < d.length; i++) huella = Math.imul(huella ^ d[i], 16777619); }
  },
  auxSwapBuffers: () => {
    // guion de teclas: "cuadro:tecla:duracion,..." (por ejemplo "1000:F4:8,1200:KeyS:8")
    for (const p of guion) {
      const c = G.estadoGL.cuadros;
      if (c === p.desde && process.env.PIU_DEPURAR_ENTRADA) {
        K.tecla(p.tecla, true);
        const guard = Int32Array.from(R);
        console.log(`  [depurar] puerto 0x2A8 = 0x${C.IO.inw(0x2a8).toString(16)}`);
        C.llamar(0x3a16c, 0x7ffffff0);
        console.log(`  [depurar] tras 0x3a16c: [0x307920]=0x${(C.r32(0x307920) >>> 0).toString(16)} [0x307922]=0x${C.r8(0x307922).toString(16)} [0x1ca6b0]=0x${(C.r32(0x1ca6b0) >>> 0).toString(16)} [0x1ca6a8]=0x${(C.r32(0x1ca6a8) >>> 0).toString(16)}`);
        R.set(guard);
      }
      if (c === p.desde) { K.tecla(p.tecla, true); console.log(`  [tecla] ${p.tecla} abajo (cuadro ${c}) · monedas [0x1ca6c0]=${C.r32(0x1ca6c0)} apretado [0x1ca6b0]=0x${(C.r32(0x1ca6b0) >>> 0).toString(16)} estado 0x${(C.r32(0x1ca6a0) >>> 0).toString(16)}${verVariables()}`); }
      if (c === p.desde + p.dura) { K.tecla(p.tecla, false); console.log(`  [tecla] ${p.tecla} arriba · monedas ${C.r32(0x1ca6c0)} apretado 0x${(C.r32(0x1ca6b0) >>> 0).toString(16)} antirrebote [0x13beec]=${C.r32(0x13beec)}`); }
    }
    // PIU_PONER="cuadro:dir:valor:bytes,...": escribe en la memoria en ese cuadro (p. ej. "2400:0x307904:1:1" =
    // modo libre: la canción termina sin CLEAR/FAIL y pasa al puntaje y a NEXT STAGE)
    for (const s of (process.env.PIU_PONER || '').split(',').filter(Boolean)) {
      const [c, d, v, t] = s.split(':').map(Number);
      if (G.estadoGL.cuadros === c) { (t === 1 ? C.w8 : t === 2 ? C.w16 : C.w32)(d, v); console.log(`  [poner] [0x${d.toString(16)}] = ${v} (cuadro ${c})`); }
    }
    // PIU_ESTADOS=1: anotar cada cambio de estado del juego [0x1ca6a0] y sus subestados
    if (process.env.PIU_ESTADOS) {
      const e = `${C.r32(0x1ca6a0)}/${C.r32(0x1cfb24)}/${C.r32(0x2afd18)}`;
      if (e !== globalThis.__estado) { console.log(`  [estado] ${e} (estado/sub juego/sub seleccion) cuadro ${G.estadoGL.cuadros}`); globalThis.__estado = e; }
    }
    // PIU_SOLO=1: lo que el modo solo le avisaria al ranking (app\port\solo.js), en cada cuadro como en el navegador
    if (seguidorSolo) seguidorSolo.seguir();
    // PIU_SIN_CORTE=1: lo mismo que el port en el online (trabajador.js): MISS seguidos frenados en 40, sin HEY MAN
    if (process.env.PIU_SIN_CORTE) for (const p of [0x1CFB7C, 0x1CFBA5]) if (C.r16(p + 0x18) > 40) C.w16(p + 0x18, 40);
    for (let i = 0; i < 4; i++) if (K.tic()) tics++;
    if (G.estadoGL.cuadros % 60 === 0) { const t = performance.now(); console.log(`  cuadro ${G.estadoGL.cuadros}: ${((t - (globalThis.__ult || t)) / 60).toFixed(1)} ms por cuadro, tics ${tics}, luces 0x${K.luces.a4.toString(16)}/0x${K.luces.a6.toString(16)}, texturas subidas ${texturas - (globalThis.__tex || 0)} (${((bytesTex - (globalThis.__btex || 0)) / 1048576).toFixed(1)} MB)`); globalThis.__ult = t; globalThis.__tex = texturas; globalThis.__btex = bytesTex; }
    if (G.estadoGL.cuadros >= CUADROS) throw new Parar('se dibujaron ' + CUADROS + ' cuadros');
  },
}, { get: (o, k) => (k in o ? o[k] : () => {}) });
G.estadoGL.contar = true;      // aca si: el resumen del final dice cuantas llamadas hubo a cada funcion de OpenGL
G.instalarGL(doble);
// PIU_RUN="60 NORMAL": como el online, en vez del logo arranca esa cancion directo (para medir una cancion sola)
if (process.env.PIU_RUN) {
  const [n, modo] = process.env.PIU_RUN.split(' '), nn = n.padStart(2, '0');
  const suf = { NORMAL: 'n1', HARD: 'h1', CRAZY: 'x1', DOUBLE: 'db' }[modo], bandera = { NORMAL: 0x10, HARD: 0x20, CRAZY: 0x400, DOUBLE: 0x80 }[modo];
  let hecho = false;
  C.HLE[0x3B064] = () => {
    if (hecho) { C.FN[0x3B064](); return -4; }
    hecho = true;
    const g = Int32Array.from(C.R), cmd = `run ${nn}_${suf}.not ${modo === 'DOUBLE' ? '-D' : '-S'} ${nn}.dat`;
    C.w32(0x1CFB08, 1 | bandera); C.w32(0x1CA6D0, 1200); C.w32(0x2B3A68, +n);
    for (let i = 0; i < cmd.length; i++) C.w8(0x2AFCD8 + i, cmd.charCodeAt(i)); C.w8(0x2AFCD8 + cmd.length, 0);
    C.R[C.EAX] = 0x2AFCD8; C.llamar(0x35FB8, 0); C.R.set(g);
    return 0;
  };
}
const { R, ESP } = C;
// cuenta de llamadas a DOS por funcion (AH) y tamanos de lectura
const intOriginal = C.IO.int, cuentaDos = new Map();
let pilaHora = 0;
C.IO.int = (n) => { if (n === 0x21 && ((R[0] >> 8) & 0xFF) === 0x2c && pilaHora++ === 5000) console.log('pila de la hora: ' + new Error().stack.split('\n').filter(l => /f_[0-9a-f]+/.test(l)).slice(0, 6).map(l => l.trim().split(' ')[1]).join(' < ')); const k = n === 0x21 ? 'dos ' + ((R[0] >> 8) & 0xFF).toString(16) + (((R[0] >> 8) & 0xFF) === 0x3f ? ' n=' + Math.min(R[1] >>> 0, 99999) : '') : 'int ' + n.toString(16); cuentaDos.set(k, (cuentaDos.get(k) || 0) + 1); return intOriginal(n); };
process.on('exit', () => console.log('DOS: ' + [...cuentaDos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} x${v}`).join(' | ')));
R[ESP] = S.ARRANQUE.esp;
const puertos = new Map();
// contar los accesos a puertos sin reemplazar la cabina simulada
const contar = (k) => puertos.set(k, (puertos.get(k) || 0) + 1);
for (const [nombre, et] of [['inb', 'in '], ['inw', 'inw '], ['outb', 'out '], ['outw', 'outw ']]) {
  const orig = C.IO[nombre];
  C.IO[nombre] = (p, v) => { contar(et + p.toString(16)); return orig(p, v); };
}
// PIU_MEDIR="0x3eb30,0x338bc": cuantas veces se llama cada funcion y cuanto tarda (tiempo inclusivo)
const medidas = new Map();
for (const d of (process.env.PIU_MEDIR || '').split(',').filter(Boolean).map(Number)) {
  const orig = C.FN[d];
  if (!orig) { console.log('PIU_MEDIR: no existe la funcion 0x' + d.toString(16)); continue; }
  const m = { n: 0, ms: 0, prof: 0 };
  medidas.set(d, m);
  C.FN[d] = () => { m.n++; if (m.prof++) { try { return orig(); } finally { m.prof--; } } const t = performance.now(); try { return orig(); } finally { m.ms += performance.now() - t; m.prof--; } };
}
process.on('exit', () => { for (const [d, m] of medidas) console.log(`medir 0x${d.toString(16)}: ${m.n} llamadas, ${m.ms.toFixed(0)} ms`); });
const t0 = Date.now();
let fin = '';
try { C.FN[S.ARRANQUE.eip](); fin = 'la entrada volvio'; }
catch (e) {
  fin = (e instanceof S.SalidaDelPrograma || e instanceof Parar) ? e.message : 'ERROR: ' + e.message;
  if (!(e instanceof Parar)) console.log((e.stack || '').split('\n').filter(l => /f_[0-9a-f]+|Error/.test(l)).slice(0, 14).map(l => l.replace(/\(file:.*\)/, '').trim()).join('\n'));
}
console.log('OpenGL: ' + G.estadoGL.cuadros + ' cuadros; llamadas: ' + [...G.estadoGL.llamadas.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' | '));
console.log(`--- ${fin} (${((Date.now() - t0) / 1000).toFixed(2)} s, ${C.traza.llamadas} llamadas) ---`);
console.log('archivos abiertos y musica:\n  ' + S.registro.filter(s => /abrir|musica|efecto|pantalla/.test(s)).join('\n  '));
console.log('ultimas llamadas al sistema:\n  ' + S.registro.slice(-8).join('\n  '));
console.log('estado del juego [0x1ca6a0] = 0x' + (C.r32(0x1ca6a0) >>> 0).toString(16));
if (S.salida.texto) console.log('texto en pantalla: ' + JSON.stringify(S.salida.texto.slice(-500)));
if (puertos.size) console.log('puertos: ' + [...puertos.entries()].map(([k, v]) => `${k}x${v}`).join(' '));
if (S.vectores.size) console.log('vectores instalados: ' + [...S.vectores.entries()].map(([k, v]) => `0x${k.toString(16)}->0x${v.toString(16)}`).join(' '));
console.log(`registros: EAX=0x${(R[0] >>> 0).toString(16)} ECX=0x${(R[1] >>> 0).toString(16)} EDX=0x${(R[2] >>> 0).toString(16)} EBX=0x${(R[3] >>> 0).toString(16)} ESP=0x${(R[4] >>> 0).toString(16)}`);
