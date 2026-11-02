# Guía paso a paso

Todo lo que hay que hacer, en orden, pensado para alguien que nunca usó GitHub ni una terminal. **No hay que instalar nada:** lo que haga falta (Node.js, el motor de Edge, Java…) lo baja cada herramienta sola, de su sitio oficial, adentro de la carpeta del juego.

**Índice**
1. Qué necesitás
2. Bajar el juego
3. Jugar en la compu
4. El disco: qué elegir
5. Jugar con amigos: el modo servidor
6. Controles
7. Online: una canción, versus completo y torneo
8. Armar las apps (Windows, Android, Linux, Mac)
9. Instalar cada app en cada aparato
10. Preparar el disco de antemano (opcional)
11. Cuando sale una versión nueva
12. Si algo falla
13. Lo que nunca hay que hacer
14. Para el dueño del repositorio
15. Sobre Andamiro

---

## 1. Qué necesitás

- **La imagen del disco de Pump It Up Extra (2001).** Sirve de cualquiera de estas formas:
  - el **`.bin`**, que es el archivo grande, de unos 730 MB. Viene con un `.cue`, que es chiquito.
  - un **`.iso`**;
  - la **carpeta** con los archivos del disco ya sacados (la que tiene `Piu.exe`).

  **Sin el disco no hay juego.** El repositorio no lo trae ni lo va a traer.
- **Una compu con Windows 10 u 11, Linux o Mac**, o un teléfono Android con la app.
- **Espacio libre:** 1,5 GB para jugar; 8 GB si además vas a armar las apps.
- **Internet**, la primera vez (para bajar las herramientas) y para el online.

---

## 2. Bajar el juego

1. Entrá a **https://github.com/vjravenlight/piu-extra-port**. No hace falta tener cuenta.
2. Tocá el botón verde **`<> Code`** y después **Download ZIP**.
3. En Descargas: clic derecho sobre el ZIP → **Extraer todo**.
4. Mové la carpeta que sale (`piu-extra-port-main`) a donde quieras, por ejemplo a `Documentos`.
   - **No la dejes adentro del ZIP**: desde ahí no anda.
   - Mejor una ruta corta y sin tildes.

> ¿Sabés usar git? `git clone https://github.com/vjravenlight/piu-extra-port.git`.

---

## 3. Jugar en la compu

| Sistema | Qué hacer |
|---|---|
| **Windows** | Doble clic en **`JUGAR.cmd`**. |
| **Mac** | Doble clic en **`JUGAR.command`**. La primera vez puede decir que no se puede abrir: clic derecho → **Abrir** → **Abrir**. |
| **Linux** | Abrí la Terminal en la carpeta y escribí `sh jugar.sh`. |

Qué vas a ver:
1. Si la compu no tiene Node.js, lo baja solo la primera vez. Es la versión oficial portátil y no instala nada.
2. Se abre el navegador en **http://localhost:8790/port/**. Usá **Chrome, Edge o Firefox** actualizados.
3. **La primera vez te pide el disco** (ver el punto 4). Después, cada vez que abras, arranca directo.
4. **Hacé clic o apretá una tecla** para que suene: el navegador no deja sonar nada sin un toque.
5. **No cierres la ventana negra** (o la Terminal) mientras jugás: es el "servidor" del juego. Cuando terminás, la cerrás.

> **"Windows protegió su PC"**: tocá **Más información** → **Ejecutar de todas formas**. Pasa porque el archivo vino de internet.

---

## 4. El disco: qué elegir

La primera vez, el juego muestra **PUMP IT UP EXTRA — PORT DE RAVENLIGHT** con dos botones:

- **ELEGIR EL .BIN O EL .ISO**: elegí el **`.bin`** (el archivo grande). Si elegís el `.cue`, te avisa que elijas el `.bin` de al lado.
- **ELEGIR LA CARPETA**: la carpeta con los archivos del disco ya sacados. Sirve la carpeta `Piu` o la de arriba.
- También podés **arrastrar** el archivo o la carpeta y soltarlo en la pantalla.

Después:
1. Lo prepara en **cuatro pasos**, con una barra: saca los archivos, carga `Piu.exe`, traduce el juego y arma las listas.
   - En una compu normal tarda **uno o dos minutos**; en un teléfono, un poco más.
2. Queda **guardado en ese navegador** (o en esa app) y no hay que volver a hacerlo.
3. **El disco no se sube a ningún lado:** todo pasa en tu aparato.
4. Si dice **"ese Piu.exe es de otra versión del disco"**, puede andar o no. El port está hecho para el Pump It Up Extra de **enero/febrero de 2001**.

> **Para cambiar de disco o empezar de cero:** en el navegador, borrá los datos del sitio (el candado al lado de la dirección → **Configuración del sitio** → **Borrar datos**) y abrí el juego otra vez.

---

## 5. Jugar con amigos: el modo servidor

Tu compu hace de servidor y los demás entran desde sus celulares o compus, sin instalar nada.

### Abrirlo

| Sistema | Qué hacer |
|---|---|
| **Windows** | Doble clic en **`SERVIDOR.cmd`**. |
| **Mac** | Doble clic en **`SERVIDOR.command`**. |
| **Linux** | `sh servidor.sh` |

Hace **tres preguntas**. Con Enter elegís lo que está entre corchetes:

1. **Puerto** [8790]: dejalo así, salvo que ese número ya lo use otro programa.
2. **Salón online y ranking:**
   - **1 = el de ravenlight.net:** juegan con todos los que estén ahí.
   - **2 = uno propio de este servidor:** solo los que entren a tu servidor. En Windows baja PHP solo; en Linux y Mac hace falta tener PHP instalado (si no hay, usa el de ravenlight.net).
3. **¿Abrirlo también a internet?** (s/n):
   - **n:** solo la misma wifi.
   - **s:** además te da una dirección **https://…trycloudflare.com** para pasarle a quien quieras, por un túnel gratis de Cloudflare. No hay que tocar el router. La dirección cambia cada vez que abrís el servidor.

Después muestra un cuadro como este:

```
PUMP IT UP EXTRA - servidor andando
En esta compu:    https://localhost:8790/port/
En la misma wifi: https://192.168.0.10:8790/port/
```

### Entrar desde otro aparato

1. Escribí la dirección de **"En la misma wifi"** en el navegador del celular o de la otra compu. Usá **Chrome o Firefox**.
2. **La primera vez avisa "La conexión no es privada".** Es normal: el certificado lo hizo tu servidor, no una empresa. Tocá **Configuración avanzada** → **Continuar a 192.168…**.
3. Si en tu compu corriste PREPARAR (punto 10), los demás **no necesitan el disco**: lo reciben de tu servidor. Si no, a cada uno le pide el suyo la primera vez.
4. **Por internet** (túnel), cada jugador **siempre pone su propio disco**: tu servidor no lo reparte fuera de tu casa.

> **Firewall de Windows:** la primera vez pregunta si dejás que Node.js use la red. Tocá **Permitir acceso**.
>
> Para apagar el servidor, cerrá la ventana.

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

- En **OPCIONES** se cambian tu nombre y su clave (se escribe dos veces; anotala, porque no se puede recuperar), se cierra la sesión, se elige con qué jugás (JUEGO CON), las teclas, alfombras y joysticks USB (MANDO USB), el desfase del sonido (CALIBRAR), el volumen, el fondo y más.
- En el celular aparecen los paneles en pantalla.
- En el celular en vertical, mientras jugás, poné dos dedos sobre la imagen del juego para acercarla o alejarla (de 100 a 150 %). Queda guardado.
- La APK muestra el juego con el motor de Chrome que trae el propio teléfono (la WebView), adentro de la app: pantalla completa desde que abre, sin barra, sin permisos y sin internet (salvo el online y el ranking). Anda a 60 cuadros parejos. Si el teléfono no tiene WebView, usa el motor de Firefox que viene en la APK.
- Los paneles vibran al pisar (OPCIONES > VIBRAR AL PISAR).

---

## 7. Online: una canción, versus completo y torneo

Entrá a **ONLINE** desde el menú principal. El nombre se pide una sola vez y después se cambia en OPCIONES.

### Con qué juega cada uno

Al lado de cada nombre dice con qué juega: **TECLADO**, **PLATAF.** (plataforma, alfombra o mando USB) o **TACTIL** (celular o tablet). Arriba a la derecha dice con qué jugás vos.

- Lo detecta el juego solo. Si usaste o tenés enchufado un mando USB, es plataforma. Si no, con pantalla táctil es celular. Si no, teclado.
- Si no acierta, cambialo en **OPCIONES > JUEGO CON**.
- Es lo que dice cada aparato. Sirve para elegir contra quién jugar, pero no es una prueba.

### Desafiar a alguien

En la lista de **JUGADORES**, elegí a alguien que diga **LIBRE** y apretá Enter. Después elegí el tipo:

- **UNA CANCIÓN:** elegís la canción en la selección de verdad del juego y los dos la juegan a la vez. Gana el que hace más puntos.
- **VERSUS COMPLETO:** son **4 canciones**.
  1. La primera la elegís vos y la segunda el otro, y así hasta que cada uno eligió 2.
  2. Entre canción y canción aparece la pantalla de la serie: las canciones, los puntos de cada uno y a quién le toca elegir.
  3. Gana el que **suma más** con las 4.
  4. **Esc dos veces** = abandonar (gana el otro).

El otro ve el desafío, elige sus modificadores y acepta.

### Torneo

La primera fila de la lista es **TORNEO**.

1. **Armar:** elegís cómo se ordenan las llaves y qué se juega en cada cruce, y tocás **ARMARLO**.
   - Las llaves pueden ir **por ranking** (los mejores se cruzan al final), **al azar** o **por llegada**.
   - Cada cruce puede ser **una canción** o **versus completo**.
   - **CONTROLES:** con **cualquiera**, o **solo teclado**, **solo plataforma** o **solo celu/tablet**. Se ve arriba del torneo.
2. **Anotarse:** los demás entran a TORNEO y tocan **ANOTARME**. Entran hasta 16 jugadores.
   - Si el torneo es de un solo control, sólo se anota quien juega con ese control (OPCIONES > JUEGO CON).
3. **Empezar:** el que lo armó toca **EMPEZAR EL TORNEO** cuando ya hay al menos 2 anotados.
   - Si no son 4, 8 o 16, los primeros pasan sin jugar.
4. **Jugar:** cuando te toca, el juego te lleva solo a tu cruce. Elige primero el mejor ubicado.
   - Ganás y pasás; perdés y quedás afuera.
   - Las llaves se ven en TORNEO.
5. Al final aparece el **CAMPEÓN** y lo anuncia el chat.

> Si alguien se va del salón o abandona, gana su rival. Mientras dura el torneo, los anotados no pueden hacer desafíos sueltos.

---

## 8. Armar las apps (solo desde Windows)

Arma el juego como **apps** para Windows, Android, Linux y Mac, para pasárselas a otros.

1. Doble clic en **`ARMAR_VERSIONES.cmd`**.
2. Cuando pregunte por las licencias de Android, escribí **`s`** y Enter. Es la licencia del kit de Google para hacer apps; sin aceptarla no se arma la APK.
3. Esperá. **La primera vez tarda entre 30 y 60 minutos:** baja cerca de 1 GB de herramientas (Java, Gradle, Electron, el motor de Edge), y solo la APK tarda unos 18 minutos. Las veces siguientes es mucho más rápido.

Arma dos tipos:

| Carpeta en `build\` | Qué es |
|---|---|
| **`Pump It Up Extra - para compartir (sin disco)`** | Siempre. **No traen nada de Andamiro**: la primera vez cada uno elige su disco, como en el punto 4. Pesan menos (el APK, unos 200 MB; Windows, 2 MB). |
| **`Pump It Up Extra - para compartir`** | Solo si antes corriste PREPARAR (punto 10). Llevan **el juego entero adentro** (el APK, unos 600 MB), así que no piden nada. **Solo para pasárselas a amigos en privado.** |

En cada carpeta van:
- `Pump It Up Extra - Windows….zip`
- `Pump It Up Extra - Android….apk`
- `Pump It Up Extra - Linux….tar.gz`
- `Pump It Up Extra - Mac Apple….tar.gz` y `Mac Intel….tar.gz`
- un `LEEME.txt`

> **IMPORTANTE — la firma de la APK.** La primera vez se crea `tools\build_android\firma\`.
> - **Hacele una copia y guardala.** Sin ella, la próxima APK no se instala encima de la vieja: hay que desinstalar primero y se pierden las opciones.
> - **Nunca la compartas ni la subas.**

---

## 9. Instalar cada app en cada aparato

### Android (teléfono o tablet)

- **Requisitos:** Android 10 o más nuevo, de 64 bits (casi todos desde 2019) y **1,5 GB libres**.

1. Pasá el `.apk` al teléfono (cable USB, Drive, Telegram…). Con la versión sin disco, pasá también el **`.bin`**.
2. Tocá el `.apk`.
3. Si dice que **no permite instalar apps desconocidas**: **Configuración** → activá **Permitir de esta fuente** → volvé.
4. Si aparece **Play Protect** ("app desconocida"): **Más detalles** → **Instalar de todas formas**.
5. Abrila: arranca a pantalla completa. Si es la sin disco, la primera vez tocá **ELEGIR EL .BIN O EL .ISO** y buscá el `.bin` en el teléfono.
   - Los paneles aparecen en la pantalla.
   - **Atrás** = volver.
   - En el menú principal está **SALIR**.

### Windows

1. Clic derecho en el `.zip` → **Extraer todo**.
2. Abrí **`Pump It Up Extra.exe`**.
3. Si aparece **"Windows protegió su PC"**: **Más información** → **Ejecutar de todas formas**.
4. Si la PC no tiene el "motor WebView2" de Microsoft, el juego pregunta y lo instala solo (hace falta internet esa vez).

### Mac

- **¿Apple o Intel?** Menú  → **Acerca de esta Mac**: "Chip Apple" (M1, M2…) = **Apple**; "Procesador Intel" = **Intel**.

1. Doble clic en el `.tar.gz`: aparece **Pump It Up Extra.app**. Arrastrala a **Aplicaciones**.
2. **Solo la primera vez** (la app no está firmada por Apple): abrí la **Terminal** y pegá estas dos líneas, con Enter después de cada una:
   ```
   xattr -cr "/Applications/Pump It Up Extra.app"
   codesign --force --deep --sign - "/Applications/Pump It Up Extra.app"
   ```
3. Abrila. Si igual pregunta: clic derecho → **Abrir** → **Abrir**.

### Linux

1. En la Terminal: `tar -xzf "Pump It Up Extra - Linux….tar.gz"`
2. Entrá a la carpeta **Pump It Up Extra** y abrí **`JUGAR.sh`** (doble clic, o `./JUGAR.sh`).
3. Si no abre: `chmod +x pump-it-up-extra JUGAR.sh` y otra vez `./JUGAR.sh`.

> Las apps usan el salón y el ranking de **ravenlight.net**. Sin internet se juega igual, sin online.

---

## 10. Preparar el disco de antemano (opcional)

**No hace falta para jugar** (el juego pide el disco solo). Sirve para:
- que el **modo servidor** le pase el disco a los de tu wifi, así no necesitan el suyo;
- armar las **apps completas** (punto 8).

Cómo:
1. Copiá el `.cue` y el `.bin` (o el `.iso`) **adentro de la carpeta del juego**, al lado de `PREPARAR.cmd`, **sin cambiarles el nombre**. El `.cue` busca al `.bin` por su nombre.
2. Doble clic en **`PREPARAR.cmd`** (Mac: `PREPARAR.command`; Linux: `sh preparar.sh`). También podés arrastrar el `.cue` encima de `PREPARAR.cmd`.
3. Vas a ver `1/4 disco`, `2/4 Piu.exe`, `3/4 traduccion`, `4/4 listas` y **Listo**. Tarda menos de un minuto.

---

## 11. Cuando sale una versión nueva

1. Bajá el ZIP nuevo (punto 2) a una carpeta **nueva**.
2. Si armás apps:
   - copiá a la carpeta nueva tu `tools\build_android\firma\`;
   - copiá también `.herramientas\`, así no baja todo otra vez.
3. Si usabas PREPARAR, copiá el disco y correlo de nuevo.
4. En el navegador, el disco que ya preparaste sigue guardado.
5. En el teléfono, la APK nueva se instala **encima** de la vieja (con la misma firma) y no se pierde nada.

---

## 12. Si algo falla

| Pasa esto | Hacé esto |
|---|---|
| "Eso no es el disco" o "Elegiste el .cue" | Elegí el **`.bin`** (el archivo grande) o el `.iso`. |
| "En esa imagen no está Piu\Piu.exe" | Ese no es el disco de Pump It Up Extra, o la imagen está rota. |
| Se queda preparando o dice que hay poco espacio | Liberá espacio (hacen falta unos 700 MB en el aparato) y probá de nuevo. |
| "No pude conseguir Node.js" | Sin internet o algo lo bloqueó. Instalalo a mano desde https://nodejs.org y probá de nuevo. |
| La página queda **en negro** | Navegador viejo: actualizá Chrome, Edge o Firefox. Abrila siempre con `JUGAR`, nunca con doble clic en un `.html`. |
| **No suena** | Hacé clic en la página. Mirá también OPCIONES > VOLUMEN. |
| El sonido va **atrasado** | OPCIONES > CALIBRAR: tocás al ritmo 20 veces y lo corrige solo. |
| **Se traba o va lento** | Cerrá otros programas. La primera carga de cada pantalla tarda más. Con F9 ves los cuadros por segundo. |
| Modo servidor: **el celular no entra** | Tienen que estar en la misma wifi. Usá la dirección **https://** que muestra el cuadro. Tocá "Continuar" en el aviso de conexión no privada. Mirá que el Firewall de Windows lo haya dejado pasar. |
| Modo servidor: "**el túnel no arrancó**" | Probá de nuevo; la wifi sigue andando igual. |
| La APK **no se instala encima** | Está firmada con otra firma. Desinstalá la vieja primero; se pierden sus opciones. |
| La APK dice "**no es compatible**" | El teléfono es de 32 bits o tiene Android 9 o menos. |
| En la Mac dice "**está dañada**" | Hacé el paso 2 de Mac (las dos líneas de la Terminal). |
| El antivirus se queja | Los programas no están firmados (firmarlos cuesta plata). Es el mismo código que está en el repositorio. |
| Nada de esto | Abrí un **Issue** en el repositorio contando qué hiciste, qué esperabas y qué pasó, con una foto del error. |

---

## 13. Lo que nunca hay que hacer

- **Nunca subas el disco ni nada sacado de él** a GitHub ni a ningún lado: archivos del disco, música, videos, `Piu.exe`, `traducido.js`, volcados. El `.gitignore` ya los deja afuera; no lo toques.
- **Nunca compartas la firma** (`tools\build_android\firma\`).
- **No repartas públicamente las apps completas**: llevan el juego adentro. Para compartir abierto, las **sin disco**.
- **No le cambies el nombre** a los archivos del disco.

---

## 14. Para el dueño del repositorio

- **Dejar que alguien más suba cambios:** en GitHub, **Settings → Collaborators → Add people**.
- **Subir cambios del port** (desde la carpeta original del proyecto):
  ```
  powershell -ExecutionPolicy Bypass -File tools\exportar_github.ps1 -Subir
  ```
  Arma la copia sin nada de Andamiro, revisa que no se cuele nada (archivos del disco, claves, imágenes), hace el commit y lo sube.
- **Volverlo privado:** Settings → General → Danger Zone → **Change visibility**.

---

## 15. Sobre Andamiro

*Pump It Up* y todo el contenido del juego son de **Andamiro Co., Ltd.**

Este port lo hizo Ravenlight por amor a este juego, sin fines de lucro, para que no se pierda y para jugarlo entre amigos. **No busca perjudicar a Andamiro ni a nadie.** Por eso el repositorio y las apps sin disco no traen nada suyo, y cada persona usa su propio disco.

Si Andamiro quiere que algo se cambie o se baje, alcanza con pedirlo.
