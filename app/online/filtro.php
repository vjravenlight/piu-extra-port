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
];
const FILTRO_EMPIEZAN = [
    // insultos y groserias (rioplatense)
    'putit', 'putaz', 'puton', 'pelotud', 'bolud', 'forro', 'forra', 'conchud', 'conchetu', 'conchesu', 'verga',
    'poronga', 'garch', 'sorete', 'mierd', 'cagad', 'pajer', 'chupala', 'chupame', 'chupamela', 'mogol', 'retrasad',
    'maric', 'idiot', 'imbecil', 'estupid', 'tarad', 'hdp', 'lpm', 'lptm', 'ctm',
    // violencia, odio y abuso
    'violad', 'violar', 'violac', 'matate', 'suicidat', 'hitler', 'nazi', 'heil',
    // ingles
    'fuck', 'motherf', 'shit', 'bitch', 'retard', 'nigg', 'faggot',
];

// la forma de comparar (ver arriba)
function filtroNormal(string $w): string {
    $w = strtr($w, ['Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u', 'Ü' => 'u', 'Ñ' => 'n',
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
    $w = strtolower($w);
    $w = strtr($w, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's']);
    $w = preg_replace('/[^a-z]/', '', $w) ?? '';
    return preg_replace('/(.)\1+/', '$1', $w) ?? '';
}
function filtroEsMala(string $w): bool {
    $n = filtroNormal($w);
    if ($n === '') return false;
    if (in_array($n, FILTRO_PALABRAS, true)) return true;
    foreach (FILTRO_EMPIEZAN as $e) if (strncmp($n, $e, strlen($e)) === 0) return true;
    return false;
}
// parte el texto en palabras (letras, numeros, @ y $) y separadores, y devuelve las partes
function filtroPartes(string $s): array {
    return preg_split('/([^\p{L}\p{N}@$]+)/u', $s, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [];
}
// el texto con cada palabra fea tapada con asteriscos (tambien las de letras sueltas: "p u t o")
function filtrarTexto(string $s): string {
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
    return implode('', $p);
}
// un nickname con una palabra prohibida, aunque este pegada a otra cosa ("ElPelotudo99", "putoo123"): en los
// nombres se busca adentro, con las de 4 letras o mas (asi "vigilante" no salta por "gil")
function nickProhibido(string $s): bool {
    if (filtrarTexto($s) !== $s) return true;
    $n = filtroNormal($s);
    foreach ([...FILTRO_PALABRAS, ...FILTRO_EMPIEZAN] as $w) if (strlen($w) >= 4 && strpos($n, $w) !== false) return true;
    return false;
}
