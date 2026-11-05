<?php
// ---------- CLAVE DEL NOMBRE (opcional): con ella nadie mas juega, sale en el ranking ni entra al online con ese nombre ----------
// datos/nombres.json: nombre en minuscula -> password_hash de la clave (4 a 8 numeros). Las claves mal puestas tienen
// cupo (8 cada 10 minutos por conexion), asi no se pueden adivinar probando. Lo usan api.php y cuentas.php.
declare(strict_types=1);

function nombreLibre(string $dir, string $nick, $pin): bool {
    $n = leer("$dir/nombres.json", []); $k = minusculas($nick);
    if (!isset($n[$k])) return true;
    if (is_string($pin) && preg_match('/^\d{4,8}$/', $pin) && password_verify($pin, $n[$k])) return true;
    limitar($dir, 'clave_mal', 8, 600);
    return false;
}
const ERROR_CLAVE = 'ese nombre tiene clave: ponela en OPCIONES > CLAVE DEL NOMBRE';
