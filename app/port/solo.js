// Modo solo: lo que necesita el ranking (online.js), mirando la memoria del juego en cada cuadro. Lo usan
// trabajador.js (en el navegador) y tools\recompilador\arrancar.mjs (PIU_SOLO=1, para probarlo en Node).
// - "ruleta": la cancion del centro de la seleccion (estado 11, subestado 3): lista del modo [0x2B35E8] en
//   0x2B3600 + 50*modo, posicion en [0x2B398C + 4*modo] (JUEGO_REGLAS 3.1); para mostrar los 3 mejores de esa cancion.
// - "etapa": al salir del juego y su nota (estados 2/4/5), el puntaje de cada jugador sumado. La estructura de cada
//   jugador se pone en 0 al empezar cada etapa, asi que es el de esa cancion. Con FAIL, GAME OVER o HEY MAN, nota F.
// - "sesion": cuando vuelve a la espera o al titulo despues de haber jugado (la sesion termino).
// Ojo: el juego puede pasar por un estado en un solo cuadro (el 0 entre el GAME OVER y el titulo), asi que se compara
// con lo visto en el cuadro anterior, no se espera ver cada estado.
import * as C from './cpu.js';

const MODO_RULETA = ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE', 'REMIX', 'BATTLE'];
const EN_JUEGO = new Set([2, 4, 5]);
export const notaDe = (ratio, miss) => (ratio >= 1 && miss === 0 ? 'S' : ratio >= 0.9 ? 'A' : ratio >= 0.8 ? 'B' : ratio >= 0.7 ? 'C' : ratio >= 0.6 ? 'D' : 'F');

export function crearSeguidorSolo(avisar) {
  // banderas de [0x1CFB08] vistas durante la etapa: al GAME OVER el juego las borra en el mismo cuadro en que vuelve
  // a la espera, asi que al salir ya no dicen quien jugaba (probado en Node con PIU_SOLO, 20/10)
  let estAnterior = -1, ruletaAnterior = '', modoElegido = 'NORMAL', subVisto = 0, banderas = 0, etapas = [];
  function seguir() {
    const est = C.r32(0x1CA6A0), enJuego = EN_JUEGO.has(est), antes = EN_JUEGO.has(estAnterior);
    if (est !== estAnterior) avisar({ tipo: 'registro', s: `estado ${estAnterior} -> ${est}` });
    if (est === 11 && C.r32(0x2AFD18) === 3) {
      const m = C.r32(0x2B35E8), i = C.r32(0x2B398C + 4 * m), c = C.r8(0x2B3600 + 50 * m + i);
      modoElegido = MODO_RULETA[m] || 'NORMAL';
      const clave = c + ' ' + modoElegido;
      if (clave !== ruletaAnterior) { ruletaAnterior = clave; avisar({ tipo: 'ruleta', cancion: c, modo: modoElegido }); }
    } else if (ruletaAnterior) { ruletaAnterior = ''; avisar({ tipo: 'ruleta', cancion: 0 }); }
    if (est === 2) { subVisto |= 1 << (C.r32(0x1CFB24) & 15); banderas = C.r32(0x1CFB08) || banderas; }
    // la demo de la atraccion (bandera 0x100000) no es una etapa jugada
    if (antes && !enJuego && (banderas & 0x100000)) { subVisto = 0; banderas = 0; }
    if (antes && !enJuego && banderas) {
      const b = banderas, modo = b & 0x40 ? 'BATTLE' : modoElegido, cortada = subVisto & ((1 << 1) | (1 << 3) | (1 << 4));
      for (const [bit, p, jugador] of [[1, 0x1CFB7C, 1], [2, 0x1CFBA5, 2]]) {
        if (!(b & bit)) continue;
        const ratio = C.rf32(p + 4), miss = C.r16(p + 0x22);
        // (comboMax +0x16: para el perfil del jugador, mejora 14)
        const e = { jugador, cancion: C.r32(0x2B3A68), modo, puntaje: C.r32(p) >>> 0, nota: cortada ? 'F' : notaDe(ratio, miss), combo: C.r16(p + 0x16) };
        etapas.push(e); avisar({ tipo: 'etapa', ...e });
      }
      subVisto = 0; banderas = 0;
    }
    if ((est === 0 || est === 19 || est === 20) && etapas.length && !enJuego) { avisar({ tipo: 'sesion', etapas }); etapas = []; }
    estAnterior = est;
  }
  return { seguir };
}
