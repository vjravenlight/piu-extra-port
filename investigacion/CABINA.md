# Cabina: cómo habla `Piu.exe` con el hardware · 04/10/2026

Tarea "cabina" del port exacto. Todo sale de leer `Piu.exe` con radare2 (`-e bin.relocs.apply=true`) y de cruzar los volcados de `investigacion\volcados\`.
Marcas: **[C 0x…]** = confirmado en el código, en esa dirección. **[D]** = deducido (con el motivo).

## 0. Resumen para el port (lo que hay que saber sí o sí)

1. **Todo el hardware de la cabina vive en dos rangos de puertos ISA fijos**, sin PCI ni direcciones variables: `0x2A0–0x2AF` (placa de E/S: pads, botones, luces, EEPROM y chip de efectos) y `0x2D0–0x2DF` (placa de música MP3, con el DAC y la traba). **[C]**
2. **El juego corre con un reloj propio de 240 Hz**: reprograma el PIT y pone su rutina en la interrupción 8. En cada tic lee los sensores, alimenta la placa MP3 y, durante la canción, lee los pads y juzga. **[C 0x3a950, 0x3aae4, 0x20b9c]**
3. **La música la descifra el propio exe en la RAM** y la manda en claro, byte por byte, a la placa (que solo decodifica MP3). **El encabezado de 4 bytes de cada `.AUD`/`.PNZ` es el Adler-32 del contenido descifrado** y también da el corrimiento de la llave. Verificado en los 202 `.AUD` y los 80 `.PNZ`. **[C 0x3bb44]**
4. **La sincronía**: el reloj de la canción cuenta tics de 240 Hz. Arranca en 0 con el primer cuadro MP3 que decodifica la placa y cada 256 cuadros se re-ancla a `cuadros × 6,2688` (≈ 240 × 1152 / 44100). Los pasos se ubican con `(tics − desfase × 2,4) × BPM`; **el desfase de los `.NOT` está en centésimas de segundo**. **[C 0x3d0e0, 0x2ad2a, 0x28f9c]**
5. **Los efectos de sonido no están en el disco.** Los toca un Yamaha YMZ280B desde una ROM de la placa de E/S. `PIU.BIN` es solo la tabla de 35 efectos (direcciones en esa ROM). **[C 0x4271b, 0x42169] / [D] el modelo de chip, por el mapa de registros**
6. **Traba**: solo se consulta en la pantalla I/O TEST. La comprobación del arranque ("Lock OK!!!" / "Lock Error!!!") es **código muerto** (nadie la llama). Para el port alcanza con responder "OK". **[C 0x3d7a8, 0x21024]**
7. **EEPROM**: es una 93C46 (64 palabras de 16 bits) manejada bit a bit. Los ajustes son 8 bytes con identificador `PIU4` y Adler-32. Si fallan, el juego carga los valores de fábrica y la reescribe. **[C 0x37e50, 0x411b9]**
8. **Luces**: hay 10 lámparas de pad, 4 halógenas (en dos pares) y un neón. En el juego se prenden **con las notas de las columnas 0–9** cuando la fila llega al blanco, durante 62,5 ms. **Nadie lee las columnas 10–12 del formato B.** **[C 0x27058, 0x222e0]**
9. **Teclado del BIOS**: F1 = TEST, F2 = SERVICE y F3 = CLEAR **ya existían en el original**, junto con un puñado de teclas de depuración y una consola (tecla `` ` ``). No hay tecla de moneda ni modo teclado para los pads. **[C 0x21759–0x2191a]**

---

## 1. Mapa de puertos

| Puerto | Ancho | Sentido | Qué es | Funciones |
|---|---|---|---|---|
| `0x2A0` | 16 | escritura | YMZ280B: registro índice | 0x41242 (`outpw` + espera) |
| `0x2A2` | 16 | lectura/escritura | YMZ280B: dato / estado (voces terminadas) | 0x41242, 0x41265 |
| `0x2A4` | 16 | escritura | Salidas A: multiplexor de sensores (bits 0–1), luces del pad P1 (bits 2–6), neón (bit 10) | sombra `[0x30792c]` |
| `0x2A6` | 16 | escritura | Salidas B: multiplexor (bits 0–1), luces del pad P2 (2–6), halógenas (7–10), contador de monedas (bit 12) | sombra `[0x30792e]` |
| `0x2A8` | 16 | lectura | Entradas A: sensores P1 (bits 0–4) y botones (bits 9, 10, 14, 15) | 0x38e30, 0x3a16c, 0x3a0b8 |
| `0x2AA` | 16 | lectura | Entradas B: sensores P2 (bits 0–4) | 0x38e30 |
| `0x2AC` | 16 | escritura | EEPROM: CS (bit 0), SK (bit 1), DI (bit 2); el bit 4 siempre en 1 | sombra `[0x13d680]` (vale 0x10 al arrancar) |
| `0x2AE` | 16 | lectura | EEPROM: DO (bit 0) | 0x41032, 0x40ea0 |
| `0x2D4`, `0x2D6`, `0x2DC` | 16 | escritura | Placa de música: selección de modo antes de cada acceso (`0x2D4←0x100, 0x2D6←1` = salida; `0x2D4←0x80, 0x2D6←0` = lectura/datos; `0x2DC←0xFFF7`, leer `0x2DA`, `0x2DC←0xFFFF`) | todas las de 0x3bd68–0x3d6a4 |
| `0x2DA` | 16 / 8 | lectura/escritura | Placa de música: bytes MP3 (escritura de 8 bits), estado (bits 0–2), I²C del DAC (bits 0–1), traba (bits 2–5) | sombra `[0x13c390]` |
| `0x40`, `0x43` | 8 | escritura | PIT canal 0 (modo 2) | 0x3a950, 0x3abe0 |
| `0x20` | 8 | escritura | Fin de interrupción (EOI) del PIC | 0x3ab7d |

No hay lecturas de `0x3DA` (retrazado vertical) ni de `0x60` (teclado directo). El teclado se lee por `int 0x16`. **[C: búsqueda de patrones en todo `codigo_0x20000.bin`]**

---

## 2. Entradas

### 2.1 Sensores de los pads (4 por panel, multiplexados)

- Cada panel tiene **4 sensores**. La placa entrega uno a la vez: el juego elige cuál con los **bits 0–1 de `0x2A4` y de `0x2A6`** (los mismos en los dos) y lee `0x2A8` (P1) y `0x2AA` (P2). **[C 0x38e52, 0x3927f, 0x396c2, 0x39b0b]**
- **0x38e30** (en cada tic de 240 Hz): primero lee `0x2A8` 200 veces como pausa. Después avanza el contador `[0x307914]` y, según `contador & 3`, pone el multiplexor en 0, 1, 2 o 3 y lee las dos entradas. **Cada sensor se refresca cada 4 tics (60 Hz).** **[C 0x38e36, 0x39f52]**
- **Lógica activa baja**: `not` sobre lo leído; 1 = pisado. **[C 0x39340, 0x393f7]**
- El estado queda en dos estructuras de 5 nibbles, una por jugador: `[0x307930]` (P1) y `[0x307934]` (P2). El nibble *k* corresponde al bit *k* de la entrada, y el bit *s* del nibble al sensor *s*. Antes de escribir el sensor *s* se borra su bit con las máscaras 0xE, 0xD, 0xB y 0x7. **[C]**
- Un panel cuenta como pisado si **cualquiera** de sus 4 sensores lo está (nibble ≠ 0). **[C 0x3a198–0x3a22b]**

### 2.2 Del panel a la columna (la tabla clave)

**0x3a16c** reordena los bits de la placa a los bits del juego. Esos bits, a su vez, van a las columnas, según cómo los usa el juez (`0x2ab25c + 4·col`, en 0x233f2) y según la tabla de luces de la pantalla de título (0x13bf1c). Las dos fuentes coinciden. **[C 0x3a198, 0x233f2–0x23495, 0x3ac10]**

| Bit de `0x2A8` / `0x2AA` | Bit del juego P1 / P2 | Columna (P1 / P2) | Flecha | Luz (bit en `0x2A4` / `0x2A6`) |
|---|---|---|---|---|
| 0 | `0x08` / `0x0800` | 1 / 6 | ↖ | `0x04` |
| 1 | `0x10` / `0x1000` | 3 / 8 | ↗ | `0x08` |
| 2 | `0x04` / `0x0400` | 2 / 7 | ● | `0x10` |
| 3 | `0x01` / `0x0100` | 0 / 5 | ↙ | `0x20` |
| 4 | `0x02` / `0x0200` | 4 / 9 | ↘ | `0x40` |

- Bit de la placa → bit del juego → columna: **[C]**.
- Nombre de cada flecha: **[D]**. Supone la columna 0 = ↙, como en `FORMATOS.md`. Lo refuerza que el orden de la placa (↖ ↗ ● ↙ ↘) es el orden habitual de las placas de E/S de Andamiro, y que la luz de cada panel es siempre `bit de placa + 2`.

### 2.3 Botones de servicio y monedero (en `0x2A8`, activos bajos)

| Bit de `0x2A8` | Botón | Bit en las palabras del juego | Dirección |
|---|---|---|---|
| 9 (`0x0200`) | TEST | `0x00010000` | **[C 0x3a240]** |
| 14 (`0x4000`) | SERVICE | `0x00020000` | **[C 0x3a24c]** |
| 15 (`0x8000`) | CLEAR | `0x00040000` | **[C 0x3a258]** |
| 10 (`0x0400`) | COIN | `0x00100000` (solo en "apretado"; ver 2.5) | **[C 0x3a234, 0x3a0dd]** |

La pantalla I/O TEST confirma el orden: "1.TEST" mira el bit `0x01` de `[0x1ca6b2]`, "2.SERVICE" el `0x02`, "3.CLEAR" el `0x04` y "4.COIN" el `0x10`. **[C 0x380eb–0x3818d]**

### 2.4 Variables globales de entrada

| Variable | Qué guarda |
|---|---|
| `[0x1ca6b0]` (32 bits) | **Apretado ahora**: pads (bits 0–4 y 8–12) y botones (16, 17, 18 y 20) |
| `[0x1ca6a8]` (32 bits) | **Recién apretado**: flancos acumulados. Se pone en 0 al empezar cada cuadro del bucle principal **[C 0x2175b]** y la lectura le suma con OR **[C 0x3a4ee]** |
| `[0x1ca6ac]` (32 bits) | **Recién soltado**, en el último tic **[C 0x3a505]** |
| `[0x30791c]` | Estado anterior, para calcular los flancos |
| `[0x307920]`, `[0x307924]`, `[0x307928]` | Temporales de 0x3a16c: actual, flanco de bajada y flanco de subida |
| `[0x307930]` / `[0x307934]` | Nibbles de sensores de P1 / P2 |

### 2.5 Cuándo se leen

- **Durante la canción** (estado `[0x1ca6a0] == 2`): la rutina de 240 Hz llama a 0x3a16c y después a 0x2a90c, que a su vez llama al **juez 0x28f88** si el subestado `[0x1cfb24] == 0`. Así los pisotones se registran con resolución de 4,17 ms y nunca se pierden entre cuadros. **[C 0x20c38–0x20c46, 0x2a90c]**
- **En las demás pantallas**: una vez por cuadro, desde el bucle principal. **[C 0x2191c–0x21925]**
- El flanco de COIN no pasa por `[0x1ca6a8]`. Lo maneja 0x3a0b8, que se llama cada 2 tics (**120 Hz**). **[C 0x20bd1–0x20bde]**

### 2.6 Antirrebote

- **Pads**: no tienen antirrebote explícito. Solo cuentan el OR de los 4 sensores y el muestreo rotativo (cada sensor a 60 Hz; un pisotón aparece en ≤ 4 tics = 16,7 ms). **[C]**
- **Monedero** (0x3a0b8): el contador `[0x13beec]` arranca en 240 y sube hasta 240. Una moneda nueva (flanco 0→1) **vale solo si el contador pasó de 8**; al aceptarla se pone en 0. O sea: **como mínimo 9 llamadas (75 ms) entre monedas**. Además se prende el **contador mecánico** (`0x2A6` bit 12, sombra `[0x30792f]` bit 4) y se apaga cuando el contador llega a 12 (**100 ms**). **[C 0x3a0bd–0x3a15b]**

### 2.7 Qué hace cada botón

| Botón | Efecto | Dirección |
|---|---|---|
| TEST | Desde las pantallas de espera, título, selección y final entra al menú de servicio (estado 0x1C, luego 0x1D). Durante la canción: subestado 5 → para la música, apaga las luces y va al estado 0x1C | **[C 0x3aec2, 0x2dbe9, 0x2e6a2, 0x3b0f7, 0x3b9ee, 0x2a91a, 0x2d767–0x2d7bb]** |
| TEST (en el menú) | Mueve el cursor. Se compara la **palabra entera**: `[0x1ca6a8] == 0x10000` | **[C 0x386dc, 0x38912]** |
| SERVICE (en el menú) | Elige o sale (`== 0x20000`) | **[C 0x38704, 0x38938]** |
| SERVICE (fuera del menú) | **Suma una moneda**, igual que el monedero, salvo en juego libre | **[C 0x21933–0x21984]** |
| CLEAR | **Borra las monedas** (`[0x1ca6c0] = 0`). Durante la canción: subestado 6 → corta la partida y vuelve al estado 0 | **[C 0x21989–0x2199d, 0x2d7cf–0x2d825]** |
| CLEAR (en el menú, estado 0x1D) | Conmuta `[0x1ca6bc]`: **muestra en la partida el reloj de sincronía** (`"%02d:%02d:%02d %6d"`, es decir mm:ss:centésimas y cuadros MP3 decodificados) | **[C 0x219ac, 0x2b8f9–0x2b968]** |
| COIN | Suma una moneda | **[C 0x20be7–0x20c33]** |

### 2.8 Monedas y créditos

- `[0x1ca6c0]` cuenta **monedas**, no créditos. `[0x30790a]` = monedas por crédito (EEPROM; 0 = FREE). `[0x307904] == 1` también fuerza juego libre.
  - 0x20ae8 devuelve los créditos (`monedas / monedasPorCrédito`; 99 si es libre).
  - 0x20b24 devuelve las monedas (99 si es libre).
  - 0x20b48 descuenta un crédito.
  **[C]**
- Sonido: cada moneda toca el efecto #0. La moneda que completa un crédito toca el **#21** (`0x15`). Los dos en la voz 0. **[C 0x20c1d–0x20c33]**
- La demo de la pantalla de espera se corta apenas hay alguna moneda (0x20b24 ≠ 0) o a los **8400 tics (35 s)**. **[C 0x2c16e–0x2c181]**

---

## 3. Luces de la cabina

### 3.1 Bits de salida (1 = prendida)

| Puerto | Bits | Qué es |
|---|---|---|
| `0x2A4` | 0–1 | multiplexor de sensores (no es luz) |
| `0x2A4` | 2–6 | luces del pad P1 (ver la tabla 2.2) |
| `0x2A4` | 10 (`0x400`) | **neón** (luces bajas) **[D]** |
| `0x2A6` | 0–1 | multiplexor de sensores |
| `0x2A6` | 2–6 | luces del pad P2 |
| `0x2A6` | 7–8 (`0x180`) | **par de halógenas B** |
| `0x2A6` | 9–10 (`0x600`) | **par de halógenas A** |
| `0x2A6` | 12 (`0x1000`) | contador mecánico de monedas |

- Todos los bits, **[C 0x39f74]**: "todas prendidas" = `0x2A4 |= 0x47C` y `0x2A6 |= 0x7FC`.
- Los demás bits se preservan siempre (máscaras `0xFB83` y `0xF803`). No encontré que nadie los use.
- Funciones (todas escriben la sombra y hacen `out` de la palabra entera):
  - 0x39f74(prender): todas;
  - 0x3a050(on, máscara) → `0x2A4`;
  - 0x3a084 y 0x3a01c (on, máscara) → `0x2A6`;
  - 0x39ff4(on) → el neón.
- **[D]** Las 4 halógenas, de a pares en diagonal: ↙ y ↗ prenden el par A; ↖ y ↘, el par B (ver 3.2). Sugiere que cada par es una diagonal del cartel. Qué bit es cada lámpara física no se puede saber desde el código.

### 3.2 Cuándo se prenden

| Momento | Regla | Dirección |
|---|---|---|
| Arranque | Todas prendidas 500 ms, después apagadas | **[C 0x3a824]** |
| Durante la canción (no en la demo) y en I/O TEST | **Luz de pad = panel pisado**: se prende con el flanco de bajada y se apaga al soltar | **[C 0x3a51f–0x3a81c]** |
| Durante la canción | Cuando la **fila actual** (la que llega al blanco) cambia y tiene notas: ↙ o ↗ (col. 0, 3, 5, 8) → par `0x600`; ↖ o ↘ (col. 1, 4, 6, 9) → par `0x180`; ● (col. 2, 7) → neón. **Se apagan 15 llamadas después = 62,5 ms** (el juez corre a 240 Hz) | **[C 0x27058]**, llamada desde el juez en 0x2905e |
| Pantalla de título (estado 0x14) | Cada **20 cuadros** avanza un paso de una secuencia de 8 (tabla `0x13bf1c`: ↙ + A, ↖ + B, ↗ + A, ↘ + B, ● + neón, todo apagado, todo prendido, todo apagado) | **[C 0x3b326–0x3b347, 0x3ac10]** |
| I/O TEST | Rueda de 5 lámparas, 50 cuadros cada una: `0x400` → `0x200` → `0x100` → `0x080` (en `0x2A6`) → neón | **[C 0x381c4–0x3828e]** |
| Fin de partida o servicio | Todas apagadas (0x39f74(0)) | **[C]** |

### 3.3 Las columnas extra 10–12 del formato B

- El cargador del formato B escribe un `'1'` en los bytes 10–12 de cada fila de 14 bytes (`0x29f230 + fila·14`) cuando están marcadas. Después convierte en `'9'` (nota) **solo** los `'1'` de las columnas 0–9. **[C 0x22288–0x22327]**
- **No hay ninguna lectura de los bytes 10–12.** Busqué referencias directas a `0x29f23a`–`0x29f23c` y todos los recorridos de filas: el contador (0x21de0), los espejos y el juez recorren 5 o 10 columnas. **[C por ausencia]**
- **[D]** Son marcas de pulso y compás que dejó el editor de pasos. La cabina no las usa: sus luces salen de las notas (0x27058).
- Para el port: se pueden mostrar como pidió Charles. Pero las luces **originales** se reproducen con la regla de 0x27058.

---

## 4. Sonido

### 4.1 Música: placa MP3 en `0x2D0–0x2DF`

**Carga** con 0x3cd74(nº), 0x3ce70(nº, vista previa) y 0x3cf34(nombre). Todas pasan por 0x3bb44. **[C]**
1. Abre el archivo, con 2 reintentos si falla.
2. Lee **4 bytes de encabezado = Adler-32** del contenido descifrado (función 0x36854, módulo 65521).
3. Lee todo el archivo en bloques de 1 KB al búfer `0x30a8d8` (hasta 0x27FA60 bytes = 2,6 MB).
4. **Descifra en la RAM**: `claro[i] = espejo_de_bits(cifrado[i]) XOR llave[(encabezado + i) & 0x3FF]`, con la llave de 1024 bytes en **`0x13bf90`** de los datos. Es la misma de `tools\llave_audio_1024.bin`, rotada 518 posiciones.
5. Compara el Adler-32 con el encabezado. Si no coincide, lo anota en el registro y suma a `[0x1ca6b4]`.

**Verificación propia**: los 202 `.AUD` y los 80 `.PNZ` cumplen `encabezado == Adler-32` con esta fórmula. **El corrimiento ya no hace falta buscarlo**: es `encabezado mod 1024` (con la llave del exe). Para pasar a `FORMATOS.md`.

**Envío** desde la rutina de 240 Hz (0x3cfdc). **[C 0x3cfdc–0x3d1bd]**
- Si `[0x30a8d4] == 1` (parado), no hace nada.
- Si no:
  1. Pone la placa en modo datos (`0x2D4←0x80, 0x2D6←0`).
  2. Lee el estado de `0x2DA`.
  3. Mientras el **bit 0** = "pide datos", espera el **bit 1** = "listo" y hace `out 0x2DA, byte`.
  4. Manda **como mucho 100 bytes por tic** (24 KB/s; el MP3 de 128 kbps necesita 16 KB/s).
- Los bytes van **en claro**: lleva la cuenta de los cuadros leyendo el bit de relleno de cada cabecera MP3 del búfer (417 o 418 bytes por cuadro).
- **Conclusión: la placa no descifra nada; solo decodifica MP3.** Los 72 a 335 bytes de basura del principio de algunos archivos se mandan igual: el decodificador los saltea al buscar la sincronía.

**Estado y control**:
- `[0x30a8d4]`: 1 = parado, 2 = sonando.
  - 0x3d1cc pone a sonar.
  - 0x3d1e0 para y silencia.
  - 0x3d1f8 lee el estado.
- Fin de archivo: pasa a parado y silencia. **[C]**
- Otras variables:
  - `[0x30a8c0]` = posición en el búfer;
  - `[0x30a8c4]` = tamaño;
  - `[0x30a8b4]` = cuadros enviados;
  - `[0x30a8b0]` = **cuadros decodificados** (ver 4.4).

**Volumen (DAC por I²C)**: los bits 0 (SCL) y 1 (SDA) de `0x2DA` en modo salida (0x3bd68 manda un byte; 0x3be9c es el START). **[C]**
- Dirección `0x9A`, registro `0xC2`.
- Valores: `0x2C, 0x2C` = volumen normal (0x3bfe0); `0x01, 0x01` = silencio (0x3c3ac).
- Al cargar una canción queda en silencio. Se abre recién cuando ya se mandaron 1900 bytes, para que no haga ruido al empezar. **[C 0x3d073–0x3d088]**
- **[D]** El chip es un Micronas DAC 3550A (dirección 0x9A, registro AVOL 0xC2), así que el decodificador sería su pareja habitual, el MAS 3507D. El juego no lo configura por I²C.

**Qué archivo suena dónde**: **[C]**

| Archivo | Dónde suena | Dirección |
|---|---|---|
| `01` | intro | 0x3addb |
| `02` | selección de canción | 0x302fe |
| `03` | pantallas 0x16 y 0x17 | 0x3b95b, 0x3b9d1 |
| `49` | final (*ending*) | 0x2e671 |
| `D%02d` | vista previa de la canción elegida | 0x30d43 |
| `AUDIO #nn` del SOUND TEST | de 1 a 48 | 0x38a17 |

**Versión `r`** (el archivo `AUDIO\r%02d.AUD`):
- Se usa si `[0x2b3a64] == 1`, que vale `([0x1cfb09] & 8) != 0` (un modificador del jugador; F5 lo conmuta en depuración). **[C 0x32eff]**
- Las canciones de la tabla `0x13c394` (21 números) usan la versión normal. **[C 0x3cd7a]**
- Al cargar los pasos, el BPM se reemplaza por el de la tabla `0x13b864`, indexada por canción, y el desfase se escala por `BPM viejo / BPM nuevo`. **[C 0x22352–0x223a1]**
- **[D]** Es la canción acelerada: la 60 pasa de 162 a 194,4 BPM (× 1,2).

### 4.2 Efectos: Yamaha YMZ280B en `0x2A0` / `0x2A2`

**Por qué es un YMZ280B [D]**:
- Registros `0x00+4v` tono, `0x01+4v` modo, lazo y llave, `0x02+4v` volumen, `0x03+4v` paneo, y `0x20/0x40/0x60+4v` direcciones alta, media y baja. Son 8 voces.
- `0x84–0x87`: acceso a la memoria externa. `0xFE = 0xFF` (máscara de interrupciones) y `0xFF = 0xD0` (habilita llave, memoria e interrupciones) en la inicialización 0x41539.
- La frecuencia base de 41 666,67 Hz (16 MHz / 384) aparece en 0x415e8.

**Tabla de efectos** = `PIU.BIN`, leída al arrancar por 0x4271b. Son 35 entradas de 16 bytes, en `0x72222c + n·16`. **[C 0x3a8c6–0x3a8d4, 0x4271b]**

| Byte | Qué es |
|---|---|
| 0 | tono (FN) |
| 1 | modo y lazo (`0x20` = ADPCM de 4 bits; `|0x10` = lazo; `|0x80` = sonando) |
| 2 | volumen |
| 3 | paneo (8 = centro) |
| 4–7 | bytes **altos** de inicio, inicio del lazo, fin del lazo y fin |
| 8–11 | bytes **medios** de los mismos cuatro |
| 12–15 | bytes **bajos** de los mismos cuatro |

- Esto explica el `FF 20 FF 08` de cada fila: velocidad completa, ADPCM, volumen máximo y centro.
- Las direcciones son contiguas, de `0x000000` a `0x1AF231` (1,7 MB). **Nada sube esas muestras al chip**: los cargadores de muestras "YAD." (0x41689, 0x41936) y las pruebas de memoria (0x413d9, 0x41495) existen pero nadie los llama. **[C por ausencia de llamadas]**
- **[D] Las muestras están en una ROM de la placa de E/S y no vienen en el disco.** La tabla completa está en el anexo A.

**Funciones del chip** (clasificadas por error como "libc" en el mapa):

| Dirección | Función |
|---|---|
| 0x41539 | Inicializa. Base `[0x723444] = 0x2A0` |
| 0x41c48 | Reinicia: apaga las 8 voces y borra las tablas |
| **0x42169(lazo, efecto, voz)** | **Toca el efecto en una voz fija**. Es la única que usa el juego |
| 0x41cde | Toca en una voz libre. Lee el estado en `0x2A2` y, si no hay libre, usa la más vieja. Nadie la llama |
| 0x4252e | Corta el efecto ("KeyOff") |
| 0x425a5 | Vuelve a prenderlo ("Key ON") |
| 0x42632 | Volumen de 0 a 255 |
| 0x426ae | Paneo de 0 a 15 |

**Los mensajes `Play %x`, `Key ON %x` y `KeyOff %x`** se mandan a 0x4128b, que es `xor eax, eax; ret`: un printf de depuración apagado. No son comandos a la placa. **[C 0x4128b]**

**Usos en el juego** (todas las llamadas a 0x42169): **[C]**

| Efecto | Voz | Dónde |
|---|---|---|
| #0 | 0 | moneda (sin completar crédito) |
| #21 | 0 | crédito completo (moneda o SERVICE) |
| #2 | 1 | cambio de canción en la selección (P1 / P2) — 0x2face, 0x2fdd1 |
| #3 | 2 | confirmar o empezar — 0x3023d, 0x3025c, 0x32fbf, 0x3300e, 0x3b882, 0x3ba66 |
| #7 | 7 | fin de etapa: se para la música y suena el 7 — 0x2ab34, 0x2abde, 0x2c25c, 0x2c306 |
| #26 o #27 | 6 | resultado — 0x2e5cd |
| SOUND TEST "EFFECT SOUND #nn" | 0 | efectos 0–36 con lazo. Del 35 en adelante, la tabla está vacía y no suena |

### 4.3 Sincronía entre música y pasos (lo más importante)

**Relojes** (todos en tics de 240 Hz; ver 5.4):

| Variable | Qué es | Funciones |
|---|---|---|
| `[0x1ca6cc]` | tics desde el arranque | 0x20c50 |
| `[0x1ca6d0]` | tics desde el último reinicio | lee 0x20c58, reinicia 0x20c60 |
| **`[0x1ca6c8]`** | **reloj de la canción** | fija 0x20c6c, lee 0x20c74 |

**Cómo se mueve el reloj de la canción**:
1. Cada tic la rutina de 240 Hz le suma 1. **[C 0x20bac–0x20bc1]**
2. Al arrancar la partida (subestado 0, primer cuadro):
   - para (0x3d1e0);
   - pone a sonar (0x3d1cc), salvo en la demo con DEMO SOUND en OFF;
   - **reloj = 0** (0x20c6c(0)). **[C 0x2c096–0x2c0cc]**
3. En cada tic, 0x3cfdc mira el **bit 2 de `0x2DA`**, que la placa invierte **una vez por cuadro MP3 decodificado**. Cada cambio suma uno a `[0x30a8b0]`. Cuando la cuenta, antes de sumar, es múltiplo de 256, hace **reloj = round(cuenta × 6,2688)** (float `0x40c89a02` en `0x130aeb`). **[C 0x3d0c6–0x3d11e]**
   - El **primer cuadro decodificado pone el reloj en 0** de nuevo. Así se descuenta la demora de arranque del decodificador.
   - Después corrige cada 256 cuadros (6,7 s).
   - **[D]** Que el bit 2 marque cuadros se deduce de la constante: 240 × 1152 / 44100 = 6,2694 tics por cuadro.
4. El juego, una vez por cuadro de video: `t = máx(reloj, t anterior)`. Nunca retrocede y nunca baja de 0. **[C 0x2ad2a–0x2ad5c, gemela 0x2c452]**
5. Posición en los pasos. **[C 0x2ad6e–0x2adc9]**
   - `seg` = tramo de BPM, por 0x28e8c (ver abajo).
   - `[0x1cfb3c] = (t − desfase[seg] × 240 / 100) × BPM[seg]`.
   - `[0x1cfb40] = [0x1cfb3c] / 240` = **posición en sesentavos de pulso**.
   - `desfase[]` = `[0x29d188 + 4·seg]` = **los "valores" de la cabecera del `.NOT`, en centésimas de segundo**. Un 10 equivale a 24 tics = 0,1 s.
   - `BPM[]` = `[0x29d160 + 4·seg]`.
6. **Tramo de BPM** (0x28e8c): `centésimas = t × 100 / 240`. `seg` = cantidad de puntos de cambio `[0x29d1b0 + 4·i]` ya pasados. **Los "cambios de BPM" de la cabecera están en centésimas de segundo**: el 8220 de la mezcla 29 cae a los 82,2 s. **[C 0x28e9b–0x28f79]**
7. El juez (0x28f88, a 240 Hz) usa el mismo `t` del último cuadro. **[C 0x28ff7–0x29014]**
   - `fila = ((posición en sesentavos − 13) × filasPorPulso) / 60 + 1`.
   - En la demo, sin el −13.

**Fórmula para el port**, con `a` = segundos de audio desde el comienzo del primer cuadro del MP3:
```
tics = a × (44100 / 1152) × 6,2688 ≈ a × 239,977
```
- Corresponde a la corrección cada 256 cuadros. Entre correcciones, el original avanza a 240,03 tics por segundo, una diferencia de menos de 1,5 ms.
- El error del original contra el tiempo real es −0,0094 % (unos 9 ms al final de una canción de 100 s).
- **[D]** El cero del original es "el primer cuadro decodificado". La demora de salida de la placa no se puede medir desde el código. Conviene dejar la perilla de desfase de oído del prototipo.

**Otros tiempos**: **[C]**
- Entre cargar la canción (0x3cd74) y arrancar hay como mínimo **1200 tics (5 s)** de espera (0x2a86a).
- La demo dura como máximo **8400 tics (35 s)**.

---

## 5. Traba, EEPROM, `PIU.BIN` y reloj

### 5.1 Traba (*lockchip*)

- Está en la **placa de música**, en los bits 2–5 de `0x2DA`. **[C 0x3d324]** Es un intercambio serie, con interrupciones desactivadas:
  - bit 3 = selección (activa baja);
  - bit 4 = reloj;
  - bit 5 = dato, que sale invertido y se lee en modo lectura;
  - se manda el bit menos significativo primero.
- **0x3d7a8** es la consulta. **[C]**
  1. Elige el desafío `i = contador % 100` (`[0x308834]`).
  2. Manda `largo[i]` bytes (`0x13d130`, entre 5 y 14) desde `0x13c3e8 + 17·i`.
  3. Recibe la respuesta en `0x308858` y la compara con la tabla de respuestas esperadas.
  4. Devuelve 1 = OK. Cuenta los aciertos en `[0x58a33c]` y los errores en `[0x58a338]`.
- **Dónde se usa**: **solo en I/O TEST**. Cada cuadro llama a 0x3d7a8 y muestra `Lock OK:%d Err:%d` con `[0x307884]` y `[0x307888]`. **[C 0x38087–0x380b7]**
- **0x21024** ("Lock OK!!!" en verde y 5 s de espera, o "Lock Error!!!" en rojo y 10 s; 500 consultas seguidas) **no lo llama nadie**. Busqué llamadas, saltos y punteros en el código y en los datos. **[C por ausencia]** El juego arranca igual aunque la traba falte.
- **Para el port**: 0x3d7a8 → devolver 1 siempre. I/O TEST va a mostrar `Lock OK:n Err:0`.

### 5.2 EEPROM

**Chip y protocolo** [D: 93C46 en modo de 16 bits, por el protocolo]:
- Bit a bit por `0x2AC` (bit 0 = CS, bit 1 = SK, bit 2 = DI) y `0x2AE` (bit 0 = DO). **[C 0x40ea0–0x41205]**
- Cada orden: bit de inicio, 2 bits de código y 6 bits de dirección; después 16 bits de datos.
  - Códigos: LEER = `10`, ESCRIBIR = `01`; `00 11xxxx` habilita la escritura, `00 00xxxx` la deshabilita.
- Después de escribir espera DO = 1.
- 0x41205(búfer, bytes) lee y 0x411b9(búfer, bytes) escribe, desde la palabra 0.

**Contenido**: 128 bytes que se leen a `0x30788c` al arrancar (0x37e50). **[C]**

| Desplazamiento | Variable | Qué es | Fábrica |
|---|---|---|---|
| 0x00–0x6F | — | sin uso conocido. EEPROM TEST escribe ahí el abecedario de prueba (38 bytes) y lo vuelve a leer | — |
| 0x70 | `[0x3078fc]` | identificador `'PIU4'` (`0x34554950`) | — |
| 0x74 | `[0x307900]` | **Adler-32** de los 8 bytes siguientes | — |
| 0x78 | `[0x307904]` | marca de juego libre (1 = libre); GAME OPTION y el arranque la ponen en 0 | 0 |
| 0x79 | `[0x307905]` | LEVEL: 0 = EASY, 1 = NORMAL, 2 = HARD | 1 |
| 0x7A | `[0x307906]` | STAGE BREAK: OFF, 1 Stage, 2 Stage, 3 Stage | 0 |
| 0x7B | `[0x307907]` | STAGE COUNT: 0 o 1 | 0 |
| 0x7C | `[0x307908]` | DEMO SOUND: OFF / ON | 0 |
| 0x7D | `[0x307909]` | SHOW HELP: OFF / ON | 0 |
| 0x7E | `[0x30790a]` | monedas por crédito, de 0 a 10 (0 = FREE) | **5** |
| 0x7F | `[0x30790b]` | sin uso conocido | 1 |

- Fuentes: menús **[C 0x38574, 0x38878]**; textos **[C tablas 0x13be18–0x13be70]**.
- **SHOW HELP tiene 2 valores (OFF / ON)**, no tres como suponía el `LEEME`.
- **DEMO SOUND OFF** = la demo no carga la música. **[C 0x2a852, 0x2c0a4]**

**Al arrancar**: **[C 0x37e50]**
- Si el identificador no es `PIU4` → "Warning - ident mismatch".
- Si el Adler-32 no coincide → "Warning - EEPROM chksum err".
- En los dos casos carga los valores de fábrica y **la reescribe**. El juego sigue igual.

**Para el port**: 128 bytes en el almacenamiento local del navegador, con el mismo formato y el mismo Adler-32. Así el menú de servicio y "DEFAULT SETTING" funcionan sin tocar la lógica.

### 5.3 `PIU.BIN`

Es la tabla de los 35 efectos del YMZ280B (sección 4.2 y anexo A). No tiene nada que ver con la traba ni con la EEPROM. **[C 0x4271b]**

### 5.4 Reloj del juego

**PIT e interrupción**:
- PIT canal 0, modo 2 (`0x43 ← 0x34`). Divisor = `11 931 800 / tasa en décimas de Hz` = 11 931 800 / 2400 = **4971 → 240,03 Hz**. **[C 0x3a950–0x3a9d5]**
- Rutina propia en el vector 8: **0x3aae4**. La instala 0x3ab88 (`_dos_getvect` / `_dos_setvect`) y la restaura 0x3abe0, que vuelve el PIT a 0xFFFF.
- Cada vez que acumula 0x10000 con el divisor llama a la rutina original del BIOS (18,2 Hz) y manda el EOI a `0x20`. **[C]**
- Hay 5 ranuras de temporizador de 24 bytes en `0x307948` (libre, tasa ×10, activa, incremento 16.16, acumulador, función). **Solo se usa la 0**: 0x20b9c a 240 Hz (0x3aa40, 0x3a9dc(240.0), 0x3aab8). **[C 0x21cbe–0x21cda]**

**Qué hace 0x20b9c en cada tic**: **[C]**
1. Suma 1 a los tres contadores.
2. 0x38e30: sensores.
3. 0x3cfdc: música.
4. Cada 2 tics: monedero.
5. En el estado 2: entradas (0x3a16c) y 0x2a90c (juez + TEST / CLEAR).

**Cuadros de video**:
- El bucle principal 0x21738 dibuja un cuadro y llama a 0xeecbe → `fxMesaSwapBuffers` (0x5b670) → `grBufferSwap(intervalo)`. El intervalo vale **1** (sin `FX_GLIDE_SWAPINTERVAL` en `start.bat`), y espera mientras haya más de 2 cuadros pendientes. **[C 0x5b20f, 0x5b23e]**
- El contexto se abre con `fxMesaCreateContext(0, resolución, refresco = 0, …)`. **GR_REFRESH_60Hz** es 0 en Glide 2. **[C 0xeeddb]**
- Resolución 640×480 (`0x20dcc`). **[C]**
- **El juego dibuja a 60 cuadros por segundo con sincronía vertical** [D: si la Banshee y el monitor respetan el pedido].
- La lógica de pantalla avanza por cuadro (por ejemplo, la secuencia de luces del título cada 20 cuadros, o el contador `[0x1cfb58]` de la partida). El tiempo musical sale del reloj de 240 Hz. No hay lecturas de `0x3DA`.

**Pausas**: 0x10d7c2 = `delay(ms)` de Watcom (500 ms en la prueba de luces del arranque, 100 ms al salir). **[C]**

---

## 6. Teclado del BIOS (`int 0x16`)

Lo lee el bucle principal en cada cuadro. **[C 0x21759–0x217a2]**
- Pide `int 16h` con AH=12h (estado de mayúsculas y control), 11h (¿hay tecla?) y 10h (leer tecla).
- `[0x1ca6a4]` = código de rastreo × 256.

Hay una copia sin uso de la misma lectura en 0x2133c y de la traducción en 0x2138c.

| Tecla (código) | Qué hace | Dirección |
|---|---|---|
| **F1** (`0x3B`) | **TEST**: `[0x1ca6a8] |= 0x10000` | **[C 0x218cd]** |
| **F2** (`0x3C`) | **SERVICE**: `|= 0x20000` | **[C 0x218d6]** |
| **F3** (`0x3D`) | **CLEAR**: `|= 0x40000` | **[C 0x218df]** |
| **Esc** (`0x01`) | Vuelve al estado 0 (pantalla de espera), libera las texturas de F2 (0x40e64) y además hace CLEAR | **[C 0x217f9–0x21803, 0x21913]** |
| **Alt+X** (`0x2D` + Alt) | Sale del juego | **[C 0x217b8–0x217c5]** |
| `` ` `` (`0x29`) | Abre o cierra la **consola de depuración** (`[0x2f5b20]`) | **[C 0x217d7]** |
| **F4** (`0x3E`) | `[0x2ac088] = ([0x2ac088] + 1) % 9` | **[C 0x2187e]** |
| F5 (`0x3F`) | `[0x1cfb09] ^= 8`: versión `r` (acelerada) | **[C 0x2186b]** |
| F6 (`0x40`) | `[0x1cfb09] ^= 0x10`, `[0x1cfb0c] ^= 2`, `[0x1cfb10] ^= 2`: modificadores de P1 y P2 | **[C 0x21832–0x21859]** |
| F7 (`0x41`) | Conmuta `[0x13b7f8]`, que decide cómo se liberan las texturas al terminar la etapa | **[C 0x21814]** |
| F8 (`0x42`) | Conmuta `[0x1ca6c4]`: cuadrícula de 16 px encima de todo (0x20c7c) | **[C 0x217e8, 0x21b7d]** |
| F9 (`0x43`) | Captura de pantalla `.\cap\p3_%03d.TGA` (0x214d8) | **[C 0x21ba3]** |
| F10 (`0x44`) | Conmuta `[0x13ba00]`; no encontré quién lo lee | **[C 0x218a3]** |
| F12 (`0x86`) | En la partida: llena la vida de los dos jugadores (`[0x1cfb80] = [0x1cfba9] = 1,0`) y retoca otros contadores | **[C 0x2c0dc, 0x2a9be]** |

- **[D]** F4 parece elegir el skin de flechas: son 9 valores, como los 9 skins de `arrow.dat`.
- **[D]** F6: modificadores, por los usos en 0x2288f y 0x22a40.
- **Consola** (`` ` ``): se escribe una orden y Enter. Los comandos están en la tabla `0x13bd74` (`exit`, `idle`, `run`, `setup` = menú de servicio, `sel`, `intro`, `logo`, `title`, `ending`). `run` es el de `run 04_h2.not -demo 04.dat`. **[C 0x35e28]**
- **No hay modo teclado para los pads ni tecla de moneda.** El original solo tiene F1–F3 para los botones. **[C: no hay otras lecturas de `[0x1ca6a4]`]**

---

## 7. Propuesta concreta para el port

La idea es **reemplazar solo la capa de hardware** y dejar intacta la lógica traducida. El juego ve las mismas variables, con los mismos bits y en los mismos momentos.

### 7.1 Entradas → `cabina.js`

**Pads**: cada tecla prende "los 4 sensores" de su panel. Se escribe directo en las palabras del juego, sin multiplexor:

| Tecla | Bit | Panel | Tecla | Bit | Panel |
|---|---|---|---|---|---|
| Z | `0x0001` | ↙ P1 (col. 0) | Num 1 | `0x0100` | ↙ P2 (col. 5) |
| Q | `0x0008` | ↖ P1 (col. 1) | Num 7 | `0x0800` | ↖ P2 (col. 6) |
| S | `0x0004` | ● P1 (col. 2) | Num 5 | `0x0400` | ● P2 (col. 7) |
| E | `0x0010` | ↗ P1 (col. 3) | Num 9 | `0x1000` | ↗ P2 (col. 8) |
| C | `0x0002` | ↘ P1 (col. 4) | Num 3 | `0x0200` | ↘ P2 (col. 9) |

**Botones**:
- **F1** = `0x10000` (TEST), **F2** = `0x20000` (SERVICE), **F3** = `0x40000` (CLEAR). Coinciden con el original.
- **F4** = COIN. Genera un flanco en la entrada que lee 0x3a0b8 y respeta la regla de 75 ms (contador > 8 a 120 Hz) y el pulso de 100 ms del contador mecánico.
- **Conflicto 1**: en el original, **F4 = skin de flechas** (depuración). Propuesta: las teclas de depuración del original (F4–F10, F12, `` ` `` y Alt+X) quedan detrás de un "modo programador" apagado por defecto.
- **Conflicto 2**: el **Esc del original reinicia** la pantalla de espera; en el port, Esc = salir.

**En cada tic de 240 Hz**, calcular `[0x1ca6b0]` (apretado), los flancos (`[0x1ca6a8] |=` recién apretado, `[0x1ca6ac]` = recién soltado) y `[0x30791c]`. Es la misma lógica de 0x3a16c sin la lectura de puertos. `[0x1ca6a8]` se pone en 0 al empezar cada cuadro, como en 0x2175b.

**Precisión**: guardar cada `keydown`/`keyup` con su hora (`event.timeStamp`) y aplicarlo en el tic que le corresponde, no en el cuadro. Así se reproduce la lectura a 240 Hz del original.

### 7.2 Reloj

Un "tic" virtual de 240 Hz con paso fijo, que recupera los tics atrasados en cada `requestAnimationFrame`.
- El tic hace lo mismo que 0x20b9c, en el mismo orden: contadores → (sensores) → música → monedero cada 2 tics → en el estado 2, entradas + juez.
- El bucle de pantalla, uno por cuadro. **[D] El original corre a 60 cuadros por segundo**: si el monitor es de 120 o 144 Hz, la lógica por cuadro (luces del título, parpadeos, el contador `[0x1cfb58]`) se tiene que avanzar a un paso fijo de 60 Hz para ser exacta.

### 7.3 Música

- Usar los MP3 descifrados, o descifrar al vuelo: `encabezado = Adler-32`, corrimiento = `encabezado & 0x3FF` con la llave del exe.
- El estado de 0x3cd74, 0x3ce70, 0x3d1cc, 0x3d1e0 y 0x3d1f8 pasa a un `AudioBufferSourceNode`.
- **Reloj de la canción**: mientras suena, `[0x1ca6c8] = floor((ctx.currentTime − inicio) × 239,977)`. Mantener el "nunca retrocede" de 0x2ad2a y sumarle la perilla de desfase de oído.
- `[0x30a8b0]` (cuadros decodificados) = `floor(segundos × 38,28125)`, para el reloj de depuración que muestra CLEAR desde el menú de servicio.
- Respetar los 5 s mínimos entre carga y arranque, DEMO SOUND, la versión `r` (tablas `0x13c394` y `0x13b864`) y el silencio inicial (no hace falta: no hay ruido de DAC).

### 7.4 Efectos

- Reproducir la interfaz de 0x42169, 0x4252e, 0x42632 y 0x426ae: 8 voces, voz fija, lazo, volumen y paneo, con la tabla de `PIU.BIN`.
- **Faltan las muestras**: están en una ROM de la placa, no en el disco. Opciones, de mejor a peor:
  1. Conseguir un volcado de esa ROM de 16 Mbit. Con `PIU.BIN` se recortan los 35 efectos tal cual.
  2. Grabarlos de una cabina, con el SOUND TEST, efecto por efecto.
  3. Reemplazos provisorios, marcados como tales.
- Decodificar ADPCM Yamaha es simple, si aparece la ROM.

### 7.5 Luces

- Mantener las sombras `[0x30792c]` y `[0x30792e]` con los mismos bits. Las funciones 0x39f74, 0x3a01c, 0x3a050, 0x3a084 y 0x39ff4 escriben en un objeto `luces` que se dibuja en pantalla: 10 pads, 4 halógenas en dos pares y el neón.
- Así quedan exactas, incluidas las de la partida (0x27058), las del título y las del I/O TEST, y listas para luces de verdad.

### 7.6 EEPROM y traba

- **EEPROM**: 128 bytes en el almacenamiento local, con 0x41205 y 0x411b9 como leer y escribir sobre ese arreglo. La comprobación de 0x37e50 queda igual.
- **Traba**: 0x3d7a8 devuelve 1.

### 7.7 Lo que no se traduce

- El bit a bit de la EEPROM, del I²C del DAC, de la traba y del multiplexor de sensores (0x40ea0–0x41205, 0x3bd68–0x3c774, 0x3d324, 0x38e30).
- Los cargadores YAD y las pruebas de memoria del YMZ280B.
- La instalación del PIT (0x3a950, 0x3ab88, 0x3abe0, 0x3aae4).

---

## 8. Pendientes y dudas

1. **Muestras de los efectos**: no están en el disco (sección 7.4). Es lo único de la cabina que el port no puede sacar del material que hay.
2. **[D]** La demora de salida de la placa de música (desde que el decodificador cuenta un cuadro hasta que suena) no está en el código. Se ajusta de oído con la perilla de desfase.
3. **[D]** Qué bit es cada halógena física, y si el neón es el bit 10 de `0x2A4`. Solo se sabe cómo se agrupan.
4. El −13/60 de pulso en la fila del juez (0x29000) y las ventanas de juicio (`[0x1cfb60]`–`[0x1cfb6c]`) son de la tarea del juez. Acá solo se registran.
5. STAGE COUNT (`[0x307907]`, valores 0 y 1): el texto de sus valores no lo pude leer limpio (la tabla que r2 llama `Stage_3__1`).

## Anexo A · `PIU.BIN` decodificado

Todos tienen FN = `0xFF`, modo `0x20` (ADPCM sin lazo), volumen `0xFF` y paneo 8. Las direcciones son de la ROM de efectos.

**[D]** La duración supone direcciones en bytes (2 muestras por byte) a 41 667 Hz.

| # | Inicio | Fin | Duración | Uso conocido |
|---|---|---|---|---|
| 0 | 0x000000 | 0x00A150 | 1,98 s | moneda |
| 1 | 0x00A151 | 0x0101A1 | 1,18 s | |
| 2 | 0x0101A2 | 0x02B45E | 5,34 s | cambio de canción en la selección |
| 3 | 0x02B45F | 0x02EC98 | 0,69 s | confirmar o empezar |
| 4 | 0x02EC99 | 0x034C03 | 1,17 s | |
| 5 | 0x034C04 | 0x03F391 | 2,06 s | |
| 6 | 0x03F392 | 0x04207A | 0,55 s | |
| 7 | 0x04207B | 0x054899 | 3,64 s | fin de etapa |
| 8 | 0x05489A | 0x055949 | 0,21 s | |
| 9 | 0x05594A | 0x06095C | 2,16 s | |
| 10 | 0x06095D | 0x08EB70 | 9,07 s | |
| 11 | 0x08EB71 | 0x0BA08D | 8,52 s | |
| 12 | 0x0BA08E | 0x0CAD3F | 3,30 s | |
| 13 | 0x0CAD40 | 0x0E33D5 | 4,80 s | |
| 14 | 0x0E33D6 | 0x104E53 | 6,62 s | |
| 15 | 0x104E54 | 0x1303FB | 8,52 s | |
| 16 | 0x1303FC | 0x1313DB | 0,20 s | |
| 17 | 0x1313DC | 0x134B3C | 0,68 s | |
| 18 | 0x134B3D | 0x135CB3 | 0,21 s | |
| 19 | 0x135CB4 | 0x140E6E | 2,18 s | |
| 20 | 0x140E6F | 0x147CF0 | 1,36 s | |
| 21 | 0x147CF1 | 0x14A344 | 0,47 s | crédito completo |
| 22 | 0x14A345 | 0x154569 | 1,99 s | |
| 23 | 0x15456A | 0x160A8C | 2,42 s | |
| 24 | 0x160A8D | 0x16D12F | 2,44 s | |
| 25 | 0x16D130 | 0x17562F | 1,63 s | |
| 26 | 0x175630 | 0x17B397 | 1,15 s | resultado (uno de los dos) |
| 27 | 0x17B398 | 0x186C16 | 2,27 s | resultado (el otro) |
| 28 | 0x186C17 | 0x18B86D | 0,94 s | |
| 29 | 0x18B86E | 0x18DB25 | 0,43 s | |
| 30 | 0x18DB26 | 0x193701 | 1,13 s | |
| 31 | 0x193702 | 0x19C38F | 1,73 s | |
| 32 | 0x19C390 | 0x1A5280 | 1,76 s | |
| 33 | 0x1A5281 | 0x1AAAE3 | 1,09 s | |
| 34 | 0x1AAAE4 | 0x1AF231 | 0,88 s | |

## Anexo B · Funciones de la cabina (índice)

| Dirección | Qué hace |
|---|---|
| 0x21bc8 | `main`: arranque, bucle 0x21738 y cierre |
| 0x21738 | bucle principal por cuadro: teclado, botones, estados (tabla `0x216b4`) y cambio de buffers |
| 0x20b9c | rutina de 240 Hz (temporizador 0) |
| 0x3aae4 | rutina de la interrupción 8 |
| 0x3ab88 / 0x3abe0 | instala / restaura la interrupción 8 |
| 0x3a950 | programa el PIT |
| 0x3aa40 / 0x3a9dc / 0x3aab8 | temporizadores |
| 0x38e30 | barrido de sensores (multiplexor) |
| 0x3a16c | entradas → palabras del juego, más las luces de pad |
| 0x3a0b8 | monedero y contador mecánico |
| 0x39f74 / 0x3a01c / 0x3a050 / 0x3a084 / 0x39ff4 | luces |
| 0x27058 | luces por notas |
| 0x3ac10 | luces de la pantalla de título |
| 0x3a824 / 0x3a8e0 | arranque / cierre de la placa de E/S |
| 0x41539 / 0x41c48 / 0x4271b | YMZ280B: inicializa / reinicia / carga `PIU.BIN` |
| 0x42169 / 0x4252e / 0x425a5 / 0x42632 / 0x426ae | efectos: tocar / cortar / volver a prender / volumen / paneo |
| 0x3bb44 | carga y descifra `.AUD` y `.PNZ` (Adler-32) |
| 0x3cd74 / 0x3ce70 / 0x3cf34 | música: carga canción / vista previa / por nombre |
| 0x3cfdc | alimenta la placa MP3 y re-ancla el reloj |
| 0x3d1cc / 0x3d1e0 / 0x3d1f8 | música: sonar / parar / estado |
| 0x3bd68 / 0x3be9c / 0x3c3ac / 0x3bfe0 | I²C del DAC: byte / START / silencio / volumen normal |
| 0x3d324 / 0x3d7a8 | traba: intercambio / consulta |
| 0x21024 | consulta de traba del arranque (**sin uso**) |
| 0x37e50 | EEPROM: lee y comprueba al arrancar |
| 0x41205 / 0x411b9 | EEPROM: leer / escribir |
| 0x36854 | Adler-32 |
| 0x380d4 / 0x38028 / 0x38304 / 0x38574 / 0x38878 / 0x38a58 | I/O TEST / traba en el test / EEPROM TEST / GAME OPTION / COIN OPTION / SOUND TEST |
| 0x20c50 / 0x20c58 / 0x20c60 / 0x20c6c / 0x20c74 | relojes |
| 0x28e8c | tramo de BPM |
| 0x28f88 | juez (a 240 Hz) |
| 0x2ad2a / 0x2c452 | tiempo y posición de la partida |
| 0x10d7c2 | `delay(ms)` |
