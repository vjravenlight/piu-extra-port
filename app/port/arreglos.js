// Errores del juego original que el port corrige (pedidos por Charles). Se aplican a la memoria apenas se cargan
// el codigo y los datos de Piu.exe, antes de arrancar. Cada uno dice que hacia el original y por que se cambia.
import { wf32, w32 } from './cpu.js';

export function aplicarArreglos(demo) {
  // Demo de 9 canciones (port\config.json): la espera juega sola una de 19 canciones de la tabla 0x13BD14
  // ("run %02d_h2.not -demo"); en la demo se llena con las que estan subidas, para no pedir archivos que no estan.
  if (demo && demo.atrae && demo.atrae.length) for (let i = 0; i < 19; i++) w32(0x13BD14 + 4 * i, demo.atrae[i % demo.atrae.length]);
  // RUSH (modo R, bandera 0x800; investigacion\JUEGO_REGLAS.md 3.6). Las canciones 51, 54 y 66 estan en la lista de
  // exclusion (0x13C394: con ellas no suena el audio rapido) pero tienen tempo rapido en la tabla (0x13B864:
  // 139,08 / 144 / 91). El cargador de pasos (0x220F8) cambia el BPM antes de mirar la exclusion, asi que en la cabina
  // los pasos iban rapido y la musica normal. Sus R51/R54/R66 del disco tampoco calzan con ese tempo (la de 66 ni
  // siquiera es mas rapida), por eso las habian excluido. Con el tempo rapido en 0, el cargador apaga el RUSH para esa
  // cancion como con las demas excluidas: pasos y musica normales y juntos (08/10, "corregi el error").
  for (const n of [51, 54, 66]) wf32(0x13B864 + 4 * n, 0);
}
