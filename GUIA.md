# Guía paso a paso

Todo, paso por paso, para alguien que nunca usó GitHub ni una terminal. Andá en orden y no te saltees nada.

**Índice**
1. Qué necesitás
2. Bajar el repositorio
3. Poner el disco
4. Preparar (una sola vez)
5. Jugar en la compu
6. Controles
7. Armar las versiones para compartir (Windows)
8. Instalar cada versión en cada aparato
9. Online y ranking
10. Cuando sale una versión nueva
11. Si algo falla
12. Lo que NUNCA hay que hacer
13. Para el dueño del repositorio

---

## 1. Qué necesitás

- **La imagen del disco de Pump It Up Extra (2001).** Puede venir de dos maneras:
  - dos archivos, uno `.cue` y otro `.bin` (por ejemplo `010209_1821.CUE` y `010209_1821.BIN`, de unos 730 MB);
  - un solo archivo `.iso`.

  **Sin el disco no hay juego.** El repositorio no lo trae ni lo va a traer.
- **Una computadora** con Windows 10 u 11, Linux o Mac.
- **Espacio libre:**
  - para jugar en la compu: **2 GB**;
  - para armar todas las versiones: **8 GB**.
- **Internet**, la primera vez (para bajar las herramientas) y para jugar online.

---

## 2. Bajar el repositorio

No hace falta tener cuenta de GitHub.

1. Entrá a **https://github.com/vjravenlight/piu-extra-port**.
2. Tocá el botón verde **`<> Code`** y después **Download ZIP**.
3. Buscá el ZIP en Descargas, clic derecho → **Extraer todo**.
4. Mové la carpeta que sale (`piu-extra-port-main`) a donde la quieras tener, por ejemplo `Documentos\piu-extra-port`.
   - **No la dejes adentro del ZIP**: desde ahí no anda.
   - Mejor una ruta corta y sin tildes.

> ¿Sabés usar git? Entonces `git clone https://github.com/vjravenlight/piu-extra-port.git` y listo.

---

## 3. Poner el disco

Copiá la imagen del disco **adentro de la carpeta del repositorio**, al lado de `PREPARAR.cmd`.

Te tiene que quedar así:

```
piu-extra-port\
   010209_1821.CUE      <- tu disco
   010209_1821.BIN      <- tu disco
   PREPARAR.cmd
   JUGAR.cmd
   README.md
   app\
   tools\
   ...
```

- **No les cambies el nombre al `.cue` y al `.bin`.** El `.cue` busca al `.bin` por su nombre: si lo cambiás, no lo encuentra.
- Si tenés un `.iso`, poné ese solo.

---

## 4. Preparar (una sola vez)

Esto saca los archivos del disco y arma el juego en tu compu. **Tarda menos de un minuto** y se hace una sola vez.

### Windows

1. Doble clic en **`PREPARAR.cmd`**.
2. Si aparece **"Windows protegió su PC"**: tocá **Más información** y después **Ejecutar de todas formas**. Pasa porque el archivo vino de internet.
3. Si tu compu no tiene Node.js, el programa lo baja solo. Es la versión oficial portátil: no instala nada.
4. Vas a ver esto, de a uno:
   ```
   1/4 disco                         (saca los 736 archivos)
   2/4 Piu.exe -> codigo y datos     ... (igual al del port)
   3/4 traduccion a JavaScript
   4/4 listas de canciones
   Listo.
   ```
5. Apretá una tecla para cerrar la ventana.

**Otra forma:** arrastrá el `.cue` (o el `.iso`) y soltalo encima de `PREPARAR.cmd`. Sirve si el disco está en otra carpeta.

### Linux y Mac

1. Instalá **Node.js** (versión 18 o más nueva) desde https://nodejs.org. Es el botón grande, "LTS".
2. Abrí la **Terminal**:
   - Mac: Cmd + Espacio, escribí "Terminal" y Enter.
   - Linux: Ctrl + Alt + T.
3. Escribí `cd ` (con un espacio al final). Arrastrá la carpeta del repositorio adentro de la Terminal y apretá Enter.
4. Escribí esto y apretá Enter:
   ```
   sh preparar.sh
   ```
   Si el disco está en otro lado: `sh preparar.sh /ruta/al/disco.cue`

### ¿Dice "OJO: este Piu.exe no es el que se uso para el port"?

Tu disco es de otra versión. Puede andar o no. El port está hecho para el Pump It Up Extra de **enero/febrero de 2001**, el que trae `PUMP IT UP (R4…)`.

---

## 5. Jugar en la compu

- **Windows:** doble clic en **`JUGAR.cmd`**.
- **Linux / Mac:** en la Terminal, dentro de la carpeta, `sh jugar.sh`.

Se abre solo el navegador en **http://localhost:8790/port/**.

- **Hacé clic o apretá una tecla** para que arranque: el navegador no deja sonar nada sin un toque.
- **No cierres la ventana negra** (o la Terminal) mientras jugás: es el "servidor" del juego. Cuando terminás, la cerrás.
- Usá **Chrome, Edge o Firefox** actualizados.
- Si no se abre solo, copiá esa dirección en el navegador.

---

## 6. Controles

| | ↙ | ↖ | centro | ↗ | ↘ |
|---|---|---|---|---|---|
| **Jugador 1** | Z | Q | S | E | C |
| **Jugador 2** (teclado numérico) | 1 | 7 | 5 | 9 | 3 |

| Tecla | Qué hace |
|---|---|
| **Enter** o el centro | elegir |
| **Esc** | volver; en el menú principal, salir |
| **1 a 9** (los de arriba de las letras) | velocidad de las flechas (0 = la del juego) |
| **F7** | lista con todos los pasos que trae el disco |
| **F1 / F2** | TEST / SERVICE (el menú de servicio de la cabina) |
| **F11** o doble clic | pantalla completa |

En **OPCIONES** se cambian:
- tu nombre y su clave;
- las teclas;
- alfombras y joysticks USB (MANDO USB);
- el desfase del sonido (CALIBRAR);
- el volumen y el fondo;
- y más.

---

## 7. Armar las versiones para compartir (solo desde Windows)

Esto arma el juego **completo, con todas las canciones** para Windows, Android, Linux y Mac. Así se lo pasás a otros sin que necesiten el disco ni nada de esta guía.

1. Antes, tenés que haber hecho el paso 4 (Preparar).
2. Doble clic en **`ARMAR_VERSIONES.cmd`**.
3. Cuando pregunte por las licencias de Android, escribí **`s`** y Enter. Es la licencia del kit de Google para hacer apps; sin aceptarla no se puede armar la APK.
4. Esperá. **La primera vez tarda entre 30 y 60 minutos:**
   - baja cerca de 1 GB de herramientas (Java, Gradle, Electron, el motor de Edge);
   - la APK sola tarda unos 18 minutos.

   Las veces siguientes es mucho más rápido.
5. Cuando diga **"Listo"**, abrí la carpeta:

```
build\Pump It Up Extra - para compartir\
   Pump It Up Extra - Windows.zip          (~340 MB)
   Pump It Up Extra - Android.apk          (~600 MB)
   Pump It Up Extra - Linux.tar.gz         (~470 MB)
   Pump It Up Extra - Mac Apple.tar.gz     (~470 MB)
   Pump It Up Extra - Mac Intel.tar.gz     (~470 MB)
   LEEME.txt
```

Eso es lo que compartís (Drive, pendrive, lo que sea).

> **IMPORTANTE — la firma de la APK.** La primera vez se crea la carpeta `tools\build_android\firma\`.
> - **Hacele una copia y guardala.** Si la perdés, la próxima APK no se va a poder instalar encima de la vieja: cada uno va a tener que desinstalar primero (y pierde sus opciones).
> - **Nunca la compartas ni la subas** a ningún lado.

Lo que bajó queda en `.herramientas\`, adentro de la carpeta. No se instala nada en Windows.

---

## 8. Instalar cada versión en cada aparato

### Android (teléfono o tablet)

- **Requisitos:** Android 10 o más nuevo, de 64 bits (casi todos los de 2019 en adelante) y **1,5 GB libres**.

1. Pasá `Pump It Up Extra - Android.apk` al teléfono: por cable USB, Drive, Telegram…
2. Tocá el archivo.
3. Si dice que **no permite instalar apps desconocidas**: tocá **Configuración**, activá **Permitir de esta fuente** y volvé.
4. Si aparece **Play Protect** ("app desconocida"): **Más detalles** → **Instalar de todas formas**.
5. Abrila: arranca sola a pantalla completa.
   - Los paneles aparecen en la pantalla.
   - **Atrás** del teléfono = volver.
   - En el menú principal está **SALIR**.

> **Desde la compu, con cable (para quien sabe):** `adb install -r "Pump It Up Extra - Android.apk"`. Tarda unos 30 segundos.

### Windows

1. Clic derecho en `Pump It Up Extra - Windows.zip` → **Extraer todo**.
2. Entrá a la carpeta y doble clic en **`Pump It Up Extra.exe`**.
3. Si aparece **"Windows protegió su PC"**: **Más información** → **Ejecutar de todas formas**.
4. Si la PC no tiene el "motor WebView2" de Microsoft, el juego pregunta y lo instala solo. Hace falta internet esa vez.

Las opciones quedan en la carpeta `guardado\`, al lado del `.exe`.

### Mac

- **¿Apple o Intel?** Menú  → **Acerca de esta Mac**. Si dice "Chip Apple" (M1, M2, M3, M4…), bajá la **Apple**. Si dice "Procesador Intel", bajá la **Intel**.

1. Doble clic en el `.tar.gz`: aparece **Pump It Up Extra.app**. Arrastrala a **Aplicaciones**.
2. **Solo la primera vez**, porque la app no está firmada por Apple:
   1. Abrí la **Terminal**.
   2. Pegá estas dos líneas, con Enter después de cada una:
      ```
      xattr -cr "/Applications/Pump It Up Extra.app"
      codesign --force --deep --sign - "/Applications/Pump It Up Extra.app"
      ```
3. Abrila. Si igual pregunta: clic derecho sobre la app → **Abrir** → **Abrir**.

### Linux

1. En la Terminal: `tar -xzf "Pump It Up Extra - Linux.tar.gz"`
2. Entrá a la carpeta **Pump It Up Extra** y abrí **`JUGAR.sh`**: doble clic, o `./JUGAR.sh` en la Terminal.
3. Si no abre: `chmod +x pump-it-up-extra JUGAR.sh` y otra vez `./JUGAR.sh`.

---

## 9. Online y ranking

Las versiones armadas (Windows, Android, Linux, Mac) usan el salón y el ranking de **ravenlight.net**. Ahí juegan todos contra todos.

- **Hace falta internet.** Sin internet, el juego anda igual, pero sin online ni ranking.
- El **nombre** se pide una sola vez; después se cambia en OPCIONES > TU NOMBRE.
- **OPCIONES > CLAVE DEL NOMBRE:** le ponés una clave de 4 a 8 números y nadie más puede jugar con tu nombre.
- En el salón:
  - elegís a alguien y le mandás un **desafío**: eligen canción y modificadores;
  - cuando los dos cargaron, arranca la cuenta y la canción **a la misma hora para los dos**;
  - al terminar, el resultado y de vuelta al salón.

Cuando jugás en la compu con `JUGAR.cmd`, el online es **local**. Solo anda si la compu tiene PHP instalado. Para jugar con otros, usá las versiones armadas.

---

## 10. Cuando sale una versión nueva

1. Bajá el ZIP nuevo (paso 2) a una carpeta **nueva**.
2. Copiá tu disco adentro (paso 3) y corré **PREPARAR** (paso 4).
3. Si armás versiones:
   - copiá a la carpeta nueva tu `tools\build_android\firma\` (la de la APK);
   - copiá también `.herramientas\`, así no baja todo otra vez;
   - después, `ARMAR_VERSIONES.cmd`.
4. La carpeta vieja la podés guardar o tirar. Ojo: tu **firma** tiene que estar a salvo en otro lado.

En el teléfono, la APK nueva se instala **encima** de la vieja (si la firmaste con la misma firma): no se pierde nada.

---

## 11. Si algo falla

| Pasa esto | Hacé esto |
|---|---|
| PREPARAR dice **"no encuentro la imagen del disco"** | El `.cue` y el `.bin` (o el `.iso`) tienen que estar en la carpeta del repositorio, no en una subcarpeta. O arrastralo encima de `PREPARAR.cmd`. |
| PREPARAR dice **"el .cue no dice que .bin usa"** o **"no existe …BIN"** | Le cambiaste el nombre al `.bin`. Volvé a ponerle el que dice adentro del `.cue` (abrilo con el Bloc de notas). |
| **"en esta imagen no esta Piu\Piu.exe"** | Ese no es el disco de Pump It Up Extra (o la imagen está rota). |
| **"No pude conseguir Node.js"** | Sin internet, o algo lo bloqueó. Instalalo a mano desde https://nodejs.org y volvé a probar. |
| La página queda **en negro** | Navegador viejo. Actualizá Chrome, Edge o Firefox. Y abrila siempre con `JUGAR.cmd`, nunca con doble clic en un `.html`. |
| **No suena** | Hacé clic en la página: el navegador pide un toque antes del sonido. Mirá también OPCIONES > VOLUMEN. |
| El sonido va **atrasado** respecto de las flechas | OPCIONES > CALIBRAR: tocás al ritmo 20 veces y lo corrige solo. Después se ajusta de a 5 ms. |
| **Se traba o va lento** | Cerrá otros programas. La primera carga de cada pantalla tarda más. Con F9 ves los cuadros por segundo. |
| ARMAR_VERSIONES dice **"Falta …traducido.js"** o **"Falta Piu.exe"** | No corriste PREPARAR (paso 4). |
| La APK **no se instala encima** de la vieja ("conflicto con un paquete existente") | Está firmada con otra firma. Desinstalá la vieja primero; se pierden sus opciones. Para que no vuelva a pasar, guardá la firma (paso 7). |
| La APK dice **"la app no es compatible"** o no se instala | El teléfono es de 32 bits o tiene Android 9 o menos. Con ese teléfono no se puede. |
| La APK **abre en negro** o se cierra | Falta espacio (dejá 1,5 GB libres) o le falta memoria al teléfono. Cerrá las otras apps y abrila de nuevo. |
| En la Mac dice **"está dañada"** | Hacé el paso 2 de Mac (las dos líneas de la Terminal). |
| El antivirus se queja | Los programas no están firmados (cuesta plata firmarlos). Es el mismo código que está en el repositorio. |
| Nada de esto | Abrí un "Issue" en el repositorio contando qué hiciste, qué esperabas y qué pasó, con una foto del error. |

---

## 12. Lo que NUNCA hay que hacer

- **Nunca subas el disco ni nada sacado de él** a GitHub ni a ningún lado: los archivos del disco, la música, los videos, `Piu.exe`, `traducido.js` ni los volcados. Son de Andamiro. El `.gitignore` ya los deja afuera; no lo toques.
- **Nunca compartas la firma** (`tools\build_android\firma\`).
- **No le cambies el nombre** a los archivos del disco.
- **No borres `extraido\`** si querés seguir jugando en la compu: es el juego. Si lo borrás, corré PREPARAR otra vez.

---

## 13. Para el dueño del repositorio

- **Dejar que alguien más suba cambios:** en GitHub, **Settings → Collaborators → Add people**, y poné su usuario. Le llega un mail para aceptar.
- **Subir cambios del port** (desde la carpeta original del proyecto):
  ```
  powershell -ExecutionPolicy Bypass -File tools\exportar_github.ps1 -Subir
  ```
  - Arma la copia sin nada de Andamiro.
  - Revisa que no se cuele nada (archivos del disco, claves, imágenes).
  - Hace el commit y lo sube.
- **Volverlo privado:** Settings → General → Danger Zone → **Change visibility**.
