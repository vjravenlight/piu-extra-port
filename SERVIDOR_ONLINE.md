# Servidor online de Pump It Up Extra

Esta guía explica cómo está hecho el servidor y cómo instalarlo o mudarlo a otro hosting. Sirve para vos o para quien te ayude, aunque no conozca el proyecto.

**El servidor incluye:** salón online, chat, desafíos, torneos, ranking, cuentas de jugador, edits de la comunidad y panel de moderación.

**Es PHP común y no necesita base de datos:** todo se guarda en archivos dentro de una carpeta. Por eso alcanza con un hosting compartido barato.

---

## 1. Instalar en un hosting nuevo (10 minutos)

Hace falta: un hosting con PHP 7.4 o más nuevo, y una forma de subir archivos (administrador de archivos o FTP).

1. **Armá el paquete**, si no lo tenés ya. Queda en `build\Servidor online - para instalar.zip`:
   ```
   node tools\armar_demo_web.mjs
   powershell -ExecutionPolicy Bypass -File tools\armar_paquete_servidor.ps1
   ```
2. **Creá una carpeta** en el hosting, por ejemplo `public_html/piu`.
3. **Subí el `.zip` ahí y descomprimilo.** Revisá que también haya quedado el archivo `.htaccess`: algunos programas esconden los archivos que empiezan con punto.
4. **Abrí el instalador** en el navegador: `https://tu-sitio.com/piu/online/instalar.php`
5. **Mirá la revisión.** Si algo dice **Mal**, la misma pantalla explica cómo arreglarlo. Si dice **Ojo**, leelo, pero se puede seguir.
6. **Copiá el código de instalación.** Está en `online/datos/CODIGO_DE_INSTALACION.txt`, y solo se puede leer con acceso a los archivos del hosting. Así nadie más puede quedarse con tu panel.
7. **Poné tu mail y una contraseña**, y terminá. El instalador se borra solo.
8. **Probá:**
   - el panel: `https://tu-sitio.com/piu/admin/`
   - el juego: `https://tu-sitio.com/piu/juego/`
   - el online, entrando con dos aparatos
   - "Me olvidé la contraseña" en el panel, para saber si el hosting manda mails

---

## 2. Mudar el servidor sin perder nada

Se pueden mudar el ranking, las cuentas, los edits y las sanciones.

1. **Instalá en el hosting nuevo** con los pasos de arriba, hasta el paso 3. Todavía no abras el instalador.
2. **En el hosting viejo, comprimí la carpeta `online/datos`** y bajala. Es tu respaldo: guardala.
3. **Subila al hosting nuevo** y descomprimila en `online/datos`.
4. **Abrí el instalador.** Va a ver que ya hay un administrador y mantiene tu cuenta: solo te pide el código.
5. **Cambiá la dirección** (sección 3), si el dominio cambia.
6. **Probá** como en el paso 8 de arriba.

Si la gente está jugando durante la mudanza, lo que pase entre el paso 2 y el cambio de dirección se pierde. Conviene hacerla a una hora tranquila.

---

## 3. Si cambia la dirección del servidor

**Lo más simple es no cambiar `ravenlight.net/piu/`**, aunque cambie la empresa de hosting. Si mantenés el dominio y la carpeta, no hay que tocar nada más: alcanza con apuntar el dominio al hosting nuevo.

**Si la dirección cambia,** hay que tocar esto:

| Qué | Dónde | Por qué |
|---|---|---|
| Las apps (Windows, Android, Mac, Linux) | `app\port\online.js`, la línea que empieza con `export const API =` | Tienen la dirección escrita adentro. Después hay que sacar una versión nueva |
| El portal | `ravenlight-web\_herramientas\productos\piu.js`, constantes `SITE` y `JUGAR` | Sus botones apuntan al juego |
| La carpeta de subida | `build\web-demo-carpeta.txt` | La usa `tools\subir_demo_web.ps1` |
| Usuario y servidor de cPanel | `tools\subir_demo_web.ps1` y `tools\alta_admin.ps1` | Están escritos para el hosting actual |

**Ojo:** las apps ya instaladas siguen buscando la dirección vieja hasta que se actualicen. El juego se puede usar sin online, pero sin el salón ni el ranking.

El juego en el navegador no tiene este problema, porque busca el servidor en su misma dirección.

---

## 4. Cómo está armado

### Qué hace cada carpeta

| En el hosting | Sale de | Qué es |
|---|---|---|
| `online/api.php` | `app\online` | El salón: jugadores, chat, desafíos, partidas, torneos, ranking, edits |
| `online/cuentas.php` | `app\online` | Las cuentas opcionales de jugador |
| `online/admin.php` | `app\online` | Lo que usa el panel de moderación. Los permisos se revisan acá |
| `online/comun.php` | `app\online` | Lo que comparten: leer y grabar archivos, límites de pedidos, mails |
| `online/nombres.php` | `app\online` | La clave de cada nombre |
| `online/moderacion.php` | `app\online` | Sanciones, registro y sanciones automáticas |
| `online/filtro.php` y `filtro_idiomas.json` | `app\online` | El filtro de palabras. La lista se rearma con `tools\armar_filtro_idiomas.php` |
| `online/instalar.php` | `app\online` | El instalador. Solo va en el paquete, no en la subida normal |
| `online/datos/` | Se crea sola | **Toda la información.** No se sube con las actualizaciones |
| `admin/` | `app\admin` | La pantalla del panel de moderación |
| `edits/` | `app\edits` | La página para bajar edits |
| `juego/` | Se arma con `tools\armar_demo_web.mjs` | El juego público, sin nada de Andamiro: pide disco y ROM |
| `port/`, `disco/`, `volcados/`, `efectos/` | Se arma con `tools\armar_demo_web.mjs` | El juego completo con contraseña. **No van en el paquete**, porque son archivos de Andamiro |

### Cómo funciona

- **El juego le pregunta al servidor cada medio segundo.** No hay ningún programa prendido en el hosting: por eso anda en uno compartido.
- **Todo se guarda en archivos**, y un "candado" de archivo evita que dos pedidos pisen lo mismo a la vez.
- **Cada conexión tiene límites de pedidos por tiempo**, para frenar abusos. Se anotan en `limites.json`.
- **Lo que manda un jugador nunca se usa tal cual:** los pasos, la música y las imágenes se revisan y se rearman de cero.

### El juego necesita estos encabezados

Están en el `.htaccess` de la carpeta principal. Sin los dos primeros, el juego en el navegador no arranca:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

---

## 5. Qué hay en `online/datos`

**Esta carpeta es lo único que hay que respaldar.** Todo lo demás se puede volver a subir.

| Archivo o carpeta | Qué guarda | ¿Es importante? |
|---|---|---|
| `cuentas/` | Cuentas de jugador: mail, contraseña cifrada, nombre | **Sí. Tiene mails: tratalo con cuidado** |
| `admin/` | Administradores y moderadores, sus sesiones e invitaciones | **Sí. Tiene mails** |
| `moderacion/` | Sanciones, ajustes del filtro, registro, mensajes filtrados | Sí |
| `ranking.json`, `solo.json` | Rankings | Sí |
| `perfiles.json` | Perfil de cada jugador | Sí |
| `nombres.json` | Clave de cada nombre, cifrada | Sí |
| `comunidad/` | Edits publicados | Sí |
| `ediciones/` | "Mis edits" de cada jugador | Sí |
| `sala.json` | Quién está conectado ahora y el chat | No: se rearma solo |
| `paquetes/` | Canciones propias en tránsito | No: se borran solas |
| `limites.json`, `candado*` | Límites y candados | No |
| `reportes.jsonl`, `errores.log` | Fallas para diagnosticar | Sirven si algo anda mal |

**Respaldo:** comprimí esa carpeta de vez en cuando y guardala fuera del hosting. No la subas a GitHub ni la compartas.

**Si borrás una cuenta o un dato a mano,** hacelo con el salón tranquilo: son archivos de texto en formato JSON, y uno roto se lee como si estuviera vacío.

---

## 6. Si el hosting no es Apache o LiteSpeed

Con **Nginx**, los archivos `.htaccess` no hacen nada. Hay que agregar esto a la configuración del sitio y reiniciarlo. Sin el bloqueo de `datos`, **cualquiera podría leer los mails**:

```nginx
location ^~ /piu/online/datos/ { deny all; return 404; }

location /piu/ {
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    try_files $uri $uri/ =404;
}

location ~ ^/piu/.*\.php$ {
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;   # cambialo por el de tu servidor
}
```

Esta configuración no está probada: el servidor actual es LiteSpeed. El instalador comprueba si los datos quedaron protegidos.

**Otra opción más segura:** guardar los datos fuera de la carpeta pública, poniendo la variable de entorno `PIU_ONLINE_DATOS` con la ruta de esa carpeta.

---

## 7. Mails

Los manda PHP con `mail()`, desde `no-reply@ravenlight.net`, y solo sirven para recuperar contraseñas. Todo lo demás funciona sin ellos.

- **Si cambia el dominio,** cambiá esa dirección en `app\online\comun.php`, función `mandarMail`.
- **Si no llegan o caen en spam,** revisá en el hosting la configuración de correo del dominio (SPF y DKIM). Algunos hostings bloquean `mail()`.

---

## 8. Administrar

| Quiero | Cómo |
|---|---|
| Sumar un moderador | Panel > Equipo > Invitar moderador, y mandarle el link |
| Sacar o deshabilitar a alguien | Panel > Equipo |
| Cambiar lo que filtra el chat | Panel > Filtro |
| Entrar si perdí la contraseña | "Me olvidé la contraseña" en el panel |
| Entrar si no llegan los mails ni queda ningún admin | `tools\alta_admin.ps1` da un link de un solo uso (usa el token de cPanel del hosting actual). Sin eso: subí a `online/datos/admin/` un `alta.json` como el que arma ese script |
| Actualizar el servidor | `node tools\armar_demo_web.mjs` y `tools\subir_demo_web.ps1 -Solo online` |

**Al actualizar, subí primero lo que el código nuevo necesita y `api.php` al final,** para que el salón no se corte. Esa subida nunca toca `online/datos`.

---

## 9. Canciones propias en el online

Para mandarle una canción propia a un rival, el servidor necesita revisarla con un archivo del juego: `volcados/datos_0x130000.bin`. **No viene en el paquete, porque es de Andamiro.**

Sin ese archivo, todo lo demás anda, pero no se pueden desafiar con canciones propias. Si lo necesitás, subilo a esa ruta, dentro de la carpeta del juego.

---

## 10. Si algo falla

| Qué pasa | Qué mirar |
|---|---|
| El juego queda en negro o dice "Falta el aislamiento" | Faltan los encabezados de la sección 4. ¿Se subió el `.htaccess`? ¿El hosting tiene `mod_headers`? |
| "El salón no responde" | Abrí `online/datos/errores.log`. Revisá la versión de PHP |
| Error 500 | Lo mismo: `errores.log`, y si está vacío, el registro de errores del hosting |
| No se guarda nada | Permisos de escritura en `online/datos` |
| Se pueden abrir archivos de `datos` desde el navegador | **Arreglalo ya:** sección 6. Hay mails ahí |
| Dice "demasiados pedidos" | Es el límite por conexión. Se libera solo en unos minutos |
| Las apps no se conectan y la web sí | Cambió la dirección: sección 3 |

---

## 11. Probado y sin probar

- **Probado:** el instalador en PHP 8.4, en una copia local. El salón, el panel y las cuentas, en el hosting actual (LiteSpeed).
- **Sin probar:** una mudanza real a otro hosting, Nginx, PHP 7.4 y el envío real de mails.
