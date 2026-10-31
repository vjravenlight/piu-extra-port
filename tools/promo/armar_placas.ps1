# PUMP IT UP EXTRA - pasa las placas de promocion a PNG con Edge sin ventana (promo\promo.html?p=1..7) -> promo\placas\.
# Antes: tools\promo\sacar_graficos.mjs (graficos del disco) y tools\promo\capturas.ps1 (capturas del port).
# Uso: powershell -File tools\promo\armar_placas.ps1 [-Solo 1,3]
param([string[]]$Solo)
if ($Solo) { $Solo = @($Solo | ForEach-Object { $_ -split ',' } | Where-Object { $_ }) }
$raiz = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$salida = Join-Path $raiz 'promo\placas'
New-Item -ItemType Directory -Force $salida | Out-Null
$perfil = Join-Path $env:TEMP 'piu-promo-edge'
$pagina = 'file:///' + ((Join-Path $raiz 'promo\promo.html') -replace '\\', '/')
foreach ($p in 1..7) {
  if ($Solo -and ($Solo -notcontains "$p")) { continue }
  $png = Join-Path $salida ('placa-{0:D2}.png' -f $p)
  & $edge --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 `
    "--user-data-dir=$perfil" --window-size=1080,1350 --virtual-time-budget=20000 "--screenshot=$png" "$pagina`?p=$p" 2>$null | Out-Null
  Write-Host "placa $p -> $png"
}
