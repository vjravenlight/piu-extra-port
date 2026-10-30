// Saca de Piu.exe los dos volcados que usa el port (codigo en 0x20000 y datos en 0x130000), con las direcciones ya
// resueltas. El cargador esta en exe_le.mjs (JavaScript puro, lo usa tambien el navegador).
// Uso: node cargar_exe.mjs <Piu.exe> <carpeta de salida>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cargarLE, sacarVolcados } from './exe_le.mjs';
export { cargarLE, sacarVolcados };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , exePath, salida] = process.argv;
  if (!exePath || !salida) { console.log('Uso: node cargar_exe.mjs <Piu.exe> <carpeta de salida>'); process.exit(1); }
  const r = cargarLE(new Uint8Array(fs.readFileSync(exePath)));
  fs.mkdirSync(salida, { recursive: true });
  for (const [nombre, datos] of Object.entries(sacarVolcados(r))) { fs.writeFileSync(path.join(salida, nombre), datos); console.log(`${nombre}: ${datos.length} bytes`); }
  console.log(`${r.objetos.length} objetos, ${r.resueltos} direcciones resueltas, arranque en 0x${r.eip.toString(16)}`);
}
