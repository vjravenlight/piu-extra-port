# Las herramientas para armar las versiones (Windows, Android, Linux y Mac). Se usa con ". herramientas.ps1" desde los
# scripts armar_*.ps1. Primero busca la carpeta _herramientas de Charles (dos carpetas arriba del proyecto, la de
# siempre); si no esta (una copia bajada de GitHub), usa .herramientas\ adentro del proyecto y baja ahi lo que falte,
# siempre de su sitio oficial y comprobando la suma o la firma cuando se puede. Nada va a la carpeta del usuario.
#   Conseguir $base 'webview2-sdk'    -> las 3 DLL de WebView2 + su instalador (build de Windows)
#   Conseguir $base 'electron-44.5.1' -> los zips de Electron para Linux y Mac
#   Conseguir $base 'jdk' | 'gradle-9.7.1' | 'android-sdk' | 'gradle-home' -> para la APK
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem

function CarpetaHerramientas([string]$base) {
    $deCharles = Join-Path $base '..\..\_herramientas'
    if (Test-Path (Join-Path $deCharles 'webview2-sdk')) { return (Resolve-Path $deCharles).Path }
    $propia = Join-Path $base '.herramientas'
    New-Item -ItemType Directory -Force $propia | Out-Null
    return (Resolve-Path $propia).Path
}

function Bajar([string]$url, [string]$archivo) {
    Write-Host "  bajando $url"
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $archivo -UseBasicParsing
}
function Suma([string]$archivo) { (Get-FileHash $archivo -Algorithm SHA256).Hash.ToLower() }
# cada descarga a una carpeta nueva y vacia; se descomprime ahi y despues se mueve lo que sirve
function CarpetaNueva([string]$h) { $d = Join-Path $h ('.bajando-' + [guid]::NewGuid().ToString('N').Substring(0, 8)); New-Item -ItemType Directory $d | Out-Null; $d }

# Electron 44.5.1: sumas de SHASUMS256.txt de la version oficial (github.com/electron/electron/releases/tag/v44.5.1)
$ELECTRON = @{
    'electron-v44.5.1-linux-x64.zip'    = '5bcd217611d6843ececd6c9e9c1fcd1da3ab066c43d8b1a9e4b44689a1fba6f5'
    'electron-v44.5.1-darwin-arm64.zip' = '1d75703019bb16461ae65f3081d7e6f5c0b11e901d0ccb5c343bcf7bcdd6435c'
    'electron-v44.5.1-darwin-x64.zip'   = 'e567d13833d0e161d7749727355b98643461df3395b537cfa7bdddf8a8bfedff'
}
# el paquete de NuGet de WebView2 que se probo (08/10/2026)
$WEBVIEW2 = @{ version = '1.0.4258.31'; suma = '56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9' }
# licencias del SDK de Android (las mismas que deja sdkmanager --licenses al aceptarlas)
$LICENCIAS_ANDROID = @('24333f8a63b6825ea9c5514f83c2829b004d1fee', 'd56f5187479451eabf01fb78af6dfcb131a6481e', '8933bad161af4178b1185d1a37fbf41ea5269c55')

function Conseguir([string]$base, [string]$nombre, [switch]$AceptarLicenciasAndroid) {
    $h = CarpetaHerramientas $base
    $dest = Join-Path $h $nombre
    switch ($nombre) {
        'webview2-sdk' {
            $faltan = 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll', 'MicrosoftEdgeWebview2Setup.exe' | Where-Object { -not (Test-Path (Join-Path $dest $_)) }
            if (-not $faltan) { return $dest }
            Write-Host 'WebView2 (Microsoft): falta, lo bajo...'
            $tmp = CarpetaNueva $h
            $pk = Join-Path $tmp 'webview2.nupkg'
            Bajar "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$($WEBVIEW2.version)" $pk
            if ((Suma $pk) -ne $WEBVIEW2.suma) { throw 'el paquete de WebView2 bajado no es el esperado (suma distinta)' }
            [IO.Compression.ZipFile]::ExtractToDirectory($pk, (Join-Path $tmp 'x'))
            New-Item -ItemType Directory -Force $dest | Out-Null
            Copy-Item (Join-Path $tmp 'x\lib\net462\Microsoft.Web.WebView2.Core.dll'), (Join-Path $tmp 'x\lib\net462\Microsoft.Web.WebView2.WinForms.dll'), (Join-Path $tmp 'x\runtimes\win-x64\native\WebView2Loader.dll') $dest -Force
            # el instalador del motor (Evergreen Bootstrapper): Microsoft lo actualiza, asi que se comprueba su firma
            $inst = Join-Path $tmp 'MicrosoftEdgeWebview2Setup.exe'
            Bajar 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' $inst
            $f = Get-AuthenticodeSignature $inst
            if ($f.Status -ne 'Valid' -or $f.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'el instalador de WebView2 bajado no tiene la firma de Microsoft' }
            Copy-Item $inst $dest -Force
            (Get-Item $tmp).Delete($true)
            return $dest
        }
        'electron-44.5.1' {
            New-Item -ItemType Directory -Force $dest | Out-Null
            foreach ($z in $ELECTRON.Keys) {
                $f = Join-Path $dest $z
                if ((Test-Path $f) -and (Suma $f) -eq $ELECTRON[$z]) { continue }
                Write-Host "Electron: falta $z, lo bajo..."
                $tmp = CarpetaNueva $h
                Bajar "https://github.com/electron/electron/releases/download/v44.5.1/$z" (Join-Path $tmp $z)
                if ((Suma (Join-Path $tmp $z)) -ne $ELECTRON[$z]) { throw "$z bajado no coincide con la suma oficial" }
                Move-Item (Join-Path $tmp $z) $f -Force
                (Get-Item $tmp).Delete($true)
            }
            return $dest
        }
        'jdk' {
            $kit = Join-Path $h 'android-kit\jdk'
            $hay = Get-ChildItem $kit -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
            if ($hay) { return $hay.FullName }
            Write-Host 'Java 21 (Eclipse Temurin): falta, lo bajo...'
            $tmp = CarpetaNueva $h
            $zip = Join-Path $tmp 'jdk.zip'
            Bajar 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse' $zip
            New-Item -ItemType Directory -Force $kit | Out-Null
            [IO.Compression.ZipFile]::ExtractToDirectory($zip, $kit)
            (Get-Item $tmp).Delete($true)
            return (Get-ChildItem $kit -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1).FullName
        }
        'gradle-9.7.1' {
            if (Test-Path (Join-Path $dest 'bin\gradle.bat')) { return $dest }
            Write-Host 'Gradle 9.7.1: falta, lo bajo...'
            $tmp = CarpetaNueva $h
            $zip = Join-Path $tmp 'gradle.zip'
            Bajar 'https://services.gradle.org/distributions/gradle-9.7.1-bin.zip' $zip
            Bajar 'https://services.gradle.org/distributions/gradle-9.7.1-bin.zip.sha256' (Join-Path $tmp 'suma.txt')
            if ((Suma $zip) -ne (Get-Content (Join-Path $tmp 'suma.txt') -Raw).Trim().ToLower()) { throw 'Gradle bajado no coincide con su suma oficial' }
            [IO.Compression.ZipFile]::ExtractToDirectory($zip, $h)
            (Get-Item $tmp).Delete($true)
            return $dest
        }
        'android-sdk' {
            # el plugin de Android baja solo lo que necesita (la plataforma 37.1, build-tools) si las licencias estan aceptadas
            $lic = Join-Path $dest 'licenses\android-sdk-license'
            if (Test-Path $lic) { return $dest }
            if (-not $AceptarLicenciasAndroid) {
                throw ("Para armar la APK hay que aceptar las licencias del SDK de Android (https://developer.android.com/studio/terms). " +
                    "Si estas de acuerdo, volve a correrlo con -AceptarLicenciasAndroid.")
            }
            New-Item -ItemType Directory -Force (Split-Path $lic) | Out-Null
            Set-Content -Path $lic -Value ("`n" + ($LICENCIAS_ANDROID -join "`n")) -Encoding Ascii
            return $dest
        }
        'gradle-home' { New-Item -ItemType Directory -Force $dest | Out-Null; return $dest }
        default { throw "no se de donde sacar $nombre" }
    }
}
