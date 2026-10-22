@echo off
rem Deja el juego listo a partir del disco de la cabina: poner el .cue y el .bin (o el .iso) en esta carpeta, o
rem arrastrar la imagen sobre este archivo. Saca el disco, carga Piu.exe, lo traduce y arma las listas.
title Pump It Up Extra - preparar
call "%~dp0tools\buscar_node.cmd" || (pause & exit /b 1)
"%NODO%" "%~dp0tools\preparar\preparar.mjs" %1
pause
