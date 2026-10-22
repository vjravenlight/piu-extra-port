// Prueba el salon online (app\online\api.php) por el servidor local, sin navegador: dos jugadores entran, chatean,
// uno desafia, el otro acepta, mandan puntajes, terminan y se mira el ranking.
// Uso: node probar_salon.mjs [puerto]   (con tools\servidor.mjs corriendo en ese puerto; por defecto 8800)
const base = `http://127.0.0.1:${process.argv[2] || 8800}/online/api.php`;
const pedir = async (cuerpo) => { const r = await fetch(base, { method: 'POST', body: JSON.stringify(cuerpo) }); return { codigo: r.status, ...(await r.json()) }; };
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) process.exitCode = 1; };

const a = await pedir({ accion: 'entrar', nick: 'Charles' });
const b = await pedir({ accion: 'entrar', nick: 'Notebook' });
ok(a.id && b.id, 'entran los dos');
ok((await pedir({ accion: 'entrar', nick: 'charles' })).error, 'no deja repetir el nickname');
const ida = { id: a.id, clave: a.clave }, idb = { id: b.id, clave: b.clave };
await pedir({ accion: 'chat', ...ida, texto: 'hola, te juego?' });
let e = await pedir({ accion: 'estado', ...idb });
ok(e.jugadores.length === 2 && e.chat.some(m => m.texto === 'hola, te juego?'), 'B ve a los dos y el chat');
await pedir({ accion: 'desafiar', ...ida, a: b.id, cancion: 60, modo: 'HARD' });
e = await pedir({ accion: 'estado', ...idb });
ok(e.desafios.length === 1 && e.desafios[0].nick === 'Charles' && e.desafios[0].cancion === 60, 'B recibe el desafio');
await pedir({ accion: 'responder', ...idb, desafio: e.desafios[0].id, acepta: true });
e = await pedir({ accion: 'estado', ...ida });
ok(e.partida && e.partida.cancion === 60 && e.partida.inicio > e.ahora, 'A ve la partida con hora de arranque futura');
await pedir({ accion: 'marcador', ...ida, puntaje: 512300, combo: 80, vida: 700 });
e = await pedir({ accion: 'estado', ...idb });
ok(e.partida.jugadores[a.id].puntaje === 512300, 'B ve el puntaje de A en vivo');
await pedir({ accion: 'marcador', ...ida, puntaje: 801000, combo: 120, vida: 900, nota: 'A', terminado: true });
await pedir({ accion: 'marcador', ...idb, puntaje: 650000, combo: 90, vida: 500, nota: 'B', terminado: true });
const r = await pedir({ accion: 'ranking' });
ok(r.mejores['60 HARD'] && r.mejores['60 HARD'][0].nick === 'Charles', 'ranking: Charles primero en 60 HARD');
ok(r.jugadores.Charles.ganadas === 1 && r.jugadores.Notebook.perdidas === 1, 'ranking: ganadas y perdidas');
await pedir({ accion: 'volver', ...ida }); await pedir({ accion: 'volver', ...idb });
e = await pedir({ accion: 'estado', ...ida });
ok(e.yo.estado === 'sala' && !e.partida, 'los dos vuelven a la sala');
await pedir({ accion: 'salir', ...ida }); await pedir({ accion: 'salir', ...idb });
