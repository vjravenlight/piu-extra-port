# Formatos de animación de F2 System (escenas `.vsl`, `.tc`, `.ifl` y compañía) · 04/10/2026

Cómo están hechos, byte a byte, los fondos animados que F2 System hizo para Pump It Up Extra, y **cómo los dibuja el juego**, para reproducirlos igual en el port.

- Todo sale del código, leído con radare2, de dos programas:
  - `VslView_v16.exe`, el visor de F2 que vino en `empty\OPEN1`: Win32 con OpenGL, direcciones `0x40xxxx`.
  - `Piu.exe`, el juego: DOS con Mesa sobre la Voodoo, direcciones `0x3xxxx`/`0x4xxxx`. Se abre con `-e bin.relocs.apply=true`.
- Los nombres de las funciones de OpenGL de `Piu.exe` (por ejemplo, `0xDE378` = `glMultMatrixf`) están en `GL_LLAMADAS.md`.
- Marcas: **C** = confirmado en el código (con la dirección) · **D** = deducido de los datos o del comportamiento.
- El lector en JavaScript es `app\motor\f2.js`.
- La prueba es `tools\probar_f2.mjs`: lee los 3.346 archivos (3.344 bien y 2 que ya venían vacíos) y arma las 63 escenas cuadro por cuadro, con 0 errores.
- Además se comparó a ojo contra las capturas de VslView (ver "Validación").

## 1. Resumen: qué es cada archivo y quién lo lee

| Archivo | Qué es | ¿Lo lee el juego? |
|---|---|---|
| `main.vsl` | **Guion de la escena.** Lista de `.tc` y, por cada 1/60 s, qué `.tc` y qué cuadro va en cada una de 3 capas | **Sí** (Piu `0x40C30`) |
| `*.tc` | **Animación 3D ya calculada.** Materiales (color por cuadro, banderas de mezcla, textura), objetos (triángulos con UV) y una matriz por cuadro para cada objeto | **Sí** (Piu `0x40528`) |
| `*.ifl` | Lista de imágenes de una textura animada (formato de 3D Studio) | **Sí** (Piu `0x3DABC`) |
| `*.png` / `*.bmp` | Las texturas. Los `.tc` y los `.ifl` las nombran `.bmp`, pero el juego carga primero el `.png` del mismo nombre | **Sí** (Piu `0x3DF94`) |
| `main.rhy` | Proyecto del editor de ritmo de F2. `GetVisual_v16.exe` lo **compila** a `main.vsl` | No |
| `*.nt` | Pasos de música del editor de F2 (solo en la escena 44) | No |
| `*.jtx` | Textura cruda de 16 bits (escenas 09, 29, 39, 41 y 44) | No |
| `PREVIEW.PIX` | "Resource fork" de Macintosh: vista previa de Photoshop (escenas 09, 15 y 39) | No |

En `Piu.exe` no aparecen los textos `jtx`, `rhy`, `pix` ni `.nt`. Los cuatro últimos son restos de las herramientas que quedaron en los paquetes.

## 2. Cómo se reproduce una escena (lo importante para el port)

### 2.1 Tiempo
- **Un registro del `.vsl` = 1/60 de segundo.**
  - **C** en el compilador: GetVisual `0x4010E0` calcula `cuadros = trunc(filas × 60 / (4 × BPM) × 60)` y recorre `t = i × (1/60)`, con la constante `double 0x3F91111111111111`.
  - **C** en el juego: el reloj es un temporizador de **240 Hz** (Piu `0x212BF`: `0x3A9DC(0, 240.0)` programa el manejador `0x20B9C`, que suma 1 a `[0x1CA6C8]` en cada tic). Al dibujar, `cuadro = tics / 4` (Piu `0x2C484`).
- **El reloj sigue a la música (C, Piu `0x3D0E0`–`0x3D10F`):** cada 256 cuadros MP3 que le entrega a la placa de sonido, lo vuelve a poner en `cuadrosMP3 × 6.2688` tics (float `0x40C89A02` ≈ 1152 / 44100 × 240). Además nunca retrocede (`0x2C452`–`0x2C47E`).
  - En el port: `cuadro = floor(tiempoDeLaCancion × 240) / 4`, tomando el tiempo del audio (`f2.cuadroDeSegundos`).
- Si `cuadro ≥ cantidad de cuadros del .vsl`, **no se dibuja nada** de F2 (C, Piu `0x40DD2`).
- **La apertura** (`BGA\open.dat`) no usa el reloj de la canción. Avanza **un cuadro por vuelta** de la función `0x3AEBC` hasta el `0x3FC` = 1020 (C, Piu `0x3AF8B`–`0x3AFAF`).
  - Que esa vuelta sea a 60 por segundo es **D**: el bucle principal `0x21738` hace un `glClear` y un `SwapBuffers` por vuelta.

### 2.2 Qué se dibuja en cada cuadro (C, Piu `0x40D28`; VslView `0x4017D0`)
1. `glDisable(GL_DEPTH_TEST)`, `glEnable(GL_CULL_FACE)` y `glCullFace(GL_BACK)`: **no hay prueba de profundidad** y se descartan las caras de atrás (el frente es antihorario, que es lo normal en OpenGL).
2. Proyección: `glMatrixMode(GL_PROJECTION)`, `glPushMatrix`, `glLoadIdentity`, **`gluPerspective(73.74, 1.3333, 0.01, 15.0)`**.
   - Son `double` en Piu: `0x40526F5C28F5C28F`, `0x3FF55532617C1BDA`, `0x3F847AE147AE147B` y `0x402E000000000000`.
   - VslView usa los mismos valores, pero pasados por `float`.
   - El aspecto es 1.3333, no 4/3 exacto.
3. Cámara: `glMatrixMode(GL_MODELVIEW)`, `glPushMatrix`, `glLoadIdentity`, **`gluLookAt(0,0,3.2,  0,0,-1,  0,1,0)`**.
   - Resultado: en el plano z = 0 se ve x ∈ [−3.2, 3.2] e y ∈ [−2.4, 2.4], o sea que **1 unidad = 100 píxeles** de la pantalla de 640×480 (**D**: sale de la cuenta).
4. Para cada capa k = 0, 1, 2 **en ese orden**: si `tc[k] ≥ 0`, se dibuja el `.tc` número `tc[k]` de la lista, en su cuadro `cuadroTC[k]` (Piu `0x40720`).
   - Adentro, todos los objetos en el orden del archivo.
   - En cada objeto, sus grupos en orden (Piu `0x408F4`):
     - `glPushMatrix`, `glMultMatrixf(matriz[cuadroTC])`;
     - para cada grupo: aplicar el material y la textura (§2.3), `glColor4fv(difuso[clave])` y `glBegin(GL_TRIANGLES)`;
     - por vértice, `glTexCoord2f(u, v)` y `glVertex3f(x, y, z)`;
     - `glEnd`. Al final del objeto, `glPopMatrix`.
5. Al final: `glPopMatrix` en las dos matrices (queda puesto `GL_PROJECTION`), `glDisable(GL_DEPTH_TEST)`, `glDisable(GL_CULL_FACE)`, `glEnable(GL_BLEND)` y `glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)`.
   - Esto último deja el estado listo para lo que el juego dibuja encima: flechas y textos.

**Antes y alrededor** (C, Piu `0x20DCC` y `0x2174B`):
- Al arrancar, el juego deja configurado:
  - `glClearColor(0,0,0,1)`;
  - `glShadeModel(GL_FLAT)`;
  - `GL_DITHER` y `GL_COLOR_MATERIAL` prendidos;
  - `GL_TEXTURE_2D` prendido;
  - `glTexEnvi(GL_MODULATE)`.
- Cada vuelta del bucle empieza con `glClear(GL_COLOR_BUFFER_BIT)`.
- **Nunca prende `GL_LIGHTING`**, así que los `glMaterial` del material no cambian nada: el color es el de `glColor4fv`.

### 2.3 Material y textura de un grupo (C, Piu `0x3F298` → `0x3FE54` → `0x3DA54`; VslView `0x401C90` → `0x4036E0` → `0x402DC0`)
Con `c = cuadroTC`:
- `clave = c mod claves del slot` (las claves son los cuadros de animación del material);
- `cuadroTextura = c mod cantidad de imágenes de la textura`;
- `mascara` = esa imagen tiene archivo de máscara.

Después:
1. `glColor4fv(difuso[clave])` y `glMaterialfv` de ambiente, difuso, especular y emisión, y `glMaterialf` del brillo (sin efecto visible).
2. Si `banderas & 0x004`: `glLineWidth(ancho)`. Ningún `.tc` la usa.
3. **Mezcla**, la primera regla que se cumpla:

   | Condición | OpenGL | Nombre en `f2.js` |
   |---|---|---|
   | `banderas & 0x010` | `glEnable(GL_BLEND)`, `glBlendFunc(GL_ONE, GL_ONE)` (aditiva) | `'suma'` |
   | `banderas & 0x020` | `glEnable(GL_BLEND)`, `glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)` | `'alfa'` |
   | alfa del difuso < 0.99, **o** la textura de este cuadro tiene máscara | ídem | `'alfa'` |
   | si no | `glBlendFunc(GL_ONE, GL_ZERO)`, `glDisable(GL_BLEND)` | `'opaco'` |

   - Piu compara el alfa como **entero con signo** contra los bits de 0.99 (`cmp dword [..], 0x3F7D70A4`, en `0x3FF80`).
   - VslView hace lo mismo en coma flotante: `fcomp` contra `0.99` en `0x4112B0`.
4. `glTexParameteri(WRAP_S, banderas & 0x400 ? GL_CLAMP : GL_REPEAT)` y lo mismo para `WRAP_T` con `0x800`.
5. Si el material tiene textura: `glTexEnvf(GL_MODULATE)`, `glBindTexture(id[cuadroTextura])` y `glEnable(GL_TEXTURE_2D)`.

**Tres detalles del original que cambian lo que se ve, y que `f2.dibujarEscena` respeta a propósito:**
- **El `WRAP` va a parar a la textura anterior.** El paso 4 se hace *antes* de enlazar la textura del grupo (paso 5), así que el `GL_TEXTURE_WRAP` que pide un material queda guardado en la textura que estaba enlazada, la del grupo anterior. La textura propia conserva el último valor que le tocó. Esto es **C** por el orden de las llamadas.
- **Material sin textura** (`tieneTextura = 0`): no se apaga `GL_TEXTURE_2D` ni se enlaza nada, así que **se dibuja con la última textura enlazada** (**C**: no hay ningún `glDisable(GL_TEXTURE_2D)` en este camino).
  - Pasa en las escenas 09 (`f_ffff`, `f_xcbhfj`) y 29 y 41 (`f_sdggnbvfhk`, `f_sasdfj`).
- **Textura que el juego no puede cargar**: no aborta.
  - Pasa por ejemplo con `no_back..bmp` de la escena 11: con dos puntos, su cuenta de la extensión da `"."`.
  - Piu guarda el número −1 sin mirar el error (**C**, `0x3D93E`). Al enlazar (`0x3DA54`), con −1 lee fuera de la tabla (**C**):
    - la validación mira `[0x592050]`, que es la cantidad de texturas cargadas, y pasa si es > 0;
    - como nombre de textura usa `[0x592820]`, el último contador de la tabla de 500, que vale 0 salvo que haya 500 texturas (**D**);
    - o sea, enlaza la **textura 0** (vacía).
  - Con la textura 0, Mesa dibuja **sin textura**: solo el color del material (**D**).
  - VslView, en cambio, deja la textura anterior.
  - `f2.js` sigue a Piu: `idGL` devuelve 0.

### 2.4 Texturas (C, Piu `0x3DF94`, `0x3EB30`, `0x3E670`; VslView `0x402C10`, `0x403110`, `0x402F90`)
- **Nombres:** todos se pasan a minúsculas (`0x40B7C`).
  - Si la extensión es `.bmp`, se prueba primero `nombre.png` dentro del paquete y, si no está, el `.bmp` (Piu `0x3E09A`–`0x3E120`). Cualquier otra extensión da "is not yet loadable".
  - La extensión se calcula partiendo en el primer `.` y cortando en el segundo (`0x40AA8` / `0x401F40`; `f2.extensionF2`).
- **PNG:** se exigen lados de hasta 256 y tipo de color con el bit 2 (RGB o RGBA).
  - Las filas quedan **de arriba hacia abajo**: la fila 0 de la textura es la de arriba de la imagen.
  - **En una imagen RGB (tipo 2), alfa = 0 si el píxel es negro puro (R+G+B = 0) y 255 si no** (Piu `0x3EE1E`).
  - De los 3.069 PNG de las escenas, 3.065 son tipo 2. Los otros 4 tienen paleta (tipo 3: `11\monitor-one01.png` y `20\white.png`, en `Bga` y en `empty`); el juego no les agrega alfa, pero ningún `.tc` los usa.
- **BMP** (solo 24 bits): mismas reglas. Vienen de abajo hacia arriba y se dan vuelta (VslView `0x403110`, Piu `0x3E808`).
- **Máscara** (segundo nombre del material, si tiene más de 2 letras): `alfa = trunc((R+G+B) × 0.33333334)` de la máscara, que tiene que ser del mismo tamaño.
  - Si el tamaño no coincide, da "image size is different" y queda como textura que no cargó.
- **Formato interno:**
  - **Piu:** `GL_RGB5_A1` si no hay máscara y `GL_RGBA4` si la hay (`0x3E34D`: `0x8056 + (modo==1)`).
  - **VslView:** siempre `GL_RGB5_A1`.
  - En la Voodoo eso queda como ARGB1555 (alfa de 1 bit) y ARGB4444. Ver `GL_LLAMADAS.md`, punto 4. El efecto exacto es **D**; `f2.cuantizarComoVoodoo` lo imita, si se quiere.
- Filtro `GL_LINEAR` (ampliar y reducir), sin mipmaps; `glPixelStorei(GL_UNPACK_ALIGNMENT, 1)`.
- Las coordenadas `v` de los `.tc` vienen de 3D Studio con el signo cambiado: van de 0 a −1. Con `GL_REPEAT` y la fila 0 arriba, la imagen queda derecha (**D**, comprobado con las capturas).

### 2.5 Las tablas globales de la escena (C, VslView `0x4019F0`, `0x401C50`, `0x403500`; Piu `0x3EFC8`, `0x3F250`, `0x3FBD4`)
Hay que replicarlas porque cambian qué textura sale. `f2.armarEscena` lo hace.
- **Materiales por nombre** (en minúsculas, hasta 500): `sgl_CreateMaterial` busca primero por nombre.
  - **Si ya existe, devuelve el existente y no copia nada.** Si dos `.tc` traen un material con el mismo nombre, vale la definición del primero que se cargó: sus colores, sus banderas y su cantidad de claves.
- **Slots** (hasta 500): uno por cada material de cada `.tc`, aunque el material se repita. Guarda:
  - el número de material;
  - las **claves de ese `.tc`** (para el `mod`);
  - si tiene textura;
  - la lista de texturas (una por imagen del `.ifl`).
- **Grupos de un objeto:** el nombre de material se busca en la tabla global, y se usa el **primer slot de toda la escena** con ese material, aunque sea de otro `.tc` cargado antes.
  - Si el nombre no existe, el `.tc` no carga: "Can't Load".
- **Texturas** (hasta 500): una por par (imagen, máscara), compartidas con contador de referencias.
- Los `.tc` se cargan en el orden de la lista del `.vsl`. Al cambiar de escena se borra todo (Piu `0x40E64` → `0x3EF94`).

## 3. `.vsl` — guion de escena

Lectura: VslView `0x4016E0`, Piu `0x40C30`. Escritura: GetVisual `0x401420`. Todo en little endian.

| Offset | Tipo | Qué es |
|---|---|---|
| 0 | `u32` | **N** = cantidad de `.tc`. Si es ≥ 100, el original la baja a 99 y **no saltea** los nombres sobrantes, así que el resto se leería corrido (**C** `0x40172B`, Piu `0x40C73`). Ninguna escena pasa de 45 |
| 4 | `char[32] × N` | nombre de cada `.tc`, con relleno de ceros |
| 4 + 32·N | `u32` | **F** = cantidad de cuadros |
| 8 + 32·N | 12 bytes × F | por cuadro: `i16 tc[3]` (número en la lista; **−1 = capa vacía**) y `i16 cuadroTC[3]` |

- **C:** Piu lee `cuadroTC` como `[registro + 4 + 2k] >> 16`; VslView como `movsx word [registro + 6 + 2k]`.
- Los cuadros del `.tc` se recorren a 30 por segundo (dos registros del `.vsl` por cuadro) o a 25; es lo que puso el editor (**D**).
- VslView no dibuja un `cuadroTC ≥ numCuadros del .tc` (`0x40237C`); Piu no lo controla. En los 63 `.vsl` no pasa nunca (prueba).
- `empty\CONGR\5.vsl` y `10.vsl` son escenas sueltas (¿felicitaciones?) que el juego no carga.

## 4. `.tc` — animación de F2

Lectura: VslView `0x4021C0`, Piu `0x40528`. Lo arma `Tch2Tc_v16.exe` desde un `.tch` exportado de 3D Studio.

```
u32 M                          cantidad de materiales
M × material
i32 numCuadros                 VslView no dibuja cuadros ≥ este (0x40237C); Piu no lo mira
i32 msPorCuadro                33 (30 c/s) o 41 (24 c/s); nadie lo usa (D: viene de 3D Studio)
u32 O                          cantidad de objetos
O × objeto
```

### Material (VslView `0x4019F0`, Piu `0x3EFC8`)
| Campo | Tipo | Qué es |
|---|---|---|
| nombre | `char[32]` | después del 0 viene basura de memoria del editor |
| tieneTextura | `i32` | ≠ 0: hay mapas |
| campo2 | `i32` | se lee y no se usa (vale 0 o 1) |
| si tieneTextura: P | `i32` | cantidad de pares de mapas; **solo vale el primero**: los demás se leen y se tiran (`0x401A93` / `0x3F09B`) |
| P × par | `char[32]` + `char[32]` | imagen (o `.ifl`) y máscara (o `.ifl`; vacío = sin máscara) |
| n | `i32` | **claves** (cuadros de animación del material). Si es ≤ 0, el material no carga |
| difuso | `float[4] × n` | **el color**: RGBA, `glColor4fv` |
| ambiente | `float[4] × n` | `glMaterialfv(GL_AMBIENT)` (sin efecto) |
| especular | `float[4] × n` | `glMaterialfv(GL_SPECULAR)` (sin efecto) |
| emisión | `float[4] × n` | `glMaterialfv(GL_EMISSION)` (sin efecto) |
| brillo | `float × n` | `glMaterialf(GL_SHININESS)` (sin efecto) |
| banderas | `u32` | ver tabla |
| campo28 | `i32` | siempre 200; se copia y no se usa |
| extra | `u32 × 2` | siempre 0; no se usa |

Así queda en memoria (**C**): el primer arreglo del archivo va a `+0x30` = difuso, que es el que usan `glColor4fv` y la regla del alfa; el segundo a `+0x2C` = ambiente; después `+0x34` = especular, `+0x38` = emisión y `+0x3C` = brillo. Las banderas van a `+0x20`. El ancho de línea (`+0x40`) arranca en 1.0 y no se lee del archivo.

**Banderas** (las cuentas son de los 4.946 materiales: `0x10` ×1341, `0x210` ×1328, `0` ×1026, `0x280` ×292, `0x20` ×193…):

| Bit | Efecto | |
|---|---|---|
| `0x004` | línea: `glLineWidth`; VslView además dibuja `GL_LINE_LOOP`. No aparece en ningún archivo | C |
| `0x010` | mezcla aditiva `(GL_ONE, GL_ONE)` | C |
| `0x020` | mezcla por alfa | C |
| `0x400` | `WRAP_S = GL_CLAMP` | C |
| `0x800` | `WRAP_T = GL_CLAMP` | C |
| `0x002`, `0x080`, `0x200` | el código no los mira (vienen del exportador) | C (que no se usan) |

### Objeto (VslView `0x4023B0`, Piu `0x40750`)
```
u32 G                                   cantidad de grupos (uno por material)
G × char[32]                            nombre del material de cada grupo
G × i32                                 cantidad de vértices de cada grupo
(suma) × { float x, y, z, u, v }        20 bytes por vértice; todos los grupos seguidos; de a 3 forman triángulos
i32 K                                   cantidad de matrices (una por cuadro)
K × float[12]                           matriz del cuadro
```
- **Matriz** (C, VslView `0x402130`, Piu `0x40490`): son 4 filas de 3 (eje X, eje Y, eje Z, traslación, como la `Matrix3` de 3D Studio).
  - Se arma la matriz de OpenGL **por columnas** con esas filas: `m[0..2]=f0..2`, `m[4..6]=f3..5`, `m[8..10]=f6..8`, `m[12..14]=f9..11`, `m[3]=m[7]=m[11]=0`, `m[15]=1`, y se pasa a `glMultMatrixf`.
  - Es decir: `mundo = x·(f0,f1,f2) + y·(f3,f4,f5) + z·(f6,f7,f8) + (f9,f10,f11)`.
- Vértice: `glTexCoord2f(u, v)` y después `glVertex3f(x, y, z)` (**C**).
- Piu no controla que `cuadroTC < K`. En los datos nunca se pasa (prueba).

## 5. `.ifl` — lista de cuadros (C, VslView `0x402790` + `0x401ED0`; Piu `0x3DABC` + `0x40A44` + `0x409D0`)
- Texto, abierto en modo `"rt"`. Se lee de a una línea de **hasta 100 caracteres**: una más larga se parte en dos.
- Una línea **vacía**, o sin palabras, **termina la lista**. Ojo: con una línea vacía en el medio, se pierde todo lo que sigue.
- Las líneas que empiezan con `;` se saltean.
- De cada línea vale **solo la primera palabra** (separadores de `isspace`). **No hay contador de repeticiones** como en 3D Studio: para que un cuadro dure más, el archivo lo repite.
- **Pares imagen/máscara** (`sgl_RegistryFileName`):
  - si la imagen tiene varios cuadros y la máscara uno, la máscara se repite;
  - si la imagen tiene uno y la máscara varios, la imagen se repite;
  - si las dos tienen varios, distintos, se usa el mínimo.
  - Un `.ifl` que no está o que queda vacío hace fallar el material, y con él toda la escena.
- El cuadro de la textura es `cuadroTC mod cantidad`: avanza con el cuadro del `.tc`, no con el del `.vsl`.

## 6. Archivos que el juego no lee

### `.rhy` (solo `empty\OPEN1\main.rhy` y `Bga\52\main.rhy`, más sus copias)
- Proyecto del editor de ritmo de F2: `Wwp.exe` ("RhyViewer"), con `RhyView_v16.exe` para verlo y oírlo con el MP3.
- Está guardado con la serialización de MFC (`CArchive`): cadenas con largo de 1 byte, `double` para el BPM (120.0 = `0x405E000000000000`) y registros de 32 bytes por tempo al comienzo.
- `GetVisual_v16.exe` lo convierte a `main.vsl` (**C**: `0x4015B0` muestra "Loading.. / Converting.. / Saveing.." y escribe con `0x401420`; las notas se leen en `0x4029B0`, que da error si hay más de 5000 notas o si los "tic per bit" pasan de 4).
- La lectura completa del objeto no se terminó: el `Serialize` del objeto principal está vacío (`0x4147D0`) y la carga real pasa por otras clases, sin rastrear.
- `f2.leerRHY` es **parcial**: versión, las cadenas que nombran `.tc` y `.tmm`, y un conteo de tempos. Para el port no hace falta: el resultado ya está en `main.vsl`.

### `.nt` (escena 44: `no1.Nt`, `test02.Nt`, `____.Nt`) — **D**
- `u32 n` y después n registros de 224 bytes: `float bpm`, 54 `u32` de datos y `u32 tiempo` en ms al final.
- El tiempo sube de a 60000 / BPM / 4: es un paso por semicorchea. Por ejemplo, el último de `no1.Nt` es 98.713 ms, lo que dura la canción.
- Cola: `u32 k`, k nombres `char[32]` de `.TCH` (`J-back01.TCH`…) y más datos sin descifrar.
- Lo lee `f2.leerNT`.

### `.jtx` (escenas 09, 29, 39, 41 y 44) — **D**
- `u32 formato` (2), `u32 ancho`, `u32 alto`, `u32` (1), `u32` (30), 40 bytes de basura y `ancho × alto` píxeles `u16`.
- Por los datos, parecen ARGB4444: rampas `0x0111` → `0xF111` en los bordes.
- Lo lee `f2.leerJTX`, y `.rgba()` lo pasa a 8 bits por canal.

### `PREVIEW.PIX` (escenas 09, 15 y 39)
- Es la "resource fork" de una carpeta de Macintosh, copiada como archivo: cabecera big endian (inicio de datos, inicio del mapa y largos) y recursos `PICT` con las vistas previas de las imágenes, cada uno con el nombre del archivo (`F01.BMP`, `CANAL006.BMP`, `DONE.PSD`…).
- Formato público de Apple. Lo lee `f2.leerPIX` y devuelve los recursos (tipo, número, nombre y datos).

### `.tch` (no hay ninguno en el disco)
- Exportación de 3D Studio ("Techno files"). `Tch2Tc_v16.exe` lo pasa a `.tc`.

### El kit de herramientas de F2 (`empty\OPEN1`)

| Programa | Qué hace |
|---|---|
| `VslView_v16.exe` | Reproduce los `.vsl` de la carpeta: Enter = siguiente, Esc = salir. Avanza **un cuadro por redibujado**, sin mirar el reloj: el temporizador de 16 ms en `0x401080` prende una bandera que nadie lee, así que su velocidad depende de la sincronía vertical. Solo lee BMP |
| `TcViewer_v16.exe`, `TcTest_v16.exe` | Ven un `.tc` suelto (`List.txt`) |
| `Tch2Tc_v16.exe` | Convierte `.tch` en `.tc` |
| `RhyView_v16.exe` | Reproduce un `.rhy` con su MP3 (`RhyList.txt`); lee PNG |
| `GetVisual_v16.exe` | Compila `*.rhy` → `.vsl` |
| `Wwp.exe` | El editor (MFC): música `.tmm`, `.tch`, modos y niveles |
| `BMP2PNG.EXE` | Pasa BMP a PNG. Por eso el paquete trae `.png` aunque los `.tc` digan `.bmp` |

## 7. VslView contra Piu (lo que no es igual)

| Tema | VslView | Piu (el que manda) |
|---|---|---|
| Avance | un cuadro por redibujado | reloj de 240 Hz / 4, sincronizado con el MP3 |
| Cuadro del `.vsl` fuera de rango | lee igual, sin control | no dibuja |
| `cuadroTC ≥ numCuadros` del `.tc` | no dibuja ese `.tc` | dibuja (no pasa en los datos) |
| Material con `0x004` | `GL_LINE_LOOP` | triángulos |
| Imágenes | solo BMP | PNG primero, BMP después |
| Formato interno | siempre `RGB5_A1` | `RGB5_A1`, o `RGBA4` con máscara |
| Textura que no cargó | deja la anterior | textura 0: sin textura |
| Proyección | `float` (aspecto 1.33329999…) | `double` (1.3333) |

## 8. Validación

**`tools\probar_f2.mjs`** (Node de R.A.V.E.N, unos 50 segundos):
- Lee todos los archivos de `descifrado\graficos`:
  - 63 `.vsl`, 2.418 `.tc` (+ 2 vacíos), 817 `.ifl`, 30 `.jtx`, 6 `.nt`, 6 `.pix` y 4 `.rhy`;
  - **0 errores**, y los `.tc` terminan justo en el último byte.
- Los 2 vacíos son `Bga\47\Eearth.tc` y su copia en `empty`: tienen 0 bytes ya en el paquete original y ningún `.vsl` los nombra.
- Arma las 63 escenas como el juego:
  - todos los `.tc`, `.ifl` e imágenes encontrados;
  - todos los índices dentro de rango en todos los cuadros;
  - el dibujo completo (con un OpenGL de mentira) cada 30 cuadros.
- **0 errores.** Avisos, que son cosas del original y no del lector:
  - la textura `no_back..bmp` de la escena 11 no carga en el original;
  - materiales sin textura en 09, 29 y 41;
  - 4 texturas rotas en `empty\OPEN` (versión vieja, que el juego no usa).

**Contra VslView** (las capturas de `investigacion\referencias\`):
- Se dibujaron cuadros de la escena 04 con un rasterizador de software hecho sobre `f2.js` (temporal, en `%TEMP%\piu_f2\render.mjs`).
- Coinciden composición, encuadre, orientación, colores y mezclas:
  - cuadro 180 = captura de 3 s;
  - cuadro 360 = 6 s;
  - cuadro 620 = 10 s ("GO");
  - cuadro 1200 = la de "15 s" (túnel de rayas naranjas aditivas con el bailarín). VslView no va a 60 fijos, así que la etiqueta de tiempo es aproximada.
- La caja derecha del cuadro 180 cae en el mismo píxel que en la captura.
- Esto confirma la convención de las matrices, las UV y la fila de arriba, la cámara, el descarte de caras y los modos de mezcla.

## 9. Lo que falta para que salga igual que la cabina
1. **Pantalla de 16 bits de la Voodoo:** RGB565 con tramado (`GL_DITHER` prendido) y texturas en 1555/4444. Es opcional, pero se nota en los fundidos (ver `GL_LLAMADAS.md`, puntos 3 y 4, y `f2.cuantizarComoVoodoo`).
2. **`GL_CLAMP` en la Voodoo:** se comporta como "clamp to edge", sin borde (**D**). gl1.js ya lo traduce así.
3. **Un caso borde de textura que no cargó:** si fuera la primera textura de la escena, `[0x592050]` valdría 0 y no se enlazaría nada (**D**). No pasa en el disco.
4. **Ritmo exacto de la apertura:** una vuelta del bucle principal por cuadro; falta confirmar que el bucle va a 60 Hz.
5. **`.rhy` completo y los campos sin uso** (`campo2`, `msPorCuadro`, banderas `0x2`/`0x80`/`0x200`): no afectan el dibujo.

## 10. Uso de `app\motor\f2.js`
```js
import * as f2 from './motor/f2.js';
const vsl = f2.leerVSL(bytesDeMainVsl);
const escena = f2.armarEscena(vsl, { tc: (n) => bytesDelPaquete(n), texto: (n) => textoDelPaquete(n) });
const ids = f2.crearTexturasGL(gl, escena, (n) => imagenRGBA(n));   // gl = GL1 de gl1.js; imagenRGBA: {ancho, alto, rgba, tieneAlfa} o null
// en cada cuadro de la canción, después de glClear y antes de las flechas:
f2.dibujarEscena(gl, escena, f2.cuadroDeSegundos(audio.currentTime), (i) => ids[i]);
```
- `estadoCuadro(escena, n)` da lo mismo sin OpenGL: capas, objetos con su matriz y grupos con color, textura, mezcla, wrap y vértices.
- `leerBMP`, `infoPNG`, `aplicarClaveNegra` y `mezclarMascara` son las reglas de imagen del juego. El PNG lo decodifica la plataforma: en el navegador alcanza `createImageBitmap` y un canvas, porque todos son RGB sin alfa.
