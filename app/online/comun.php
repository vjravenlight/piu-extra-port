<?php
// Lo que comparten el salon (api.php) y el panel de moderacion (admin.php).
declare(strict_types=1);

const VENCE_JUGADOR = 30;      // s sin consultar = se fue (margen para celulares lentos o en segundo plano)

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
// (30/10) sin mbstring (el PHP portatil sin php.ini) strtolower no toca la Ñ ni las tildes: "ÑANDU" era otro nombre que
// "ñandu" y se salteaba la clave. Asi las mayusculas con tilde de los nombres pasan igual a minuscula
const MINUSCULAS = ['Á' => 'á', 'É' => 'é', 'Í' => 'í', 'Ó' => 'ó', 'Ú' => 'ú', 'Ü' => 'ü', 'Ñ' => 'ñ', 'À' => 'à', 'È' => 'è', 'Ì' => 'ì',
    'Ò' => 'ò', 'Ù' => 'ù', 'Â' => 'â', 'Ê' => 'ê', 'Î' => 'î', 'Ô' => 'ô', 'Û' => 'û', 'Ä' => 'ä', 'Ë' => 'ë', 'Ï' => 'ï', 'Ö' => 'ö', 'Ç' => 'ç', 'Ã' => 'ã', 'Õ' => 'õ'];
function minusculas(string $s): string { return function_exists('mb_strtolower') ? mb_strtolower($s) : strtr(strtolower($s), MINUSCULAS); }

// Limites por conexion: cada cosa tiene su cupo en una ventana de tiempo (datos/limites.json, por la huella de la IP; se limpia solo).
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

// ---------- la cuenta es el mail (panel de moderacion y login de jugador) ----------
function mailValido($u): string {
    $u = strtolower(texto($u ?? '', 120));
    if (!filter_var($u, FILTER_VALIDATE_EMAIL)) error('Ese mail no parece valido');
    return $u;
}
function claveValida($c, int $minimo): string {
    $c = (string)($c ?? '');
    if (strlen($c) < $minimo || strlen($c) > 200) error("La contrasena tiene que tener al menos $minimo caracteres");
    return $c;
}
// Olvide mi contrasena: un codigo de 6 numeros por mail, 30 minutos y 5 intentos. Se responde lo mismo exista o no el mail.
// Las pruebas no mandan nada: PIU_MAIL_PRUEBA es un archivo donde queda el mensaje
function mandarMail(string $para, string $asunto, string $cuerpo): bool {
    $prueba = getenv('PIU_MAIL_PRUEBA');
    if ($prueba) { file_put_contents($prueba, "$para\n$asunto\n$cuerpo\n", FILE_APPEND); return true; }
    return @mail($para, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $cuerpo, "From: Pump It Up Extra <no-reply@ravenlight.net>\r\nContent-Type: text/plain; charset=UTF-8");
}
function codigoPedir(string $archivo, string $mail, string $asunto, string $texto): bool {
    $cod = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT); $ahora = time();
    $l = array_filter(leer($archivo, []), fn($x) => $x['vence'] > $ahora);
    $l[$mail] = ['hash' => password_hash($cod, PASSWORD_DEFAULT), 'vence' => $ahora + 1800, 'intentos' => 0];
    grabar($archivo, $l);
    return mandarMail($mail, $asunto, str_replace('{codigo}', $cod, $texto));
}
function codigoProbar(string $archivo, string $mail, string $cod): bool {
    $l = leer($archivo, []); $e = $l[$mail] ?? null;
    if (!$e || $e['vence'] < time() || $e['intentos'] >= 5) return false;
    if (password_verify($cod, $e['hash'])) { unset($l[$mail]); grabar($archivo, $l); return true; }
    $l[$mail]['intentos']++; grabar($archivo, $l);
    return false;
}
