// Lo primero que corre: decide de donde salen los archivos del juego (archivos.js) y recien despues abre el port.
// - el servidor trae el juego (la PC, las builds completas, la web con el disco subido): como siempre;
// - si no: el disco propio ya preparado en este navegador, o la pantalla para elegirlo (instalar.js).
import * as Archivos from './archivos.js';

if (!(await Archivos.servidorTieneDisco())) {
  if (!(await Archivos.discoPropio())) await (await import('./instalar.js')).pedirDisco();
  await Archivos.usarDiscoPropio();
}
await import('./principal.js');
