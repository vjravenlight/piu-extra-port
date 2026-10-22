// Un jugador "bot" para probar el online sin abrir un segundo juego: entra al salon, saluda por el chat, acepta el
// primer desafio que le llega, "juega" mandando un puntaje que sube y termina a los N segundos de arrancar.
// Uso: node bot_salon.mjs [url del salon] [nick] [segundos de cancion]
// (por defecto http://127.0.0.1:8799/online/api.php, Beto, 40)
const url = process.argv[2] || 'http://127.0.0.1:8799/online/api.php', nick = process.argv[3] || 'Beto', dura = +(process.argv[4] || 40);
const pedir = async (c) => (await fetch(url, { method: 'POST', body: JSON.stringify(c) })).json();
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const yo = await pedir({ accion: 'entrar', nick });
if (yo.error) { console.log('no pude entrar: ' + yo.error); process.exit(1); }
const cred = { id: yo.id, clave: yo.clave };
console.log(`bot ${nick} en la sala`);
await pedir({ accion: 'chat', ...cred, texto: 'hola! soy un bot, desafiame' });
let partida = null;
for (let i = 0; i < 600 && !partida; i++) {
  const e = await pedir({ accion: 'estado', ...cred });
  const d = e.desafios && e.desafios.find(d => !d.mio);
  if (d) { console.log(`bot: me desafio ${d.nick} a la ${d.cancion} ${d.modo}; acepto`); await pedir({ accion: 'responder', ...cred, desafio: d.id, acepta: true }); }
  if (e.partida) partida = e.partida;
  await dormir(500);
}
if (!partida) { console.log('bot: nadie me desafio'); process.exit(1); }
const espera = partida.inicio * 1000 - Date.now() + 2000;
console.log(`bot: la partida arranca en ${Math.round(espera / 1000)} s`);
await dormir(Math.max(0, espera));
const t0 = Date.now();
let puntaje = 0, combo = 0;
while (Date.now() - t0 < dura * 1000) {
  puntaje += 4000 + Math.floor(Math.random() * 3000); combo = Math.random() < 0.1 ? 0 : combo + 3;
  await pedir({ accion: 'marcador', ...cred, puntaje, combo, vida: 600 + Math.floor(Math.random() * 300) });
  await dormir(500);
}
await pedir({ accion: 'marcador', ...cred, puntaje, combo, vida: 700, nota: 'B', terminado: true });
console.log(`bot: termine con ${puntaje}`);
for (let i = 0; i < 120; i++) { const e = await pedir({ accion: 'estado', ...cred }); if (!e.partida) break; await dormir(1000); }
await pedir({ accion: 'volver', ...cred });
await dormir(4000);
await pedir({ accion: 'salir', ...cred });
console.log('bot: me fui');
