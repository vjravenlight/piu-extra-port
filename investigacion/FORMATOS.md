# Formatos del disco de Pump It Up Extra (arcade 2001)

Lo que se sabe de cada formato, para rehacer el juego en PC (camino B, elegido el 04/10/2026).
Estado: ✅ resuelto · 🟡 parcial · ❌ sin resolver.

## La cabina (MK3)

- PC con Pentium II de 333/366 MHz, 64 MB de RAM y una **3dfx Voodoo Banshee soldada** en la placa. `SGRAM.COM` es la BIOS de video de esa Banshee.
- Corre en DOS con DOS4GW (`start.bat` → `piu.exe`). Dibuja con Mesa 3.x sobre Glide.
- Placa de entradas: pads, botones TEST, SERVICE y CLEAR, y monedero. Tiene una **traba de seguridad** (lockchip) en una plaquita aparte. Para el camino B no hace falta.
- Ajustes guardados en una EEPROM de la placa.
- `PIU.BIN` (560 bytes): son 35 filas de 16 bytes, cada una arranca con `FF 20 FF 08`, con valores que suben y bytes repetidos de a pares. Parece una tabla para la placa o la traba. 🟡 Sin uso conocido; para el camino B no hace falta.

## ✅ Música: `Piu\Audio\*.AUD` → MP3

**Cómo está cifrada** (roto el 04/10/2026 por estadística, sin desensamblar):
1. Cada byte tiene **los bits espejados** (el bit 0 pasa a ser el 7, y así).
2. Encima va un **XOR con una llave de 1024 bytes**, que es la misma para todos los archivos. Cada archivo empieza a leer la llave desde otra posición (el "corrimiento").

Para descifrar: `mp3[i] = espejo(aud[i]) XOR llave[(i + corrimiento) mod 1024]`.

- La llave está en `tools\llave_audio_1024.bin`. Se sacó completa de `05.AUD`, cuyos 3.837 cuadros encadenan sin una falla.
- El corrimiento no se guarda en ningún lado conocido: `tools\descifrar_audio.ps1` lo busca probando las 1024 posiciones hasta encontrar 6 cuadros MP3 seguidos.
- Los primeros 4 bytes de cada archivo no son MP3: son un encabezado propio, todavía sin descifrar. En algunos archivos el MP3 arranca en el byte 76 o 77, y en las `D…` en cualquier lugar. El script recorta desde el primer cuadro.
- Resultado: los 202 archivos dan MP3 de 128 kbps y 44,1 kHz, con cadena de cuadros del 100 %. Están en `descifrado\musica\`.

**Qué es cada grupo:**
| Archivos | Qué son | Duración |
|---|---|---|
| `04`–`72` | las canciones (número = el de `game.cfg`) | ~1:30 a 1:50 (las mezclas 27–32, 36, 52, 53 y 57: ~2:30 a 2:40) |
| `D04`–`D72` | vistas previas del menú | ~10 s |
| `R04`–`R72` (faltan algunas) | otra versión, más corta; no se sabe para qué modo | ~1:15 a 1:35 (mezclas ~2:10) |
| `01`, `01'`, `02`, `03` | apertura, ayuda y otros sonidos del sistema | 7 a 36 s |
| `80`, `81` | efectos | 5–10 s |

## ✅ Pasos: `Piu\STEP\*.NOT` (345 archivos, dos formatos) → `descifrado\pasos\*.json`

**Cómo se leen** (confirmado en `Piu.exe` con radare2, 04/10/2026):
- **0x220F6** es la carga: arma `STEP\%s`, prueba el formato A en **0x21E70**, y si no es A lee el B.
- **0x3689C** es el descifrador del B: `byte ^= k; k += 0x95`, con `k` arrancando en `0xD2`.
- Internamente cada fila son 14 caracteres: 10 paneles más 3 columnas extra.
- Columna 0 = el bit más alto. Orden asumido de los paneles: ↙ ↖ ● ↗ ↘, el pad izquierdo y después el derecho. Se deduce de los saltos simétricos; falta confirmarlo jugando.

**El conversor** (`tools\convertir_pasos.ps1`) deja un `.json` por tabla y `resumen.csv`. Cada JSON trae:
- `notas` [fila, columna] y `largas` [columna, desde, hasta];
- `extras` [fila, columna 10–12], solo en el formato B;
- `bpms`, `cambiosBpm`, `valores` (el primero probablemente sea el desfase), `filasPorPulso` y `tipo`.
- **Tipo:** doble = DB y XD. Simple: si los dos lados son iguales queda uno; si son distintos (las variantes `_2`, con el lado derecho espejado) se guardan los dos y va `ladosDistintos: true`.
- **Resultado:** 76 dobles, 197 simples y 72 simples con dos lados. En 320 de las 345, la duración de los pasos da entre el 85 % y el 102 % del MP3.
- **Excepciones:** las mezclas 28, 29 y 57 cambian de BPM, y la cuenta todavía usa un solo BPM. 25, 33 y 34 terminan antes que la música. `19_N1` está vacía en el original (3 notas; no se usa).

Nombres: `NN_` más dificultad: `n` Normal, `h` Hard, `x` Crazy, `db` Double, `xd` Crazy Double; con `1` o `2` según la variante. Los de las mezclas son `NN_1`, `NN_2` y `NN_DB`.

### ✅ Formato A: empieza con `pump 5.0` (150 archivos, 35 canciones, a la vista)

Tamaño = 216 + 6 × N. Cabecera de 216 bytes (0xD8):
| Offset | Qué es |
|---|---|
| 0x00 | texto `pump 5.0` |
| 0x0A | u16 **N = cantidad de filas** |
| 0x10 | 10 float: **BPM** de cada tramo; los que no se usan valen 120 (normal: BPM, BPM, 120…; la mezcla 29: 100, 115, 115) |
| 0x38 | 10 int; el primero vale 0, 10 o 15. Probablemente el desfase entre la música y los pasos (sin confirmar) |
| 0x60 | 10 int: dónde cambia el BPM (en la 29: 8220, 8220; probablemente milisegundos, sin confirmar) |
| 0x88 | int: **filas por pulso** (2 = corcheas, 4 = semicorcheas) |
| 0x90 | int: número de canción |

Después vienen **3 tablas de N valores u16**:
1. **Notas.** 10 bits por fila, con el signo extendido desde el bit 9 (por eso aparece `FE10`). Según el código del juego, **columna c = bit (9 − c)**: los bits 9–5 son el pad izquierdo y los bits 4–0 el derecho. En las simples `_1` los dos lados son iguales; en las `_2` el derecho es la versión espejada para el otro pad; en las dobles son 10 paneles distintos.
2. **Comienzo de flecha larga** (la máscara del panel). Mientras dura, la tabla 1 tiene el panel prendido en cada fila.
3. **Fin de flecha larga.**

Comprobación: N ÷ filas por pulso × 60 ÷ BPM da 97,3 s para la 04, y su MP3 dura 98,7 s.

### ✅ Formato B: sin el texto (195 archivos, 41 canciones, cifrado simple)

Tamaño = 0x88 + 4 × N. La cabecera está a la vista y el juego la copia a las mismas variables que la del A:
| Offset | Qué es |
|---|---|
| 0x00 | int **N = cantidad de eventos** (no de filas) |
| 0x08 | 4 float: BPM de cada tramo |
| 0x18 | 4 int: los mismos "valores" que el 0x38 del A (¿desfase?) |
| 0x28 | 4 int: dónde cambia el BPM |
| 0x38 | int: **filas por pulso** |
| 0x40 | int: número de canción **de la versión en que se hizo la tabla** (el `12_X4` dice 38 y "Twist - Banya") |
| 0x44 | a veces el nombre del tema, en texto |

Datos desde 0x88: N eventos de 4 bytes, descifrados con `byte ^= k; k += 0x95` (`k` arranca en `0xD2`). Cada evento = **u16 fila + u16 máscara**, leída desde el bit 15:
- columnas 0–9: paneles;
- columnas 10–12: extras que marcan pulsos y compases (`0x0008` en cada pulso, `0x0038` en cada compás). Probablemente sean las luces de la cabina o los destellos.

No hay flechas largas en el B.

## ✅ Paquetes de gráficos: `Piu\Bga\*.DAT` y `empty\*.dat` → `descifrado\graficos\`

Son **dos formatos**, como avisó Charles: uno de Andamiro y otro de F2 System. `tools\extraer_paquetes.ps1` saca los dos: 181 paquetes, 13.515 archivos, 384 MB, y los 6.499 PNG con su firma válida.

**Andamiro (`RES`, 119 paquetes):** las canciones que venían de versiones anteriores, las pantallas, las flechas y las fuentes.
- Cabecera: `RES\0`, u32 versión 2, u32 cantidad, u32 tamaño de datos y 8 bytes sin cifrar.
- Índice desde 0x18: 28 bytes por archivo (nombre[16], u32 tamaño, u32 posición desde el comienzo de los datos, u32 control).
- Datos desde 0x18 + cantidad × 28.
- El índice y **cada archivo por separado** van cifrados como los pasos B: `XOR k`, con `k` arrancando en 0xD2 y sumando 0x95 por byte. La llave vuelve a empezar en cada archivo.
- Contenido: PNG; `.spr` y `.sp2` (texto: `TYPE TILE / NUM n / T archivo.tga x y ancho alto …`, los recortes que forman cada cuadro; los `.tga` se empaquetaron como `.png`); `.bga` (binario, empieza con `BGA\0`: el **guion de la animación**).
- `arrow.dat` trae los skins de flechas (JOCKEY, ICE, PINE, ULTRA, DUNG, UFO, SNOW, OCTO, GODORI).

**F2 System (62 paquetes, sin cifrar):** los fondos de las canciones que estrenó Extra (04, 05, 06, 07, 09, 11, 13…) y la apertura.
- Cabecera: nombre de relleno ("df", "adf"…), u32 cantidad en 0x34, firma de 20 bytes en 0x38 (``fa!^`;_}<= ~..~``).
- Índice desde 0x4C: 40 bytes por archivo (nombre[32], u32 posición absoluta, u32 tamaño).
- Contenido: PNG y BMP; `.ifl` (texto: lista de cuadros, como en 3D Studio); `.tc` (texturas o animaciones de F2, binario); `.vsl` (**guion de escena de F2**: el `Piu.exe` carga `main.vsl`); `.jtx`, `.nt`, `.pix` y `.rhy` (binarios, a investigar).

**Lo que dejaron los de F2 adentro de `empty\OPEN1`:** su kit de herramientas v16, todo para Windows con OpenGL normal (opengl32.dll), así que probablemente anden en una PC actual:
- `VslView` (ve las escenas `.vsl`)
- `TcViewer`, `TcTest` y `Tch2Tc` (texturas `.tc`)
- `RhyView` (`.rhy`)
- `GetVisual`, `BMP2PNG`, `Wwp`

Sirven como **referencia de cómo se ve el original** y su código es más fácil de leer que el de `Piu.exe`. Quedaron también notas de los desarrolladores (`iserror.log`, un `.rtf` y un `.psd`).

**Dato clave para el port:** `Piu.exe` trae adentro Mesa, una implementación de OpenGL, que dibuja sobre Glide (la 3dfx). O sea que **el juego (Andamiro y F2) está escrito en OpenGL 1.x**. Para el port exacto, el límite a reemplazar puede ser OpenGL, con WebGL o el OpenGL actual, en vez de Glide.

## 🟡 Sprites de Andamiro: `.spr` y `.sp2` (texto, relevados los 3.427)

```
TYPE TILE | ani | pattern      (2738 / 602 / 87 archivos)
NUM n                          (cantidad de piezas o cuadros)
T textura.tga dx dy dw dh sx sy sw sh            (.spr: 10 campos)
T pieza textura.tga dx dy dw dh sx sy sw sh      (.sp2: 11 campos, con nombre de pieza)
```
- `dx dy dw dh` es dónde va en pantalla, relativo al origen del sprite (por ejemplo, −35 −35 70 70 lo centra).
- `sx sy sw sh` es de qué parte de la textura sale, en píxeles.
- Los `.tga` se empaquetaron como `.png` con el mismo nombre.
- Pendiente: confirmar con el código (cargador cerca de 0x337FC) qué hacen `ani` y `pattern` y si hay campos de tiempo.

## 🟡 Guiones de animación de Andamiro: `.bga` (binario)

- Empiezan con `BGA\0` y tres u32 (132, 16, 0 en `67.BGA`).
- Después vienen bloques por objeto, cada uno con el nombre de su sprite (`car1.spr`, `city.spr`, `cloud.spr`…, 42 en `67.BGA`).
- Cada bloque trae tramos con floats (muchos 1,0: escala o transparencia) y enteros que crecen (5338, 5344, 5365…: tiempos).
- Pendiente: leer el formato exacto en el código que lo carga, en vez de adivinarlo.

## 🟡 Fondos animados: cómo se arman (falta)

- Son paquetes que armaba `RES.EXE` ("Usage: RES.EXE output.res *.spr [*.ptx ...]") con el guion de la animación (`.bga`), los sprites (`.spr`/`.sp2`) y las imágenes (`.png`; antes `.ptx`). La receta está en `pack.bat` y `pack2.bat`.
- Adentro hay PNG con su `IHDR` pero sin la firma de 8 bytes del principio, y nombres de texturas `.TC` y `.ifl` (listas de imágenes animadas).
- Falta: la tabla del paquete (dónde empieza cada archivo) y el formato del guion `.bga`.

## ✅ Carátulas: `Piu\TITLE\*.PNZ` → PNG

- **El mismo cifrado que la música**: 4 bytes de encabezado y después un PNG con los bits espejados y XOR con `llave_audio_1024.bin`, cada archivo con su corrimiento. Charles avisó que eran "PNG convertidos"; se confirmó con los 16 bytes fijos del principio de todo PNG.
- `tools\descifrar_caratulas.ps1` busca el corrimiento con la firma PNG y verifica el CRC de cada bloque. Las 80 salieron sanas, todas de 640×480, en `descifrado\caratulas\`.
- `T04`–`T72`: la carátula de cada canción, con título, BPM y autor (por ejemplo, `T60` = Beethoven Virus, BPM 162, BanYa). Las demás son pantallas: `MHD` = "Try Next Stage"; `PUMP`, `C1`–`C3`, `MBT`, `MCZ`, `MDB`, `MEZ`, `MHD'` y `MNR` faltan mirarlas una por una.
- Los 4 bytes del encabezado (en la música también) siguen sin descifrar. Quizás guardan el corrimiento.

## ✅ Configuración: `Piu\game.cfg`

Texto en coreano (CP949). Trae la lista de canciones y, por modo (`MODENAME NORMAL`, `HARD`…), las canciones con nivel y marca: 0 normal, 1 crazy, 2 double, 3 oculta.

## Herramientas que quedaron en el disco (`Piu\Bga`)

Son de agosto de 2000, la versión anterior; por eso los números de las carpetas no coinciden con Extra. Todas son programas de DOS de 32 bits: no corren en Windows actual sin DOSBox, y no hace falta correrlas.
| Archivo | Qué hace |
|---|---|
| `pack.bat`, `pack2.bat` | empaquetan los fondos de una canción; `pack2` antes convierte los `.tga` a `.png` |
| `pack_all.bat`, `pack2_all.bat` | lo mismo para todas las canciones, carpeta por carpeta (con los nombres en coreano de la versión anterior) |
| `Png.exe`, `Png5.exe`, `Png8.exe` | convierten TGA a PNG (`tga2png *.tga`); son tres variantes distintas |
| `PTX.EXE` | convierte TGA a PTX, el formato de texturas viejo (`tga2ptx *.tga`) |
| `RES.EXE`, `Res1.exe` | arman el paquete `.dat`; `Res1` es una versión de abril de 2000 |

Otros archivos de `Piu\`: `dos4gw.exe` (el extensor de DOS), `SGRAM.COM` (BIOS de la Banshee) y `start.bat` (arranca el juego sin mensajes).
