# Prueba el online en esta PC: un servidor (tools\servidor.mjs + PHP del salon), un bot (tools\bot_salon.mjs, "Beto")
# y una ventana de Electron sin mostrar ("Ana") que lo desafia apenas lo ve. Un solo juego corriendo.
# Uso: powershell -ExecutionPolicy Bypass -File probar_online.ps1 -Salida C:\carpeta [-Segundos 110] [-Cancion 60] [-Modo NORMAL]
param([Parameter(Mandatory = $true)][string]$Salida, [int]$Segundos = 110, [int]$Cancion = 60, [string]$Modo = 'NORMAL')
$base = Split-Path -Parent $PSScriptRoot
$node = Join-Path $base '..\..\4_R.A.V.E.N\raven\runtime\node.exe'
$electron = Join-Path $base '..\..\3_Apps-VJ\raven-vj-plus\node_modules\electron\dist\electron.exe'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Salida | Out-Null
$datos = Join-Path $Salida 'salon'
New-Item -ItemType Directory -Force $datos | Out-Null
Get-ChildItem $datos -Filter '*.json' | ForEach-Object { $_.Delete() }
$env:PIU_NO_ABRIR = '1'; $env:PIU_ONLINE_DATOS = $datos; $env:PIU_GUARDADO = Join-Path $Salida 'guardado'
$srv = Start-Process -FilePath $node -ArgumentList @("`"$base\tools\servidor.mjs`"", '8799') -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
$bot = Start-Process -FilePath $node -ArgumentList @("`"$base\tools\bot_salon.mjs`"", 'http://127.0.0.1:8799/online/api.php', 'Beto', '40') -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Salida 'bot.txt')
$env:PIU_OFFSCREEN = '1'; $env:PIU_SEGUNDOS = "$Segundos"; $env:PIU_TECLAS = ''
$env:PIU_URL = "http://localhost:8799/port/?online&nick=Ana&desafiar=Beto&cancion=$Cancion&modo=$Modo"
$env:PIU_SALIDA = Join-Path $Salida 'Ana'
$p = Start-Process -FilePath $electron -ArgumentList @("`"$base\tools\prueba-navegador`"") -PassThru -WindowStyle Hidden
if (-not $p.WaitForExit(($Segundos + 60) * 1000)) { $p.Kill() }
if (-not $bot.HasExited) { $bot.Kill() }
Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
Get-Process php -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*ravenlight-web*' } | ForEach-Object { $_.Kill() }
"=== bot ==="; Get-Content (Join-Path $Salida 'bot.txt') -ErrorAction SilentlyContinue
"=== Ana ==="
Get-Content (Join-Path $Salida "Ana\navegador_log.txt") -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\d+s |menu:' } | ForEach-Object { ($_ -split '\\n')[0] } | Select-Object -Last 6
Get-Content (Join-Path $Salida "Ana\registro_juego.txt") -ErrorAction SilentlyContinue | Where-Object { $_ -match 'online|STEP|BGA|AUDIO|musica: arranca|FIN|ERROR|pausa' }
"=== ranking ==="
Get-Content (Join-Path $datos 'ranking.json') -ErrorAction SilentlyContinue
