<?php
// (05/11, Charles: "un modo administrador... borrar mensajes, onda admin y moderador, puedo delegar") Sanciones, registro y
// sanciones automaticas del filtro. Lo usan el salon (api.php) y el panel (admin.php). Todo en datos/moderacion/.
// Una sancion alcanza al nombre y, si se la pone con huella, a la conexion (la huella de la IP: nunca se guarda la IP).
// El salon solo la mira al entrar y al mandar un chat: el sondeo de cada medio segundo no paga nada.
declare(strict_types=1);

function modRuta(string $dir, string $f): string { $d = "$dir/moderacion"; if (!is_dir($d)) mkdir($d, 0755, true); return "$d/$f"; }
function modCandado(string $dir) { $c = fopen(modRuta($dir, 'candado'), 'c'); flock($c, LOCK_EX); return $c; }

function sancionesActivas(string $dir): array {
    $ahora = time();
    return array_values(array_filter(leer("$dir/moderacion/sanciones.json", []), fn($s) => empty($s['hasta']) || $s['hasta'] > $ahora));
}
function sancionDe(array $lista, string $tipo, string $nick, string $huella): ?array {
    $k = minusculas($nick);
    foreach ($lista as $s) if ($s['tipo'] === $tipo && ($s['nick'] === $k || ($s['huella'] !== '' && $s['huella'] === $huella))) return $s;
    return null;
}
function sancionBuscar(string $dir, string $tipo, string $nick, string $huella): ?array { return sancionDe(sancionesActivas($dir), $tipo, $nick, $huella); }
// $segundos = 0: para siempre. Reemplaza la del mismo tipo y nombre.
function sancionPoner(string $dir, string $tipo, string $nombre, string $huella, int $segundos, string $motivo, string $por): array {
    $c = modCandado($dir);
    $s = ['id' => bin2hex(random_bytes(6)), 'tipo' => $tipo, 'nick' => minusculas($nombre), 'nombre' => $nombre, 'huella' => $huella,
        'desde' => time(), 'hasta' => $segundos > 0 ? time() + $segundos : 0, 'motivo' => $motivo, 'por' => $por];
    $l = array_values(array_filter(sancionesActivas($dir), fn($o) => !($o['tipo'] === $tipo && $o['nick'] === $s['nick'])));
    $l[] = $s;
    grabar(modRuta($dir, 'sanciones.json'), $l); flock($c, LOCK_UN);
    return $s;
}
function sancionQuitar(string $dir, string $id): ?array {
    $c = modCandado($dir);
    $l = sancionesActivas($dir); $quitada = null;
    foreach ($l as $k => $s) if ($s['id'] === $id) { $quitada = $s; unset($l[$k]); }
    if ($quitada) grabar(modRuta($dir, 'sanciones.json'), array_values($l));
    flock($c, LOCK_UN);
    return $quitada;
}
// lo que ve el jugador (la letra del juego no tiene tildes)
function sancionAviso(array $s): string {
    if (empty($s['hasta'])) return 'para siempre';
    $min = (int)ceil(($s['hasta'] - time()) / 60);
    return $min < 120 ? "por $min min" : 'por ' . (int)ceil($min / 60) . ' h';
}

function modAnotar(string $f, array $r): void {
    if (@filesize($f) > 400000) { $l = file($f); file_put_contents($f, implode('', array_slice($l, (int)(count($l) / 2)))); }
    file_put_contents($f, json_encode($r, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
}
function modCola(string $f, int $max): array {
    $l = @file($f) ?: [];
    return array_values(array_filter(array_map(fn($x) => json_decode($x, true), array_reverse(array_slice($l, -$max)))));
}
// quien hizo que: el panel lo muestra solo a los administradores
function modRegistrar(string $dir, string $por, string $que, string $detalle): void {
    modAnotar(modRuta($dir, 'registro.jsonl'), ['t' => time(), 'por' => $por, 'que' => $que, 'detalle' => $detalle]);
}
// el mensaje tal como lo escribio, para ver si el filtro acerto
function modFiltrado(string $dir, int $n, string $nick, string $huella, string $original, string $tapado): void {
    modAnotar(modRuta($dir, 'filtrados.jsonl'), ['t' => time(), 'n' => $n, 'nick' => $nick, 'huella' => $huella, 'original' => $original, 'tapado' => $tapado]);
}

// Filtro automatico: cada mensaje tapado es un aviso. Con 'avisos' en 'ventanaMin' minutos, silencio; con 'silenciosParaBloquear'
// silencios en un dia, bloqueo. Devuelve la sancion, si toco alguna. Va solo por el nombre: por conexion, en una juntada o un
// cyber un solo troll dejaria a todos afuera (eso lo decide una persona, en el panel).
function modAuto(string $dir, string $nick, array $cfg): ?array {
    if (empty($cfg['activo'])) return null;
    $c = modCandado($dir);
    $f = modRuta($dir, 'avisos.json'); $a = leer($f, []); $ahora = time(); $k = minusculas($nick);
    foreach ($a as $kk => $e) if ($ahora - max([0, ...$e['v'], ...$e['s']]) > 86400) unset($a[$kk]);
    $e = $a[$k] ?? ['v' => [], 's' => []];
    $e['v'] = array_values(array_filter($e['v'], fn($t) => $ahora - $t < (int)$cfg['ventanaMin'] * 60)); $e['v'][] = $ahora;
    $e['s'] = array_values(array_filter($e['s'], fn($t) => $ahora - $t < 86400));
    $toca = null;
    if (count($e['v']) >= (int)$cfg['avisos']) {
        $e['v'] = []; $e['s'][] = $ahora;
        if (count($e['s']) >= (int)$cfg['silenciosParaBloquear']) { $e['s'] = []; $toca = 'bloqueo'; } else $toca = 'silencio';
    }
    $a[$k] = $e; grabar($f, $a); flock($c, LOCK_UN);
    if (!$toca) return null;
    $seg = $toca === 'bloqueo' ? (int)$cfg['bloqueoHoras'] * 3600 : (int)$cfg['silencioMin'] * 60;
    $s = sancionPoner($dir, $toca, $nick, '', $seg, 'Filtro automatico', 'automatico');
    modRegistrar($dir, 'automatico', $toca === 'bloqueo' ? 'bloqueo' : 'silencio', "$nick (" . sancionAviso($s) . ')');
    return $s;
}

// Lo saca de la sala. Sus partidas y series las resuelve el salon en el proximo pedido, como cuando alguien se desconecta.
function modSacar(array &$sala, string $id, string $motivo, float $ahora): void {
    $sala['fuera'][$id] = ['t' => $ahora, 'motivo' => $motivo];
    unset($sala['jugadores'][$id]);
}
