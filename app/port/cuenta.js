// La cuenta opcional del jugador (OPCIONES > CUENTA; servidor: app\online\cuentas.php). Es una ventana de la pagina arriba
// del juego, no un dibujo del lienzo: hacen falta mail y contrasena, y asi anda el teclado del celu y el gestor de contrasenas.
// Mientras esta abierta, las teclas no le llegan al juego.
let D = null;   // { api: URL de cuentas.php, op, guardarOpciones, avisar, claveDueno }
export function iniciarCuenta(deps) { D = deps; }
export const cuentaActiva = () => !!(D && D.op().cuenta && D.op().cuenta.token);
export const mailDeCuenta = () => (cuentaActiva() ? D.op().cuenta.mail : '');

async function pedir(cuerpo) {
  let r; try { r = await fetch(D.api, { method: 'POST', body: JSON.stringify(cuerpo) }); } catch (e) { throw new Error('No hay conexion con el servidor'); }
  let j = {}; try { j = await r.json(); } catch (e) { /* un 500 sin JSON */ }
  if (!r.ok || j.error) { const er = new Error(j.error || 'El servidor no responde'); er.codigo = r.status; throw er; }
  return j;
}
function h(tag, attrs, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'estilo') e.style.cssText = v; else if (k in e) e[k] = v; else e.setAttribute(k, v); }
  for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}
const ESTILO = { fondo: 'position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:12px;background:rgba(0,0,20,.8);font:16px/1.4 "Segoe UI",system-ui,Roboto,sans-serif;color:#f1f3ff;overflow:auto',
  caja: 'box-sizing:border-box;width:min(420px,100%);padding:18px;background:#141938;border:2px solid #2a6bff;border-radius:10px', campo: 'box-sizing:border-box;display:block;width:100%;min-height:44px;margin:4px 0 12px;padding:8px 10px;font:inherit;color:#fff;background:#0d1130;border:1px solid #323b73;border-radius:6px',
  boton: 'min-height:44px;margin:4px 6px 4px 0;padding:8px 14px;font:inherit;color:#fff;background:#1d2450;border:1px solid #323b73;border-radius:6px;cursor:pointer', oro: 'min-height:44px;margin:4px 6px 4px 0;padding:8px 16px;font:inherit;font-weight:700;color:#1a1200;background:#ffd23f;border:0;border-radius:6px;cursor:pointer',
  nota: 'margin:6px 0 12px;color:#aab2d6;font-size:.9rem', error: 'min-height:1.3em;margin:0 0 8px;color:#ff6b78;font-size:.92rem', link: 'color:#5fd0ff;background:none;border:0;padding:6px 0;font:inherit;cursor:pointer;text-decoration:underline' };
const campo = (etq, name, tipo, ayuda = {}) => h('label', { estilo: 'display:block;color:#aab2d6;font-size:.92rem' }, etq, h('input', { name, type: tipo, estilo: ESTILO.campo, required: true, ...ayuda }));

let capa = null;
export const cuentaAbierta = () => !!capa;
export function abrirCuenta() {
  cerrar();
  capa = h('div', { estilo: ESTILO.fondo, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Cuenta',
    onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Escape') cerrar(); }, onkeyup: (e) => e.stopPropagation(), onkeypress: (e) => e.stopPropagation() });
  capa.tabIndex = -1;
  document.body.append(capa);
  for (const t of ['keydown', 'keyup']) addEventListener(t, teclaAfuera, true);
  if (cuentaActiva()) verCuenta(); else verEntrar();
}
// si el foco quedo afuera de la ventana (una pantalla sin campos), las teclas tampoco le llegan al juego
function teclaAfuera(e) { if (!capa || capa.contains(e.target)) return; e.stopImmediatePropagation(); if (e.type === 'keydown' && e.key === 'Escape') cerrar(); }
function cerrar() { if (capa) { capa.remove(); capa = null; for (const t of ['keydown', 'keyup']) removeEventListener(t, teclaAfuera, true); } }
function poner(...hijos) { capa.replaceChildren(h('div', { estilo: ESTILO.caja }, ...hijos)); (capa.querySelector('input') || capa).focus(); }
const titulo = (t) => h('h2', { estilo: 'margin:0 0 10px;color:#ffd23f;font-size:1.25rem' }, t);
const cerrarBoton = (t = 'Volver al juego') => h('button', { type: 'button', estilo: ESTILO.boton, onclick: cerrar }, t);
function formulario(campos, textoBoton, hacer, extra = []) {
  const err = h('p', { estilo: ESTILO.error, role: 'alert' });
  const f = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; boton.disabled = true;
    try { await hacer(f.elements, err); } catch (ex) { err.textContent = ex.message; } finally { boton.disabled = false; }
  } }, ...campos, err);
  const boton = h('button', { type: 'submit', estilo: ESTILO.oro }, textoBoton);
  f.append(boton, ...extra);
  return f;
}
// lo que vuelve de la cuenta le queda al juego: nombre, clave del nombre y clave de dueño
function aplicar(j) {
  const op = D.op();
  op.cuenta = { token: j.token || (op.cuenta && op.cuenta.token), mail: j.mail };
  op.clave = j.clave; try { localStorage.setItem('piu_clave_pasos', j.clave); } catch (e) { /* sin almacenamiento */ }
  if (j.nick) { op.nick = j.nick; op.pin = j.pin; }
  D.guardarOpciones();
}
// si este aparato ya tenia nombre y la cuenta no, se suma a la cuenta
async function sumarNombreDelAparato() {
  const op = D.op();
  if (!op.nick) return '';
  try { aplicar(await pedir({ accion: 'vincular', token: op.cuenta.token, nick: op.nick, pin: op.pin })); return ''; }
  catch (e) { return `Tu nombre ${op.nick} no se pudo sumar: ${e.message}`; }
}
const AVISO = 'Es opcional: sin cuenta se juega igual. Con cuenta, tu nombre, tus estadisticas y tus pasos te siguen a cualquier aparato. Guardamos tu mail y tu contrasena cifrada, solo para esto. La podes borrar cuando quieras.';
function verEntrar(mail = '') {
  poner(titulo('Tu cuenta'), h('p', { estilo: ESTILO.nota }, AVISO),
    formulario([campo('Mail', 'mail', 'email', { autocomplete: 'username', value: mail, maxLength: 120 }), campo('Contraseña', 'clave', 'password', { autocomplete: 'current-password' })], 'Entrar', async (x) => {
      const j = await pedir({ accion: 'entrar', mail: x.mail.value, clave: x.clave.value, dueno: D.claveDueno() });
      aplicar(j);
      const aviso = j.nick ? '' : await sumarNombreDelAparato();
      verCuenta(aviso || 'Listo, entraste.');
    }),
    h('div', {}, h('button', { type: 'button', estilo: ESTILO.boton, onclick: verCrear }, 'Crear una cuenta'), cerrarBoton('Seguir sin cuenta')),
    h('button', { type: 'button', estilo: ESTILO.link, onclick: () => verOlvide(capa.querySelector('input').value) }, 'Me olvide la contraseña'));
}
function verCrear() {
  poner(titulo('Crear una cuenta'), h('p', { estilo: ESTILO.nota }, AVISO),
    formulario([campo('Mail', 'mail', 'email', { autocomplete: 'username', maxLength: 120 }), campo('Contraseña (minimo 8 caracteres)', 'clave', 'password', { autocomplete: 'new-password', minLength: 8 }), campo('Repeti la contraseña', 'otra', 'password', { autocomplete: 'new-password', minLength: 8 })], 'Crear la cuenta', async (x) => {
      if (x.clave.value !== x.otra.value) throw new Error('Las dos contraseñas no coinciden');
      aplicar(await pedir({ accion: 'registrar', mail: x.mail.value, clave: x.clave.value, dueno: D.claveDueno() }));
      verCuenta((await sumarNombreDelAparato()) || 'Listo, ya tenes cuenta.');
    }),
    h('button', { type: 'button', estilo: ESTILO.boton, onclick: () => verEntrar() }, 'Ya tengo cuenta'));
}
function verOlvide(mail = '') {
  poner(titulo('Cambiar la contraseña'), h('p', { estilo: ESTILO.nota }, 'Te mandamos un codigo por mail. Mira tambien en spam.'),
    formulario([campo('Mail', 'mail', 'email', { autocomplete: 'username', value: mail, maxLength: 120 })], 'Mandarme el codigo', async (x) => {
      await pedir({ accion: 'olvide', mail: x.mail.value }); verCodigo(x.mail.value);
    }), h('button', { type: 'button', estilo: ESTILO.boton, onclick: () => verEntrar(mail) }, 'Volver'));
}
function verCodigo(mail) {
  poner(titulo('Escribi el codigo'), h('p', { estilo: ESTILO.nota }, `Si ${mail} tiene cuenta, te llego un codigo que dura 30 minutos.`),
    formulario([campo('Codigo', 'codigo', 'text', { inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6 }), campo('Contraseña nueva (minimo 8 caracteres)', 'nueva', 'password', { autocomplete: 'new-password', minLength: 8 })], 'Cambiarla', async (x) => {
      await pedir({ accion: 'restablecer', mail, codigo: x.codigo.value, nueva: x.nueva.value }); verEntrar(mail);
    }), h('button', { type: 'button', estilo: ESTILO.boton, onclick: () => verEntrar(mail) }, 'Volver'));
}
function olvidarEnEsteAparato() { const op = D.op(); op.cuenta = null; D.guardarOpciones(); }
function verCuenta(mensaje = '') {
  const op = D.op();
  poner(titulo('Tu cuenta'), mensaje ? h('p', { estilo: 'margin:0 0 10px;color:#62e39a' }, mensaje) : null,
    h('p', { estilo: 'margin:0 0 4px;overflow-wrap:anywhere' }, op.cuenta.mail),
    h('p', { estilo: ESTILO.nota }, op.nick ? `Tu nombre: ${op.nick}. Tus estadisticas estan en RANKING > TU PERFIL, y tus pasos te siguen a cualquier aparato donde entres.` : 'Todavia no elegiste un nombre: se suma a la cuenta cuando juegues o lo pongas en OPCIONES.'),
    h('div', {}, cerrarBoton(),
      h('button', { type: 'button', estilo: ESTILO.boton, onclick: async () => { try { await pedir({ accion: 'salir', token: op.cuenta.token }); } catch (e) { /* igual se olvida aca */ } olvidarEnEsteAparato(); verEntrar(); } }, 'Cerrar sesion')),
    h('div', {}, h('button', { type: 'button', estilo: ESTILO.link, onclick: verCambiar }, 'Cambiar la contraseña')),
    h('div', {}, h('button', { type: 'button', estilo: ESTILO.link, onclick: verBorrar }, 'Borrar mi cuenta')));
}
function verCambiar() {
  poner(titulo('Cambiar la contraseña'),
    formulario([campo('Contraseña actual', 'actual', 'password', { autocomplete: 'current-password' }), campo('Contraseña nueva (minimo 8 caracteres)', 'nueva', 'password', { autocomplete: 'new-password', minLength: 8 })], 'Cambiarla', async (x) => {
      await pedir({ accion: 'clave_cambiar', token: D.op().cuenta.token, actual: x.actual.value, nueva: x.nueva.value }); verCuenta('Contraseña cambiada.');
    }), h('button', { type: 'button', estilo: ESTILO.boton, onclick: () => verCuenta() }, 'Volver'));
}
function verBorrar() {
  const op = D.op();
  poner(titulo('Borrar mi cuenta'), h('p', { estilo: ESTILO.nota }, 'Se borran tu mail y tu contraseña, y no se puede deshacer. Tu puntaje en el ranking y los edits que publicaste quedan con tu nombre, sin ningun dato personal.'),
    formulario([campo('Tu contraseña, para confirmar', 'clave', 'password', { autocomplete: 'current-password' }),
      op.nick ? h('label', { estilo: 'display:flex;gap:8px;align-items:center;margin:0 0 12px' }, h('input', { type: 'checkbox', name: 'soltar' }), `Dejar libre el nombre ${op.nick}, para que lo pueda usar otra persona`) : null].filter(Boolean), 'Borrarla para siempre', async (x) => {
      await pedir({ accion: 'borrar', token: op.cuenta.token, clave: x.clave.value, soltarNombre: !!(x.soltar && x.soltar.checked) });
      if (x.soltar && x.soltar.checked) op.pin = '';
      olvidarEnEsteAparato(); D.avisar('Tu cuenta se borro', 4); cerrar();
    }), h('button', { type: 'button', estilo: ESTILO.boton, onclick: () => verCuenta() }, 'Volver'));
}
// al arrancar: si la sesion se vencio o la cuenta ya no existe, este aparato se olvida del token; si cambio el nombre en otro aparato, se trae
export async function revisarCuenta() {
  if (!cuentaActiva()) return;
  try { aplicar(await pedir({ accion: 'yo', token: D.op().cuenta.token })); }
  catch (e) { if (e.codigo === 401) olvidarEnEsteAparato(); }
}
// cuando se elige un nombre con cuenta abierta, queda en la cuenta
export function nombreElegido() { if (cuentaActiva()) sumarNombreDelAparato().then((m) => { if (m) D.avisar(m, 5); }); }
