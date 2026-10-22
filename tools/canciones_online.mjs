// Las canciones de la demo web y del online (las mismas que acepta app\online\api.php). Lo usan armar_demo_web.mjs
// (la web) y preparar\preparar.mjs (app\port\game_online.cfg, la seleccion de los desafios en las builds).
// las 9 primeras (18/10) y 9 mas (20/10: Lazenca, Funky Jockey, Monkey Magic, Starian, Blind Faith, Pumping Jumping,
// Ha Yeo Ga, Fever, First Love, clasicos con NORMAL y HARD elegidos por Claude: Charles pidio "subi 9 canciones mas")
// y 4 mas (20/10, "subi un par de canciones mas"): Pil Seung, Hwansang-sogui Geudae (Seo Taiji), Bonaccia, Pierrot
export const CANCIONES = [60, 12, 8, 23, 58, 15, 13, 67, 19, 44, 9, 40, 11, 42, 10, 64, 48, 22, 63, 65, 66, 47, 4, 6, 14, 16, 24, 26, 33, 45, 55, 61], OCULTAS = [7, 20, 21];
// REMIX no puede quedar vacia: el juego divide por cuantas canciones tiene cada modo (0x31740) y al pasar por REMIX
// (con Q/E o un truco) se caia con "division por cero" (telemetria de Charles, 19/10). Va el 52, "igni + hyp + extra",
// que trae Extravaganza adentro (10,7 MB). Solo esta en la lista REMIX; el online sigue con las 9.
// 20/10, "subile ademas un par de canciones remix": 32 (Seontaek + Goodbye + Kkum) y 53 (Kiss + Geunyeoneun Yeppeotda)
export const REMIX = [52, 32, 53];

// game_con_todo.cfg recortado a esas canciones (lineas, latin1). Ningun modo puede quedar vacio (ver REMIX).
export function listaOnline(conTodo) {
  let modo = '';
  const lista = conTodo.split(/\r?\n/).filter(l => {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'MODENAME') modo = p[1];
    return p[0] !== 'SONG' || CANCIONES.includes(+p[1]) || (modo === 'REMIX' && REMIX.includes(+p[1]));
  });
  modo = ''; const cuenta = {};
  for (const l of lista) { const p = l.trim().split(/\s+/); if (p[0] === 'MODENAME') { modo = p[1]; cuenta[modo] = 0; } else if (p[0] === 'SONG' && modo) cuenta[modo]++; }
  const vacios = Object.keys(cuenta).filter(m => !cuenta[m]);
  if (vacios.length) throw new Error('lista del online: modos sin canciones (el juego se cae al pasar por ahi): ' + vacios.join(', '));
  return lista.join('\r\n');
}
