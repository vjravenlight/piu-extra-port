# Arma la build liviana: build\Pump It Up Extra - Edge\Pump It Up Extra.exe, con el juego adentro.
# El .exe es un programa chico de C# (tools\build_edge\PumpItUpExtra.cs) que abre una ventana con el motor de Edge
# que trae Windows (WebView2). Se compila con el csc de .NET Framework que ya esta en Windows.
# Usa las DLL del SDK de WebView2 de Documents\CLAUDE\_herramientas\webview2-sdk (o las baja: herramientas.ps1).
# Se puede volver a correr cuando cambia el port: no toca guardado\ (las opciones que haya grabado el juego).
# Antes (en una copia nueva): tools\preparar (PREPARAR.cmd), que deja el disco, los volcados y lo traducido.
# Uso: powershell -ExecutionPolicy Bypass -File armar_build_edge.ps1
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'herramientas.ps1')
foreach ($f in 'app\port\traducido.js', 'investigacion\volcados\codigo_0x20000.bin', 'extraido\Piu\Piu.exe') {
    if (-not (Test-Path (Join-Path $base $f))) { throw "Falta $f (correr antes PREPARAR.cmd con el disco)" }
}
$sdk = Conseguir $base 'webview2-sdk'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$destino = Join-Path $base 'build\Pump It Up Extra - Edge'
$juego = Join-Path $destino 'juego'

function Copiar($desde, $hasta) {
    & robocopy $desde $hasta /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy fallo copiando $desde (codigo $LASTEXITCODE)" }
}

foreach ($f in 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll') {
    if (-not (Test-Path (Join-Path $sdk $f))) { throw "Falta $f en $sdk" }
}
if (-not (Test-Path $csc)) { throw "No encuentro el compilador de C# en $csc" }
New-Item -ItemType Directory -Force $juego | Out-Null

Write-Host '1/5 compilando el programa...'
$exe = Join-Path $destino 'Pump It Up Extra.exe'
& $csc /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 "/out:$exe" `
    /reference:System.Windows.Forms.dll /reference:System.Drawing.dll `
    "/reference:$(Join-Path $sdk 'Microsoft.Web.WebView2.Core.dll')" "/reference:$(Join-Path $sdk 'Microsoft.Web.WebView2.WinForms.dll')" `
    (Join-Path $PSScriptRoot 'build_edge\PumpItUpExtra.cs')
if ($LASTEXITCODE -ne 0) { throw 'No compilo (ver los errores de arriba)' }

Write-Host '2/5 WebView2 (3 DLL de Microsoft + su instalador oficial) y LEEME...'
foreach ($f in 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll') { Copy-Item (Join-Path $sdk $f) $destino -Force }
# el instalador del motor (Evergreen Bootstrapper, firmado por Microsoft): el juego lo usa solo si la PC no tiene WebView2
New-Item -ItemType Directory -Force (Join-Path $destino 'motor-webview2') | Out-Null
Copy-Item (Join-Path $sdk 'MicrosoftEdgeWebview2Setup.exe') (Join-Path $destino 'motor-webview2') -Force
Copy-Item (Join-Path $PSScriptRoot 'build_edge\LEEME.md') $destino -Force

Write-Host '3/5 port (app\port, gl1.js y cifrados.js)...'
Copiar (Join-Path $base 'app\port') (Join-Path $juego 'port')
New-Item -ItemType Directory -Force (Join-Path $juego 'motor') | Out-Null
# gl1.js dibuja; cifrados.js lo usa el menu (online.js) para leer los graficos del disco (sin el, pantalla negra: 20/10)
foreach ($m in 'gl1.js', 'cifrados.js') { Copy-Item (Join-Path $base "app\motor\$m") (Join-Path $juego 'motor') -Force }

Write-Host '4/5 codigo y datos de Piu.exe...'
New-Item -ItemType Directory -Force (Join-Path $juego 'volcados') | Out-Null
foreach ($f in 'codigo_0x20000.bin', 'datos_0x130000.bin') { Copy-Item (Join-Path $base "investigacion\volcados\$f") (Join-Path $juego 'volcados') -Force }

Write-Host '5/5 disco del juego (400 MB, la primera vez tarda)...'
Copiar (Join-Path $base 'extraido\Piu') (Join-Path $juego 'disco')

$mb = [math]::Round(((Get-ChildItem $destino -Recurse -File | Measure-Object Length -Sum).Sum / 1MB))
Write-Host "Listo: $destino ($mb MB)"
