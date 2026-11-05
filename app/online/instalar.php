<?php
// Instalador del salon online para un hosting nuevo (Charles 05/11: "por si el dia de manana cambio el server, algo tipo setup").
// Se abre una sola vez en el navegador: revisa que el hosting sirva, y crea el primer administrador del panel.
// Para que no lo pueda usar cualquiera que llegue primero, pide un codigo que solo se puede leer con acceso a los archivos del
// hosting: datos/CODIGO_DE_INSTALACION.txt. Al terminar se borra solo; si no puede, queda trabado por datos/instalado.json.
// Guia completa: SERVIDOR_ONLINE.md. No lo sube subir_demo_web: va solo en el paquete (tools\armar_paquete_servidor.ps1).
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$dir = getenv('PIU_ONLINE_DATOS') ?: (__DIR__ . '/datos');
$errorDatos = '';
if (!is_dir($dir) && !@mkdir($dir, 0755, true)) $errorDatos = 'No pude crear la carpeta de datos.';
if (!$errorDatos && !file_exists("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
require __DIR__ . '/comun.php';

$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
function pagina(string $cuerpo): void {
    echo '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="data:,"><title>Instalar el salón online</title><style>'
        . 'body{margin:0;background:#0a0d24;color:#f1f3ff;font:16px/1.5 "Segoe UI",system-ui,Roboto,sans-serif}main{width:min(720px,100% - 32px);margin:24px auto 48px}h1{color:#ffd23f;font-size:1.5rem;margin:0 0 8px}h2{font-size:1.1rem;margin:0 0 10px}'
        . 'section{padding:16px;margin:14px 0;background:#141938;border:1px solid #323b73;border-radius:8px}table{width:100%;border-collapse:collapse}td{padding:7px 8px 7px 0;border-top:1px solid #232a55;vertical-align:top;overflow-wrap:anywhere}td:first-child{width:3.2em;font-weight:700}.ok{color:#62e39a}.no{color:#ff6b78}.ojo{color:#ffd23f}small,.nota{color:#aab2d6}'
        . 'label{display:block;margin:0 0 12px;color:#aab2d6;font-size:.92rem}input{box-sizing:border-box;display:block;width:100%;min-height:44px;margin-top:4px;padding:8px 10px;font:inherit;color:#fff;background:#0d1130;border:1px solid #323b73;border-radius:6px}button{min-height:44px;padding:8px 18px;font:inherit;font-weight:700;color:#1a1200;background:#ffd23f;border:0;border-radius:6px;cursor:pointer}a{color:#5fd0ff}code{background:#0d1130;padding:1px 5px;border-radius:4px}.error{color:#ff6b78;font-weight:600}'
        . '</style></head><body><main><h1>Instalar el salón online</h1>' . $cuerpo . '</main></body></html>';
    exit;
}
if (is_file("$dir/instalado.json")) pagina('<section><h2>Ya está instalado</h2><p>Este instalador ya se usó y quedó trabado. Podés borrar <code>online/instalar.php</code> del hosting.</p><p>Para volver a usarlo, primero borrá <code>online/datos/instalado.json</code>.</p><p><a href="../admin/">Ir al panel</a></p></section>');

// ---------- las revisiones ----------
function pedirEste(string $url, ?string $cuerpo = null): ?int {
    $ctx = stream_context_create(['http' => ['method' => $cuerpo === null ? 'GET' : 'POST', 'content' => (string)$cuerpo, 'timeout' => 4, 'ignore_errors' => true], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
    $r = @file_get_contents($url, false, $ctx, 0, 256);
    if ($r === false || empty($http_response_header[0])) return null;
    return preg_match('/\s(\d{3})\s?/', $http_response_header[0], $m) ? (int)$m[1] : null;
}
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$base = ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost') . rtrim(dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/online/instalar.php')), '/\\');
$rev = [];
$rev[] = [version_compare(PHP_VERSION, '7.4.0', '>='), 'PHP ' . PHP_VERSION, 'Hace falta PHP 7.4 o más nuevo. Se cambia en el panel del hosting.'];
foreach (['json_encode' => 'JSON', 'filter_var' => 'filter (revisar mails)', 'password_hash' => 'contraseñas', 'random_bytes' => 'números al azar', 'hash' => 'hash', 'preg_match' => 'expresiones regulares', 'flock' => 'candados de archivo'] as $f => $n) $rev[] = [function_exists($f), "Función de PHP: $n", "El hosting tiene desactivada $f."];
foreach (['api.php', 'comun.php', 'nombres.php', 'filtro.php', 'filtro_idiomas.json', 'moderacion.php', 'admin.php', 'cuentas.php'] as $f) if (!is_file(__DIR__ . "/$f")) $rev[] = [false, "Falta online/$f", 'Volvé a subir la carpeta online entera.'];
$escribe = !$errorDatos && @file_put_contents("$dir/.prueba", 'prueba') !== false; $renombra = $escribe && @rename("$dir/.prueba", "$dir/.prueba2");
$rev[] = [$escribe && $renombra, 'Se puede escribir en la carpeta de datos', $errorDatos ?: 'Dale permisos de escritura a online/datos (755, y si no alcanza, 775).'];
// datos/ no se tiene que poder abrir desde afuera: ahi van los mails y el ranking
$adentro = strpos(realpath($dir) ?: $dir, realpath(__DIR__) ?: __DIR__) === 0;
$publico = null;
if ($adentro && $renombra) { $publico = pedirEste("$base/datos/.prueba2"); $rev[] = [$publico === null ? null : $publico !== 200, 'Los datos no se pueden abrir desde internet', $publico === null ? 'No lo pude comprobar desde acá. Abrí <a href="datos/sala.json">datos/sala.json</a> en otra pestaña: tiene que dar error 403 o 404. Si muestra algo, seguí la sección Nginx de la guía.' : 'ATENCIÓN: se pueden abrir. En Nginx hay que bloquearlos a mano: sección Nginx de la guía. No sigas hasta arreglarlo.']; }
else $rev[] = [true, 'Los datos están fuera de la carpeta pública', ''];
if ($renombra) @unlink("$dir/.prueba2");
$salon = pedirEste("$base/api.php", '{"accion":"ranking"}');
$rev[] = [$salon === null ? null : $salon === 200, 'El salón responde', $salon === null ? 'No lo pude comprobar desde acá. Abrí el juego después de instalar y entrá al online.' : "Respondió con error $salon: mirá online/datos/errores.log."];
$rev[] = [$https ? true : null, 'Conexión segura (https)', 'Sin https las contraseñas viajan a la vista. Activá el certificado en el hosting (suele ser gratis) antes de usarlo de verdad.'];
$rev[] = [function_exists('mail') ? null : false, 'Mails para recuperar contraseñas', function_exists('mail') ? 'La función existe, pero solo se sabe si llegan probando: tocá "Me olvidé la contraseña" después de instalar.' : 'Este hosting no manda mails. Todo anda igual, menos recuperar contraseñas.'];
$tope = fn($v) => (int)$v * (['g' => 1073741824, 'm' => 1048576, 'k' => 1024][strtolower(substr(trim((string)$v), -1))] ?? 1);
$rev[] = [$tope(ini_get('post_max_size')) >= 1048576 ? true : false, 'Pedidos de hasta 1 MB (post_max_size: ' . ini_get('post_max_size') . ')', 'Subilo a 2M: lo usan las canciones propias en el online.'];
$hayFalla = (bool)array_filter($rev, fn($r) => $r[0] === false && !preg_match('/^Mails/', $r[1]));
$filas = '';
foreach ($rev as [$ok, $t, $ayuda]) $filas .= '<tr><td class="' . ($ok === true ? 'ok">Bien' : ($ok === false ? 'no">Mal' : 'ojo">Ojo')) . '</td><td>' . $e($t) . ($ok === true || !$ayuda ? '' : '<br><small>' . $ayuda . '</small>') . '</td></tr>';
$revision = "<section><h2>1. Revisión del hosting</h2><table>$filas</table></section>";
if ($hayFalla) pagina($revision . '<section><p class="error">Hay cosas para arreglar antes de seguir. Corregilas y recargá esta página.</p></section>');

// ---------- el codigo y el primer administrador ----------
$archivoCodigo = "$dir/CODIGO_DE_INSTALACION.txt";
if (!is_file($archivoCodigo)) file_put_contents($archivoCodigo, strtoupper(bin2hex(random_bytes(6))) . "\n");
$codigo = trim((string)file_get_contents($archivoCodigo));
$adm = "$dir/admin"; if (!is_dir($adm)) mkdir($adm, 0755, true);
$cuentas = leer("$adm/cuentas.json", []);
$hayAdmin = (bool)array_filter($cuentas, fn($c) => ($c['rol'] ?? '') === 'admin' && !empty($c['activa']));
$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    limitar($dir, 'instalar', 10, 600);
    $mail = strtolower(trim((string)($_POST['mail'] ?? ''))); $clave = (string)($_POST['clave'] ?? '');
    if (!hash_equals($codigo, strtoupper(trim((string)($_POST['codigo'] ?? ''))))) $error = 'Ese código no es. Copialo de datos/CODIGO_DE_INSTALACION.txt';
    elseif (!$hayAdmin && !filter_var($mail, FILTER_VALIDATE_EMAIL)) $error = 'Ese mail no parece válido';
    elseif (!$hayAdmin && strlen($clave) < 10) $error = 'La contraseña tiene que tener al menos 10 caracteres';
    elseif (!$hayAdmin && $clave !== (string)($_POST['otra'] ?? '')) $error = 'Las dos contraseñas no coinciden';
    else {
        if (!$hayAdmin) { $cuentas[$mail] = ['hash' => password_hash($clave, PASSWORD_DEFAULT), 'rol' => 'admin', 'activa' => true, 'creada' => time(), 'por' => 'instalador']; grabar("$adm/cuentas.json", $cuentas); }
        grabar("$dir/instalado.json", ['fecha' => date('c')]);
        @unlink($archivoCodigo);
        $borrado = @unlink(__FILE__);
        pagina('<section><h2 class="ok">Listo: el salón quedó instalado</h2><ul><li><a href="../admin/">Entrar al panel</a>' . ($hayAdmin ? ', con tu cuenta de siempre' : ', con tu mail y tu contraseña') . '</li><li><a href="../juego/">Abrir el juego</a> y probar el online</li><li><a href="../edits/">Página de edits</a></li></ul><p class="nota">' . ($borrado ? 'El instalador se borró solo.' : 'No pude borrar el instalador: borrá <code>online/instalar.php</code> a mano. Igual ya quedó trabado.') . '</p></section>');
    }
}
$campos = $hayAdmin
    ? '<p>Este hosting ya trae un administrador (por una mudanza): se mantiene tu cuenta. Solo falta confirmar con el código.</p>'
    : '<label>Tu mail<input name="mail" type="email" required autocomplete="username" value="' . $e($_POST['mail'] ?? '') . '"></label><label>Contraseña (mínimo 10 caracteres)<input name="clave" type="password" required minlength="10" autocomplete="new-password"></label><label>Repetí la contraseña<input name="otra" type="password" required minlength="10" autocomplete="new-password"></label>';
pagina($revision . '<section><h2>2. Tu cuenta de administrador</h2><p class="nota">Para comprobar que el hosting es tuyo, abrí con el administrador de archivos o por FTP este archivo y copiá lo que dice:<br><code>online/datos/CODIGO_DE_INSTALACION.txt</code></p>'
    . ($error ? '<p class="error" role="alert">' . $e($error) . '</p>' : '')
    . '<form method="post"><label>Código de instalación<input name="codigo" required autocomplete="off"></label>' . $campos . '<button type="submit">Terminar la instalación</button></form></section>');
