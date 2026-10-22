# Llamadas de OpenGL del juego (tarea "gl") · 04/10/2026

Qué funciones de video llama el código del juego (0x20000–0x49000), con su nombre, cómo recibe cada argumento, cuántas veces se llama y desde dónde. Al final está la lista de lo que el port tiene que implementar sobre WebGL.

**C** = confirmado en el código (con la dirección). **D** = deducido.

## Resumen

- La biblioteca es **Mesa 3.0** (**C**: texto `"1.2 Mesa 3.0"` en 0x134244) con el controlador `fx` "Glide v0.29" para la Voodoo, más **GLU de Mesa 3.0** (`"1.1 Mesa 3.0"` en 0x138D6E).
- El juego llama a **52 funciones distintas** desde **1.138 lugares** repartidos en **111 funciones** del juego:
  - 43 de OpenGL;
  - 2 de GLU (`gluPerspective`, `gluLookAt`);
  - 5 de una capa chica tipo AUX que crea la ventana sobre fxMesa;
  - 2 de Glide directo (`grLfbLock`/`grLfbUnlock`), para pegar imágenes de 640×480 en pantalla.
- **Contexto (C):** pantalla completa de 640×480 a 60 Hz. Tiene doble buffer y **no tiene** buffer de profundidad, alfa de destino ni stencil. La proyección es `glOrtho(0, 640, 0, 480, 0, 1)`, con el origen abajo a la izquierda.
- **Dibujo (C):** casi todo es 2D, con `GL_QUADS` texturados (`glTexCoord2f` + `glVertex2i`), `glTranslatef`/`glScalef`/`glRotatef` y `glColor4f` para teñir y fundir (`GL_MODULATE`). Hay un solo camino 3D: 0x40D28 → 0x408F4, con `gluPerspective`, `gluLookAt`, `GL_TRIANGLES` y `glVertex3f`.
- **Ojo:** a `desarmado_juego.txt` le faltan **46 funciones** que llaman a OpenGL (unas 400 llamadas). Para esta tarea se desarmó linealmente toda la zona 0x20000–0x49000 (ver la sección 7).

## 1. Cómo se sacaron los nombres

1. **Las llamadas.**
   - Se desarmó en forma lineal toda la zona 0x20000–0x49000 (47.678 instrucciones) y se juntaron todos los `call` cuyo destino cae fuera del juego.
   - Se comprobó contra un barrido de bytes `E8 rel32`: aparecieron los mismos 1.136 destinos conocidos. La única diferencia es un sitio en 0x25009 que radare2 partió en el borde de página y que se agregó a mano.
2. **Las funciones de la API de Mesa 3.0** (`api1.c`/`api2.c`) son envoltorios:
   ```
   mov edx,[0x1A2E8C]   ; CC = contexto actual (C)
   call dword [edx + W] ; (*CC->API.Xxx)(CC, ...)
   ```
   - La tabla `API` empieza en **ctx+4**, así que el desplazamiento W de la llamada es igual al índice T de la tabla más 4. **C**: lo confirma 0x64B17, donde `gl_TexCoord4f` reemplaza `ctx->API.TexCoord2f` escribiendo en `[ctx+0x290]`.
   - Las copias `Save` y `Exec` están en ctx+0x300 y ctx+0x5FC.
3. **La tabla se llena en 0x973C8** (`init_exec_pointers` de `pointers.c`; la de `Save` está en 0x97AE0) con 191 entradas `mov [eax+T], gl_Xxx`.
   - Casi todas las implementaciones `gl_Xxx` usan su propio texto de error, por ejemplo 0x87D78 → `"glDeleteTextures"` y 0xBA0F8 → `"glGetIntegerv"`.
   - Así cada W queda con su nombre.
4. **Doble control:**
   - Los envoltorios están en orden alfabético, como en `api1.c`/`api2.c`. Por ejemplo, `glColor4f` (0xDB620) está entre `glColor4d` y `glColor4i`, y las variantes `…d`, `…i` y `…s` convierten el valor y llaman a la misma entrada.
   - La firma de cada uno (cuántos argumentos van en registros, cuántos bytes saca con `ret N`) coincide con la función de OpenGL.
5. **GLU** (0xEC443, 0xEC895): el código es el de `project.c` de Mesa.
   - `gluLookAt` normaliza, hace productos vectoriales y llama a `glMultMatrixd` (0xDE31C) y `glTranslated(-eye)` (0xDA8EC).
   - `gluPerspective` calcula `zNear·tan(fovy·π/360)` (las constantes π y 360.0 están en 0x138D7B y 0x138D83) y llama a `glFrustum` (0xDCC1C).
6. **Glide:** el cargador del overlay (0x10C770) resuelve cada salto por su índice: `(dirección − 0x117228)/5` sobre la tabla de nombres de 0x1174B4.
   - 0x11731D → `_GRLFBLOCK@24`.
   - 0x11732C → `_GRLFBUNLOCK@8`.

### Convención de llamada (C)

- **Mesa y GLU** (Watcom, por registros):
  - Los enteros y punteros van en **EAX, EDX, EBX, ECX**, en ese orden.
  - Los `float` y `double` van **en la pila**. El primero queda en la dirección más baja, o sea que se empuja último. Los saca la función llamada con `ret N`.
  - Cuando hay enteros y floats mezclados, los enteros ocupan los registros y los floats van a la pila. Por ejemplo, `glTexEnvf(target=EAX, pname=EDX, [pila] param)`.
  - Se devuelve en EAX (o AL).
  - La función llamada conserva todos los registros menos EAX. Por eso el juego deja valores en EDX y EBX para la llamada siguiente: en 0x20E56, el EDX=0x303 del `glEnable` sirve para el `glBlendFunc` que sigue.
- **Glide:** `__stdcall`, con todo en la pila. Lo saca la función llamada.

## 2. Tabla de llamadas

Dirección = destino del `call` en `Piu.exe`. "Desde" = funciones del juego que la llaman (×N = cantidad de llamadas desde esa función). En las funciones que no están en `desarmado_juego.txt`, el inicio se calculó (ver la sección 7).

| Dirección | Nombre | Argumentos (cómo se pasan) | Llamadas | Desde | C/D |
|---|---|---|---|---|---|
| `0xD83B0` | `glOrtho` | 6 `double` en pila: left, right, bottom, top, near, far (48 bytes, los saca la función) | 1 | 0x20DCC | **C** |
| `0xD86B4` | `glPixelStorei` | pname=EAX, param=EDX | 9 | 0x214D8 ×4, 0x338BC, 0x3DF94, 0x3E758, 0x3F3F0, 0x3F66C | **C** |
| `0xD897C` | `glPopMatrix` | sin argumentos | 80 | 0x201F0 ×2, 0x21738, 0x22854, 0x23AB8, 0x23B50 ×5, 0x23DB4, 0x24DB0 ×4, 0x26FA8, 0x26FD0, 0x27000, 0x27028, 0x27158, 0x279D8 ×3, 0x27A5C ×3, 0x27AEC ×6, 0x27CC4, 0x28A70, 0x2A944 ×14, 0x2C04C ×14, 0x2E8F0 ×2, 0x33490, 0x334F4, 0x33560, 0x33630, 0x34794 ×2, 0x3779C, 0x377D0, 0x3788C, 0x379DC, 0x37B7C, 0x38450, 0x38C5C, 0x408F4, 0x40D28 ×2 | **C** |
| `0xD8A30` | `glPushMatrix` | sin argumentos | 80 | 0x201F0 ×2, 0x21738, 0x22854, 0x23AB8, 0x23B50 ×5, 0x23DB4, 0x24DB0 ×4, 0x26FA8, 0x26FD0, 0x27000, 0x27028, 0x27158, 0x279D8 ×3, 0x27A5C ×3, 0x27AEC ×6, 0x27CC4, 0x28A70, 0x2A944 ×14, 0x2C04C ×14, 0x2E8F0, 0x33490, 0x334F4, 0x33560, 0x33630, 0x34794 ×2, 0x3779C ×2, 0x377D0, 0x3788C, 0x379DC, 0x37B7C, 0x38450, 0x38C5C, 0x408F4, 0x40D28 ×2 | **C** |
| `0xD9300` | `glReadPixels` | x=EAX, y=EDX, width=EBX, height=ECX; pila: format, type, pixels | 1 | 0x214D8 | **C** |
| `0xD9828` | `glRotatef` | 4 `float` en pila: angle, x, y, z | 3 | 0x33560, 0x3779C ×2 | **C** |
| `0xD9910` | `glScalef` | 3 `float` en pila: x, y, z | 13 | 0x23B50 ×5, 0x27CC4 ×2, 0x31154 ×2, 0x334F4, 0x33560, 0x3779C ×2 | **C** |
| `0xD9958` | `glShadeModel` | mode=EAX | 9 | 0x20DCC, 0x377D0 ×2, 0x3788C ×2, 0x38450 ×2, 0x38C5C ×2 | **C** |
| `0xD9B30` | `glTexCoord2f` | 2 `float` en pila: s, t | 121 | 0x20000 ×4, 0x200D0 ×4, 0x201F0 ×20, 0x22FC8 ×4, 0x230A0 ×4, 0x231DC ×4, 0x232B4 ×4, 0x237D8 ×4, 0x27CC4 ×8, 0x28A70 ×8, 0x2A944 ×8, 0x2C04C ×8, 0x34618 ×4, 0x346C4 ×4, 0x358F0 ×4, 0x359DC ×4, 0x35B18 ×4, 0x362CC ×20, 0x408F4 | **C** |
| `0xDA238` | `glTexEnvf` | target=EAX, pname=EDX; pila: `float` param | 3 | 0x3DA54, 0x3E4A8, 0x3F620 | **C** |
| `0xDA280` | `glTexEnvi` | target=EAX, pname=EDX, param=EBX | 1 | 0x20DCC | **C** |
| `0xDA448` | `glTexImage2D` | target=EAX, level=EDX, internalFormat=EBX, width=ECX; pila: height, border, format, type, pixels | 5 | 0x338BC, 0x3DF94, 0x3E758, 0x3F3F0, 0x3F66C | **C** |
| `0xDA578` | `glTexParameterf` | target=EAX, pname=EDX; pila: `float` param | 2 | 0x338BC ×2 | **C** |
| `0xDA5C0` | `glTexParameteri` | target=EAX, pname=EDX, param=EBX | 16 | 0x338BC ×2, 0x3DF94 ×2, 0x3E758 ×2, 0x3F3F0 ×4, 0x3F66C ×4, 0x3FE54 ×2 | **C** |
| `0xDA948` | `glTranslatef` | 3 `float` en pila: x, y, z | 198 | 0x201F0 ×2, 0x227C4 ×2, 0x22854 ×46, 0x230A0 ×2, 0x232B4, 0x2397C ×2, 0x23AB8 ×4, 0x23B50 ×5, 0x23DB4 ×4, 0x24DB0 ×34, 0x26FA8, 0x26FD0, 0x27000, 0x27028, 0x27158 ×4, 0x279D8 ×3, 0x27A5C ×3, 0x27AEC ×6, 0x27CC4 ×6, 0x28A70 ×4, 0x2A944 ×20, 0x2C04C ×20, 0x33490, 0x334F4, 0x33560 ×2, 0x33630, 0x34794 ×2, 0x3779C ×10, 0x377D0 ×2, 0x3788C, 0x379DC, 0x37B7C, 0x38450 ×2, 0x38C5C ×2 | **C** |
| `0xDA9D4` | `glVertex2i` | x=EAX, y=EDX (enteros; Mesa los pasa a float) | 194 | 0x20000 ×4, 0x200D0 ×4, 0x201F0 ×20, 0x20C7C ×16, 0x22788 ×2, 0x22FC8 ×4, 0x230A0 ×4, 0x231DC ×4, 0x232B4 ×4, 0x237D8 ×4, 0x27CC4 ×8, 0x28A70 ×7, 0x2A944 ×12, 0x2C04C ×12, 0x2F680, 0x34618 ×4, 0x346C4 ×4, 0x358F0 ×4, 0x359DC ×4, 0x35B18 ×4, 0x362CC ×24, 0x377D0 ×4, 0x3788C ×8, 0x3799C ×4, 0x379DC ×16, 0x37B7C ×4, 0x38450 ×4, 0x38C5C ×4 | **C** |
| `0xDAA68` | `glVertex3f` | 3 `float` en pila: x, y, z | 1 | 0x408F4 | **C** |
| `0xDADF0` | `glViewport` | x=EAX, y=EDX, width=EBX, height=ECX | 1 | 0x20DCC | **C** |
| `0xDAE98` | `glAreTexturesResident` | n=EAX, textures=EDX, residences=EBX; devuelve GLboolean en AL | 1 | 0x3371C | **C** |
| `0xDAF18` | `glBegin` | mode=EAX | 47 | 0x20000, 0x200D0, 0x201F0 ×5, 0x20C7C, 0x22788, 0x22FC8, 0x230A0, 0x231DC, 0x232B4, 0x237D8, 0x27CC4 ×2, 0x28A70 ×2, 0x2A944 ×3, 0x2C04C ×3, 0x2F680, 0x34618, 0x346C4, 0x358F0, 0x359DC, 0x35B18, 0x362CC ×6, 0x377D0, 0x3788C, 0x3799C, 0x379DC ×4, 0x37B7C, 0x38450, 0x38C5C, 0x408F4 | **C** |
| `0xDAF54` | `glBindTexture` | target=EAX, texture=EDX | 15 | 0x338BC, 0x33F3C, 0x346A0, 0x34770, 0x34794 ×4, 0x3DA54, 0x3DF94, 0x3E4A8, 0x3E758, 0x3F3F0, 0x3F620, 0x3F66C | **C** |
| `0xDB050` | `glBlendFunc` | sfactor=EAX, dfactor=EDX | 8 | 0x20DCC, 0x33630 ×2, 0x3FE54 ×4, 0x40D28 | **C** |
| `0xDB10C` | `glClear` | mask=EAX | 5 | 0x20DAC, 0x21024 ×2, 0x21738, 0x2F680 | **C** |
| `0xDB1CC` | `glClearColor` | 4 `float` en pila: r, g, b, a | 1 | 0x20DCC | **C** |
| `0xDB394` | `glColor3f` | 3 `float` en pila: r, g, b | 27 | 0x201F0 ×2, 0x21024 ×2, 0x21738, 0x22854 ×2, 0x24DB0, 0x27CC4 ×2, 0x28A70 ×5, 0x2A944 ×4, 0x2C04C ×4, 0x2E8F0, 0x32270, 0x3311C, 0x37B7C | **C** |
| `0xDB620` | `glColor4f` | 4 `float` en pila: r, g, b, a | 84 | 0x201F0, 0x20C7C, 0x20EE8 ×2, 0x22854, 0x23858, 0x238B8 ×2, 0x23B50 ×2, 0x24DB0 ×30, 0x27158 ×15, 0x2B97C, 0x2BB10, 0x2BCA4, 0x2D0AA, 0x2D23F, 0x2D3D5, 0x2DBE0 ×2, 0x2F680, 0x30558 ×5, 0x306E8 ×4, 0x31154 ×3, 0x31740 ×4, 0x362CC ×3, 0x3B264 | **C** |
| `0xDB8D4` | `glColor3fv` | v=EAX (puntero a 3 float) | 42 | 0x377D0 ×2, 0x3788C ×8, 0x379DC ×4, 0x37CB0, 0x37FCC ×2, 0x38028 ×2, 0x380D4 ×5, 0x38304 ×3, 0x38450 ×2, 0x38574 ×7, 0x38878, 0x38A58, 0x38C5C ×4 | **C** |
| `0xDBB38` | `glColor4fv` | v=EAX (puntero a 4 float) | 4 | 0x3779C ×2, 0x3FE54, 0x408F4 | **C** |
| `0xDC0D0` | `glCullFace` | mode=EAX | 1 | 0x40D28 | **C** |
| `0xDC110` | `glDepthFunc` | func=EAX | 1 | 0x20DCC | **C** |
| `0xDC228` | `glDeleteTextures` | n=EAX, textures=EDX | 35 | 0x24010 ×8, 0x2B97C, 0x2BB10, 0x2BCA4 ×2, 0x2BEE0, 0x2D0AA, 0x2D23F, 0x2D3D5 ×2, 0x2D611, 0x2D90C, 0x32530 ×3, 0x330C4, 0x3311C, 0x33830, 0x33E90, 0x33EDC, 0x3B1F4, 0x3B264 ×3, 0x3D98C, 0x3DF40, 0x3E438, 0x3F600 | **C** |
| `0xDC268` | `glDisable` | cap=EAX | 16 | 0x20C7C, 0x20DCC ×2, 0x2A944, 0x2C04C, 0x362CC, 0x377D0, 0x3788C, 0x37C6C, 0x380D4, 0x38450, 0x38C5C, 0x3FE54, 0x40D28 ×3 | **C** |
| `0xDC4AC` | `glEnable` | cap=EAX | 24 | 0x20C7C, 0x20DCC ×4, 0x2A944, 0x2C04C, 0x33630 ×2, 0x362CC, 0x377D0, 0x3788C, 0x37C6C, 0x380D4, 0x38450, 0x38C5C, 0x3DA54, 0x3E4A8, 0x3F620, 0x3FE54 ×3, 0x40D28 ×2 | **C** |
| `0xDC52C` | `glEnd` | sin argumentos | 46 | 0x20000, 0x200D0, 0x201F0 ×5, 0x20C7C, 0x22788, 0x22FC8, 0x230A0, 0x231DC, 0x232B4, 0x237D8, 0x27CC4 ×2, 0x28A70, 0x2A944 ×3, 0x2C04C ×3, 0x2F680, 0x34618, 0x346C4, 0x358F0, 0x359DC, 0x35B18, 0x362CC ×6, 0x377D0, 0x3788C, 0x3799C, 0x379DC ×4, 0x37B7C, 0x38450, 0x38C5C, 0x408F4 | **C** |
| `0xDC9CC` | `glFinish` | sin argumentos | 1 | 0x214D8 | **C** |
| `0xDCCDC` | `glGenTextures` | n=EAX, textures=EDX | 5 | 0x338BC, 0x3DF94, 0x3E758, 0x3F3F0, 0x3F66C | **C** |
| `0xDCED4` | `glGetIntegerv` | pname=EAX, params=EDX | 1 | 0x214D8 | **C** |
| `0xDDB30` | `glLineWidth` | 1 `float` en pila: width | 1 | 0x3FE54 | **C** |
| `0xDDBF4` | `glLoadIdentity` | sin argumentos | 4 | 0x20DCC ×2, 0x40D28 ×2 | **C** |
| `0xDE104` | `glMaterialf` | face=EAX, pname=EDX; pila: `float` param | 1 | 0x3FE54 | **C** |
| `0xDE1A0` | `glMaterialfv` | face=EAX, pname=EDX, params=EBX | 4 | 0x3FE54 ×4 | **C** |
| `0xDE2DC` | `glMatrixMode` | mode=EAX | 11 | 0x20DCC ×2, 0x2A944 ×2, 0x2C04C ×2, 0x3AEBC, 0x40D28 ×4 | **C** |
| `0xDE378` | `glMultMatrixf` | m=EAX (puntero a 16 float, por columnas) | 1 | 0x408F4 | **C** |
| `0xEC443` | `gluLookAt` | 9 `double` en pila: eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ (72 bytes) | 1 | 0x40D28 | **C** |
| `0xEC895` | `gluPerspective` | 4 `double` en pila: fovy, aspect, zNear, zFar (32 bytes) | 1 | 0x40D28 | **C** |
| `0xEEC87` | `auxInitDisplayMode` | mode=EAX (guarda mode & 0xFFFF) | 1 | 0x20DCC | **D** (nombre) |
| `0xEEC9C` | `auxInitPosition` | x=EAX, y=EDX, width=EBX, height=ECX | 1 | 0x20DCC | **D** (nombre) |
| `0xEECBE` | `auxSwapBuffers` | sin argumentos (salta a fxMesaSwapBuffers 0x5B670) | 5 | 0x20DAC, 0x21024 ×2, 0x21738, 0x2F680 | **D** (nombre) |
| `0xEECCD` | `auxQuit` | sin argumentos (fxMesaDestroyContext 0x5B3B0 + exit(0)) | 2 | 0x20DAC (por `jmp`), 0x20DCC | **D** (nombre) |
| `0xEECE8` | `auxInitWindow` | title=EAX (no se usa); crea el contexto fxMesa; devuelve 1/0 en EAX | 1 | 0x20DCC | **D** (nombre) |
| `0x11731D` | `grLfbLock` | __stdcall, 6 dword en pila: type, buffer, writeMode, origin, pixelPipeline, info* | 1 | 0x2F680 | **C** |
| `0x11732C` | `grLfbUnlock` | __stdcall, 2 dword en pila: type, buffer | 1 | 0x2F680 | **C** |

En las 5 funciones AUX, lo que **hace** cada una está confirmado en el código; el nombre es deducido. Son una capa mínima tipo `aux` (la biblioteca auxiliar del "Libro Rojo") armada sobre fxMesa, que usa sus constantes: `AUX_DOUBLE`=2, `AUX_ALPHA`=16, `AUX_DEPTH`=32, `AUX_STENCIL`=64 y `AUX_ACCUM`=8 se traducen a los atributos `FXMESA_*` en 0xEECE8.

### Valores con que se llama (C, salen de los registros y de lo empujado en cada sitio)

- `glBegin`:
  - `GL_QUADS` ×41;
  - `GL_LINES` ×1 (0x20C7C);
  - `GL_POINTS` ×1 (0x2F680);
  - `GL_TRIANGLES` ×1 (0x408F4);
  - `GL_TRIANGLE_STRIP` ×1 (0x362CC);
  - `GL_TRIANGLE_FAN` ×1 (0x3788C);
  - **0x1B01 (`GL_LINE`) ×1 en 0x22793**, que es un valor inválido (ver la sección 6).
- `glEnable`: `GL_TEXTURE_2D` ×14, `GL_BLEND` ×7, `GL_CULL_FACE` ×1 (en el 3D), `GL_COLOR_MATERIAL` ×1, `GL_DITHER` ×1. Nunca `GL_LIGHTING`, `GL_ALPHA_TEST`, `GL_FOG` ni `GL_SCISSOR_TEST`.
- `glDisable`: `GL_TEXTURE_2D` ×10, `GL_DEPTH_TEST` ×3, `GL_CULL_FACE` ×2, `GL_BLEND` ×1.
- `glBlendFunc`:
  - `(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)` ×5;
  - `(GL_ONE, GL_ONE)` ×2, aditivo, en el material 3D 0x3FE54 y en 0x33630;
  - `(GL_ONE, GL_ZERO)` ×1, con `glDisable(GL_BLEND)`.
- `glTexEnvi`/`glTexEnvf`: siempre `(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_MODULATE)`. En `glTexEnvf` el valor viaja como 8448.0.
- `glTexParameter*`:
  - `GL_TEXTURE_MIN_FILTER`/`MAG_FILTER` = `GL_LINEAR` siempre.
  - `WRAP_S`/`WRAP_T`:
    - `GL_CLAMP` (10496.0) en 0x338BC;
    - `GL_REPEAT` en 0x3F3F0 y 0x3F66C;
    - `GL_CLAMP` o `GL_REPEAT` según los bits del material en 0x3FE54.
- `glTexImage2D` (`GL_TEXTURE_2D`, nivel 0, borde 0, `GL_UNSIGNED_BYTE`, siempre con `glPixelStorei(GL_UNPACK_ALIGNMENT, 1)` antes):
  - **0x338BC** (lee PNG con libpng, sistema `sgl` de F2): interno = formato = `GL_RGBA`, `GL_RGB` o `GL_LUMINANCE`, según 32, 24 u 8 bits por píxel (0x33E05). Los píxeles van en 0x2B5B0C.
  - **0x3DF94 y 0x3E758:** interno `GL_RGBA4` (0x8056) o `GL_RGB5_A1` (0x8057), según `[0x59AD04]==1`, o el valor de `[0x59204C]` si `[0x592048]≠0`. El formato es `GL_RGBA` y el búfer está en 0x59AD08.
  - **0x3F3F0 y 0x3F66C:** interno `GL_RGBA8`, formato `GL_RGBA`, búfer en 0x61F380, con `GL_REPEAT`.
- `glMatrixMode`: `GL_PROJECTION` ×3, `GL_MODELVIEW` ×8.
- `glShadeModel`: `GL_FLAT` al iniciar. Pasa a `GL_SMOOTH` solo para los degradés con `glColor3fv` por vértice (0x377D0, 0x3788C, 0x38450, 0x38C5C) y después vuelve a `GL_FLAT`.
- `glTranslatef`: `(x, y, 0)` en píxeles. `glScalef`: `(sx, sy, 1)`. `glRotatef`: `(ángulo, 0, 0, 1)`.
- `glColor4f`: casi siempre `(1, 1, 1, alfa)`, para fundidos. `glColor3f`: casi siempre `(1, 1, 1)`. Hay pocos colores fijos más: (1,0,0), (0.2,1,0.2), (1,1,0.2), (1,0.2,0.2), (0.4,0.4,0.5), (0,0,0,0.5) y (0.1,0.1,0.2,0.9).
- `glDeleteTextures` y `glGenTextures`: siempre `n=1`.
- En el 3D:
  - `gluPerspective(73.74, 1.3333, 0.01, 15.0)`;
  - `gluLookAt(0, 0, 3.2,  0, 0, −1,  0, 1, 0)`;
  - `glCullFace(GL_BACK)`.

## 3. Cómo se crea el contexto y la ventana (C, 0x20DCC; la llaman 0x21130 y 0x21BC8)

```
auxInitPosition(0, 0, 640, 480);        // 0xEEC9C: guarda x,y en [0x1C7604/08] y w,h en [0x7EFED4/D8]
auxInitDisplayMode(2);                  // 0xEEC87: AUX_DOUBLE (RGB, doble buffer, sin profundidad)
if (!auxInitWindow("PUMP3")) auxQuit(); // 0xEECE8
atexit(0x20DAC);                        // 0x10D742 (atexit de Watcom)
glClearColor(0, 0, 0, 1);
glDisable(GL_CULL_FACE); glDisable(GL_DEPTH_TEST); glDepthFunc(GL_LEQUAL);
glEnable(GL_COLOR_MATERIAL); glShadeModel(GL_FLAT); glEnable(GL_DITHER);
glEnable(GL_BLEND); glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
glTexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_MODULATE);
glEnable(GL_TEXTURE_2D);
glViewport(0, 0, 640, 480);
glMatrixMode(GL_PROJECTION); glLoadIdentity(); glOrtho(0, 640, 0, 480, 0, 1);
glMatrixMode(GL_MODELVIEW);  glLoadIdentity();
```

**`auxInitWindow` (0xEECE8), C:**

1. Arma la lista de atributos según el modo. Con el modo 2 queda `{FXMESA_DOUBLEBUFFER (10), FXMESA_NONE (0)}`: sin profundidad, alfa, stencil ni acumulación.
2. Elige la resolución en una tabla de tres entradas. Toma la primera con ancho y alto mayores o iguales a los pedidos.

   | Datos | 0 | 1 | 2 |
   |---|---|---|---|
   | Anchos (0x1C7628) | 512 | 640 | 800 |
   | Altos (0x1C7634) | 384 | 480 | 600 |
   | Códigos Glide (0x1C7618) | 3 | 7 | 8 |

   Para 640×480 sale el código 7 = `GR_RESOLUTION_640x480`.
3. Llama a `fxMesaCreateContext(win=0, res=7, ref=0 = GR_REFRESH_60Hz, attribs)` (0x5AFF4) y guarda el contexto en `[0x1C7610]`.
   - Si falla, escribe `"Error creating fxMesa context\n"` y devuelve 0.
   - Si anda, llama a `fxMesaMakeCurrent(ctx)` (0x5B5D0) y devuelve 1.
4. El título "PUMP3" y la posición (0, 0) no se usan: la Voodoo es pantalla completa.

**`fxMesaCreateContext` (0x5AFF4), C:**

- Lee `MESA_FX_INFO`, `FX_GLIDE_SWAPINTERVAL` y `MESA_FX_SWAP_PENDING`.
- Si no están definidas, usa `swapInterval = 1` (`[+0x1C80]`) y `maxPendingSwapBuffers = 2` (`[+0x1C84]`).
- `start.bat` solo define `dos4g=quiet` y `fx_glide_no_splash=1`.
- **Resultado: 640×480 a 60 Hz, con el cambio de buffer sincronizado con el retrazo vertical.**

`fxMesaCreateBestContext` (0x5AE4C, lee `SST_SCREENREFRESH`) no se usa.

**Cambio de buffer y salida, C:**

- `auxSwapBuffers` (0xEECBE) salta a `fxMesaSwapBuffers` (0x5B670). Esa función llama a `grBufferSwap(swapInterval)` y espera mientras `grBufferNumPending() > maxPending`.
- `auxQuit` (0xEECCD) hace `fxMesaDestroyContext([0x1C7610])` (0x5B3B0) y después `exit(0)`.
- 0x20DAC es la función registrada con `atexit`: hace `glClear(GL_COLOR_BUFFER_BIT)`, dibuja la grilla 0x20C7C, llama a `auxSwapBuffers` y a 0x10D6EA, y termina con `jmp auxQuit`.

**No se usan, aunque están enlazados (C):**

- OSMesa: `OSMesaCreateContext` está en 0x450A0, dentro de la zona que `MAPA_EXE.md` le asigna al juego. Nadie lo llama.
- `fxMesaCreateBestContext`.
- El resto de GLU, incluido NURBS.

## 4. Un cuadro del juego (C)

- **0x21738**, el cuadro normal:
  1. `glClear(GL_COLOR_BUFFER_BIT)` y `glPushMatrix`.
  2. Dibuja la pantalla que toque (switch en 0x219C6).
  3. `glColor3f(1,1,1)`, 0x359DC, 0x20C7C, 0x362CC.
  4. `glPopMatrix` y `auxSwapBuffers`.
  5. Si corresponde, saca una captura con 0x214D8.
- **0x20C7C:** grilla blanca con `GL_LINES`: los bordes y una línea cada 16 px. Probablemente es el patrón de **SCREEN TEST** del menú de servicio (**D**). La llaman 0x21738, 0x20DAC, 0x21024 (×2), 0x38450 y 0x38C5C.
- **0x2F680**, imagen a pantalla completa por LFB:
  1. Un `GL_POINTS` de un punto en (320, 240) con `glColor4f(1,1,1,1)`. Es solo para vaciar la tubería antes de tocar el framebuffer (**D**).
  2. `grLfbLock(GR_LFB_WRITE_ONLY, GR_BUFFER_BACKBUFFER, GR_LFBWRITEMODE_565, GR_ORIGIN_UPPER_LEFT, FXTRUE, &info)`.
  3. Copia una imagen de 640×480 de 24 bits, con bytes en orden **B, G, R**, convertida a RGB565 truncando: `(B>>3) | (G>>2)<<5 | (R>>3)<<11`. Respeta `strideInBytes`.
  4. `grLfbUnlock`, `auxSwapBuffers` y `glClear`.
  - La llama 0x32530, que decodifica PNG. Probablemente son las carátulas y pantallas de 640×480 (**D**). Una textura de la Voodoo 1 no puede pasar de 256×256, por eso van por este camino.
- **0x214D8**, captura de pantalla:
  1. `glGetIntegerv(GL_VIEWPORT)` y `glFinish`.
  2. `glPixelStorei(GL_PACK_ALIGNMENT=4; ROW_LENGTH, SKIP_ROWS y SKIP_PIXELS = 0)`.
  3. `glReadPixels(0, 0, w, h, GL_RGB, GL_UNSIGNED_BYTE)`.
  4. Lo pasa a 15 bits y lo escribe como `.\cap\p3_%03d.TGA`.
- **El 3D:**
  - **0x40D28:**
    1. Desactiva la profundidad y activa `GL_CULL_FACE` con `GL_BACK`.
    2. Proyección con `gluPerspective`; vista con `gluLookAt`.
    3. Recorre los objetos de 0x6B8A8C con 0x40720, que llama a 0x408F4.
    4. Restaura las matrices, apaga el culling y vuelve a la mezcla alfa.
  - **0x408F4:** `glPushMatrix`, `glMultMatrixf(matriz del objeto)`. Para cada malla: material (0x3F298 → 0x3FE54), `glColor4fv` con el color que arma 0x3F350, `glBegin(GL_TRIANGLES)`, y por vértice `glTexCoord2f` + `glVertex3f` con registros de 20 bytes (x, y, z, s, t).
  - **0x3FE54:** `glMaterialfv` (ambient, diffuse, specular, emission), `glMaterialf` (shininess) y, si el material tiene el bit 4, `glLineWidth`. Elige la mezcla:
    - aditiva si tiene el bit 0x10;
    - alfa si tiene el bit 0x20 o si el alfa difuso es menor a 0.99;
    - opaca en los demás casos.

    El repetir/recortar de S y T sale de otros bits del material.
  - La llaman 0x2A944, 0x2C04C y 0x3AEBC.

## 5. Lo que el port tiene que implementar sobre WebGL

La capa entera es chica: **43 funciones GL, 2 de GLU, 5 de ventana y 2 de framebuffer**. Todo el dibujo es en modo inmediato, así que la capa junta los vértices entre `glBegin` y `glEnd` y los manda en un solo `drawArrays`. Alcanza un único programa de shaders con:

- la matriz proyección × modelo;
- textura sí/no;
- el color por vértice multiplicado por la textura (`GL_MODULATE`).

**Ventana y presentación** (reemplazan AUX, fxMesa y Glide):

- `auxInitPosition`, `auxInitDisplayMode` y `auxInitWindow`: crean un canvas WebGL de 640×480 lógico, escalado, con `{depth:false, stencil:false, alpha:false, antialias:false}`.
- `auxSwapBuffers`: fin del cuadro. Hay que sincronizarlo a 60 Hz (`requestAnimationFrame` con paso fijo de 1/60).
- `auxQuit`: salir.
- `grLfbLock`/`grLfbUnlock`: el juego escribe RGB565 en el buffer de atrás. En el port conviene que la función de 0x2F680 suba la imagen de 640×480 a una textura y la dibuje a pantalla completa, sin mezcla.

**Estado:**

- `glEnable`/`glDisable` con `GL_TEXTURE_2D` (es un uniform), `GL_BLEND`, `GL_CULL_FACE` (solo en el 3D), `GL_DEPTH_TEST` (siempre apagado), `GL_COLOR_MATERIAL` (no hace nada sin luces) y `GL_DITHER`.
- `glBlendFunc` (3 combinaciones), `glShadeModel`, `glCullFace`.
- `glDepthFunc`: no hace nada.
- `glLineWidth`: casi no hace nada, porque WebGL solo garantiza 1.
- `glClearColor`, `glClear`, `glViewport`.

**Matrices** (pila propia en JS; Mesa 3.0 tiene 32 niveles de MODELVIEW y PROJECTION, **D**):

- `glMatrixMode`, `glLoadIdentity`, `glPushMatrix`, `glPopMatrix`.
- `glTranslatef`, `glScalef`, `glRotatef`, `glMultMatrixf`.
- `glOrtho`, `gluPerspective`, `gluLookAt`.

**Texturas:**

- `glGenTextures`, `glDeleteTextures`, `glBindTexture`.
- `glTexImage2D` con `GL_RGBA`/`GL_RGB`/`GL_LUMINANCE` y `GL_UNSIGNED_BYTE`.
- `glTexParameterf`/`glTexParameteri`: `GL_CLAMP` pasa a `CLAMP_TO_EDGE` y `GL_REPEAT` queda igual; filtro `LINEAR`.
- `glTexEnvf`/`glTexEnvi`: solo `GL_MODULATE`.
- `glPixelStorei(GL_UNPACK_ALIGNMENT, 1)`.
- `glAreTexturesResident`: es de depuración; devuelve siempre "sí".

**Dibujo inmediato:**

- `glBegin`/`glEnd` con `GL_QUADS` (se pasa a dos triángulos, v0-v1-v3 y v1-v2-v3, **D**), `GL_TRIANGLES`, `GL_TRIANGLE_STRIP`, `GL_TRIANGLE_FAN`, `GL_LINES` y `GL_POINTS`.
- `glVertex2i`, `glVertex3f`, `glTexCoord2f`.
- `glColor3f`, `glColor4f`, `glColor3fv`, `glColor4fv`: guardan el color actual, que se copia en cada vértice.

**Sin efecto visible:** `glMaterialf`/`glMaterialfv`, porque `GL_LIGHTING` nunca se enciende (**C**: ningún `glEnable` del juego usa 0x0B50).

**Lectura (captura de depuración):** `glFinish` (no hace nada), `glGetIntegerv(GL_VIEWPORT)` (devuelve `[0,0,640,480]`) y `glReadPixels` (opcional: bajar un PNG).

## 6. Detalles de la cabina para que el port sea exacto

1. **`glBegin(0x1B01)` en 0x22793** (función 0x22788: una línea horizontal de x=0 a 640 en la altura `ECX`, seguida de 0x200D0 con −5).
   - 0x1B01 es `GL_LINE`, no `GL_LINES`.
   - Ni el envoltorio (0xDAF18) ni `gl_Begin` (0x64FCC) validan el modo (**C**), y Mesa tiene el texto `"invalid mode in gl_render_vb"` para modos desconocidos.
   - **En la cabina esa línea no se dibuja (D).** El port tampoco tiene que dibujarla.
2. **Profundidad:** no hay buffer de profundidad (**C**). `glDepthFunc(GL_LEQUAL)` no tiene efecto y el orden de dibujo manda, también en el 3D.
3. **Framebuffer de 16 bits:** la Voodoo dibuja en RGB565 con tramado, y `GL_DITHER` está prendido (**D**: es como funciona la Voodoo 1 con Mesa fx). Para igualarlo se puede agregar una pasada final que cuantice a 565 con tramado ordenado 4×4. Es opcional, pero se nota en los degradés y fundidos.
4. **Texturas de 16 bits:** el controlador fx de Mesa 3.0 guarda `GL_RGBA`, `GL_RGBA4` y `GL_RGBA8` como ARGB4444, `GL_RGB5_A1` como ARGB1555, `GL_RGB` como RGB565 y `GL_LUMINANCE` como intensidad de 8 bits (**D**: código de Mesa 3.0 fx, no verificado en el binario). Para que se vea igual, conviene cuantizar al subir: 4 bits por canal para RGBA y alfa de 1 bit para RGB5_A1.
5. **Texturas de 256×256 como máximo y medidas en potencias de 2** (**D**: límite de la Voodoo 1; Mesa rechaza lo que no es 2^k con `"glTexImage2D(width != 2^k + 2*border)"`, texto en 0x1332E0). Las imágenes de 640×480 van por LFB.
6. **Imagen por LFB:** se pasa a 565 truncando (**C**, 0x2F6FD–0x2F723), sin tramado.
7. **60 Hz con sincronismo vertical:** `swapInterval=1` y `GR_REFRESH_60Hz` (**C**). Si el juego mide el tiempo por cuadros, el port tiene que avanzar a 60 cuadros por segundo exactos (**D**, falta verlo en el bucle).
8. **Sombreado plano:** en Mesa, el color de cada primitiva sale del último vértice (en `GL_QUADS`, el cuarto) (**D**). El juego casi siempre fija el color antes de `glBegin`, así que alcanza con el color por vértice.
9. **Coordenadas Y hacia arriba:** `glOrtho(0,640,0,480)`, con (0,0) abajo a la izquierda (**C**). La imagen LFB y la captura van con el origen arriba (`GR_ORIGIN_UPPER_LEFT`).

## 7. Notas para los otros asistentes

- **Faltan funciones en `volcados\desarmado_juego.txt`.** Estas 46 funciones llaman a OpenGL y no están en el desarmado. Son unas 400 de las 1.138 llamadas.
  - Inicios calculados: `0x20000, 0x20DAC, 0x20EE8, 0x21024, 0x22788, 0x22FC8, 0x230A0, 0x231DC, 0x232B4, 0x23858, 0x2397C, 0x23AB8, 0x26FA8, 0x26FD0, 0x27000, 0x27028, 0x279D8, 0x27A5C, 0x27AEC, 0x2A944, 0x2B97C, 0x2BB10, 0x2BCA4, 0x2BEE0, 0x2D0AA, 0x2D23F, 0x2D3D5, 0x2D611, 0x330C4, 0x3371C, 0x33E90, 0x34770, 0x358F0, 0x377D0, 0x3799C, 0x37C6C, 0x37CB0, 0x38450, 0x3B1F4, 0x3E438, 0x3E4A8, 0x3E758, 0x3F3F0, 0x3F600, 0x3F620, 0x3F66C`.
  - Hay otras funciones del juego que no están y no llaman a OpenGL.
  - Los inicios se tomaron así: `ret` + relleno, que no sea destino de salto, o `call`, o puntero en los datos, o lista `afl`.
  - Caso raro: el cuerpo de **0x3779C** está **antes** de su entrada, en 0x37183–0x37487.
- **Desarmado lineal completo** de 0x20000–0x49000 (temporal): `%TEMP%\piu_gl\juego_lineal.txt`. Lo arma `full.js` en la misma carpeta.
  - Cuidado: `pD` de radare2 lee mal la instrucción que cruza cada borde de página de 4 KB (las marca con `~`). Se ve, por ejemplo, en 0x25009 y 0x27FFD.
  - Después de un relleno de ceros puede tardar unos bytes en volver a leer bien, como en 0x3F3DF → 0x3F3F0 o 0x4509F → 0x450A0.
- **Los límites de `MAPA_EXE.md` hay que ajustarlos un poco:**
  - la capa AUX termina en 0xEEE46, y libpng empieza en ~0xEEE50 con `"Call to NULL write function"`. El comienzo de AUX está un poco antes de 0xEEC37 (**D**). El mapa pone todo esto en la zona libpng/zlib;
  - GLU termina en ~0xECAB0, después de `gluErrorString` (0xEC9F4);
  - OSMesa empieza en 0x450A0 (el mapa lo pone en la zona del juego). No hay que traducir OSMesa.
- **Mesa, por dentro** (para herramientas):
  - `CC` en `[0x1A2E8C]`;
  - `fxMesa` actual en `[0x1A2D88]`;
  - `gl_error(ctx, código, texto)` = 0xCF8DC;
  - `gl_make_current` = 0xCF4BC.
- La llamada indirecta del juego en 0x35F87, `call [ebx+0x13BD78]`, recorre una tabla de pares (función, nombre) de comandos de depuración. No es de video.

## Archivos

- `investigacion\gl_nombres.json`:
  - Formato: `{ "0xD83B0": { nombre, args[], retorno, pila_bytes, biblioteca, llamadas, llamadores[], uso, estado } }`.
  - Las claves van en hexadecimal en mayúsculas, sin ceros a la izquierda. `args` dice en qué registro o en qué posición de la pila va cada argumento.
- Herramientas temporales en `%TEMP%\piu_gl\`:
  - `full.js`: barrido y análisis de registros;
  - `attr.js`: atribución a funciones;
  - `gen.js`: genera la tabla y el JSON;
  - `calls_full.json`: cada sitio con los valores de EAX, EDX, EBX, ECX y de la pila.
