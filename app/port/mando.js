// MANDOS USB (mejora 10, elegida por Charles el 20/10): alfombras de baile, joysticks y gamepads, por la Gamepad API
// del navegador. El 1.er mando conectado es el jugador 1 y el 2.o el jugador 2; cada panel (↖ ↗ ● ↙ ↘) es un boton o
// la direccion de un eje. Como cada alfombra numera distinto, en OPCIONES > MANDO USB se pisa cada panel una vez y queda
// aprendido (online.js); sin aprender, la distribucion de un gamepad comun: LB ↖, RB ↗, A ●, LT ↙, RT ↘.
// START hace de ● (Enter) y BACK de ATRAS (Esc). Se revisa cada 4 ms (como la placa, que lee a 240 Hz) mientras haya
// un mando; cada cambio va al juego con su hora, igual que una tecla.
export const PANELES = ['ui', 'ud', 'c', 'di', 'dd'];
const BIT = { ui: 0x01, ud: 0x02, c: 0x04, di: 0x08, dd: 0x10 };
export const POR_DEFECTO = { ui: 'b4', ud: 'b5', c: 'b0', di: 'b6', dd: 'b7' };
let mapa = { ...POR_DEFECTO }, alPad = () => {}, alBoton = () => {}, aprendiendo = null, reloj = 0;
const previo = new Map();          // indice del mando -> { panel: apretado }, botones extra y controles crudos

// un control crudo: 'b3' (boton 3), 'a1+' / 'a1-' (eje 1 hacia un lado)
function crudos(m) {
  const s = new Set();
  m.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) s.add('b' + i); });
  m.axes.forEach((v, i) => { if (v > 0.5) s.add('a' + i + '+'); else if (v < -0.5) s.add('a' + i + '-'); });
  return s;
}
function revisar() {
  const mandos = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean);
  if (!mandos.length) { clearInterval(reloj); reloj = 0; return; }
  mandos.slice(0, 2).forEach((m, jugador) => {
    const ahora = crudos(m), antes = previo.get(m.index) || { paneles: {}, crudos: new Set() };
    // aprendiendo (OPCIONES > MANDO USB): el primer control nuevo que se aprieta es el del panel que se esta pidiendo
    if (aprendiendo) { for (const c of ahora) if (!antes.crudos.has(c)) { const f = aprendiendo; aprendiendo = null; f(c, m.id); break; } }
    else {
      for (const p of PANELES) {
        const on = ahora.has(mapa[p]);
        if (!!antes.paneles[p] !== on) alPad(jugador, BIT[p], on);
        antes.paneles[p] = on;
      }
      // START = ● de los menus, BACK = ATRAS (si no estan usados como panel)
      const usados = new Set(Object.values(mapa));
      for (const [c, tecla] of [['b9', 'Enter'], ['b8', 'Escape']]) if (!usados.has(c) && ahora.has(c) && !antes.crudos.has(c)) alBoton(tecla);
    }
    antes.crudos = ahora; previo.set(m.index, antes);
  });
}
function prender() { if (!reloj) reloj = setInterval(revisar, 4); }
export function iniciarMandos(cfg) {
  alPad = cfg.alPad; alBoton = cfg.alBoton;
  addEventListener('gamepadconnected', (e) => { cfg.avisar && cfg.avisar(`Mando conectado: ${e.gamepad.id.slice(0, 40)}`); prender(); });
  addEventListener('gamepaddisconnected', () => { previo.clear(); });
  prender();                                   // por si ya estaba conectado antes de abrir la pagina
}
export function fijarMapa(m) { mapa = { ...POR_DEFECTO, ...(m || {}) }; }
// el proximo control que se apriete (para aprender un panel); null cancela
export function aprender(f) { aprendiendo = f; if (f) prender(); }
export const hayMando = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean).map((m) => m.id);
