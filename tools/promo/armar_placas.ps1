# PUMP IT UP EXTRA - pasa las placas de promocion a PNG con Edge sin ventana (promo\promo.html?p=1..7) -> promo\placas\.
# -Portal (02/11): la serie del portal piu.ravenlight.net (?p=11..17 y la imagen para compartir ?p=og) -> promo\placas-portal\.
# -Nuevas (05/11): la serie para Instagram (?p=21..28) -> promo\placas-instagram\. Las series anteriores quedan como estan.
# Antes: tools\promo\sacar_graficos.mjs (graficos del disco) y tools\promo\capturas.ps1 (capturas del port).
# Uso: powershell -File tools\promo\armar_placas.ps1 [-Solo 1,3] [-Portal] [-Nuevas]
param([string[]]$Solo, [switch]$Portal, [switch]$Nuevas)
if ($Solo) { $Solo = @($Solo | ForEach-Object { $_ -split ',' } | Where-Object { $_ }) }
$raiz = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$salida = Join-Path $raiz $(if ($Nuevas) { 'promo\placas-instagram' } elseif ($Portal) { 'promo\placas-portal' } else { 'promo\placas' })
New-Item -ItemType Directory -Force $salida | Out-Null
$perfil = Join-Path $env:TEMP 'piu-promo-edge'
$pagina = 'file:///' + ((Join-Path $raiz 'promo\promo.html') -replace '\\', '/')
$lista = if ($Nuevas) { 21..28 } elseif ($Portal) { @(11..17) + @('og') } else { 1..7 }
foreach ($p in $lista) {
  if ($Solo -and ($Solo -notcontains "$p")) { continue }
  $nombre = if ($p -eq 'og') { 'og.png' } elseif ($Nuevas) { 'placa-{0:D2}.png' -f ($p - 20) } elseif ($Portal) { 'placa-{0:D2}.png' -f ($p - 10) } else { 'placa-{0:D2}.png' -f $p }
  $tam = if ($p -eq 'og') { '1200,630' } else { '1080,1350' }
  $png = Join-Path $salida $nombre
  & $edge --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 `
    "--user-data-dir=$perfil" "--window-size=$tam" --virtual-time-budget=20000 "--screenshot=$png" "$pagina`?p=$p" 2>$null | Out-Null
  Write-Host "placa $p -> $png"
}
