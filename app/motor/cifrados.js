// Descifrado de lo que trae el disco de Pump It Up Extra (todo descubierto el 04/10/2026, ver investigacion\FORMATOS.md).
// - Musica .AUD y caratulas .PNZ: bits de cada byte espejados + XOR con una llave de 1024 bytes que cada archivo
//   lee desde otra posicion. La llave NO viene en este codigo: se deduce del propio disco (derivarLlave).
// - Pasos .NOT (formato B) y paquetes RES de Andamiro: XOR k, k arranca en 0xD2 y suma 0x95 por byte.
// - Paquetes de F2 System: sin cifrar.

export const ESPEJO = new Uint8Array(256);
for (let x = 0; x < 256; x++) { let r = 0; for (let b = 0; b < 8; b++) if (x & (1 << b)) r |= 1 << (7 - b); ESPEJO[x] = r; }

const P = 1024;
const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SR1 = [44100, 48000, 32000, 0];

// largo de un cuadro MPEG-1 capa III (para deducir la llave)
function largoMp1(m, i) {
  if (m[i] !== 0xFF || (m[i + 1] & 0xFE) !== 0xFA) return 0;
  const br = BR1[m[i + 2] >> 4], sr = SR1[(m[i + 2] >> 2) & 3];
  if (!br || !sr) return 0;
  return Math.floor(144000 * br / sr) + ((m[i + 2] >> 1) & 1);
}
// largo de un cuadro de capa III (MPEG-1, 2 o 2.5)
function largoMp3(m, i) {
  if (i + 3 >= m.length || m[i] !== 0xFF || (m[i + 1] & 0xE0) !== 0xE0) return 0;
  const ver = (m[i + 1] >> 3) & 3, capa = (m[i + 1] >> 1) & 3;
  if (capa !== 1 || ver === 1) return 0;
  const bri = m[i + 2] >> 4, sri = (m[i + 2] >> 2) & 3, pad = (m[i + 2] >> 1) & 1;
  if (bri === 0 || bri === 15 || sri === 3) return 0;
  let sr = SR1[sri]; if (ver === 2) sr /= 2; else if (ver === 0) sr /= 4;
  return ver === 3 ? Math.floor(144000 * BR1[bri] / sr) + pad : Math.floor(72000 * BR2[bri] / sr) + pad;
}

function xorLlave(q, llave) { const o = new Uint8Array(q.length); for (let i = 0; i < q.length; i++) o[i] = q[i] ^ llave[i & 1023]; return o; }
function aplicar(llave, votos) {
  for (let k = 0; k < P; k++) { let mejor = -1, mv = 0; for (let v = 0; v < 256; v++) { const x = votos[k * 256 + v]; if (x > mv) { mv = x; mejor = v; } } if (mejor >= 0) llave[k] = mejor; }
}

// Deduce la llave de 1024 bytes a partir de un .AUD cuyo MP3 empieza alineado con la llave (en este disco: Piu/Audio/05.AUD).
// Mismo procedimiento que funciono el 04/10: moda por columna, 3 vueltas tolerantes y 4 estrictas con los encabezados MP3.
export function derivarLlave(aud) {
  const q = new Uint8Array(aud.length); for (let i = 0; i < aud.length; i++) q[i] = ESPEJO[aud[i]];
  const llave = new Uint8Array(P);
  for (let k = 0; k < P; k++) { const h = new Int32Array(256); for (let i = k; i < q.length; i += P) h[q[i]]++; let b = 0; for (let v = 1; v < 256; v++) if (h[v] > h[b]) b = v; llave[k] = b; }
  const es = (v, h) => v === h || v === ((~h) & 0xFF);
  const tol = (r, i) => es(r[i], 0xFF) && es(r[i + 1], 0xFB) && (es(r[i + 2] & 0xFD, 0x90) || es(r[i + 2] | 0x02, 0x92));
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const r = xorLlave(q, llave), votos = new Int32Array(P * 256);
    for (let i = 0; i + 430 < r.length; i++) {
      if (!tol(r, i)) continue;
      let pad = -1; if (tol(r, i + 417)) pad = 0; else if (tol(r, i + 418)) pad = 1; if (pad < 0) continue;
      const h = [0xFF, 0xFB, 0x90 | (pad << 1)];
      for (let t = 0; t < 3; t++) votos[((i + t) % P) * 256 + (q[i + t] ^ h[t])]++;
    }
    aplicar(llave, votos);
  }
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const m = xorLlave(q, llave), votos = new Int32Array(P * 256);
    for (let i = 0; i + 1500 < m.length; i++) {
      const L = largoMp1(m, i); if (L < 96) continue; if (largoMp1(m, i + L) < 96) continue;
      for (let t = 0; t < 4; t++) votos[((i + t) % P) * 256 + (q[i + t] ^ m[i + t])]++;
    }
    aplicar(llave, votos);
  }
  return llave;
}

// .AUD -> MP3: busca el corrimiento de la llave y el primer cuadro (seguido de 6 cuadros validos)
export function descifrarAudio(c, llave) {
  const lim = Math.min(c.length, 4096), m = new Uint8Array(Math.min(c.length, 4096 + 12000));
  for (let s = 0; s < P; s++) {
    for (let i = 0; i < m.length; i++) m[i] = ESPEJO[c[i]] ^ llave[(i + s) & 1023];
    for (let st = 0; st < lim; st++) {
      if (m[st] !== 0xFF) continue;
      let pos = st, n = 0;
      while (n < 6) { const L = largoMp3(m, pos); if (L < 24 || pos + L + 4 >= m.length) break; pos += L; n++; }
      if (n === 6) {
        const o = new Uint8Array(c.length - st);
        for (let i = st; i < c.length; i++) o[i - st] = ESPEJO[c[i]] ^ llave[(i + s) & 1023];
        return o;
      }
    }
  }
  return null;
}

// .PNZ -> PNG (4 bytes de encabezado y despues el PNG)
const FIRMA_PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52];
export function descifrarPnz(c, llave) {
  for (let s = 0; s < P; s++) {
    let t = 0; for (; t < 16; t++) if ((ESPEJO[c[4 + t]] ^ llave[(4 + t + s) & 1023]) !== FIRMA_PNG[t]) break;
    if (t === 16) { const o = new Uint8Array(c.length - 4); for (let i = 4; i < c.length; i++) o[i - 4] = ESPEJO[c[i]] ^ llave[(i + s) & 1023]; return o; }
  }
  return null;
}

// XOR de Andamiro (pasos B, paquetes RES): k arranca en 0xD2 y suma 0x95 por byte
export function xorAndamiro(c, desde, n) {
  const o = new Uint8Array(n); let k = 0xD2;
  for (let i = 0; i < n; i++) { o[i] = c[desde + i] ^ k; k = (k + 0x95) & 0xFF; }
  return o;
}

const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const ascii = (b, o, n) => { let s = ''; for (let i = 0; i < n && b[o + i]; i++) s += b[o + i] < 0x80 ? String.fromCharCode(b[o + i]) : '?'; return s; };
const r3 = (f) => Math.round(f * 1000) / 1000;

// .NOT -> el mismo objeto que tools\convertir_pasos.ps1 (formatos A y B)
export function leerPasos(nombre, c) {
  const v = dv(c);
  const a = c.length >= 8 && ascii(c, 0, 8) === 'pump 5.0';
  const bpms = [], valores = [], cambios = [];
  let porPulso, numero, N, titulo = '';
  const notas = [], largas = [], extras = [];
  if (a) {
    N = v.getUint16(0x0A, true);
    for (let i = 0; i < 10; i++) { bpms.push(r3(v.getFloat32(0x10 + 4 * i, true))); valores.push(v.getInt32(0x38 + 4 * i, true)); cambios.push(v.getInt32(0x60 + 4 * i, true)); }
    porPulso = v.getInt32(0x88, true); numero = v.getInt32(0x90, true);
    const t1 = (r) => v.getUint16(216 + 2 * r, true), t2 = (r) => v.getUint16(216 + 2 * (N + r), true), t3 = (r) => v.getUint16(216 + 2 * (2 * N + r), true);
    const abierta = new Array(10).fill(-1), enLarga = new Uint8Array(N * 10);
    for (let r = 0; r < N; r++) for (let col = 0; col < 10; col++) {
      const bit = 1 << (9 - col);
      if (t2(r) & bit) abierta[col] = r;
      if ((t3(r) & bit) && abierta[col] >= 0) { largas.push([col, abierta[col], r]); for (let q = abierta[col]; q <= r; q++) enLarga[q * 10 + col] = 1; abierta[col] = -1; }
    }
    for (let r = 0; r < N; r++) for (let col = 0; col < 10; col++) if ((t1(r) & (1 << (9 - col))) && !enLarga[r * 10 + col]) notas.push([r, col]);
  } else {
    N = v.getInt32(0, true);
    for (let i = 0; i < 4; i++) { bpms.push(r3(v.getFloat32(0x08 + 4 * i, true))); valores.push(v.getInt32(0x18 + 4 * i, true)); cambios.push(v.getInt32(0x28 + 4 * i, true)); }
    porPulso = v.getInt32(0x38, true); numero = v.getInt32(0x40, true);
    titulo = ascii(c, 0x44, 0x40);
    const p = xorAndamiro(c, 0x88, Math.min(N * 4, c.length - 0x88)), pv = dv(p);
    for (let j = 0; j < N && 4 * j + 3 < p.length; j++) {
      const r = pv.getUint16(4 * j, true), m = pv.getUint16(4 * j + 2, true);
      for (let col = 0; col < 13; col++) if (m & (1 << (15 - col))) (col < 10 ? notas : extras).push([r, col]);
    }
  }
  const doble = /_(DB|XD)/i.test(nombre);
  let usaDerecho = false, espejo = true;
  const porFila = new Map();
  for (const [f, col] of notas) { porFila.set(f, (porFila.get(f) || 0) | (1 << col)); if (col >= 5) usaDerecho = true; }
  for (const [col, d] of largas) { porFila.set(d, (porFila.get(d) || 0) | (1 << col)); if (col >= 5) usaDerecho = true; }
  for (const m of porFila.values()) if ((m & 0x1F) !== ((m >> 5) & 0x1F)) espejo = false;
  const ladosDistintos = !doble && usaDerecho && !espejo;
  let notasF = notas, largasF = largas;
  if (!doble && usaDerecho && espejo) { notasF = notas.filter(n => n[1] < 5); largasF = largas.filter(l => l[0] < 5); }
  notasF.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let ultima = 0; for (const n of notasF) ultima = Math.max(ultima, n[0]); for (const l of largasF) ultima = Math.max(ultima, l[2]);
  const o = { archivo: nombre, formato: a ? 'A' : 'B', tipo: doble ? 'doble' : 'simple', ladosDistintos, numeroInterno: numero };
  if (titulo) o.titulo = titulo;
  Object.assign(o, { filasPorPulso: porPulso, bpms, cambiosBpm: cambios, valores, ultimaFila: ultima, notas: notasF, largas: largasF, extras });
  return o;
}

// Paquetes de graficos (.dat): devuelve [{ nombre, tam, datos() }]
export function abrirPaquete(c) {
  const v = dv(c);
  const limpiar = (s) => s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  if (c.length >= 0x4C && c[0x38] === 0x66 && c[0x39] === 0x61 && c[0x3A] === 0x21 && c[0x3B] === 0x5E) {   // F2 System
    const n = v.getInt32(0x34, true), lista = [];
    for (let e = 0; e < n; e++) {
      const o = 0x4C + e * 40, pos = v.getInt32(o + 32, true), tam = v.getInt32(o + 36, true);
      lista.push({ nombre: limpiar(ascii(c, o, 32)), tam, datos: () => c.slice(pos, pos + tam) });
    }
    return { formato: 'F2', archivos: lista };
  }
  if (ascii(c, 0, 3) === 'RES') {                                                                              // Andamiro
    const n = v.getInt32(8, true), indice = xorAndamiro(c, 0x18, n * 28), iv = dv(indice), base = 0x18 + n * 28, lista = [];
    for (let e = 0; e < n; e++) {
      const o = e * 28, tam = iv.getInt32(o + 16, true), pos = iv.getInt32(o + 20, true);
      lista.push({ nombre: limpiar(ascii(indice, o, 16)), tam, datos: () => xorAndamiro(c, base + pos, tam) });
    }
    return { formato: 'RES', archivos: lista };
  }
  return { formato: 'desconocido', archivos: [] };
}
