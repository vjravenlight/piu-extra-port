# Descifra las caratulas del disco (.PNZ) a PNG.
# Mismo cifrado que la musica: 4 bytes de encabezado y despues un PNG con los bits de cada byte
# espejados y un XOR con llave_audio_1024.bin, empezando en un corrimiento distinto por archivo.
# Lee  ..\extraido\Piu\TITLE\*.PNZ   y escribe  ..\descifrado\caratulas\*.png  (no pisa lo que ya existe)
# Uso: powershell -ExecutionPolicy Bypass -File descifrar_caratulas.ps1
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$src = Join-Path $base 'extraido\Piu\TITLE'
$out = Join-Path $base 'descifrado\caratulas'
$key = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'llave_audio_1024.bin'))
New-Item -ItemType Directory -Force $out | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
public static class Pnz {
    static byte[] rev = MakeRev();
    static byte[] MakeRev() { var t = new byte[256]; for (int x = 0; x < 256; x++) { int r = 0; for (int b = 0; b < 8; b++) if ((x & (1 << b)) != 0) r |= 1 << (7 - b); t[x] = (byte)r; } return t; }
    static readonly byte[] SIG = { 0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52 };
    public static int Corrimiento(byte[] c, byte[] k, int st) {
        for (int s = 0; s < 1024; s++) { int t = 0; for (; t < 16; t++) if ((byte)(rev[c[st + t]] ^ k[(st + t + s) & 1023]) != SIG[t]) break; if (t == 16) return s; }
        return -1;
    }
    public static byte[] Descifrar(byte[] c, byte[] k, int s, int desde) { var o = new byte[c.Length - desde]; for (int i = desde; i < c.Length; i++) o[i - desde] = (byte)(rev[c[i]] ^ k[(i + s) & 1023]); return o; }
    static uint[] tabla = MakeCrc();
    static uint[] MakeCrc() { var t = new uint[256]; for (uint n = 0; n < 256; n++) { uint c = n; for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1; t[n] = c; } return t; }
    static uint Crc(byte[] b, int off, int len) { uint c = 0xFFFFFFFFu; for (int i = off; i < off + len; i++) c = tabla[(c ^ b[i]) & 0xFF] ^ (c >> 8); return c ^ 0xFFFFFFFFu; }
    // recorre los bloques del PNG y verifica el CRC de cada uno; devuelve "ok N bloques" o el problema
    public static string Verificar(byte[] p) {
        int pos = 8, n = 0;
        while (pos + 12 <= p.Length) {
            int len = (p[pos] << 24) | (p[pos+1] << 16) | (p[pos+2] << 8) | p[pos+3];
            if (len < 0 || pos + 12 + len > p.Length) return "bloque corto en " + pos;
            string tipo = System.Text.Encoding.ASCII.GetString(p, pos + 4, 4);
            uint crc = (uint)((p[pos+8+len] << 24) | (p[pos+9+len] << 16) | (p[pos+10+len] << 8) | p[pos+11+len]);
            if (Crc(p, pos + 4, len + 4) != crc) return "CRC mal en " + tipo;
            n++; pos += 12 + len;
            if (tipo == "IEND") return "ok " + n + " bloques" + (pos < p.Length ? ", sobran " + (p.Length - pos) + " bytes" : "");
        }
        return "sin IEND";
    }
}
"@
$bien = 0; $raros = @()
foreach ($f in Get-ChildItem -LiteralPath $src -Filter *.PNZ | Sort-Object Name) {
    $dest = Join-Path $out ($f.BaseName + '.png')
    if (Test-Path -LiteralPath $dest) { Write-Host "ya existe $($f.BaseName).png, lo salteo"; continue }
    $c = [IO.File]::ReadAllBytes($f.FullName)
    $s = [Pnz]::Corrimiento($c, $key, 4)
    if ($s -lt 0) { $raros += "$($f.Name): no aparece la firma PNG"; continue }
    $png = [Pnz]::Descifrar($c, $key, $s, 4)
    $ver = [Pnz]::Verificar($png)
    [IO.File]::WriteAllBytes($dest, $png)
    $tam = ''
    try { $img = [System.Drawing.Image]::FromFile($dest); $tam = "{0}x{1}" -f $img.Width, $img.Height; $img.Dispose() } catch { $tam = 'Windows no la abre' }
    $linea = "{0,-9} corrimiento {1,4}  {2,-10} {3}" -f $f.Name, $s, $tam, $ver
    if ($ver -like 'ok*' -and $tam -notlike 'Windows*') { $bien++ } else { $raros += $linea }
    Write-Host $linea
}
Write-Host ""
Write-Host "Sanas (CRC ok y Windows las abre): $bien"
if ($raros.Count) { Write-Host "Para revisar:"; $raros | ForEach-Object { Write-Host "  $_" } }
