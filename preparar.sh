#!/bin/sh
# Deja el juego listo a partir del disco de la cabina (Linux y Mac). Uso: sh preparar.sh [imagen .cue/.bin/.iso]
# Sin imagen, busca una en esta carpeta. Si no hay Node.js, lo baja solo (no instala nada).
cd "$(dirname "$0")" || exit 1
. tools/buscar_node.sh
exec "$NODO" tools/preparar/preparar.mjs "$@"
