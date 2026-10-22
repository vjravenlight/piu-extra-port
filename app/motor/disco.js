// Lee el disco de la cabina (imagen BIN, MODE2/2352, multisesion) en el navegador o en Node, sin extraerlo antes.
// Uso:
//   const disco = await Disco.abrir(lector);            // lector = { tam, leer(pos, n) -> Promise<Uint8Array> }
//   disco.lista()                                        // [{ ruta, tam }]
//   await disco.leer('Piu/Audio/05.AUD')                 // Uint8Array
// En el navegador: Disco.abrir(lectorDeArchivo(file)) con el File que elige el jugador.

const SECT = 2352;
const bcd = (b) => (b >> 4) * 10 + (b & 15);

export function lectorDeArchivo(archivo) {
  return { tam: archivo.size, async leer(pos, n) { return new Uint8Array(await archivo.slice(pos, pos + n).arrayBuffer()); } };
}

export class Disco {
  constructor(lector) {
    this.l = lector;
    this.n = Math.floor(lector.tam / SECT);
    this.sesiones = [];          // [{ idx, lba, fin }] tramos donde lba = idx - idxInicio + lbaInicio
    this.archivos = new Map();   // ruta en minusculas -> { ruta, lba, tam }
  }

  static async abrir(lector) {
    const d = new Disco(lector);
    await d._sesiones();
    await d._sistemaDeArchivos();
    return d;
  }

  async _lbaDe(i) {
    const h = await this.l.leer(i * SECT + 12, 3);
    return (bcd(h[0]) * 60 + bcd(h[1])) * 75 + bcd(h[2]) - 150;
  }

  // Cada sesion es un tramo donde el LBA del encabezado crece de a uno; entre sesiones hay un hueco
  // (sectores vacios). Se ubican con busquedas binarias, sin recorrer todo el disco.
  async _sesiones() {
    const ult = this.n - 1;
    const desfUlt = (await this._lbaDe(ult)) - ult;
    let desde = 0;
    while (desde <= ult) {
      const desf = (await this._lbaDe(desde)) - desde;
      if (desf === desfUlt) { this.sesiones.push({ idx: desde, lba: desde + desf, fin: ult }); break; }
      let lo = desde, hi = ult;                         // lba(lo) = lo + desf; lba(hi) no
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if ((await this._lbaDe(m)) - m === desf) lo = m; else hi = m; }
      this.sesiones.push({ idx: desde, lba: desde + desf, fin: lo });
      let a = hi, b = ult;                              // primer indice de la ultima sesion
      while (a < b) { const m = (a + b) >> 1; if ((await this._lbaDe(m)) - m === desfUlt) b = m; else a = m + 1; }
      desde = a;                                        // (este disco tiene 2 sesiones; con mas, las del medio se saltean)
    }
  }

  _indice(lba) {
    for (const s of this.sesiones) if (lba >= s.lba && lba <= s.lba + (s.fin - s.idx)) return lba - s.lba + s.idx;
    throw new Error('LBA fuera del disco: ' + lba);
  }

  // lee 'cuantos' sectores de datos (2048 bytes) desde el LBA dado
  async _sectores(lba, cuantos) {
    const salida = new Uint8Array(cuantos * 2048);
    let hecho = 0;
    while (hecho < cuantos) {
      const idx = this._indice(lba + hecho);
      const ses = this.sesiones.find(s => idx >= s.idx && idx <= s.fin);
      const tramo = Math.min(cuantos - hecho, ses.fin - idx + 1, 512);
      const crudo = await this.l.leer(idx * SECT, tramo * SECT);
      for (let k = 0; k < tramo; k++) {
        const o = k * SECT, ini = crudo[o + 15] === 1 ? 16 : 24;   // modo 1: datos en +16; modo 2 forma 1: en +24
        salida.set(crudo.subarray(o + ini, o + ini + 2048), (hecho + k) * 2048);
      }
      hecho += tramo;
    }
    return salida;
  }

  async _sistemaDeArchivos() {
    const ses = this.sesiones[this.sesiones.length - 1];
    let pvd = null, joliet = null;
    for (let k = 16; k < 40; k++) {
      const d = await this._sectores(ses.lba + k, 1);
      if (String.fromCharCode(d[1], d[2], d[3], d[4], d[5]) !== 'CD001') break;
      if (d[0] === 1 && !pvd) pvd = d;
      if (d[0] === 2 && d[88] === 0x25 && d[89] === 0x2F) joliet = d;
      if (d[0] === 255) break;
    }
    const vd = joliet || pvd;
    if (!vd) throw new Error('No encuentro el sistema de archivos del disco');
    const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
    const nombre = (b, o, n) => {
      let s = '';
      if (joliet) for (let i = 0; i + 1 < n; i += 2) s += String.fromCharCode((b[o + i] << 8) | b[o + i + 1]);
      else for (let i = 0; i < n; i++) s += String.fromCharCode(b[o + i]);
      return s.replace(/;\d+$/, '');
    };
    const recorrer = async (lba, tam, camino, prof) => {
      if (prof > 16) return;
      const d = await this._sectores(lba, Math.ceil(tam / 2048));
      let p = 0;
      while (p < tam) {
        const len = d[p];
        if (len === 0) { p = (Math.floor(p / 2048) + 1) * 2048; continue; }
        const ext = u32(d, p + 2), sz = u32(d, p + 10), flags = d[p + 25], nl = d[p + 32];
        if (!(nl === 1 && d[p + 33] <= 1)) {
          const ruta = (camino ? camino + '/' : '') + nombre(d, p + 33, nl);
          if (flags & 2) await recorrer(ext, sz, ruta, prof + 1);
          else this.archivos.set(ruta.toLowerCase(), { ruta, lba: ext, tam: sz });
        }
        p += len;
      }
    };
    await recorrer(u32(vd, 156 + 2), u32(vd, 156 + 10), '', 0);
  }

  lista() { return [...this.archivos.values()].map(a => ({ ruta: a.ruta, tam: a.tam })); }
  existe(ruta) { return this.archivos.has(ruta.toLowerCase().replace(/\\/g, '/')); }

  async leer(ruta) {
    const a = this.archivos.get(ruta.toLowerCase().replace(/\\/g, '/'));
    if (!a) throw new Error('No está en el disco: ' + ruta);
    const d = await this._sectores(a.lba, Math.ceil(a.tam / 2048));
    return d.subarray(0, a.tam);
  }
}
