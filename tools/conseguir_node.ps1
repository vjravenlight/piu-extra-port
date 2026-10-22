# Baja Node.js portatil (oficial, nodejs.org) a .herramientas\node, para las PC que no lo tienen. Lo usa buscar_node.cmd.
# Comprueba la suma con el SHASUMS256.txt oficial de esa version. No instala nada ni toca la carpeta del usuario.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$version = 'v24.21.0'
$base = Split-Path -Parent $PSScriptRoot
$h = Join-Path $base '.herramientas'
$dest = Join-Path $h 'node'
if (Test-Path (Join-Path $dest 'node.exe')) { exit 0 }
$nombre = "node-$version-win-x64.zip"
$tmp = Join-Path $h ('.bajando-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $tmp | Out-Null
Write-Host "Bajando Node.js $version (nodejs.org)..."
Invoke-WebRequest -Uri "https://nodejs.org/dist/$version/$nombre" -OutFile (Join-Path $tmp $nombre) -UseBasicParsing
$sumas = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$version/SHASUMS256.txt" -UseBasicParsing).Content
$esperada = ($sumas -split "`n" | Where-Object { $_ -match [regex]::Escape($nombre) + '$' } | Select-Object -First 1) -replace '\s.*$', ''
if ((Get-FileHash (Join-Path $tmp $nombre) -Algorithm SHA256).Hash.ToLower() -ne $esperada.Trim().ToLower()) { throw 'el Node bajado no coincide con la suma oficial' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $tmp $nombre), $tmp)
Move-Item (Join-Path $tmp "node-$version-win-x64") $dest
(Get-Item $tmp).Delete($true)
Write-Host "Node listo en $dest"
