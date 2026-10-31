# Todas las capturas de promocion, una tras otra (cada una con su Chromium sin ventana y sin sonido; ver capturas.ps1).
# Deja el avance en promo\capturas\capturas_todas.log.
param([string[]]$Solo = @('demo', 'ranking', 'celu', 'torneo'))
$Solo = @($Solo | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$aqui = $PSScriptRoot
$base = Split-Path -Parent (Split-Path -Parent $aqui)
$log = Join-Path $base 'promo\capturas\capturas_todas.log'
"inicio $(Get-Date -Format 'HH:mm:ss')" | Set-Content $log -Encoding UTF8
$conDemo = '{"online":{"nick":"RAVENLIGHT","intro":false,"demo":true,"demoSonido":false,"panelMods":"no","desbloqueadoDeFabrica":true,"desbloqueado":true}}'
function Correr($titulo, $params) { if ($Solo -notcontains $titulo) { return }; $ini = Get-Date; & (Join-Path $aqui 'capturas.ps1') @params | Out-Null; "$titulo listo ($([math]::Round(((Get-Date) - $ini).TotalMinutes, 1)) min)" | Add-Content $log -Encoding UTF8 }
# 1. la demo y la seleccion, con el ranking de verdad (el TOP 3 de la seleccion)
$env:PIU_SALON = 'ravenlight'
Correr 'demo' @{ Nombre = 'demo'; Segundos = 560; Opciones = $conDemo }
# 2. el ranking de verdad
Correr 'ranking' @{ Nombre = 'ranking'; Segundos = 300 }
# 3. el celular en vertical (412 x 860), con la demo
Correr 'celu' @{ Nombre = 'celu'; Segundos = 560; Ancho = 412; Alto = 860; Pagina = '/port/?sinpantallacompleta&tactil'; Recorrido = (Join-Path $aqui 'recorrido_demo.js'); Opciones = $conDemo }
# 4. el torneo, con jugadores falsos en un salon local aparte
$env:PIU_SALON = $null
$datos = Join-Path $base 'promo\capturas\salon_torneo'
if (Test-Path $datos) { Get-ChildItem $datos -File | ForEach-Object { $_.Delete() } }
New-Item -ItemType Directory -Force $datos | Out-Null
$env:PIU_ONLINE_DATOS = $datos
$node = Join-Path $base '..\..\4_R.A.V.E.N\raven\runtime\node.exe'
if ($Solo -contains 'torneo') {
    $script = '"' + (Join-Path $aqui 'bot_torneo_promo.mjs') + '"'
    $bot = Start-Process $node -ArgumentList $script, 'http://127.0.0.1:8799/online/api.php' -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $base 'promo\capturas\bot_torneo.log') -RedirectStandardError (Join-Path $base 'promo\capturas\bot_torneo_error.log')
    Correr 'torneo' @{ Nombre = 'torneo'; Segundos = 420; Pagina = '/port/?sinpantallacompleta&online&nick=Ana' }
    try { $bot.Kill() } catch { }
}
"FIN $(Get-Date -Format 'HH:mm:ss')" | Add-Content $log -Encoding UTF8
