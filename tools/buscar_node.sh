#!/bin/sh
# Deja en NODO la ruta de node (Linux y Mac): el portatil de .herramientas, el instalado, o lo baja de nodejs.org
# (version oficial, con la suma comprobada) a .herramientas/node. No instala nada en el sistema.
# Se usa con ". tools/buscar_node.sh" desde jugar.sh y preparar.sh (parados en la carpeta del proyecto).
VERSION=v24.21.0
DEST=".herramientas/node"
if [ -x "$DEST/bin/node" ]; then NODO="$DEST/bin/node"; return 0 2>/dev/null || exit 0; fi
if command -v node >/dev/null 2>&1 && node -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)'; then NODO="node"; return 0 2>/dev/null || exit 0; fi

case "$(uname -s)" in Linux) SO=linux; EXT=tar.xz ;; Darwin) SO=darwin; EXT=tar.gz ;; *) echo "Sistema no reconocido: instala Node.js de https://nodejs.org"; exit 1 ;; esac
case "$(uname -m)" in x86_64|amd64) CPU=x64 ;; arm64|aarch64) CPU=arm64 ;; *) echo "Procesador no reconocido: instala Node.js de https://nodejs.org"; exit 1 ;; esac
NOMBRE="node-$VERSION-$SO-$CPU"
echo "Bajando Node.js $VERSION ($SO $CPU) de nodejs.org, una sola vez..."
mkdir -p .herramientas
TMP=".herramientas/.bajando-node"; rm -rf "$TMP"; mkdir -p "$TMP"
bajar() { if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"; else wget -q "$1" -O "$2"; fi; }
bajar "https://nodejs.org/dist/$VERSION/$NOMBRE.$EXT" "$TMP/$NOMBRE.$EXT" || { echo "No pude bajar Node.js (hay internet?)"; exit 1; }
bajar "https://nodejs.org/dist/$VERSION/SHASUMS256.txt" "$TMP/SHASUMS256.txt" || { echo "No pude bajar las sumas de Node.js"; exit 1; }
ESPERADA=$(grep " $NOMBRE.$EXT\$" "$TMP/SHASUMS256.txt" | cut -d' ' -f1)
if command -v sha256sum >/dev/null 2>&1; then SUMA=$(sha256sum "$TMP/$NOMBRE.$EXT" | cut -d' ' -f1); else SUMA=$(shasum -a 256 "$TMP/$NOMBRE.$EXT" | cut -d' ' -f1); fi
[ -n "$ESPERADA" ] && [ "$SUMA" = "$ESPERADA" ] || { echo "El Node.js bajado no coincide con la suma oficial: no lo uso."; exit 1; }
tar -xf "$TMP/$NOMBRE.$EXT" -C "$TMP" && mv "$TMP/$NOMBRE" "$DEST" && rm -rf "$TMP"
NODO="$DEST/bin/node"
echo "Node.js listo en $DEST"
