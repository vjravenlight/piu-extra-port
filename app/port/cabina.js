// La cabina de Pump It Up Extra simulada (investigacion\CABINA.md, seccion 7): placa de E/S en 0x2A0-0x2AF
// (pads, botones, luces, EEPROM, chip de efectos YMZ280B) y placa de musica MP3 en 0x2D0-0x2DF.
// Se reemplaza solo el hardware; la logica del juego (traducida) ve las mismas variables y bits.
import { R, M, M8, HLE, IO, FN, r32, w32, push, EAX, EDX, EBX, ESP } from './cpu.js';
import { vectores, anotar } from './sistema.js';

// ---------- entradas: teclado -> bits de la placa (activos bajos) ----------
// Orden de la placa (CABINA.md 2.2): bit 0 = arriba-izq, 1 = arriba-der, 2 = centro, 3 = abajo-izq, 4 = abajo-der.
// P1 se lee en 0x2A8 y P2 en 0x2AA, los dos en los bits 0-4. Sin multiplexor: los 4 sensores del panel a la vez.
export const TECLAS = {
  KeyZ: [1, 0x08], KeyQ: [1, 0x01], KeyS: [1, 0x04], KeyE: [1, 0x02], KeyC: [1, 0x10],
  Numpad1: [2, 0x08], Numpad7: [2, 0x01], Numpad5: [2, 0x04], Numpad9: [2, 0x02], Numpad3: [2, 0x10],
};
// botones en 0x2A8: TEST bit 9, COIN bit 10, SERVICE bit 14, CLEAR bit 15 (activos bajos)
export const BOTONES = { F1: 1 << 9, F4: 1 << 10, F2: 1 << 14, F3: 1 << 15 };
export const entradas = { p1: 0, p2: 0, botones: 0 };
export function tecla(code, abajo) {
  if (code in TECLAS) { const [j, b] = TECLAS[code], k = j === 1 ? 'p1' : 'p2'; entradas[k] = abajo ? entradas[k] | b : entradas[k] & ~b; }
  else if (code in BOTONES) entradas.botones = abajo ? entradas.botones | BOTONES[code] : entradas.botones & ~BOTONES[code];
}

// ---------- luces (sombras de 0x2A4 / 0x2A6) ----------
export const luces = { a4: 0, a6: 0, cambios: 0 };

// ---------- puertos ----------
const viejoInw = IO.inw, viejoOutw = IO.outw;
IO.inw = (p) => {
  if (p === 0x2A8) return ~(entradas.p1 | entradas.botones) & 0xFFFF;     // sensores P1 + botones, activos bajos
  if (p === 0x2AA) return ~entradas.p2 & 0xFFFF;                           // sensores P2
  if (p === 0x2AE) return 0xFFFF;                                          // EEPROM por puerto: no se usa (ver 0x41205 / 0x411B9 abajo)
  if (p === 0x2A2) return 0;                                               // estado del YMZ280B: ninguna voz ocupada
  if (p === 0x2DA) return 0;                                               // placa MP3: no pide datos (la musica va por otro lado)
  return 0xFFFF;
};
IO.inb = (p) => IO.inw(p) & 0xFF;
IO.outw = (p, v) => {
  if (p === 0x2A4) { if (luces.a4 !== v) luces.cambios++; luces.a4 = v; }
  else if (p === 0x2A6) { if (luces.a6 !== v) luces.cambios++; luces.a6 = v; }
};
IO.outb = (p, v) => IO.outw(p, v);

// ---------- EEPROM 93C46 (64 palabras = 128 bytes) ----------
// El juego la lee entera al arrancar (0x41205) y la graba con SAVE AND EXIT y en la prueba de EEPROM (0x411B9):
// los dos con EAX = memoria, EDX = cantidad de bytes, palabra i en la direccion i, y devuelven 1. Se reemplazan por
// una copia en memoria que el anfitrion guarda en disco (trabajador.js -> servidor -> guardado\eeprom.bin).
// Vacia (todo 0xFF) es como una EEPROM nueva: el juego avisa "ident mismatch" y graba los valores de fabrica.
export const eeprom = { datos: new Uint8Array(128).fill(0xFF), guardar: (datos) => {} };
const palabrasEeprom = (n) => ((n - (n >> 31)) >> 1);   // la cuenta del original: bytes / 2 hacia el cero
HLE[0x41205] = () => {
  const mem = R[EAX] >>> 0, n = palabrasEeprom(R[EDX] | 0);
  for (let i = 0; i < n; i++) { const j = (i & 63) * 2; M8[mem + i * 2] = eeprom.datos[j]; M8[mem + i * 2 + 1] = eeprom.datos[j + 1]; }
  R[EAX] = 1; return 0;
};
HLE[0x411B9] = () => {
  const mem = R[EAX] >>> 0, n = palabrasEeprom(R[EDX] | 0);
  for (let i = 0; i < n; i++) { const j = (i & 63) * 2; eeprom.datos[j] = M8[mem + i * 2]; eeprom.datos[j + 1] = M8[mem + i * 2 + 1]; }
  anotar(`eeprom: graba ${n * 2} bytes`);
  eeprom.guardar(eeprom.datos.slice());
  R[EAX] = 1; return 0;
};

// ---------- musica ----------
// El juego carga y descifra el MP3 en 0x30A8D8 (tamano en [0x30A8C4]); estado en [0x30A8D4]: 1 parado, 2 sonando.
// Reemplazo de 0x3CFDC (el envio a la placa en cada tic): avisa al anfitrion que arranque/pare, y fija el reloj
// de la cancion [0x1CA6C8] = tics de 240 Hz segun los segundos de audio (CABINA.md 4.3: a x 239,977).
// [0x30A8C0] es por donde va la placa leyendo el MP3 (solo lo lee la rutina reemplazada). Aca se lleva aproximado
// (128 kbps = 16000 bytes/s) y nunca en 0 mientras suena: el cargador de canciones (0x3CD..., 0x3CE70) borra
// 0x30A8B0-0x30A8D7, asi que si vuelve a 0 el juego cargo otra cancion encima (por ejemplo la vista previa
// mientras todavia suena la musica de la seleccion) y hay que cambiar.
const MUS = { buf: 0x30A8D8, tam: 0x30A8C4, estado: 0x30A8D4, decod: 0x30A8B0, pos: 0x30A8C0, reloj: 0x1CA6C8 };
export const musica = { sonando: false, segundos: () => 0, arrancar: (bytes) => {}, parar: () => {} };
HLE[0x3CFDC] = () => { atenderMusica(); return 0; };
// "sonar" (0x3D1CC) y "parar" (0x3D1E0): ponen el estado 2 / 1 como el original y se atienden en el acto. En la
// cabina la placa se enteraba en el tic siguiente aunque el juego estuviera cargando; aca los tics se pausan
// mientras carga, y la musiquita de la seleccion (que se pide justo antes de cargar stitle.dat) arrancaba tarde.
HLE[0x3D1CC] = () => { w32(MUS.estado, 2); R[EAX] = 1; atenderMusica(); return 0; };
HLE[0x3D1E0] = () => { w32(MUS.estado, 1); R[EAX] = 1; atenderMusica(); return 0; };
function atenderMusica() {
  if (musica.sonando && r32(MUS.pos) === 0) { musica.sonando = false; musica.parar(); anotar('musica: el juego cargo otra'); }
  const est = r32(MUS.estado);
  if (est === 2 && !musica.sonando) {
    const n = r32(MUS.tam) >>> 0;
    musica.sonando = true;
    musica.arrancar(M8.slice(MUS.buf, MUS.buf + n));
    w32(MUS.pos, 1);
    anotar(`musica: arranca (${n} bytes)`);
  } else if (est !== 2 && musica.sonando) { musica.sonando = false; musica.parar(); anotar('musica: para'); }
  if (musica.sonando) {
    const a = musica.segundos();
    if (a >= 0) {
      w32(MUS.reloj, Math.floor(a * 239.977)); w32(MUS.decod, Math.floor(a * 38.28125));
      w32(MUS.pos, Math.max(1, Math.min(r32(MUS.tam), Math.floor(a * 16000))));
    }
    if (a >= 0 && musica.termino && musica.termino()) { w32(MUS.estado, 1); musica.sonando = false; anotar('musica: termino'); }
  }
}

// Preparacion de la seleccion (0x30268): arranca la musiquita 02 y carga stitle.dat (2 MB de titulos). En la
// cabina esa carga duraba lo que la musiquita, asi que la placa ("NEXT STAGE", o el titulo antes de la 1.a etapa)
// quedaba quieta mientras sonaba; despues silencio y la seleccion (Charles, 07/10). Aca la carga es casi
// instantanea: se espera a que termine la musiquita (como mucho 8 s) con el reloj de 240 Hz andando.
export const esperas = { mientrasSuena: (maxMs) => {} };
HLE[0x30268] = () => {
  FN[0x30268]();                                 // el original, con la misma pila: su ret ya saca la vuelta
  if (musica.sonando) esperas.mientrasSuena(8000);
  return -4;
};
// DAC por I2C (volumen): sin efecto
for (const d of [0x3BD68, 0x3BE9C, 0x3C3AC, 0x3BFE0]) HLE[d] = () => 0;
// traba de seguridad: siempre bien
HLE[0x3D7A8] = () => { R[EAX] = 1; return 0; };
HLE[0x3D6A4] = () => { R[EAX] = 1; return 0; };   // la consulta del logo y de cada etapa (JUEGO_REGLAS.md 2.5): si falla, exit(1)
HLE[0x3D324] = () => { R[EAX] = 1; return 0; };

// ---------- efectos (YMZ280B): las muestras no estan en el disco; se avisa al anfitrion ----------
export const efectos = { tocar: (efecto, voz, lazo) => {}, cortar: (voz) => {} };
HLE[0x42169] = () => { efectos.tocar(R[EDX], R[EBX], R[EAX]); anotar(`efecto #${R[EDX]} voz ${R[EBX]}${R[EAX] ? ' (lazo)' : ''}`); return 0; };
HLE[0x4252E] = () => { efectos.cortar(R[EAX]); return 0; };

// ---------- reloj de 240 Hz: la rutina que el juego instala en la interrupcion 8 ----------
export function tic() {
  const dir = vectores.get(8);
  if (dir === undefined) return false;
  // como una interrupcion: EFLAGS, CS y direccion de retorno en la pila (la rutina termina con iretd)
  const guardados = Int32Array.from(R);
  push(0x202); push(0x1B); push(0x7FFFFFF0);
  FN[dir]();
  R.set(guardados);   // una interrupcion no cambia los registros del programa interrumpido
  return true;
}
