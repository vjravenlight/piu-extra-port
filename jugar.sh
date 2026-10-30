#!/bin/sh
# Pump It Up Extra en el navegador (Linux y Mac). Si no hay Node.js, lo baja solo (no instala nada).
# Con el disco preparado (./preparar.sh) arranca directo; si no, el navegador pide el disco la primera vez.
cd "$(dirname "$0")" || exit 1
. tools/buscar_node.sh
exec "$NODO" tools/servidor.mjs "$@"
