// La parte del hosting con los edits de la comunidad (Charles 05/11: "desde el celu tambien quiero descargar los edits, una
// parte en el hosting donde guarda las modificaciones del editor"). Lee lo mismo que el juego: api.php comunidad_lista y
// comunidad_leer. Lo que escribe la gente nunca se mete como HTML: todo va con textContent.
'use strict';
const API = '../online/api.php', MODOS = { n: 'NORMAL', h: 'HARD', x: 'CRAZY' };
const lista = document.getElementById('lista'), cuantos = document.getElementById('cuantos'), buscar = document.getElementById('buscar'), modo = document.getElementById('modo'), avisoEl = document.getElementById('aviso');
let edits = [], avisoT = 0;
const nombreDe = (n) => (window.PIU_CANCIONES || {})[n] || `Canción ${n}`;
const datosDe = (a) => { const m = /^(\d\d)_(db|([nhx])([12]))\.not$/.exec(a) || []; return m[2] === 'db' ? { modo: 'DOUBLE', versus: false } : { modo: MODOS[m[3]] || '', versus: m[4] === '2' }; };
const avisar = (t) => { avisoEl.textContent = t; avisoEl.classList.add('ver'); clearTimeout(avisoT); avisoT = setTimeout(() => avisoEl.classList.remove('ver'), 3500); };
async function pedir(cuerpo) {
  const r = await fetch(API, { method: 'POST', body: JSON.stringify(cuerpo) }); const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'El servidor no responde');
  return j;
}
async function bajar(e, boton) {
  boton.disabled = true;
  try {
    const j = await pedir({ accion: 'comunidad_leer', id: e.id }), bytes = Uint8Array.from(atob(j.datos), c => c.charCodeAt(0));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); a.download = j.archivo.toUpperCase();
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    avisar(`Bajado ${a.download}`);
  } catch (er) { avisar('No se pudo bajar: ' + er.message); }
  boton.disabled = false;
}
function tarjeta(e) {
  const d = datosDe(e.archivo), art = document.createElement('article'); art.className = 'tarjeta persona';
  const cab = document.createElement('div'); cab.className = 'cabeza';
  const n = document.createElement('span'); n.className = 'nombre'; n.textContent = nombreDe(e.cancion);
  const c = document.createElement('span'); c.className = 'chapa oro'; c.textContent = d.modo + (d.versus ? ' VERSUS' : '');
  cab.append(n, c);
  const dat = document.createElement('div'); dat.className = 'datos'; dat.textContent = `Por ${e.nick} · ${e.flechas} flechas · ${e.fecha}`;
  const acc = document.createElement('div'); acc.className = 'acciones';
  const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Bajar el .NOT'; b.addEventListener('click', () => bajar(e, b));
  acc.append(b); art.append(cab, dat, acc);
  return art;
}
function pintar() {
  const t = buscar.value.trim().toLowerCase(), m = modo.value;
  const ve = edits.filter(e => (!t || nombreDe(e.cancion).toLowerCase().includes(t) || e.nick.toLowerCase().includes(t)) && (!m || datosDe(e.archivo).modo === m));
  cuantos.textContent = edits.length ? `${ve.length} de ${edits.length} edits` : '';
  if (!ve.length) { const p = document.createElement('p'); p.className = 'vacio'; p.textContent = edits.length ? 'Ningún edit coincide con esa búsqueda.' : 'Todavía no hay edits publicados.'; lista.replaceChildren(p); return; }
  lista.replaceChildren(...ve.map(tarjeta));
}
buscar.addEventListener('input', pintar); modo.addEventListener('change', pintar);
pedir({ accion: 'comunidad_lista', cancion: 0 }).then((j) => { edits = j.edits; pintar(); }).catch((er) => { const p = document.createElement('p'); p.className = 'vacio'; p.textContent = 'No se pudo leer la lista: ' + er.message; lista.replaceChildren(p); });
