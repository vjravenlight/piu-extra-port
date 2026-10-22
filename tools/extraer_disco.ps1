# Extrae todos los archivos del disco (BIN/CUE multisesion, MODE2/2352) a ..\extraido
# Usa la tabla Joliet de la ultima sesion (nombres largos) y si no hay, la ISO9660 comun.
# Uso: powershell -ExecutionPolicy Bypass -File extraer_disco.ps1
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$cue = Get-ChildItem -LiteralPath $base -Filter *.cue | Select-Object -First 1
$binName = ((Get-Content -LiteralPath $cue.FullName | Where-Object { $_ -match '^\s*FILE\s+"(.+)"' } | Select-Object -First 1) -replace '^\s*FILE\s+"(.+)".*$', '$1')
$bin = Join-Path $base $binName
$out = Join-Path $base 'extraido'
if (Test-Path -LiteralPath $out) { Write-Host "Ya existe $out - no piso nada. Renombrala o movela antes."; exit 1 }

$fs = [System.IO.File]::OpenRead($bin)
$SECT = 2352
function Bcd([byte]$b) { return (($b -shr 4) * 10) + ($b -band 0x0F) }
function HeaderLba([int64]$idx) {
    $h = New-Object byte[] 16
    $fs.Position = $idx * $SECT; $null = $fs.Read($h, 0, 16)
    return ((Bcd $h[12]) * 60 + (Bcd $h[13])) * 75 + (Bcd $h[14]) - 150
}

# Sesiones: cada INDEX 01 del CUE es una posicion dentro del BIN; el header dice su LBA real
$sesiones = @()
foreach ($l in Get-Content -LiteralPath $cue.FullName) {
    if ($l -match 'INDEX\s+01\s+(\d+):(\d+):(\d+)') {
        $idx = ([int]$matches[1] * 60 + [int]$matches[2]) * 75 + [int]$matches[3]
        $sesiones += [pscustomobject]@{ Idx = $idx; Lba = (HeaderLba $idx) }
    }
}
function Idx([int64]$lba) {
    $s = $sesiones | Where-Object { $_.Lba -le $lba } | Select-Object -Last 1
    return $lba - ($s.Lba - $s.Idx)
}
function ReadData([int64]$lba, [int64]$count) {
    $ms = New-Object System.IO.MemoryStream
    $chunk = 256
    $raw = New-Object byte[] ($chunk * $SECT)
    $done = 0
    while ($done -lt $count) {
        $n = [math]::Min($chunk, $count - $done)
        $fs.Position = (Idx ($lba + $done)) * $SECT
        $null = $fs.Read($raw, 0, $n * $SECT)
        for ($k = 0; $k -lt $n; $k++) {
            $o = $k * $SECT
            if (($raw[$o + 18] -band 0x20) -ne 0) { $script:form2++ }
            $ms.Write($raw, $o + 24, 2048)
        }
        $done += $n
    }
    return $ms
}

# Descriptores de volumen de la ultima sesion
$ult = $sesiones[-1]
$pvd = $null; $svd = $null
$d = New-Object byte[] $SECT
for ($i = $ult.Idx + 16; $i -lt $ult.Idx + 40; $i++) {
    $fs.Position = [int64]$i * $SECT; $null = $fs.Read($d, 0, $SECT)
    $t = $d[24]
    if ([System.Text.Encoding]::ASCII.GetString($d, 25, 5) -ne 'CD001') { break }
    if ($t -eq 1 -and -not $pvd) { $pvd = $d.Clone() }
    if ($t -eq 2 -and $d[24 + 88] -eq 0x25 -and $d[24 + 89] -eq 0x2F) { $svd = $d.Clone() }
    if ($t -eq 255) { break }
}
$joliet = [bool]$svd
$vd = if ($joliet) { $svd } else { $pvd }
$rootLba = [BitConverter]::ToInt32($vd, 24 + 156 + 2)
$rootSize = [BitConverter]::ToInt32($vd, 24 + 156 + 10)
Write-Host ("Sesiones: {0}  Tabla: {1}" -f $sesiones.Count, $(if ($joliet) { 'Joliet' } else { 'ISO9660' }))

$script:form2 = 0
$script:archivos = 0
$script:bytes = 0
$malos = [System.IO.Path]::GetInvalidFileNameChars()
function Nombre([byte[]]$buf, [int]$p, [int]$len) {
    if ($joliet) { $n = [System.Text.Encoding]::BigEndianUnicode.GetString($buf, $p, $len) }
    else { $n = [System.Text.Encoding]::ASCII.GetString($buf, $p, $len) }
    $n = $n -replace ';\d+$', ''
    foreach ($c in $malos) { $n = $n.Replace([string]$c, '_') }
    return $n
}
function Fecha([byte[]]$buf, [int]$p) {
    try {
        $dt = New-Object DateTimeOffset((1900 + $buf[$p]), $buf[$p + 1], $buf[$p + 2], $buf[$p + 3], $buf[$p + 4], $buf[$p + 5], [TimeSpan]::FromMinutes(15 * [sbyte]$buf[$p + 6]))
        return $dt.LocalDateTime
    } catch { return $null }
}
function Walk([int64]$lba, [int64]$size, [string]$dest, [int]$depth) {
    if ($depth -gt 16) { return }
    New-Item -ItemType Directory -Force $dest | Out-Null
    $ms = ReadData $lba ([math]::Ceiling($size / 2048))
    $buf = $ms.ToArray()
    $p = 0
    while ($p -lt $size) {
        $len = $buf[$p]
        if ($len -eq 0) { $p = ([math]::Floor($p / 2048) + 1) * 2048; continue }
        $ext = [BitConverter]::ToUInt32($buf, $p + 2)
        $sz = [BitConverter]::ToUInt32($buf, $p + 10)
        $flags = $buf[$p + 25]
        $nl = $buf[$p + 32]
        if (-not ($nl -eq 1 -and $buf[$p + 33] -le 1)) {
            $name = Nombre $buf ($p + 33) $nl
            $target = Join-Path $dest $name
            $fecha = Fecha $buf ($p + 18)
            if (($flags -band 2) -ne 0) {
                Walk $ext $sz $target ($depth + 1)
            } else {
                $data = ReadData $ext ([math]::Ceiling($sz / 2048))
                $f = [System.IO.File]::Create($target)
                $f.Write($data.GetBuffer(), 0, $sz); $f.Close()
                if ($fecha) { [System.IO.File]::SetLastWriteTime($target, $fecha) }
                $script:archivos++; $script:bytes += $sz
            }
        }
        $p += $len
    }
}
Walk $rootLba $rootSize $out 0
$fs.Close()
Write-Host ("Listo: {0} archivos, {1:N1} MB en {2}" -f $script:archivos, ($script:bytes / 1MB), $out)
if ($script:form2) { Write-Host "OJO: $($script:form2) sectores Form 2 leidos como Form 1" }
