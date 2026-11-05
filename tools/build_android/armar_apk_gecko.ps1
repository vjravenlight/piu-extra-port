# Pump It Up Extra para Android con GeckoView (el motor de Firefox): build\Pump It Up Extra - Android\PumpItUpExtra.apk
# Desde el 21/10 reemplaza a armar_apk.ps1 (WebView): la WebView de Android no da memoria compartida y el juego quedaba
# en negro. Usa Gradle 9.7.1 y el plugin de Android 9.3.3; todo lo que bajan (plugin, GeckoView, androidx, el SDK de
# Android 17) queda en Documents\CLAUDE\_herramientas (gradle-home y android-sdk), nada en la carpeta del usuario.
# En una copia de GitHub, Java, Gradle y el SDK se bajan a .herramientas\ (tools\herramientas.ps1).
# Antes: correr tools\armar_build_edge.ps1 (deja build\Pump It Up Extra - Edge\juego al dia: son los assets).
# La firma es la de firma\ (la misma de la APK anterior: se instala encima). Si no hay (copia nueva), se crea una propia
# con una clave al azar guardada con DPAPI (solo la puede leer este usuario de Windows): no se comparte nunca.
# -SinDisco: PumpItUpExtra-sin-disco.apk, con la build sin disco (armar_build_edge.ps1 -SinDisco): sin nada de
#   Andamiro, la primera vez pide el disco del jugador.
# -Full (03/11): PumpItUpExtra-FULL.apk, la completa como OTRA app ("Pump It Up FULL", net.ravenlight.piu.full): se instala
#   al lado de la de siempre, con su propio icono y sus propios datos. Solo para Charles: no se reparte.
# -Bits32 (05/11): para Android de 32 bits (armeabi-v7a, como varios Galaxy A13, que dicen "no es compatible" con la otra). La misma
#   app con otro motor adentro: sale con -32bits en el nombre. Se puede sumar a -SinDisco.
# Uso: powershell -ExecutionPolicy Bypass -File armar_apk_gecko.ps1 [-AceptarLicenciasAndroid] [-SinDisco] [-Full] [-Bits32]
param([switch]$AceptarLicenciasAndroid, [switch]$SinDisco, [switch]$Full, [switch]$Bits32)
$ErrorActionPreference = 'Continue'
$aqui = $PSScriptRoot
$base = Split-Path -Parent (Split-Path -Parent $aqui)
. (Join-Path $base 'tools\herramientas.ps1')
try {
    $env:JAVA_HOME = Conseguir $base 'jdk'
    $gradle = Join-Path (Conseguir $base 'gradle-9.7.1') 'bin\gradle.bat'
    $env:GRADLE_USER_HOME = Conseguir $base 'gradle-home'
    $env:ANDROID_HOME = Conseguir $base 'android-sdk' -AceptarLicenciasAndroid:$AceptarLicenciasAndroid
} catch { Write-Host "FALLO: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$proyecto = Join-Path $aqui 'gecko'
$juego = Join-Path $base $(if ($SinDisco) { 'build\Pump It Up Extra - Edge (sin disco)\juego' } else { 'build\Pump It Up Extra - Edge\juego' })
if (-not (Test-Path (Join-Path $juego 'port\index.html'))) { Write-Host "FALLO: falta $juego (correr antes tools\armar_build_edge.ps1$(if ($SinDisco) { ' -SinDisco' }))" -ForegroundColor Red; exit 1 }
# donde esta el SDK (Gradle lo lee de local.properties, con las barras escapadas)
Set-Content -Path (Join-Path $proyecto 'local.properties') -Value ('sdk.dir=' + $env:ANDROID_HOME.Replace('\', '\\').Replace(':', '\:')) -Encoding Ascii

$firma = Join-Path $aqui 'firma'
$cl = Join-Path $firma 'clave.dpapi'
if (-not (Test-Path (Join-Path $firma 'piu.jks'))) {
    Write-Host 'No hay firma: creo una propia en tools\build_android\firma (guardala: sin ella no se puede actualizar la APK instalada)'
    New-Item -ItemType Directory -Force $firma | Out-Null
    $clave = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore (Join-Path $firma 'piu.jks') -storetype PKCS12 -alias piu -keyalg RSA -keysize 2048 -validity 10000 -storepass $clave -keypass $clave -dname 'CN=Pump It Up Extra port'
    if ($LASTEXITCODE -ne 0) { Write-Host 'FALLO: keytool' -ForegroundColor Red; exit 1 }
    ConvertTo-SecureString $clave -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $cl
}
$s = Get-Content $cl | ConvertTo-SecureString
$env:PIU_KS = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
# (la carpeta del juego va por variable: Gradle la lee como la propiedad 'juego'; una ruta con parentesis por la linea
# de comandos de gradle.bat se rompe)
$env:ORG_GRADLE_PROJECT_juego = $juego
if ($Full) { $env:ORG_GRADLE_PROJECT_idApp = 'net.ravenlight.piu.full'; $env:ORG_GRADLE_PROJECT_nombreApp = 'Pump It Up FULL' }
if ($Bits32) { $env:ORG_GRADLE_PROJECT_abi = 'armeabi-v7a' }
& $gradle -p $proyecto assembleRelease --no-daemon --console=plain
$codigo = $LASTEXITCODE
Remove-Item Env:\ORG_GRADLE_PROJECT_juego
if ($Bits32) { Remove-Item Env:\ORG_GRADLE_PROJECT_abi }
if ($Full) { Remove-Item Env:\ORG_GRADLE_PROJECT_idApp, Env:\ORG_GRADLE_PROJECT_nombreApp }
Remove-Item Env:\PIU_KS
if ($codigo -ne 0) { Write-Host 'FALLO: gradle' -ForegroundColor Red; exit 1 }

$sale = Join-Path $proyecto 'build\outputs\apk\release\PumpItUpExtra-release.apk'
if (-not (Test-Path $sale)) { $sale = (Get-ChildItem (Join-Path $proyecto 'build\outputs\apk\release') -Filter *.apk)[0].FullName }
$destino = Join-Path $base 'build\Pump It Up Extra - Android'
New-Item -ItemType Directory -Force $destino | Out-Null
$nombre = $(if ($Full) { 'PumpItUpExtra-FULL' } elseif ($SinDisco) { 'PumpItUpExtra-sin-disco' } else { 'PumpItUpExtra' }) + $(if ($Bits32) { '-32bits' } else { '' }) + '.apk'
Copy-Item $sale (Join-Path $destino $nombre) -Force
$mb = [math]::Round((Get-Item (Join-Path $destino $nombre)).Length / 1MB)
Write-Host "LISTO: $destino\$nombre ($mb MB)" -ForegroundColor Green
