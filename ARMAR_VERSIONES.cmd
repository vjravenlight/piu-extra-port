@echo off
rem Arma las versiones para compartir (Windows, Android, Linux, Mac) en build\:
rem - SIN DISCO (siempre): no traen nada de Andamiro; la primera vez cada jugador elige su disco.
rem   -> build\Pump It Up Extra - para compartir (sin disco)
rem - COMPLETAS (solo si ya se corrio PREPARAR.cmd con el disco): con el juego adentro.
rem   -> build\Pump It Up Extra - para compartir
rem Lo que falte (WebView2, Electron, Java, Gradle) se baja solo la primera vez. Para la APK hay que aceptar las
rem licencias del SDK de Android: este archivo lo pregunta.
title Pump It Up Extra - armar versiones
set "PS=powershell -NoProfile -ExecutionPolicy Bypass -File"
set "LIC="
set "YA=0"
if exist "%~dp0..\..\_herramientas\android-sdk\licenses\android-sdk-license" set "YA=1"
if exist "%~dp0.herramientas\android-sdk\licenses\android-sdk-license" set "YA=1"
if "%YA%"=="0" (
  echo.
  echo Para la APK hay que aceptar las licencias del SDK de Android: https://developer.android.com/studio/terms
  set /p "LIC=Las aceptas? (s/n): "
)
set "APK=%PS% "%~dp0tools\build_android\armar_apk_gecko.ps1""
if /i "%LIC%"=="s" set "APK=%APK% -AceptarLicenciasAndroid"

echo.
echo === Versiones SIN DISCO ===
%PS% "%~dp0tools\armar_build_edge.ps1" -SinDisco || goto fallo
%APK% -SinDisco || echo Sin APK.
%PS% "%~dp0tools\armar_multiplataforma.ps1" -SinDisco || goto fallo
%PS% "%~dp0tools\armar_para_compartir.ps1" -SinDisco || goto fallo

if not exist "%~dp0extraido\Piu\Piu.exe" goto listo
echo.
echo === Versiones COMPLETAS (con el disco que preparaste) ===
%PS% "%~dp0tools\armar_build_edge.ps1" || goto fallo
%APK% || echo Sin APK.
%PS% "%~dp0tools\armar_multiplataforma.ps1" || goto fallo
%PS% "%~dp0tools\armar_para_compartir.ps1" || goto fallo

:listo
echo.
echo Listo: las carpetas "Pump It Up Extra - para compartir" en build\
pause
exit /b 0
:fallo
echo.
echo Algo fallo (mirar arriba).
pause
exit /b 1
