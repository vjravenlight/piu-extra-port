// Jugadores falsos para la captura del torneo (capturas.ps1 -Nombre torneo): Beto arma un torneo (versus completo, por
// llegada), Cris, Dani, Eli y Fede se anotan; Gabi queda libre. Cuando Ana (la pagina) entra al salon, Beto lo empieza.
// Con la PC cargada (el juego corriendo) el salon puede darlos por idos: vuelven a entrar y a anotarse solos.
// Uso: node bot_torneo_promo.mjs http://127.0.0.1:8799/online/api.php
const API = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const api = async (c) => { for (let i = 0; ; i++) { try { return await (await fetch(API, { method: 'POST', body: JSON.stringify(c) })).json(); } catch (e) { if (i > 30) return { error: String(e) }; await espera(1000); } } };
for (let i = 0; i < 300; i++) { try { if ((await api({ accion: 'ranking' })).mejores) break; } catch (e) { /* todavia no */ } await espera(2000); }
log('salon listo');
const nicks = ['Beto', 'Cris', 'Dani', 'Eli', 'Fede', 'Gabi'], j = {};
const cred = (x) => ({ id: x.id, clave: x.clave });
let empezado = false;
for (let vuelta = 0; vuelta < 1500; vuelta++) {
  // los que no estan (o los sacaron), adentro otra vez
  for (const n of nicks) if (!j[n]) { const r = await api({ accion: 'entrar', nick: n }); if (r.id) { j[n] = r; log('entro', n); } else log('no entro', n, r.error); }
  const estados = await Promise.all(nicks.map((n) => (j[n] ? api({ accion: 'estado', ...cred(j[n]) }) : Promise.resolve({ error: 'afuera' }))));
  estados.forEach((e, k) => { if (e.error) { if (j[nicks[k]]) log('lo sacaron', nicks[k], e.error); j[nicks[k]] = null; } });
  const e = estados.find((x) => !x.error);
  if (!e) { await espera(1000); continue; }
  const t = e.torneo;
  if (!t && j.Beto) { const r = await api({ accion: 'torneo_crear', ...cred(j.Beto), orden: 'llegada', formato: 'versus' }); log('torneo armado', r.error || ''); }
  else if (t && t.estado === 'anotando') {
    for (const n of ['Cris', 'Dani', 'Eli', 'Fede']) if (j[n] && !t.anotados.includes(n)) await api({ accion: 'torneo_anotarse', ...cred(j[n]) });
    if (!empezado && j.Beto && t.anotados.length >= 5 && e.jugadores.some((x) => x.nick === 'Ana')) {
      await espera(3000); const r = await api({ accion: 'torneo_empezar', ...cred(j.Beto) }); empezado = !r.error; log('torneo empezado', r.error || '');
    }
  }
  await espera(1000);
}
