#!/bin/sh
# Pump It Up Extra como servidor (Linux y Mac): para jugar desde los aparatos de la misma wifi (y, si se elige, por
# internet). Hace tres preguntas y muestra las direcciones. Si no hay Node.js, lo baja solo (no instala nada).
cd "$(dirname "$0")" || exit 1
. tools/buscar_node.sh
exec "$NODO" tools/servidor.mjs --preguntar "$@"
