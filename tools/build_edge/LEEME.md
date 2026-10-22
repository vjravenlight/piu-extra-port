# Pump It Up Extra (PC)

El juego original de la cabina (Andamiro / F2 System, 2001), traducido a JavaScript, en su propia ventana.
Usa el motor de Edge que ya viene en Windows (WebView2), así que pesa casi lo mismo que el juego.

**Para jugar:** doble clic en `Pump It Up Extra.exe`. Arranca solo y en pantalla completa, como la cabina al prenderla.

| Tecla | Qué hace |
|---|---|
| Z Q S E C | Jugador 1: ↙ ↖ ● ↗ ↘ |
| 1 7 5 9 3 (teclado numérico) | Jugador 2 |
| F4 | moneda (5 = 1 crédito) |
| F1 / F2 / F3 | TEST / SERVICE / CLEAR (menú de servicio: F1 mueve, F2 elige) |
| Esc | salir |
| F11 o doble clic | pantalla completa sí / no |
| F9 | datos de prueba y luces de la cabina |
| F7 | **lista con todo**: suma 26 pasos que el disco trae y el juego original no ofrecía (vale desde el próximo crédito; F7 de nuevo vuelve a la lista original) |

- El modo RUSH (el truco ↖↗↙↘↖↗↙↘● en la selección) tiene corregido el error del original con las canciones 51, 54 y 66: ahora esas tres se juegan a velocidad normal con la música en sincronía.

- Las opciones del menú de servicio (GAME OPTION, COIN OPTION) se guardan en `guardado\eeprom.bin`. Si se borra, vuelven las de fábrica.
- La carpeta entera se puede copiar a otra PC (por ejemplo, en un pendrive). Usa el motor WebView2 de Microsoft, que viene con Windows 11 y con Windows 10 actualizado. **Si esa PC no lo tiene, el juego pregunta y lo instala solo** con el instalador oficial de Microsoft que viene en `motor-webview2\` (tarda un minuto y necesita internet). También se puede instalar a mano con doble clic en `motor-webview2\MicrosoftEdgeWebview2Setup.exe`.
- Los efectos de sonido (moneda, elegir, voces del puntaje) todavía no suenan: los hacía un chip de la placa con una memoria que no está en el disco.
- Se arma con `tools\armar_build_edge.ps1` desde la carpeta del proyecto (`8_Juegos\Pump It Up Extra - arcade 2001`).
