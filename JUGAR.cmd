@echo off
rem Abre Pump It Up Extra en el navegador de esta PC (local). Antes, una vez: PREPARAR.cmd (con el disco).
title Pump It Up Extra
call "%~dp0tools\buscar_node.cmd" || (pause & exit /b 1)
"%NODO%" "%~dp0tools\servidor.mjs"
pause
