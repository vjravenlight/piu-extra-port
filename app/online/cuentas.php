<?php
// Login OPCIONAL de jugador (Charles 05/11: "un login de usuario en el mismo juego, ya sea apk o la de windows, para tener las
// estadisticas, edits y todo eso... para el que quiere"). Sin cuenta se sigue jugando igual. Pantalla: app\port\cuenta.js.
// La cuenta es un mail y una contrasena, y guarda lo que el juego ya usa para reconocer a alguien:
// - el nombre y su clave (asi el ranking, el perfil y el avatar te siguen a cualquier aparato);
// - la "clave de dueño" (32 hex): la de "tu version" de los pasos en el hosting y la de tus edits de la comunidad.
// El aparato usa un token al azar (60 dias), que aca solo queda como huella. Todo en datos/cuentas/, sin acceso desde afuera.
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Cross-Origin-Resource-Policy: same-origin');
header('X-Content-Type-Options: nosniff');
// las builds (servidor propio en 127.0.0.1) usan esta misma cuenta: como en api.php
$origen = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if (preg_match('#^http://(127\.0\.0\.1|localhost)(:\d{1,5})?$#', $origen)) {
    header("Access-Control-Allow-Origin: $origen"); header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST'); header('Access-Control-Allow-Headers: Content-Type');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;

const DURA_TOKEN = 5184000;   // 60 dias
const TOPE_CUENTAS = 50000;
const CLAVE_MINIMA = 8;

$dir = getenv('PIU_ONLINE_DATOS') ?: (__DIR__ . '/datos');
if (!is_dir($dir)) mkdir($dir, 0755, true);
ini_set('log_errors', '1'); ini_set('error_log', "$dir/errores.log");
if (!file_exists("$dir/.htaccess")) file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
require __DIR__ . '/comun.php';
require __DIR__ . '/nombres.php';
require __DIR__ . '/filtro.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') error('solo POST', 405);
$crudo = file_get_contents('php://input', false, null, 0, 16385) ?: '{}';
if (strlen($crudo) > 16384) error('pedido demasiado grande', 413);
$p = json_decode($crudo, true, 6);
if (!is_array($p)) error('pedido invalido');
$accion = (string)($p['accion'] ?? '');
limitar($dir, 'cuentas', 300, 600);

$cd = "$dir/cuentas";
if (!is_dir($cd)) mkdir($cd, 0755, true);
function candado(string $cd) { $c = fopen("$cd/candado", 'c'); flock($c, LOCK_EX); return $c; }
function usuarios(string $cd): array { return leer("$cd/usuarios.json", []); }
function abrirToken(string $cd, string $mail): string {
    $t = bin2hex(random_bytes(32)); $ahora = time();
    $s = array_filter(leer("$cd/sesiones.json", []), fn($x) => $x['vence'] > $ahora);
    $s[hash('sha256', $t)] = ['mail' => $mail, 'vence' => $ahora + DURA_TOKEN];
    grabar("$cd/sesiones.json", $s);
    return $t;
}
function cerrarTokens(string $cd, string $mail, ?string $salvo = null): void {
    grabar("$cd/sesiones.json", array_filter(leer("$cd/sesiones.json", []), fn($x, $k) => $x['mail'] !== $mail || $k === $salvo, ARRAY_FILTER_USE_BOTH));
}
function datosDe(array $u, string $mail, ?string $token = null): array { return ['mail' => $mail, 'nick' => $u['nick'] ?? '', 'pin' => $u['pin'] ?? '', 'clave' => $u['clave'], 'token' => $token]; }
const REGEX_CLAVE = '/^[a-f0-9]{32}$/';
function claveAlAzar(): string { return bin2hex(random_bytes(16)); }
// lo que este aparato hizo antes de entrar a la cuenta pasa a la cuenta: "tu version" de los pasos y los edits de la comunidad.
// Si el mismo paso ya existe en la cuenta, gana el de la cuenta.
function adoptar(string $dir, string $vieja, string $nueva): void {
    if ($vieja === $nueva || !preg_match(REGEX_CLAVE, $vieja)) return;
    $de = "$dir/ediciones/" . substr(hash('sha256', $vieja), 0, 24); $a = "$dir/ediciones/" . substr(hash('sha256', $nueva), 0, 24);
    if (is_dir($de)) {
        if (!is_dir($a)) mkdir($a, 0755, true);
        foreach (glob("$de/*.not") ?: [] as $f) { $d = "$a/" . basename($f); if (!is_file($d) && count(glob("$a/*.not") ?: []) < 200) @rename($f, $d); }
    }
    $ci = "$dir/comunidad/indice.json";
    if (is_file($ci)) {
        $c = fopen("$dir/comunidad/candado", 'c'); flock($c, LOCK_EX);
        $ix = leer($ci, ['edits' => []]); $dv = substr(hash('sha256', "comunidad:$vieja"), 0, 24); $dn = substr(hash('sha256', "comunidad:$nueva"), 0, 24); $cambio = false;
        foreach ($ix['edits'] as $k => $e) if (hash_equals((string)$e['dueno'], $dv)) { $ix['edits'][$k]['dueno'] = $dn; $cambio = true; }
        if ($cambio) grabar($ci, $ix);
        flock($c, LOCK_UN);
    }
}
// el nombre de la cuenta: hay que poder usarlo (clave del nombre, si tiene). Si no tenia clave se le pone una al azar, asi queda de la cuenta
function vincularNombre(string $dir, string $nick, $pin): array {
    if (largo($nick) < 2) error('El nombre tiene que tener al menos 2 letras');
    if (nickProhibido($nick)) error('Ese nombre no se puede usar');
    $c = fopen("$dir/candado_nombres", 'c'); flock($c, LOCK_EX);
    if (!nombreLibre($dir, $nick, $pin)) { flock($c, LOCK_UN); error('Ese nombre ya tiene otra clave: ponela para sumarlo a tu cuenta', 403); }
    $n = leer("$dir/nombres.json", []); $k = minusculas($nick);
    if (!isset($n[$k])) {
        if (count($n) > 20000) { flock($c, LOCK_UN); error('no entran mas nombres con clave'); }
        $pin = str_pad((string)random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
        $n[$k] = password_hash($pin, PASSWORD_DEFAULT); grabar("$dir/nombres.json", $n);
    }
    flock($c, LOCK_UN);
    return [$nick, (string)$pin];
}

// ---------- sin sesion ----------
if ($accion === 'registrar') {
    limitar($dir, 'cuentas_nueva', 10, 3600);
    $mail = mailValido($p['mail'] ?? ''); $clave = claveValida($p['clave'] ?? '', CLAVE_MINIMA);
    $hash = password_hash($clave, PASSWORD_DEFAULT);
    $c = candado($cd); $l = usuarios($cd);
    if (isset($l[$mail])) { flock($c, LOCK_UN); error('Ese mail ya tiene cuenta: entra con tu contrasena'); }
    if (count($l) >= TOPE_CUENTAS) { flock($c, LOCK_UN); error('No entran mas cuentas por ahora'); }
    // lo que este aparato ya tenia sigue siendo suyo: su clave de dueño pasa a ser la de la cuenta
    $dueno = (string)($p['dueno'] ?? '');
    $l[$mail] = ['hash' => $hash, 'nick' => '', 'pin' => '', 'clave' => preg_match(REGEX_CLAVE, $dueno) ? $dueno : claveAlAzar(), 'creada' => time()];
    grabar("$cd/usuarios.json", $l);
    $t = abrirToken($cd, $mail);
    flock($c, LOCK_UN);
    responder(datosDe($l[$mail], $mail, $t));
}
if ($accion === 'entrar') {
    limitar($dir, 'cuentas_entrar', 10, 600);
    $mail = strtolower(texto($p['mail'] ?? '', 120)); $u = usuarios($cd)[$mail] ?? null;
    // sin cuenta se calcula igual, para que no se note por el tiempo si el mail existe
    $bien = password_verify((string)($p['clave'] ?? ''), $u['hash'] ?? '$2y$10$usesomesillystringforsaltuYQ2zQmF6mNnqVJr3eQdqHnKxqk3hHm');
    if (!$u || !$bien) error('Mail o contrasena incorrectos', 401);
    adoptar($dir, (string)($p['dueno'] ?? ''), $u['clave']);
    $c = candado($cd); $t = abrirToken($cd, $mail); flock($c, LOCK_UN);
    responder(datosDe($u, $mail, $t));
}
if ($accion === 'olvide') {
    limitar($dir, 'cuentas_olvide', 5, 3600);
    $mail = strtolower(texto($p['mail'] ?? '', 120));
    if (isset(usuarios($cd)[$mail])) codigoPedir("$cd/recuperar.json", $mail, 'Tu codigo de Pump It Up Extra', "Tu codigo para cambiar la contrasena de tu cuenta de Pump It Up Extra es: {codigo}\n\nVence en 30 minutos. Si no lo pediste, ignora este mensaje.");
    responder(['ok' => true]);       // lo mismo exista o no: asi no se puede averiguar quien tiene cuenta
}
if ($accion === 'restablecer') {
    limitar($dir, 'cuentas_olvide', 10, 3600);
    $mail = strtolower(texto($p['mail'] ?? '', 120)); $nueva = claveValida($p['nueva'] ?? '', CLAVE_MINIMA);
    if (!codigoProbar("$cd/recuperar.json", $mail, (string)($p['codigo'] ?? ''))) error('Ese codigo no es valido o se vencio', 403);
    $hash = password_hash($nueva, PASSWORD_DEFAULT);
    $c = candado($cd); $l = usuarios($cd);
    if (isset($l[$mail])) { $l[$mail]['hash'] = $hash; grabar("$cd/usuarios.json", $l); cerrarTokens($cd, $mail); }
    flock($c, LOCK_UN);
    responder(['ok' => true]);
}

// ---------- con sesion ----------
$k = hash('sha256', (string)($p['token'] ?? ''));
$ses = leer("$cd/sesiones.json", [])[$k] ?? null;
$mail = $ses && $ses['vence'] > time() ? $ses['mail'] : null;
$yo = $mail ? (usuarios($cd)[$mail] ?? null) : null;
if (!$yo) error('Tu sesion se vencio: entra de nuevo', 401);

switch ($accion) {
case 'yo':
    responder(datosDe($yo, $mail));

case 'vincular':
    $nick = texto($p['nick'] ?? '', 16);
    [$n, $pin] = vincularNombre($dir, $nick, $p['pin'] ?? null);
    $c = candado($cd); $l = usuarios($cd); $l[$mail]['nick'] = $n; $l[$mail]['pin'] = $pin; grabar("$cd/usuarios.json", $l); flock($c, LOCK_UN);
    responder(datosDe($l[$mail], $mail));

case 'salir':
    $c = candado($cd); $s = leer("$cd/sesiones.json", []); unset($s[$k]); grabar("$cd/sesiones.json", $s); flock($c, LOCK_UN);
    responder(['ok' => true]);

case 'clave_cambiar':
    limitar($dir, 'cuentas_entrar', 10, 600);
    if (!password_verify((string)($p['actual'] ?? ''), $yo['hash'])) error('La contrasena actual no es esa', 403);
    $hash = password_hash(claveValida($p['nueva'] ?? '', CLAVE_MINIMA), PASSWORD_DEFAULT);
    $c = candado($cd); $l = usuarios($cd); $l[$mail]['hash'] = $hash; grabar("$cd/usuarios.json", $l); cerrarTokens($cd, $mail, $k); flock($c, LOCK_UN);
    responder(['ok' => true]);

case 'borrar':
    limitar($dir, 'cuentas_entrar', 10, 600);
    if (!password_verify((string)($p['clave'] ?? ''), $yo['hash'])) error('La contrasena no es esa', 403);
    // el nombre queda libre si la clave la habia puesto la cuenta; el ranking y los edits publicados no tienen datos personales
    if (($yo['nick'] ?? '') !== '' && !empty($p['soltarNombre'])) {
        $cn = fopen("$dir/candado_nombres", 'c'); flock($cn, LOCK_EX);
        $n = leer("$dir/nombres.json", []); unset($n[minusculas($yo['nick'])]); grabar("$dir/nombres.json", $n); flock($cn, LOCK_UN);
    }
    $c = candado($cd); $l = usuarios($cd); unset($l[$mail]); grabar("$cd/usuarios.json", $l); cerrarTokens($cd, $mail); flock($c, LOCK_UN);
    responder(['ok' => true]);

default:
    error('accion desconocida');
}
