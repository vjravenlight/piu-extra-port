// Genera app\port\gl_tabla.js a partir de investigacion\gl_nombres.json (tabla del asistente de OpenGL):
// direccion, nombre, de donde sale cada argumento (registro o pila) y su tipo, y cuantos bytes de pila limpia.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const j = JSON.parse(fs.readFileSync(path.join(base, 'investigacion', 'gl_nombres.json'), 'utf8'));
const filas = [];
for (const [dir, e] of Object.entries(j)) {
  const args = (e.args || []).map((a) => {
    const m = /\((EAX|EDX|EBX|ECX|pila\+(\d+))\)\s*$/.exec(a);
    if (!m) throw new Error(`no entiendo el argumento "${a}" de ${e.nombre}`);
    const lugar = m[2] !== undefined ? +m[2] : ['EAX', 'ECX', 'EDX', 'EBX'].indexOf(m[1]) >= 0 ? { EAX: 'a', EDX: 'd', EBX: 'b', ECX: 'c' }[m[1]] : null;
    const tipo = /\*/.test(a) ? 'ptr' : /GLdouble/.test(a) ? 'f64' : /GLfloat|GLclampf/.test(a) ? 'f32' : 'int';
    return [tipo, lugar];
  });
  filas.push(`  [${dir}, ${JSON.stringify(e.nombre)}, ${JSON.stringify(args)}, ${e.pila_bytes | 0}]`);
}
const salida = path.join(base, 'app', 'port', 'gl_tabla.js');
fs.writeFileSync(salida, '// GENERADO por tools\\recompilador\\generar_gl_hle.mjs desde investigacion\\gl_nombres.json. No editar a mano.\n' +
  '// [direccion, nombre, [[tipo, lugar]...], bytes de pila que limpia]. lugar: a/d/b/c = EAX/EDX/EBX/ECX, numero = desplazamiento en la pila\n' +
  'export const GL_TABLA = [\n' + filas.join(',\n') + '\n];\n');
console.log(`gl_tabla.js: ${filas.length} funciones`);
