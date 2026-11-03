// Las listas de canciones durante una partida: que hace el juego al confirmar una cancion (0x2EEE8, JUEGO_REGLAS 3.4).
// El original la saca de la lista de ese modo (no se repite en el mismo juego) y en XX (CRAZY) suma una oculta por etapa.
// Listas: cancion 0x2B3600 + 50*modo, nivel 0x2B372C, marca 0x2B3858, cantidad 0x2B3984 + modo, lugar elegido 0x2B398C + 4*modo.
//
// (03/11, Charles: "me aparecen canciones como blind faith en extra expert cuando no tiene y me desaparecio una... tiene
// que estar todo y no tiene que ni aparecer ni desaparecer cosas") al compactar, 0x2EEE8 mira un lugar mas alla del ultimo.
// Con una lista de 50 (el tope: HARD y DOUBLE en game_demo.cfg y game_con_todo.cfg; en el disco son 48 y 49, por eso en la
// cabina no pasaba) ese lugar es el primero de la lista siguiente: lo borra (cancion 0, marca 99). Jugar en HARD rompia XX,
// y jugar en DOUBLE rompia REMIX. Medido con la rutina real: tools\probar_listas.mjs.
import * as C from './cpu.js';

const SONG = 0x2B3600, NIVEL = 0x2B372C, MARCA = 0x2B3858, ELEGIDA = 0x2B398C;

// desbloqueado (OPCIONES > TODO DESBLOQUEADO, de fabrica): las listas no cambian en toda la partida; las ocultas ya estan
// desde el principio (trabajador.js desbloquear) y se puede repetir una cancion. Solo vuelve al primer lugar, como el original.
// Si no: las reglas de la cabina, cuidando el primer lugar de la lista siguiente.
export function instalarListas(desbloqueado) {
  C.HLE[0x2EEE8] = () => {
    const modo = C.R[C.EAX] | 0;
    if (desbloqueado) { C.w32(ELEGIDA + 4 * modo, 0); return 0; }
    const lugar = 50 * (modo + 1), guardar = [SONG + lugar, NIVEL + lugar, MARCA + lugar], antes = guardar.map((a) => C.r8(a));
    C.FN[0x2EEE8]();
    guardar.forEach((a, i) => C.w8(a, antes[i]));
    return -4;      // la rutina ya hizo su "ret"
  };
}
