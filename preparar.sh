#!/bin/sh
# Deja el juego listo a partir del disco de la cabina (Linux y Mac). Uso: ./preparar.sh [imagen .cue/.bin/.iso]
# Sin imagen, busca una en esta carpeta. Necesita Node.js 18 o mas.
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Falta Node.js (https://nodejs.org)"; exit 1; }
exec node tools/preparar/preparar.mjs "$@"
