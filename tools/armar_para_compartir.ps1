# Junta las versiones para compartir (Charles 21/10: "la carpeta con la que voy a compartir, tanto la version pc, mac y
# android, como la apk"):
# - build\Pump It Up Extra - para compartir\            las completas (con el disco adentro: para pasarle a amigos);
# - build\Pump It Up Extra - para compartir (sin disco)\  con -SinDisco: sin nada de Andamiro, la primera vez piden el
#   disco del jugador (Charles 21/10: "que tire la carpeta o bin del mismo").
# El APK, Linux y Mac van como enlaces duros a los mismos archivos (no ocupan espacio de mas); Windows, la build de Edge
# en un .zip SIN guardado\ (las opciones y la EEPROM de Charles no se comparten).
# Antes: armar_build_edge.ps1, build_android\armar_apk_gecko.ps1 y armar_multiplataforma.ps1 (con -SinDisco las tres, para esa).
param([switch]$SinDisco)
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$b = Join-Path $base 'build'
$sufijo = if ($SinDisco) { ' (sin disco)' } else { '' }
$sale = Join-Path $b "Pump It Up Extra - para compartir$sufijo"
New-Item -ItemType Directory -Force $sale | Out-Null

function Enlace($desde, $nombre) {
    $destino = Join-Path $sale $nombre
    if (Test-Path -LiteralPath $destino) { (Get-Item -LiteralPath $destino).Delete() }     # el enlace viejo (el archivo de verdad no se toca)
    New-Item -ItemType HardLink -Path $destino -Target $desde | Out-Null
}
Enlace (Join-Path $b ('Pump It Up Extra - Android\' + $(if ($SinDisco) { 'PumpItUpExtra-sin-disco.apk' } else { 'PumpItUpExtra.apk' }))) "Pump It Up Extra - Android$sufijo.apk"
$apk32 = Join-Path $b ('Pump It Up Extra - Android\' + $(if ($SinDisco) { 'PumpItUpExtra-sin-disco-32bits.apk' } else { 'PumpItUpExtra-32bits.apk' }))
if (Test-Path -LiteralPath $apk32) { Enlace $apk32 "Pump It Up Extra - Android 32 bits$sufijo.apk" }     # la de Android de 32 bits (armar_apk_gecko.ps1 -Bits32), si esta armada
foreach ($f in 'Linux', 'Mac Apple', 'Mac Intel') { Enlace (Join-Path $b "Pump It Up Extra - Linux y Mac\Pump It Up Extra - $f$sufijo.tar.gz") "Pump It Up Extra - $f$sufijo.tar.gz" }

Write-Host 'Windows: armando el .zip (sin guardado\)...'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$edge = Join-Path $b "Pump It Up Extra - Edge$sufijo"
$zip = Join-Path $sale "Pump It Up Extra - Windows$sufijo.zip"
if (Test-Path -LiteralPath $zip) { (Get-Item -LiteralPath $zip).Delete() }
$z = [IO.Compression.ZipFile]::Open($zip, 'Create')
try {
    $largo = (Resolve-Path -LiteralPath $edge).Path.Length
    foreach ($f in Get-ChildItem -LiteralPath $edge -Recurse -File) {
        $rel = $f.FullName.Substring($largo + 1)
        if ($rel -like 'guardado\*') { continue }
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, $f.FullName, 'Pump It Up Extra\' + $rel, 'Fastest')
    }
} finally { $z.Dispose() }
Copy-Item (Join-Path $PSScriptRoot $(if ($SinDisco) { 'build_electron\LEEME_COMPARTIR_SIN_DISCO.txt' } else { 'build_electron\LEEME_COMPARTIR.txt' })) (Join-Path $sale 'LEEME.txt') -Force
Get-ChildItem -LiteralPath $sale | ForEach-Object { '{0}  {1} MB' -f $_.Name, [math]::Round($_.Length / 1MB) }
