#!/bin/sh
# Mac: doble clic para abrir el juego como servidor (misma wifi o internet). Dejar la Terminal abierta.
cd "$(dirname "$0")" || exit 1
sh servidor.sh
