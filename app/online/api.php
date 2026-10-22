<?php
// Salon online de Pump It Up Extra: jugadores conectados, chat, desafios, partidas en vivo y ranking.
// Todo por pedidos cortos (el cliente consulta cada ~0,5 s), asi anda en un hosting compartido sin procesos
// prendidos. Los datos van en datos/ (sala.json y ranking.json), con candado de archivo.
// Cliente: app/port/online.js. Pedido: POST con JSON {accion, ...}; respuesta JSON.
declare(strict_types=1);
ini_set('display_errors', '0');          // un aviso de PHP nunca va en la respuesta (romperia el JSON): va al registro
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Cross-Origin-Resource-Policy: same-origin');
// la build de Edge (servidor propio en 127.0.0.1) usa este mismo salon y ranking (Charles, 20/10): se le permite
// por CORS solo a ese origen local; los navegadores de la web van por el mismo sitio y no lo necesitan
$origen = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if (preg_match('#^http://(127\.0\.0\.1|localhost)(:\d{1,5})?$#', $origen)) {
    header("Access-Control-Allow-Origin: $origen"); header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST'); header('Access-Control-Allow-Headers: Content-Type');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;

const VENCE_JUGADOR = 30;      // s sin consultar = se fue (margen para celulares lentos o en segundo plano)
const VENCE_DESAFIO = 30;      // s para aceptar un desafio
const ESPERA_ARRANQUE = 45;    // s de respaldo entre aceptar y arrancar, por si alguno nunca avisa que cargo (accion 'listo')
const VENCE_PARTIDA = 600;     // s maximos de una partida
const CANCIONES = [8, 12, 13, 15, 19, 23, 58, 60, 67, 9, 10, 11, 22, 40, 42, 44, 48, 64, 63, 65, 66, 47, 4, 6, 14, 16, 24, 26, 33, 45, 55, 61];
const MODOS = ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE', 'REMIX'];

$dir = getenv('PIU_ONLINE_DATOS') ?: (__DIR__ . '/datos');   // las pruebas usan su propia carpeta
if (!is_dir($dir)) mkdir($dir, 0755, true);
ini_set('log_errors', '1'); ini_set('error_log', "$dir/errores.log");
if (!file_exists("$dir/.htaccess")) file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");

function responder(array $r, int $codigo = 200): void { http_response_code($codigo); echo json_encode($r, JSON_UNESCAPED_UNICODE); exit; }
function error(string $m, int $c = 400): void { responder(['error' => $m], $c); }
function leer(string $f, array $vacio): array { $t = @file_get_contents($f); $d = $t ? json_decode($t, true) : null; return is_array($d) ? $d : $vacio; }
// grabar entero o nada: escribe al lado y renombra; en Windows el antivirus puede tener el archivo abierto un
// instante y el renombre falla, asi que se reintenta y, si no, se escribe directo
function grabar(string $f, array $d): void {
    $j = json_encode($d, JSON_UNESCAPED_UNICODE);
    file_put_contents("$f.tmp", $j);
    for ($i = 0; $i < 10; $i++) { if (@rename("$f.tmp", $f)) return; usleep(15000); }
    file_put_contents($f, $j);
}
// texto limpio y cortado a $max letras (sin mbstring, que no siempre esta instalado)
function texto($v, int $max): string {
    $s = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$v) ?? '');
    return preg_match('/^.{0,' . $max . '}/us', $s, $m) ? $m[0] : '';
}
function largo(string $s): int { return (int)preg_match_all('/./us', $s); }
function minusculas(string $s): string { return function_exists('mb_strtolower') ? mb_strtolower($s) : strtolower($s); }
require __DIR__ . '/filtro.php';         // malas palabras: tapadas en el chat, prohibidas en los nombres

// ---------- seguridad (Charles 21/10: "que el online mejore y refuerces todo, mejor seguridad tambien") ----------
// Tope de tamano de cada pedido (el mas grande es un trozo de paquete: 512 KB en base64) y limites por conexion: cada
// cosa tiene su cupo en una ventana de tiempo (datos/limites.json, por la huella de la IP; se limpia solo).
$crudo = file_get_contents('php://input', false, null, 0, 1048577 * 1) ?: '{}';
if (strlen($crudo) > 1048576) error('pedido demasiado grande', 413);
$p = json_decode($crudo, true, 8);
if (!is_array($p)) error('pedido invalido');
$accion = (string)($p['accion'] ?? '');
$huellaIp = substr(hash('sha256', 'piu:' . ($_SERVER['REMOTE_ADDR'] ?? '')), 0, 16);
function limitar(string $dir, string $que, int $max, int $seg): void {
    global $huellaIp;
    $f = "$dir/limites.json"; $c = fopen("$dir/candado_limites", 'c'); flock($c, LOCK_EX);
    $l = leer($f, []); $ahora = time(); $k = "$que|$huellaIp";
    if (random_int(0, 49) === 0) foreach ($l as $kk => $v) if ($ahora - $v[0] > 3600) unset($l[$kk]);   // limpiar lo viejo
    $v = $l[$k] ?? [$ahora, 0];
    if ($ahora - $v[0] >= $seg) $v = [$ahora, 0];
    $v[1]++; $l[$k] = $v;
    grabar($f, $l); flock($c, LOCK_UN);
    if ($v[1] > $max) error('demasiados pedidos: espera un momento', 429);
}
limitar($dir, 'todo', 2500, 600);              // en 10 minutos: el salon pregunta cada 0,7 s y el marcador cada 0,45 s
$CUPOS = ['entrar' => [20, 300], 'chat' => [40, 60], 'desafiar' => [20, 60], 'solo_etapa' => [60, 600], 'solo_sesion' => [30, 600],
    'nombre' => [40, 600], 'proteger' => [10, 600], 'comunidad_publicar' => [30, 3600], 'comunidad_borrar' => [60, 3600],
    'paquete_trozo' => [200, 600], 'reporte' => [30, 600], 'guardar_pasos' => [60, 600], 'avatar' => [30, 600]];
if (isset($CUPOS[$accion])) limitar($dir, $accion, $CUPOS[$accion][0], $CUPOS[$accion][1]);

// ---------- CLAVE DEL NOMBRE (opcional): con ella nadie mas juega, sale en el ranking ni entra al online con ese nombre ----------
// datos/nombres.json: nombre en minuscula -> password_hash de la clave (4 a 8 numeros). Las claves mal puestas tienen
// cupo (8 cada 10 minutos por conexion), asi no se pueden adivinar probando.
function nombreLibre(string $dir, string $nick, $pin): bool {
    $n = leer("$dir/nombres.json", []); $k = minusculas($nick);
    if (!isset($n[$k])) return true;
    if (is_string($pin) && preg_match('/^\d{4,8}$/', $pin) && password_verify($pin, $n[$k])) return true;
    limitar($dir, 'clave_mal', 8, 600);
    return false;
}
const ERROR_CLAVE = 'ese nombre tiene clave: ponela en OPCIONES > CLAVE DEL NOMBRE';

// ranking: no hace falta estar en la sala (va tambien el del modo solo)
if ($accion === 'ranking') {
    $r = leer("$dir/ranking.json", ['mejores' => new stdClass(), 'jugadores' => new stdClass()]);
    $r['solo'] = semanaYDia(leer("$dir/solo.json", ['canciones' => new stdClass(), 'sesiones' => []]));
    responder($r);
}

// ---------- modo solo (Charles, 20/10): los mejores de cada cancion y modo (10, uno por nickname; la seleccion
// muestra los 3 primeros) y de cada sesion de juego, sumando sus etapas (20, uno por nickname). Sin sala ni clave.
const CANCIONES_SOLO = [8, 12, 13, 15, 19, 23, 58, 60, 67, 9, 10, 11, 22, 40, 42, 44, 48, 64, 63, 65, 66, 47, 4, 6, 14, 16, 24, 26, 33, 45, 55, 61, 7, 20, 21, 52, 32, 53];
const MODOS_SOLO = ['NORMAL', 'HARD', 'CRAZY', 'DOUBLE', 'REMIX', 'BATTLE'];
function mejorPorNick(array $lista, array $nuevo, int $tope): array {
    foreach ($lista as $k => $e) {
        if (minusculas((string)$e['nick']) !== minusculas($nuevo['nick'])) continue;
        if ((int)$e['puntaje'] >= $nuevo['puntaje']) return $lista;     // ya tenia uno mejor
        unset($lista[$k]);
    }
    $lista[] = $nuevo;
    usort($lista, fn($a, $b) => $b['puntaje'] <=> $a['puntaje']);
    return array_slice(array_values($lista), 0, $tope);
}
// ---------- "tu version" de los pasos (editor de la web, Charles 20/10: "en la web se guardan en el hosting, pero no da
// acceso a nada del archivo"). Van a datos/ediciones/<dueño>/NN_xx.not (datos/ no se puede abrir desde afuera); solo se
// leen y escriben por aca, con la clave al azar de cada navegador. El .NOT se lee y se vuelve a armar desde cero (formato
// A de la cabina), asi no puede viajar nada escondido. Los .NOT del disco no se tocan nunca.
function pasosLimpios(string $b): ?string {
    $n = strlen($b);
    if ($n < 222 || $n > 262144 || substr($b, 0, 8) !== 'pump 5.0') return null;
    $filas = unpack('v', substr($b, 0x0A, 2))[1];
    if ($filas < 1 || $filas > 40000 || $n !== 216 + 6 * $filas) return null;
    $bpm = array_values(unpack('g10', substr($b, 0x10, 40)));
    foreach ($bpm as $v) if (!is_finite($v) || $v <= 0 || $v > 1000) return null;
    $val = array_values(unpack('l10', substr($b, 0x38, 40))); $cam = array_values(unpack('l10', substr($b, 0x60, 40)));
    $pp = unpack('l', substr($b, 0x88, 4))[1]; $num = unpack('l', substr($b, 0x90, 4))[1];
    if ($pp < 1 || $pp > 48 || $num < 0 || $num > 99) return null;
    foreach (array_merge($val, $cam) as $v) if (abs($v) > 10000000) return null;
    $o = str_pad('pump 5.0', 10, "\0") . pack('v', $filas) . str_repeat("\0", 4);
    foreach ($bpm as $v) $o .= pack('g', $v);
    foreach ($val as $v) $o .= pack('l', $v);
    foreach ($cam as $v) $o .= pack('l', $v);
    $o .= pack('l', $pp) . str_repeat("\0", 4) . pack('l', $num);
    $o = str_pad($o, 216, "\0");
    $t = array_values(unpack('v' . (3 * $filas), substr($b, 216)));
    foreach ($t as $v) { $m = $v & 0x3FF; if ($m & 0x200) $m |= 0xFC00; $o .= pack('v', $m); }   // solo los 10 bits de paneles
    return $o;
}
// ---------- paquete de una cancion propia para el online (EDITOR_MASTER.md etapas 3 y 4): el que desafia lo sube de a
// trozos, aca se revisa entero y se rearma (como en el cliente, app/port/paquete.js) y el que recibe lo baja de a trozos.
// .NOT con pasosLimpios; .AUD descifrado con la llave del exe, Adler-32 verificado, solo la cadena de cuadros MP3 y
// vuelto a cifrar; .PNZ descifrado, PNG de 640 x 480 con sus CRC, solo los bloques de imagen; .DAT nunca (el fondo es
// un video REMIX del disco, por numero). Se borra cuando ya nadie lo usa (20 min).
const TROZO = 524288;
const TOPE_PAQUETE = ['not' => 262144, 'aud' => 8650752, 'pnz' => 2097152];
const VIDEOS_REMIX = [27, 28, 29, 30, 31, 32, 36, 52, 53, 57];
function dirPaquete(string $dir, string $pq): string { return "$dir/paquetes/$pq"; }
function borrarPaquete(string $dp): void { foreach (glob("$dp/*") ?: [] as $f) @unlink($f); @rmdir($dp); }
function llaveExe(): ?string {       // datos de Piu.exe en 0x13BF90 (los volcados que usa el juego, al lado del salon)
    foreach ([__DIR__ . '/../volcados/datos_0x130000.bin', __DIR__ . '/../../investigacion/volcados/datos_0x130000.bin'] as $f) {
        $d = is_file($f) ? file_get_contents($f, false, null, 0xBF90, 1024) : false;
        if (is_string($d) && strlen($d) === 1024) return $d;
    }
    return null;
}
function espejo(): array {           // los 256 bytes y sus bits al reves, para strtr
    static $t = null;
    if ($t === null) { $t = ['', '']; for ($i = 0; $i < 256; $i++) { $r = 0; for ($b = 0; $b < 8; $b++) if ($i & (1 << $b)) $r |= 0x80 >> $b; $t[0] .= chr($i); $t[1] .= chr($r); } }
    return $t;
}
function adler(string $s): int { return (int)hexdec(hash('adler32', $s)); }
function flujo(string $K, int $h, int $n): string { $r = $h & 1023; $k = substr($K, $r) . substr($K, 0, $r); return substr(str_repeat($k, intdiv($n, 1024) + 1), 0, $n); }
function abrirCabina(string $c, string $K): ?string {
    if (strlen($c) < 8) return null;
    $h = unpack('V', substr($c, 0, 4))[1]; [$de, $a] = espejo();
    $claro = strtr(substr($c, 4), $de, $a) ^ flujo($K, $h, strlen($c) - 4);
    return adler($claro) === $h ? $claro : null;
}
function cerrarCabina(string $claro, string $K): string { $h = adler($claro); [$de, $a] = espejo(); return pack('V', $h) . strtr($claro ^ flujo($K, $h, strlen($claro)), $de, $a); }
function soloCuadros(string $b, float $tope = 185.0): ?string {
    $KB1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]; $KB2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    $SR = [3 => [44100, 48000, 32000], 2 => [22050, 24000, 16000], 0 => [11025, 12000, 8000]];
    // (el ultimo cuadro no se guarda nunca: si el archivo venia cortado, lo pegado atras lo "completaba")
    $n = strlen($b); $i = 0; $antes = 0; $seg = 0.0; $cuadros = 0; $ver0 = -1; $sr0 = -1;
    while ($i + 4 <= $n && $seg < $tope) {
        $b1 = ord($b[$i + 1]); $b2 = ord($b[$i + 2]);
        if (ord($b[$i]) !== 0xFF || ($b1 & 0xE0) !== 0xE0) break;
        $ver = ($b1 >> 3) & 3; $capa = ($b1 >> 1) & 3; $br = $b2 >> 4; $sr = ($b2 >> 2) & 3; $pad = ($b2 >> 1) & 1;
        if ($capa !== 1 || $br === 0 || $br === 15 || $sr === 3 || $ver === 1) break;
        if ($ver0 < 0) { $ver0 = $ver; $sr0 = $sr; } elseif ($ver !== $ver0 || $sr !== $sr0) break;
        $f = $SR[$ver][$sr];
        $L = $ver === 3 ? intdiv(144000 * $KB1[$br], $f) + $pad : intdiv(72000 * $KB2[$br], $f) + $pad;
        if ($i + $L > $n) break;
        $antes = $i; $i += $L; $seg += ($ver === 3 ? 1152 : 576) / $f; $cuadros++;
    }
    return $cuadros >= 200 ? substr($b, 0, $antes) : null;
}
function pngLimpio(string $p): ?string {     // PNG de 640 x 480 con sus CRC; quedan solo los bloques de la imagen
    if (substr($p, 0, 8) !== "\x89PNG\r\n\x1a\n") return null;
    $o = substr($p, 0, 8); $i = 8; $n = strlen($p); $primero = true;
    while ($i + 12 <= $n) {
        $L = unpack('N', substr($p, $i, 4))[1]; $t = substr($p, $i + 4, 4);
        if ($L > $n - $i - 12) return null;
        $d = substr($p, $i + 8, $L);
        if ((crc32($t . $d) & 0xFFFFFFFF) !== unpack('N', substr($p, $i + 8 + $L, 4))[1]) return null;
        if ($primero && ($t !== 'IHDR' || $L !== 13 || unpack('N2', $d) !== [1 => 640, 2 => 480])) return null;
        $primero = false;
        if (in_array($t, ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'], true)) $o .= substr($p, $i, 12 + $L);
        $i += 12 + $L;
        if ($t === 'IEND') return $o;
    }
    return null;
}
// lo que subio el que desafia: se revisa una vez y queda limpio (not, aud, pnz y meta.json); null si algo no cierra
function cerrarPaquete(string $dir, string $pq, string $id, $meta, int $c): ?array {
    if (!preg_match('/^[a-f0-9]{16}$/', $pq)) return null;
    $dp = dirPaquete($dir, $pq);
    if (trim((string)@file_get_contents("$dp/dueno")) !== $id) return null;
    if (is_file("$dp/meta.json")) { $m = leer("$dp/meta.json", []); return $m ?: null; }
    $K = llaveExe(); if ($K === null) return null;
    $meta = is_array($meta) ? $meta : [];
    $archivo = strtolower(texto($meta['archivo'] ?? '', 12)); $video = (int)($meta['video'] ?? 0);
    $not = pasosLimpios((string)@file_get_contents("$dp/not.sub"));
    $aud = abrirCabina((string)@file_get_contents("$dp/aud.sub"), $K); $aud = $aud === null ? null : soloCuadros($aud);
    $png = abrirCabina((string)@file_get_contents("$dp/pnz.sub"), $K); $png = $png === null ? null : pngLimpio($png);
    if ($not === null || $aud === null || $png === null || !in_array($video, VIDEOS_REMIX, true)
        || !preg_match('/^(\d\d)_([nhx][12]|db)\.not$/', $archivo, $mm) || (int)$mm[1] !== $c) { borrarPaquete($dp); return null; }
    file_put_contents("$dp/not", $not); file_put_contents("$dp/aud", cerrarCabina($aud, $K)); file_put_contents("$dp/pnz", cerrarCabina($png, $K));
    foreach (['not', 'aud', 'pnz'] as $t) @unlink("$dp/$t.sub");
    $limpio = fn($v, $n) => filtrarTexto(strtoupper(preg_replace("/[^A-Za-z0-9 .,'!?&()+-]/", '', texto($v, $n)) ?? ''));
    $m = ['pq' => $pq, 'archivo' => $archivo, 'video' => $video, 'nombre' => $limpio($meta['nombre'] ?? '', 24) ?: "CANCION $c", 'artista' => $limpio($meta['artista'] ?? '', 30)];
    grabar("$dp/meta.json", $m);
    return $m;
}

if ($accion === 'guardar_pasos' || $accion === 'leer_pasos') {
    $clave = (string)($p['clave'] ?? ''); $archivo = strtolower((string)($p['archivo'] ?? ''));
    if (!preg_match('/^[a-f0-9]{32}$/', $clave)) error('clave invalida');
    if (!preg_match('/^\d\d_([nhx][12]|db)\.not$/', $archivo)) error('nombre invalido');
    $carpeta = "$dir/ediciones/" . substr(hash('sha256', $clave), 0, 24);
    $f = "$carpeta/$archivo";
    if ($accion === 'leer_pasos') { if (!is_file($f)) responder(['hay' => false]); responder(['hay' => true, 'datos' => base64_encode((string)file_get_contents($f))]); }
    $b = base64_decode((string)($p['datos'] ?? ''), true);
    $limpio = $b === false ? null : pasosLimpios($b);
    if ($limpio === null) error('no es un .NOT valido');
    if (!is_dir($carpeta)) mkdir($carpeta, 0755, true);
    if (!is_file($f) && count(glob("$carpeta/*.not")) >= 200) error('ya tenes 200 pasos guardados');
    file_put_contents($f, $limpio, LOCK_EX);
    responder(['ok' => true]);
}

// ---------- edits de la comunidad (Charles 20/10: "cada uno cree un edit de la cancion, se puedan ver e incluso jugar, pero
// solo eso, que el creador pueda borrar o modificar su version"). Solo .NOT de canciones del disco, rearmados desde cero
// (pasosLimpios). El dueño es la clave al azar de su aparato: se guarda una huella (sha256), nunca la clave. Uno por
// dueño y por tabla (publicar otra vez la misma tabla la actualiza). Van a datos/comunidad/ (sin acceso desde afuera).
const TOPE_COMUNIDAD = 3000, TOPE_POR_DUENO = 100;
if (strncmp($accion, 'comunidad_', 10) === 0) {
    $cd = "$dir/comunidad";
    if (!is_dir($cd)) mkdir($cd, 0755, true);
    $clave = (string)($p['clave'] ?? '');
    $dueno = preg_match('/^[a-f0-9]{32}$/', $clave) ? substr(hash('sha256', "comunidad:$clave"), 0, 24) : '';
    $eid = (string)($p['id'] ?? '');
    $cc = fopen("$cd/candado", 'c');
    flock($cc, LOCK_EX);
    $ix = leer("$cd/indice.json", ['edits' => []]);
    $e = preg_match('/^[a-f0-9]{12}$/', $eid) ? ($ix['edits'][$eid] ?? null) : null;
    $esMio = fn($v) => $dueno !== '' && hash_equals((string)$v['dueno'], $dueno);
    $fallar = function (string $m) use ($cc) { flock($cc, LOCK_UN); error($m); };
    if ($accion === 'comunidad_lista') {
        $c = (int)($p['cancion'] ?? 0); $l = [];
        foreach ($ix['edits'] as $k => $v) if (!$c || $v['cancion'] === $c)
            $l[] = ['id' => $k, 'archivo' => $v['archivo'], 'cancion' => $v['cancion'], 'nick' => $v['nick'], 'fecha' => $v['fecha'], 't' => $v['t'], 'flechas' => $v['flechas'], 'mio' => $esMio($v)];
        flock($cc, LOCK_UN);
        usort($l, fn($a, $b) => $b['t'] <=> $a['t']);
        responder(['edits' => array_slice($l, 0, 300)]);
    }
    if ($accion === 'comunidad_leer') {
        if (!$e || !is_file("$cd/$eid.not")) $fallar('ese edit ya no esta');
        $b = (string)file_get_contents("$cd/$eid.not");
        flock($cc, LOCK_UN);
        responder(['id' => $eid, 'archivo' => $e['archivo'], 'cancion' => $e['cancion'], 'nick' => $e['nick'], 'mio' => $esMio($e), 'datos' => base64_encode($b)]);
    }
    if ($dueno === '') $fallar('clave invalida');
    if ($accion === 'comunidad_borrar') {
        if (!$e) $fallar('ese edit ya no esta');
        if (!$esMio($e)) $fallar('solo quien lo hizo lo puede borrar');
        @unlink("$cd/$eid.not");
        unset($ix['edits'][$eid]);
        grabar("$cd/indice.json", $ix);
        flock($cc, LOCK_UN);
        responder(['ok' => true]);
    }
    if ($accion !== 'comunidad_publicar') $fallar('accion desconocida');
    $nick = texto($p['nick'] ?? '', 16);
    if (largo($nick) < 2) $fallar('el nombre tiene que tener entre 2 y 16 letras');
    if (nickProhibido($nick)) $fallar('ese nombre no se puede usar');
    if (!nombreLibre($dir, $nick, $p['pin'] ?? null)) $fallar(ERROR_CLAVE);
    $archivo = strtolower((string)($p['archivo'] ?? ''));
    if (!preg_match('/^(\d\d)_([nhx][12]|db)\.not$/', $archivo, $mm) || !in_array((int)$mm[1], CANCIONES_SOLO, true)) $fallar('solo se publican pasos de canciones del disco');
    $b = base64_decode((string)($p['datos'] ?? ''), true);
    $limpio = $b === false ? null : pasosLimpios($b);
    if ($limpio === null) $fallar('no es un .NOT valido');
    if ($e) { if (!$esMio($e)) $fallar('solo quien lo hizo lo puede modificar'); }
    else {
        $mios = 0;
        foreach ($ix['edits'] as $k => $v) if ($esMio($v)) { $mios++; if ($v['archivo'] === $archivo) { $eid = $k; $e = $v; } }
        if (!$e) {
            if ($mios >= TOPE_POR_DUENO) $fallar('ya publicaste ' . TOPE_POR_DUENO . ' edits: borra alguno');
            if (count($ix['edits']) >= TOPE_COMUNIDAD) $fallar('la comunidad esta llena por ahora');
            $eid = bin2hex(random_bytes(6));
        }
    }
    file_put_contents("$cd/$eid.not", $limpio, LOCK_EX);
    $ix['edits'][$eid] = ['archivo' => $archivo, 'cancion' => (int)$mm[1], 'nick' => $nick, 'dueno' => $dueno, 'fecha' => date('Y-m-d'), 't' => time(),
        'flechas' => max(0, min(99999, (int)($p['flechas'] ?? 0)))];
    grabar("$cd/indice.json", $ix);
    flock($cc, LOCK_UN);
    responder(['ok' => true, 'id' => $eid]);
}

// el nombre del modo solo, antes de jugar (asi el aviso sale en la pantalla del nombre y no al final)
if ($accion === 'nombre') {
    $nick = texto($p['nick'] ?? '', 16);
    if (largo($nick) < 2) error('Minimo 2 letras');
    if (nickProhibido($nick)) error('Ese nombre no se puede usar');
    if (!nombreLibre($dir, $nick, $p['pin'] ?? null)) error(ERROR_CLAVE, 403);
    $protegido = isset(leer("$dir/nombres.json", [])[minusculas($nick)]);
    responder(['ok' => true, 'nick' => $nick, 'protegido' => $protegido]);
}
// poner, cambiar o sacar la clave de un nombre (si ya tenia, hace falta la de antes)
if ($accion === 'proteger') {
    $nick = texto($p['nick'] ?? '', 16); $nuevo = (string)($p['pinNuevo'] ?? '');
    if (largo($nick) < 2 || nickProhibido($nick)) error('nombre invalido');
    if ($nuevo !== '' && !preg_match('/^\d{4,8}$/', $nuevo)) error('la clave son de 4 a 8 numeros');
    $c = fopen("$dir/candado_nombres", 'c'); flock($c, LOCK_EX);
    if (!nombreLibre($dir, $nick, $p['pin'] ?? null)) { flock($c, LOCK_UN); error('la clave de antes no es esa', 403); }
    $n = leer("$dir/nombres.json", []);
    if ($nuevo === '') unset($n[minusculas($nick)]); else $n[minusculas($nick)] = password_hash($nuevo, PASSWORD_DEFAULT);
    if (count($n) > 20000) { flock($c, LOCK_UN); error('no entran mas nombres con clave'); }
    grabar("$dir/nombres.json", $n); flock($c, LOCK_UN);
    responder(['ok' => true, 'protegido' => $nuevo !== '']);
}
if ($accion === 'solo_etapa' || $accion === 'solo_sesion') {
    $nick = texto($p['nick'] ?? '', 16);
    $puntaje = (int)($p['puntaje'] ?? 0);
    if (largo($nick) < 2) error('nickname invalido');
    if (nickProhibido($nick)) error('ese nombre no se puede usar');
    // (21/10) el "2P" del segundo jugador es del mismo dueño: se mira la clave del nombre sin el " 2P"
    if (!nombreLibre($dir, preg_replace('/ 2P$/', '', $nick), $p['pin'] ?? null)) error(ERROR_CLAVE, 403);
    // topes de cordura: una cancion no pasa de unos millones; una sesion, de 9 canciones
    if ($puntaje < 0 || $puntaje > ($accion === 'solo_etapa' ? 5000000 : 45000000)) error('puntaje invalido');
    $nuevo = ['nick' => $nick, 'puntaje' => $puntaje, 'fecha' => date('Y-m-d')];
    if ($accion === 'solo_etapa') {
        $c = (int)($p['cancion'] ?? 0); $m = (string)($p['modo'] ?? '');
        if (!in_array($c, CANCIONES_SOLO, true) || !in_array($m, MODOS_SOLO, true)) error('cancion o modo invalido');
        $nuevo['nota'] = texto($p['nota'] ?? '', 2);
    } else $nuevo['etapas'] = max(0, min(9, (int)($p['etapas'] ?? 0)));
    $cs = fopen("$dir/candado_solo", 'c');
    flock($cs, LOCK_EX);
    $r = semanaYDia(leer("$dir/solo.json", ['canciones' => [], 'sesiones' => []]));
    if ($accion === 'solo_etapa') {
        $r['canciones']["$c $m"] = mejorPorNick($r['canciones']["$c $m"] ?? [], $nuevo, 10);
        if ($c === $r['dia']['cancion']) $r['dia']['lista'] = mejorPorNick($r['dia']['lista'], $nuevo + ['modo' => $m], 10);
    } else {
        $r['sesiones'] = mejorPorNick($r['sesiones'] ?? [], $nuevo, 20);
        $r['semana']['sesiones'] = mejorPorNick($r['semana']['sesiones'], $nuevo, 20);
    }
    grabar("$dir/solo.json", $r);
    flock($cs, LOCK_UN);
    if ($accion === 'solo_etapa') anotarPerfil($dir, $nick, ['cancion' => $c, 'modo' => $m, 'puntaje' => $puntaje, 'nota' => $nuevo['nota'], 'combo' => (int)($p['combo'] ?? 0)]);
    if (empty($r['canciones'])) $r['canciones'] = new stdClass();
    responder($r);
}
// ---------- mejora 14 (Charles 20/10): perfil del jugador, por nombre ----------
// Canciones jugadas (solo y online), mejor puntaje, notas S..F, combo maximo, partidas online ganadas/perdidas y las
// ultimas 10 canciones. Va a datos/perfiles.json (como mucho 5000 nombres: se van los que hace mas que no juegan).
function anotarPerfil(string $dir, string $nick, array $e): void {
    $c = fopen("$dir/candado_perfiles", 'c'); flock($c, LOCK_EX);
    $todos = leer("$dir/perfiles.json", []);
    $k = minusculas($nick);
    $pf = $todos[$k] ?? ['nick' => $nick, 'canciones' => 0, 'mejor' => 0, 'combo' => 0, 'notas' => [], 'online' => ['G' => 0, 'P' => 0, 'E' => 0], 'historial' => [], 'desde' => date('Y-m-d')];
    $pf['nick'] = $nick; $pf['canciones']++; $pf['visto'] = time();
    $pf['mejor'] = max($pf['mejor'], max(0, min(99999999, (int)$e['puntaje'])));
    $pf['combo'] = max($pf['combo'], max(0, min(9999, (int)($e['combo'] ?? 0))));
    $nota = texto($e['nota'] ?? '', 2); if (preg_match('/^[SABCDF]$/', $nota)) $pf['notas'][$nota] = ($pf['notas'][$nota] ?? 0) + 1;
    if (isset($e['resultado'])) $pf['online'][$e['resultado']]++;
    array_unshift($pf['historial'], ['cancion' => (int)$e['cancion'], 'modo' => texto($e['modo'] ?? '', 8), 'puntaje' => (int)$e['puntaje'], 'nota' => $nota,
        'fecha' => date('Y-m-d'), 'online' => isset($e['resultado']) ? $e['resultado'] : null]);
    $pf['historial'] = array_slice($pf['historial'], 0, 10);
    $todos[$k] = $pf;
    if (count($todos) > 5000) { uasort($todos, fn($a, $b) => ($b['visto'] ?? 0) <=> ($a['visto'] ?? 0)); $todos = array_slice($todos, 0, 5000, true); }
    grabar("$dir/perfiles.json", $todos);
    flock($c, LOCK_UN);
}
// (21/10) el AVATAR: [skin 0-8, pieza 0-15], una flecha del juego; va al perfil (con la clave del nombre, si tiene)
function avatarLimpio($a): ?array { return is_array($a) && count($a) === 2 ? [max(0, min(8, (int)$a[0])), max(0, min(15, (int)$a[1]))] : null; }
if ($accion === 'avatar') {
    $nick = texto($p['nick'] ?? '', 16); $a = avatarLimpio($p['avatar'] ?? null);
    if (largo($nick) < 2 || nickProhibido($nick) || !$a) error('avatar invalido');
    if (!nombreLibre($dir, $nick, $p['pin'] ?? null)) error(ERROR_CLAVE, 403);
    $c = fopen("$dir/candado_perfiles", 'c'); flock($c, LOCK_EX);
    $todos = leer("$dir/perfiles.json", []); $k = minusculas($nick);
    $pf = $todos[$k] ?? ['nick' => $nick, 'canciones' => 0, 'mejor' => 0, 'combo' => 0, 'notas' => [], 'online' => ['G' => 0, 'P' => 0, 'E' => 0], 'historial' => [], 'desde' => date('Y-m-d')];
    $pf['avatar'] = $a; $pf['visto'] = time(); $todos[$k] = $pf;
    grabar("$dir/perfiles.json", $todos); flock($c, LOCK_UN);
    responder(['ok' => true]);
}
if ($accion === 'perfil') {
    $todos = leer("$dir/perfiles.json", []);
    $pf = $todos[minusculas(texto($p['nick'] ?? '', 16))] ?? null;
    if ($pf) unset($pf['visto']);
    responder(['perfil' => $pf]);
}
// ---------- mejora 15 (Charles 20/10): ranking de la semana y cancion del dia ----------
// La semana (ISO, de lunes a domingo) tiene sus 20 mejores sesiones y se vacia sola cuando empieza otra. La cancion del
// dia sale de la fecha (la misma para todos) entre las del online, con sus 10 mejores de hoy en cualquier modo.
function cancionDelDia(string $fecha): int { return CANCIONES[crc32("piu $fecha") % count(CANCIONES)]; }
function semanaYDia(array $r): array {
    $semana = date('o-\SW'); $hoy = date('Y-m-d');
    if (($r['semana']['id'] ?? '') !== $semana) $r['semana'] = ['id' => $semana, 'sesiones' => []];
    if (($r['dia']['fecha'] ?? '') !== $hoy) $r['dia'] = ['fecha' => $hoy, 'cancion' => cancionDelDia($hoy), 'lista' => []];
    return $r;
}

// telemetria: el juego avisa si se cayo o se trabo (principal.js), con las ultimas lineas de su registro.
// Va a datos/reportes.jsonl (una linea por reporte, se recorta a ~300 KB); solo lo lee Charles (o Claude) desde cPanel.
if ($accion === 'reporte') {
    $r = ['t' => date('c'), 'ip' => substr(hash('sha256', $_SERVER['REMOTE_ADDR'] ?? ''), 0, 8),
        'motivo' => texto($p['motivo'] ?? '', 300), 'pantalla' => texto($p['pantalla'] ?? '', 40), 'agente' => texto($p['agente'] ?? '', 200),
        'tam' => texto($p['tam'] ?? '', 40), 'nick' => texto($p['nick'] ?? '', 16),
        'registro' => array_map(fn($l) => texto($l, 200), array_slice(is_array($p['registro'] ?? null) ? $p['registro'] : [], -60))];
    $f = "$dir/reportes.jsonl";
    if (@filesize($f) > 300000) { $l = file($f); file_put_contents($f, implode('', array_slice($l, (int)(count($l) / 2)))); }
    file_put_contents($f, json_encode($r, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
    responder(['ok' => true]);
}

$candado = fopen("$dir/candado", 'c');
flock($candado, LOCK_EX);
$sala = leer("$dir/sala.json", ['jugadores' => [], 'chat' => [], 'desafios' => [], 'partidas' => [], 'sigChat' => 1]);
$ahora = microtime(true);

// limpiar: jugadores que se fueron, desafios vencidos, partidas viejas
foreach ($sala['jugadores'] as $id => $j) if ($ahora - $j['visto'] > VENCE_JUGADOR) unset($sala['jugadores'][$id]);
foreach ($sala['desafios'] as $id => $d) if ($ahora - $d['t'] > VENCE_DESAFIO || !isset($sala['jugadores'][$d['de']], $sala['jugadores'][$d['a']])) unset($sala['desafios'][$id]);
foreach ($sala['partidas'] as $id => $pa) if ($ahora - $pa['inicio'] > VENCE_PARTIDA) unset($sala['partidas'][$id]);
// paquetes de canciones propias que ya nadie usa (de vez en cuando: un desafio o partida que lo nombre lo mantiene)
if (random_int(0, 19) === 0) {
    $usados = [];
    foreach (array_merge($sala['desafios'], $sala['partidas']) as $o) if (!empty($o['paquete']['pq'])) $usados[$o['paquete']['pq']] = true;
    foreach (glob("$dir/paquetes/*/dueno") ?: [] as $f) { $dp = dirname($f); if (!isset($usados[basename($dp)]) && $ahora - filemtime($f) > 1200) borrarPaquete($dp); }
}

$guardar = function () use (&$sala, $dir, $candado) { grabar("$dir/sala.json", $sala); flock($candado, LOCK_UN); };

if ($accion === 'entrar') {
    $nick = texto($p['nick'] ?? '', 16);
    if (largo($nick) < 2) { flock($candado, LOCK_UN); error('el nickname tiene que tener entre 2 y 16 letras'); }
    if (nickProhibido($nick)) { flock($candado, LOCK_UN); error('ese nickname no se puede usar'); }
    if (!nombreLibre($dir, $nick, $p['pin'] ?? null)) { flock($candado, LOCK_UN); error(ERROR_CLAVE, 403); }
    if (count($sala['jugadores']) >= 300) { flock($candado, LOCK_UN); error('el salon esta lleno: proba en un rato'); }
    foreach ($sala['jugadores'] as $j) if (minusculas($j['nick']) === minusculas($nick)) { flock($candado, LOCK_UN); error('ese nickname ya esta en la sala'); }
    $id = bin2hex(random_bytes(6)); $clave = bin2hex(random_bytes(12));
    $sala['jugadores'][$id] = ['nick' => $nick, 'clave' => $clave, 'visto' => $ahora, 'estado' => 'sala', 'partida' => null, 'avatar' => avatarLimpio($p['avatar'] ?? null)];
    $sala['chat'][] = ['n' => $sala['sigChat']++, 'sistema' => true, 'texto' => "$nick entro a la sala", 't' => $ahora];
    $guardar();
    responder(['id' => $id, 'clave' => $clave, 'nick' => $nick]);
}

// todo lo demas necesita id y clave
$id = (string)($p['id'] ?? '');
if (!isset($sala['jugadores'][$id]) || !hash_equals($sala['jugadores'][$id]['clave'], (string)($p['clave'] ?? ''))) { flock($candado, LOCK_UN); error('no estas en la sala', 401); }
$yo = &$sala['jugadores'][$id];
$yo['visto'] = $ahora;
$mirada = null;

switch ($accion) {
    case 'salir':
        $sala['chat'][] = ['n' => $sala['sigChat']++, 'sistema' => true, 'texto' => $yo['nick'] . ' se fue', 't' => $ahora];
        unset($sala['jugadores'][$id]);
        $guardar(); responder(['ok' => true]);

    case 'chat':
        if ($ahora - ($yo['ultimoChat'] ?? 0) < 0.8) error('mas despacio con el chat');    // un mensaje por segundo, mas o menos
        $yo['ultimoChat'] = $ahora;
        $t = filtrarTexto(texto($p['texto'] ?? '', 200));
        if ($t !== '') $sala['chat'][] = ['n' => $sala['sigChat']++, 'id' => $id, 'nick' => $yo['nick'], 'texto' => $t, 't' => $ahora];
        $sala['chat'] = array_slice($sala['chat'], -100);
        break;

    case 'desafiar':
        $a = (string)($p['a'] ?? ''); $c = (int)($p['cancion'] ?? 0); $m = (string)($p['modo'] ?? '');
        // desde el 20/10 la cancion se elige con la seleccion de verdad del juego: viene el comando "run ..." que armo
        // y sus banderas de modo; se revisa que sea un comando de cancion y que el numero coincida
        $cmd = texto($p['cmd'] ?? '', 40); $banderas = (int)($p['banderas'] ?? 0);
        if (!isset($sala['jugadores'][$a]) || $a === $id) error('ese jugador no esta');
        // una cancion propia (82-99, de la build) viaja en un paquete que ya subio (paquete_trozo) y se revisa aca
        $paquete = null;
        if ($c >= 82 && $c <= 99) { $paquete = cerrarPaquete($dir, (string)($p['paquete'] ?? ''), $id, $p['meta'] ?? null, $c); if (!$paquete) error('la cancion propia no paso la revision'); }
        if ((!$paquete && !in_array($c, CANCIONES_SOLO, true)) || !in_array($m, MODOS, true)) error('cancion o modo invalido');
        if ($cmd !== '' && (!preg_match('/^run (\d\d)_[a-z0-9]{1,3}\.not -[sd] (\d\d)\.dat$/i', $cmd, $mm) || (int)$mm[1] !== $c || (int)$mm[2] !== $c)) error('comando de cancion invalido');
        if ($banderas < 0 || $banderas > 0xFFFF) error('banderas invalidas');
        if ($sala['jugadores'][$a]['estado'] !== 'sala' || $yo['estado'] !== 'sala') error('alguno de los dos esta jugando');
        // (21/10) la cuenta antes de arrancar, en segundos, desde que los dos cargaron el juego (OPCIONES del que desafia)
        $espera = max(3, min(15, (int)($p['espera'] ?? 5)));
        foreach ($sala['desafios'] as $k => $o) if ($o['de'] === $id) unset($sala['desafios'][$k]);   // uno pendiente por persona
        $sala['desafios'][bin2hex(random_bytes(5))] = ['de' => $id, 'a' => $a, 'cancion' => $c, 'modo' => $m, 'cmd' => $cmd, 'banderas' => $banderas, 't' => $ahora, 'paquete' => $paquete, 'espera' => $espera];
        break;

    case 'paquete_trozo':   // el que desafia sube su cancion propia de a trozos de 512 KB, antes de desafiar
        $tipo = (string)($p['tipo'] ?? ''); $parte = (int)($p['parte'] ?? -1); $pq = (string)($p['pq'] ?? '');
        if (!isset(TOPE_PAQUETE[$tipo])) error('tipo invalido');
        if ($pq === '') {              // uno nuevo: el anterior de este jugador se borra
            foreach (glob("$dir/paquetes/*/dueno") ?: [] as $f) if (trim((string)file_get_contents($f)) === $id) borrarPaquete(dirname($f));
            $pq = bin2hex(random_bytes(8)); mkdir(dirPaquete($dir, $pq), 0755, true); file_put_contents(dirPaquete($dir, $pq) . '/dueno', $id);
        }
        $dp = dirPaquete($dir, $pq);
        if (!preg_match('/^[a-f0-9]{16}$/', $pq) || trim((string)@file_get_contents("$dp/dueno")) !== $id || is_file("$dp/meta.json")) error('paquete invalido');
        $d = base64_decode((string)($p['datos'] ?? ''), true);
        if ($d === false || $d === '' || strlen($d) > TROZO) error('trozo invalido');
        $f = "$dp/$tipo.sub"; $ya = is_file($f) ? filesize($f) : 0;
        if ($ya % TROZO !== 0 || $parte !== intdiv($ya, TROZO)) error('trozo fuera de orden');
        if ($ya + strlen($d) > TOPE_PAQUETE[$tipo]) error('archivo demasiado grande');
        file_put_contents($f, $d, FILE_APPEND);
        $guardar(); responder(['ok' => true, 'pq' => $pq]);

    case 'paquete_bajar':   // el que recibe (o el que desafio) lo baja de a trozos, ya revisado
        $pq = (string)($p['pq'] ?? ''); $tipo = (string)($p['tipo'] ?? ''); $parte = max(0, (int)($p['parte'] ?? 0));
        $permitido = false;
        foreach ($sala['desafios'] as $d) if (($d['paquete']['pq'] ?? '') === $pq && ($d['a'] === $id || $d['de'] === $id)) $permitido = true;
        foreach ($sala['partidas'] as $pa) if (($pa['paquete']['pq'] ?? '') === $pq && isset($pa['jugadores'][$id])) $permitido = true;
        $guardar();
        if (!$permitido || !isset(TOPE_PAQUETE[$tipo]) || !preg_match('/^[a-f0-9]{16}$/', $pq)) error('ese paquete no es para vos');
        $f = dirPaquete($dir, $pq) . "/$tipo";
        if (!is_file($f)) error('el paquete ya no esta');
        $largo = filesize($f);
        responder(['datos' => base64_encode((string)file_get_contents($f, false, null, $parte * TROZO, TROZO)), 'parte' => $parte, 'partes' => max(1, (int)ceil($largo / TROZO)), 'largo' => $largo]);

    case 'responder':
        $did = (string)($p['desafio'] ?? '');
        $d = $sala['desafios'][$did] ?? null;
        if (!$d || $d['a'] !== $id) error('ese desafio ya no esta');
        unset($sala['desafios'][$did]);
        $rival = $d['de'];
        if (!empty($p['acepta']) && isset($sala['jugadores'][$rival]) && $sala['jugadores'][$rival]['estado'] === 'sala') {
            $pid = bin2hex(random_bytes(5));
            // 'inicio' es de respaldo (si alguno nunca avisa que cargo); con los dos 'listo' pasa a ahora + espera
            $sala['partidas'][$pid] = ['cancion' => $d['cancion'], 'modo' => $d['modo'], 'cmd' => $d['cmd'] ?? '', 'banderas' => $d['banderas'] ?? 0, 'inicio' => $ahora + ESPERA_ARRANQUE, 'paquete' => $d['paquete'] ?? null,
                'espera' => $d['espera'] ?? 5, 'listos' => new stdClass(), 'arrancada' => false,
                'jugadores' => [$rival => ['nick' => $sala['jugadores'][$rival]['nick']], $id => ['nick' => $yo['nick']]], 'cerrada' => false];
            foreach ([$rival, $id] as $j) { $sala['jugadores'][$j]['estado'] = 'jugando'; $sala['jugadores'][$j]['partida'] = $pid; }
            foreach ($sala['desafios'] as $k => $o) if (in_array($o['de'], [$rival, $id], true) || in_array($o['a'], [$rival, $id], true)) unset($sala['desafios'][$k]);
            $sala['chat'][] = ['n' => $sala['sigChat']++, 'sistema' => true, 'texto' => $sala['jugadores'][$rival]['nick'] . ' vs ' . $yo['nick'] . ': ' . (!empty($d['paquete']) ? $d['paquete']['nombre'] . ' (propia)' : 'cancion ' . $d['cancion']) . ' ' . $d['modo'], 't' => $ahora];
        }
        break;

    case 'marcador':   // puntaje en vivo y el final de la partida
        $pid = (string)$yo['partida'];
        if (!isset($sala['partidas'][$pid])) break;
        $pa = &$sala['partidas'][$pid];
        $pa['jugadores'][$id] = array_merge($pa['jugadores'][$id], [
            'puntaje' => max(0, (int)($p['puntaje'] ?? 0)), 'combo' => max(0, (int)($p['combo'] ?? 0)), 'comboMax' => max(0, min(9999, (int)($p['comboMax'] ?? 0))),
            'vida' => (int)($p['vida'] ?? 0), 'nota' => texto($p['nota'] ?? '', 2), 'terminado' => !empty($p['terminado']), 't' => $ahora,
            // (mejoras 8 y 17) lo que hizo desde el envio anterior: juicios en orden, paneles pisados y las cuentas
            'juicios' => preg_replace('/[^PGOBM]/', '', texto($p['juicios'] ?? '', 40)), 'pads' => max(0, min(1023, (int)($p['pads'] ?? 0))),
            'cuentas' => array_map(fn($v) => max(0, min(9999, (int)$v)), array_slice(array_pad(is_array($p['cuentas'] ?? null) ? $p['cuentas'] : [], 5, 0), 0, 5)),
            'seq' => ($pa['jugadores'][$id]['seq'] ?? 0) + 1]);
        $todos = true;
        foreach ($pa['jugadores'] as $jj) if (empty($jj['terminado'])) $todos = false;
        if ($todos && !$pa['cerrada']) { $pa['cerrada'] = true; anotarRanking($dir, $pa); }
        unset($pa);
        break;

    case 'volver':     // termino (o abandono) la partida: vuelve a la sala
        $pid = (string)$yo['partida'];
        if (isset($sala['partidas'][$pid]) && !$sala['partidas'][$pid]['cerrada'] && empty($sala['partidas'][$pid]['jugadores'][$id]['terminado'])) {
            $sala['partidas'][$pid]['jugadores'][$id]['abandono'] = true;
            $sala['partidas'][$pid]['jugadores'][$id]['terminado'] = true;
        }
        $yo['estado'] = 'sala'; $yo['partida'] = null;
        break;

    case 'estado':
        break;

    case 'listo':      // (21/10) este jugador ya cargo el juego; con los dos, arranca la cuenta configurada
        $pid = (string)$yo['partida'];
        if (!isset($sala['partidas'][$pid])) break;
        $pa = &$sala['partidas'][$pid];
        $l = (array)($pa['listos'] ?? []); $l[$id] = true; $pa['listos'] = $l;
        if (empty($pa['arrancada']) && count(array_intersect(array_keys($l), array_keys($pa['jugadores']))) >= count($pa['jugadores'])) {
            $pa['arrancada'] = true; $pa['inicio'] = $ahora + max(3, min(15, (int)($pa['espera'] ?? 5)));
        }
        unset($pa);
        break;

    case 'mirar':      // (mejora 17) espectador: una partida en vivo de otros dos; ellos ven cuantos miran
        $pid = (string)($p['partida'] ?? '');
        if (isset($sala['partidas'][$pid])) { $sala['partidas'][$pid]['mirando'][$id] = $ahora; $mirada = $sala['partidas'][$pid]; $mirada['id'] = $pid; }
        else $mirada = ['terminada' => true];
        break;

    default:
        flock($candado, LOCK_UN); error('accion desconocida');
}

// respuesta comun: la sala vista por este jugador
$desde = (int)($p['chatDesde'] ?? 0);
$jugadores = [];
foreach ($sala['jugadores'] as $jid => $j) $jugadores[] = ['id' => $jid, 'nick' => $j['nick'], 'estado' => $j['estado'], 'partida' => $j['estado'] === 'jugando' ? $j['partida'] : null, 'avatar' => $j['avatar'] ?? null];
// cuantos miran cada partida (los que preguntaron en los ultimos 5 s)
foreach ($sala['partidas'] as $k => $pa) {
    $m = 0;
    foreach ($pa['mirando'] ?? [] as $quien => $t) { if ($ahora - $t < 5) $m++; elseif ($ahora - $t > 30) unset($sala['partidas'][$k]['mirando'][$quien]); }
    $sala['partidas'][$k]['miran'] = $m;
}
$desafios = [];
foreach ($sala['desafios'] as $did => $d) {
    if ($d['a'] === $id) $desafios[] = ['id' => $did, 'de' => $d['de'], 'nick' => $sala['jugadores'][$d['de']]['nick'] ?? '?', 'cancion' => $d['cancion'], 'modo' => $d['modo'], 'mio' => false, 'paquete' => $d['paquete'] ?? null];
    if ($d['de'] === $id) $desafios[] = ['id' => $did, 'a' => $d['a'], 'nick' => $sala['jugadores'][$d['a']]['nick'] ?? '?', 'cancion' => $d['cancion'], 'modo' => $d['modo'], 'mio' => true, 'paquete' => $d['paquete'] ?? null];
}
$partida = null;
if ($yo['partida'] && isset($sala['partidas'][$yo['partida']])) { $partida = $sala['partidas'][$yo['partida']]; $partida['id'] = $yo['partida']; }
$chat = array_values(array_filter($sala['chat'], fn($m) => $m['n'] > $desde));
$guardar();
if ($mirada && isset($mirada['id'])) { $mirada['miran'] = $sala['partidas'][$mirada['id']]['miran'] ?? 0; unset($mirada['mirando']); }
if ($partida) { $partida['miran'] = $sala['partidas'][$partida['id']]['miran'] ?? 0; unset($partida['mirando']); }
responder(['yo' => ['id' => $id, 'nick' => $yo['nick'], 'estado' => $yo['estado']], 'jugadores' => $jugadores, 'desafios' => $desafios,
    'partida' => $partida, 'chat' => $chat, 'ahora' => $ahora, 'mirada' => $mirada]);

// ---------- ranking: mejor puntaje por cancion y modo (top 10) y ganadas/perdidas por nickname ----------
function anotarRanking(string $dir, array $pa): void {
    $r = leer("$dir/ranking.json", ['mejores' => [], 'jugadores' => []]);
    $clave = $pa['cancion'] . ' ' . $pa['modo'];
    $lista = $r['mejores'][$clave] ?? [];
    $mejor = null; $empate = false;
    foreach ($pa['jugadores'] as $j) {
        if (!empty($j['abandono'])) continue;
        $lista[] = ['nick' => $j['nick'], 'puntaje' => $j['puntaje'] ?? 0, 'nota' => $j['nota'] ?? '', 'fecha' => date('Y-m-d')];
        if ($mejor === null || ($j['puntaje'] ?? 0) > ($mejor['puntaje'] ?? 0)) { $mejor = $j; $empate = false; }
        elseif (($j['puntaje'] ?? 0) === ($mejor['puntaje'] ?? 0)) $empate = true;
    }
    usort($lista, fn($a, $b) => $b['puntaje'] <=> $a['puntaje']);
    // las canciones propias no van a "mejores": el 82 de cada uno es otra cancion (las ganadas y perdidas si cuentan)
    if (empty($pa['paquete'])) $r['mejores'][$clave] = array_slice($lista, 0, 10);
    foreach ($pa['jugadores'] as $j) {
        $n = $j['nick'];
        $e = $r['jugadores'][$n] ?? ['ganadas' => 0, 'perdidas' => 0, 'empatadas' => 0, 'mejor' => 0];
        if (!empty($j['abandono'])) $e['perdidas']++;
        elseif ($empate) $e['empatadas']++;
        elseif ($mejor && $j['nick'] === $mejor['nick']) $e['ganadas']++;
        else $e['perdidas']++;
        $e['mejor'] = max($e['mejor'], $j['puntaje'] ?? 0);
        $r['jugadores'][$n] = $e;
        anotarPerfil($dir, $n, ['cancion' => $pa['cancion'], 'modo' => $pa['modo'], 'puntaje' => $j['puntaje'] ?? 0, 'nota' => !empty($j['abandono']) ? 'F' : ($j['nota'] ?? ''),
            'combo' => $j['comboMax'] ?? $j['combo'] ?? 0, 'resultado' => !empty($j['abandono']) ? 'P' : ($empate ? 'E' : ($mejor && $j['nick'] === $mejor['nick'] ? 'G' : 'P'))]);
    }
    grabar("$dir/ranking.json", $r);
}
