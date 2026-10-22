#!/bin/sh
# Pump It Up Extra en el navegador (Linux y Mac). Antes, una vez: ./preparar.sh (con el disco). Necesita Node.js 18 o mas.
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Falta Node.js (https://nodejs.org)"; exit 1; }
exec node tools/servidor.mjs "$@"
