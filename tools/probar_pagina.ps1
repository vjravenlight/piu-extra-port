# Prueba una pagina del proyecto en Chromium (Electron de RAVEN VJ PLUS) sin mostrar ventana:
# levanta su propio servidor en el puerto 8799 (no pisa el de JUGAR.cmd), abre la pagina, saca capturas y las anota.
# Uso: powershell -ExecutionPolicy Bypass -File probar_pagina.ps1 -Pagina "/pruebas/gl1.html" -Segundos 6 -Salida C:\carpeta [-Teclas "KeyS@3,Equal@4"]
param([Parameter(Mandatory = $true)][string]$Pagina, [int]$Segundos = 10, [Parameter(Mandatory = $true)][string]$Salida, [string]$Teclas = '')
$base = Split-Path -Parent $PSScriptRoot
$node = Join-Path $base '..\..\4_R.A.V.E.N\raven\runtime\node.exe'
$electron = Join-Path $base '..\..\3_Apps-VJ\raven-vj-plus\node_modules\electron\dist\electron.exe'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue   # VSCode la deja puesta y Electron arrancaria como Node
$env:PIU_NO_ABRIR = '1'
$env:PIU_GUARDADO = Join-Path $Salida 'guardado'   # la EEPROM de la prueba va aparte: no pisa las opciones guardadas de verdad
$srv = Start-Process -FilePath $node -ArgumentList @("`"$base\tools\servidor.mjs`"", '8799') -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
try {
    $env:PIU_URL = 'http://localhost:8799' + $Pagina; $env:PIU_SEGUNDOS = "$Segundos"; $env:PIU_SALIDA = $Salida; $env:PIU_TECLAS = $Teclas
    $p = Start-Process -FilePath $electron -ArgumentList @("`"$base\tools\prueba-navegador`"") -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit(($Segundos + 40) * 1000)) { $p.Kill(); Write-Host 'Electron no termino a tiempo: lo cerre.' }
} finally {
    Stop-Process -Id $srv.Id -Confirm:$false -ErrorAction SilentlyContinue
}
Get-Content (Join-Path $Salida 'navegador_log.txt') -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch 'Security Warning|Content-Security|unsafe-eval|exposes users|consult|electronjs|will not show|packaged|unnecessary security|^\s*$' }
