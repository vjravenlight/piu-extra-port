// Prueba del importador (app\port\importar_pasos.js), sin navegador: tablas armadas a mano en cada formato, y para cada
// flecha se compara la hora que dice el formato de origen con la hora a la que el motor la va a tocar.
// Uso: node tools\probar_importar_pasos.mjs
import { importarPasos, horaDeFila, filaDeHora, TOPE_FILAS } from '../app/port/importar_pasos.js';
let fallas = 0;
const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) { fallas++; process.exitCode = 1; } };
const bytes = (s) => new TextEncoder().encode(s);
const cerca = (a, b, tol = 0.012) => Math.abs(a - b) <= tol;
const horaNota = (c, r) => horaDeFila(c, r);
const fila = (...cols) => { const a = new Array(13).fill('0'); for (const [i, k] of cols) a[i] = k; return a.join(''); };
const vacia = '0000000000000', FIN = '2222222222222';
const ksf = (cab, filas) => `${cab.map(x => `#${x};`).join('\r\n')}\r\n#STEP:\r\n${filas.join('\r\n')}\r\n${FIN}\r\n`;

// --- KSF clasico: tick 4, una flecha por pulso, una larga
{
  const filas = [fila([0, '1']), vacia, vacia, vacia, fila([1, '1']), vacia, fila([2, '4']), fila([2, '4']), fila([2, '4']), vacia, fila([4, '1'])];
  const { cartas: [c] } = importarPasos('cancion_cz_1.ksf', bytes(ksf(['TITLE:Prueba', 'BPM:150', 'STARTTIME:50', 'TICKCOUNT:4', 'PLAYER:SINGLE', 'DIFFICULTY:9'], filas)));
  ok(c.modo === 'CRAZY' && c.tipo === 'simple' && c.nivel === 9, 'KSF: modo y nivel salen del nombre y de la cabecera');
  ok(c.bpms[0] === 150 && c.valores[0] === 50 && c.filasPorPulso === 4, 'KSF: BPM, desfase y filas por pulso pasan directo');
  ok(JSON.stringify(c.notas) === JSON.stringify([[0, 0], [4, 1], [10, 4]]), 'KSF: flechas en su fila y columna ' + JSON.stringify(c.notas));
  ok(JSON.stringify(c.largas) === JSON.stringify([[2, 6, 8]]), 'KSF: la larga termina en el ultimo 4 ' + JSON.stringify(c.largas));
  ok(cerca(horaNota(c, 4), 0.5 + 1 * 60 / 150), 'KSF: hora de la fila 4');
}
// --- KSF con BUNKI y STARTTIME2: el modelo del .NOT
{
  const filas = []; for (let i = 0; i < 80; i++) filas.push(i % 4 === 0 ? fila([0, '1']) : vacia);
  const { cartas: [c] } = importarPasos('x_hd_1.ksf', bytes(ksf(['BPM:120', 'BPM2:180', 'BUNKI:1000', 'STARTTIME:0', 'STARTTIME2:333', 'TICKCOUNT:4'], filas)));
  ok(c.bpms.length === 2 && c.bpms[1] === 180 && c.cambiosBpm[0] === 1000, 'KSF BUNKI: dos tramos ' + JSON.stringify([c.bpms, c.valores, c.cambiosBpm]));
  ok(cerca(horaDeFila(c, 16), 2), 'KSF BUNKI: fila 16 en el primer tramo');
}
// --- KSF sin STARTTIME2: sigue de corrido
{
  const filas = []; for (let i = 0; i < 200; i++) filas.push(i % 4 === 0 ? fila([1, '1']) : vacia);
  const { cartas: [c] } = importarPasos('x_ez_1.ksf', bytes(ksf(['BPM:120', 'BPM2:60', 'BUNKI:1000', 'STARTTIME:0', 'TICKCOUNT:4'], filas)));
  // pulso 20 a los 10 s; despues a 60 BPM: el pulso 24 cae a los 14 s
  const r = c.notas.find(n => n[0] >= 0 && n[0] / 4 >= 24 - 1e-6 && Math.abs(horaDeFila(c, n[0]) - 14) < 0.05);
  ok(!!r, 'KSF BUNKI sin desfase: de corrido ' + JSON.stringify([c.bpms, c.valores, c.cambiosBpm]));
  ok(c.valores[1] === -1000, 'KSF BUNKI: al bajar el BPM el desfase da negativo (el motor lo divide con signo)');
}
// --- Direct Move: |B| |D| |T|
{
  const filas = [fila([0, '1']), vacia, vacia, vacia, '|B200|', fila([1, '1']), vacia, vacia, vacia, '|D500|', fila([2, '1']), vacia, vacia, vacia, fila([3, '1'])];
  const { cartas: [c] } = importarPasos('dm_hd_1.ksf', bytes(ksf(['BPM:100', 'STARTTIME:0', 'TICKCOUNT:4'], filas)));
  ok(c.bpms.includes(200), 'Direct Move: |B200| arma un tramo ' + JSON.stringify([c.bpms, c.valores, c.cambiosBpm]));
  ok(cerca(horaDeFila(c, c.notas[1][0]), 0.6), 'Direct Move: la flecha despues del cambio, a los 0,6 s: ' + horaDeFila(c, c.notas[1][0]));
  ok(cerca(horaDeFila(c, c.notas[2][0]), 0.9, 0.02), 'Direct Move: la del stop, antes de la pausa (0,9 s): ' + horaDeFila(c, c.notas[2][0]));
  ok(cerca(horaDeFila(c, c.notas[3][0]), 0.9 + 0.5 + 0.3, 0.02), 'Direct Move: despues de la pausa de 500 ms: ' + horaDeFila(c, c.notas[3][0]));
  ok(c.avisos.some(a => /no se congela/.test(a)), 'Direct Move: avisa que la flecha no se congela');
  const t = importarPasos('dm_t_1.ksf', bytes(ksf(['BPM:120', 'STARTTIME:0', 'TICKCOUNT:4'], [fila([0, '1']), vacia, '|T8|', fila([1, '1']), vacia, fila([2, '1'])]))).cartas[0];
  ok(cerca(horaDeFila(t, t.notas[1][0]), 0.25) && cerca(horaDeFila(t, t.notas[2][0]), 0.375), 'Direct Move: |T8| cambia la grilla ' + JSON.stringify(t.notas) + ' fpp ' + t.filasPorPulso + ' ' + t.avisos);
}
// --- SM
const sm = (extra, notas, tipo = 'pump-single', dif = 'Hard', nivel = 12) => `#TITLE:Ejemplo;\n#ARTIST:Yo;\n#MUSIC:song.mp3;\n#OFFSET:-0.150;\n${extra}\n#NOTES:\n     ${tipo}:\n     desc:\n     ${dif}:\n     ${nivel}:\n     0,0,0,0,0:\n${notas}\n;\n`;
{
  const { cartas: [c] } = importarPasos('a.sm', bytes(sm('#BPMS:0=120,8=240;', '10000\n01000\n00200\n00300\n,\n10000\n00000\n01000\n00000\n,\n00100\n00000\n00000\n00000\n')));
  ok(c.titulo === 'Ejemplo' && c.modo === 'CRAZY' && c.nivel === 12 && c.audio === 'song.mp3', 'SM: titulo, modo y audio');
  ok(c.valores[0] === 15, 'SM: OFFSET -0,150 = desfase 15 centesimas ' + c.valores[0]);
  ok(c.bpms.length === 2 && c.cambiosBpm[0] === Math.round((0.15 + 4) * 100), 'SM: cambio de BPM a su hora ' + JSON.stringify([c.bpms, c.valores, c.cambiosBpm]));
  ok(c.largas.length === 1 && c.largas[0][0] === 2, 'SM: 2...3 = larga');
  // pulso 8 = 4,15 s; desde ahi a 240: pulso 8 (compas 3, primera fila)
  const ult = c.notas[c.notas.length - 1];
  ok(cerca(horaDeFila(c, ult[0]), 4.15), 'SM: nota en el segundo tramo a 4,15 s: ' + horaDeFila(c, ult[0]));
}
// SM: OFFSET positivo (el pulso 0 antes de la musica) no deja desfase negativo
{
  const { cartas: [c] } = importarPasos('b.sm', bytes(sm('#BPMS:0=120;', '10000\n00000\n01000\n00000\n').replace('-0.150', '0.200')));
  ok(c.valores[0] >= 0, 'SM: OFFSET positivo no da desfase negativo: ' + c.valores[0]);
  ok(c.notas.length === 1 && cerca(horaDeFila(c, c.notas[0][0]), 0.8, 0.012), 'SM: la nota del pulso 2 queda en su hora: ' + JSON.stringify(c.notas));
  ok(c.avisos.some(a => /antes de que arranque/.test(a)), 'SM: la del pulso 0, antes de la musica, se avisa: ' + c.avisos);
}
// SM: stops, warps y notas que no existen en Pump
{
  const { cartas: [c] } = importarPasos('c.sm', bytes(sm('#BPMS:0=120;\n#STOPS:2=1.000;', '1000M\n00F00\n01000\n00004\n,\n00003\n00000\n00000\n00000\n').replace('-0.150', '0')));
  ok(c.avisos.some(a => /minas/.test(a)) && c.avisos.some(a => /falsas/.test(a)) && c.avisos.some(a => /rolls/.test(a)), 'SM: avisa minas, falsas y rolls: ' + c.avisos.join(' | '));
  ok(cerca(horaDeFila(c, c.notas[1][0]), 1), 'SM: la nota sobre el stop, antes de la pausa: ' + horaDeFila(c, c.notas[1][0]));
  ok(c.largas.length === 1 && cerca(horaDeFila(c, c.largas[0][1]), 1.5 + 1, 0.02), 'SM: despues del stop de 1 s: ' + horaDeFila(c, c.largas[0][1]));
}
{
  const r = () => importarPasos('d.sm', bytes(sm('#BPMS:0=120;', '1000\n0100\n', 'dance-single')));
  let m = ''; try { r(); } catch (e) { m = e.message; }
  ok(/no trae pasos de Pump/.test(m), 'SM: dance-single se rechaza con un mensaje claro: ' + m);
}
// double, couple, halfdouble
{
  const dob = importarPasos('e.sm', bytes(sm('#BPMS:0=120;', '1000000001\n0000010000\n', 'pump-double'))).cartas[0];
  ok(dob.tipo === 'doble' && dob.modo === 'DOUBLE' && dob.notas.some(n => n[1] === 9), 'SM: pump-double, 10 columnas');
  const cou = importarPasos('f.sm', bytes(sm('#BPMS:0=120;', '1000010000\n', 'pump-couple'))).cartas[0];
  ok(cou.tipo === 'versus' && cou.versus, 'SM: pump-couple = VERSUS');
  const med = importarPasos('g.sm', bytes(sm('#BPMS:0=120;', '100001\n', 'pump-halfdouble'))).cartas[0];
  ok(med.notas[0][1] === 2 && med.notas[1][1] === 7, 'SM: halfdouble en las columnas 2 a 7 ' + JSON.stringify(med.notas));
}
// tresillos y grillas finas
{
  const tres = importarPasos('h.sm', bytes(sm('#BPMS:0=120;', '10000\n00000\n01000\n00000\n00100\n00000\n00010\n00000\n00001\n00000\n10000\n00000\n'))).cartas[0];
  ok(tres.filasPorPulso === 3, 'SM: tresillos: 3 filas por pulso: ' + tres.filasPorPulso);
  const fina = Array.from({ length: 32 }, (_, i) => (i % 3 === 0 ? '10000' : '00000')).join('\n');
  const f = importarPasos('i.sm', bytes(sm('#BPMS:0=120;', fina))).cartas[0];
  ok(f.filasPorPulso === 4 && f.avisos.some(a => /corridas/.test(a)), 'SM: ritmo mas fino que la grilla: avisa: ' + f.avisos.join(' | '));
}
// BPM negativo y stop negativo (warps viejos)
{
  const w = importarPasos('j.sm', bytes(sm('#BPMS:0=120,4=-120,8=120;', `${'10000\n'.repeat(4)},\n${'01000\n'.repeat(4)},\n${'00100\n'.repeat(4)},\n${'00010\n'.repeat(4)}`).replace('-0.150', '0'))).cartas[0];
  ok(w.bpms.every(b => b > 0), 'SM: BPM negativo no llega al .NOT: ' + JSON.stringify(w.bpms));
  ok(w.avisos.some(a => /salto/.test(a)), 'SM: BPM negativo avisa notas perdidas: ' + w.avisos.join(' | '));
  const horas = w.notas.map(n => horaDeFila(w, n[0]));
  ok(horas.every((h, i) => !i || h >= horas[i - 1] - 0.001), 'SM: tras el warp las notas siguen en orden');
  const s = importarPasos('k.sm', bytes(sm('#BPMS:0=120;\n#STOPS:4=-1.000;', `${'10000\n'.repeat(4)},\n${'01000\n'.repeat(4)},\n${'00100\n'.repeat(4)}`).replace('-0.150', '0'))).cartas[0];
  ok(s.avisos.some(a => /salto/.test(a)), 'SM: stop negativo = salto');
}
// mas de 10 cambios de BPM: el resto se ubica por tiempo
{
  const bpms = Array.from({ length: 15 }, (_, i) => `${i * 4}=${120 + i * 7}`).join(',');
  const notas = Array.from({ length: 16 }, () => '10000\n00000\n00000\n00000\n').join(',\n');
  const { cartas: [c] } = importarPasos('l.sm', bytes(sm(`#BPMS:${bpms};`, notas).replace('-0.150', '0')));
  ok(c.bpms.length === 10, 'SM: como mucho 10 tramos: ' + c.bpms.length);
  ok(c.avisos.some(a => /mas de 10 cambios/.test(a)), 'SM: avisa el aplanado: ' + c.avisos.join(' | '));
  // hora real de cada compas
  let t = 0; const real = [];
  for (let m = 0; m < 16; m++) { real.push(t); t += 4 * 60 / (120 + Math.min(m, 14) * 7); }
  const err = Math.max(...c.notas.map((n, i) => Math.abs(horaDeFila(c, n[0]) - real[i])));
  ok(err < 0.13, 'SM: y cada nota queda cerca de su hora real, error max ' + Math.round(err * 1000) + ' ms');
}
// una tabla que no entra: se corta, avisa y no pasa del tope
{
  const notas = Array.from({ length: 700 }, () => '10000\n00000\n00000\n00000\n').join(',\n');
  const { cartas: [c] } = importarPasos('m.sm', bytes(sm('#BPMS:0=120;', notas).replace('-0.150', '0')));
  ok(c.ultimaFila < TOPE_FILAS && c.avisos.some(a => /cortadas/.test(a)), 'SM: una tabla larguisima se corta y avisa: ' + c.avisos.join(' | '));
}
// --- SSC: tiempo propio por dificultad, varias cartas
{
  const ssc = `#VERSION:0.83;\n#TITLE:Ejemplo;\n#MUSIC:song.mp3;\n#OFFSET:-0.100;\n#BPMS:0=120;\n#NOTEDATA:;\n#STEPSTYPE:pump-single;\n#DESCRIPTION:una;\n#DIFFICULTY:Medium;\n#METER:5;\n#NOTES:\n10000\n01000\n00200\n00300\n;\n#NOTEDATA:;\n#STEPSTYPE:pump-single;\n#DIFFICULTY:Hard;\n#METER:11;\n#BPMS:0=200;\n#SPEEDS:0=1=0=0;\n#WARPS:4=2;\n#NOTES:\n10000\n00000\n00000\n00000\n,\n01000\n00000\n00100\n00000\n,\n00010\n00000\n00000\n00000\n;\n#NOTEDATA:;\n#STEPSTYPE:dance-single;\n#DIFFICULTY:Hard;\n#METER:3;\n#NOTES:\n1000\n;\n`;
  const r = importarPasos('n.ssc', bytes(ssc));
  ok(r.cartas.length === 2 && r.rechazadas.includes('dance-single'), 'SSC: dos cartas de Pump y una rechazada');
  const [a, b] = r.cartas;
  ok(a.modo === 'HARD' && a.bpms[0] === 120 && a.valores[0] === 10, 'SSC: la primera usa el tiempo general');
  ok(b.modo === 'CRAZY' && b.bpms[0] === 200 && b.avisos.some(x => /velocidades/.test(x)), 'SSC: la segunda usa su propio BPM y avisa los efectos');
  ok(b.avisos.some(x => /salto/.test(x)), 'SSC: las notas del warp se pierden: ' + b.avisos.join(' | '));
  ok(cerca(horaDeFila(b, b.notas[1][0]), 0.1 + 6 * 60 / 200 - 2 * 60 / 200, 0.015), 'SSC: despues del warp, 2 pulsos antes: ' + horaDeFila(b, b.notas[1][0]));
}
// --- codificacion coreana y basura
{
  const ks = new Uint8Array([...bytes('#TITLE:'), 0xBE, 0xC8, 0xB3, 0xE7, ...bytes(`;\r\n#BPM:120;\r\n#STEP:\r\n${fila([0, '1'])}\r\n${FIN}\r\n`)]);
  const c = importarPasos('z.ksf', ks).cartas[0];
  ok(c.titulo === '안녕', 'KSF: titulo en EUC-KR: ' + c.titulo);
  for (const [n, t] of [['r.ksf', '#BPM:0;\n#STEP:\n1\n'], ['s.ksf', 'cualquier cosa'], ['t.sm', '#TITLE:x;'], ['u.ssc', 'nada'], ['v.sm', sm('#BPMS:;', '10000\n')]]) {
    let err = null; try { importarPasos(n, bytes(t)); } catch (e) { err = e.message; }
    ok(err, `basura en ${n} no rompe: ${err}`);
  }
  let err = null; try { importarPasos('x.exe', bytes('MZ')); } catch (e) { err = e.message; } ok(err, 'otra extension: ' + err);
}
// --- ida y vuelta de la hora
{
  const e = { bpms: [100, 115], valores: [15, 0], cambios: [8220], porPulso: 2 };
  ok(cerca(horaDeFila(e, 272), 0.15 + 272 / 2 * 60 / 100), 'mezcla 29: fila 272 en el tramo 0');
  ok(cerca(horaDeFila(e, 350), 350 / 2 * 60 / 115), 'mezcla 29: fila 350 en el tramo 1 (91,3 s)');
  ok(cerca(filaDeHora(e, 81.75), 272, 0.5) && cerca(filaDeHora(e, 91.3), 350, 0.5), 'mezcla 29: de hora a fila');
}
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO BIEN');
