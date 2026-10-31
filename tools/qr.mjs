// Codigo QR propio (sin dependencias) para el modo servidor (servidor.mjs): la direccion de la wifi y la del tunel se
// muestran tambien como QR en la ventana, asi los celulares entran apuntando la camara (30/10).
// Modo byte, correccion M, versiones 1 a 6 (hasta 106 letras: alcanza para cualquier direccion del servidor).
// Sigue la norma ISO/IEC 18004 como la implementacion de referencia de Nayuki (codigo libre, MIT).

// por version (1-6), correccion M: [bloques, datos por bloque, correccion por bloque]
const BLOQUES_M = [null, [1, 16, 10], [1, 28, 16], [1, 44, 26], [2, 32, 18], [2, 43, 24], [4, 27, 16]];
const ALINEACION = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

function multiplicar(x, y) {          // en GF(256), con el polinomio 0x11D
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function divisor(grado) {             // el generador de Reed-Solomon
  const r = new Array(grado).fill(0); r[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = multiplicar(r[j], raiz); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    raiz = multiplicar(raiz, 0x02);
  }
  return r;
}
function resto(datos, div) {
  const r = new Array(div.length).fill(0);
  for (const b of datos) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= multiplicar(c, f); }); }
  return r;
}

// devuelve la matriz (true = modulo oscuro), filas de arriba a abajo
export function codigoQR(texto) {
  const bytes = [...Buffer.from(String(texto), 'utf8')];
  let version = 1;
  while (version <= 6 && BLOQUES_M[version][0] * BLOQUES_M[version][1] - 2 < bytes.length) version++;
  if (version > 6) throw new Error('texto demasiado largo para el QR');
  const [nBloques, nDatos, nCorr] = BLOQUES_M[version], capacidad = nBloques * nDatos;
  // los bits: modo byte (0100), largo (8 bits), los bytes, fin y relleno
  const bits = [];
  const poner = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  poner(4, 4); poner(bytes.length, 8); for (const b of bytes) poner(b, 8);
  poner(0, Math.min(4, capacidad * 8 - bits.length));
  poner(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < capacidad * 8; p ^= 0xec ^ 0x11) poner(p, 8);
  const datos = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // bloques con su correccion, intercalados (en estas versiones todos los bloques miden lo mismo)
  const div = divisor(nCorr), bloques = [];
  for (let k = 0; k < nBloques; k++) { const d = datos.slice(k * nDatos, (k + 1) * nDatos); bloques.push([...d, ...resto(d, div)]); }
  const palabras = [];
  for (let i = 0; i < nDatos + nCorr; i++) for (const b of bloques) palabras.push(b[i]);

  const lado = version * 4 + 17;
  const m = Array.from({ length: lado }, () => new Array(lado).fill(false));
  const fijo = Array.from({ length: lado }, () => new Array(lado).fill(false));
  const fijar = (x, y, oscuro) => { m[y][x] = oscuro; fijo[y][x] = true; };
  // patrones: temporizacion, buscadores, alineacion
  for (let i = 0; i < lado; i++) { fijar(6, i, i % 2 === 0); fijar(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [lado - 4, 3], [3, lado - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < lado && y >= 0 && y < lado) fijar(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALINEACION[version], u = al.length - 1;
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === u) || (i === u && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fijar(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formato = (mascara) => {
    const d = (0 << 3) | mascara;                   // correccion M = 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) fijar(8, i, bit(i));
    fijar(8, 7, bit(6)); fijar(8, 8, bit(7)); fijar(7, 8, bit(8));
    for (let i = 9; i < 15; i++) fijar(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) fijar(lado - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) fijar(8, lado - 15 + i, bit(i));
    fijar(8, lado - 8, true);                       // el modulo oscuro fijo
  };
  formato(0);                                       // reserva su lugar
  // los datos, en zigzag de a dos columnas desde abajo a la derecha
  let i = 0;
  const total = palabras.length * 8;
  for (let der = lado - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5;
    for (let v = 0; v < lado; v++) for (let j = 0; j < 2; j++) {
      const x = der - j, sube = ((der + 1) & 2) === 0, y = sube ? lado - 1 - v : v;
      if (!fijo[y][x] && i < total) { m[y][x] = ((palabras[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  // la mascara con menos penalidad (corridas, cuadrados de 2x2 y equilibrio de oscuros)
  const MASCARAS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const aplicar = (k) => { for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) if (!fijo[y][x] && MASCARAS[k](x, y)) m[y][x] = !m[y][x]; };
  const penalidad = () => {
    let p = 0, oscuros = 0;
    for (let a = 0; a < lado; a++) {
      let fila = 1, col = 1;
      for (let b = 1; b < lado; b++) {
        if (m[a][b] === m[a][b - 1]) { fila++; if (fila === 5) p += 3; else if (fila > 5) p++; } else fila = 1;
        if (m[b][a] === m[b - 1][a]) { col++; if (col === 5) p += 3; else if (col > 5) p++; } else col = 1;
      }
    }
    for (let y = 0; y < lado - 1; y++) for (let x = 0; x < lado - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    for (const f of m) for (const c of f) if (c) oscuros++;
    return p + Math.floor(Math.abs(oscuros * 20 - lado * lado * 10) / (lado * lado)) * 10;
  };
  let mejor = 0, menor = Infinity;
  for (let k = 0; k < 8; k++) { aplicar(k); formato(k); const p = penalidad(); if (p < menor) { menor = p; mejor = k; } aplicar(k); }
  aplicar(mejor); formato(mejor);
  return m;
}

// para la ventana: medio caracter por modulo (cada letra = dos filas). Las ventanas tienen letra clara sobre fondo
// oscuro, asi que se pintan los modulos CLAROS (con el margen blanco alrededor), para que la camara lo lea derecho
export function qrEnTexto(texto, margen = 2) {
  const m = codigoQR(texto), n = m.length + 2 * margen;
  const claro = (x, y) => { x -= margen; y -= margen; return !(x >= 0 && y >= 0 && x < m.length && y < m.length && m[y][x]); };
  const lineas = [];
  for (let y = 0; y < n; y += 2) {
    let l = '';
    for (let x = 0; x < n; x++) { const a = claro(x, y), b = y + 1 < n ? claro(x, y + 1) : false; l += a && b ? '█' : a ? '▀' : b ? '▄' : ' '; }
    lineas.push(l);
  }
  return lineas.join('\n');
}

// como imagen SVG (oscuro sobre blanco), para abrir o imprimir
export function qrEnSvg(texto, margen = 4) {
  const m = codigoQR(texto), n = m.length + 2 * margen;
  let r = '';
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) r += `M${x + margen} ${y + margen}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * 10}" height="${n * 10}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${r}" fill="#000"/></svg>`;
}
