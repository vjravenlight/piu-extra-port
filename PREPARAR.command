#!/bin/sh
# Mac: doble clic para preparar el juego con el disco que este en esta carpeta
cd "$(dirname "$0")" || exit 1
sh preparar.sh
echo
printf "Enter para cerrar. "; read -r _
