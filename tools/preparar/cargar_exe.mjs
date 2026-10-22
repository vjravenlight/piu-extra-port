// Carga Piu.exe (formato LE de DOS/4GW) como lo hacia la cabina y saca los dos volcados que usa el port:
// el codigo (objeto 1, en 0x20000) y los datos (objeto 2, en 0x130000), con las direcciones ya resueltas (fixups).
// Antes se sacaban con radare2 (-e bin.relocs.apply=true); este cargador da lo mismo byte por byte (comprobado 21/10).
// Uso: node cargar_exe.mjs <Piu.exe> <carpeta de salida>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function cargarLE(exe) {
  const u32 = (o) => exe.readUInt32LE(o), u16 = (o) => exe.readUInt16LE(o);
  const le = u32(0x3C);
  if (exe.toString('latin1', le, le + 2) !== 'LE') throw new Error('no es un ejecutable LE (DOS/4GW)');
  const tamPagina = u32(le + 0x28), ultima = u32(le + 0x2C), paginas = u32(le + 0x14);
  const tablaObj = le + u32(le + 0x40), nObj = u32(le + 0x44), tablaPag = le + u32(le + 0x48);
  const tablaFixPag = le + u32(le + 0x68), tablaFix = le + u32(le + 0x6C), datosPag = u32(le + 0x80);
  const objetos = [];
  for (let i = 0; i < nObj; i++) {
    const o = tablaObj + 24 * i;
    objetos.push({ tam: u32(o), base: u32(o + 4), flags: u32(o + 8), primera: u32(o + 12), cuantas: u32(o + 16) });
  }
  // cada objeto en su base, del tamano de sus paginas (o de su tamano virtual si es mayor), lo demas en cero
  const memoria = objetos.map((ob) => Buffer.alloc(Math.ceil(Math.max(ob.tam, ob.cuantas * tamPagina) / tamPagina) * tamPagina));
  const dondePagina = [];        // pagina logica (1..) -> { objeto, desplazamiento dentro del objeto }
  objetos.forEach((ob, n) => {
    for (let k = 0; k < ob.cuantas; k++) {
      const p = ob.primera + k, e = tablaPag + 4 * (p - 1);
      const fisica = (exe[e] << 16) | (exe[e + 1] << 8) | exe[e + 2];      // LE: numero de pagina de 24 bits, alto primero
      dondePagina[p] = { n, desde: k * tamPagina };
      if (exe[e + 3] !== 0 || fisica === 0) continue;                      // pagina sin datos (se queda en cero)
      const largo = fisica === paginas ? ultima : tamPagina;
      exe.copy(memoria[n], k * tamPagina, datosPag + (fisica - 1) * tamPagina, datosPag + (fisica - 1) * tamPagina + largo);
    }
  });
  // fixups: por cada pagina, sus registros (solo los internos, que es lo que usa el juego)
  let resueltos = 0;
  for (let p = 1; p <= paginas; p++) {
    const dp = dondePagina[p]; if (!dp) continue;
    let r = tablaFix + u32(tablaFixPag + 4 * (p - 1));
    const fin = tablaFix + u32(tablaFixPag + 4 * p);
    const mem = memoria[dp.n], baseFuente = objetos[dp.n].base + dp.desde;
    while (r < fin) {
      const fuente = exe[r], banderas = exe[r + 1]; r += 2;
      const tipo = fuente & 0x0F, lista = fuente & 0x20;
      let cuenta = 1, desp = 0;
      if (lista) cuenta = exe[r++]; else { desp = exe.readInt16LE(r); r += 2; }
      if ((banderas & 3) !== 0) throw new Error(`fixup no interno en la pagina ${p} (tipo ${banderas & 3})`);
      const obj = banderas & 0x40 ? u16(r) : exe[r]; r += banderas & 0x40 ? 2 : 1;
      let destino = 0;
      if (tipo !== 0x02) { if (banderas & 0x10) { destino = u32(r); r += 4; } else { destino = u16(r); r += 2; } }
      let suma = 0;
      if (banderas & 0x04) { if (banderas & 0x20) { suma = u32(r); r += 4; } else { suma = u16(r); r += 2; } }
      const lugares = [];
      if (lista) { for (let k = 0; k < cuenta; k++) { lugares.push(exe.readInt16LE(r)); r += 2; } } else lugares.push(desp);
      const valor = (objetos[obj - 1].base + destino + suma) >>> 0;
      // selector: el modo es plano y el juego no lo usa; se pone base >> 16, como radare2, para que el volcado sea igual
      const selector = objetos[obj - 1].base >>> 16;
      for (const d of lugares) {
        const en = dp.desde + d;                 // puede caer antes o despues de la pagina (fixups que cruzan el borde)
        const poner = (v, bytes, mas = 0) => { for (let b = 0; b < bytes; b++) { const i = en + mas + b; if (i >= 0 && i < mem.length) mem[i] = (v >>> (8 * b)) & 0xFF; } };
        if (tipo === 0x07) poner(valor, 4);                                    // offset de 32 bits
        else if (tipo === 0x08) poner((valor - (baseFuente + d + 4)) >>> 0, 4); // relativo de 32 bits
        else if (tipo === 0x05) poner(valor, 2);                               // offset de 16 bits
        else if (tipo === 0x06) { poner(valor, 4); poner(selector, 2, 4); }    // 16:32
        else if (tipo === 0x03) { poner(valor, 2); poner(selector, 2, 2); }    // 16:16
        else if (tipo === 0x02) poner(selector, 2);                            // selector solo
        else throw new Error(`fixup de tipo 0x${tipo.toString(16)} en la pagina ${p}`);
        resueltos++;
      }
    }
  }
  return { objetos, memoria, resueltos, eip: objetos[u32(le + 0x18) - 1].base + u32(le + 0x1C) };
}

// los dos volcados del port: { 'codigo_0x20000.bin': Buffer, 'datos_0x130000.bin': Buffer }
export function sacarVolcados(r) {
  const salida = {};
  for (const [nombre, base] of [['codigo', 0x20000], ['datos', 0x130000]]) {
    const n = r.objetos.findIndex((ob) => ob.base === base);
    if (n < 0) throw new Error(`no hay objeto en 0x${base.toString(16)}: este no es el Piu.exe de Extra`);
    // el largo de siempre: las paginas enteras que trae el archivo y entran en el tamano del objeto (lo que cubria radare2)
    const ob = r.objetos[n], largo = Math.min(Math.floor(ob.tam / 4096), ob.cuantas) * 4096;
    salida[`${nombre}_0x${base.toString(16)}.bin`] = r.memoria[n].subarray(0, largo);
  }
  return salida;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , exePath, salida] = process.argv;
  if (!exePath || !salida) { console.log('Uso: node cargar_exe.mjs <Piu.exe> <carpeta de salida>'); process.exit(1); }
  const r = cargarLE(fs.readFileSync(exePath));
  fs.mkdirSync(salida, { recursive: true });
  for (const [nombre, datos] of Object.entries(sacarVolcados(r))) { fs.writeFileSync(path.join(salida, nombre), datos); console.log(`${nombre}: ${datos.length} bytes`); }
  console.log(`${r.objetos.length} objetos, ${r.resueltos} direcciones resueltas, arranque en 0x${r.eip.toString(16)}`);
}
