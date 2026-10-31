// Recorrido para las capturas (capturas.ps1 -Nombre ranking, con el salon de ravenlight.net): menu -> RANKING y pasa
// por sus tablas (sesiones, mejor de cada cancion, online, semana, cancion del dia).
(() => {
  const P = window.__port; if (!P) return JSON.stringify({ fase: 'cargando' });
  const pant = P.menu().pantalla;
  const tecla = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), 120); };
  const R = (window.__r = window.__r || { fase: 'menu', n: 0, pagina: 0 });
  R.n++;
  if (R.fase === 'menu' && pant === 'menu' && R.n >= 2) { tecla('ArrowDown'); setTimeout(() => tecla('ArrowDown'), 300); setTimeout(() => tecla('Enter'), 600); R.fase = 'ranking'; R.n = 0; }
  else if (R.fase === 'ranking' && pant === 'ranking' && R.n >= 2) { tecla('ArrowRight'); R.pagina++; R.n = 0; }
  return JSON.stringify({ fase: R.fase, pant, pagina: R.pagina });
})()
