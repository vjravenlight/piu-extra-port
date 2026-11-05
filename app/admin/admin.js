// Panel del salon online: la pantalla de app\online\admin.php. Lo que escriben los jugadores nunca se mete como HTML:
// todo se arma con h(), que usa textContent.
'use strict';
const API = '../online/admin.php';
const app = document.getElementById('app'), dlg = document.getElementById('dialogo'), avisoEl = document.getElementById('aviso');
const yo = { usuario: null, rol: null };
const estado = { pestana: 'gente', datos: null, reloj: 0, filtro: { texto: '', aparato: '', situacion: '' }, chatFiltro: { texto: '', sistema: true } };
const APARATOS = { teclado: 'teclado', plataforma: 'plataforma o mando USB', tactil: 'celu o tablet' };
const SITUACION = { sala: 'en la sala', jugando: 'jugando', serie: 'en una serie' };

function h(tag, attrs, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'clase') e.className = v;
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat()) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}
// como replaceChildren, pero acepta listas y saltea lo que no va
function llenar(e, ...hijos) { e.replaceChildren(...hijos.flat().filter(c => c !== null && c !== undefined && c !== false)); }
async function pedir(cuerpo) {
  const r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  let j = {}; try { j = await r.json(); } catch (e) { /* un 500 sin JSON */ }
  if (!r.ok) {
    if (r.status === 401 && cuerpo.accion !== 'entrar' && yo.usuario) { yo.usuario = null; pantallaEntrada(); }
    throw new Error(j.error || 'El servidor no responde');
  }
  return j;
}
let avisoT = 0;
function avisar(t) { avisoEl.textContent = t; avisoEl.classList.add('ver'); clearTimeout(avisoT); avisoT = setTimeout(() => avisoEl.classList.remove('ver'), 3500); }
const hacer = (cuerpo, ok) => pedir(cuerpo).then(r => { if (ok) avisar(ok); return r; }).catch(e => { avisar(e.message); throw e; });
const hora = (t) => new Date(t * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const fecha = (t) => new Date(t * 1000).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const duracion = (s) => s === null ? '?' : s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor(s / 60) % 60} min`;
const hasta = (t) => t ? `hasta ${fecha(t)}` : 'para siempre';
const esAdmin = () => yo.rol === 'admin';

// ---------- el cuadro de preguntar: devuelve los valores o null ----------
function preguntar(titulo, campos, textoOk, peligro) {
  return new Promise((res) => {
    const form = h('form', { method: 'dialog', onsubmit: (e) => {
      e.preventDefault();
      const v = {}; for (const c of campos) { const el = form.elements[c.id]; v[c.id] = c.tipo === 'tilde' ? el.checked : el.value; }
      dlg.close(); res(v);
    } },
      h('h2', {}, titulo),
      campos.map(c => c.tipo === 'nota' ? h('p', { clase: 'nota' }, c.texto)
        : c.tipo === 'tilde' ? h('label', { clase: 'tilde' }, h('input', { type: 'checkbox', name: c.id, checked: !!c.valor }), c.texto)
        : c.opciones ? h('label', {}, c.texto, h('select', { name: c.id }, c.opciones.map(([v, t]) => h('option', { value: v, selected: String(c.valor) === String(v) }, t))))
        : h('label', {}, c.texto, h('input', { name: c.id, type: c.tipo || 'text', value: c.valor || '', maxLength: 120 }))),
      h('div', { clase: 'pie' },
        h('button', { type: 'button', onclick: () => { dlg.close(); res(null); } }, 'Cancelar'),
        h('button', { type: 'submit', clase: peligro ? 'peligro' : 'oro' }, textoOk)));
    dlg.replaceChildren(form);
    dlg.oncancel = () => res(null);
    dlg.showModal();
  });
}

// ---------- entrar ----------
function pantallaEntrada(mensaje) {
  clearInterval(estado.reloj);
  const err = h('p', { clase: 'error', role: 'alert' }, mensaje || '');
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try { Object.assign(yo, await pedir({ accion: 'entrar', usuario: form.elements.usuario.value, clave: form.elements.clave.value })); arrancar(); }
    catch (ex) { err.textContent = ex.message; }
  } },
    h('h1', {}, 'Panel del salón'),
    h('p', { clase: 'nota' }, 'Pump It Up Extra online. Solo para el equipo de moderación.'),
    h('label', {}, 'Mail', h('input', { name: 'usuario', type: 'email', autocomplete: 'username', required: true, autocapitalize: 'none', maxLength: 120 })),
    h('label', {}, 'Contraseña', h('input', { name: 'clave', type: 'password', autocomplete: 'current-password', required: true })),
    err, h('button', { clase: 'oro', type: 'submit' }, 'Entrar'),
    h('p', { style: 'margin:14px 0 0;text-align:center' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); pantallaOlvide(form.elements.usuario.value); } }, 'Me olvidé la contraseña')));
  app.replaceChildren(h('div', { clase: 'entrada' }, form));
}
function pantallaOlvide(mail) {
  const err = h('p', { clase: 'error', role: 'alert' }); let enviado = false;
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    try {
      if (!enviado) {
        await pedir({ accion: 'olvide', usuario: form.elements.usuario.value }); enviado = true;
        campos.hidden = false; form.elements.codigo.required = form.elements.nueva.required = true;
        boton.textContent = 'Cambiar la contraseña';
        err.textContent = 'Si ese mail tiene cuenta, te llegó un código. Mirá también en spam.';
      } else {
        await pedir({ accion: 'restablecer', usuario: form.elements.usuario.value, codigo: form.elements.codigo.value, nueva: form.elements.nueva.value });
        pantallaEntrada('Listo: entrá con tu contraseña nueva.');
      }
    } catch (ex) { err.textContent = ex.message; }
  } },
    h('h1', {}, 'Cambiar la contraseña'),
    h('label', {}, 'Tu mail', h('input', { name: 'usuario', type: 'email', autocomplete: 'username', required: true, value: mail || '', maxLength: 120 })));
  const campos = h('div', { hidden: true },
    h('label', {}, 'Código que te llegó', h('input', { name: 'codigo', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6 })),
    h('label', {}, 'Contraseña nueva (mínimo 10 caracteres)', h('input', { name: 'nueva', type: 'password', autocomplete: 'new-password', minLength: 10 })));
  const boton = h('button', { clase: 'oro', type: 'submit' }, 'Mandarme el código');
  form.append(campos, err, boton, h('p', { style: 'margin:14px 0 0;text-align:center' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); pantallaEntrada(); } }, 'Volver')));
  app.replaceChildren(h('div', { clase: 'entrada' }, form));
}
async function pantallaInvitacion(token) {
  let inv;
  try { inv = await pedir({ accion: 'invitacion_ver', token }); }
  catch (e) { pantallaEntrada(e.message); return; }
  const err = h('p', { clase: 'error', role: 'alert' });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (form.elements.clave.value !== form.elements.otra.value) { err.textContent = 'Las dos contraseñas no coinciden'; return; }
    try { Object.assign(yo, await pedir({ accion: 'invitacion_aceptar', token, usuario: form.elements.usuario.value, clave: form.elements.clave.value })); arrancar(); }
    catch (ex) { err.textContent = ex.message; }
  } },
    h('h1', {}, 'Sumate al equipo'),
    h('p', { clase: 'nota' }, `Vas a entrar como ${inv.rol === 'admin' ? 'administrador' : 'moderador'}. Poné tu mail y elegí una contraseña que solo sepas vos: con eso vas a entrar. Este link se usa una sola vez.`),
    h('label', {}, 'Tu mail', h('input', { name: 'usuario', type: 'email', autocomplete: 'username', required: true, autocapitalize: 'none', maxLength: 120 })),
    h('label', {}, 'Contraseña (mínimo 10 caracteres)', h('input', { name: 'clave', type: 'password', autocomplete: 'new-password', required: true, minLength: 10 })),
    h('label', {}, 'Repetí la contraseña', h('input', { name: 'otra', type: 'password', autocomplete: 'new-password', required: true, minLength: 10 })),
    err, h('button', { clase: 'oro', type: 'submit' }, 'Crear mi cuenta'));
  app.replaceChildren(h('div', { clase: 'entrada' }, form));
}

// ---------- el armazon ----------
const PESTANAS = () => [['gente', 'Gente'], ['chat', 'Chat'], ['sanciones', 'Sanciones'], ['filtrados', 'Filtrados'], ...(esAdmin() ? [['filtro', 'Filtro'], ['equipo', 'Equipo'], ['registro', 'Registro']] : [['cuenta', 'Mi cuenta']])];
let cuerpo;
function arrancar() {
  cuerpo = h('main', { clase: 'envoltura' });
  const nav = h('nav', { clase: 'pestanas envoltura', role: 'tablist', 'aria-label': 'Secciones' });
  const pintarNav = () => nav.replaceChildren(...PESTANAS().map(([id, t]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(estado.pestana === id), onclick: () => { estado.pestana = id; pintarNav(); mostrar(); } }, t)));
  pintarNav();
  app.replaceChildren(
    h('header', { clase: 'arriba' },
      h('div', { clase: 'envoltura' }, h('h1', {}, 'Panel del salón'),
        h('div', { clase: 'quien' }, h('span', {}, `${yo.usuario} · ${esAdmin() ? 'administrador' : 'moderador'}`),
          h('button', { type: 'button', onclick: async () => { await pedir({ accion: 'salir' }).catch(() => {}); yo.usuario = null; pantallaEntrada(); } }, 'Salir'))),
      nav),
    cuerpo);
  mostrar();
  clearInterval(estado.reloj);
  estado.reloj = setInterval(() => { if (!document.hidden && !dlg.open) refrescar(); }, 3000);
}
function mostrar() { ({ gente: verGente, chat: verChat, sanciones: verSanciones, filtrados: verFiltrados, filtro: verFiltro, equipo: verEquipo, registro: verRegistro, cuenta: verCuenta })[estado.pestana](); }
async function refrescar() {
  if (estado.pestana !== 'gente' && estado.pestana !== 'chat') return;
  // no pisar lo que se esta escribiendo: solo se repinta la lista
  try { estado.datos = await pedir({ accion: 'estado' }); (estado.pestana === 'gente' ? pintarGente : pintarChat)(); } catch (e) { /* el proximo intento */ }
}

// ---------- gente ----------
let listaGente, resumenGente;
async function verGente() {
  const f = estado.filtro;
  listaGente = h('div'); resumenGente = h('div', { clase: 'resumen' });
  cuerpo.replaceChildren(resumenGente,
    h('div', { clase: 'filtros' },
      h('input', { type: 'search', placeholder: 'Buscar por nombre', 'aria-label': 'Buscar por nombre', value: f.texto, oninput: (e) => { f.texto = e.target.value; pintarGente(); } }),
      h('select', { 'aria-label': 'Con qué juega', onchange: (e) => { f.aparato = e.target.value; pintarGente(); } }, h('option', { value: '' }, 'Cualquier aparato'), Object.entries(APARATOS).map(([k, t]) => h('option', { value: k, selected: f.aparato === k }, t))),
      h('select', { 'aria-label': 'Situación', onchange: (e) => { f.situacion = e.target.value; pintarGente(); } }, [['', 'Todos'], ['sala', 'En la sala'], ['jugando', 'Jugando'], ['silenciados', 'Silenciados'], ['avisos', 'Con avisos del filtro']].map(([k, t]) => h('option', { value: k, selected: f.situacion === k }, t)))),
    listaGente);
  if (estado.datos) pintarGente();
  await refrescar();
}
function pintarGente() {
  if (!listaGente || !estado.datos) return;
  const d = estado.datos, f = estado.filtro, t = f.texto.trim().toLowerCase();
  const js = d.jugadores.filter(j => (!t || j.nick.toLowerCase().includes(t)) && (!f.aparato || j.aparato === f.aparato)
    && (!f.situacion || (f.situacion === 'silenciados' ? j.silencio : f.situacion === 'avisos' ? j.avisos > 0 : j.estado === f.situacion)));
  llenar(resumenGente,
    h('span', {}, h('b', {}, String(d.jugadores.length)), ' conectados'),
    h('span', {}, h('b', {}, String(d.jugadores.filter(j => j.estado === 'jugando').length)), ' jugando'),
    h('span', {}, h('b', {}, String(d.partidas)), ' partidas'),
    d.torneo ? h('span', {}, 'Torneo: ', h('b', {}, `${d.torneo.anotados}`), ` anotados (${d.torneo.estado})`) : null,
    d.chatAbierto ? null : h('span', { clase: 'chapa rojo' }, 'Chat cerrado'));
  if (!js.length) { listaGente.replaceChildren(h('p', { clase: 'vacio' }, d.jugadores.length ? 'Nadie coincide con esos filtros.' : 'No hay nadie conectado ahora.')); return; }
  listaGente.replaceChildren(...js.map(tarjetaPersona));
}
function tarjetaPersona(j) {
  return h('article', { clase: 'tarjeta persona' },
    h('div', { clase: 'cabeza' }, h('span', { clase: 'nombre' }, j.nick),
      h('span', { clase: 'chapa' + (j.estado === 'jugando' ? ' verde' : '') }, SITUACION[j.estado] || j.estado),
      j.protegido ? h('span', { clase: 'chapa', title: 'Tiene clave del nombre' }, 'con clave') : null,
      j.torneo ? h('span', { clase: 'chapa oro' }, 'en el torneo') : null,
      j.silencio ? h('span', { clase: 'chapa rojo' }, `silenciado ${hasta(j.silencio.hasta)}`) : null,
      j.avisos ? h('span', { clase: 'chapa oro' }, `${j.avisos} ${j.avisos === 1 ? 'aviso' : 'avisos'} del filtro`) : null),
    h('div', { clase: 'datos' }, [
      j.aparato ? `Con ${APARATOS[j.aparato]}` : 'Sin decir con qué juega',
      j.conectado !== null ? `conectado hace ${duracion(j.conectado)}` : null,
      j.rival ? `contra ${j.rival}, canción ${j.cancion} ${j.modo}` : null,
      j.conexion ? `conexión ${j.conexion}` : null].filter(Boolean).join(' · ')),
    accionesPersona(j));
}
function accionesPersona(j) {
  return h('div', { clase: 'acciones' },
    j.silencio ? h('button', { type: 'button', onclick: () => hacer({ accion: 'sancion_quitar', id: j.silencio.id }, 'Silencio levantado').then(refrescar) }, 'Quitar silencio')
      : h('button', { type: 'button', onclick: () => silenciar(j) }, 'Silenciar'),
    h('button', { type: 'button', onclick: () => echar(j) }, 'Echar'),
    h('button', { type: 'button', clase: 'peligro', onclick: () => bloquear(j) }, 'Bloquear'));
}
const DURACIONES_SILENCIO = [[10, '10 minutos'], [60, '1 hora'], [1440, '1 día'], [10080, '7 días']];
async function silenciar(j) {
  const v = await preguntar(`Silenciar a ${j.nick}`, [{ id: 'minutos', texto: 'Por cuánto', opciones: DURACIONES_SILENCIO, valor: 60 }, { id: 'motivo', texto: 'Motivo (opcional)' }], 'Silenciar');
  if (v) hacer({ accion: 'silenciar', id: j.id, ...v }, `${j.nick} silenciado`).then(refrescar).catch(() => {});
}
async function echar(j) {
  const v = await preguntar(`Echar a ${j.nick}`, [{ tipo: 'nota', texto: 'Sale del salón y no puede volver por 5 minutos, ni con otro nombre desde la misma conexión. Si estaba jugando, abandona la partida.' }, { id: 'motivo', texto: 'Motivo (lo ve la persona)' }], 'Echar', true);
  if (v) hacer({ accion: 'echar', id: j.id, ...v }, `${j.nick} fuera`).then(refrescar).catch(() => {});
}
async function bloquear(j) {
  const opciones = [[1, '1 hora'], [24, '1 día'], [168, '7 días'], [720, '30 días'], ...(esAdmin() ? [[0, 'Para siempre']] : [])];
  const v = await preguntar(`Bloquear a ${j.nick}`, [
    { tipo: 'nota', texto: 'No puede entrar al salón. Por conexión alcanza también a quien comparta su red (familia, cyber), así que usalo con cuidado.' },
    { id: 'horas', texto: 'Por cuánto', opciones, valor: 24 }, { id: 'porConexion', tipo: 'tilde', texto: 'Bloquear también su conexión', valor: true }, { id: 'motivo', texto: 'Motivo (lo ve la persona)' }], 'Bloquear', true);
  if (v) hacer({ accion: 'bloquear', id: j.id, nick: j.nick, horas: +v.horas, motivo: v.motivo, sinHuella: !v.porConexion }, `${j.nick} bloqueado`).then(refrescar).catch(() => {});
}

// ---------- chat ----------
let listaChat;
async function verChat() {
  const f = estado.chatFiltro;
  listaChat = h('div', { clase: 'seccion', style: 'padding:0' });
  cuerpo.replaceChildren(
    h('div', { clase: 'filtros', style: 'grid-template-columns:2fr 1fr' },
      h('input', { type: 'search', placeholder: 'Buscar por persona o por texto', 'aria-label': 'Buscar en el chat', value: f.texto, oninput: (e) => { f.texto = e.target.value; pintarChat(); } }),
      h('label', { clase: 'tilde' }, h('input', { type: 'checkbox', checked: f.sistema, onchange: (e) => { f.sistema = e.target.checked; pintarChat(); } }), 'Avisos del salón')),
    listaChat);
  if (estado.datos) pintarChat();
  await refrescar();
}
function pintarChat() {
  if (!listaChat || !estado.datos) return;
  const f = estado.chatFiltro, t = f.texto.trim().toLowerCase();
  const ms = estado.datos.chat.filter(m => (f.sistema || !m.sistema) && (!t || (m.nick || '').toLowerCase().includes(t) || m.texto.toLowerCase().includes(t) || (m.original || '').toLowerCase().includes(t))).reverse();
  if (!ms.length) { listaChat.replaceChildren(h('p', { clase: 'vacio' }, 'No hay mensajes para mostrar.')); return; }
  listaChat.replaceChildren(...ms.map(m => {
    const j = m.id ? estado.datos.jugadores.find(x => x.id === m.id) : null;
    return h('div', { clase: 'mensaje' + (m.sistema ? ' sistema' : '') },
      h('div', { clase: 'txt' }, h('span', { clase: 'hora' }, hora(m.t)), m.nick ? h('span', { clase: 'autor' }, m.nick + ': ') : null, m.texto, m.original ? h('span', { clase: 'orig' }, `Escribió: ${m.original}`) : null),
      h('div', { clase: 'botones' },
        j && !j.silencio ? h('button', { type: 'button', onclick: () => silenciar(j) }, 'Silenciar') : null,
        h('button', { type: 'button', clase: 'peligro', onclick: () => hacer({ accion: 'chat_borrar', n: m.n }, 'Mensaje borrado').then(refrescar).catch(() => {}) }, 'Borrar')));
  }));
}

// ---------- sanciones ----------
async function verSanciones() {
  cuerpo.replaceChildren(h('p', { clase: 'vacio' }, 'Cargando...'));
  const { sanciones } = await hacer({ accion: 'sanciones' });
  const nueva = async (tipo) => {
    const opciones = tipo === 'silencio' ? DURACIONES_SILENCIO : [[1, '1 hora'], [24, '1 día'], [168, '7 días'], [720, '30 días'], ...(esAdmin() ? [[0, 'Para siempre']] : [])];
    const v = await preguntar(tipo === 'silencio' ? 'Silenciar por nombre' : 'Bloquear por nombre', [{ id: 'nick', texto: 'Nombre en el juego' }, { id: 'dur', texto: 'Por cuánto', opciones, valor: tipo === 'silencio' ? 60 : 24 }, { id: 'motivo', texto: 'Motivo (opcional)' }], tipo === 'silencio' ? 'Silenciar' : 'Bloquear', tipo !== 'silencio');
    if (!v) return;
    await hacer(tipo === 'silencio' ? { accion: 'silenciar', nick: v.nick, minutos: +v.dur, motivo: v.motivo } : { accion: 'bloquear', nick: v.nick, horas: +v.dur, motivo: v.motivo }, 'Listo').catch(() => {});
    verSanciones();
  };
  llenar(cuerpo,
    h('div', { clase: 'acciones', style: 'margin:0 0 12px' }, h('button', { type: 'button', onclick: () => nueva('silencio') }, 'Silenciar por nombre'), h('button', { type: 'button', onclick: () => nueva('bloqueo') }, 'Bloquear por nombre')),
    h('p', { clase: 'nota' }, 'Echar a alguien aparece acá como un bloqueo de 5 minutos.'),
    sanciones.length ? sanciones.slice().reverse().map(s => h('article', { clase: 'tarjeta' },
      h('div', { clase: 'persona' }, h('div', { clase: 'cabeza' }, h('span', { clase: 'nombre' }, s.nombre), h('span', { clase: 'chapa rojo' }, s.tipo === 'silencio' ? 'silenciado' : 'bloqueado'), s.conConexion ? h('span', { clase: 'chapa' }, 'también su conexión') : null)),
      h('div', { clase: 'datos' }, `${hasta(s.hasta)} · puesto por ${s.por} el ${fecha(s.desde)}${s.motivo ? ` · ${s.motivo}` : ''}`),
      s.tipo === 'bloqueo' && !esAdmin() ? null : h('div', { clase: 'acciones' }, h('button', { type: 'button', onclick: () => hacer({ accion: 'sancion_quitar', id: s.id }, 'Levantada').then(verSanciones).catch(() => {}) }, s.tipo === 'silencio' ? 'Quitar silencio' : 'Levantar bloqueo')))) : h('p', { clase: 'vacio' }, 'No hay sanciones activas.'));
}

// ---------- filtrados ----------
async function verFiltrados() {
  cuerpo.replaceChildren(h('p', { clase: 'vacio' }, 'Cargando...'));
  const { filtrados } = await hacer({ accion: 'filtrados' });
  cuerpo.replaceChildren(
    h('p', { clase: 'nota' }, 'Lo que tapó el filtro, tal como lo escribieron. Sirve para ver si acertó: si tapó una palabra normal, sumala a "Palabras permitidas".'),
    h('div', { clase: 'seccion', style: 'padding:0' }, filtrados.length ? filtrados.map(f => h('div', { clase: 'mensaje' }, h('div', { clase: 'txt' }, h('span', { clase: 'hora' }, fecha(f.t)), h('span', { clase: 'autor' }, f.nick + ': '), f.tapado, h('span', { clase: 'orig' }, `Escribió: ${f.original}`)))) : h('p', { clase: 'vacio' }, 'Todavía no tapó nada.')));
}

// ---------- filtro (admin) ----------
const aLista = (t) => t.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
async function verFiltro() {
  cuerpo.replaceChildren(h('p', { clase: 'vacio' }, 'Cargando...'));
  const { config: c, idiomas } = await hacer({ accion: 'filtro_leer' });
  const tilde = (id, texto, valor) => h('label', { clase: 'tilde' }, h('input', { type: 'checkbox', name: id, checked: !!valor }), texto);
  const num = (id, texto, valor, max) => h('label', {}, texto, h('input', { type: 'number', name: id, value: valor, min: 1, max, inputMode: 'numeric' }));
  const resultado = h('div', { clase: 'resultado', hidden: true });
  const prueba = h('input', { 'aria-label': 'Texto de prueba', placeholder: 'Escribí algo para ver qué tapa' });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const x = form.elements;
    await hacer({ accion: 'filtro_guardar', activo: x.activo.checked, nombres: x.nombres.checked, chatAbierto: x.chatAbierto.checked,
      apagados: idiomas.filter(i => !x['idioma_' + i.id].checked).map(i => i.id), propias: aLista(x.propias.value), permitidas: aLista(x.permitidas.value),
      auto: { activo: x.autoActivo.checked, avisos: +x.avisos.value, ventanaMin: +x.ventanaMin.value, silencioMin: +x.silencioMin.value, silenciosParaBloquear: +x.silenciosParaBloquear.value, bloqueoHoras: +x.bloqueoHoras.value } }, 'Filtro guardado').catch(() => {});
  } },
    h('section', { clase: 'seccion' }, h('h2', {}, 'Prendido o apagado'), h('p', { clase: 'nota' }, 'Cada cosa se habilita o deshabilita por separado.'),
      tilde('chatAbierto', 'Chat abierto (si lo apagás, nadie puede escribir)', c.chatAbierto),
      tilde('activo', 'Filtrar el chat (tapa las palabras con asteriscos)', c.activo),
      tilde('nombres', 'Filtrar los nombres (no deja usar uno con una palabra prohibida)', c.nombres)),
    h('section', { clase: 'seccion' }, h('h2', {}, 'Sanciones automáticas'), h('p', { clase: 'nota' }, 'Cada mensaje tapado es un aviso. Quedan en el registro con el autor "automatico".'),
      tilde('autoActivo', 'Sancionar solo al que insiste', c.auto.activo),
      h('div', { clase: 'numeros', style: 'margin-top:10px' },
        num('avisos', 'Avisos para silenciar', c.auto.avisos, 20), num('ventanaMin', 'En cuántos minutos', c.auto.ventanaMin, 1440), num('silencioMin', 'Minutos de silencio', c.auto.silencioMin, 10080),
        num('silenciosParaBloquear', 'Silencios en un día para bloquear', c.auto.silenciosParaBloquear, 20), num('bloqueoHoras', 'Horas de bloqueo', c.auto.bloqueoHoras, 720))),
    h('section', { clase: 'seccion' }, h('h2', {}, 'Idiomas'), h('p', { clase: 'nota' }, 'Las listas son públicas y las revisé para sacar palabras comunes, pero no son perfectas: si un idioma tapa de más, apagalo o usá "Palabras permitidas".'),
      h('div', { clase: 'idiomas' }, idiomas.map(i => h('label', { clase: 'tilde' }, h('input', { type: 'checkbox', name: 'idioma_' + i.id, checked: !c.apagados.includes(i.id) }), h('span', {}, i.nombre, ' ', h('small', {}, `(${i.palabras})`)))))),
    h('section', { clase: 'seccion' }, h('h2', {}, 'Tus palabras'),
      h('label', { style: 'margin-top:10px' }, 'Palabras prohibidas propias (una por renglón o separadas por coma)', h('textarea', { name: 'propias', value: c.propias.join('\n') })),
      h('label', {}, 'Palabras permitidas: el filtro nunca las tapa', h('textarea', { name: 'permitidas', value: c.permitidas.join('\n') }))),
    h('div', { clase: 'acciones', style: 'margin-bottom:14px' }, h('button', { clase: 'oro', type: 'submit' }, 'Guardar el filtro')));
  cuerpo.replaceChildren(
    h('section', { clase: 'seccion' }, h('h2', {}, 'Probar'), h('p', { clase: 'nota' }, 'Usa el filtro guardado. No se publica nada.'),
      h('div', { clase: 'filtros', style: 'grid-template-columns:1fr auto' }, prueba, h('button', { type: 'button', onclick: async () => {
        const r = await hacer({ accion: 'filtro_probar', texto: prueba.value }); resultado.hidden = false;
        resultado.textContent = `Chat: ${r.tapado}  ·  Como nombre: ${r.nombreProhibido ? 'no se puede usar' : 'se puede usar'}`;
      } }, 'Probar')), resultado),
    form);
}

// ---------- equipo (admin) ----------
async function verEquipo() {
  cuerpo.replaceChildren(h('p', { clase: 'vacio' }, 'Cargando...'));
  const { cuentas, invitaciones, yo: mio } = await hacer({ accion: 'cuentas' });
  const linkEl = h('div');
  const invitar = async (rol) => {
    const r = await hacer({ accion: 'invitar', rol });
    const url = `${location.origin}${location.pathname}#invitacion=${r.token}`;
    linkEl.replaceChildren(h('h3', {}, `Link para ${rol === 'admin' ? 'un administrador' : 'un moderador'}`),
      h('p', { clase: 'nota' }, `Mandáselo por un canal privado. La persona elige su propia contraseña. Se usa una sola vez. Vence: ${fecha(r.vence)}`),
      h('code', { clase: 'link' }, url),
      h('button', { type: 'button', onclick: () => navigator.clipboard.writeText(url).then(() => avisar('Link copiado'), () => avisar('Copialo a mano')) }, 'Copiar link'));
  };
  const cambiar = (c, cambio, ok) => hacer({ accion: 'cuenta_cambiar', usuario: c.usuario, ...cambio }, ok).then(verEquipo).catch(() => {});
  llenar(cuerpo,
    h('section', { clase: 'seccion' }, h('h2', {}, 'Sumar a alguien'), h('p', { clase: 'nota' }, 'Generás un link y esa persona crea su cuenta. Nunca hace falta pasar contraseñas.'),
      h('div', { clase: 'acciones' }, h('button', { clase: 'oro', type: 'button', onclick: () => invitar('moderador') }, 'Invitar moderador'), h('button', { type: 'button', onclick: () => invitar('admin') }, 'Invitar administrador')),
      linkEl, invitaciones.length ? h('p', { clase: 'nota', style: 'margin-top:12px' }, `Links sin usar: ${invitaciones.map(i => `${i.rol} (vence ${fecha(i.vence)})`).join(' · ')}`) : null),
    cuentas.map(c => h('article', { clase: 'tarjeta persona' },
      h('div', { clase: 'cabeza' }, h('span', { clase: 'nombre' }, c.usuario), h('span', { clase: 'chapa' + (c.rol === 'admin' ? ' oro' : '') }, c.rol === 'admin' ? 'administrador' : 'moderador'), c.activa ? h('span', { clase: 'chapa verde' }, 'habilitada') : h('span', { clase: 'chapa rojo' }, 'deshabilitada'), c.usuario === mio ? h('span', { clase: 'chapa' }, 'sos vos') : null),
      h('div', { clase: 'datos' }, `Desde ${fecha(c.creada)}${c.por ? ` · la invitó ${c.por}` : ''}`),
      h('div', { clase: 'acciones' },
        h('button', { type: 'button', onclick: () => cambiar(c, { activa: !c.activa }, c.activa ? 'Deshabilitada' : 'Habilitada') }, c.activa ? 'Deshabilitar' : 'Habilitar'),
        h('button', { type: 'button', onclick: () => cambiar(c, { rol: c.rol === 'admin' ? 'moderador' : 'admin' }, 'Rol cambiado') }, c.rol === 'admin' ? 'Pasar a moderador' : 'Pasar a administrador'),
        h('button', { type: 'button', clase: 'peligro', onclick: async () => { if (await preguntar(`Sacar a ${c.usuario} del equipo`, [{ tipo: 'nota', texto: 'Se borra su cuenta. Para que vuelva hay que invitarlo de nuevo.' }], 'Sacar', true)) cambiar(c, { sacar: true }, 'Fuera del equipo'); } }, 'Sacar')))),
    seccionClave());
}
function seccionClave() {
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    await hacer({ accion: 'clave_cambiar', actual: form.elements.actual.value, nueva: form.elements.nueva.value }, 'Contraseña cambiada').then(() => form.reset()).catch(() => {});
  } },
    h('label', {}, 'Contraseña actual', h('input', { name: 'actual', type: 'password', autocomplete: 'current-password', required: true })),
    h('label', {}, 'Contraseña nueva (mínimo 10 caracteres)', h('input', { name: 'nueva', type: 'password', autocomplete: 'new-password', required: true, minLength: 10 })),
    h('button', { type: 'submit' }, 'Cambiar mi contraseña'));
  return h('section', { clase: 'seccion' }, h('h2', { style: 'margin-bottom:12px' }, 'Mi contraseña'), form);
}
function verCuenta() { cuerpo.replaceChildren(seccionClave()); }

// ---------- registro (admin) ----------
async function verRegistro() {
  cuerpo.replaceChildren(h('p', { clase: 'vacio' }, 'Cargando...'));
  const { registro } = await hacer({ accion: 'registro' });
  cuerpo.replaceChildren(h('div', { clase: 'seccion', style: 'padding:0' }, registro.length ? registro.map(r => h('div', { clase: 'mensaje' }, h('div', { clase: 'txt' }, h('span', { clase: 'hora' }, fecha(r.t)), h('span', { clase: 'autor' }, r.por + ' '), r.que, r.detalle ? `: ${r.detalle}` : ''))) : h('p', { clase: 'vacio' }, 'Todavía no hay nada.')));
}

// ---------- arranque ----------
(async () => {
  const m = location.hash.match(/^#(?:invitacion|alta)=([0-9a-f]+)$/);
  if (m) { history.replaceState(null, '', location.pathname); await pantallaInvitacion(m[1]); return; }
  try { Object.assign(yo, await pedir({ accion: 'sesion' })); } catch (e) { pantallaEntrada(e.message); return; }
  if (yo.usuario) arrancar(); else pantallaEntrada();
})();
