@echo off
rem Deja en NODO la ruta de node.exe: el de R.A.V.E.N (la PC de Charles), el portatil de .herramientas, el instalado,
rem o lo baja (tools\conseguir_node.ps1). Lo usan JUGAR.cmd y PREPARAR.cmd.
set "NODO=%~dp0..\..\..\4_R.A.V.E.N\raven\runtime\node.exe"
if exist "%NODO%" exit /b 0
set "NODO=%~dp0..\.herramientas\node\node.exe"
if exist "%NODO%" exit /b 0
for /f "delims=" %%n in ('where node 2^>nul') do (set "NODO=%%n" & exit /b 0)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0conseguir_node.ps1"
set "NODO=%~dp0..\.herramientas\node\node.exe"
if exist "%NODO%" exit /b 0
echo No pude conseguir Node.js. Instalalo de https://nodejs.org y volve a probar.
exit /b 1
