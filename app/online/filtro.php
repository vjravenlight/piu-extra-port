<?php
// Filtro de malas palabras y palabras prohibidas del salon (Charles, 20/10: "que el chat tenga un filtro de malas
// palabras y palabras prohibidas"). Lo usa api.php: en el chat tapa la palabra con asteriscos; un nickname que tenga
// una, no se acepta (online y ranking del modo solo).
//
// Como compara: cada palabra se pasa a minuscula, sin tildes, con los numeros y simbolos que imitan letras cambiados
// (0->o, 1->i, 3->e, 4->a, 5->s, 7->t, @->a, $->s) y sin letras repetidas ("putoooo" -> "puto", "pelotudo" sigue
// igual, "nigger" -> "niger"). Las letras sueltas seguidas se juntan ("p u t o" -> "puto").
// Por eso las listas de abajo van escritas asi: en minuscula, sin tildes y SIN letras dobles.
//
// PALABRAS: la palabra entera tiene que ser esa (asi "computadora" o "disputa" no saltan por "puta").
// EMPIEZAN: cualquier palabra que empiece asi ("pelotud" agarra pelotudo, pelotuda, pelotudez...).
// Para sumar o sacar una, editar aca y volver a subir app\online (tools\subir_demo_web.ps1 -Solo online).

const FILTRO_PALABRAS = [
    // insultos y groserias (rioplatense)
    'puta', 'putas', 'puto', 'putos', 'culo', 'culos', 'orto', 'ortos', 'pija', 'pijas', 'pijudo', 'pete', 'petes',
    'petero', 'petera', 'coger', 'cogida', 'cogiendo', 'cogete', 'trolo', 'trola', 'trolos', 'trolas', 'concha',
    'conchas', 'bosta', 'choto', 'chota', 'chotas', 'gil', 'giles', 'cagon', 'cagona',
    // ingles
    'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pusy', 'fag', 'fagot', 'whore', 'slut', 'ashole', 'bastard',
    'niga', 'nigas', 'niger', 'nigers', 'kys',
    // (05/11) estaban abajo y agarraban "vergangenheit", "heilige", "nazionale" o el "retard" frances (tarde)
    'verga', 'vergas', 'nazi', 'nazis', 'heil', 'retard', 'retards', 'retarded',
];
const FILTRO_EMPIEZAN = [
    // insultos y groserias (rioplatense)
    'putit', 'putaz', 'puton', 'pelotud', 'bolud', 'forro', 'forra', 'conchud', 'conchetu', 'conchesu',
    'poronga', 'garch', 'sorete', 'mierd', 'cagad', 'pajer', 'chupala', 'chupame', 'chupamela', 'mogol', 'retrasad',
    'maric', 'idiot', 'imbecil', 'estupid', 'tarad', 'hdp', 'lpm', 'lptm', 'ctm',
    // violencia, odio y abuso
    'violad', 'violar', 'violac', 'matate', 'suicidat', 'hitler',
    // ingles
    'fuck', 'motherf', 'shit', 'bitch', 'nigg', 'faggot',
];

// (05/11, Charles: "un filtro de malas palabras... automatizar, una lista multiidioma, habilitar o deshabilitar")
// Ademas de las dos listas de arriba (idioma 'base') estan las de filtro_idiomas.json (las arma tools\armar_filtro_idiomas.php).
// Desde el panel (app\admin) se prende o apaga el filtro, cada idioma, y se suman palabras propias o permitidas:
// datos/moderacion/filtro.json. Sin ese archivo vale FILTRO_DEFECTO.
const FILTRO_DEFECTO = ['activo' => true, 'nombres' => true, 'chatAbierto' => true, 'apagados' => [], 'propias' => [], 'permitidas' => [],
    'auto' => ['activo' => true, 'avisos' => 3, 'ventanaMin' => 10, 'silencioMin' => 10, 'silenciosParaBloquear' => 3, 'bloqueoHoras' => 24]];
function filtroConfig(): array {
    static $c = null;
    if ($c !== null) return $c;
    $f = (getenv('PIU_ONLINE_DATOS') ?: (__DIR__ . '/datos')) . '/moderacion/filtro.json';
    $t = @file_get_contents($f); $d = $t ? json_decode($t, true) : null;
    $c = is_array($d) ? array_merge(FILTRO_DEFECTO, $d) : FILTRO_DEFECTO;
    $c['auto'] = array_merge(FILTRO_DEFECTO['auto'], is_array($c['auto']) ? $c['auto'] : []);
    return $c;
}
// las listas ya listas para comparar. Se cargan recien cuando hay que mirar un texto (el salon consulta muy seguido y
// casi nunca hace falta). exactas: la palabra entera; dentro: escrituras sin espacios (chino, japones, coreano, tailandes)
function filtroListas(): array {
    static $l = null;
    if ($l !== null) return $l;
    $c = filtroConfig(); $exactas = []; $dentro = []; $permitidas = [];
    $j = json_decode((string)@file_get_contents(__DIR__ . '/filtro_idiomas.json'), true);
    foreach (($j['idiomas'] ?? []) as $k => $i) {
        if (in_array($k, $c['apagados'], true)) continue;
        foreach ($i['exactas'] as $w) $exactas[$w] = true;
        foreach ($i['dentro'] as $w) $dentro[$w] = true;
    }
    foreach ($c['propias'] as $w) { $n = filtroClave((string)$w); if ($n === '') continue; if (filtroSinEspacios($n)) $dentro[$n] = true; else $exactas[$n] = true; }
    foreach ($c['permitidas'] as $w) { $n = filtroClave((string)$w); if ($n !== '') { $permitidas[$n] = true; unset($exactas[$n], $dentro[$n]); } }
    return $l = ['exactas' => $exactas, 'dentro' => array_map('strval', array_keys($dentro)), 'permitidas' => $permitidas, 'base' => !in_array('base', $c['apagados'], true)];
}
function filtroSinEspacios(string $s): bool { return preg_match('/[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}\p{Thai}]/u', $s) === 1; }
function filtroMinuscula(string $w): string {
    if (function_exists('mb_strtolower')) return mb_strtolower($w, 'UTF-8');
    // sin mbstring: el cirilico a mano, que es el unico alfabeto de las listas con mayusculas (fuera del latino)
    $letra = fn(int $c) => chr(0xC0 | ($c >> 6)) . chr(0x80 | ($c & 0x3F));
    $d = ['Ё' => 'ё']; for ($i = 0x410; $i <= 0x42F; $i++) $d[$letra($i)] = $letra($i + 32);
    return strtolower(strtr($w, $d));
}

// la forma de comparar (ver arriba)
function filtroNormal(string $w): string {
    $w = strtr($w, ['Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u', 'Ü' => 'u', 'Ñ' => 'n',
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        // (05/11) las de los otros idiomas de las listas, para que "scheiße" o "kurwą" no pierdan letras
        'À' => 'a', 'Â' => 'a', 'Ã' => 'a', 'Ä' => 'a', 'Å' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a', 'ą' => 'a', 'Ą' => 'a', 'ă' => 'a',
        'Æ' => 'ae', 'æ' => 'ae', 'Ç' => 'c', 'ç' => 'c', 'ć' => 'c', 'č' => 'c', 'Č' => 'c', 'ď' => 'd', 'È' => 'e', 'Ê' => 'e', 'Ë' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'ę' => 'e', 'ě' => 'e',
        'ğ' => 'g', 'Ğ' => 'g', 'Ì' => 'i', 'Î' => 'i', 'Ï' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ı' => 'i', 'İ' => 'i', 'ł' => 'l', 'Ł' => 'l', 'ń' => 'n', 'ň' => 'n',
        'Ò' => 'o', 'Ô' => 'o', 'Õ' => 'o', 'Ö' => 'o', 'Ø' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ø' => 'o', 'ő' => 'o', 'Œ' => 'oe', 'œ' => 'oe', 'ř' => 'r',
        'ß' => 'ss', 'ś' => 's', 'š' => 's', 'Š' => 's', 'ş' => 's', 'Ş' => 's', 'ť' => 't', 'Ù' => 'u', 'Û' => 'u', 'ù' => 'u', 'û' => 'u', 'ű' => 'u', 'ů' => 'u', 'ý' => 'y', 'ÿ' => 'y',
        'ź' => 'z', 'ż' => 'z', 'ž' => 'z', 'Ž' => 'z']);
    $w = strtolower($w);
    $w = strtr($w, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's']);
    $w = preg_replace('/[^a-z]/', '', $w) ?? '';
    return preg_replace('/(.)\1+/', '$1', $w) ?? '';
}
// (05/11) lo mismo para cualquier alfabeto: el latino como siempre, los demas en minuscula y sin letras repetidas
function filtroClave(string $w): string {
    if (preg_match('/^[\p{Latin}\p{N}\p{M}\s@$.\'_-]*$/u', $w)) return filtroNormal($w);
    $w = preg_replace('/[^\p{L}\p{M}\p{N}]+/u', '', filtroMinuscula($w)) ?? '';
    return preg_replace('/(.)\1+/u', '$1', $w) ?? '';
}
function filtroEsMala(string $w): bool {
    $n = filtroClave($w);
    if ($n === '') return false;
    $l = filtroListas();
    if (isset($l['permitidas'][$n])) return false;
    if (isset($l['exactas'][$n])) return true;
    if (!$l['base']) return false;
    if (in_array($n, FILTRO_PALABRAS, true)) return true;
    foreach (FILTRO_EMPIEZAN as $e) if (strncmp($n, $e, strlen($e)) === 0) return true;
    return false;
}
// parte el texto en palabras (letras, numeros, @ y $) y separadores, y devuelve las partes
function filtroPartes(string $s): array {
    return preg_split('/([^\p{L}\p{N}@$]+)/u', $s, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [];
}
// el texto del chat y de lo que se publica: tapado, salvo que el filtro este apagado en el panel
function filtrarTexto(string $s): string { return filtroConfig()['activo'] ? filtroTapar($s) : $s; }
// el texto con cada palabra fea tapada con asteriscos (tambien las de letras sueltas: "p u t o")
function filtroTapar(string $s): string {
    $p = filtroPartes($s);
    $esPalabra = fn($x) => preg_match('/^[\p{L}\p{N}@$]+$/u', $x) === 1;
    $largo = fn($x) => (int)preg_match_all('/./us', $x);
    // letras sueltas seguidas (separadas por espacios o puntos): se miran juntas
    for ($i = 0; $i < count($p); $i++) {
        if (!$esPalabra($p[$i]) || $largo($p[$i]) !== 1) continue;
        $j = $i; $junto = '';
        while ($j < count($p) && $esPalabra($p[$j]) && $largo($p[$j]) === 1) { $junto .= $p[$j]; $j += 2; }
        if ($j - $i > 2 && filtroEsMala($junto)) for ($k = $i; $k < $j; $k += 2) $p[$k] = '*';
        $i = $j;
    }
    foreach ($p as $k => $x) if ($esPalabra($x) && filtroEsMala($x)) $p[$k] = str_repeat('*', max(3, $largo($x)));
    // (05/11) chino, japones, coreano y tailandes no separan las palabras: se busca adentro
    $dentro = filtroListas()['dentro'];
    if ($dentro) foreach ($p as $k => $x) if ($esPalabra($x) && filtroSinEspacios($x)) { $y = $x; foreach ($dentro as $w) $y = str_replace($w, str_repeat('*', $largo($w)), $y); $p[$k] = $y; }
    return implode('', $p);
}
// un nickname con una palabra prohibida, aunque este pegada a otra cosa ("ElPelotudo99", "putoo123"): en los
// nombres se busca adentro, con las de 4 letras o mas (asi "vigilante" no salta por "gil")
// Las listas de los otros idiomas miran la palabra entera: buscarlas adentro de un nombre daria demasiados falsos positivos
function nickProhibido(string $s): bool {
    if (!filtroConfig()['nombres']) return false;
    if (filtroTapar($s) !== $s) return true;
    $l = filtroListas();
    if (!$l['base'] || isset($l['permitidas'][filtroClave($s)])) return false;
    $n = filtroNormal($s);
    foreach ([...FILTRO_PALABRAS, ...FILTRO_EMPIEZAN] as $w) if (strlen($w) >= 4 && !isset($l['permitidas'][$w]) && strpos($n, $w) !== false) return true;
    return false;
}
