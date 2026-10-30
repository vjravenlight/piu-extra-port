# Pump It Up Extra — port a PC, Android, Linux y Mac

Port del arcade **Pump It Up Extra** (Andamiro, 2001) hecho por **VJ Ravenlight** ([ravenlight.net](https://ravenlight.net)).

No es un emulador. El programa original de la cabina (`Piu.exe`) se traduce a JavaScript y corre en el navegador, con sus gráficos, su música, sus menús y sus reglas.

Además trae un menú propio con:
- **online**: una canción, versus completo y torneos;
- ranking;
- editor de pasos;
- mandos USB y alfombras;
- pantalla táctil.

> **¿Primera vez? Leé la [guía paso a paso](GUIA.md).**

## Hace falta el disco

**Este repositorio no trae nada de Andamiro:** ni el disco, ni la música, ni los videos, ni los pasos, ni el programa del juego. Cada uno usa **su propia imagen del disco de la cabina**:
- el `.bin` (el archivo grande que va con el `.cue`),
- o un `.iso`,
- o la carpeta con los archivos ya sacados.

El juego lo prepara solo la primera vez y el disco no sale de tu aparato.

## Cómo usarlo (de lo más fácil a lo más completo)

Ninguna de estas formas pide instalar nada aparte: lo que haga falta se baja solo, de su sitio oficial.

| Quiero… | Qué hacer |
|---|---|
| **Jugar en la compu** | Bajá el repositorio (botón verde **Code → Download ZIP**) y descomprimilo. Windows: doble clic en **`JUGAR.cmd`**. Mac: **`JUGAR.command`**. Linux: `sh jugar.sh`. Se abre el navegador y la primera vez te pide el disco. |
| **Jugar con amigos en la misma wifi** (o por internet) | **`SERVIDOR.cmd`** (Mac: `SERVIDOR.command`, Linux: `sh servidor.sh`). Hace tres preguntas y te da las direcciones para entrar desde los celulares y las otras compus. |
| **Armar las apps** (Windows, Android, Linux, Mac) | Desde Windows: **`ARMAR_VERSIONES.cmd`**. Arma las versiones **sin disco**, que piden el disco la primera vez. Si antes corriste `PREPARAR.cmd`, arma también las **completas**. |
| **Preparar el disco de antemano** | **`PREPARAR.cmd`** (Mac: `PREPARAR.command`, Linux: `sh preparar.sh`), con el `.cue`+`.bin` o el `.iso` en la carpeta. No hace falta para jugar: sirve para que el servidor reparta el disco en tu red y para armar las versiones completas. |

## Online

- **Una canción:** desafiás a alguien, elegís la canción en la selección de verdad del juego y la juegan a la vez.
- **Versus completo:** 4 canciones. Cada uno elige 2 y gana el que suma más puntos.
- **Torneo:** alguien lo arma, la gente se anota y las llaves se ordenan por ranking, al azar o por llegada. Cada cruce es de una canción o un versus completo, y se elimina hasta que queda uno.
- Hay **ranking** por canción, del modo solo, semanal y de la canción del día, más un **perfil** por jugador.

## Controles

| | ↙ | ↖ | centro | ↗ | ↘ |
|---|---|---|---|---|---|
| Jugador 1 | Z | Q | S | E | C |
| Jugador 2 (numérico) | 1 | 7 | 5 | 9 | 3 |

- **Esc** vuelve.
- **1 a 9** cambian la velocidad de las flechas.
- **F7** muestra todos los pasos del disco.
- Las teclas, los mandos, el desfase y el volumen se cambian en **OPCIONES**.

## Cómo está hecho

- `app/port/`: el port.
  - `trabajador.js` corre el juego traducido en un hilo aparte.
  - `principal.js` dibuja (OpenGL 1.x → WebGL) y pone el sonido.
  - `online.js` es el menú, el online y el ranking.
  - `instalar.js` + `instalador.js` preparan el disco del jugador en el navegador.
- `app/online/`: el salón online y el ranking (PHP, sin base de datos).
- `tools/recompilador/`: el traductor de x86 a JavaScript.
- `tools/preparar/`: el extractor del disco y el cargador de `Piu.exe` (formato LE de DOS/4GW).
- `tools/servidor.mjs`: el servidor (en la compu o en la red, con HTTPS propio y túnel opcional).
- `investigacion/`: los formatos del disco, las reglas del juego, el mapa del exe y cómo se abrió cada cifrado.

## Aviso

*Pump It Up* y todo el contenido del juego son de **Andamiro Co., Ltd.**

Este port lo hizo Ravenlight por amor a este juego, sin fines de lucro, para que no se pierda y para jugarlo entre amigos. **No busca perjudicar a Andamiro ni a nadie.** Por eso este repositorio y las apps no traen nada suyo, y cada persona usa su propio disco.

Si Andamiro quiere que algo se cambie o se baje, alcanza con pedirlo.
