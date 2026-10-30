// Certificado HTTPS propio (autofirmado) para el modo servidor (servidor.mjs --https). El juego necesita memoria
// compartida, y el navegador solo la da en https:// o en localhost: para que los celulares de la misma wifi puedan
// jugar entrando a https://192.168.x.x hace falta un certificado. Se arma aca, sin openssl: una llave EC P-256 de
// node:crypto y el certificado X.509 escrito a mano en DER, firmado por esa misma llave. El navegador avisa una vez
// ("la conexion no es privada": no lo firmo una autoridad) y despues entra.
import crypto from 'node:crypto';

// ---------- DER minimo ----------
const largo = (n) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
const tlv = (tag, ...partes) => { const c = Buffer.concat(partes.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p)))); return Buffer.concat([Buffer.from([tag, ...largo(c.length)]), c]); };
const sec = (...p) => tlv(0x30, ...p);
const conjunto = (...p) => tlv(0x31, ...p);
const entero = (b) => { b = Buffer.from(b); if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]); return tlv(0x02, b); };
function oid(texto) {
  const n = texto.split('.').map(Number), b = [40 * n[0] + n[1]];
  for (const v of n.slice(2)) { const t = []; let x = v; do { t.unshift(x & 127); x >>= 7; } while (x); for (let i = 0; i < t.length - 1; i++) t[i] |= 128; b.push(...t); }
  return tlv(0x06, b);
}
const utf8 = (s) => tlv(0x0C, Buffer.from(s, 'utf8'));
const fecha = (d) => { const s = d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z'; return d.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(s.slice(2))) : tlv(0x18, Buffer.from(s)); };
const nombre = (cn) => sec(conjunto(sec(oid('2.5.4.3'), utf8(cn))));

// ips: ['192.168.0.10', ...]; nombres: ['localhost', ...]. Devuelve { llave, certificado } en PEM.
export function certificadoPropio(ips, nombres = ['localhost']) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const algoritmo = sec(oid('1.2.840.10045.4.3.2'));                       // ecdsa-with-SHA256
  const ahora = new Date(Date.now() - 86400000), hasta = new Date(Date.now() + 397 * 86400000);
  const alternativos = sec(...nombres.map((n) => tlv(0x82, Buffer.from(n))), ...ips.map((ip) => tlv(0x87, Buffer.from(ip.split('.').map(Number)))));
  const extensiones = tlv(0xA3, sec(
    sec(oid('2.5.29.17'), tlv(0x04, alternativos)),                            // subjectAltName
    sec(oid('2.5.29.19'), tlv(0x04, sec())),                                   // basicConstraints: no es autoridad
    sec(oid('2.5.29.37'), tlv(0x04, sec(oid('1.3.6.1.5.5.7.3.1')))),           // uso: servidor web
  ));
  const tbs = sec(
    tlv(0xA0, entero([2])), entero(crypto.randomBytes(12)), algoritmo,
    nombre('Pump It Up Extra (servidor)'), sec(fecha(ahora), fecha(hasta)), nombre('Pump It Up Extra (servidor)'),
    publicKey.export({ type: 'spki', format: 'der' }), extensiones);
  const firma = crypto.sign('sha256', tbs, { key: privateKey, dsaEncoding: 'der' });
  const der = sec(tbs, algoritmo, tlv(0x03, Buffer.concat([Buffer.from([0]), firma])));
  const pem = '-----BEGIN CERTIFICATE-----\n' + der.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
  return { llave: privateKey.export({ type: 'pkcs8', format: 'pem' }), certificado: pem };
}
