@echo off
rem Abre Pump It Up Extra como servidor: para jugar desde los celulares y compus de la misma wifi (y, si se elige, por
rem internet). Hace tres preguntas (puerto, salon online, internet) y muestra las direcciones para entrar.
title Pump It Up Extra - servidor
call "%~dp0tools\buscar_node.cmd" || (pause & exit /b 1)
"%NODO%" "%~dp0tools\servidor.mjs" --preguntar
pause
