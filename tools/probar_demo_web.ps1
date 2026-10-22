# Prueba build\web-demo como si estuviera en el hosting (tools\router_hosting.php: Linux, distingue mayusculas):
# un bot ("Beto") en el salon y una ventana de Electron ("Ana") que lo desafia; Ana juega como en un celular si -Tactil.
# Uso: powershell -ExecutionPolicy Bypass -File probar_demo_web.ps1 -Salida C:\carpeta [-Segundos 120] [-Cancion 12] [-Modo HARD] [-Tactil]
param([Parameter(Mandatory = $true)][string]$Salida, [int]$Segundos = 120, [int]$Cancion = 12, [string]$Modo = 'HARD', [switch]$Tactil)
$base = Split-Path -Parent $PSScriptRoot
$node = Join-Path $base '..\..\4_R.A.V.E.N\raven\runtime\node.exe'
$php = Join-Path $base '..\..\2_Ravenlight.net\ravenlight-web\_herramientas\php\php.exe'
$electron = Join-Path $base '..\..\3_Apps-VJ\raven-vj-plus\node_modules\electron\dist\electron.exe'
$demo = Join-Path $base 'build\web-demo'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Salida | Out-Null
$datos = Join-Path $Salida 'salon'; New-Item -ItemType Directory -Force $datos | Out-Null
Get-ChildItem $datos -Filter '*.json' | ForEach-Object { $_.Delete() }
$env:PIU_ONLINE_DATOS = $datos
$log = Join-Path $Salida 'servidor.txt'
$srv = Start-Process -FilePath $php -ArgumentList @('-S', '127.0.0.1:8805', '-t', "`"$demo`"", "`"$base\tools\router_hosting.php`"") -PassThru -WindowStyle Hidden -RedirectStandardError $log
Start-Sleep -Seconds 2
$bot = Start-Process -FilePath $node -ArgumentList @("`"$base\tools\bot_salon.mjs`"", 'http://127.0.0.1:8805/online/api.php', 'Beto', '40') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Salida 'bot.txt')
$env:PIU_OFFSCREEN = '1'; $env:PIU_SEGUNDOS = "$Segundos"; $env:PIU_TECLAS = ''; $env:PIU_TOQUES = ''; $env:PIU_EVAL = ''
if ($Tactil) { $env:PIU_ANCHO = '412'; $env:PIU_ALTO = '728'; $extra = '&tactil&sinpantallacompleta' } else { $env:PIU_ANCHO = '1280'; $env:PIU_ALTO = '960'; $extra = '' }
$env:PIU_URL = "http://127.0.0.1:8805/port/?online&nick=Ana&desafiar=Beto&cancion=$Cancion&modo=$Modo$extra"
$env:PIU_SALIDA = Join-Path $Salida 'Ana'
$p = Start-Process -FilePath $electron -ArgumentList @("`"$base\tools\prueba-navegador`"") -PassThru -WindowStyle Hidden
if (-not $p.WaitForExit(($Segundos + 60) * 1000)) { $p.Kill() }
if (-not $bot.HasExited) { $bot.Kill() }
Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
"=== bot ==="; Get-Content (Join-Path $Salida 'bot.txt') -ErrorAction SilentlyContinue
"=== pedidos que fallaron (404) ==="; Get-Content $log -ErrorAction SilentlyContinue | Where-Object { $_ -match '404' } | Select-Object -First 15
"=== Ana ==="
Get-Content (Join-Path $Salida "Ana\registro_juego.txt") -ErrorAction SilentlyContinue | Where-Object { $_ -match 'online|STEP|BGA|AUDIO|musica: arranca|FIN|ERROR|NO EXISTE' }
"=== ranking ==="; Get-Content (Join-Path $datos 'ranking.json') -ErrorAction SilentlyContinue
