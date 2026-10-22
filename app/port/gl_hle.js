// Atiende las llamadas del juego a OpenGL/AUX/Glide (52 funciones, tabla en gl_tabla.js) y las pasa a un
// "dibujante" con la misma API (gl1.js en el navegador, o un registro de comandos / un doble de pruebas).
import { R, M, M8, HLE } from './cpu.js';
import { GL_TABLA } from './gl_tabla.js';

export const LFB = { dir: 0x3E00000, ancho: 640, alto: 480, paso: 2048 };   // memoria de video simulada (RGB565)
const REG = { a: 0, c: 1, d: 2, b: 3 };
const f32 = (() => { const dv = new DataView(new ArrayBuffer(4)); return (bits) => { dv.setInt32(0, bits); return dv.getFloat32(0); }; })();
const BPP = { 0x1908: 4, 0x1907: 3, 0x1909: 1, 0x190A: 2, 0x1906: 1 };

function arg(tipo, lugar) {
  if (typeof lugar === 'string') { const v = R[REG[lugar]]; return tipo === 'f32' ? f32(v) : v; }
  const d = (R[4] + 4 + lugar) >>> 0;                      // la pila arranca despues de la direccion de retorno
  return tipo === 'f64' ? M.getFloat64(d, true) : tipo === 'f32' ? M.getFloat32(d, true) : M.getInt32(d, true);
}
const flotantes = (p, n) => { const o = new Array(n); for (let i = 0; i < n; i++) o[i] = M.getFloat32((p + 4 * i) >>> 0, true); return o; };

// (21/10) contar las llamadas por funcion solo si se pide (tools\recompilador\arrancar.mjs): en el juego es trabajo de
// mas en cada llamada de dibujo
export const estadoGL = { viewport: [0, 0, 640, 480], cuadros: 0, llamadas: new Map(), contar: false };

export function instalarGL(dib) {
  for (const [dir, nombre, args, pila] of GL_TABLA) {
    const n = args.length;
    HLE[dir] = () => {
      const v = new Array(n);
      for (let i = 0; i < n; i++) v[i] = arg(args[i][0], args[i][1]);
      if (estadoGL.contar) estadoGL.llamadas.set(nombre, (estadoGL.llamadas.get(nombre) || 0) + 1);
      const r = especial(dib, nombre, v);
      if (r !== undefined) R[0] = r | 0;
      return pila;
    };
  }
}

function especial(dib, nombre, v) {
  switch (nombre) {
    case 'glColor3fv': { const c = flotantes(v[0], 3); dib.glColor3f(c[0], c[1], c[2]); return; }
    case 'glColor4fv': { const c = flotantes(v[0], 4); dib.glColor4f(c[0], c[1], c[2], c[3]); return; }
    case 'glMultMatrixf': dib.glMultMatrixf(flotantes(v[0], 16)); return;
    case 'glMaterialf': case 'glMaterialfv': case 'glPixelStorei': return;          // sin efecto en este juego (no hay iluminacion)
    case 'glGenTextures': { const ids = dib.glGenTextures(v[0]); for (let i = 0; i < v[0]; i++) M.setInt32((v[1] + 4 * i) >>> 0, ids[i], true); return; }
    case 'glDeleteTextures': { const ids = []; for (let i = 0; i < v[0]; i++) ids.push(M.getInt32((v[1] + 4 * i) >>> 0, true)); dib.glDeleteTextures(v[0], ids); return; }
    case 'glTexImage2D': {
      const [t, nivel, interno, w, h, borde, fmt, tipo, p] = v;
      const n = w * h * (BPP[fmt] || 4);
      dib.glTexImage2D(t, nivel, interno, w, h, borde, fmt, tipo, p ? M8.subarray(p >>> 0, (p >>> 0) + n) : null);
      return;
    }
    case 'glViewport': estadoGL.viewport = v.slice(0, 4); dib.glViewport(...v); return;
    case 'glGetIntegerv': {
      if (v[0] === 0x0BA2) estadoGL.viewport.forEach((x, i) => M.setInt32((v[1] + 4 * i) >>> 0, x, true));
      else M.setInt32(v[1] >>> 0, 0, true);
      return;
    }
    case 'glAreTexturesResident': { for (let i = 0; i < v[0]; i++) M8[(v[2] >>> 0) + i] = 1; return 1; }
    case 'glReadPixels': { const [, , w, h, fmt, , p] = v; M8.fill(0, p >>> 0, (p >>> 0) + w * h * (BPP[fmt] || 3)); if (dib.glReadPixelsA) dib.glReadPixelsA(...v); return; }
    case 'auxInitDisplayMode': dib.auxInitDisplayMode?.(v[0]); return;
    case 'auxInitPosition': dib.auxInitPosition?.(...v); return;
    case 'auxInitWindow': return dib.auxInitWindow ? dib.auxInitWindow() : 1;
    case 'auxSwapBuffers': estadoGL.cuadros++; dib.auxSwapBuffers?.(); return;
    case 'auxQuit': dib.auxQuit?.(); return;
    case 'grLfbLock': {
      const info = v[5] >>> 0;                    // GrLfbInfo_t: size, lfbPtr, strideInBytes, writeMode, origin
      M.setInt32(info + 4, LFB.dir, true); M.setInt32(info + 8, LFB.paso, true); M.setInt32(info + 12, v[2], true); M.setInt32(info + 16, v[3], true);
      return 1;
    }
    // Mesa abre la placa con GR_COLORFORMAT_ABGR: en el modo 565 el rojo va abajo. El juego (0x2F680) pone ahi el
    // primer byte de cada pixel del PNG, que es el rojo: con RGB565 comun las caratulas salian con rojo y azul cambiados.
    case 'grLfbUnlock': dib.lfb?.(M8.subarray(LFB.dir, LFB.dir + LFB.paso * LFB.alto), LFB.ancho, LFB.alto, LFB.paso, true); return 1;
  }
  const f = dib[nombre];
  if (!f) throw new Error('El dibujante no tiene ' + nombre);
  return f.apply(dib, v);
}
