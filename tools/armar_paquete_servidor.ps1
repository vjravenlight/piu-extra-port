# Arma el paquete para instalar el salon online en otro hosting: build\Servidor online - para instalar.zip
# Trae el salon (online), el panel (admin), la pagina de edits (edits), el juego publico que pide disco y ROM (juego), las reglas
# del servidor (.htaccess) y la guia. NO trae nada de Andamiro ni los datos del salon. Pasos: SERVIDOR_ONLINE.md.
# Antes: node tools\armar_demo_web.mjs (deja build\web-demo al dia).
# Uso: powershell -ExecutionPolicy Bypass -File armar_paquete_servidor.ps1
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$web = Join-Path $base 'build\web-demo'
if (-not (Test-Path (Join-Path $web 'online\api.php'))) { throw 'Falta build\web-demo: correr antes tools\armar_demo_web.mjs' }
$sale = Join-Path $base 'build\Servidor online - para instalar'
if (Test-Path -LiteralPath $sale) { [IO.Directory]::Delete($sale, $true) }
New-Item -ItemType Directory -Force $sale | Out-Null
foreach ($c in 'online', 'admin', 'edits', 'juego') {
    & robocopy (Join-Path $web $c) (Join-Path $sale $c) /E /XD datos /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy fallo con $c" }
}
Copy-Item -LiteralPath (Join-Path $web '.htaccess') $sale -Force
Copy-Item -LiteralPath (Join-Path $web 'robots.txt') $sale -Force
Copy-Item -LiteralPath (Join-Path $base 'app\online\instalar.php') (Join-Path $sale 'online') -Force
Copy-Item -LiteralPath (Join-Path $base 'SERVIDOR_ONLINE.md') $sale -Force
[IO.File]::WriteAllText((Join-Path $sale 'index.html'), '<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=juego/"><title>Pump It Up Extra</title><a href="juego/">Entrar al juego</a>', (New-Object Text.UTF8Encoding($false)))
# que no se haya colado nada de Andamiro ni datos de nadie
$malo = Get-ChildItem -LiteralPath $sale -Recurse -File -Force | Where-Object { $_.FullName -match '(?i)(traducido\.js|game_[^\\]*\.cfg|\.(aud|dat|not|pnz|sp2|bin)$|piu\.exe|piu10\.u9|\\datos\\|cpanel)' }
if ($malo) { $malo | ForEach-Object { Write-Host "  NO: $($_.FullName)" -ForegroundColor Red }; throw 'se colo algo que no va' }
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = "$sale.zip"
if (Test-Path -LiteralPath $zip) { (Get-Item -LiteralPath $zip).Delete() }
$z = [IO.Compression.ZipFile]::Open($zip, 'Create')
try {
    $largo = (Resolve-Path -LiteralPath $sale).Path.Length
    foreach ($f in Get-ChildItem -LiteralPath $sale -Recurse -File -Force) { [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, $f.FullName, $f.FullName.Substring($largo + 1).Replace('\', '/'), 'Optimal') }
} finally { $z.Dispose() }
Write-Host ("Listo: $zip ({0} MB, {1} archivos)" -f [math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 1), (Get-ChildItem -LiteralPath $sale -Recurse -File -Force).Count)
