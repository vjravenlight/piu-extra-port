@echo off
rem Arma todas las versiones (Windows, Android, Linux, Mac) y la carpeta para compartir, en build\. Antes: PREPARAR.cmd.
rem Lo que falte (WebView2, Electron, Java, Gradle) se baja solo la primera vez. Para la APK hay que aceptar las
rem licencias del SDK de Android: este archivo lo pregunta.
title Pump It Up Extra - armar versiones
set "PS=powershell -NoProfile -ExecutionPolicy Bypass -File"
%PS% "%~dp0tools\armar_build_edge.ps1" || goto fallo
set "LIC="
set "YA=0"
if exist "%~dp0..\..\_herramientas\android-sdk\licenses\android-sdk-license" set "YA=1"
if exist "%~dp0.herramientas\android-sdk\licenses\android-sdk-license" set "YA=1"
if "%YA%"=="0" (
  echo.
  echo Para la APK hay que aceptar las licencias del SDK de Android: https://developer.android.com/studio/terms
  set /p "LIC=Las aceptas? (s/n): "
)
if /i "%LIC%"=="s" (%PS% "%~dp0tools\build_android\armar_apk_gecko.ps1" -AceptarLicenciasAndroid || goto fallo) else (%PS% "%~dp0tools\build_android\armar_apk_gecko.ps1" || echo Sin APK.)
%PS% "%~dp0tools\armar_multiplataforma.ps1" || goto fallo
%PS% "%~dp0tools\armar_para_compartir.ps1" || goto fallo
echo.
echo Listo: build\Pump It Up Extra - para compartir
pause
exit /b 0
:fallo
echo.
echo Algo fallo (mirar arriba).
pause
exit /b 1
