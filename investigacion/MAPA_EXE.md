# Mapa de `Piu.exe` (paso 1 del port exacto) · 04/10/2026

`Piu.exe` es un programa de DOS de 32 bits (Watcom C, formato LE, DOS4GW), compilado el 08/03/2001.
Se lee con radare2 (`Documents\CLAUDE\_herramientas\radare2`), **siempre con `-e bin.relocs.apply=true`**: sin eso, las direcciones a los datos quedan sin resolver.

## Memoria

| Objeto | Direcciones | Qué es |
|---|---|---|
| 1 | 0x010000 (16 bytes) | arranque de 16 bits |
| 2 | 0x020000–0x117000 | **código** |
| 3 | 0x120000 (0x48 bytes) | pila o datos chicos |
| 4 | 0x130000–0x1CB000 | **datos** (textos, tablas). Más allá van las variables del juego, sin contenido inicial (hasta ~0x300000) |

Punto de entrada: 0x10E024.

## Qué es cada parte del código

Se clasificaron las 1.665 funciones que encontró `aac` según los textos que usa cada una. La lista completa está en `funciones_clasificadas.tsv` (dirección, tamaño, clase, textos). La clasificación es aproximada en los bordes, pero las zonas son claras:

| Zona | Qué es | Tamaño | ¿Se traduce? |
|---|---|---|---|
| 0x020000–0x048000 | **el juego**: Andamiro y F2. Flujo de pantallas, pasos, audio, sprites (`.spr`/`.sp2`), BGA, el motor `sgl_` de F2 (imágenes, `.ifl`, `.tc`, `.vsl`), menú de servicio y traba | ~160 KB | **sí** |
| 0x049000–0x0ED000 | Mesa 3.x (OpenGL por software) con el controlador `fx` para Glide | ~600 KB | no: lo reemplaza WebGL |
| 0x0ED000–0x10A000 | libpng 1.0.6 y zlib 1.1.3 | ~170 KB | no: el navegador ya lee PNG |
| 0x10A000–0x117500 | C de Watcom (archivos, memoria, printf, matemática), el cargador del overlay de Glide (`.ovl`) y el runtime de C++ | ~50 KB | no: se reemplaza por funciones propias |

## Funciones de biblioteca ya reconocidas (por cómo se usan)

| Dirección | Función | Pista |
|---|---|---|
| 0x10DBEB | `fopen(nombre, modo)` | la llaman con `"rb"` |
| 0x10E2FC | `fread(buf, tam, n, archivo)` | lee la cabecera de los `.NOT` |
| 0x10DE5F | `fclose(archivo)` | |
| 0x10E4E0 | `strcmp` / `memcmp` | compara con `"pump 5.0"` |
| 0x10D791 | `sprintf` | arma `"STEP\%s"` |
| 0x10D7D0 | `memset(ptr, valor, n)` | limpia tablas |
| 0x035C5C | registro de mensajes (tipo printf) | `"%d %s %s"` |
| 0x03689C | descifrado de pasos B y paquetes RES | `XOR k; k += 0x95`, con k arrancando en 0xD2 |

## Cómo le habla a la cabina

- **Video:** el juego llama a OpenGL (las funciones de Mesa). Mesa llama a Glide 2 a través de `GLIDE2X.OVL`, que se carga por nombre (129 funciones `gr…`/`gu…`). **Para el port, el límite es OpenGL 1.x**: las llamadas `gl…` del juego se pasan a WebGL.
- **Archivos:** DOS (`int 0x21`) a través del C de Watcom. En el port, lo descifrado se sirve desde `/datos`.
- **Sonido, pads, botones, monedero, traba y EEPROM:** por puertos de E/S (`in`/`out`) de la placa de la cabina. Falta ubicar cada puerto y su protocolo (los mensajes "Play %x", "Key ON %x" y "KeyOff %x" vienen del sonido).
- **Teclado del BIOS:** aparece `int 0x16`, quizás teclas de depuración. Falta verlo.

## Próximo

1. Ponerle nombre a las funciones de Mesa que llama el juego. Cada función de OpenGL trae su nombre en los textos de error, por ejemplo `"glBegin"`.
2. Ubicar los puertos de la placa (sonido, pads, traba).
3. Empezar la traducción por módulos: carga de paquetes y sprites → motor de BGA de Andamiro → motor de F2 (`sgl`/`vsl`) → pantallas → juego.
