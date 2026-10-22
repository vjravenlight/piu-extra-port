# Motor de animación de Andamiro en `Piu.exe` · 04/10/2026

Cómo arma Andamiro sus fondos animados y sus pantallas, leído en el código de `Piu.exe` con radare2. Sirve para reproducirlos idénticos en el port.
- **✅ confirmado**: está leído en el código; se da la dirección.
- **🟡 deducido**: sale de los datos o del contexto, sin una instrucción que lo pruebe.

**Lo traducido está en `app\motor\andamiro.js`**: un módulo ES sin dependencias. La prueba es `tools\probar_andamiro.mjs` y da **0 errores** (ver §8).

## 0. En pocas palabras

- Los gráficos de Andamiro vienen en **paquetes RES**, con sumas Adler-32. El juego abre **un paquete por vez**.
- Un **sprite** es una lista de hasta 80 **piezas**. Cada pieza es un rectángulo de pantalla con un recorte de una textura de hasta 256×256.
  - **TILE**: se dibujan todas las piezas, de la última a la primera.
  - **ANI**: se dibuja un solo cuadro, que se elige con la fase.
  - **PATTERN**: una grilla que repite la pieza 0, con las texturas corridas según la fase.
- Un **guion `.BGA`** son 50 objetos fijos. Cada uno tiene un sprite y hasta 300 claves:
  - tiempo en tics de **1/60 s** y la marca de visible;
  - x, y, pivote, escala, giro, r, g, b, a.
- Entre dos claves todo se interpola en **línea recta**, menos el pivote, que es el de la primera clave. El tramo existe solo si la **primera** clave está visible. Pasada la última clave, el objeto desaparece.
- La **fase** (0…1) dentro del tramo es la que elige el cuadro de ANI y el corrimiento de PATTERN. Una animación ANI dura lo que dura su tramo.
- **Todo se dibuja con la misma mezcla.** El arranque deja `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` y `GL_MODULATE` (textura × color de la clave), y el BGA no lo cambia nunca. No hay mezcla aditiva en los BGA. Solo la usan algunas piezas del título, en 0x33630.
- En la canción, el tic del BGA es **un reloj de 240 Hz dividido por 4**. En las demás pantallas es **un cuadro dibujado**.

## 1. Paquetes RES ✅

| Dirección | Función | Qué hace |
|---|---|---|
| 0x36970 | `res_open(ruta)` | Lee el paquete entero a un buffer único de **6 MB** (0x2FDAB8, se reserva una vez) y lo verifica. Devuelve 1 o 0. |
| 0x36934 | `res_close()` | Libera el buffer y borra la cabecera (0x2F6A9C, 0x7020 bytes). |
| 0x36BD4 | `res_fopen(nombre)` | Busca en el índice con `stricmp` (0x10E5CE: solo pasa A–Z a minúscula), el primero que coincide. Ocupa uno de **4 lugares** de 20 bytes en 0x2FDABC (en uso, tamaño, posición, puntero, FILE). Si no hay lugar: "FAIL: res_file_alloc()". |
| 0x36CA0 | `res_fclose(h)` | Libera el lugar. |
| 0x36CE0 | `res_fgets(buf, tope, h)` | Ver abajo. |
| 0x36D9C | `res_fread(buf, tam, n, h)` | Copia lo que queda, hasta tam·n. Devuelve ⌈leído/tam⌉. |
| 0x36E38 / 0x36E88 | `res_puntero(nombre)` / `res_tamaño(nombre)` | Los usa el cargador de `.PTX`. |
| 0x36854 | `adler32(p, n)` | Adler-32 normal (módulo 65521). |
| 0x3689C | `xor_andamiro(p, n)` | `b ^= k; k += 0x95`, con k arrancando en 0xD2. |

**Formato** (✅ 0x369E1–0x36BC3):

| Offset | Qué es |
|---|---|
| 0x00 | `RES\0` (no se controla) |
| 0x04 | u32 versión (2) |
| 0x08 | u32 cantidad de archivos |
| 0x0C | u32 tamaño de los datos |
| 0x10 | u32 Adler-32 del **índice ya descifrado**. 🟡 El juego no lo mira; coincide en los 119 paquetes |
| 0x14 | u32 Adler-32 de los **datos cifrados**. Si no coincide, suma 1 a un contador de errores (0x1CA6B4) y sigue |
| 0x18 | índice: cantidad × 28 bytes = `nombre[16]`, u32 tamaño, u32 posición (desde el comienzo de los datos) y u32 Adler-32 del archivo descifrado. Va descifrado **como un solo flujo**: la llave arranca una vez para todo el índice |
| 0x18 + 28·n | datos. **Cada archivo se descifra aparte** (la llave vuelve a 0xD2). Si su Adler no coincide, se escribe "error %s" en el registro y **se le borra el nombre** (16 ceros): queda imposible de encontrar |

**`res_fgets` (✅ 0x36CE0)** lee la línea de texto que sigue a partir de la posición actual. El tope es 250, porque el buffer de líneas es 0x2B4904 o 0x2B4A04, de 0x100 bytes.
- Corta en `\r`: lo cambia por `\n` y **saltea el byte siguiente**, porque supone que es `\n`.
- También corta en un byte 0 o al final del archivo.
- Devuelve el largo. Si devuelve 0, terminó.
- Un byte 0 en medio del texto corta la lectura del archivo.

**Comprobado:** se abrieron los **119 paquetes** (`extraido\Piu\Bga` y `extraido\empty`).
- Todas las sumas Adler coinciden.
- Ningún paquete pasa los 6 MB.
- Los **6.909 archivos** son idénticos byte a byte a los de `descifrado\graficos`.

## 2. Texturas: `tex_load` (✅ 0x338BC)

- **Tabla:** 128 lugares de 32 bytes en 0x2B4B0C. Cada uno tiene:
  - nombre[16];
  - +0x10 número de textura de OpenGL;
  - +0x14 grupo (u16);
  - +0x16 ancho, +0x18 alto, +0x1A bits por píxel.

  Los píxeles se decodifican en un buffer común (0x2B5B0C).
- **Caché:** busca primero en la tabla, por el nombre sin carpeta (0x2E7AC) y con `stricmp`. Si ya está cargada, devuelve el mismo lugar. Las texturas se comparten entre sprites y quedan cargadas hasta que se libera su grupo.
- **Archivo que abre:** cambia desde el **primer punto** por `.PNG` (0x2E758) y lo abre del paquete abierto.
  - Ejemplo: `bg11.tga` → `bg11.PNG`.
  - Si el PNG falla, prueba `.PTX` (decodificado en 0x434AC; solo acepta lados de 1 a 256 que sean potencia de 2).
- **PNG** con libpng 1.0.6, con lectura propia (0x33F9C) y sin transformaciones. Tipos de color:
  - 0 → 8 bits;
  - 2 → 24 bits;
  - 4 → 16 bits: no tiene formato de OpenGL. Es un error del original, pero el disco no trae ninguno;
  - 6 → 32 bits;
  - con paleta → falla.
- **OpenGL** (✅ 0x33D74–0x33E60):
  - `glPixelStorei(GL_UNPACK_ALIGNMENT, 1)`, `glGenTextures(1)`, `glBindTexture`;
  - `WRAP_S/T = GL_CLAMP`;
  - `MAG/MIN_FILTER = GL_LINEAR`;
  - `glTexImage2D(…, formato, ancho, alto, 0, formato, GL_UNSIGNED_BYTE)` con 8 → `GL_LUMINANCE`, 24 → `GL_RGB`, 32 → `GL_RGBA`. El formato interno es el mismo.
  - 🟡 En WebGL, `GL_CLAMP` equivale a `CLAMP_TO_EDGE` (Glide no tiene borde).
- **Grupos:**
  - 0x33880 fija el grupo de lo que se carga después;
  - 0x33EDC libera las texturas de un grupo;
  - 0x33830 libera todas.

  Al arrancar el grupo es 2. `00.dat` y la fuente van en el grupo 1, que no se libera. Las pantallas y los BGA van en el grupo 4: cada pantalla libera el 4 antes de cargar lo suyo.
- **Datos del disco:** 3.390 PNG en los paquetes RES, todos RGB o RGBA de 8 bits y de hasta 256×256 (3.348 son de 256×256). El único lado que no es potencia de 2 es `empty\NEXT\NUM3.PNG`, de 256×224.

## 3. Sprites `.spr` / `.sp2` ✅

### 3.1 Cómo quedan en memoria (0xDDC bytes)

| Offset | Qué es |
|---|---|
| 0x00 | nombre[16]. Solo se llena si la carga falla (0x35766) |
| 0x10 | u16 tipo: 0 ninguno, 1 TILE, 2 ANI, 3 PATTERN |
| 0x12 | u16 cantidad de piezas |
| 0x14 | int modo de PATTERN |
| 0x18 | int (columnas << 16) + filas. Se lee con `sar 16` y `and 0xFF` |
| 0x1C | 80 piezas × 0x2C |

**Pieza** (0x2C bytes):

| Offset | Qué es |
|---|---|
| 0x00 | nombre[16] (solo `.sp2`) |
| 0x10 | int número de textura (lugar de la tabla) |
| 0x14 / 0x16 / 0x18 / 0x1A | i16 x0, y0, x1 = x0+ancho, y1 = y0+alto |
| 0x1C / 0x20 / 0x24 / 0x28 | f32 u0, v0, u1, v1 |

### 3.2 Carga: `sprite_load(sprite, nombre)` (✅ 0x35320)

```
sprite.num = 0
base = strtok(copia, "."); ext = strtok(NULL, " .")     // la extensión manda, sin mayúsculas
si ext == "tga":  borrar las 80 piezas; tex = tex_load(nombre)
                  pieza0 = {x0:0, y0:0, x1:ancho, y1:alto, u0:0, v0:0, u1:1, v1:1}; num = 1; tipo = TILE
si ext == "spr" o "sp2":
    h = res_fopen(nombre)                                // nombre completo, tal cual (un espacio al final lo rompe)
    mientras res_fgets(línea, 250, h) > 0:
        t = strtok(línea, " \t\r\n")                     // los blancos son los únicos separadores
        "T"    -> leer una pieza (ver abajo); num++
        "TYPE" -> 0x34E04: modo = dims = 0; TILE=1, ANI=2, PATTERN=3 (+ modo, columnas, filas); otra cosa = 0
        "NUM"  -> se IGNORA el número; solo borra las 80 piezas (el contador no vuelve a 0)
        otra   -> se ignora (comentarios como ";TILE", líneas en blanco)
otra extensión: devuelve 0
si num == 0 (y la extensión era conocida): copia el nombre a sprite.nombre
```

**Línea `T` de un `.spr`** (✅ 0x354F2). Formato: `T textura x y ancho alto s0 t0 s1 t1`.
- `s1 t1` es la **esquina opuesta** del recorte, no su tamaño. Ejemplo, `81\LOGO_ENT.SPR`: `0 152 184 176` con alto de pantalla 24 = 176 − 152.
- Si la textura no carga o mide 0, **la línea se saltea**.
- `u = s · (256 div ancho_textura) / 256` (división entera). Para texturas ≤ 256 queda `s / ancho`.

**Línea `T` de un `.sp2`** (✅ 0x34CB0). Formato: `T nombre textura x y ancho alto s t ancho alto`.
- `u0 = s/256`, `u1 = u0 + ancho/256`. **Supone siempre texturas de 256**: no mira el tamaño real.
- No controla nada: si la textura falla, guarda −1 y la pieza se dibuja igual.

**Las dos:**
- `x1 = (i16)(x0 + ancho)`.
- `atoi` (0x10E859) desborda como entero de 32 bits.
- **No se controla el tope de 80 piezas.** El disco tiene como máximo 73, en `STITLE.SP2`.

Variantes del mismo cargador, sin uso en lo que se recorrió:
- 0x34FB0: solo `.spr`, con su propia línea;
- 0x35258: solo `.sp2`;
- 0x34EDC: sprite de una textura entera;
- 0x34AA4: línea T de `.spr` suelta.

### 3.3 Dibujo: `dibujar_sprite(sprite, fase)` (✅ 0x34794)

```
TILE (o tipo 0, o > 3):  para i = num-1 .. 0:  bind(pieza[i].tex); quad_invertido(pieza[i])     // la pieza 0 queda arriba
ANI:     c = trunc(num * fase)  (fild/fmul/__CHP 0x10E582 trunca/fistp);  si c >= num: c = num-1
         bind(pieza[c].tex); quad_invertido(pieza[c])
PATTERN: W = pieza0.x1, H = pieza0.y1;  corr = trunc(num * (float)(1 - fase))
         modo != 0 (por columnas): para col 0..columnas-1, para fila 0..filas-1: índice = col*filas + fila
         modo == 0 (por filas):    para fila 0..filas-1, para col 0..columnas-1: índice = fila*columnas + col
             glPushMatrix; glTranslatef(col*W, -fila*H, 0)        // en OpenGL: la fila baja en pantalla
             bind(pieza[(corr + índice) % num].tex); quad_invertido(pieza0)   // geometría y uv de la pieza 0
             glPopMatrix
```

En PATTERN todas las celdas usan el rectángulo y las coordenadas de textura de la **pieza 0**, y cambian solo la **textura**. Con el corrimiento, la grilla se desplaza (−1 índice) a medida que avanza la fase.

**`quad_invertido`** (✅ 0x346C4): `glBegin(GL_QUADS)` con estos puntos, y `glEnd`. Es decir, coordenadas de pantalla **con y hacia abajo**: la esquina de arriba a la izquierda (x0, y0) lleva (u0, v0).

| Coordenada de textura | Vértice |
|---|---|
| (u0, v0) | (x0, 480−y0) |
| (u1, v0) | (x1, 480−y0) |
| (u1, v1) | (x1, 480−y1) |
| (u0, v1) | (x0, 480−y1) |

**`quad_derecho`** (✅ 0x34618) es la versión **con y hacia arriba**: (u0, v0) → (x0, y1) … (u0, v1) → (x0, y0). La usan las pantallas a través de 0x346A0 (`bind` + `quad_derecho`) y de sus variantes (§5.2).

### 3.4 Datos del disco

- 3.427 sprites: 2.738 TILE, 602 ANI y 87 PATTERN. Hay 11.326 piezas.
  - El `NUM` no coincide con las líneas `T` en 39 archivos: no importa, porque se ignora.
  - Los PATTERN con modo ≠ 0 son 30 (`YHTEC*`, `YH0*`, `BACK8`, `TYK0100*`…).
- 188 sprites nombran texturas que no están en su paquete. En los `.spr` esas líneas se saltean, igual que en la cabina, y 158 sprites quedan sin piezas. Ninguno lo usa un BGA salvo `57.BGA` objeto 8, `wave.spr`, que tampoco se ve en la cabina.

## 4. Guiones `.BGA` ✅

### 4.1 Formato, byte a byte

| Offset | Tamaño | Qué es |
|---|---|---|
| 0x00 | 4 | `BGA\0`. Va a una variable aparte (0x3077EC) y **no se controla** |
| 0x04 | 4 | → bga+4. 🟡 **El BPM de la canción para la que se armó**, o 120, que es el valor por defecto del editor. De los 21 guiones de canción que no valen 120, 19 coinciden (±1) con el BPM de los pasos: 08 = 195, 23 = 150, 60 = 162, 67 = 132… Los que no coinciden son 32 y 58. El juego **no lo lee**: no hay ninguna referencia a 0x1CFCEC |
| 0x08 | 4 | → bga+8. 🟡 Dato del editor (1–26). No se lee |
| 0x0C | 4 | → bga+0. 🟡 Dato del editor (0–320). No se lee |
| 0x10… | | **50 objetos seguidos**: `nombre[64]` del sprite (`car1.spr`, `x.tga`…), `u32` cantidad de claves y claves × 44 bytes. Si el archivo se termina antes, el resto queda en 0. Los guiones viejos traen 40 objetos |

**Clave** (44 bytes):

| Offset | Tipo | Qué es |
|---|---|---|
| 0x00 | i16 | **tiempo** en tics de 1/60 s |
| 0x02 | i16 | **visible** (≠ 0) |
| 0x04 / 0x08 | f32 | **x, y**: posición en pantalla, con y hacia abajo |
| 0x0C / 0x10 | f32 | **cx, cy**: pivote del giro y de la escala, en coordenadas del sprite. Se usa el de la clave de inicio del tramo |
| 0x14 | f32 | **escala**, la misma en x e y |
| 0x18 | f32 | **giro** en grados. Positivo = antihorario en pantalla |
| 0x1C–0x28 | f32 × 4 | **r, g, b, a**. Multiplican la textura (`GL_MODULATE`) |

**Comprobado:** los 92 `.BGA` (`Bga\` y `empty\`) se leen hasta el último byte, sin sobrantes.
- Hay 3.079 objetos con claves y 84.222 claves en total.
- Los tiempos están siempre en orden creciente y nunca se repiten.
- La marca de visible vale solo 0 o 1.
- Rangos:
  - x de −4.200 a 1.800;
  - escala de 0 a 150;
  - giro de −20.000 a 110.000 grados (vueltas enteras);
  - r, g, b de 0 a 10: OpenGL los recorta a 1;
  - alfa de −0,5 a 1.

### 4.2 Carga: `bga_load(bga, "BGA\NN.dat")` (✅ 0x374A0)

```
memset(bga, 0, 0xCD478)                          // 0x18 + 50 × 0x41B0
res_open(ruta)
nombre = "506.dat" si ruta == "BGA\70.dat";  "501.dat" si "BGA\10.dat";  "308.dat" si "BGA\72.dat"   (comparación exacta)
         si no, el nombre sin carpeta;  cambiar la extensión por ".BGA"     -> p. ej. "67.BGA", "506.BGA"
h = res_fopen(nombre);  si falla: "FAIL : res_fopen( %s )", res_close, devuelve 0 (no se dibuja nada)
fread firma (aparte); fread bga+4; fread bga+8; fread bga+0
para i = 0..49:  o = bga + 0x18 + i*0x41B0
    fread(o+0x00, 64)          nombre del sprite
    fread(o+0x40, 4)           cantidad de claves
    fread(o+0xE20, 44 × cantidad)   ← SIN tope (el lugar alcanza para 300)
res_fclose(h)
para i = 0..49:  sprite_load(o+0x44, o+0x00)   // con el paquete todavía abierto; texturas en el grupo 4
res_close()
```

**Objeto** (0x41B0 bytes): nombre[64], cantidad en +0x40, sprite en +0x44 (0xDDC bytes) y claves en +0xE20 (300 lugares).

**Desborde de más de 300 claves** (✅ por el orden de lectura, 🟡 por su efecto). Hay **15 objetos con 304 a 319 claves**: en `08`, `501` (canción 10) y `12`, más las copias de `empty`. Las claves que sobran caen encima del objeto **siguiente**, que enseguida se pisa con su nombre, su cantidad y su sprite. En la cabina:
- **La clave 300** queda con el tiempo igual a las **dos primeras letras del nombre del objeto siguiente** (`"bg"` = 26.466) y con valores sacados del resto del nombre (`".spr"` = 4,76·10³⁰ en x).
- A partir de la clave 299 el objeto **sale disparado fuera de la pantalla** (x ≈ 10²⁷) o **se congela**, en vez de seguir lo que dice el archivo.
- Si el siguiente no tiene nombre (`08.BGA` objeto 12), queda **oculto** entre la clave 299 y la 302, y después sigue normal.

`andamiro.js` emula la memoria tal cual. `objeto.claves` es lo que ve la cabina y `objeto.clavesArchivo`, lo que dice el archivo.

### 4.3 Reproducción (✅ 0x37750 → 0x3779C → 0x37183 → 0x34794)

```
bga_dibujar(bga, t):                              // 0x37750
    si t < 0: t = 0
    para i = 0..49: dibujar_objeto(objeto[i], t)  // el 0 queda abajo, el 49 arriba

dibujar_objeto(o, t):                             // 0x3779C + 0x37183
    si o.cantidad == 0: return 0
    si t < clave[0].tiempo: return 0
    k = la primera clave con tiempo > t;  si no hay: return 1      // terminó: no se dibuja más
    (k == 0 no puede pasar; si pasara se dibuja clave[0] tal cual, con fase 0)
    a = clave[k-1], b = clave[k]
    si a.visible == 0: return 0
    f = (float)((t - a.tiempo) / (b.tiempo - a.tiempo))
    x, y, escala, giro = a + (b - a)·f        (cada uno guardado en float)
    color = (a.rgb + (b.rgb - a.rgb)·f) · FUNDIDO_RGB ;  alfa = (a.a + (b.a - a.a)·f) · FUNDIDO_ALFA
    glPushMatrix()
    glTranslatef(0, 480, 0)
    glTranslatef(x, -y, 0)
    glTranslatef(a.cx, -a.cy, 0)
    glRotatef(giro, 0, 0, 1)
    glScalef(escala, escala, 1)
    glTranslatef(-a.cx, a.cy, 0)
    glTranslatef(0, -480, 0)
    glColor4fv([r, g, b, alfa])
    dibujar_sprite(o.sprite, f)                    // la fase del tramo
    glPopMatrix()
    return 1
```

**En coordenadas de pantalla** (y hacia abajo), un punto (px, py) del sprite cae en:
`X = x + cx + e·((px−cx)·cos θ + (py−cy)·sen θ)` y `Y = y + cy + e·(−(px−cx)·sen θ + (py−cy)·cos θ)`.
Es la cuenta de `matrizObjeto()`. La prueba la compara vértice por vértice con la repetición de las llamadas OpenGL: 635.872 coordenadas, con diferencia máxima de 5·10⁻¹².

**Fundido global** (✅ 0x37488, dos `float` por la pila → 0x13BDC8 y 0x13BDCC):
- Multiplica el RGB y el alfa de todos los objetos.
- Cada pantalla que carga un BGA lo pone en (1, 1).
- La de notas (0x2DBE0) baja el alfa en los cuadros 381 a 400: `alfa = (400 − cuadro) · 0,05`.

### 4.4 El tiempo ✅

**Durante una canción** (0x2C04C):
- El temporizador del sistema se instala a **240 Hz** (0x3AA40 con 240,0; rutina 0x20B9C) y suma 1 a 0x1CA6C8 en cada tic.
- La bomba de sonido (0x3CFDC) lo **corrige** cada 256 cuadros MP3 que manda a la placa: `t240 = cuadros × 6,2688`. Con 1.152 muestras a 44,1 kHz, eso da ≈ 240 por segundo.
- El juego usa `max(t240, anterior)`, nunca menor que 0.
- **El tic del BGA = t240 / 4** (división entera): 60 por segundo.
- El desfase de los pasos (el primer "valor" del `.NOT`, en **centésimas de segundo**: ×2,4 en 0x2C4A7) **no se aplica al BGA**.

**Versión R** (audio `rNN.AUD`, más rápida). Si se juega la R (0x2B3A64 = 1, ✅ 0x3CD7A):
- el BPM de los pasos se multiplica por el factor de 0x13B864 (✅ 0x22352);
- el BGA se acelera igual: `tic = trunc(tic · bpm_nuevo / bpm_original)` (✅ 0x2C542).

**Demás pantallas** (81, 03, 84):
- El tic es un **contador de cuadros**: arranca en 0 en el primer cuadro dibujado y sube 1 por vuelta del bucle principal.
- 🟡 La cabina iba a 60 cuadros por segundo, sincronizada con el monitor.

En el módulo: `ticBgaCancion(t240, bpmActual, bpmOriginal)`.

### 4.5 Estado de OpenGL (✅ 0x20DCC, el arranque)

Se fija una sola vez y el motor no lo cambia:
- `glClearColor(0,0,0,1)`;
- sin `CULL_FACE` ni `DEPTH_TEST`;
- `glShadeModel(GL_FLAT)` y `glEnable(GL_DITHER)`;
- **`glEnable(GL_BLEND)` + `glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)`**;
- **`glTexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_MODULATE)`** y `glEnable(GL_TEXTURE_2D)`;
- `glViewport(0,0,640,480)`;
- **`glOrtho(0, 640, 0, 480, 0, 1)`**: y hacia arriba.

El bucle principal (0x21738) hace en cada cuadro: `glClear(COLOR)`, `glPushMatrix`, la pantalla del estado, `glPopMatrix` y el intercambio de buffers (0xEECBE).

En el módulo: `configurarGL(gl)`.

## 5. Las pantallas

### 5.1 Cómo se carga y se reproduce cada una (✅ las direcciones; el bucle de estados está en 0x21738, tabla 0x216B4)

| Estado | Función | Qué carga | Cómo se ve |
|---|---|---|---|
| arranque | 0x239FC | Del paquete `bga\00.dat` (grupo 1): `font.tga` → 0x1CA7D4, `event.tga` → 0x1CA7D8, `arrow541…545.sp2` → 0x1CA7DC + i·0xDDC. Del paquete `bga\arrow.dat`: `arrow0.sp2` → 0x1CED28. Después 0x35890 carga `font.tga` (grupo 1) | piezas sueltas (0x23AB8 dibuja las flechas por índice, corriéndose 96 px) |
| 16 | 0x3AD30 | `BGA\open.dat` + `main.vsl` | **motor de F2**, no de Andamiro. Una vez cada 7 suena el audio 01 |
| 17 | 0x3AEBC | sigue la apertura de F2 por 1.020 cuadros; después carga el título | F2 |
| 19 | 0x3B160 | `bga\title.dat` → `title.sp2` (37 piezas `ti0…ti36`) en 0x3079D8, grupo 4 | pasa al 20 |
| 20 | 0x3B264 | — | **título armado a mano**: fondos con 0x33490 y luces **aditivas** con 0x33630 |
| 13 → 14 | 0x3B064 / 0x3B0F4 | **BGA `bga\81.dat`** (`81.BGA`, logo de Andamiro) | 500 cuadros, sin audio; después vuelve al ciclo de demostración |
| 22 → 23 | 0x3B98C / 0x3B9EC | **BGA `bga\03.dat`** (`03.BGA`, "cómo se juega") + audio 03 | 1.920 cuadros (32 s); después 0x3326C |
| 31 → 32 | 0x2E618 / 0x2E6A0 | **BGA `BGA\84.dat`** (`84.BGA`, 42 sprites `END01…42`) + audio 49 | 1.900 cuadros; después el título |
| 0 (demostración) | 0x21A82 | cada vez suma 1 a 0x1CA768 y mira `% 4`: 0 → 81.dat · 1 → apertura de F2 · 3 → partida de demostración (`run %02d_h2.not -demo %02d.dat`, 0x33438) | con crédito → estado 19 |
| 10 / 11 | 0x3326C / 0x33330 | sub-estados en 0x2AFD18. Siguiente etapa: `bga\next.dat` → `"%1d.sp2"` (2, 3 o 4 = etapa + 1) en 0x2B3A6C. Selección (0x30268): `bga\select.dat` → `select.sp2` (0x2B0C50) y `select1.sp2` (0x2B1A2C), audio 02. Después `bga\stitle.dat` → `stitle.sp2` | piezas sueltas (0x32270, 0x31154, 0x31740, 0x31D20…) |
| 1 | 0x2A27C | **BGA de la canción**: `"BGA\%s"` con `"%02d.dat"` (número de la canción, 0x32B59).<br>Si el paquete es de F2 (0x36F00 mira la firma) → `main.vsl`. Si es RES → `bga_load` en **0x1CFCE8**, grupo 4, fundido (1,1).<br>**Flechas:** si el skin 0x2AC088 ≠ 0, `arrow<n>.sp2` de `bga\arrow.dat` en 0x2AB2AC. Si es 0, se usa la `arrow0.sp2` del arranque | — |
| 2 | 0x2C04C | — | `bga_dibujar(0x1CFCE8, t240/4 [× BPM R])` (0x2C679) es lo **primero** del cuadro. Después van las flechas y lo demás (0x23B50, 0x23DB4, 0x24DB0, 0x27158).<br>Con el bit 0x40 de 0x1CFB08 y la condición de 0x2C56E (un jugador con 'A' en 0x1CFBA4 o 0x1CFBCD y valor > 10), el BGA **se reemplaza** por un cuadro de pantalla entera sin textura. Alterna rojo (1,0,0) y amarillo (1,1,0) cada 3 cuadros. 🟡 No se sabe todavía qué estado del juego es |
| 4 → 5 | 0x2D898 / 0x2DBE0 | `bga\grade.dat` → `grade.sp2` en 0x2AEA30 | piezas sueltas; el BGA se apaga con el fundido (§4.3) |
| fin de canción | 0x2B97C / 0x2BB10 / 0x2BCA4 / 0x2BEE0 (y las copias en 0x2D0AA, 0x2D23F, 0x2D3D5, 0x2D611) | en su primer cuadro: `fail.sp2` o `clear.sp2` (0x2AC09C), `gameover.sp2` (0x2ACE78), `heyman.sp2` (0x2ADC54) | piezas sueltas con 0x33490 y `glColor4f` |
| 28 / 29 | 0x38BF4 / 0x38C5C | menú de servicio | fuente propia |

**Skins de flechas** (✅ 0x2F9F4 y 0x2FCF4):
- Los eligen **códigos con los pads** en la selección (casos 12–19 → skins 1, 8, 6, 7, 2, 5, 4 y 3).
- El título los vuelve a 0.
- La tecla F4 del teclado de la cabina (código 0x3E) los recorre en ciclo de 9 (0x2187E): es una ayuda de los programadores.

**Paquetes sin referencia en el código de Extra:** `82` (pantalla de inicio vieja), `90`, `91`, `98`, `99`, `SGRAY`, `SNOW`, `CONGR`. 🟡 Son restos de versiones anteriores, salvo que algún número de canción de `game.cfg` apunte a ellos.

### 5.2 Primitivas de las pantallas (✅)

Todas trabajan con **y hacia arriba**, sobre la pieza de un sprite ya cargado:

| Dirección | Qué hace |
|---|---|
| 0x346A0 | `bind` + `quad_derecho` (71 llamadas) |
| 0x33490 | **centrada**: `glTranslatef(x − x1/2, y − y1/2)` + 0x346A0 (202 llamadas). La mitad es entera, hacia cero |
| 0x334F4 | **centrada y escalada**: `glTranslatef(x − x1·e·0,5, y − y1·e·0,5)`, `glScalef(e,e,1)` |
| 0x33630 | **centrada y aditiva**: `glBlendFunc(GL_ONE, GL_ONE)` y después vuelve a `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` |
| 0x33560 | girada y escalada, para los efectos del juicio en 0x27xxx. 🟡 Falta leerla bien |
| 0x358F0 / 0x359DC / 0x35B18 | texto con `font.tga`: 32 columnas, celdas de 1/32 × 0,05859, caracteres 0x21–0x7F |

**La coreografía de cada pantalla está escrita a mano** en su función: qué pieza, dónde, cuándo y con qué color. No viene de un guion. Hay que traducir esas funciones una por una en el paso 5 del plan, con estas primitivas, que ya están en el módulo.

## 6. Funciones de OpenGL (Mesa) que usa este motor

🟡 Se deducen por los argumentos (los números de OpenGL) y porque Mesa 3.x las tiene en orden alfabético.
- **Seguras por los argumentos:** glBegin, glBlendFunc, glClear, glDisable, glEnable, glMatrixMode, glOrtho, glTexEnvi, glTexImage2D, glTexParameter*, glViewport.
- **Por el orden alfabético:** glColor3fv y glDepthFunc.

| Dirección | Función | Dirección | Función |
|---|---|---|---|
| 0xD83B0 | glOrtho | 0xDAF18 | glBegin |
| 0xD86B4 | glPixelStorei | 0xDAF54 | glBindTexture |
| 0xD897C | glPopMatrix | 0xDB050 | glBlendFunc |
| 0xD8A30 | glPushMatrix | 0xDB10C | glClear |
| 0xD9828 | glRotatef | 0xDB1CC | glClearColor |
| 0xD9910 | glScalef | 0xDB394 | glColor3f |
| 0xD9958 | glShadeModel | 0xDB620 | glColor4f |
| 0xD9B30 | glTexCoord2f | 0xDB8D4 | glColor3fv |
| 0xDA280 | glTexEnvi | 0xDBB38 | glColor4fv |
| 0xDA448 | glTexImage2D | 0xDC110 | glDepthFunc |
| 0xDA578 | glTexParameterf | 0xDC228 | glDeleteTextures |
| 0xDA5C0 | glTexParameteri | 0xDC268 | glDisable |
| 0xDA948 | glTranslatef | 0xDC4AC | glEnable |
| 0xDA9D4 | glVertex2i | 0xDC52C | glEnd |
| 0xDADF0 | glViewport | 0xDCCDC | glGenTextures |
| 0xDDBF4 | glLoadIdentity | 0xDE2DC | glMatrixMode |

La convención: los enteros van en EAX, EDX, EBX y ECX; los `float` y los `double` van por la pila. **La función llamada limpia la pila.**

## 7. Lo que falta y las dudas

- **Coreografía de las pantallas** (título 0x3B264, selección 0x30268–0x32F90, notas 0x2DBE0, siguiente etapa 0x3311C, fail, clear, gameover, heyman): solo se ubicaron. Están armadas a mano con las primitivas de §5.2; hay que traducirlas en el paso 5.
- **0x33560** (pieza girada y escalada) y la fuente (0x35B18): falta leerlas en detalle.
- **Redondeo:** la cabina interpola en x87 (80 bits) y guarda en `float`. El módulo interpola en `double` y guarda en `float`. Puede diferir en el último bit en casos raros, sin efecto visible.
- **Lo que no se puede emular del todo:**
  - una pieza ANI de un sprite sin piezas lee basura antes de la pieza 0 (el módulo no dibuja nada);
  - el objeto 49 con más de 300 claves pisaría la tabla de BPM, pero en el disco no pasa.
- **60 cuadros por segundo** en las pantallas sin canción: 🟡 es lo normal de la Voodoo con `grBufferSwap(1)`, pero no se midió.
- **82, 90, 91, 98 y 99:** confirmar que no se usan, con `game.cfg` y la tabla de números de canción (0x2B3600).

## 8. Archivos

**`app\motor\andamiro.js`** (módulo ES, sin dependencias):

| Grupo | Funciones |
|---|---|
| Paquetes y texto | `abrirRes`, `lineasRes`, `adler32`, `xorAndamiro`, `stricmp`, `atoi`, `nombreBase`, `cambiarExtension`, `archivosTextura` |
| Lectura | `parsearSprite(nombre, bytes, {textura})`, `parsearBga(bytes, {sprites})` (con la memoria emulada), `armarBga(bytes, {leer, textura})` (guion + sprites, como `bga_load`), `nombreGuion('BGA\70.dat')` → `'506.BGA'` |
| Cálculo puro | `estadoObjeto(obj, t, fundido)`, `estadoBga`, `piezasDeSprite(sprite, fase)`, `matrizObjeto(estado)`, `quadsBga(bga, t)` (cuadriláteros con coordenadas de pantalla, uv y color), `ticBgaCancion(t240, bpm, bpmOriginal)` |
| Dibujo con las mismas llamadas OpenGL (para `gl1.js`) | `dibujarBga`, `dibujarObjeto`, `dibujarSprite`, `dibujarPiezaInvertida`, `dibujarPiezaDerecha`, `dibujarPieza`, `dibujarPiezaCentrada`, `dibujarPiezaEscalada`, `dibujarPiezaAditiva`, `cargarTextura`, `configurarGL` |

**`tools\probar_andamiro.mjs`** se corre con `node probar_andamiro.mjs` (Node de R.A.V.E.N) y tarda unos 30 s. Resultado del 04/10:
- **RES:** 119 paquetes y 6.909 archivos con las sumas Adler bien, idénticos a `descifrado`.
- **Sprites:** 3.427 (11.326 piezas). Las piezas leídas coinciden con las líneas `T` cuya textura está en el paquete.
- **BGA:** 92 guiones, 3.079 objetos y 84.222 claves.
  - Se probaron 54 tiempos por guion: 39.742 cuadriláteros.
  - La cuenta directa y la repetición OpenGL dan lo mismo: 635.872 coordenadas, con diferencia máxima de 5·10⁻¹².
- **Casos puntuales:** esquina en `.spr`, /256 en `.sp2`, PATTERN por columnas, ANI, tic, nombres especiales y `atoi`.
- **ERRORES: 0.**
- **Avisos** (son del disco y pasan igual en la cabina):
  - 15 objetos con más de 300 claves;
  - 450 líneas `T` sin textura en su paquete;
  - 33 objetos con claves que no se dibujan: 29 sin nombre, 2 con `"c01.spr "` (un espacio al final) y 2 con `wave.spr`, que no carga.
