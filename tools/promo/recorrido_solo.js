// Recorrido para las capturas de promocion (tools\promo\capturas.ps1): se evalua cada 5 s en la pagina del juego y va
// avanzando solo: menu -> ranking -> jugar solo -> seleccion -> modificadores -> cancion. Devuelve en que pantalla esta.
(() => {
  const P = window.__port; if (!P) return JSON.stringify({ fase: 'cargando' });
  const pant = P.menu().pantalla, reg = P.todo || [];
  const tecla = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), 120); };
  const ult = [...reg].reverse().find((l) => /estado -?\d+ -> \d+/.test(l)) || '';
  const est = +((/-> (\d+)/.exec(ult) || [])[1] ?? -1);
  const R = (window.__r = window.__r || { fase: 'menu', n: 0 });
  R.n++;
  const pasar = (f) => { R.fase = f; R.n = 0; };
  // (el menu arranca parado en JUGAR SOLO; el ranking sale en recorrido_ranking.js)
  if (R.fase === 'menu' && pant === 'menu' && R.n >= 2) { tecla('Enter'); pasar('solo'); }
  else if (R.fase === 'solo' && pant === 'oculto' && (est === 0 || est === 19 || est === 20)) tecla('KeyS');
  else if (R.fase === 'solo' && pant === 'oculto' && est === 11) { if (R.n >= 4) { tecla('KeyC'); setTimeout(() => tecla('KeyS'), 600); pasar('seleccion'); } }
  else if (R.fase === 'seleccion' && pant === 'oculto' && est === 11 && R.n >= 2) tecla('KeyS');
  else if (R.fase === 'seleccion' && pant === 'mods') pasar('mods');
  // (una skin de flechas distinta, para que se vea; despues LISTO: JUGAR)
  else if (R.fase === 'mods' && pant === 'mods' && R.n >= 3) { tecla('ArrowUp'); setTimeout(() => tecla('Enter'), 300); setTimeout(() => tecla('Enter'), 600); setTimeout(() => tecla('ArrowDown'), 900); setTimeout(() => tecla('Enter'), 1200); pasar('cancion'); }
  return JSON.stringify({ fase: R.fase, pant, est });
})()
