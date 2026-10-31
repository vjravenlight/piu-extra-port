// Recorrido para las capturas (capturas.ps1 -Nombre torneo, con bot_torneo_promo.mjs armando un torneo de 5): entra
// al salon, abre MODO TORNEO (las llaves), vuelve y elige a Gabi (libre) para ver UNA CANCION / VERSUS COMPLETO.
(() => {
  const P = window.__port; if (!P) return JSON.stringify({ fase: 'cargando' });
  const m = P.menu(), pant = m.pantalla, to = m.sala && m.sala.torneo;
  const tecla = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), 120); };
  const R = (window.__r = window.__r || { fase: 'sala', n: 0 });
  R.n++;
  // (si el salon todavia no contestaba al abrir, pide el nombre: se escribe y se confirma)
  if (pant === 'nick' && R.n % 2 === 0) { const i = document.getElementById('escribir'); i.value = 'Ana'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); }
  else if (pant === 'menu' && R.n % 3 === 0) { tecla('ArrowDown'); setTimeout(() => tecla('Enter'), 400); }
  else if (R.fase === 'sala' && pant === 'sala' && to && to.estado === 'jugando' && R.n >= 3) { tecla('Enter'); R.fase = 'torneo'; R.n = 0; }
  else if (R.fase === 'torneo' && pant === 'torneo' && R.n >= 20) { tecla('Escape'); R.fase = 'sala2'; R.n = 0; }
  else if (R.fase === 'sala2' && pant === 'sala' && R.n >= 2) { for (let i = 0; i < 6; i++) setTimeout(() => tecla('ArrowDown'), i * 200); setTimeout(() => tecla('Enter'), 1500); R.fase = 'tipo'; R.n = 0; }
  return JSON.stringify({ fase: R.fase, pant, torneo: to ? to.estado : null, jugadores: m.sala ? m.sala.jugadores : 0 });
})()
