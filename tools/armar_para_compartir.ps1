# Junta las versiones para compartir en build\Pump It Up Extra - para compartir\ (Charles 21/10: "la carpeta con la que
# voy a compartir, tanto la version pc, mac y android, como la apk"):
# - el APK, Linux y Mac como enlaces duros a los mismos archivos (no ocupan espacio de mas);
# - Windows: la build de Edge en un .zip, SIN guardado\ (las opciones y la EEPROM de Charles no se comparten).
# Antes: armar_build_edge.ps1, build_android\armar_apk_gecko.ps1 y armar_multiplataforma.ps1.
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$b = Join-Path $base 'build'
$sale = Join-Path $b 'Pump It Up Extra - para compartir'
New-Item -ItemType Directory -Force $sale | Out-Null

function Enlace($desde, $nombre) {
    $destino = Join-Path $sale $nombre
    if (Test-Path $destino) { (Get-Item $destino).Delete() }     # el enlace viejo (el archivo de verdad no se toca)
    New-Item -ItemType HardLink -Path $destino -Target $desde | Out-Null
}
Enlace (Join-Path $b 'Pump It Up Extra - Android\PumpItUpExtra.apk') 'Pump It Up Extra - Android.apk'
foreach ($f in 'Pump It Up Extra - Linux.tar.gz', 'Pump It Up Extra - Mac Apple.tar.gz', 'Pump It Up Extra - Mac Intel.tar.gz') { Enlace (Join-Path $b "Pump It Up Extra - Linux y Mac\$f") $f }

Write-Host 'Windows: armando el .zip (sin guardado\)...'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$edge = Join-Path $b 'Pump It Up Extra - Edge'
$zip = Join-Path $sale 'Pump It Up Extra - Windows.zip'
if (Test-Path $zip) { (Get-Item $zip).Delete() }
$z = [IO.Compression.ZipFile]::Open($zip, 'Create')
try {
    $largo = (Resolve-Path $edge).Path.Length
    foreach ($f in Get-ChildItem $edge -Recurse -File) {
        $rel = $f.FullName.Substring($largo + 1)
        if ($rel -like 'guardado\*') { continue }
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, $f.FullName, 'Pump It Up Extra\' + $rel, 'Fastest')
    }
} finally { $z.Dispose() }
Copy-Item (Join-Path $PSScriptRoot 'build_electron\LEEME_COMPARTIR.txt') (Join-Path $sale 'LEEME.txt') -Force
Get-ChildItem $sale | ForEach-Object { '{0}  {1} MB' -f $_.Name, [math]::Round($_.Length / 1MB) }
