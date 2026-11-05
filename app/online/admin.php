<?php
// Panel de moderacion del salon (Charles 05/11: "un modo administrador para saber que onda con la gente que esta en el online,
// poner filtros, borrar mensajes, onda admin y moderador, puede ser la misma persona o puedo delegar"). Pantalla: app\admin.
// Roles: moderador (ver, borrar mensajes, silenciar, echar, bloquear por un tiempo) y admin (ademas bloquear para siempre,
// levantar bloqueos, el filtro, el equipo y el registro). Los permisos se miran aca, no en la pantalla.
// Nadie le pasa una contrasena a nadie: el admin genera un link de un solo uso y cada uno elige la suya. El primer admin
// entra con el link de tools\alta_admin.ps1 (datos/admin/alta.json). Todo vive en datos/, que no se puede abrir desde afuera.
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Cross-Origin-Resource-Policy: same-origin');
header('X-Content-Type-Options: nosniff');

const DURA_SESION = 43200;     // 12 h
const DURA_INVITACION = 259200; // 3 dias
const ROLES = ['admin', 'moderador'];

$dir = getenv('PIU_ONLINE_DATOS') ?: (__DIR__ . '/datos');
if (!is_dir($dir)) mkdir($dir, 0755, true);
ini_set('log_errors', '1'); ini_set('error_log', "$dir/errores.log");
if (!file_exists("$dir/.htaccess")) file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
require __DIR__ . '/comun.php';
require __DIR__ . '/filtro.php';
require __DIR__ . '/moderacion.php';

$adm = "$dir/admin";
if (!is_dir($adm)) mkdir($adm, 0755, true);
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') error('solo POST', 405);
// otro sitio no puede mandarle pedidos al panel con la sesion de alguien: JSON y mismo origen (ademas, la cookie es SameSite=Strict)
if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === false) error('pedido invalido', 415);
$origen = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origen !== '' && parse_url($origen, PHP_URL_HOST) !== explode(':', (string)($_SERVER['HTTP_HOST'] ?? ''))[0]) error('pedido invalido', 403);
$crudo = file_get_contents('php://input', false, null, 0, 262145) ?: '{}';
if (strlen($crudo) > 262144) error('pedido demasiado grande', 413);
$p = json_decode($crudo, true, 8);
if (!is_array($p)) error('pedido invalido');
$accion = (string)($p['accion'] ?? '');
limitar($dir, 'admin', 1500, 600);

// ---------- cuentas y sesiones ----------
function cuentas(string $adm): array { return leer("$adm/cuentas.json", []); }
function candadoAdm(string $adm) { $c = fopen("$adm/candado", 'c'); flock($c, LOCK_EX); return $c; }
// (05/11, Charles: "quiero entrar con mi mail, y los moderadores tambien") la cuenta es el mail. El link privado de la
// invitacion es lo que autoriza a crearla. Entre moderadores solo se ve la parte de antes de la @ (apodo).
function apodo(string $mail): string { return explode('@', $mail)[0]; }
function ponerCookie(string $valor, int $vence): void {
    setcookie('piu_admin', $valor, ['expires' => $vence, 'path' => rtrim(dirname((string)$_SERVER['SCRIPT_NAME']), '/\\') . '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
}
function abrirSesion(string $adm, string $usuario): void {
    $tok = bin2hex(random_bytes(32)); $ahora = time();
    $c = candadoAdm($adm);
    $s = array_filter(leer("$adm/sesiones.json", []), fn($x) => $x['vence'] > $ahora);
    $s[hash('sha256', $tok)] = ['usuario' => $usuario, 'vence' => $ahora + DURA_SESION];
    grabar("$adm/sesiones.json", $s); flock($c, LOCK_UN);
    ponerCookie($tok, $ahora + DURA_SESION);
}
function cerrarSesiones(string $adm, string $usuario, ?string $salvo = null): void {
    $c = candadoAdm($adm);
    $s = array_filter(leer("$adm/sesiones.json", []), fn($x, $k) => $x['usuario'] !== $usuario || $k === $salvo, ARRAY_FILTER_USE_BOTH);
    grabar("$adm/sesiones.json", $s); flock($c, LOCK_UN);
}
function miCuenta(string $adm): ?array {
    $tok = (string)($_COOKIE['piu_admin'] ?? '');
    if ($tok === '') return null;
    $k = hash('sha256', $tok);
    $s = leer("$adm/sesiones.json", [])[$k] ?? null;
    if (!$s || $s['vence'] < time()) return null;
    $c = cuentas($adm)[$s['usuario']] ?? null;
    if (!$c || empty($c['activa'])) return null;
    return ['usuario' => $s['usuario'], 'rol' => $c['rol'], 'sesion' => $k];
}
// la invitacion: el token solo existe en el link; aca queda su huella. alta.json es la del primer admin (tools\alta_admin.ps1)
function buscarInvitacion(string $adm, string $tok): ?array {
    if (!preg_match('/^[0-9a-f]{32,64}$/', $tok)) return null;
    $h = hash('sha256', $tok); $ahora = time();
    $alta = leer("$adm/alta.json", []);
    if (!empty($alta['hash']) && hash_equals($alta['hash'], $h) && $alta['vence'] > $ahora) return ['rol' => 'admin', 'alta' => true];
    $i = leer("$adm/invitaciones.json", [])[$h] ?? null;
    return $i && $i['vence'] > $ahora ? $i + ['hash' => $h] : null;
}

// ---------- sin sesion ----------
if ($accion === 'sesion') {
    $yo = miCuenta($adm);
    responder(['usuario' => $yo['usuario'] ?? null, 'rol' => $yo['rol'] ?? null]);
}
if ($accion === 'entrar') {
    limitar($dir, 'admin_entrar', 8, 600);
    $u = strtolower(texto($p['usuario'] ?? '', 120)); $c = cuentas($adm)[$u] ?? null;
    // sin cuenta se calcula igual, para que no se note por el tiempo si el usuario existe
    $hash = $c['hash'] ?? '$2y$10$usesomesillystringforsaltuYQ2zQmF6mNnqVJr3eQdqHnKxqk3hHm';
    $bien = password_verify((string)($p['clave'] ?? ''), $hash);
    if (!$c || !$bien || empty($c['activa'])) { modRegistrar($dir, $u === '' ? '?' : $u, 'entrada fallida', ''); error('Mail o contrasena incorrectos', 401); }
    abrirSesion($adm, $u);
    modRegistrar($dir, $u, 'entro al panel', '');
    responder(['usuario' => $u, 'rol' => $c['rol']]);
}
if ($accion === 'invitacion_ver' || $accion === 'invitacion_aceptar') {
    limitar($dir, 'admin_invitacion', 20, 600);
    $tok = (string)($p['token'] ?? '');
    $inv = buscarInvitacion($adm, $tok);
    if (!$inv) error('Este link ya se uso o se vencio. Pedi uno nuevo.', 404);
    if ($accion === 'invitacion_ver') responder(['rol' => $inv['rol']]);
    $u = mailValido($p['usuario'] ?? ''); $clave = claveValida($p['clave'] ?? '', 10);
    $c = candadoAdm($adm);
    $l = cuentas($adm);
    if (isset($l[$u])) { flock($c, LOCK_UN); error('Ese mail ya tiene cuenta: entra con tu contrasena'); }
    $l[$u] = ['hash' => password_hash($clave, PASSWORD_DEFAULT), 'rol' => $inv['rol'], 'activa' => true, 'creada' => time(), 'por' => $inv['por'] ?? 'alta'];
    grabar("$adm/cuentas.json", $l);
    if (!empty($inv['alta'])) @unlink("$adm/alta.json");
    else { $i = leer("$adm/invitaciones.json", []); unset($i[$inv['hash']]); grabar("$adm/invitaciones.json", $i); }
    flock($c, LOCK_UN);
    abrirSesion($adm, $u);
    modRegistrar($dir, $u, 'se sumo al equipo', $inv['rol']);
    responder(['usuario' => $u, 'rol' => $inv['rol']]);
}

if ($accion === 'olvide') {
    limitar($dir, 'admin_olvide', 5, 3600);
    $u = strtolower(texto($p['usuario'] ?? '', 120));
    if (isset(cuentas($adm)[$u])) codigoPedir("$adm/recuperar.json", $u, 'Tu codigo para el panel del salon', "Tu codigo para cambiar la contrasena del panel del salon de Pump It Up Extra es: {codigo}\n\nVence en 30 minutos. Si no lo pediste, ignora este mensaje.");
    responder(['ok' => true]);
}
if ($accion === 'restablecer') {
    limitar($dir, 'admin_olvide', 10, 3600);
    $u = strtolower(texto($p['usuario'] ?? '', 120)); $nueva = claveValida($p['nueva'] ?? '', 10);
    if (!codigoProbar("$adm/recuperar.json", $u, (string)($p['codigo'] ?? ''))) error('Ese codigo no es valido o se vencio', 403);
    $c = candadoAdm($adm); $l = cuentas($adm);
    if (isset($l[$u])) { $l[$u]['hash'] = password_hash($nueva, PASSWORD_DEFAULT); grabar("$adm/cuentas.json", $l); }
    flock($c, LOCK_UN);
    cerrarSesiones($adm, $u);
    modRegistrar($dir, $u, 'cambio su contrasena con un codigo por mail', '');
    responder(['ok' => true]);
}

// ---------- con sesion ----------
$yo = miCuenta($adm);
if (!$yo) error('Tenes que entrar de nuevo', 401);
$soloAdmin = function () use ($yo) { if ($yo['rol'] !== 'admin') error('Eso lo puede hacer un administrador', 403); };
$anotar = function (string $que, string $detalle = '') use ($dir, $yo) { modRegistrar($dir, $yo['usuario'], $que, $detalle); };

// para tocar el salon: el mismo candado que api.php
function conSala(string $dir, callable $f) {
    $c = fopen("$dir/candado", 'c'); flock($c, LOCK_EX);
    $sala = leer("$dir/sala.json", ['jugadores' => [], 'chat' => [], 'desafios' => [], 'partidas' => [], 'sigChat' => 1]);
    $r = $f($sala);
    grabar("$dir/sala.json", $sala); flock($c, LOCK_UN);
    return $r;
}
// a quien: por id si esta conectado (con su huella) o por nombre si no esta
function objetivo(array $sala, array $p): array {
    $id = (string)($p['id'] ?? '');
    if ($id !== '' && isset($sala['jugadores'][$id])) { $j = $sala['jugadores'][$id]; return [$j['nick'], !empty($p['sinHuella']) ? '' : (string)($j['ip'] ?? ''), $id]; }
    $n = texto($p['nick'] ?? '', 16);
    if (largo($n) < 2) error('Falta el nombre');
    foreach ($sala['jugadores'] as $k => $j) if (minusculas($j['nick']) === minusculas($n)) return [$j['nick'], !empty($p['sinHuella']) ? '' : (string)($j['ip'] ?? ''), $k];
    return [$n, '', ''];
}

switch ($accion) {
case 'salir':
    $c = candadoAdm($adm); $s = leer("$adm/sesiones.json", []); unset($s[$yo['sesion']]); grabar("$adm/sesiones.json", $s); flock($c, LOCK_UN);
    ponerCookie('', 1);
    responder(['ok' => true]);

case 'estado':
    $sala = leer("$dir/sala.json", ['jugadores' => [], 'chat' => [], 'partidas' => []]);
    $ahora = microtime(true); $sanciones = sancionesActivas($dir); $protegidos = leer("$dir/nombres.json", []); $avisos = leer("$dir/moderacion/avisos.json", []);
    $jug = [];
    foreach ($sala['jugadores'] as $id => $j) {
        if ($ahora - $j['visto'] > VENCE_JUGADOR) continue;
        $pa = $j['estado'] === 'jugando' ? ($sala['partidas'][$j['partida']] ?? null) : null;
        $rival = null;
        if ($pa) foreach ($pa['jugadores'] as $o => $d) if ($o !== $id) $rival = $d['nick'] ?? null;
        $k = minusculas($j['nick']); $ip = (string)($j['ip'] ?? '');
        $sil = sancionDe($sanciones, 'silencio', $j['nick'], $ip);
        $jug[] = ['id' => $id, 'nick' => $j['nick'], 'estado' => $j['estado'], 'aparato' => $j['aparato'] ?? null, 'conectado' => isset($j['desde']) ? (int)($ahora - $j['desde']) : null,
            'visto' => (int)($ahora - $j['visto']), 'conexion' => substr($ip, 0, 6), 'protegido' => isset($protegidos[$k]), 'rival' => $rival, 'cancion' => $pa['cancion'] ?? null, 'modo' => $pa['modo'] ?? null,
            'torneo' => isset($sala['torneo']['anotados'][$id]), 'avisos' => count($avisos[$k]['v'] ?? []), 'silencio' => $sil ? ['hasta' => $sil['hasta'], 'id' => $sil['id']] : null];
    }
    $orig = [];
    foreach (modCola("$dir/moderacion/filtrados.jsonl", 200) as $f) $orig[$f['n']] = $f['original'];
    $chat = array_map(fn($m) => ['n' => $m['n'], 't' => $m['t'], 'nick' => $m['nick'] ?? null, 'id' => $m['id'] ?? null, 'sistema' => !empty($m['sistema']), 'texto' => $m['texto'], 'original' => $orig[$m['n']] ?? null], $sala['chat']);
    $t = $sala['torneo'] ?? null;
    responder(['jugadores' => $jug, 'chat' => $chat, 'partidas' => count($sala['partidas']), 'torneo' => $t ? ['estado' => $t['estado'], 'anotados' => count($t['anotados'])] : null, 'chatAbierto' => filtroConfig()['chatAbierto'], 'ahora' => time()]);

case 'chat_borrar':
    $n = (int)($p['n'] ?? 0);
    $hecho = conSala($dir, function (array &$sala) use ($n) {
        foreach ($sala['chat'] as $k => $m) if ($m['n'] === $n) {
            unset($sala['chat'][$k]); $sala['chat'] = array_values($sala['chat']);
            $sala['chatBorrados'] = array_slice([...($sala['chatBorrados'] ?? []), $n], -50);
            return $m;
        }
        return null;
    });
    if (!$hecho) error('Ese mensaje ya no esta');
    $anotar('borro un mensaje', ($hecho['nick'] ?? 'sistema') . ': ' . $hecho['texto']);
    responder(['ok' => true]);

case 'silenciar':
case 'echar':
case 'bloquear':
    $motivo = texto($p['motivo'] ?? '', 120);
    if ($accion === 'silenciar') { $seg = max(1, min(10080, (int)($p['minutos'] ?? 10))) * 60; }
    elseif ($accion === 'bloquear') {
        $horas = (int)($p['horas'] ?? 24);
        if ($horas <= 0) { $soloAdmin(); $seg = 0; } else $seg = min(720, $horas) * 3600;   // un moderador, hasta 30 dias; para siempre, solo un admin
    } else $seg = 300;     // echar: 5 minutos afuera, asi no vuelve a entrar en el acto
    $por = apodo($yo['usuario']);    // la sancion la ven los otros moderadores: sin el mail entero
    $r = conSala($dir, function (array &$sala) use ($dir, $p, $accion, $seg, $motivo, $por) {
        [$nick, $huella, $id] = objetivo($sala, $p);
        // el silencio va solo por el nombre, para no callar a todos los que comparten la red
        $s = $accion === 'silenciar' ? sancionPoner($dir, 'silencio', $nick, '', $seg, $motivo, $por) : sancionPoner($dir, 'bloqueo', $nick, $huella, $seg, $motivo, $por);
        if ($accion !== 'silenciar' && $id !== '') {
            modSacar($sala, $id, 'te sacaron del salon' . ($motivo !== '' ? ": $motivo" : ''), microtime(true));
            $sala['chat'][] = ['n' => $sala['sigChat']++, 'sistema' => true, 'texto' => "$nick fue sacado del salon", 't' => microtime(true)];
            $sala['chat'] = array_slice($sala['chat'], -100);
        }
        return $s;
    });
    $anotar($accion === 'silenciar' ? 'silencio' : ($accion === 'echar' ? 'echo' : 'bloqueo'), $r['nombre'] . ' (' . sancionAviso($r) . ')' . ($motivo !== '' ? ": $motivo" : ''));
    responder(['ok' => true, 'sancion' => $r]);

case 'sanciones':
    responder(['sanciones' => array_map(fn($s) => ['id' => $s['id'], 'tipo' => $s['tipo'], 'nombre' => $s['nombre'], 'conConexion' => $s['huella'] !== '', 'desde' => $s['desde'], 'hasta' => $s['hasta'], 'motivo' => $s['motivo'], 'por' => $s['por']], sancionesActivas($dir)), 'ahora' => time()]);

case 'sancion_quitar':
    $id = (string)($p['id'] ?? '');
    foreach (sancionesActivas($dir) as $s) if ($s['id'] === $id && $s['tipo'] === 'bloqueo') $soloAdmin();   // un moderador levanta silencios, no bloqueos
    $s = sancionQuitar($dir, $id);
    if (!$s) error('Esa sancion ya no esta');
    $anotar($s['tipo'] === 'bloqueo' ? 'levanto un bloqueo' : 'levanto un silencio', $s['nombre']);
    responder(['ok' => true]);

case 'filtrados':
    responder(['filtrados' => array_map(fn($f) => ['t' => $f['t'], 'nick' => $f['nick'], 'original' => $f['original'], 'tapado' => $f['tapado']], modCola("$dir/moderacion/filtrados.jsonl", 200))]);

case 'filtro_leer':
    $j = json_decode((string)@file_get_contents(__DIR__ . '/filtro_idiomas.json'), true);
    $idiomas = [['id' => 'base', 'nombre' => 'Rioplatense e inglés (lista propia)', 'palabras' => count(FILTRO_PALABRAS) + count(FILTRO_EMPIEZAN)]];
    foreach ($j['idiomas'] ?? [] as $k => $i) $idiomas[] = ['id' => $k, 'nombre' => $i['nombre'], 'palabras' => count($i['exactas']) + count($i['dentro'])];
    responder(['config' => filtroConfig(), 'idiomas' => $idiomas]);

case 'filtro_probar':
    $t = texto($p['texto'] ?? '', 200);
    responder(['tapado' => filtroTapar($t), 'nombreProhibido' => nickProhibido($t)]);

case 'filtro_guardar':
    $soloAdmin();
    $n = fn($o, string $k, int $min, int $max) => max($min, min($max, (int)($o[$k] ?? FILTRO_DEFECTO['auto'][$k])));
    $lista = fn($v) => array_values(array_unique(array_filter(array_map(fn($w) => texto($w, 40), array_slice(is_array($v) ? $v : [], 0, 1000)), fn($w) => $w !== '')));
    $a = is_array($p['auto'] ?? null) ? $p['auto'] : [];
    $cfg = ['activo' => !empty($p['activo']), 'nombres' => !empty($p['nombres']), 'chatAbierto' => !empty($p['chatAbierto']),
        'apagados' => array_values(array_filter(is_array($p['apagados'] ?? null) ? $p['apagados'] : [], fn($x) => is_string($x) && preg_match('/^[a-z]{2,4}$/', $x))),
        'propias' => $lista($p['propias'] ?? []), 'permitidas' => $lista($p['permitidas'] ?? []),
        'auto' => ['activo' => !empty($a['activo']), 'avisos' => $n($a, 'avisos', 1, 20), 'ventanaMin' => $n($a, 'ventanaMin', 1, 1440), 'silencioMin' => $n($a, 'silencioMin', 1, 10080),
            'silenciosParaBloquear' => $n($a, 'silenciosParaBloquear', 1, 20), 'bloqueoHoras' => $n($a, 'bloqueoHoras', 1, 720)]];
    grabar(modRuta($dir, 'filtro.json'), $cfg);
    $anotar('cambio el filtro', ($cfg['activo'] ? 'prendido' : 'APAGADO') . ', ' . count($cfg['apagados']) . ' idiomas apagados, ' . count($cfg['propias']) . ' propias, ' . count($cfg['permitidas']) . ' permitidas');
    responder(['ok' => true, 'config' => $cfg]);

case 'cuentas':
    $soloAdmin();
    $l = [];
    foreach (cuentas($adm) as $u => $c) $l[] = ['usuario' => $u, 'rol' => $c['rol'], 'activa' => !empty($c['activa']), 'creada' => $c['creada'], 'por' => $c['por'] ?? ''];
    $i = array_values(array_filter(leer("$adm/invitaciones.json", []), fn($x) => $x['vence'] > time()));
    responder(['cuentas' => $l, 'invitaciones' => array_map(fn($x) => ['rol' => $x['rol'], 'vence' => $x['vence'], 'por' => $x['por']], $i), 'yo' => $yo['usuario']]);

case 'invitar':
    $soloAdmin();
    $rol = (string)($p['rol'] ?? 'moderador');
    if (!in_array($rol, ROLES, true)) error('Rol invalido');
    $tok = bin2hex(random_bytes(24)); $ahora = time();
    $c = candadoAdm($adm);
    $i = array_filter(leer("$adm/invitaciones.json", []), fn($x) => $x['vence'] > $ahora);
    $i[hash('sha256', $tok)] = ['rol' => $rol, 'vence' => $ahora + DURA_INVITACION, 'por' => $yo['usuario']];
    grabar("$adm/invitaciones.json", $i); flock($c, LOCK_UN);
    $anotar('invito', $rol);
    responder(['token' => $tok, 'vence' => $ahora + DURA_INVITACION]);

case 'cuenta_cambiar':     // habilitar o deshabilitar, cambiar el rol o sacar del equipo
    $soloAdmin();
    $u = strtolower(texto($p['usuario'] ?? '', 120));
    $c = candadoAdm($adm);
    $l = cuentas($adm);
    if (!isset($l[$u])) { flock($c, LOCK_UN); error('Esa cuenta no existe'); }
    $nuevo = $l;
    if (array_key_exists('activa', $p)) $nuevo[$u]['activa'] = !empty($p['activa']);
    if (isset($p['rol']) && in_array($p['rol'], ROLES, true)) $nuevo[$u]['rol'] = $p['rol'];
    if (!empty($p['sacar'])) unset($nuevo[$u]);
    // siempre tiene que quedar un administrador habilitado, si no nadie puede entrar a arreglarlo
    if (!array_filter($nuevo, fn($x) => $x['rol'] === 'admin' && !empty($x['activa']))) { flock($c, LOCK_UN); error('Tiene que quedar al menos un administrador habilitado'); }
    grabar("$adm/cuentas.json", $nuevo); flock($c, LOCK_UN);
    if (empty($nuevo[$u]['activa'])) cerrarSesiones($adm, $u);
    $anotar(!empty($p['sacar']) ? 'saco del equipo' : 'cambio una cuenta', $u . (isset($nuevo[$u]) ? ' (' . $nuevo[$u]['rol'] . ', ' . (!empty($nuevo[$u]['activa']) ? 'habilitada' : 'deshabilitada') . ')' : ''));
    responder(['ok' => true]);

case 'clave_cambiar':
    limitar($dir, 'admin_entrar', 8, 600);
    $l = cuentas($adm); $u = $yo['usuario'];
    if (!password_verify((string)($p['actual'] ?? ''), $l[$u]['hash'])) error('La contrasena actual no es esa', 403);
    $nueva = claveValida($p['nueva'] ?? '', 10);
    $c = candadoAdm($adm); $l = cuentas($adm); $l[$u]['hash'] = password_hash($nueva, PASSWORD_DEFAULT); grabar("$adm/cuentas.json", $l); flock($c, LOCK_UN);
    cerrarSesiones($adm, $u, $yo['sesion']);
    $anotar('cambio su contrasena');
    responder(['ok' => true]);

case 'registro':
    $soloAdmin();
    responder(['registro' => modCola("$dir/moderacion/registro.jsonl", 300)]);

default:
    error('accion desconocida');
}
