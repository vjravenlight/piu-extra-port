// Prueba las listas de canciones durante una partida con la rutina real del juego (0x2EEE8, llamada como la llama la
// seleccion) y con app\port\listas.js. Corre sobre todas las listas que usa el juego y en cada modo:
//   TODO DESBLOQUEADO: despues de jugar, TODAS las listas tienen que quedar exactamente iguales.
//   reglas de la cabina: sale solo la cancion jugada de ese modo, y las demas listas no se tocan (salvo la oculta de XX).
// Hace falta el disco (volcados y traducido.js): no anda en una copia de GitHub sin preparar.
// Uso: node tools\probar_listas.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (r) => pathToFileURL(path.join(raiz, r)).href;
const C = await import(url('app/port/cpu.js'));
await import(url('app/port/traducido.js'));
const { instalarListas } = await import(url('app/port/listas.js'));
C.cargar(0x20000, fs.readFileSync(path.join(raiz, 'investigacion/volcados/codigo_0x20000.bin')));
C.cargar(0x130000, fs.readFileSync(path.join(raiz, 'investigacion/volcados/datos_0x130000.bin')));

const MODOS = ['NORMAL', 'HARD', 'XX', 'DOUBLE', 'REMIX', 'BATTLE'];
const SONG = 0x2B3600, NIVEL = 0x2B372C, MARCA = 0x2B3858, CANT = 0x2B3984;
function cargar(texto, ocultas) {
  const n = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 300; i++) { C.w8(SONG + i, 0); C.w8(NIVEL + i, 0); C.w8(MARCA + i, 0); }
  let m = -1;
  const poner = (c, ni, ma) => { const i = n[m]++; C.w8(SONG + 50 * m + i, c); C.w8(NIVEL + 50 * m + i, ni); C.w8(MARCA + 50 * m + i, ma); };
  for (const l of texto.split(/\r?\n/)) {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'MODENAME') { m = MODOS.indexOf(p[1]); if (m === 2 && ocultas) for (const [c, ni] of [[7, 4], [20, 4], [21, 5]]) { poner(c, ni, 0); poner(c, ni, 2); } }
    else if (p[0] === 'SONG' && m >= 0) poner(+p[1], +p[2], +p[3]);
  }
  n.forEach((v, i) => C.w8(CANT + i, v));
}
const lista = (m) => { const o = []; for (let i = 0, n = C.r8(CANT + m); i < n; i++) o.push(`${C.r8(SONG + 50 * m + i)}/${C.r8(NIVEL + 50 * m + i)}/${C.r8(MARCA + 50 * m + i)}`); return o; };
const todas = () => MODOS.map((_, m) => lista(m));
// como la seleccion (0x32F75): modo en EAX, lugar en EDX, y la direccion de vuelta en la pila
function confirmar(m, i, etapa) {
  C.w32(0x1cfb04, etapa);
  C.R[C.ESP] = 0x9F0900; const esp = C.R[C.ESP];
  C.R[C.EAX] = m; C.R[C.EDX] = i;
  C.llamar(0x2EEE8, 0x32F81);
  if (C.R[C.ESP] !== esp) throw new Error(`la pila quedo corrida en ${C.R[C.ESP] - esp} bytes`);
}

let pruebas = 0, errores = 0;
const mal = (s) => { errores++; console.log('  MAL: ' + s); };
for (const f of ['build/web-demo/port/game_demo.cfg', 'app/port/game_con_todo.cfg', 'app/port/game_online.cfg', 'build/web-demo/disco/game.cfg']) {
  const cfg = fs.readFileSync(path.join(raiz, f), 'latin1');
  console.log(f);
  // TODO DESBLOQUEADO: en cada modo y en cada lugar, nada cambia
  instalarListas(true);
  cargar(cfg, true);
  const antes = JSON.stringify(todas()), n = todas().map((l) => l.length);
  for (let m = 0; m < 6; m++) for (let i = 0; i < n[m]; i++) {
    confirmar(m, i, (m + i) % 3); pruebas++;
    if (JSON.stringify(todas()) !== antes) { mal(`desbloqueado: cambio una lista al jugar ${MODOS[m]} lugar ${i}`); break; }
    if (C.r32(0x2B398C + 4 * m) !== 0) mal(`desbloqueado: no volvio al primer lugar en ${MODOS[m]}`);
  }
  // reglas de la cabina: una partida de 3 canciones en cada modo y lugar
  instalarListas(false);
  cargar(cfg, false);
  const nc = todas().map((l) => l.length);
  for (let m = 0; m < 6; m++) for (let i = 0; i < nc[m]; i++) {
    cargar(cfg, false);
    const a = todas(), jugada = a[m][i];
    confirmar(m, i, 0); pruebas++;
    const d = todas();
    for (let k = 0; k < 6; k++) {
      if (k === m) continue;
      if (JSON.stringify(a[k]) !== JSON.stringify(d[k])) mal(`cabina: jugar ${MODOS[m]} lugar ${i} rompio ${MODOS[k]}: ${a[k][0]} -> ${d[k][0]}`);
    }
    const esperada = a[m].filter((_, x) => x !== i);
    const quedo = m === 2 ? d[m].slice(0, esperada.length) : d[m];
    if (JSON.stringify(quedo) !== JSON.stringify(esperada)) mal(`cabina: ${MODOS[m]} no saco solo ${jugada}`);
    if (m === 2 && !(d[m].length === esperada.length + 2 && d[m].at(-1).startsWith('7/'))) mal(`cabina: XX no sumo la oculta 7 (${d[m].slice(-2)})`);
  }
}
console.log(`\n${pruebas} canciones confirmadas, ${errores} errores`);
process.exit(errores ? 1 : 0);
