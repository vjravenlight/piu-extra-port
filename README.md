# Pump It Up Extra — port a PC, Android, Linux y Mac

Port del arcade **Pump It Up Extra** (Andamiro, 2001) hecho por **VJ Ravenlight** ([ravenlight.net](https://ravenlight.net)).
No es un emulador: el programa original de la cabina (`Piu.exe`) se traduce a JavaScript y corre en el navegador, con sus gráficos, su música, sus menús y sus reglas. Le suma un menú propio con online, ranking, editor de pasos, mandos USB y pantalla táctil.

> **¿Primera vez? Leé la [guía paso a paso](GUIA.md):** todo paso por paso, desde bajar esto hasta instalarlo en el teléfono.

> **Este repositorio no trae nada de Andamiro.** No incluye el disco, la música, los videos, los pasos ni el programa del juego. Para usarlo hace falta **la imagen del disco de la cabina** (`.cue` + `.bin`, o `.iso`). Las herramientas de acá sacan todo de ese disco y arman el juego en tu computadora.

## 1. Preparar (una sola vez)

Poné la imagen del disco en la carpeta del repositorio. El `.cue` y el `.bin` van juntos y sin cambiarles el nombre.

| Sistema | Qué hacer |
|---|---|
| **Windows** | Doble clic en `PREPARAR.cmd`. También podés arrastrar la imagen encima. Si la PC no tiene Node.js, lo baja solo (la versión portátil oficial, sin instalar nada). |
| **Linux / Mac** | Instalá [Node.js](https://nodejs.org) 18 o más nuevo y corré `./preparar.sh` (o `./preparar.sh /ruta/al/disco.cue`). |

Tarda uno o dos minutos y hace cuatro cosas:

1. Saca los archivos del disco a `extraido/`.
2. Lee `Piu.exe` y saca su código y sus datos a `investigacion/volcados/`. Avisa si tu disco no es el mismo que se usó para el port.
3. Traduce el código a JavaScript (`app/port/traducido.js`).
4. Arma las listas de canciones (`app/port/game_con_todo.cfg` y `game_online.cfg`).

Nada de eso se sube al repositorio: está en el `.gitignore`.

## 2. Jugar en el navegador

- **Windows:** `JUGAR.cmd`.
- **Linux / Mac:** `./jugar.sh`.

Se abre `http://localhost:8790/port/` en el navegador; sirven Chrome, Edge o Firefox actualizados. Si tenés PHP instalado, también levanta un salón online local. Sin PHP, el juego anda igual.

## 3. Armar las versiones para compartir (desde Windows)

`ARMAR_VERSIONES.cmd` arma todo en `build/`:

| Versión | Script | Qué baja la primera vez |
|---|---|---|
| Windows (motor de Edge, 1 MB de programa + el juego) | `tools/armar_build_edge.ps1` | SDK de WebView2 (NuGet de Microsoft, con suma comprobada) |
| Android 10+ (APK con GeckoView, 64 bits) | `tools/build_android/armar_apk_gecko.ps1` | Java 21 (Temurin), Gradle 9.7.1 y lo que pide el plugin de Android |
| Linux y Mac (Apple e Intel), en Electron 44.5.1 | `tools/armar_multiplataforma.ps1` | Los zips oficiales de Electron (con suma comprobada) |
| Carpeta para compartir (las cuatro + un LEEME) | `tools/armar_para_compartir.ps1` | — |

Para hacer la APK hay que aceptar las licencias del SDK de Android: `ARMAR_VERSIONES.cmd` lo pregunta, y a mano se pasa `-AceptarLicenciasAndroid`.

- Todo lo que se baja queda en `.herramientas/`, adentro del repositorio. No se instala nada en el sistema.
- La primera APK crea su propia firma en `tools/build_android/firma/`. **Guardala:** sin ella no se puede actualizar la app ya instalada en un teléfono. Nunca la subas.
- El orden importa: primero Windows (deja `build/Pump It Up Extra - Edge/juego`, que usan las otras), después la APK, Linux/Mac y la carpeta para compartir.

## Controles

| | ↙ | ↖ | centro | ↗ | ↘ |
|---|---|---|---|---|---|
| Jugador 1 | Z | Q | S | E | C |
| Jugador 2 (numérico) | 1 | 7 | 5 | 9 | 3 |

- **Esc**: volver (en el menú principal, salir).
- **F1 / F2**: TEST / SERVICE (menú de servicio de la cabina).
- **1 a 9**: velocidad de las flechas.
- **F7**: lista con todos los pasos del disco.
- Las teclas, los mandos USB y alfombras, el desfase del sonido y el resto se cambian en **OPCIONES**.
- En el celular aparecen los paneles en pantalla.

## Cómo está hecho

- `app/port/`: el port. `trabajador.js` corre el juego traducido en un hilo aparte; `principal.js` dibuja (OpenGL 1.x → WebGL, `app/motor/gl1.js`) y pone el sonido; `online.js` es el menú, el online y el ranking; `editor.js` es el editor de pasos.
- `app/online/`: el salón online y el ranking (PHP, sin base de datos).
- `tools/recompilador/`: el traductor de x86 a JavaScript.
- `tools/preparar/`: el extractor del disco y el cargador de `Piu.exe` (formato LE de DOS/4GW).
- `investigacion/`: los formatos del disco, las reglas del juego, el mapa del exe y cómo se rompió cada cifrado.

## Aviso

*Pump It Up* y todo el contenido del juego son de **Andamiro Co., Ltd.** Este repositorio tiene solamente el código del port, hecho sin fines de lucro para preservar el juego y jugarlo entre amigos. Cada quien necesita su propia copia del disco.
