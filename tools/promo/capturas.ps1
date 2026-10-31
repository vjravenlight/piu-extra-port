# Capturas del port para las placas de promocion (promo\promo.html): corre el juego en Chromium sin ventana y sin
# sonido, hace un recorrido solo (recorrido_*.js) y deja las capturas en promo\capturas\<nombre>\ (una cada 5 s, con
# el registro de en que pantalla estaba cada una en navegador_log.txt).
# Uso: powershell -File tools\promo\capturas.ps1 -Nombre solo [-Segundos 600] [-Ancho 1280 -Alto 960] [-Pagina "/port/?..."]
param([string]$Nombre = 'solo', [int]$Segundos = 600, [int]$Ancho = 1280, [int]$Alto = 960, [string]$Pagina = '/port/?sinpantallacompleta', [string]$Recorrido = '', [string]$Opciones = '')
$base = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$salida = Join-Path $base "promo\capturas\$Nombre"
New-Item -ItemType Directory -Force (Join-Path $salida 'guardado') | Out-Null
# las opciones con que arranca (sin intro ni demo, nombre, modificadores en cada cancion)
if (-not $Opciones) { $Opciones = '{"online":{"nick":"RAVENLIGHT","intro":false,"demo":false,"panelMods":"cancion","desbloqueadoDeFabrica":true,"desbloqueado":true}}' }
Set-Content (Join-Path $salida 'guardado\opciones.json') -Value $Opciones -Encoding ASCII
if (-not $Recorrido) { $Recorrido = Join-Path $PSScriptRoot "recorrido_$Nombre.js" }
$env:PIU_OFFSCREEN = '1'; $env:PIU_ANCHO = "$Ancho"; $env:PIU_ALTO = "$Alto"
$env:PIU_EVAL = Get-Content $Recorrido -Raw
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $base 'tools\probar_pagina.ps1') -Pagina $Pagina -Segundos $Segundos -Salida $salida -Teclas ' ' |
  Select-String 'eval' | Select-Object -Last 3
