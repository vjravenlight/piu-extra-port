// OpenGL 1.x (lo que usaba Pump It Up Extra a traves de Mesa + 3dfx) sobre WebGL.
// El codigo traducido del juego llama a estas funciones con los mismos nombres y numeros que en el original
// (gl.glBegin(gl.GL_QUADS), gl.glVertex3f(...), etc.).
// Adaptacion a PC: el juego cree que dibuja a 640x480; 'escala' agranda viewport y scissor para dibujar a la
// resolucion real de la pantalla (las texturas son las mismas, solo se ve mas nitido).

const E = {
  GL_POINTS: 0x0000, GL_LINES: 0x0001, GL_LINE_LOOP: 0x0002, GL_LINE_STRIP: 0x0003, GL_TRIANGLES: 0x0004,
  GL_TRIANGLE_STRIP: 0x0005, GL_TRIANGLE_FAN: 0x0006, GL_QUADS: 0x0007, GL_QUAD_STRIP: 0x0008, GL_POLYGON: 0x0009,
  GL_NEVER: 0x0200, GL_LESS: 0x0201, GL_EQUAL: 0x0202, GL_LEQUAL: 0x0203, GL_GREATER: 0x0204, GL_NOTEQUAL: 0x0205, GL_GEQUAL: 0x0206, GL_ALWAYS: 0x0207,
  GL_ZERO: 0, GL_ONE: 1, GL_SRC_COLOR: 0x0300, GL_ONE_MINUS_SRC_COLOR: 0x0301, GL_SRC_ALPHA: 0x0302, GL_ONE_MINUS_SRC_ALPHA: 0x0303,
  GL_DST_ALPHA: 0x0304, GL_ONE_MINUS_DST_ALPHA: 0x0305, GL_DST_COLOR: 0x0306, GL_ONE_MINUS_DST_COLOR: 0x0307, GL_SRC_ALPHA_SATURATE: 0x0308,
  GL_FRONT: 0x0404, GL_BACK: 0x0405, GL_FRONT_AND_BACK: 0x0408, GL_CW: 0x0900, GL_CCW: 0x0901,
  GL_CULL_FACE: 0x0B44, GL_LIGHTING: 0x0B50, GL_FOG: 0x0B60, GL_DEPTH_TEST: 0x0B71, GL_ALPHA_TEST: 0x0BC0, GL_DITHER: 0x0BD0,
  GL_BLEND: 0x0BE2, GL_SCISSOR_TEST: 0x0C11, GL_TEXTURE_2D: 0x0DE1, GL_NORMALIZE: 0x0BA1, GL_POLYGON_SMOOTH: 0x0B41, GL_LINE_SMOOTH: 0x0B20,
  GL_POINT_SMOOTH: 0x0B10, GL_COLOR_MATERIAL: 0x0B57, GL_LIGHT0: 0x4000, GL_POLYGON_OFFSET_FILL: 0x8037,
  GL_FOG_MODE: 0x0B65, GL_FOG_DENSITY: 0x0B62, GL_FOG_START: 0x0B63, GL_FOG_END: 0x0B64, GL_FOG_COLOR: 0x0B66, GL_EXP: 0x0800, GL_EXP2: 0x0801, GL_LINEAR: 0x2601,
  GL_MODELVIEW: 0x1700, GL_PROJECTION: 0x1701, GL_TEXTURE: 0x1702,
  GL_FLAT: 0x1D00, GL_SMOOTH: 0x1D01,
  GL_TEXTURE_ENV: 0x2300, GL_TEXTURE_ENV_MODE: 0x2200, GL_TEXTURE_ENV_COLOR: 0x2201, GL_MODULATE: 0x2100, GL_DECAL: 0x2101, GL_REPLACE: 0x1E01, GL_ADD: 0x0104,
  GL_TEXTURE_MAG_FILTER: 0x2800, GL_TEXTURE_MIN_FILTER: 0x2801, GL_TEXTURE_WRAP_S: 0x2802, GL_TEXTURE_WRAP_T: 0x2803,
  GL_NEAREST: 0x2600, GL_NEAREST_MIPMAP_NEAREST: 0x2700, GL_LINEAR_MIPMAP_NEAREST: 0x2701, GL_NEAREST_MIPMAP_LINEAR: 0x2702, GL_LINEAR_MIPMAP_LINEAR: 0x2703,
  GL_CLAMP: 0x2900, GL_REPEAT: 0x2901, GL_CLAMP_TO_EDGE: 0x812F,
  GL_ALPHA: 0x1906, GL_RGB: 0x1907, GL_RGBA: 0x1908, GL_LUMINANCE: 0x1909, GL_LUMINANCE_ALPHA: 0x190A, GL_INTENSITY: 0x8049,
  GL_RGB8: 0x8051, GL_RGBA8: 0x8058, GL_RGB5: 0x8050, GL_RGBA4: 0x8056, GL_RGB5_A1: 0x8057,
  GL_UNSIGNED_BYTE: 0x1401, GL_UNSIGNED_SHORT_5_6_5: 0x8363, GL_UNSIGNED_SHORT_4_4_4_4: 0x8033, GL_UNSIGNED_SHORT_5_5_5_1: 0x8034, GL_FLOAT: 0x1406,
  GL_COLOR_BUFFER_BIT: 0x4000, GL_DEPTH_BUFFER_BIT: 0x0100, GL_STENCIL_BUFFER_BIT: 0x0400,
  GL_NO_ERROR: 0, GL_INVALID_ENUM: 0x0500, GL_INVALID_VALUE: 0x0501, GL_INVALID_OPERATION: 0x0502,
  GL_PERSPECTIVE_CORRECTION_HINT: 0x0C50, GL_FASTEST: 0x1101, GL_NICEST: 0x1102, GL_DONT_CARE: 0x1100
};

// clase de formato de textura (para las reglas de glTexEnv de OpenGL 1.x)
const FMT = { RGBA: 0, RGB: 1, ALPHA: 2, LUM: 3, LUMA: 4, INT: 5 };
const TEX_MODO = { [E.GL_MODULATE]: 0, [E.GL_REPLACE]: 1, [E.GL_DECAL]: 2, [E.GL_BLEND]: 3, [E.GL_ADD]: 4 };
const FUNC = { [E.GL_NEVER]: 0, [E.GL_LESS]: 1, [E.GL_EQUAL]: 2, [E.GL_LEQUAL]: 3, [E.GL_GREATER]: 4, [E.GL_NOTEQUAL]: 5, [E.GL_GEQUAL]: 6, [E.GL_ALWAYS]: 7 };

const VS = `
attribute vec4 aPos; attribute vec4 aCol; attribute vec2 aTex; attribute float aEye;
uniform float uPunto;
varying vec4 vCol; varying vec2 vTex; varying float vEye;
void main() { gl_Position = aPos; vCol = aCol; vTex = aTex; vEye = aEye; gl_PointSize = uPunto; }`;
const FS = `
precision mediump float;
varying vec4 vCol; varying vec2 vTex; varying float vEye;
uniform sampler2D uTex; uniform float uUsaTex; uniform int uModo; uniform int uFmt; uniform vec4 uEnvCol;
uniform int uAlfaFunc; uniform float uAlfaRef;
uniform int uNiebla; uniform vec4 uNieblaCol; uniform float uNieblaIni; uniform float uNieblaFin; uniform float uNieblaDens;
bool pasa(int f, float a, float r) {
  if (f == 0) return false; if (f == 1) return a < r; if (f == 2) return a == r; if (f == 3) return a <= r;
  if (f == 4) return a > r; if (f == 5) return a != r; if (f == 6) return a >= r; return true;
}
void main() {
  vec4 c = vCol;
  if (uUsaTex > 0.5) {
    vec4 t = texture2D(uTex, vTex);
    vec3 ct = t.rgb; float at = t.a; bool tieneC = true; bool tieneA = true;
    if (uFmt == 1) tieneA = false;
    if (uFmt == 2) tieneC = false;
    if (uFmt == 3) { ct = vec3(t.r); tieneA = false; }
    if (uFmt == 4) { ct = vec3(t.r); at = t.a; }
    if (uFmt == 5) { ct = vec3(t.r); at = t.r; }
    if (uModo == 0) { if (tieneC) c.rgb *= ct; if (tieneA) c.a *= at; }
    else if (uModo == 1) { if (tieneC) c.rgb = ct; if (tieneA) c.a = at; }
    else if (uModo == 2) { if (uFmt == 0) c.rgb = mix(c.rgb, ct, at); else if (tieneC) c.rgb = ct; }
    else if (uModo == 3) { if (tieneC) c.rgb = mix(c.rgb, uEnvCol.rgb, ct); if (tieneA) c.a *= at; }
    else { if (tieneC) c.rgb = min(c.rgb + ct, vec3(1.0)); if (tieneA) c.a *= at; }
  }
  if (uAlfaFunc < 8 && !pasa(uAlfaFunc, c.a, uAlfaRef)) discard;
  if (uNiebla > 0) {
    float z = abs(vEye), f = 1.0;
    if (uNiebla == 1) f = (uNieblaFin - z) / (uNieblaFin - uNieblaIni);
    else if (uNiebla == 2) f = exp(-uNieblaDens * z);
    else f = exp(-(uNieblaDens * z) * (uNieblaDens * z));
    c.rgb = mix(uNieblaCol.rgb, c.rgb, clamp(f, 0.0, 1.0));
  }
  gl_FragColor = c;
}`;

function ident() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function mult(a, b) { // a*b (columna mayor, como OpenGL)
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

export class GL1 {
  // profundidad: el port de Pump It Up la apaga (la ventana original es AUX_DOUBLE sin buffer de profundidad,
  // asi que GL_DEPTH_TEST no tiene efecto, igual que en la cabina)
  constructor(lienzo, { escala = 1, profundidad = true } = {}) {
    Object.assign(this, E);
    const opc = { alpha: false, depth: profundidad, stencil: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false };
    const w = lienzo.getContext('webgl', opc) || lienzo.getContext('experimental-webgl', opc);
    if (!w) throw new Error('Este navegador no tiene WebGL');
    this.w = w; this.escala = escala; this.lienzo = lienzo;
    this.error = E.GL_NO_ERROR;
    const sh = (tipo, src) => { const s = w.createShader(tipo); w.shaderSource(s, src); w.compileShader(s); if (!w.getShaderParameter(s, w.COMPILE_STATUS)) throw new Error(w.getShaderInfoLog(s)); return s; };
    const p = w.createProgram(); w.attachShader(p, sh(w.VERTEX_SHADER, VS)); w.attachShader(p, sh(w.FRAGMENT_SHADER, FS)); w.linkProgram(p);
    if (!w.getProgramParameter(p, w.LINK_STATUS)) throw new Error(w.getProgramInfoLog(p));
    w.useProgram(p); this.prog = p;
    this.a = { pos: w.getAttribLocation(p, 'aPos'), col: w.getAttribLocation(p, 'aCol'), tex: w.getAttribLocation(p, 'aTex'), eye: w.getAttribLocation(p, 'aEye') };
    this.u = {}; for (const n of ['uTex', 'uUsaTex', 'uModo', 'uFmt', 'uEnvCol', 'uAlfaFunc', 'uAlfaRef', 'uNiebla', 'uNieblaCol', 'uNieblaIni', 'uNieblaFin', 'uNieblaDens', 'uPunto']) this.u[n] = w.getUniformLocation(p, n);
    this.buf = w.createBuffer();
    // 10 floats por vertice: pos clip (4), color (4), tex (2)... + eye (1) = 11
    this.lote = new Float32Array(11 * 6 * 4096); this.nLote = 0; this.primLote = w.TRIANGLES;
    // estado
    this.pilas = { [E.GL_MODELVIEW]: [ident()], [E.GL_PROJECTION]: [ident()], [E.GL_TEXTURE]: [ident()] };
    this.modoMatriz = E.GL_MODELVIEW;
    this.col = [1, 1, 1, 1]; this.tc = [0, 0]; this.normal = [0, 0, 1];
    this.activos = new Set([E.GL_DITHER]);
    this.texturas = new Map(); this.sigTex = 1; this.texActual = 0; this.texNula = this._crearTexNula();
    this.texModo = E.GL_MODULATE; this.envCol = [0, 0, 0, 0];
    this.alfaFunc = E.GL_ALWAYS; this.alfaRef = 0;
    this.niebla = { modo: E.GL_EXP, dens: 1, ini: 0, fin: 1, col: [0, 0, 0, 0] };
    this.sombreado = E.GL_SMOOTH; this.puntoTam = 1;
    this.prim = -1; this.vtx = [];
    w.enable(w.DITHER); w.depthFunc(w.LESS); w.blendFunc(w.ONE, w.ZERO); w.pixelStorei(w.UNPACK_ALIGNMENT, 1);
    w.pixelStorei(w.UNPACK_COLORSPACE_CONVERSION_WEBGL, w.NONE);   // los colores de las imagenes, tal cual
    w.pixelStorei(w.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  _crearTexNula() { const w = this.w, t = w.createTexture(); w.bindTexture(w.TEXTURE_2D, t); w.texImage2D(w.TEXTURE_2D, 0, w.RGBA, 1, 1, 0, w.RGBA, w.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255])); return t; }
  _m() { const p = this.pilas[this.modoMatriz]; return p[p.length - 1]; }
  _setM(m) { const p = this.pilas[this.modoMatriz]; p[p.length - 1] = m; }
  _mul(m) { this._setM(mult(this._m(), m)); }
  _cambia() { this.flush(); }   // cualquier cambio de estado que afecta el dibujo vacia el lote

  // ---------- errores y consultas ----------
  glGetError() { const e = this.error; this.error = E.GL_NO_ERROR; return e; }
  glGetString() { return 'PIU-Extra GL1 sobre WebGL'; }
  glIsEnabled(cap) { return this.activos.has(cap) ? 1 : 0; }

  // ---------- estado ----------
  glEnable(cap) { this._cambia(); this.activos.add(cap); this._capGL(cap, true); }
  glDisable(cap) { this._cambia(); this.activos.delete(cap); this._capGL(cap, false); }
  _capGL(cap, on) {
    const w = this.w, m = { [E.GL_BLEND]: w.BLEND, [E.GL_DEPTH_TEST]: w.DEPTH_TEST, [E.GL_CULL_FACE]: w.CULL_FACE, [E.GL_SCISSOR_TEST]: w.SCISSOR_TEST, [E.GL_DITHER]: w.DITHER, [E.GL_POLYGON_OFFSET_FILL]: w.POLYGON_OFFSET_FILL };
    if (m[cap] !== undefined) on ? w.enable(m[cap]) : w.disable(m[cap]);
  }
  glBlendFunc(s, d) { this._cambia(); this.w.blendFunc(s, d); }          // los numeros de OpenGL y WebGL coinciden
  glAlphaFunc(f, ref) { this._cambia(); this.alfaFunc = f; this.alfaRef = Math.min(1, Math.max(0, ref)); }
  glDepthFunc(f) { this._cambia(); this.w.depthFunc(f); }
  glDepthMask(b) { this._cambia(); this.w.depthMask(!!b); }
  glDepthRange(n, f) { this._cambia(); this.w.depthRange(n, f); }
  glColorMask(r, g, b, a) { this._cambia(); this.w.colorMask(!!r, !!g, !!b, !!a); }
  glCullFace(m) { this._cambia(); this.w.cullFace(m); }
  glFrontFace(m) { this._cambia(); this.w.frontFace(m); }
  glShadeModel(m) { this._cambia(); this.sombreado = m; }
  glPolygonOffset(f, u) { this._cambia(); this.w.polygonOffset(f, u); }
  glHint() { }
  glPointSize(t) { this._cambia(); this.puntoTam = t; }
  glLineWidth(t) { this._cambia(); this.w.lineWidth(Math.max(1, t * this.escala)); }
  glFogf(p, v) { this._cambia(); if (p === E.GL_FOG_MODE) this.niebla.modo = v; else if (p === E.GL_FOG_DENSITY) this.niebla.dens = v; else if (p === E.GL_FOG_START) this.niebla.ini = v; else if (p === E.GL_FOG_END) this.niebla.fin = v; }
  glFogi(p, v) { this.glFogf(p, v); }
  glFogfv(p, v) { if (p === E.GL_FOG_COLOR) { this._cambia(); this.niebla.col = [v[0], v[1], v[2], v[3]]; } else this.glFogf(p, v[0]); }
  glTexEnvi(t, p, v) { this._cambia(); if (p === E.GL_TEXTURE_ENV_MODE) this.texModo = v; }
  glTexEnvf(t, p, v) { this.glTexEnvi(t, p, v); }
  glTexEnvfv(t, p, v) { this._cambia(); if (p === E.GL_TEXTURE_ENV_COLOR) this.envCol = [v[0], v[1], v[2], v[3]]; else this.glTexEnvi(t, p, v[0]); }

  // ---------- pantalla ----------
  glViewport(x, y, w, h) { this._cambia(); const k = this.escala; this.w.viewport(x * k, y * k, w * k, h * k); }
  glScissor(x, y, w, h) { this._cambia(); const k = this.escala; this.w.scissor(x * k, y * k, w * k, h * k); }
  glClearColor(r, g, b, a) { this.w.clearColor(r, g, b, a); }
  glClearDepth(d) { this.w.clearDepth(d); }
  glClear(mask) { this.flush(); this.w.clear(mask & (this.w.COLOR_BUFFER_BIT | this.w.DEPTH_BUFFER_BIT | this.w.STENCIL_BUFFER_BIT)); }
  glFlush() { this.flush(); }
  glFinish() { this.flush(); this.w.finish(); }
  glReadPixels(x, y, w, h, fmt, tipo, destino) { this.flush(); const k = this.escala; const d = destino || new Uint8Array(w * h * 4 * k * k); this.w.readPixels(x * k, y * k, w * k, h * k, this.w.RGBA, this.w.UNSIGNED_BYTE, d); return d; }

  // ---------- matrices ----------
  glMatrixMode(m) { this.modoMatriz = m; }
  glLoadIdentity() { this._setM(ident()); }
  glLoadMatrixf(m) { this._setM(Float32Array.from(m)); }
  glMultMatrixf(m) { this._mul(Float32Array.from(m)); }
  glPushMatrix() { const p = this.pilas[this.modoMatriz]; p.push(Float32Array.from(p[p.length - 1])); }
  glPopMatrix() { const p = this.pilas[this.modoMatriz]; if (p.length > 1) p.pop(); else this.error = 0x0504; }
  glTranslatef(x, y, z) { const m = ident(); m[12] = x; m[13] = y; m[14] = z; this._mul(m); }
  glScalef(x, y, z) { const m = ident(); m[0] = x; m[5] = y; m[10] = z; this._mul(m); }
  glRotatef(ang, x, y, z) {
    const l = Math.hypot(x, y, z); if (!l) return; x /= l; y /= l; z /= l;
    const r = ang * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), t = 1 - c, m = ident();
    m[0] = x * x * t + c; m[1] = y * x * t + z * s; m[2] = x * z * t - y * s;
    m[4] = x * y * t - z * s; m[5] = y * y * t + c; m[6] = y * z * t + x * s;
    m[8] = x * z * t + y * s; m[9] = y * z * t - x * s; m[10] = z * z * t + c;
    this._mul(m);
  }
  glOrtho(l, r, b, t, n, f) { const m = ident(); m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); this._mul(m); }
  glFrustum(l, r, b, t, n, f) { const m = new Float32Array(16); m[0] = 2 * n / (r - l); m[5] = 2 * n / (t - b); m[8] = (r + l) / (r - l); m[9] = (t + b) / (t - b); m[10] = -(f + n) / (f - n); m[11] = -1; m[14] = -2 * f * n / (f - n); this._mul(m); }
  gluOrtho2D(l, r, b, t) { this.glOrtho(l, r, b, t, -1, 1); }
  gluPerspective(fovy, asp, n, f) { const y = n * Math.tan(fovy * Math.PI / 360), x = y * asp; this.glFrustum(-x, x, -y, y, n, f); }
  gluLookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let fx = cx - ex, fy = cy - ey, fz = cz - ez; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    let sx = fy * uz - fz * uy, sy = fz * ux - fx * uz, sz = fx * uy - fy * ux; const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
    const vx = sy * fz - sz * fy, vy = sz * fx - sx * fz, vz = sx * fy - sy * fx, m = ident();
    m[0] = sx; m[4] = sy; m[8] = sz; m[1] = vx; m[5] = vy; m[9] = vz; m[2] = -fx; m[6] = -fy; m[10] = -fz;
    this._mul(m); this.glTranslatef(-ex, -ey, -ez);
  }

  // ---------- texturas ----------
  _nuevaTex() {
    // filtro de minificacion por defecto de OpenGL: NEAREST_MIPMAP_LINEAR; sin mipmaps se usa el equivalente sin mipmap
    const w = this.w, t = w.createTexture(); w.bindTexture(w.TEXTURE_2D, t);
    w.texParameteri(w.TEXTURE_2D, w.TEXTURE_MIN_FILTER, w.NEAREST);
    w.bindTexture(w.TEXTURE_2D, this.texActual && this.texturas.get(this.texActual) ? this.texturas.get(this.texActual).t : this.texNula);
    return { t, fmt: FMT.RGBA, w: 0, h: 0, min: E.GL_NEAREST_MIPMAP_LINEAR, mip: false };
  }
  _aplicarMin(to) {
    const w = this.w, v = to.min, conMip = v === E.GL_NEAREST_MIPMAP_NEAREST || v === E.GL_LINEAR_MIPMAP_NEAREST || v === E.GL_NEAREST_MIPMAP_LINEAR || v === E.GL_LINEAR_MIPMAP_LINEAR;
    const efectivo = conMip && !to.mip ? (v === E.GL_LINEAR_MIPMAP_NEAREST || v === E.GL_LINEAR_MIPMAP_LINEAR ? w.LINEAR : w.NEAREST) : v;
    w.texParameteri(w.TEXTURE_2D, w.TEXTURE_MIN_FILTER, efectivo);
  }
  glGenTextures(n, destino) { const ids = []; for (let i = 0; i < n; i++) { const id = this.sigTex++; this.texturas.set(id, this._nuevaTex()); ids.push(id); } if (destino) destino.set ? destino.set(ids) : ids.forEach((v, i) => destino[i] = v); return ids; }
  glDeleteTextures(n, ids) { this._cambia(); for (let i = 0; i < n; i++) { const t = this.texturas.get(ids[i]); if (t) { this.w.deleteTexture(t.t); this.texturas.delete(ids[i]); } if (this.texActual === ids[i]) this.texActual = 0; } }
  glBindTexture(obj, id) {
    if (id === this.texActual) return;
    this._cambia();
    if (id && !this.texturas.has(id)) this.texturas.set(id, this._nuevaTex());
    this.texActual = id;
    this.w.bindTexture(this.w.TEXTURE_2D, id ? this.texturas.get(id).t : this.texNula);
  }
  _texObj() { if (!this.texActual) return null; return this.texturas.get(this.texActual); }
  glTexParameteri(obj, p, v) {
    this._cambia(); const w = this.w, to = this._texObj();
    if (p === E.GL_TEXTURE_MIN_FILTER && to) { to.min = v; this._aplicarMin(to); return; }
    if (p === E.GL_TEXTURE_WRAP_S || p === E.GL_TEXTURE_WRAP_T) {
      const pot = to && to.w && to.h && !(to.w & (to.w - 1)) && !(to.h & (to.h - 1));
      v = (v === E.GL_REPEAT && (pot || !to || !to.w)) ? w.REPEAT : w.CLAMP_TO_EDGE;   // WebGL 1 no repite texturas que no son potencia de 2
    }
    w.texParameteri(w.TEXTURE_2D, p, v);
  }
  glTexParameterf(o, p, v) { this.glTexParameteri(o, p, v); }
  // datos: Uint8Array en el formato/tipo pedido (como el original), o una imagen del navegador (ImageBitmap/HTMLImageElement)
  glTexImage2D(obj, nivel, formatoInterno, ancho, alto, borde, formato, tipo, datos) {
    this._cambia(); const w = this.w, to = this._texObj();
    const fi = typeof formatoInterno === 'number' && formatoInterno <= 4 ? [0, E.GL_LUMINANCE, E.GL_LUMINANCE_ALPHA, E.GL_RGB, E.GL_RGBA][formatoInterno] : formatoInterno;
    const clase = (f) => f === E.GL_ALPHA ? FMT.ALPHA : f === E.GL_LUMINANCE ? FMT.LUM : f === E.GL_LUMINANCE_ALPHA ? FMT.LUMA : f === E.GL_INTENSITY ? FMT.INT : (f === E.GL_RGB || f === E.GL_RGB8 || f === E.GL_RGB5) ? FMT.RGB : FMT.RGBA;
    if (to) { to.fmt = clase(fi); if (nivel === 0) { to.w = ancho; to.h = alto; } else if (!to.mip) { to.mip = true; this._aplicarMin(to); } }
    if (datos && !(datos instanceof Uint8Array) && !(datos instanceof Uint16Array) && !(datos instanceof Float32Array)) {
      w.texImage2D(w.TEXTURE_2D, nivel, w.RGBA, w.RGBA, w.UNSIGNED_BYTE, datos);   // imagen del navegador
      if (to) { to.w = datos.width; to.h = datos.height; }
      return;
    }
    const rgba = this._aRGBA(ancho, alto, formato, tipo, datos);
    w.texImage2D(w.TEXTURE_2D, nivel, w.RGBA, ancho, alto, 0, w.RGBA, w.UNSIGNED_BYTE, rgba);
  }
  glTexSubImage2D(obj, nivel, x, y, ancho, alto, formato, tipo, datos) {
    this._cambia(); const w = this.w;
    w.texSubImage2D(w.TEXTURE_2D, nivel, x, y, ancho, alto, w.RGBA, w.UNSIGNED_BYTE, this._aRGBA(ancho, alto, formato, tipo, datos));
  }
  _aRGBA(an, al, formato, tipo, d) {
    const n = an * al, o = new Uint8Array(n * 4);
    if (!d) return o;
    if (tipo === E.GL_UNSIGNED_SHORT_5_6_5) { for (let i = 0; i < n; i++) { const v = d[i]; o[i * 4] = ((v >> 11) & 31) * 255 / 31; o[i * 4 + 1] = ((v >> 5) & 63) * 255 / 63; o[i * 4 + 2] = (v & 31) * 255 / 31; o[i * 4 + 3] = 255; } return o; }
    if (tipo === E.GL_UNSIGNED_SHORT_4_4_4_4) { for (let i = 0; i < n; i++) { const v = d[i]; o[i * 4] = ((v >> 12) & 15) * 17; o[i * 4 + 1] = ((v >> 8) & 15) * 17; o[i * 4 + 2] = ((v >> 4) & 15) * 17; o[i * 4 + 3] = (v & 15) * 17; } return o; }
    if (tipo === E.GL_UNSIGNED_SHORT_5_5_5_1) { for (let i = 0; i < n; i++) { const v = d[i]; o[i * 4] = ((v >> 11) & 31) * 255 / 31; o[i * 4 + 1] = ((v >> 6) & 31) * 255 / 31; o[i * 4 + 2] = ((v >> 1) & 31) * 255 / 31; o[i * 4 + 3] = (v & 1) * 255; } return o; }
    for (let i = 0; i < n; i++) {
      if (formato === E.GL_RGBA) { o.set(d.subarray(i * 4, i * 4 + 4), i * 4); }
      else if (formato === E.GL_RGB) { o[i * 4] = d[i * 3]; o[i * 4 + 1] = d[i * 3 + 1]; o[i * 4 + 2] = d[i * 3 + 2]; o[i * 4 + 3] = 255; }
      else if (formato === E.GL_LUMINANCE) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = d[i]; o[i * 4 + 3] = 255; }
      else if (formato === E.GL_LUMINANCE_ALPHA) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = d[i * 2]; o[i * 4 + 3] = d[i * 2 + 1]; }
      else if (formato === E.GL_ALPHA) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = 255; o[i * 4 + 3] = d[i]; }
      else if (formato === E.GL_INTENSITY) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = o[i * 4 + 3] = d[i]; }
    }
    return o;
  }

  // ---------- vertices (modo inmediato) ----------
  glColor3f(r, g, b) { this.col = [r, g, b, 1]; }
  glColor4f(r, g, b, a) { this.col = [r, g, b, a]; }
  glColor3ub(r, g, b) { this.col = [r / 255, g / 255, b / 255, 1]; }
  glColor4ub(r, g, b, a) { this.col = [r / 255, g / 255, b / 255, a / 255]; }
  glColor3fv(v) { this.glColor3f(v[0], v[1], v[2]); }
  glColor4fv(v) { this.glColor4f(v[0], v[1], v[2], v[3]); }
  glColor4ubv(v) { this.glColor4ub(v[0], v[1], v[2], v[3]); }
  glTexCoord2f(s, t) { this.tc = [s, t]; }
  glTexCoord2fv(v) { this.tc = [v[0], v[1]]; }
  glNormal3f(x, y, z) { this.normal = [x, y, z]; }
  glNormal3fv(v) { this.normal = [v[0], v[1], v[2]]; }
  glBegin(prim) { this.prim = prim; this.vtx = []; }
  glVertex2f(x, y) { this._vertice(x, y, 0, 1); }
  glVertex3f(x, y, z) { this._vertice(x, y, z, 1); }
  glVertex4f(x, y, z, w) { this._vertice(x, y, z, w); }
  glVertex2fv(v) { this._vertice(v[0], v[1], 0, 1); }
  glVertex3fv(v) { this._vertice(v[0], v[1], v[2], 1); }
  glVertex2i(x, y) { this._vertice(x, y, 0, 1); }
  _vertice(x, y, z, w) {
    const mv = this.pilas[E.GL_MODELVIEW][this.pilas[E.GL_MODELVIEW].length - 1];
    const ex = mv[0] * x + mv[4] * y + mv[8] * z + mv[12] * w, ey = mv[1] * x + mv[5] * y + mv[9] * z + mv[13] * w;
    const ez = mv[2] * x + mv[6] * y + mv[10] * z + mv[14] * w, ew = mv[3] * x + mv[7] * y + mv[11] * z + mv[15] * w;
    const pj = this.pilas[E.GL_PROJECTION][this.pilas[E.GL_PROJECTION].length - 1];
    const cx = pj[0] * ex + pj[4] * ey + pj[8] * ez + pj[12] * ew, cy = pj[1] * ex + pj[5] * ey + pj[9] * ez + pj[13] * ew;
    const cz = pj[2] * ex + pj[6] * ey + pj[10] * ez + pj[14] * ew, cw = pj[3] * ex + pj[7] * ey + pj[11] * ez + pj[15] * ew;
    let s = this.tc[0], t = this.tc[1];
    const tm = this.pilas[E.GL_TEXTURE][this.pilas[E.GL_TEXTURE].length - 1];
    if (tm[0] !== 1 || tm[5] !== 1 || tm[12] !== 0 || tm[13] !== 0 || tm[4] !== 0 || tm[1] !== 0) { const s2 = tm[0] * s + tm[4] * t + tm[12], t2 = tm[1] * s + tm[5] * t + tm[13]; s = s2; t = t2; }
    this.vtx.push([cx, cy, cz, cw, this.col[0], this.col[1], this.col[2], this.col[3], s, t, ez / (ew || 1)]);
  }
  glEnd() {
    const v = this.vtx, P = this.prim; this.prim = -1;
    if (!v.length) return;
    if (this.sombreado === E.GL_FLAT && v.length) { /* color plano: el del ultimo vertice de cada primitiva (aprox.: el ultimo) */ const c = v[v.length - 1]; for (const x of v) { x[4] = c[4]; x[5] = c[5]; x[6] = c[6]; x[7] = c[7]; } }
    const w = this.w, tri = [], lin = [], pts = [];
    if (P === E.GL_TRIANGLES) for (let i = 0; i + 2 < v.length; i += 3) tri.push(v[i], v[i + 1], v[i + 2]);
    else if (P === E.GL_TRIANGLE_STRIP) for (let i = 0; i + 2 < v.length; i++) i % 2 === 0 ? tri.push(v[i], v[i + 1], v[i + 2]) : tri.push(v[i + 1], v[i], v[i + 2]);
    else if (P === E.GL_QUAD_STRIP) for (let i = 0; i + 3 < v.length; i += 2) tri.push(v[i], v[i + 1], v[i + 3], v[i], v[i + 3], v[i + 2]);
    else if (P === E.GL_TRIANGLE_FAN || P === E.GL_POLYGON) for (let i = 1; i + 1 < v.length; i++) tri.push(v[0], v[i], v[i + 1]);
    else if (P === E.GL_QUADS) for (let i = 0; i + 3 < v.length; i += 4) tri.push(v[i], v[i + 1], v[i + 2], v[i], v[i + 2], v[i + 3]);
    else if (P === E.GL_LINES) for (let i = 0; i + 1 < v.length; i += 2) lin.push(v[i], v[i + 1]);
    else if (P === E.GL_LINE_STRIP || P === E.GL_LINE_LOOP) { for (let i = 0; i + 1 < v.length; i++) lin.push(v[i], v[i + 1]); if (P === E.GL_LINE_LOOP && v.length > 2) lin.push(v[v.length - 1], v[0]); }
    else if (P === E.GL_POINTS) pts.push(...v);
    if (tri.length) this._agregar(w.TRIANGLES, tri);
    if (lin.length) this._agregar(w.LINES, lin);
    if (pts.length) this._agregar(w.POINTS, pts);
  }
  _agregar(prim, verts) {
    if (prim !== this.primLote) { this.flush(); this.primLote = prim; }
    if ((this.nLote + verts.length) * 11 > this.lote.length) this.flush();
    if (verts.length * 11 > this.lote.length) { const nuevo = new Float32Array(verts.length * 11 * 2); this.lote = nuevo; }
    for (const x of verts) { this.lote.set(x, this.nLote * 11); this.nLote++; }
  }

  // Memoria de video directa de Glide (grLfbLock/grLfbUnlock): una imagen de 16 bits (5-6-5) de ancho x alto con
  // 'paso' bytes por fila y origen arriba a la izquierda, pegada sobre todo el cuadro sin tocar el estado de OpenGL.
  // abgr: la placa se abrio con GR_COLORFORMAT_ABGR (lo que hace Mesa): el rojo va en los 5 bits de abajo y el azul
  // en los de arriba. Si no, RGB565 comun (rojo arriba).
  lfb(datos, ancho, alto, paso, abgr = false) {
    this.flush();
    // a que canal de RGBA van los 5 bits de arriba y los 5 de abajo
    const w = this.w, rgba = new Uint8Array(ancho * alto * 4), arriba = abgr ? 2 : 0, abajo = abgr ? 0 : 2;
    for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
      const o = y * paso + x * 2, v = datos[o] | (datos[o + 1] << 8), d = (y * ancho + x) * 4;
      rgba[d + arriba] = ((v >> 11) & 31) * 255 / 31; rgba[d + 1] = ((v >> 5) & 63) * 255 / 63; rgba[d + abajo] = (v & 31) * 255 / 31; rgba[d + 3] = 255;
    }
    if (!this.texLfb) { this.texLfb = w.createTexture(); w.bindTexture(w.TEXTURE_2D, this.texLfb); w.texParameteri(w.TEXTURE_2D, w.TEXTURE_MIN_FILTER, w.NEAREST); w.texParameteri(w.TEXTURE_2D, w.TEXTURE_MAG_FILTER, w.NEAREST); w.texParameteri(w.TEXTURE_2D, w.TEXTURE_WRAP_S, w.CLAMP_TO_EDGE); w.texParameteri(w.TEXTURE_2D, w.TEXTURE_WRAP_T, w.CLAMP_TO_EDGE); }
    w.bindTexture(w.TEXTURE_2D, this.texLfb);
    w.texImage2D(w.TEXTURE_2D, 0, w.RGBA, ancho, alto, 0, w.RGBA, w.UNSIGNED_BYTE, rgba);
    const estados = [w.BLEND, w.CULL_FACE, w.DEPTH_TEST, w.SCISSOR_TEST].map(e => [e, w.isEnabled(e)]);
    estados.forEach(([e]) => w.disable(e));
    const u = this.u;
    w.uniform1f(u.uUsaTex, 1); w.uniform1i(u.uModo, 1); w.uniform1i(u.uFmt, 1); w.uniform1i(u.uAlfaFunc, 8); w.uniform1i(u.uNiebla, 0);
    const vp = w.getParameter(w.VIEWPORT); w.viewport(0, 0, this.lienzo.width, this.lienzo.height);
    // 2 triangulos en coordenadas de recorte: arriba de la imagen (v = 0) arriba de la pantalla
    const q = [[-1, 1, 0, 0], [1, 1, 1, 0], [1, -1, 1, 1], [-1, 1, 0, 0], [1, -1, 1, 1], [-1, -1, 0, 1]];
    const f = new Float32Array(6 * 11);
    q.forEach(([x, y, s, t], i) => f.set([x, y, 0, 1, 1, 1, 1, 1, s, t, 0], i * 11));
    w.bindBuffer(w.ARRAY_BUFFER, this.buf); w.bufferData(w.ARRAY_BUFFER, f, w.STREAM_DRAW);
    const a = this.a, T = 44;
    [a.pos, a.col, a.tex, a.eye].forEach(l => w.enableVertexAttribArray(l));
    w.vertexAttribPointer(a.pos, 4, w.FLOAT, false, T, 0); w.vertexAttribPointer(a.col, 4, w.FLOAT, false, T, 16);
    w.vertexAttribPointer(a.tex, 2, w.FLOAT, false, T, 32); w.vertexAttribPointer(a.eye, 1, w.FLOAT, false, T, 40);
    w.drawArrays(w.TRIANGLES, 0, 6);
    w.viewport(vp[0], vp[1], vp[2], vp[3]);
    estados.forEach(([e, on]) => on && w.enable(e));
    const to = this._texObj(); w.bindTexture(w.TEXTURE_2D, to ? to.t : this.texNula);
  }

  // dibuja lo acumulado con el estado actual
  flush() {
    if (!this.nLote) return;
    const w = this.w, u = this.u, to = this._texObj();
    const usaTex = this.activos.has(E.GL_TEXTURE_2D) && !!to;
    w.uniform1f(u.uUsaTex, usaTex ? 1 : 0);
    w.uniform1i(u.uTex, 0);
    w.uniform1i(u.uModo, TEX_MODO[this.texModo] ?? 0);
    w.uniform1i(u.uFmt, to ? to.fmt : 0);
    w.uniform4fv(u.uEnvCol, this.envCol);
    w.uniform1i(u.uAlfaFunc, this.activos.has(E.GL_ALPHA_TEST) ? FUNC[this.alfaFunc] ?? 7 : 8);
    w.uniform1f(u.uAlfaRef, this.alfaRef);
    const n = this.niebla;
    w.uniform1i(u.uNiebla, this.activos.has(E.GL_FOG) ? (n.modo === E.GL_LINEAR ? 1 : n.modo === E.GL_EXP ? 2 : 3) : 0);
    w.uniform4fv(u.uNieblaCol, n.col); w.uniform1f(u.uNieblaIni, n.ini); w.uniform1f(u.uNieblaFin, n.fin); w.uniform1f(u.uNieblaDens, n.dens);
    w.uniform1f(u.uPunto, this.puntoTam * this.escala);
    w.bindBuffer(w.ARRAY_BUFFER, this.buf);
    w.bufferData(w.ARRAY_BUFFER, this.lote.subarray(0, this.nLote * 11), w.STREAM_DRAW);
    const T = 44, a = this.a;
    w.enableVertexAttribArray(a.pos); w.vertexAttribPointer(a.pos, 4, w.FLOAT, false, T, 0);
    w.enableVertexAttribArray(a.col); w.vertexAttribPointer(a.col, 4, w.FLOAT, false, T, 16);
    w.enableVertexAttribArray(a.tex); w.vertexAttribPointer(a.tex, 2, w.FLOAT, false, T, 32);
    w.enableVertexAttribArray(a.eye); w.vertexAttribPointer(a.eye, 1, w.FLOAT, false, T, 40);
    w.drawArrays(this.primLote, 0, this.nLote);
    this.nLote = 0;
  }
}
