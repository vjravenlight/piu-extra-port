# Abre una escena de F2 System con su propio visor (VslView_v16.exe, que vino en el disco) para ver la animacion original.
# El visor pide las imagenes en .bmp y el juego las empaqueto en .png: arma una copia con las imagenes convertidas
# en %TEMP%\piu_vsl\<escena> (no toca los archivos del proyecto).
# Uso: powershell -ExecutionPolicy Bypass -File ver_escena_f2.ps1 -Escena 04   (o el nombre de otra carpeta de descifrado\graficos\Bga)
param([Parameter(Mandatory = $true)][string]$Escena, [string]$Carpeta = 'Bga')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$base = Split-Path -Parent $PSScriptRoot
$graf = Join-Path $base 'descifrado\graficos'
$origen = Join-Path $graf "$Carpeta\$Escena"
if (-not (Test-Path -LiteralPath (Join-Path $origen 'main.vsl'))) { Write-Host "No hay main.vsl en $origen (no es una escena de F2)."; exit 1 }
$visor = Get-ChildItem -LiteralPath (Join-Path $graf 'empty\OPEN1') -Filter 'VslView_v16.exe' | Select-Object -First 1
$tmp = Join-Path $env:TEMP "piu_vsl\$Carpeta-$Escena"
New-Item -ItemType Directory -Force $tmp | Out-Null
Copy-Item -Path (Join-Path $origen '*') -Destination $tmp -Force
foreach ($f in Get-ChildItem -LiteralPath $tmp -Filter *.png) {
    $destino = [IO.Path]::ChangeExtension($f.FullName, '.bmp')
    if (Test-Path -LiteralPath $destino) { continue }
    $img = [Drawing.Image]::FromFile($f.FullName)
    $bmp = New-Object Drawing.Bitmap $img.Width, $img.Height, ([Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [Drawing.Graphics]::FromImage($bmp); $g.Clear([Drawing.Color]::Black); $g.DrawImage($img, 0, 0, $img.Width, $img.Height); $g.Dispose()
    $bmp.Save($destino, [Drawing.Imaging.ImageFormat]::Bmp); $bmp.Dispose(); $img.Dispose()
}
Start-Process -FilePath $visor.FullName -WorkingDirectory $tmp
Write-Host "Abriendo la escena $Carpeta\$Escena con el visor de F2 (cerra la ventana para terminar)."
