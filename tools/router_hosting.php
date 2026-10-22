<?php
// Imita el hosting (Linux + LiteSpeed) para probar build\web-demo en la PC antes de subirla:
//   php -S 127.0.0.1:8805 -t "build\web-demo" tools\router_hosting.php
// - sirve los archivos con los encabezados del .htaccess (COOP/COEP/CORP);
// - DISTINGUE MAYUSCULAS como Linux: si se pide "Bga/00.dat" y el archivo es "bga/00.dat", da 404;
// - los .php los ejecuta el propio servidor (el salon online).
$raiz = rtrim(str_replace('\\', '/', $_SERVER['DOCUMENT_ROOT']), '/');
$ruta = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (str_ends_with($ruta, '/')) $ruta .= 'index.html';
if (str_ends_with($ruta, '.php')) return false;
// cada parte del camino tiene que existir con esas mismas mayusculas
$actual = $raiz;
foreach (array_filter(explode('/', $ruta), 'strlen') as $parte) {
    if ($parte === '..' || !is_dir($actual) || !in_array($parte, scandir($actual), true)) { http_response_code(404); error_log("404 (mayusculas o no existe): $ruta"); echo 'no existe'; return true; }
    $actual .= '/' . $parte;
}
if (is_dir($actual)) { http_response_code(403); return true; }
$tipos = ['html' => 'text/html; charset=utf-8', 'js' => 'text/javascript', 'json' => 'application/json', 'txt' => 'text/plain', 'cfg' => 'application/octet-stream'];
$ext = strtolower(pathinfo($actual, PATHINFO_EXTENSION));
header('Content-Type: ' . ($tipos[$ext] ?? 'application/octet-stream'));
header('Cross-Origin-Opener-Policy: same-origin');
header('Cross-Origin-Embedder-Policy: require-corp');
header('Cross-Origin-Resource-Policy: same-origin');
header('Content-Length: ' . filesize($actual));
readfile($actual);
return true;
