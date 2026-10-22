# Descifra la musica del disco (.AUD) a MP3.
# Cifrado (descubierto el 04/10/2026): cada byte tiene los bits espejados y encima va un XOR
# con una llave de 1024 bytes (llave_audio_1024.bin) que cada archivo empieza a leer desde otra posicion.
# Lee  ..\extraido\Piu\Audio\*.AUD   y escribe  ..\descifrado\musica\*.mp3  (no pisa lo que ya existe)
# Uso: powershell -ExecutionPolicy Bypass -File descifrar_audio.ps1
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$src = Join-Path $base 'extraido\Piu\Audio'
$out = Join-Path $base 'descifrado\musica'
$key = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'llave_audio_1024.bin'))
New-Item -ItemType Directory -Force $out | Out-Null
Add-Type -TypeDefinition @"
using System;
public static class Aud {
    static readonly int[] BR1 = {0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0};
    static readonly int[] BR2 = {0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0};
    static readonly int[] SR1 = {44100,48000,32000,0};
    static byte[] rev = MakeRev();
    static byte[] MakeRev() { var t = new byte[256]; for (int x = 0; x < 256; x++) { int r = 0; for (int b = 0; b < 8; b++) if ((x & (1 << b)) != 0) r |= 1 << (7 - b); t[x] = (byte)r; } return t; }
    // largo del cuadro MP3 (Layer III, MPEG-1 o MPEG-2/2.5) o 0 si no es encabezado
    public static int Len(byte[] m, int i) {
        if (i + 3 >= m.Length || m[i] != 0xFF || (m[i+1] & 0xE0) != 0xE0) return 0;
        int ver = (m[i+1] >> 3) & 3, lay = (m[i+1] >> 1) & 3; if (lay != 1 || ver == 1) return 0;
        int bri = m[i+2] >> 4, sri = (m[i+2] >> 2) & 3, pad = (m[i+2] >> 1) & 1; if (bri == 0 || bri == 15 || sri == 3) return 0;
        int sr = SR1[sri]; if (ver == 2) sr /= 2; else if (ver == 0) sr /= 4;
        if (ver == 3) return 144000 * BR1[bri] / sr + pad;
        return 72000 * BR2[bri] / sr + pad;
    }
    static byte D(byte[] c, byte[] k, int i, int s) { return (byte)(rev[c[i]] ^ k[(i + s) & 1023]); }
    // busca corrimiento s e inicio: primer encabezado seguido de 6 cuadros validos
    public static int[] Buscar(byte[] c, byte[] k) {
        int lim = Math.Min(c.Length, 4096);
        var m = new byte[Math.Min(c.Length, 4096 + 12000)];
        for (int s = 0; s < 1024; s++) {
            for (int i = 0; i < m.Length; i++) m[i] = D(c, k, i, s);
            for (int st = 0; st < lim; st++) {
                if (m[st] != 0xFF) continue;
                int pos = st, n = 0;
                while (n < 6) { int L = Len(m, pos); if (L < 24 || pos + L + 4 >= m.Length) break; pos += L; n++; }
                if (n == 6) return new int[] { s, st };
            }
        }
        return new int[] { -1, -1 };
    }
    public static byte[] Descifrar(byte[] c, byte[] k, int s, int st) { var o = new byte[c.Length - st]; for (int i = st; i < c.Length; i++) o[i - st] = D(c, k, i, s); return o; }
    // cuantos bytes cubre la cadena de cuadros desde el inicio, y cuantos cuadros
    public static long[] Cadena(byte[] m) { int pos = 0, n = 0; while (true) { int L = Len(m, pos); if (L < 24) break; pos += L; n++; } return new long[] { Math.Min(pos, m.Length), n }; }
}
"@
$ok = 0; $raros = @()
foreach ($f in Get-ChildItem -LiteralPath $src -Filter *.AUD | Sort-Object Name) {
    $dest = Join-Path $out ($f.BaseName + '.mp3')
    if (Test-Path -LiteralPath $dest) { Write-Host "ya existe $($f.BaseName).mp3, lo salteo"; continue }
    $c = [IO.File]::ReadAllBytes($f.FullName)
    $r = [Aud]::Buscar($c, $key)
    if ($r[0] -lt 0) { $raros += "$($f.Name): no se encontro el inicio"; continue }
    $m = [Aud]::Descifrar($c, $key, $r[0], $r[1])
    $cad = [Aud]::Cadena($m)
    $pct = $cad[0] / $m.Length
    [IO.File]::WriteAllBytes($dest, $m)
    $linea = "{0,-9} corrimiento {1,4}  inicio {2,4}  cuadros {3,5}  cubre {4:P1}" -f $f.Name, $r[0], $r[1], $cad[1], $pct
    if ($pct -lt 0.99) { $raros += $linea } else { $ok++ }
    Write-Host $linea
}
Write-Host ""
Write-Host "Completos (>=99%): $ok"
if ($raros.Count) { Write-Host "Para revisar:"; $raros | ForEach-Object { Write-Host "  $_" } }
