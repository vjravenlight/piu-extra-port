# Pump It Up Extra: flujo y reglas tal como están en `Piu.exe` (04/10/2026)

Este documento es la tarea "juego" del port exacto. Sale de leer el código de `Piu.exe` (desarmado de `investigacion\volcados\desarmado_juego.txt` y radare2 con `bin.relocs.apply=true`). No se ejecutó el juego.

**Cómo leer las marcas:**
- **[C]**: confirmado en el código. Va con la dirección de la instrucción o de la función.
- **[D]**: deducido. Es una conclusión razonable, pero el código solo no alcanza para asegurarla.

Las direcciones de código van como `0x2c04c` y las variables como `[0x1ca6a0]`. "Tick" es un tick del reloj de 240 Hz. "Cuadro" es una vuelta del bucle principal (≈60 Hz [D], ver §1.2).

---

## 0. Resumen para el port (lo imprescindible)

1. **Reloj:** una interrupción a **240 Hz** cuenta ticks. Cada 2 ticks (120 Hz) lee los pads y corre **el juez** [C 0x20b9c]. Todo el resto (dibujo, menús, animaciones) corre por cuadro.
2. **Posición musical:** se mide en **1/60 de pulso**: `pos = (t_ticks − desfase_cs·2,4) · BPM / 240` [C 0x2c4a7, 0x28fc6].
   - `valores[]` de los `.NOT` es **el desfase en centésimas de segundo**.
   - `cambiosBpm[]` es **el instante del cambio de BPM, también en centésimas** [C 0x28e8c].
3. **Ventanas de juicio** (en 1/60 de pulso, calculadas con el BPM inicial):
   - PERFECT ≤ BPM/30 (≈ ±33 ms);
   - GREAT ≤ BPM/15+2;
   - GOOD ≤ BPM/10+3;
   - más allá, BAD.

   Además, **una nota solo se puede pisar mientras su fila es la "fila actual"**, que va 13/60 de pulso atrasada [C 0x29001, 0x291b6].
4. **Acordes:** la fila entera recibe **un solo juicio**, el peor de sus notas, cuando todas están pisadas. Si al pasar la fila falta alguna, la fila entera es MISS [C 0x29a38, 0x2a16a].
5. **Puntaje:**
   - PERFECT +1000 y GREAT +500;
   - desde el 4.º del combo, +1000 extra cada uno;
   - GOOD 0 (no corta el combo); BAD y MISS cortan el combo [C 0x280b4].
6. **Vida:** 0–1000; arranca en 500 en cada etapa.
   - Sube con PERFECT y GREAT según un factor de recuperación L que depende del LEVEL.
   - Baja 50 con BAD, y 25 % + 20 con MISS.
   - Si la etapa no tiene STAGE BREAK, la vida **no baja de 190**, así que no se muere [C 0x28709–0x287b0].
7. **Ratio de la etapa** = (P + 0,9·Gr + 0,6·Go − 0,5·B − M + 0,03·ComboMáx) / juicios, nunca menor que 0 [C 0x28930].
   - Al terminar la canción: **≥ 0,6 pasa (CLEAR)**; menos es FAIL y GAME OVER [C 0x2c3c5].
   - Nota: **S** con ratio ≥ 1,0 y 0 MISS; **A** con ≥ 0,9; **B** con ≥ 0,8; **C** con ≥ 0,7; **D** con ≥ 0,6; **F** abajo de eso [C 0x2de26].
8. **Corte inmediato** ("HEY MAN" y GAME OVER) [C 0x2c224, 0x2c2c4]:
   - si la vida de todos los que juegan llega a menos de 1 (solo posible con STAGE BREAK);
   - o si todos pasan de **50 MISS seguidos**.
9. **Etapas:** "Stage 3 + 1" significa 3 canciones y una 4.ª **extra** si las tres tuvieron ratio ≥ 0,9 [C 0x2d90c].
10. **Modos** (`game.cfg`): NORMAL, HARD, XX (= CRAZY), DOUBLE y REMIX en la ruleta. **BATTLE** aparece al elegir DOUBLE con dos jugadores [C 0x2f1c0, 0x32530].
11. Lo que **no se puede sacar del disco**: los **efectos de sonido**. Los genera un chip de la placa (puerto 0x2a0) usando la tabla `piu.bin`. Hay que grabarlos o emularlos (ver §14).

---

## 1. Reloj, cuadros y entradas

### 1.1 Interrupción de 240 Hz: `0x20b9c` [C]

`main` (`0x21bc8`) la instala con `0x3aa40(0, 0x20b9c)` y programa el temporizador con `0x3a9dc(0, 240.0)` [C 0x21cbe–0x21cd3]. El reloj de depuración divide por 240 para dar los segundos (`"%02d:%02d:%02d %6d"`, 0x2d030), lo que confirma los 240 Hz [C].

En cada tick:

```
tick():                                       // 0x20b9c
  [0x1ca6cc]++ ; [0x1ca6d0]++ ; [0x1ca6c8]++  // tres contadores
  leer_sensores_pads()                         // 0x38e30 (multiplexado en 4 fases, §1.3)
  sonido_mp3()                                 // 0x3cfdc: manda cuadros MP3 de 417/418 bytes al decodificador de la placa
  if ([0x1ca6cc] es par):                      // 120 Hz
     if moneda_nueva():                        // 0x3a0b8
        if coin_por_credito != 0 and [0x307904] != 1:
           monedas++ ; efecto(completa_un_credito ? 21 : 0, canal 0)
     if estado == 2:                           // jugando
        entradas()                             // 0x3a16c (flancos, §1.3)
        juez_si_jugando()                      // 0x2a90c -> 0x28f88 si subestado==0; TEST->sub 5, CLEAR->sub 6
```

- `[0x1ca6c8]` (función `0x20c74`) es el reloj de la canción. Se pone en 0 con `0x20c6c` al arrancar la música [C 0x2c0c7].
- `[0x1ca6d0]` (función `0x20c58`) se reinicia con `0x20c60`.

### 1.2 Bucle principal `0x21738` [C]

En cada vuelta:

1. Pone en 0 los flancos `[0x1ca6a8]` [C 0x2175b].
2. Lee el teclado del BIOS (`int 16h`). Son teclas de depuración; la cabina no tiene teclado (ver tabla).
3. Si el estado ≠ 2, llama a `entradas()` (`0x3a16c`) [C 0x21925]. En juego, las entradas las lee la interrupción.
4. Maneja SERVICE y CLEAR (§1.4).
5. Despacha según `[0x1ca6a0]` (tabla de 33 entradas en 0x216b4, §2).
6. Dibuja y cambia el búfer (`0xd897c`, `0xeecbe`).

**Velocidad del bucle:** ≈60 Hz [D]. La cuenta regresiva de la selección muestra `60 − cuadros/60` segundos (0x32460) y la pantalla dura 3600 cuadros; eso implica 60 cuadros por segundo. Falta confirmar el intervalo de `grBufferSwap` en la capa Mesa/Glide.

**Consecuencia para el juez [C]:**
- El juez usa `[0x1cfb28]` como hora. Ese valor lo actualiza el bucle principal (0x2c452), así que la hora que ve el juez avanza de a cuadro aunque el juez corra a 120 Hz.
- Los flancos de pisada se acumulan en `[0x1ca6a8]` hasta que el bucle los borra. Por eso **el juez puede ver la misma pisada en dos ticks seguidos**.

**Teclas de depuración del bucle** (scancodes de `int 16h`, 0x217b8–0x2191a) [C]:

| Tecla | Efecto |
|---|---|
| Alt+X | sale (`[0x13b7e8]=0`) |
| ` (0x29) | abre o cierra la consola de comandos (`[0x2f5b20]`, §2.9) |
| Esc | estado ← 0, corta la escena F2 (`0x40e64`) y además activa CLEAR |
| F1 | TEST |
| F2 | SERVICE |
| F3 | CLEAR |
| F4 | skin de flechas siguiente: `[0x2ac088] = ([0x2ac088]+1) % 9` |
| F5 | conmuta el modo R (0x800, §3.6) |
| F6 | conmuta 0x1000 y la opción x2 de los dos jugadores |
| F7 | fondos animados sí/no (`[0x13b7f8]`) |
| F8 | superposición de depuración (`[0x1ca6c4]` → `0x20c7c`) |
| F9 | captura `.\cap\p3_###.TGA` (`0x214d8`) |
| F10 | conmuta `[0x13ba00]`, un ajuste de Mesa (lo lee 0xc81a1) [D: filtrado] |
| F12 (0x8600) | **truco**: termina la canción con estadísticas perfectas (puntaje 123456, ratio 1,0, 500 PERFECT) [C 0x2c0dc] |

Las teclas del port (F1 TEST, F2 SERVICE, F3 CLEAR) coinciden con las originales. F4 COIN no: en el original F4 cambiaba el skin.

### 1.3 Entradas [C 0x3a16c]

**Pads** (cada jugador tiene un byte de 5 bits):

| Bit | 0x01 | 0x08 | 0x04 | 0x10 | 0x02 |
|---|---|---|---|---|---|
| Columna jugador 1 | 0 | 1 | 2 (centro) | 3 | 4 |
| Columna jugador 2 | 5 | 6 | 7 | 8 | 9 |
| Panel (orden de columnas) | ↙ | ↖ | ● | ↗ | ↘ |

- La relación bit→columna está confirmada en el juez [C 0x29241–0x29290] y en las animaciones de los paneles [C 0x2c67e].
- La relación columna→flecha (↙ ↖ ● ↗ ↘) es [D] fuerte. El espejo doble (`0x2262c`) es exactamente un giro de 180°: 0↔8, 1↔9, 2↔7, 3↔5, 4↔6. El de un lado (`0x225b8`) cambia 0↔3 y 1↔4. Las dos cosas solo encajan si la columna 2 es el centro y 0/3 y 1/4 son diagonales opuestas. Coincide con el orden estándar de Pump.

**Botones** (puerto 0x2a8, byte alto, activos en bajo; tercer byte de las palabras de entrada):

| Bit en `[0x1ca6aa]` | Valor en `[0x1ca6a8]` | Botón | Pista |
|---|---|---|---|
| 0x01 | 0x10000 | TEST | "1.TEST BUTTON", 0x380eb |
| 0x02 | 0x20000 | SERVICE | "2.SERVICE BUTTON" |
| 0x04 | 0x40000 | CLEAR | "3.CLEAR BUTTON" |
| 0x10 | 0x100000 | COIN | "4.COIN"; la moneda real la procesa 0x3a0b8 |

**Palabras de estado:**
- `[0x1ca6a8]`: flancos de bajada (recién pisado). Se acumulan y el bucle las borra.
- `[0x1ca6ac]`: recién soltado.
- `[0x1ca6b0]`: mantenido.
- `[0x30791c]`: la lectura anterior.

**Luces de los paneles:**
- Se prenden mientras el panel está pisado, solo en estado 2, en servicio 29 o en la demo [C 0x3a51f].
- Jugador 1 en el puerto 0x2a4 y jugador 2 en el 0x2a6: bit 0x01→0x20, 0x08→0x04, 0x04→0x10, 0x10→0x08, 0x02→0x40.

**Sensores [D]:**
- `0x38e30` lee cada panel como un nibble de 4 sensores. Multiplexa en 4 fases según `[0x307914]&3`, una por tick.
- El panel cuenta como pisado si algún sensor del nibble está activo (`test nibble` en 0x3a19b).
- En el port, cada tecla equivale a un panel.

### 1.4 Monedas y créditos [C]

| Variable o función | Qué es |
|---|---|
| `[0x1ca6c0]` | **monedas** acumuladas |
| `[0x30790a]` | monedas por crédito; 0 = FREE |
| `0x20b24()` | "hay algo": 99 si FREE o `[0x307904]==1`; si no, las monedas |
| `0x20ae8()` | créditos = monedas / monedas por crédito, o 99 |
| `0x20b48()` | gasta un crédito: monedas −= monedas por crédito (si no es FREE) |

- **COIN físico** (`0x3a0b8`, a 120 Hz) [C]:
  - Se acepta si pasaron al menos 9 llamadas (≈75 ms) desde la anterior.
  - Da un pulso al contador mecánico (bit 0x1000 del puerto 0x2a6) durante 12 llamadas.
  - Monedas +1. Suena el efecto 21 si se completa un crédito y el 0 si no.
  - En FREE no cuenta.
- **SERVICE** fuera del menú de servicio: vale **una moneda** (monedas +1, con el mismo sonido). En FREE solo suena el 21 [C 0x2192a–0x21984].
- **CLEAR**: **pone las monedas en 0** en cualquier estado [C 0x21996].
  - Dentro del menú de servicio (estado 29) además conmuta `[0x1ca6bc]`, que muestra el reloj de depuración en juego.
  - Jugando, CLEAR también **corta la canción** (subestado 6 → estado 0) [C 0x2a92d].
- `[0x307904]` ("modo libre" o "evento"): cuando vale 1 los créditos son 99, no hay CLEAR/FAIL y cambia el ratio. **Ningún código lo pone en 1**: arranca en 0 (0x21cfd), la pantalla GAME OPTION lo vuelve a 0 en cada cuadro (0x3870a) y los valores por defecto también lo ponen en 0. En este exe no se usa [C].

---

## 2. Máquina de estados `[0x1ca6a0]` [C 0x219c6, tabla 0x216b4]

| Estado | Función | Nombre (comando de consola) | Qué hace |
|---|---|---|---|
| 0 | (por defecto, 0x21a82) | — | Despachador de la espera (attract), §2.1 |
| 1 | `0x2a27c` | `run` | Arranque de la etapa: carga pasos, fondo y música → 2 |
| 2 | `0x2c04c` | — | **Juego** (subestados `[0x1cfb24]` 0–6, §2.6) |
| 4 | `0x2d898` | — | Carga `bga\grade.dat` / `grade.sp2` → 5 |
| 5 | `0x2dbe0` | — | **Resultado** (nota y números), §8 |
| 10 | `0x3326c` | `sel` | Prepara juego nuevo o etapa siguiente → 11 |
| 11 | `0x33330` | — | Selección (subestados `[0x2afd18]` 0–4, §2.4) |
| 13 | `0x3b064` | `logo` | Carga `bga\81.dat` (logo) → 14 |
| 14 | `0x3b0f4` | — | Logo: 500 cuadros, o se corta si hay crédito → 0 |
| 16 | `0x3ad30` | `intro` | Apertura F2 (`BGA\open.dat` + `main.vsl`) → 17 |
| 17 | `0x3aebc` | — | Apertura: 1020 cuadros, o se corta si hay crédito → título (20) |
| 19 | `0x3b160` | `title` | Carga `bga\title.dat` / `title.sp2` y borra el juego → 20 |
| 20 | `0x3b264` | — | **Título**: los jugadores se suman, §2.3 |
| 22 | `0x3b98c` | — | Carga la ayuda (`bga\03.dat` y audio 03) → 23. **Nada lo llama** [C] |
| 23 | `0x3b9ec` | — | Ayuda: 1920 cuadros o ● → juego (`0x3326c`) |
| 28 | `0x38bf4` | `setup` | Entra al menú de servicio → 29 |
| 29 | `0x38c5c` | — | **Menú de servicio**, §11 |
| 31 | `0x2e618` | `ending` | Final: `BGA\84.dat` y audio 49 → 32. **Solo desde la consola** [C] |
| 32 | `0x2e6a0` | — | Final: 1900 cuadros, ● o crédito → título |

Los demás números (3, 6–9, 12, 15, 18, 21, 24–27, 30) van al despachador del estado 0.

**TEST** (`[0x1ca6aa]&1`) manda al estado 28 desde los estados 5, 11, 14, 17, 20, 23 y 32, y desde el juego (subestado 5) [C].

### 2.1 Espera (attract), estado 0 [C 0x21a82]

```
if [0x13b7e4] == 0:                  // "idle" de depuración: muestra "idle..."
    dibujar "idle..."; return
hay = 0x20b24()                      // 99 en FREE
if hay != 0: estado = 19 (título)    // con crédito o en FREE el título queda siempre
else:
    k = [0x1ca768]++ % 4
    k==0: estado = 13 (logo)
    k==1: estado = 16 (apertura -> título -> 900 cuadros -> 0)
    k==2: no hace nada este cuadro
    k==3: [0x1ca698]++ ; demo()      // 0x33438
```

- `0x213e0` pone `[0x1ca768]=0`. Se llama al sumarse un jugador y al salir del servicio.

**Demo** (`0x33438`) [C]:
- Elige `n = tabla[rand() % 19]` de 0x13bd14 = {41, 44, 42, 15, 4, 17, 13, 16, 13, 45, 47, 14, 6, 9, 40, 11, 5, 39, 19}.
- Ejecuta `"run %02d_h2.not -demo %02d.dat"`: el gráfico HARD de dos jugadores, banderas `0x100533` (P1+P2, autojuego).
- Opciones x2 para los dos (`[0x1cfb0c]=[0x1cfb10]=2`).
- Sin música si DEMO SOUND = OFF (0x2a852, 0x2c09b).
- Termina a los **8400 ticks (35 s)** o cuando `0x20b24()≠0`, y vuelve al estado 0 [C 0x2c161]. En FREE termina en el primer cuadro.

**Apertura** (`0x3ad30`) [C]:
- La música (audio 01) suena **solo una de cada 7 aperturas** (`[0x3079d4] % 7 == 0`; la primera sí).
- `[0x3079d0]` se alterna en cada apertura [D: elige variante].

### 2.2 Arranque de la máquina `0x21bc8` [C]

1. `srand(time())` (0x10d96f → 0x10d9c8). El generador es el de Watcom: `s = s·1103515245 + 12345; rand = (s>>16) & 0x7fff` [C 0x10d9a4].
2. Luces (`0x3a824`).
3. Carga `piu.bin` en el chip de efectos [C 0x3a8cf → 0x4271b → `[0x72222c]`].
4. Inicia el sonido (`0x3cd0c`), los gráficos, la fuente (`font.tga`), los paquetes base (`bga\00.dat`: font.tga, event.tga, arrow541.sp2) y la EEPROM (`0x37e50`, §11.6).
5. Instala el reloj.
6. `[0x307904]=0` y entra al bucle.

### 2.3 Título, estado 20 (`0x3b264`) [C]

- **Luces:** cada 20 cuadros, patrón `[0x13bf1c + 4·((cuadro/20)%8)]` = {0x1004, 0x802, 0x204, 0x102, 0x401, 0, 0xFFFF, 0} (`0x3ac10`).
- **Tiempo:** si pasan 900 cuadros sin crédito y sin nadie sumado → estado 0.
- **Sumarse:** si hay créditos (`0x20ae8()`) y un jugador aún no está, **● de ese jugador**:
  - `0x213e0()`, `0x20b48()` (gasta el crédito);
  - bandera P1 (`[0x1cfb08] |= 1`) o P2 (`|= 2`);
  - efecto 3, canal 2.
- **Salida:**
  - con los dos sumados, enseguida;
  - con uno solo, al pasar **60 cuadros** desde que se sumó (`[0x3079cc] > 60`).
- Al salir: si **SHOW HELP = ON** (y `[0x307904]==0`) → ayuda (`bga\03.dat`, audio 03, estado 23). Si no → `0x3326c` (juego).
- **Ayuda** (estado 23): dura hasta 1920 cuadros. ● de cualquiera la saltea (efecto 3).

### 2.4 Selección: estado 11, subestados `[0x2afd18]` (`0x33330`) [C]

`0x3326c` (estado 10), preparación:
- Si es la **etapa 0** (juego nuevo):
  - opciones de los dos en 0, modo NORMAL (`[0x2b35e8]=0`), skin 0, `[0x2af80c]=0`, `[0x1cfb08] &= 3`;
  - subestado 2 (se saltea la pantalla "etapa N").
- Si no: subestado 0.
- En los dos casos: borra los códigos, `[0x2b3a60]=0` (sin vista previa), `[0x2b39f4]=0` (reloj) y prende todas las luces.

| Sub | Función | Qué hace |
|---|---|---|
| 0 | (en 0x33330) | Carga `bga\next.dat` con `"%1d.sp2"` = etapa+1 y sigue en 1 |
| 1 | `0x3311c` | Muestra "etapa N" **4 cuadros** y sigue en 2 |
| 2 | `0x30268` | Prepara la ruleta (abajo) y sigue en 3 |
| 3 | `0x32f90` + `0x2ffe4` + `0x32270` | Selección: sumarse tarde, códigos, ruleta y reloj |
| 4 | `0x32530` | Confirma: arma el nombre del `.NOT` y ejecuta `run` |

**Preparación** (`0x30268`):
- `[0x1cfb08] &= 0xFA0F` (borra los bits de modo).
- Carga `bga\select.dat` (`select.sp2`, `select1.sp2`) y `bga\stitle.dat` (`stitle.sp2`).
- **Música de selección: audio 02**.
- En la etapa 0 lee `game.cfg` (§3.1).
- Con los dos jugadores, `0x2ebd4` saca de XX y REMIX las entradas dobles (marca 2).

**Pantalla de selección** (`0x30aa0`, por jugador sumado; usa paneles *mantenidos*):

| Panel | Acción |
|---|---|
| ↖ | modo anterior |
| ↗ | modo siguiente |
| ↙ | canción anterior |
| ↘ | canción siguiente |
| ● (flanco) | 1.ª vez: **vista previa** `AUDIO\D%02d.AUD` de la canción del centro; 2.ª vez, con la vista previa sonando: **confirma** (subestado 4) |

- Al moverse se detiene la música (`0x3d1e0`) y no vuelve hasta la próxima ●.
- Para repetir el movimiento con el panel mantenido, la animación de modo tiene que pasar de 60 cuadros y la de canción de 20 (`[0x13bca4]`, `[0x13bca8]`).
- Modo = `(modo + 10) % 5`, o sea 0–4: NORMAL, HARD, XX, DOUBLE, REMIX.
- Si se mete un código y la vista previa ya suena, la ● del final del código **confirma**. Se chequea antes que la bandera de código (`[0x2b39f0]`).
- **Reloj:** 60 s (3600 cuadros), se muestra `60 − cuadros/60`. En 0 confirma la canción del centro en cuanto terminan las animaciones (0x324e5).
- **Sumarse tarde** (`0x32f90`): con crédito, ● de un jugador que no estaba → gasta el crédito, efecto 3 y bandera. Si quedan los dos, `0x2ebd4`.

**Confirmación** (`0x32530`): ver §3.3. Después **quita la canción de la lista** de ese modo para el resto del juego (`0x2eee8`, §3.4) y ejecuta `"run <pasos>.not -D|-S NN.dat"` por la consola (`0x35fb8`) → estado 1.

### 2.5 Arranque de etapa: estado 1 (`0x2a27c`) [C]

1. Pone en 0 los contadores de la etapa: `[0x1cfb14..58]`, `[0x1cfc00..10]`, `[0x1cfc38..60]`. Además `[0x1cfb1c]=[0x1cfb20]=1` y segmento de BPM `[0x1cfb50]=0`.
2. Comprueba la traba (`0x3d6a4`); si falla, `exit(1)`.
3. Si hay menos de 2 argumentos, imprime `"run step_name -d(ouble)"` y vuelve al estado 0.
4. Carga los pasos `0x220f8(arg1)` (§4). Si no existe: `"%-12s - file not found"` y estado 0.
5. Opción `arg2`: `-D` o `-S` dejan `[0x1cfb08]` como está. Las de depuración ponen:

   | Opción | `[0x1cfb08]` |
   |---|---|
   | `-d` | 0x281 |
   | `-s1` | 0x531 |
   | `-s2` | 0x532 |
   | `-demo` | 0x100533 |
   | `-demo2` | 0x100281 |
   | otra | 0x533 |
6. Si los fondos están activos (`[0x13b7f8]==1`): carga `BGA\arg3`.
   - Si es paquete F2: escena `main.vsl` (`[0x2ac094]=1`).
   - Si no, BGA de Andamiro (`[0x2ac094]=0`).
   - Excepciones de nombre del guion [C 0x3751d]: `BGA\70.dat`→`506.BGA`, `BGA\10.dat`→`501.BGA`, `BGA\72.dat`→`308.BGA`.
7. Si el skin `[0x2ac088]≠0`, carga `bga\arrow.dat` con `arrow%1d.sp2`.
8. Modificadores del gráfico (§4.3).
9. `0x21de0`: cuenta las filas con notas: `[0x1cfbd0]` para P1 (cols 0–4), `[0x1cfbd4]` para P2 (5–9) y `[0x1cfbd8]` para doble (0–9).
10. Pone en 0 la estructura de jugadores `[0x1cfb7c..+82]`, salvo en BATTLE desde la 2.ª etapa. **Vida 500** a cada jugador activo (en doble, solo P1).
11. **LEVEL** fija el factor de vida (§7.2).
12. **Ventanas de juicio** con `F = BPM[0]` (float, `chop` = truncar hacia 0, 0x10e582):
    - `w0 = chop(F/30)`
    - `w1 = chop(F/15 + 2)`
    - `w2 = chop(F/10 + 3)`
    - `w3 = chop(2F/15 + 4)`, que **no se usa** (`[0x1cfb6c]` solo se escribe).
13. Prepara la música (`0x3cd74(nro)`), salvo demo con DEMO SOUND=OFF.
14. **Espera** hasta que `[0x1ca6d0] ≥ 1200` ticks (5 s desde el último `0x20c60`; casi siempre ya pasaron).
15. Estado 2, subestado 0.

### 2.6 Juego: estado 2, subestados `[0x1cfb24]` (`0x2c04c`, tabla 0x2c030) [C]

| Sub | Dirección | Qué es |
|---|---|---|
| 0 | 0x2c06b | **Jugando** |
| 1 | 0x2d0aa | **FAIL**: `bga\fail.dat`, 40 cuadros → 3 |
| 2 | 0x2d23f | **CLEAR**: `bga\clear.dat`, 40 cuadros → estado 4 (nota) |
| 3 | 0x2d3d5 | **GAME OVER**: `bga\gameover.dat`, 120 cuadros → estado 0 (ver nota) |
| 4 | 0x2d611 | **HEY MAN**: `bga\heyman.dat`, entra deslizándose 25 cuadros, dura 240 → 3 |
| 5 | 0x2d767 | TEST pulsado: corta → servicio (28) |
| 6 | 0x2d7cf | CLEAR pulsado: corta → estado 0 |

**Subestado 0, por cuadro:**

1. En el primer cuadro arranca la música y pone en 0 el reloj de la canción (`0x20c6c`, `0x20c60`). En demo con DEMO SOUND=OFF no hay música.
2. `t = max([0x1ca6c8], t_anterior)`, nunca menor que 0, en `[0x1cfb28]`.
   - Calcula `[0x1cfb3c] = chop((t − off·2,4)·BPM)` y `[0x1cfb40] = [0x1cfb3c]/240` (§5).
   - Destello de pulso `[0x1cfb54] = ((pos+6000) % 60) / 45` (vale 1 en los últimos 15/60 de cada pulso).
3. Demo: termina a los 8400 ticks o con crédito.
4. Doble: copia el puntaje, la vida y los MISS seguidos de P1 a P2 (para dibujar).
5. **Corte por vida:** `vida[P1] < 1 y vida[P2] < 1` y no es BATTLE → efecto 7 en el canal 7, subestado 4.
6. **Corte por MISS seguidos:** `missSeguidos[P1] > 50 y missSeguidos[P2] > 50` y no es BATTLE → igual.
   - Un jugador ausente también acumula MISS y la vida le queda en ≤ 0 (ver §6). Por eso, con un solo jugador, la condición depende solo de él [D, por la lógica de 0x2a16a/0x2a1a1].
7. **Fin de la canción:** cuando la fila actual `[0x1cfc00]` pasa `[0x1cfc0c]`. Este valor es N en el formato A y la última fila con evento + 4 en el B [C 0x2c375]. La música **se corta ahí** aunque el MP3 siga.
   - BATTLE, o `[0x307904]`: estado 4 (nota) directo.
   - Si no: `ratio[P1] ≥ 0,6` **o** `ratio[P2] ≥ 0,6` → sub 2 (CLEAR); si no, sub 1 (FAIL).
   - Demo o "idle" de depuración: no cambia de estado.
8. Luces de los paneles, fondos (F2 o Andamiro, tiempo = t/4), flechas, juicios, puntaje, créditos y opciones.

**GAME OVER (sub 3):**
- Si `[0x1cfbf8] == 0` (ningún GOOD, BAD ni MISS desde el último GAME OVER) y `[0x307904]==0`: **no muestra** `gameover.dat` y vuelve al estado 0 enseguida.
- Si no, lo muestra 120 cuadros, pone `[0x1cfbf8]=0` y vuelve al estado 0.
- En los dos casos borra `[0x1cfb04..10]` [C 0x2d406].

### 2.7 Nota y etapa siguiente (estados 4 y 5, `0x2dbe0` → `0x2d90c`) [C]

- El resultado dura hasta **400 cuadros**. Desde el cuadro 250, ● de cualquiera lo corta (`[0x1ca6a8]&0x404`). TEST → servicio.
- Después, `0x2d90c` decide (pseudocódigo en §8.3): etapa siguiente (estado 10 → 11 → selección) o GAME OVER (estado 2, subestado 3).
- **No hay ENDING en el flujo normal.** Ninguna asignación pone el estado 31; el final solo se ve con el comando `ending` [C, búsqueda de todas las escrituras de `[0x1ca6a0]`].

### 2.8 Diagrama del flujo

```
ARRANQUE -> 0 (espera) --crédito/FREE--> 19 -> 20 TÍTULO --● (crédito)--> [60 cuadros / 2 jugadores]
   |                                                    |-- SHOW HELP --> 23 AYUDA --+
   +-- k=0: 13/14 LOGO (500 cuadros) -> 0               +---------------------------+--> 10 -> 11
   +-- k=1: 16/17 APERTURA (1020 cuadros) -> 20 (900 cuadros sin crédito) -> 0
   +-- k=3: DEMO (run ..._h2 -demo, 35 s) -> 0

11: [sub 0/1 "etapa N"] -> sub 2/3 SELECCIÓN (60 s) -> sub 4 confirma -> 1 RUN -> 2 JUEGO
2: fin -> ratio>=0,6 ? CLEAR(2) -> 4 -> 5 RESULTADO -> 0x2d90c -> (10 etapa siguiente | GAME OVER)
         : FAIL(1) -> GAME OVER(3) -> 0
   vida<1 o >50 MISS seguidos -> HEY MAN(4) -> GAME OVER(3) -> 0
TEST en casi cualquier pantalla -> 28 -> 29 SERVICIO -> EXIT -> 0
```

### 2.9 Consola de depuración [C 0x35fe4, 0x35e28; tabla 0x13bd74]

- Se abre con la tecla `` ` ``. Se escribe un comando y Enter lo separa por espacios en `argv` (`[0x2f6854]` = argc; argv en 0x2f6858, 72 bytes cada uno).
- Comandos:

| Comando | Función | Qué hace |
|---|---|---|
| `exit` | 0x21330 | sale del bucle |
| `idle` | 0x214b8 | conmuta `[0x13b7e4]` ("idle %d") |
| `run` | 0x2a27c | arranca una etapa |
| `setup` | 0x38bf4 | menú de servicio |
| `sel` | 0x3326c | selección |
| `intro` | 0x3ad30 | apertura |
| `logo` | 0x3b064 | logo |
| `title` | 0x3b160 | título |
| `ending` | 0x2e618 | final |

- La cadena `"p=exit"` (0x130627) es casual: el puntero del comando apunta a `"exit"` (0x130629).
- El propio juego usa la consola para jugar: la selección ejecuta `run` y la demo también.

---

## 3. Modos, `game.cfg` y opciones

### 3.1 `game.cfg` [C 0x2f2bc, 0x2f1c0]

- Se lee línea por línea con `fgets` y se parte con `strtok(" \n\r\t")`. Las líneas que no empiezan con `MODENAME` o `SONG` se ignoran (comentarios `//`, el título en coreano).
- `MODENAME <nombre> <n>`:

  | Nombre | Lista |
  |---|---|
  | NORMAL | 0 |
  | HARD | 1 |
  | **XX** (= CRAZY) | 2 |
  | DOUBLE | 3 |
  | REMIX | 4 |
  | BATTLE | 5 |
  | otro | "Stage.cfg Error" y lista −1 |

  El número `<n>` se guarda en `[0x2b39a4]`, que **nadie lee**.
- `SONG <nro> <nivel> <marca>` agrega a la lista del modo:
  - canción en `0x2b3600 + 50·modo`, nivel en `0x2b372c + 50·modo`, marca en `0x2b3858 + 50·modo`;
  - cantidad en el byte `0x2b3984 + modo` (máximo 50).
- **Marca:** **2 = doble** (en XX da `_xd` y en REMIX da `_db`); 99 = quitada; 0, 1 y 3 se comportan igual.
- El comentario del archivo dice "0 normal, 1 crazy, 2 doble, 3 oculta", pero en el código solo cuentan 2 y 99.
- **Nivel:** en todos los modos menos XX se dibujan `nivel` estrellas separadas 26 px. En XX se dibuja un único ícono elegido por el nivel (0x32383–0x3245b). No tiene otro efecto.
- La lista se lee **solo en la etapa 0** de cada juego.

### 3.2 Listas del disco (resumen de `extraido\Piu\game.cfg`)

| Modo | Canciones |
|---|---|
| NORMAL | 40 canciones (niveles 1–7) |
| HARD | 48 |
| XX (CRAZY) | 11 canciones × 2 (simple y doble): 39, 40, 60, 43, 23, 61, 18, 8, 12, 67, 19 |
| DOUBLE | 50 |
| REMIX | 10 × 2: 28, 27, 30, 29, 31, 32, 57, 52, 53, 36 |
| BATTLE | 46 |

### 3.3 Qué archivo y qué bandera usa cada modo [C 0x32530]

`n` = número de canción de la lista. Se elige en `[0x2b3a68]`.

| Modo en la ruleta | Pasos | Bandera `[0x1cfb08]` |
|---|---|---|
| NORMAL | `%02d_n` | 0x10 |
| HARD | `%02d_h` | 0x20 |
| XX, marca ≠ 2 | `%02d_x` (CRAZY simple) | 0x400 |
| XX, marca 2 | `%02d_xd` (CRAZY doble) | 0x80 |
| DOUBLE, 1 jugador | `%02d_db` | 0x80 |
| **DOUBLE con 2 jugadores = BATTLE** (lista 5) | `%02d_h` | 0x40, y se fuerza 0x1000 |
| REMIX, marca ≠ 2 | `%02d_` (da `NN_1` / `NN_2`) | 0x100 |
| REMIX, marca 2 | `%02d_db` | 0x80 |

**Sufijo final:**
- **Doble** (0x80 o 0x200): `"%s.not"` con `-D`. Si los dos jugadores están sumados, se borra la bandera de P1 (`xor [0x1cfb08],1`) y juega P2 [C 0x32c46]. En la práctica no se llega a este caso: con dos jugadores DOUBLE pasa a BATTLE y los dobles de XX y REMIX se quitan (§3.4) [D].
- **Simple:**
  - con un jugador, `"%s1.not"`;
  - con dos, `"%s2.not"` (lado derecho espejado), salvo con 0x1000, que usa `"%s1.not"`.
  - Siempre con `-S`.
- **Fondo** `"%02d.dat"`; **carátula** `TITLE\t%02d.pnz`.
- Las otras imágenes de `TITLE` (`MHD`, `MNR`, `MCZ`, `MDB`, `MEZ`, `MBT`, `PUMP`, `C1`–`C3`) **no aparecen en el exe**. No se usan en esta versión [C: el único formato es `t%02d.pnz`].

### 3.4 Canciones quitadas y ocultas [C 0x2eee8, 0x2ebd4]

- Al confirmar una canción se **quita** de la lista de ese modo (marca 99 y se compacta). No se puede repetir en el mismo juego. El índice del modo vuelve a 0.
- En **XX (CRAZY)**, al quitar la elegida se **agregan ocultas** según la etapa (antes de sumarla):

  | Etapa | Agrega (simple y doble) |
  |---|---|
  | 0 | canción **7** (쓰레기야 Trash Man), nivel 4 |
  | 1 | canción **20** (holiday), nivel 4 |
  | 2 | canción **21** (라젠스키 캉캉 Radetzky Can Can), nivel 5 |

- Con **dos jugadores** se sacan de XX y REMIX todas las entradas de marca 2 (dobles).

### 3.5 Códigos de opciones [C 0x2ffe4, 0x2f9f4 (P1), 0x2fcf4 (P2); tabla 0x13ba74, largos 0x13bc7c]

- Durante la selección, cada pisada (flanco) de un jugador sumado se agrega a su historial de 13 entradas (P1 en 0x2b39b0, P2 en 0x2b39d0).
- Si se pisan varios paneles en el mismo cuadro, se agregan en el orden 1, 2, 4, 8, 0x10. Cada pisada suena (efecto 3).
- Se compara el final del historial con los 20 códigos. Si alguno coincide:
  - se aplica;
  - se borran los historiales;
  - `[0x2b39f0]=1`;
  - si algo cambió, efecto 2 en el canal 1.

| Nº | Secuencia (UL=↖, UR=↗, DL=↙, DR=↘, C=●) | Efecto |
|---|---|---|
| 0 | DL DR DL DR DL DR DL DR | **Borra todo**: opciones del jugador = 0, skin 0, `[0x1cfb08] &= 0x7FF` |
| 1 | UL UR DL DR UL UR DL DR C | conmuta **0x800, modo R** (versión rápida, §3.6) |
| 2 | DR DL UR UL DR DL UR UL C | conmuta **MIRROR** (0x20) |
| 3 | UL UR UL UR UL UR UL UR C | conmuta **velocidad al azar** (0x200) y borra las velocidades fijas |
| 4 | UL UR UL UR DL DR DL DR C | conmuta **RANDOM** (0x40) y borra 0x100 |
| 5 | UL×8 + 0 | anulado: no puede coincidir |
| 6 | DR DL UR UL UR UL DR DL C | conmuta **0x1000** (mismo gráfico en los dos lados) |
| 7 | DR DL DR DL UR UL UR UL C | conmuta 0x2000 (solo ícono) y borra 0x1000 |
| 8 | UR UL UR UL DR DL DR DL C | conmuta **0x4000** (doble simétrico, §4.3) |
| 9 | UL UR DL DR DL DR UL UR C | conmuta **0x100** (banda oculta, §9) y borra 0x10 y 0x40 |
| 10 | UL UR UL UR C | **velocidad**: x1 → x2 → x4 → x8 → x1; borra 0x200 |
| 11 | UL UR DL DR C | **VANISH** (0x10) → **sin flechas** (0x80) → nada |
| 12–19 | DL UR DL UR DL UR + (UL, UR, DL, DR) + C y DR UL DR UL DR UL + (UL, UR, DL, DR) + C | **skin de flechas**: 1, 8, 6, 7, 2, 5, 4, 3 (`[0x2ac088]`) |

- **Opciones por jugador** (`[0x1cfb0c]` P1, `[0x1cfb10]` P2):

  | Bit | Opción |
  |---|---|
  | 0x02 / 0x04 / 0x08 | velocidad x2 / x4 / x8 |
  | 0x10 | VANISH |
  | 0x20 | MIRROR |
  | 0x40 | RANDOM |
  | 0x80 | sin flechas |
  | 0x100 | banda oculta |
  | 0x200 | velocidad al azar |

- **Opciones globales** (`[0x1cfb08]`): 0x800 R, 0x1000, 0x2000, 0x4000. Los códigos de P2 cambian las mismas globales.
- Las opciones **siguen de una etapa a otra**. Se borran al empezar un juego nuevo (`0x3326c` en la etapa 0).

### 3.6 Modo R ("versión rápida", bandera 0x800) [C 0x220f8, 0x3cd74, 0x2c53d]

- **Qué hace:**
  - suena `AUDIO\r%02d.AUD` en vez de `%02d.AUD`;
  - `BPM[0]` pasa a `tablaR[n]` (floats en 0x13b864);
  - `valores[0] = chop(chop(valores[0]·BPM0)/BPMr)`;
  - el fondo avanza en proporción `BPMr/BPM0`.
- Las versiones R son **1,2 veces más rápidas**. Por ejemplo, la 04 pasa de 120,9 a 145,8 y la 60 de 162 a 194,4.
- **Lista de exclusión** (0x13c394): 1, 2, 3, 5, 21, 28, 29, 36, 52, 57, 59, 61–65, 80, 81, 51, 54, 66. Con esas canciones se usa el audio normal.
- **Error del original** [C la lógica, D la consecuencia]:
  - 51, 54 y 66 están en la lista de exclusión **y** tienen valor en `tablaR` (139,08, 144 y 91).
  - El BPM se reemplaza (0x220f8) antes de chequear la exclusión (0x3cd74, que vuelve `[0x2b3a64]` a 0).
  - Resultado: con esas tres los pasos van al BPM rápido y la música a la velocidad normal. Hay que replicarlo o documentarlo.
- Se activa con el código 1, o con F5 en depuración.

---

## 4. Pasos en memoria

### 4.1 Tabla de notas [C 0x220f8, 0x21e70]

- `0x29f230`: **2048 filas × 14 caracteres**. Columnas 0–9 son los paneles y 10–12 los extras (luces) del formato B.
- Valores:

  | Carácter | Significado |
  |---|---|
  | `'0'` | vacío |
  | `'9'` | nota pendiente |
  | `'5'` `'6'` `'7'` `'8'` | ya juzgada: PERFECT, GREAT, GOOD, BAD |
  | `'1'` | consumida por PERFECT/GREAT (ya no se dibuja); en el formato B es la marca cruda de los extras |
  | `0x00` | borrada por el dibujo de largas (§9.3) |

- `0x2a6230`: **estado de larga** por fila y columna, 2048 × 10. Valores: 0 nada, 1 cabeza, 3 cuerpo, 2 cola.
  - En el formato A, la cabeza, el cuerpo y la cola quedan como `'0'` en la tabla de notas [C 0x2203d–0x220d5].
  - El formato B no tiene largas.
- **Formato B:** cada evento (u16 fila, u16 máscara desde el bit 15) pone `'1'` en las columnas 0–12. Después las columnas 0–9 pasan de `'1'` a `'9'`. Fin de la canción: `[0x1cfc0c]` = fila del último evento + 4.
- **Cabecera** (los dos formatos se copian a las mismas variables) [C]:

  | Variable | Qué es |
  |---|---|
  | `0x29d160[10]` | BPM (float) por segmento |
  | `0x29d188[10]` | **`valores` = desfase del segmento, en centésimas de segundo** |
  | `0x29d1b0[10]` | **cambios de BPM, en centésimas de segundo** |
  | `0x29d1d8` | filas por pulso (`fpp`) |
  | `0x29d1e0` | número interno |
  | `0x29d228` | N |

  Al cargar, si `cambio[i−1] ≥ cambio[i]`, se pone `cambio[i] = 9 999 999` (de i=1 a 9).
- **Prueba de las unidades:**
  - Mezcla 29: BPM 100 (desfase 15 cs) hasta los 82,20 s, y 115 (desfase 0) después.
  - Las notas terminan en la fila 272 (81,75 s con el segmento 0) y vuelven en la 350 (91,3 s con el segmento 1).
  - Al cambiar de segmento, la fila actual salta de ≈273 a ≈315 y no hay notas entre medio. Cierra exacto con centésimas y desfase propio por segmento.
  - Con milisegundos no cerraría (`descifrado\pasos\29_1.json`).

### 4.2 Conteo de filas [C 0x21de0]

- `[0x1cfbd0]`, `[0x1cfbd4]` y `[0x1cfbd8]`: filas con alguna nota en las cols 0–4, 5–9 y 0–9.
- Solo se usan en el ratio de `[0x307904]==1`, que no se usa.

### 4.3 Modificadores al cargar [C 0x2a56b–0x2a68a]

**Doble** (0x280):
1. Copia las opciones de P1 a P2 o al revés, según quién esté.
2. RANDOM (0x40 de P1): `0x22430(0)` y `0x22430(5)`.
3. MIRROR (0x20): `0x2262c`, giro de 180° del doble: nueva[0..9] = vieja[8, 9, 7, 5, 6, 3, 4, 2, 0, 1].
4. 0x4000: `0x226cc`. Recorre las columnas 0→8, 1→9, 2→7, 3→5, 4→6 y de vuelta; si hay `'9'` en una, lo copia en su par. El resultado es **la unión del gráfico con su giro**.

**Simple:**
1. Si no juegan los dos, o si está 0x1000: **copia las cols 0–4 en las 5–9** (el lado derecho queda igual al izquierdo).
2. RANDOM por lado (`0x22430(0)` P1, `0x22430(5)` P2), en cada fila:
   - cuenta los `'9'` del lado y los borra;
   - los vuelve a poner al azar: `k = (rand()/3) % 5`, solo en celdas `'0'`.
3. MIRROR por lado (`0x225b8`): cambia 0↔3 y 1↔4 (↙↔↗ y ↖↘). El centro queda.

RANDOM y la velocidad al azar usan `rand()` sembrado con la hora, así que no son reproducibles (§2.2).

---

## 5. Tiempo y sincronización (exacto) [C]

**Segmento de BPM** (`0x28e8c`, en cada tick del juez):

```
if cambio[0] != 0:
   t_cs = ([0x1ca6c8] * 100) / 240          // entero sin signo
   seg = primer i tal que t_cs < cambio[i]   // i = 0..8; si no hay ninguno, 9
// si cambio[0]==0, seg queda como estaba (0 desde el arranque de la etapa)
```

**Posiciones** (unidad = 1/60 de pulso):

```
off_ticks = (valores[seg] * 15 * 16) / 100          // = valores·2,4, división entera
// en el bucle (0x2c484):
pos3c = chop((t - off_ticks) * BPM[seg])            // [0x1cfb3c]
pos40 = pos3c / 240                                  // [0x1cfb40], división entera con signo
// en el juez (0x28f9c):
posJ  = chop((t - off_ticks) * BPM[seg] * 0.004166667f)
```

- `t` = `[0x1cfb28]`: ticks desde que arrancó la música, monótono y actualizado por el bucle.
- **Fila actual:** `cur = (posJ − 13)·fpp/60 + 1`, con división entera truncada hacia 0. En demo no se resta 13. Si queda < 0 o ≥ 2048, vale 0.
- Por lo tanto la fila `r` del segmento `s` cae en `t = valores[s]/100 + (r/fpp)·60/BPM[s]` segundos desde que arranca la música.
- `cur` se adelanta a esa hora en 1 fila menos 13/60 de pulso. Los 13/60 son la compensación de latencia del original [D: propósito].
- **Inicio:** el reloj (`0x20c6c`) y la música (`0x3d1cc`) arrancan en el mismo cuadro (0x2c0b5–0x2c0cc). El MP3 tiene una cabecera propia de 4 bytes; el decodificador arranca en el primer cuadro MP3 [D].
- **Fin:** la etapa termina cuando `[0x1cfc00]` pasa `[0x1cfc0c]` (§2.6).

---

## 6. Juez `0x28f88` (pseudocódigo fiel) [C]

**Estructura de cada jugador:** P1 en `0x1cfb7c` y P2 en `0x1cfba5` (+0x29 = 41 bytes).

| Desplazamiento | Campo |
|---|---|
| +0x00 | puntaje |
| +0x04 | ratio (float) |
| +0x08 | vida |
| +0x0C | L (factor de vida) |
| +0x10 | contador de la velocidad al azar (filas) |
| +0x14 | combo |
| +0x16 | combo máximo |
| +0x18 | MISS seguidos |
| +0x1A | PERFECT |
| +0x1C | GREAT |
| +0x1E | GOOD |
| +0x20 | BAD |
| +0x22 | MISS |
| +0x24 | fila objetivo |
| +0x26 | tiempo del cartel del juicio |
| +0x28 | último juicio (carácter) |

**Globales:**

| Variable | Qué es |
|---|---|
| `[0x1cfbfc]` | fila actual `cur` |
| `[0x1cfc00]` | fila anterior |
| `[0x1cfc04]` | última fila puntuada de P1 |
| `[0x1cfc08]` | última fila puntuada de P2 |
| `[0x1cfc10]` | bit 0: P1 ya puntuó la fila; bit 1: P2 |
| `[0x1cfc14+4c]` | tiempo de la explosión de la columna c |
| `[0x1cfc3c+4c]` | tiempo de la pisada de la columna c |

```
juez():   // 120 Hz, estado 2, subestado 0
  seg = segmento()                                     // §5
  posJ = ... ; cur = (demo ? posJ : posJ-13)*fpp/60 + 1 ; acotar a [0,2048)
  cur = max(cur, filaAnterior)
  obj[P1] = obj[P2] = cur
  luces_cabina(cur)                                    // 0x27058, §12
  if fpp > 2:                                          // solo con semicorcheas: ver la fila siguiente
     if doble: if fila cur (0..9) no tiene '9': obj[P1] = cur+1
     else:
        if fila cur (0..4) no tiene '9': obj[P1] = cur+1
        if fila cur (5..9) no tiene '9': obj[P2] = cur+1
        obj[P1] = max(obj[P1], ult[P1]); obj[P2] = max(obj[P2], ult[P2])
  // diferencia de tiempo (positiva = antes de tiempo)
  for p in P1,P2:
     d = (obj[p]*60)/fpp - pos40                       // pos40 del bucle (sin el -13)
     j[p] = |d|<=w0 ? '5' : |d|<=w1 ? '6' : |d|<=w2 ? '7' : '8'

  if !demo:
     para cada panel con flanco: tiempoPisada[c] = 0
     // pad 1 (en doble también juzga P1)
     if obj[P1] > ult[P1] and (doble or P1 activo):
        para c en 0..4 con flanco: if tabla[obj][c]=='9': tabla[obj][c] = j[P1]
        para c en 0..4 con flanco: if larga[obj][c]==1: tabla[obj][c] = j[P1]   // cabeza de larga
        para c en 0..4: if larga[obj][c] > 1: tabla[obj][c] = mantenido(c) ? '5' : '9'
     if doble:
        if obj[P1] > ult[P1]: lo mismo para c en 5..9 con el pad 2, usando j[P1]
     else if obj[P2] > ult[P2] and P2 activo:
        lo mismo para c en 5..9 con el pad 2, usando j[P2]

  // cierre de fila: la fila se puntúa cuando ya no queda ningún '9'
  if doble:
     if obj[P1] > ult[P1]: m = max(tabla[obj][0..9])
        if '5' <= m <= '8': puntuar(0, m); bit0 = 1; ult[P1] = obj[P1]
  else:
     P1 con cols 0..4 (bit0, ult[P1]) y P2 con cols 5..9 (bit1, ult[P2]); puntuar(0|1, m)

  // al pasar de fila: la anterior cuenta como MISS si no se puntuó
  if cur != filaAnterior and cur > 0:
     r = cur - 1
     lados = doble ? [(P1, cols 0..9, bit0)] : [(P1, 0..4, bit0), (P2, 5..9, bit1)]
     para cada lado sin su bit:
        m = max(tabla[r][cols])
        demo:  if m=='9': puntuar(p, rand()%10 <7 ? '5' : <9 ? '6' : '7')   // 70/20/10 %
        si no: if m != '0': puntuar(p, '9')                                  // MISS
     if cur > ult[P1]: bit0 = 0
     if !doble and cur > ult[P2]: bit1 = 0
     filaAnterior = cur
     contAzar[P1]-- si >0 ; contAzar[P2]-- si >0
  if BATTLE: if contAzar[P1]==0: velAzar[P1]=0 ; if contAzar[P2]==0: velAzar[P2]=0
```

**Consecuencias exactas que hay que respetar:**

- **Rango para pisar** una nota de la fila r (en 1/60 de pulso, d = posición de la nota − pos):
  - con corcheas (fpp=2), d ∈ (−13, +17];
  - con semicorcheas (fpp=4), d ∈ (−13, +2], o (−13, +17] si la fila anterior ya no tiene notas pendientes.
  - Afuera de ese rango no hay juicio por pisada.
  - Dentro: PERFECT/GREAT/GOOD según w0/w1/w2 y, más allá de w2, **BAD**. Nunca hay "BAD por pisar demasiado tarde": tarde se cierra la fila y es MISS.
- **Ejemplos de ventanas:**

  | BPM | w0 | w1 | w2 | 1/60 de pulso | PERFECT | GREAT | GOOD |
  |---|---|---|---|---|---|---|---|
  | 120 | 4 | 10 | 15 | 8,33 ms | ±33 ms | ±83 ms | ±125 ms |
  | 162 | 5 | 12 | 19 | 6,17 ms | ±31 ms | ±74 ms | ±117 ms |

  A 162 BPM el rango tardío llega a 80 ms y el temprano a 105 ms: casi todo el BAD queda fuera de alcance.
- **Acordes:** cada pisada marca su celda con el juicio de ese momento. La fila se puntúa una sola vez, con el **peor** carácter, cuando todas las celdas están marcadas. Si cuando pasa la fila falta alguna, es **un MISS para toda la fila**, aunque algunas celdas estén marcadas.
- **Largas** (solo formato A):
  - La **cabeza** se juzga solo si se pisa a tiempo (con `j`). Si no se pisa, **no cuenta MISS**: queda `'0'`.
  - Las filas de **cuerpo y cola**, cuando son la fila objetivo, valen `'5'` (PERFECT) si el panel está mantenido y `'9'` si no.
  - Una fila `'9'` del cuerpo se puede volver a pisar (flanco), y entonces se juzga por tiempo. Si queda `'9'` al pasar, es MISS.
  - Cada fila del cuerpo cuenta como un juicio con puntaje y combo.
- **Demo:** no hay pisadas. Cada fila con notas pendientes recibe al pasar un juicio al azar (70 % PERFECT, 20 % GREAT, 10 % GOOD). Las largas no cuentan.
- **Doble pisada:** el mismo flanco puede juzgar dos ticks seguidos si la fila objetivo cambió en el medio (§1.2).

---

## 7. Puntaje, combo, vida y ratio (`0x280b4`) [C]

### 7.1 Por juicio

```
puntuar(p, j):              // S = jugador[p]; G = globales
  // velocidad al azar (opción 0x200): §9.2
  switch j:
   '5' PERFECT: S.puntaje += 1000; S.missSeg = 0; S.perfect++; S.combo++
                S.vida += (12*S.L)/1000; S.L += 20
                if S.combo > 3: S.puntaje += 1000
   '6' GREAT:   S.missSeg = 0; S.combo++; S.puntaje += 500; S.great++
                S.vida += (10*S.L)/1000; S.L += 16
                if S.combo > 3: S.puntaje += 1000
   '7' GOOD:    G.noPG++; S.missSeg = 0; S.good++                 // el combo no cambia
   '8' BAD:     S.bad++; S.combo = 0; G.noPG++; S.missSeg = 0
                S.vida -= 50; S.L += Lmiss/2                       // -350
   '9' MISS:    S.missSeg++; S.miss++; S.combo = 0; G.noPG++
                S.vida += (-500*S.vida)/2000 - 20                  // ≈ -vida/4 - 20
                S.L += Lmiss                                       // -700
  cartel: S.ultimo = j ; S.tiempoCartel = 25                       // BATTLE: ver §10
  if j in {'5','6'}: las celdas no '0' de la fila objetivo del jugador pasan a '1'
                     (la flecha desaparece) y su explosión vuelve a 0
                     // en demo se usa la fila [0x1cfc00]
  S.L = acotar(S.L, Lmin, Lmax)
  if S.vida > 1000: S.vida = 1000
  elif STAGE_BREAK != 0 and STAGE_BREAK-1 <= etapa: if S.vida < 0: S.vida = 0
  elif S.vida < 190: S.vida = 190                                  // no se puede morir
  S.comboMax = max(S.comboMax, S.combo)
  total = P+Gr+Go+B+M
  if total == 0: S.ratio = 0
  elif BATTLE: S.ratio = (P + 0,9·Gr + 0,6·Go + 0,1·B + 0,03·comboMax) / total
  else:        S.ratio = (P + 0,9·Gr + 0,6·Go − 0,5·B − 1,0·M + 0,03·comboMax) / total
  if S.ratio < 0: S.ratio = 0
```

- Todas las divisiones son enteras y truncan hacia 0.
- `G.noPG` = `[0x1cfbf8]`, solo se usa en GAME OVER (§2.6).
- La rama `[0x307904]==1` divide por el total de filas del gráfico y pone `puntaje = ratio·500`. No se usa.
- GOOD y BAD **no consumen la flecha**: siguen bajando con su carácter `'7'`/`'8'` (el dibujo dibuja todo lo que sea > `'2'`, 0x25419).
- El cartel del juicio dura **25 cuadros**. Los primeros 15 se agranda con la tabla 0x13b828 (1,52 → 0,97).
- El **combo** se ve desde 4 (`combo ≥ 4`). Los **MISS seguidos** también desde 4, en rojo [C 0x27dfc, 0x27f43].

### 7.2 LEVEL (GAME OPTION) [C 0x2a6ff]

LEVEL **solo cambia la vida**. No cambia las ventanas ni el puntaje.

| LEVEL | L inicial | Lmin | Lmax | Lmiss |
|---|---|---|---|---|
| EASY (0) | 500 | 200 | 1000 | −700 |
| NORMAL (1, por defecto) | 300 | 100 | 900 | −700 |
| HARD (2) | 100 | 0 | 800 | −700 |

Con NORMAL y L=900, un PERFECT da +10 de vida y un GREAT +9. Después de un MISS, L baja 700 y cuesta 35 PERFECT volver arriba.

### 7.3 Barra de vida [C 0x28a70]

- Largo = `vida·0,001·256` px.
- En BATTLE: `acotar((ratio_propio − ratio_rival + 0,25)·2, 0, 1)·256`. Con ratios iguales se ve la mitad.
- **Aviso de peligro:** si la etapa tiene STAGE BREAK, no es BATTLE y las dos vidas están por debajo de 180, parpadea un sprite cada 2 cuadros.

---

## 8. Fin de etapa, nota y etapas

### 8.1 Pasa o no pasa [C 0x2c387]

Al terminar la canción:
- **CLEAR** si alguno de los ratios es ≥ 0,6 (0x3f19999a).
- **FAIL** si no.

Un jugador ausente queda con ratio 0, así que con uno solo decide él.

### 8.2 Pantalla de resultado (estado 5, `0x2dbe0`) [C]

**Nota:**

| Nota | Sprite de `GRADE.SP2` | Condición |
|---|---|---|
| S (`sss.tga`) | gr0 | ratio ≥ 1,0 **y** MISS = 0 |
| A | gr1 | ratio ≥ 0,9 |
| B | gr2 | ≥ 0,8 |
| C | gr3 | ≥ 0,7 |
| D | gr4 | ≥ 0,6 |
| F | gr5 | menos |

- En BATTLE se muestra WIN o LOSE (gr25/gr26) comparando los ratios, y el puntaje se dibuja como `ratio·100000`.

**Momentos (en cuadros del resultado):**

| Cuadro | Qué pasa |
|---|---|
| >10 | puntaje (7 cifras) |
| >30 | PERFECT |
| >35 | GREAT |
| >40 | GOOD |
| >45 | BAD |
| >50 | MISS |
| >55 | combo máximo (3 cifras cada uno) |
| >100 | nota |
| 30–55 | cada 5 cuadros, efecto 8 (canal 1) de "conteo" |
| hasta 55 | luces 0x600/0x180 alternadas |
| 100 | todas las luces y efecto 9 (canal 2) |
| 110 (no BATTLE) | **voz** según el mejor ratio: ≥0,9 → efecto 23; ≥0,8 → 24; ≥0,7 → 25; ≥0,6 → 26; menos → 27 (canal 6) |
| 60 y 250 | apaga las luces |

- Sale a los 400 cuadros, o con ● después de los 250.

### 8.3 Etapa siguiente (`0x2d90c`) [C]

```
if 0 <= etapa <= 3: ratioEtapa[etapa] = max(ratio[P1], ratio[P2])     // 0x1cfbe0..
etapa++
if etapa == 1 and STAGE_COUNT == "Stage 2 + 1": ratioEtapa[1] = 1,0; etapa = 2
cancionesJugadas += (bandera 0x100 REMIX simple) ? 3 : 1               // [0x2af80c]
if cancionesJugadas >= 4: GAME OVER
switch modo (& 0x7F0):
  0x10 NORMAL, 0x20 HARD, 0x400 CRAZY, 0x80 DOBLE:
       etapa < 3  -> siguiente
       etapa == 3 -> siguiente si ratioEtapa[0], [1] y [2] >= 0,9 (EXTRA); si no, GAME OVER
       otro       -> GAME OVER
  0x40 BATTLE:            etapa < 3 -> siguiente; si no, GAME OVER
  0x100, 0x200, 0x500 (REMIX): etapa < 2 -> siguiente; si no, GAME OVER
  otro: GAME OVER
```

- "Siguiente" es el estado 10. "GAME OVER" es el estado 2 con subestado 3.
- Resultado práctico:
  - "Stage 3 + 1": 3 canciones, y la 4.ª si las tres dieron ≥ 0,9 (nota A o S).
  - "Stage 2 + 1": 2 canciones más la extra. El índice de etapa salta de 0 a 2, así que la pantalla "etapa N" muestra 3 antes de la segunda y 4 antes de la extra (antes de la primera no aparece).
  - REMIX simple: con 3+1 da 2 mezclas; con 2+1, una sola.
  - El FAIL o el HEY MAN terminan el juego en cualquier etapa.

---

## 9. Flechas: velocidad y efectos [C 0x24db0]

### 9.1 Desplazamiento

- Velocidad v = 8, 4 o 2 según el bit más alto de 0x08/0x04/0x02 que esté prendido; si no hay ninguno, 1.
- Para cada fila r visible: `y = v·(pos3c/240) − v·(r·60/fpp)` en píxeles, con división entera.
  - Es decir, **60 px por pulso a x1**.
  - Las flechas vienen de abajo (y negativo) hacia la línea de los receptores.
- Filas dibujadas: desde 2 pulsos atrás (`pos40·fpp/60 − 2·fpp`, mínimo 0) hasta 10 pulsos (`+10·fpp` filas).
- Las celdas con carácter > `'2'` y sin larga se dibujan como flecha (`0x24298`). Las `'1'` (consumidas) y `'0'` no.
- Receptores en y=378 (coordenadas GL de 640×480 con y hacia arriba).
- Columna x (traslación de cada bloque) [C 0x2ca59–0x2cc9d]:

  | Modo | Jugador 1 | Jugador 2 |
  |---|---|---|
  | Simple | x=28 | x=348 |
  | Doble | x=66 | x=311 |

### 9.2 Efectos

| Opción | Efecto |
|---|---|
| **VANISH (0x10)** | alfa 1 si y ≤ −330; `(y+90)·(−1/240)` entre −330 y −90; **0 a menos de 90 px del receptor** |
| **Banda oculta (0x100)** (`0x238b8`) | alfa 1 si y > −30; sube de 0 a 1 entre −120 y −30; **invisible entre −330 y −120** (dibuja otra cosa: `0x224e0`); baja de 1 a 0 entre −420 y −330; 1 si y ≤ −420 |
| **Sin flechas (0x80)** | no se llama a `0x24db0`: no se dibuja ninguna nota (sí receptores y explosiones) [C 0x2ca97] |
| **Velocidad al azar (0x200)** | en `puntuar`, si el contador del jugador está en 0: `velAzar` = 2 o 4 (o queda igual, 1/3 cada uno) por (4..7)·4·fpp filas, o sea 16–28 pulsos. Se combina con OR sobre la velocidad propia y gana la mayor. En doble se sortea para los dos |

- **BATTLE** [C 0x24e00]: cada jugador suma con OR **la velocidad al azar del rival** ("ataque"). Al vencer el contador, vuelve a 0 (0x2a248).

### 9.3 El dibujo también toca las largas [C 0x24f89–0x252d5]

Mientras el panel está mantenido, las filas cuya y pasó −7 no se dibujan, y se dibuja la "tapa" de la larga en el receptor.

Si la última de esas filas es la **cola** (estado 2), el dibujo pone en 0 el estado de larga y la celda (`0x00`) de esa fila y de las 2 anteriores. Así se cierra la larga.

Normalmente esas filas ya se juzgaron antes (la fila actual llega 17/60 de pulso antes). Igual hay que traducir el dibujo junto con el juez para no cambiar casos raros.

---

## 10. BATTLE (bandera 0x40) [C]

- Se entra eligiendo **DOUBLE con dos jugadores**. Lista 5, gráficos `_h`, los dos con el mismo gráfico (0x1000), 3 canciones y sin extra.
- **No hay corte** por vida ni por MISS seguidos. No hay CLEAR ni FAIL: al final va directo a la nota.
- El puntaje y los contadores **siguen de una etapa a la otra**: la estructura no se borra después de la etapa 0.
- Ratio con +0,1 por BAD y sin restar los MISS (§7.1).
- Barra de vida = diferencia de ratios (§7.3). Al final, WIN o LOSE.
- "Ataques": §9.2.
- **Carácter 'A' del cartel:** se mostraría en el primer juicio si `[0x1cfb1c+4p]==0`. Ese valor arranca en 1 en cada etapa y nadie lo pone en 0, así que **no se ve nunca** [C].

---

## 11. Menú de servicio (estado 29, `0x38c5c`) [C]

**Controles:**
- **TEST** mueve el cursor y **SERVICE** elige o cambia.
- Las comparaciones son exactas (`[0x1ca6a8] == 0x10000` / `0x20000`): si en el mismo cuadro llega otro flanco, la pulsación no cuenta.

**En pantalla:**
- Arriba a la izquierda: `"PUMP IT UP (R4/v5.10)"`.
- Arriba a la derecha: `"Mar 08 2001"`.
- Abajo: `MOVE - TEST BUTTON` y `SELECT - SERVICE BUTTON`. En I/O, EEPROM y SCREEN TEST: `EXIT - SERVICE BUTTON`.
- Al entrar (`0x38bf4`) los cursores y los contadores de la traba se ponen en 0.

### 11.1 GAME SETTING (`0x37fcc`)

**Ítems:** I/O TEST, EEPROM TEST, SCREEN TEST, GAME OPTION, COIN OPTION, SOUND TEST, EXIT.
- En cada cuadro hace la prueba de la traba (`0x3d7a8`) y muestra `"Lock OK:%d Err:%d"`.
- **EXIT:** `0x213e0` y estado 0.

### 11.2 I/O TEST (`0x380d4`)

- Resalta TEST, SERVICE, CLEAR y COIN mientras están apretados.
- Dibuja los sensores de los pads: P1 en x=60 y P2 en x=340 (`0x37b7c`).
- Recorre las luces en un ciclo de 250 cuadros, 50 cada una: 0x400 → 0x200 → 0x100 → 0x80 → neón.
- SERVICE sale y apaga las luces.

### 11.3 EEPROM TEST (`0x38304`)

- Al entrar escribe `"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"` (38 bytes) **en el comienzo de la EEPROM**, la lee de nuevo y compara.
- Muestra `WRITE ...`, `READ ...` y `RESULT ...` con SUCCESS o FAIL.
- **No pisa los ajustes**: esos están en +0x70 en adelante (§11.6).

### 11.4 SCREEN TEST

Una cuadrícula blanca. SERVICE sale.

### 11.5 GAME OPTION (`0x38574`)

**8 ítems:**

| Ítem | Variable | Valores (SERVICE los recorre) | Por defecto |
|---|---|---|---|
| LEVEL | `[0x307905]` | 1.EASY / **2.NORMAL** / 3.HARD (0–2) | 1 (NORMAL) |
| STAGE BREAK | `[0x307906]` | **OFF** / 1 Stage / 2 Stage / 3 Stage (0–3) | 0 (OFF) |
| STAGE COUNT | `[0x307907]` | **Stage 3 + 1** / Stage 2 + 1 (0–1) | 0 (3 + 1) |
| DEMO SOUND | `[0x307908]` | **OFF** / ON | 0 (OFF) |
| SHOW HELP | `[0x307909]` | **OFF** / ON | 0 (OFF) |
| DEFAULT SETTING | — | pone los valores por defecto **en memoria** (no graba) | — |
| SAVE AND EXIT | — | graba los 128 bytes en la EEPROM y vuelve | — |
| EXIT | — | vuelve **sin grabar** | — |

- El valor por defecto se dibuja en otro color (0x13bea4).
- Los cambios **rigen enseguida**, aunque se salga con EXIT: se editan las variables en memoria.
- **Qué hace cada opción** (ver §7 y §8):
  - LEVEL: solo el factor de recuperación de la vida.
  - STAGE BREAK: desde qué etapa la vida puede llegar a 0 (OFF = nunca).
  - STAGE COUNT: 3+1 o 2+1 (§8.3).
  - DEMO SOUND: música en la demo de la espera.
  - SHOW HELP: muestra la ayuda (`bga\03.dat`) antes de cada juego.
- La tabla de textos `OFF/MODE1/MODE2` (0x13be64) **no se usa**: SHOW HELP es OFF/ON. Corrige lo que decía el LEEME.
- Esta pantalla pone `[0x307904]=0` en cada cuadro.

### 11.6 COIN OPTION (`0x38878`)

| Ítem | Qué hace |
|---|---|
| COIN SETTING | `[0x30790a]` de 0 a 10: 0 se muestra `FREE` y 1–10 `1 CREDIT / %2d COINS` |
| DEFAULT SETTING | pone **5** (1 crédito cada 5 monedas) |
| SAVE AND EXIT | graba y vuelve |
| EXIT | vuelve |

**EEPROM** (128 bytes en 0x30788c; `0x41205` lee y `0x411b9` escribe palabras desde la dirección 0) [C 0x37e50]:

| Desplazamiento | Contenido |
|---|---|
| +0x00..+0x6F | relleno en 0xFF; la prueba de EEPROM usa el comienzo |
| +0x70 | `'PIU4'` |
| +0x74 | **Adler-32** de los 8 bytes de +0x78 (`0x36854`) |
| +0x78 | `[0x307904]`, sin uso |
| +0x79 | LEVEL |
| +0x7A | STAGE BREAK |
| +0x7B | STAGE COUNT |
| +0x7C | DEMO SOUND |
| +0x7D | SHOW HELP |
| +0x7E | COIN (monedas por crédito) |
| +0x7F | 1, sin uso |

- Al arrancar, si falta `PIU4` (`"Warning - ident mismatch"`) o falla la suma (`"Warning - EEPROM chksum err"`):
  - llena todo con 0xFF;
  - pone los valores por defecto (NORMAL, OFF, 3+1, OFF, OFF, **5 monedas**);
  - graba.

### 11.7 SOUND TEST (`0x38a58`)

| Ítem | Qué hace |
|---|---|
| AUDIO #nn | cada SERVICE suma 1 (1 → 48, vuelve a 1; arranca en 0) y toca `AUDIO\%02d.AUD` con el modo R si está activo |
| EFFECT SOUND #nn | cada SERVICE suma 1 (0 → 36, vuelve a 0) y toca el efecto en el canal 0 |
| EXIT | sale |

- TEST mueve y además corta la música y los efectos.
- `piu.bin` solo define 35 efectos (0–34). El 35 y el 36 leen fuera de la tabla [D].

---

## 12. Sonido y luces de la cabina

**Músicas** (`0x3cd74` prepara y `0x3d1cc` arranca; `0x3d1e0` corta) [C]:

| Audio | Dónde suena |
|---|---|
| 01 | apertura (1 de cada 7) |
| 02 | selección |
| 03 | ayuda |
| `D%02d` | vista previa |
| `%02d` o `r%02d` | canción (o modo R) |
| 49 | **final** (es el audio de la canción 49 "koul"; solo desde la consola) |

Los audios 80 y 81 y la variante 01' no se usan en el código [C: no hay más llamadas].

**Efectos** (`0x42169(0, nº, canal)`, chip en el puerto 0x2a0, parámetros de `piu.bin` en `[0x72222c + 16·nº]`) [C]:

| Nº | Canal | Cuándo |
|---|---|---|
| 0 | 0 | moneda (crédito incompleto) |
| 21 | 0 | crédito completo, o SERVICE en FREE |
| 3 | 2 | sumarse, saltear la ayuda, cada pisada en la selección |
| 2 | 1 | se aceptó un código |
| 7 | 7 | corte por vida o MISS (HEY MAN) |
| 8 | 1 | conteo del resultado |
| 9 | 2 | aparece la nota |
| 23–27 | 6 | voz de la nota |

**Luces de la cabina durante el juego** (`0x27058`) [C]:
- Cuando la fila actual cambia:
  - grupo 0x600 si hay `'9'` en las columnas 0, 3, 5 u 8 (↙ y ↗);
  - grupo 0x180 si hay en 1, 4, 6 o 9 (↖ y ↘);
  - neón (0x400 del puerto 0x2a4) si hay en 2 o 7 (centros).
- Se apagan a los 15 ticks del juez (125 ms) sin cambio de fila.

Las columnas extra 10–12 del formato B **no las lee el código del juego**. Solo las escribe el cargador (0x222e0) [C: no hay acceso directo a `0x29f23a..c`, y todos los recorridos de filas revisados van de 0 a 9].

---

## 13. Mapa de funciones y variables

### 13.1 Funciones [C]

| Dirección | Qué hace |
|---|---|
| `0x21bc8` | `main` del juego (arranque) |
| `0x21738` | bucle principal (teclas, monedas, despacho de estados) |
| `0x20b9c` | interrupción de 240 Hz |
| `0x3a16c` | entradas: flancos, luces de los pads |
| `0x38e30` | lectura multiplexada de los sensores |
| `0x3a0b8` | moneda |
| `0x20b24` / `0x20ae8` / `0x20b48` | monedas / créditos / gastar crédito |
| `0x213e0` | reinicia la rotación de la espera |
| `0x33438` | demo |
| `0x3ad30` / `0x3aebc` | apertura F2 |
| `0x3b064` / `0x3b0f4` | logo (BGA 81) |
| `0x3b160` / `0x3b264` | título |
| `0x3b98c` / `0x3b9ec` | ayuda |
| `0x2e618` / `0x2e6a0` | final |
| `0x3326c` | juego nuevo o etapa siguiente |
| `0x33330` | selección (subestados) |
| `0x3311c` | pantalla "etapa N" |
| `0x30268` | prepara la ruleta |
| `0x2f2bc` / `0x2f1c0` | lee `game.cfg` (MODENAME) |
| `0x32270` | ruleta: dibujo y reloj de 60 s |
| `0x30aa0` | ruleta: entradas, vista previa y confirmación |
| `0x32f90` | sumarse en la selección |
| `0x2ffe4`, `0x2f9f4`, `0x2fcf4` | códigos de opciones |
| `0x32530` | arma `run` (archivo por modo) |
| `0x2eee8` | quita la canción elegida y agrega las ocultas de XX |
| `0x2ebd4` | quita los dobles con dos jugadores |
| `0x2a27c` | `run`: arranque de etapa |
| `0x220f8` / `0x21e70` / `0x3689c` | carga de pasos (B / A / descifrado) |
| `0x21de0` | cuenta filas con notas |
| `0x22430` / `0x225b8` / `0x2262c` / `0x226cc` | RANDOM / MIRROR simple / MIRROR doble / doble simétrico |
| `0x2c04c` | juego (subestados 0–6) |
| `0x2a90c` → `0x28f88` | juez |
| `0x28e8c` | segmento de BPM |
| `0x27058` | luces de la cabina |
| `0x280b4` | puntaje, vida y ratio |
| `0x24db0` | dibujo de las flechas (velocidad, VANISH, largas) |
| `0x238b8` | banda oculta |
| `0x27158` | receptores y explosiones [D] |
| `0x27cc4` | cartel del juicio y combo |
| `0x28a70` | barra de vida |
| `0x22854` | íconos de opciones |
| `0x201f0` | créditos / FREE PLAY |
| `0x2d898` / `0x2dbe0` / `0x2d90c` | nota / resultado / etapa siguiente |
| `0x38bf4` / `0x38c5c` | entrada y despacho del menú de servicio |
| `0x37fcc`, `0x380d4`, `0x38304`, `0x38574`, `0x38878`, `0x38a58` | pantallas del servicio |
| `0x37e50` | EEPROM al arrancar |
| `0x36854` | Adler-32 |
| `0x41205` / `0x411b9` | leer / escribir EEPROM |
| `0x3d6a4` / `0x3d7a8` | traba (desafío y respuesta) |
| `0x3cd74` / `0x3ce70` / `0x3d1cc` / `0x3d1e0` | música / vista previa / play / stop |
| `0x3cfdc` | envío de MP3 a la placa |
| `0x42169` | efecto de sonido |
| `0x3a824` | luces y `piu.bin` |
| `0x39f74` | todas las luces sí/no |
| `0x3a01c` / `0x3a050` / `0x3a084` / `0x39ff4` | luces sueltas |
| `0x3ac10` | patrón de luces del título |
| `0x35fe4` / `0x35e28` / `0x35fb8` | consola: tecla / ejecutar / ejecutar texto |
| `0x10d9a4` / `0x10d9c8` / `0x10d96f` | `rand` / `srand` / `time` |
| `0x10e582` | `__CHP` (truncar el x87) |

**Código muerto** (copias viejas sin llamadas): `0x2a944–0x2c04b` (otra versión del juego), `0x2133c`, `0x2138c`, `0x213ec` y `0x389ee–0x38a56` [C: sin CALL ni JMP que llegue].

### 13.2 Variables globales [C]

| Dirección | Qué guarda |
|---|---|
| `0x1ca6a0` | estado |
| `0x1cfb24` | subestado del juego |
| `0x2afd18` | subestado de la selección |
| `0x307874` | pantalla del servicio (0 menú, 1–7) |
| `0x307878` / `0x30787c` | cursor del servicio / cursor de la subpantalla |
| `0x1ca6a8` / `0x1ca6ac` / `0x1ca6b0` | flancos / soltados / mantenidos (byte 0 P1, 1 P2, 2 botones) |
| `0x1ca6c0` | monedas |
| `0x30790a` | monedas por crédito |
| `0x1ca6c8` / `0x1ca6cc` / `0x1ca6d0` | ticks: canción / libre / espera |
| `0x1cfb28` | t (ticks, monótono) |
| `0x1cfb3c` / `0x1cfb40` | posición ·240 / posición en 1/60 de pulso |
| `0x1cfb50` | segmento de BPM |
| `0x1cfb54` | destello de pulso |
| `0x1cfb60..6c` | ventanas w0–w3 |
| `0x1cfb70` / `0x1cfb74` / `0x1cfb78` | Lmiss / Lmin / Lmax |
| `0x1cfb04` | **etapa** (0–3) |
| `0x1cfb08` | jugadores y **modo** (bits en §3.3 y §3.5; 0x100000 = demo) |
| `0x1cfb0c` / `0x1cfb10` | opciones de P1 / P2 |
| `0x1cfb14` / `0x1cfb18` | velocidad al azar P1 / P2 |
| `0x1cfb7c` / `0x1cfba5` | **estructura de P1 / P2** (§6) |
| `0x1cfbe0..ec` | ratio de las etapas 0–3 |
| `0x1cfbf8` | cantidad de GOOD, BAD y MISS (para GAME OVER) |
| `0x1cfbfc` / `0x1cfc00` / `0x1cfc04` / `0x1cfc08` / `0x1cfc0c` / `0x1cfc10` | fila actual / anterior / última puntuada P1 / P2 / fin / banderas |
| `0x2af80c` | canciones jugadas (REMIX cuenta 3) |
| `0x2b35e8` / `0x2b35e4` | modo de la ruleta / modo anterior |
| `0x2b3600`, `0x2b372c`, `0x2b3858`, `0x2b3984`, `0x2b398c` | listas de canciones, niveles, marcas, cantidades e índices |
| `0x2b3a68` | canción elegida |
| `0x2b3a64` | modo R activo |
| `0x2b3a60` | vista previa sonando |
| `0x2b39f4` | reloj de la selección |
| `0x2ac088` | skin |
| `0x13b7f8` | fondos sí/no |
| `0x13b7e4` | espera sí/no |
| `0x307904..0x30790b` | ajustes (EEPROM) |
| `0x29f230` / `0x2a6230` | tabla de notas / estados de larga |
| `0x29d160..0x29d230` | cabecera de pasos |

---

## 14. Lo que quedó sin resolver

1. **Velocidad del bucle principal:** se supone 60 Hz por la cuenta regresiva. Falta ver el intervalo de intercambio en la capa Glide/Mesa (`grBufferSwap`). Todas las duraciones en "cuadros" dependen de esto.
2. **Precisión del x87:** con 53 o 64 bits según la palabra de control que deja el runtime de Watcom, `chop` de `posJ` y de las ventanas puede diferir en una unidad en casos límite. Conviene mirar la palabra de control al arrancar.
3. **Efectos de sonido:**
   - el chip del puerto 0x2a0 (modelo sin identificar; recibe `piu.bin`, 35 × 16 bytes);
   - los efectos 0–34 no existen como audio en el disco, hay que grabarlos de una cabina o emular el chip;
   - tampoco se sabe qué suena en los efectos 35 y 36.
4. **Sensores de los pads** (`0x38e30`): el detalle del multiplexado en 4 fases y del filtrado de los nibbles no se tradujo. No hace falta para el teclado, pero sí para usar una alfombra real con el mismo comportamiento.
5. **Dibujo y largas** (§9.3): falta traducir `0x24db0` completo (hay una copia por columna) y comprobar contra el juez los casos raros: velocidad x8 y largas muy cortas.
6. **El desfase real entre el arranque del MP3 en la placa y el tick 0**: latencia del decodificador. El código no la trae; se ajusta de oído (el banco de pruebas ya tiene +/−).
7. **`[0x307904]`** ("modo libre"): todo el código existe pero nada lo activa. Puede ser un resto de una versión de evento.
8. **`0x24010`**, que se llama al terminar cada canción: no se leyó, parece limpieza de gráficos [D].
9. **Las dos copias de `[0x1cfb1c]`/`[0x1cfb20]`** ('A' en BATTLE) y **0x2000** solo tienen efecto visual o ninguno. Se documentan pero no se probaron.
10. **Error del modo R** con las canciones 51, 54 y 66 (§3.6): decidir si el port lo reproduce tal cual.
