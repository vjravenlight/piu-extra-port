<?php
// Arma app\online\filtro_idiomas.json con las listas de investigacion\filtro_idiomas\listas (LDNOOBW, CC BY 4.0).
// Un filtro de muchos idiomas se rompe por los choques: "con" es una groseria en frances y una palabra comun en castellano;
// "ano" es tambien "año" sin la tilde. Por eso cada palabra se compara con las mas usadas de cada idioma
// (investigacion\filtro_idiomas\frecuencias, FrequencyWords, que no se publica): si choca, no entra y queda en el informe.
// Uso: php tools\armar_filtro_idiomas.php     (escribe el JSON e investigacion\filtro_idiomas\INFORME.md)
$raiz = dirname(__DIR__);
require $raiz . '/app/online/filtro.php';
$fuente = "$raiz/investigacion/filtro_idiomas";

const NOMBRES = ['ar' => 'Árabe', 'zh' => 'Chino', 'cs' => 'Checo', 'da' => 'Danés', 'nl' => 'Neerlandés', 'en' => 'Inglés', 'eo' => 'Esperanto', 'fil' => 'Filipino',
    'fi' => 'Finés', 'fr' => 'Francés', 'de' => 'Alemán', 'hi' => 'Hindi', 'hu' => 'Húngaro', 'it' => 'Italiano', 'ja' => 'Japonés', 'ko' => 'Coreano', 'no' => 'Noruego',
    'fa' => 'Persa', 'pl' => 'Polaco', 'pt' => 'Portugués', 'ru' => 'Ruso', 'es' => 'Español', 'sv' => 'Sueco', 'th' => 'Tailandés', 'tr' => 'Turco'];
// cuantas de las mas usadas se miran: el salon es sobre todo en castellano, ingles y portugues
const TOPES = ['es' => 15000, 'en' => 15000, 'pt' => 15000];
const TOPE_OTROS = 6000;
// sacadas a mano: identidades, partes del cuerpo y palabras comunes que no son insultos (un filtro no tiene que tapar a nadie por decir quien es)
const QUITAR = ['gay', 'gays', 'lesbian', 'lesbians', 'lesbiana', 'lesbianas', 'bisexual', 'homosexual', 'homosexuals', 'transsexual', 'transexual', 'trans', 'queer', 'black', 'white',
    'sex', 'sexo', 'sexy', 'nude', 'nudes', 'nudity', 'naked', 'breast', 'breasts', 'penis', 'vagina', 'pene', 'desnudo', 'desnuda', 'asian', 'hard', 'hot', 'kinky', 'domination', 'erotic', 'erotism',
    'schoolgirl', 'babe', 'pissing', 'fingering', 'tit', 'tits', 'boob', 'boobs', 'jewish', 'negro', 'negra', 'chico', 'chica', 'cola', 'culito', 'teta', 'tetas',
    // (revisado mirando lo que quedaba: la fuente junta insultos con cualquier palabra de tema adulto o simplemente comun)
    'escort', 'snatch', 'sexually', 'sexuality', 'intercourse', 'nipple', 'nipples', 'poof', 'suck', 'sucks', 'panties', 'orgasm',
    'asesinato', 'asno', 'bolera', 'chupada', 'chupetón', 'coprofagía', 'infierno', 'heroína', 'maciza', 'macizorra', 'martillo', 'orina', 'pedo', 'pezón', 'sádico', 'travesti', 'vulva',
    'amador', 'ânus', 'anus', 'aranha', 'ariano', 'bumbum', 'camisinha', 'cerveja', 'clitóris', 'clitoris', 'coito', 'consolo', 'espora', 'fecal', 'gozar', 'heroína', 'homoerótico', 'lolita', 'pau', 'peidar', 'torneira', 'transar', 'veado', 'vibrador', 'grelho',
    'batere', 'battere', 'belino', 'bellino', 'biga', 'cadavere', 'ceso', 'cesso', 'checa', 'chiappa', 'coza', 'cozza', 'fava', 'lofa', 'loffa', 'montare', 'musa', 'pataca', 'pesce', 'pompa', 'pota', 'quaglia', 'sega', 'spagnola', 'tirare', 'topa', 'vangare', 'zinne', 'bagnarsi', 'ingoio', 'guardone', 'rizzarsi', 'sbattere', 'sveltina', 'goldone', 'nazionale',
    'asbak', 'beurt', 'griet', 'knor', 'muts', 'palen', 'schatje', 'standje', 'stootje', 'toeter', 'vergallen', 'vingeren', 'watje', 'zuigen', 'spuiten', 'opzouten', 'ruken', 'kanen',
    'bonze', 'bratze', 'fratze', 'mufti', 'möpse', 'nackt', 'popel', 'pinkeln', 'vögeln', 'dödel', 'rosette', 'lümmel', 'orgasmus', 'milf',
    'gerbe', 'gerber', 'meuf', 'pédale', 'tanche', 'trique', 'ramoner', 'bander', 'jouir', 'chatte', 'clito', 'clitoris', 'zizi', 'déconne', 'déconner',
    'byk', 'prisat', 'zasat', 'uboy', 'petuh', 'padlo', 'vafla', 'бугор', 'мент', 'голый', 'сать', 'секс', 'фига', 'хапать', 'офигеть', 'perdet',
    'jajko', 'jajco', 'rzygać', 'dmuchać', 'sraczka', 'burdelmama'];
// nunca se sacan por un choque: insultos que aparecen en las listas de frecuencia de otros idiomas porque las peliculas subtituladas los dejan tal cual
const CONSERVAR = ['fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'bitches', 'asshole', 'bastard', 'nigger', 'faggot', 'puta', 'kurwa', 'scheisse', 'merde', 'cazzo', 'vaffanculo', 'caralho', 'porra',
    'bastardo', 'kut', 'foda', 'foder', 'cabrão', 'pute', 'slut', 'pussy', 'whore'];
// En coreano, japones y tailandes se busca adentro del texto, y la fuente trae hasta "女の子" (chica) o "ล้างตู้เย็น" (limpiar la heladera):
// de esos idiomas entran SOLO estos insultos
const SOLO = [
    'ko' => ['개새끼', '개자식', '개좆', '계집년', '또라이', '미친새끼', '병신', '쌍놈', '씨발', '씨발놈', '씨팔', '씹물', '씹새끼', '씹창', '씹팔', '잡년', '좆만', '짱깨', '쪽바리', '창녀', '화냥년', '후레아들', '강간', '포르노', '시발', '지랄'],
    'ja' => ['ちんこ', 'まんこ', 'オマンコ', 'やりまん', 'ニガー', 'ビッチ', 'ファック', 'マザーファッカー', 'アスホール', 'レイプ', '強姦犯', '輪姦', '近親相姦', 'ポルノ', 'フェラチオ', '中出し', '売春婦', '淫乱', '死ね', 'くたばれ', 'ちんぽ'],
    'th' => ['ควย', 'เย็ด', 'ดอกทอง', 'กระหรี่', 'ไอ้ควาย', 'เหี้ย', 'ตอแหล', 'ส้นตีน', 'หญิงชาติชั่ว', 'อีดอก'],
];
// en chino la fuente tambien mezcla palabras comunes o de medicina con los insultos: estas no entran
const QUITAR_ZH = ['13点', '十三点', '九游', '下贱', '交配', '乳头', '乳房', '包皮', '卵子', '口肯', '处女', '外阴', '奶子', '屁股', '小鸡', '小乳头', '小卵子', '小肉粒', '巨乳', '性器', '性爱', '性交', '性无能', '情色', '成人', '扒光', '放荡', '月经', '激情', '玉杵', '白烂', '白痴', '白癡', '硬膠', '祖宗', '私服', '笨實', '笨蛋', '粉腸', '精子', '老二', '老味', '老母', '肉壁', '肥西', '色情', '花柳', '贝肉', '迷药', '野鸡', '阳具', '阳萎', '阴唇', '阴户', '阴核', '阴毛', '阴茎', '阴道', '阴部', '陰莖', '靠背', '靠腰', '你全家', '你妈', '你娘', '他妈', '他娘', '他奶', '你老闆', '你老母', '刚度', '后庭', '吹箫', '鬼公', '你是鸭', '你是鸡', '密洞', '打飞机', '撒尿', '浪叫', '湿透的内裤', '双峰微颤', '大卵子', '大卵泡', '妳老母的', '肉棍子', '肉棒', '肉缝'];
// lo que a la fuente le falta
const SUMAR = ['es' => ['hijueputa', 'malparido', 'chinga', 'chingada', 'chingar', 'culero', 'joder', 'cabrona', 'pendeja', 'pendejos', 'pendejas'],
    'pt' => ['porra', 'viado', 'arrombado', 'buceta', 'filhodaputa', 'fdp'],
    'ru' => ['сука', 'суки', 'блять', 'пиздец', 'пизда', 'нахуй', 'пидор', 'пидорас', 'мудак', 'ебаный', 'ублюдок']];

function lineas(string $f): array { return array_values(array_filter(array_map('trim', file($f) ?: []), fn($l) => $l !== '')); }

// las mas usadas de cada idioma: clave -> [idioma => palabra tal como se escribe]
$usadas = [];
foreach (glob("$fuente/frecuencias/*.txt") as $f) {
    $y = basename($f, '.txt'); $tope = TOPES[$y] ?? TOPE_OTROS;
    foreach (array_slice(file($f) ?: [], 0, $tope) as $l) {
        $w = explode(' ', trim($l))[0];
        $n = filtroClave($w);
        if ($n !== '' && !isset($usadas[$n][$y])) $usadas[$n][$y] = $w;
    }
}
// lo que cada idioma considera malo, para no sacar una palabra que tambien es mala en el idioma con el que choca
$malas = [];
foreach (NOMBRES as $x => $_) foreach (lineas("$fuente/listas/$x.txt") as $w) $malas[$x][filtroClave($w)] = true;

$salida = []; $informe = ["# Filtro multiidioma: lo que quedo afuera\n", "Lo arma `tools\\armar_filtro_idiomas.php`. Fuente: LDNOOBW (CC BY 4.0); choques medidos con FrequencyWords.\n"];
$total = 0;
foreach (NOMBRES as $x => $nombre) {
    $exactas = []; $dentro = []; $frases = []; $cortas = []; $choques = []; $quitadas = [];
    foreach (SOLO[$x] ?? array_merge(lineas("$fuente/listas/$x.txt"), SUMAR[$x] ?? []) as $w) {
        $n = filtroClave($w); $sinEsp = filtroSinEspacios($w);
        if ($n === '') continue;
        if (in_array(filtroMinuscula($w), QUITAR, true) || ($x === 'zh' && in_array($w, QUITAR_ZH, true))) { $quitadas[] = $w; continue; }
        if (!$sinEsp && preg_match('/\s/u', $w)) { $frases[] = $w; continue; }           // dos palabras: el comparador mira de a una
        if ($sinEsp) { if (preg_match_all('/./u', $n) >= 2) $dentro[$n] = true; else $cortas[] = $w; continue; }
        if (preg_match_all('/./u', $n) < 3) { $cortas[] = $w; continue; }                // "ass" -> "as", "cu": chocan con todo
        $choca = null;
        if (!in_array($n, array_map('filtroClave', CONSERVAR), true) && !in_array($w, SUMAR[$x] ?? [], true)) foreach ($usadas[$n] ?? [] as $y => $f) {
            if ($y === $x) { if (filtroMinuscula($f) !== filtroMinuscula($w) && empty($malas[$x][$f])) $choca = "$f ($y)"; }   // ano / año
            elseif (empty($malas[$y][$n])) $choca = "$f ($y)";
            if ($choca) break;
        }
        if ($choca) { $choques[] = "$w = $choca"; continue; }
        $exactas[$n] = true;
    }
    ksort($exactas, SORT_STRING); ksort($dentro, SORT_STRING);
    $salida[$x] = ['nombre' => $nombre, 'exactas' => array_map('strval', array_keys($exactas)), 'dentro' => array_map('strval', array_keys($dentro))];
    $n = count($exactas) + count($dentro); $total += $n;
    echo sprintf("%-4s %-12s %4d quedan · %3d choques · %3d frases · %2d cortas · %2d a mano\n", $x, $nombre, $n, count($choques), count($frases), count($cortas), count($quitadas));
    $informe[] = "\n## $nombre ($x): $n quedan\n";
    if ($choques) $informe[] = "- Choques: " . implode(' · ', $choques) . "\n";
    if ($cortas) $informe[] = "- Muy cortas: " . implode(' · ', $cortas) . "\n";
    if ($frases) $informe[] = "- Frases: " . implode(' · ', $frases) . "\n";
    if ($quitadas) $informe[] = "- Sacadas a mano: " . implode(' · ', $quitadas) . "\n";
}
ksort($salida, SORT_STRING);
file_put_contents("$raiz/app/online/filtro_idiomas.json", json_encode([
    'fuente' => 'List of Dirty, Naughty, Obscene and Otherwise Bad Words (LDNOOBW), CC BY 4.0, https://github.com/LDNOOBW; adaptada: normalizada y sin las palabras que chocan con otros idiomas',
    'idiomas' => $salida], JSON_UNESCAPED_UNICODE));
file_put_contents("$fuente/INFORME.md", implode('', $informe));
echo "Total: $total palabras, " . round(filesize("$raiz/app/online/filtro_idiomas.json") / 1024) . " KB\n";
