// Recorrido para las capturas (capturas.ps1 -Nombre demo / celu): jugar solo y esperar la demo de la cabina (juega
// sola, con todos los pasos bien); despues de unos 70 s de demo, S para empezar y quedarse en la seleccion.
(() => {
  const P = window.__port; if (!P) return JSON.stringify({ fase: 'cargando' });
  const pant = P.menu().pantalla, reg = P.todo || [];
  const tecla = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), 120); };
  const ult = [...reg].reverse().find((l) => /estado -?\d+ -> \d+/.test(l)) || '';
  const est = +((/-> (\d+)/.exec(ult) || [])[1] ?? -1);
  const R = (window.__r = window.__r || { fase: 'menu', n: 0, demo: 0 });
  R.n++;
  if (R.fase === 'menu' && pant === 'menu' && R.n >= 2) { tecla('Enter'); R.fase = 'demo'; R.n = 0; }
  else if (R.fase === 'demo' && pant === 'oculto' && est === 2) { R.demo++; if (R.demo >= 14) { R.fase = 'salir'; R.n = 0; } }
  else if (R.fase === 'salir' && pant === 'oculto' && est !== 11) tecla('KeyS');
  else if (R.fase === 'salir' && est === 11) { R.fase = 'seleccion'; R.n = 0; }
  return JSON.stringify({ fase: R.fase, pant, est, demo: R.demo });
})()
