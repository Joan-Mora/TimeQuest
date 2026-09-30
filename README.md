# Escape Room Estadístico: El Laboratorio Sellado

Actividad de cierre en tiempo real para la exposición de **Análisis Cuantitativo de Datos** (estimación, pruebas de hipótesis, regresión lineal y ANOVA). Los estudiantes entran desde el celular con un código, se agrupan en equipos de 5 y cada equipo intenta abrir uno de los cuatro candados respondiendo 5 preguntas en cooperación. El moderador controla todo desde un panel y el proyector muestra el tablero en vivo, los candados que se abren y el podio.

| Pantalla | Ruta | Quién la usa |
| --- | --- | --- |
| Estudiante | `/` (o `/?sala=CÓDIGO` desde el QR) | Cada estudiante en su celular |
| Panel del moderador | `/moderador` | Docente (pide la clave) |
| Proyector | `/proyector?sala=CÓDIGO` | Pantalla del salón |
| Ranking en vivo (espectador) | `/espectador?sala=CÓDIGO` | Docente o invitados con la clave: puntajes y notas provisionales en vivo |
| Informe imprimible / PDF | `/informe?sala=CÓDIGO` | Docente, después de la partida |
| Certificado | `/certificado` (se abre desde la pantalla final del estudiante) | Cada estudiante |

Los cuatro candados siguen la propuesta análoga de la exposición:

1. **El ladrón de datos**: intervalos de confianza (el código es el límite superior del IC).
2. **El juicio**: prueba de hipótesis sobre las baterías de 20 h, culpable/inocente y errores tipo I y II.
3. **Traza la recta**: regresión lineal (el código es el R²).
4. **Tres pociones**: ANOVA (ordenar sumas de cuadrados; el código son los gl del error).

---

## 1. Ejecutar en tu computador

Requisitos: **Node.js 20 o superior** (probado con Node 22).

```bash
npm install
npm run dev        # recarga automática al editar; o "npm start"
```

Abre <http://localhost:3000/moderador>. En desarrollo la clave por defecto es **`profe123`** (cámbiala con la variable `MODERATOR_KEY`).

### Probar con celulares reales en la misma red Wi-Fi

1. Averigua la IP de tu computador (`ipconfig` en Windows, busca "Dirección IPv4", por ejemplo `192.168.1.40`).
2. Abre el panel y el proyector usando esa IP: `http://192.168.1.40:3000/moderador`. Así el QR del proyector apunta a una dirección que los celulares sí alcanzan. (Otra opción: define `PUBLIC_URL=http://192.168.1.40:3000`.)
3. Si Windows pregunta por el firewall, permite el acceso de Node en redes privadas.

### Variables de entorno

Todas son opcionales en local; en producción solo `MODERATOR_KEY` es obligatoria. Ver [`.env.example`](.env.example).

| Variable | Para qué sirve | Por defecto |
| --- | --- | --- |
| `MODERATOR_KEY` | Clave del panel del moderador | `profe123` (solo en desarrollo) |
| `PORT` | Puerto HTTP | `3000` (Render lo define solo) |
| `REDIS_URL` | Guarda las salas en Render Key Value | vacío = archivos en `.data/` |
| `PUBLIC_URL` | URL base del QR y del enlace de ingreso | En Render usa `RENDER_EXTERNAL_URL` |
| `ROOM_TTL_HOURS` | Horas que se conserva una sala sin actividad | `12` |
| `QUESTIONS_FILE` | Banco de preguntas inicial | `data/questions.json` |
| `MAX_PLAYERS_PER_ROOM` | Tope de jugadores por sala | `80` |

---

## 2. Pruebas automáticas y herramientas

```bash
npm test                      # 39 pruebas: puntuación, desempates, ranking en vivo, motor del juego, banco y respuestas
npm run validate:questions    # valida data/questions.json (o: npm run validate:questions -- otra-ruta.json)
npm run load-test             # simula 40 estudiantes contra http://localhost:3000
```

Opciones de la prueba de carga (`node scripts/load-test.js --opción valor`):

| Opción | Qué hace | Por defecto |
| --- | --- | --- |
| `--url` | Servidor a probar (sirve también con la URL de Render) | `http://localhost:3000` |
| `--players` | Número de estudiantes simulados | `40` |
| `--key` | Clave del moderador | `MODERATOR_KEY` o `profe123` |
| `--think` | Milisegundos que "piensa" cada bot antes de votar | `1500` |
| `--minutes` | Límite de tiempo por candado | `3` |
| `--chaos` | Fracción de jugadores que se desconectan y reconectan a mitad de partida | `0.1` |
| `--keep` | No borra la sala al terminar (para revisar resultados y exportaciones) | apagado |
| `--room CÓDIGO` | **Modo ensayo**: los bots entran a una sala que ya creaste y esperan a que tú pulses *Iniciar* desde el panel | — |

El modo ensayo sirve para practicar la clase completa tú solo. Crea una sala en el panel, ejecuta `node scripts/load-test.js --room ABCDE --players 19` y entra tú desde el celular como el estudiante número 20.

La prueba reporta latencias p50, p95 y p99 de ingreso, voto y confirmación, los errores y el ranking, y verifica que el orden de apertura sea 1..n sin repetidos. Termina con código 1 si la confirmación p95 supera 1 s o hubo errores de conexión. Resultados de referencia en un portátil: con 40 jugadores, el voto tuvo p95 de 6 ms y la confirmación p95 de 3 ms. Con 50 jugadores y 20 % de desconexiones forzadas no hubo ningún error.

---

## 3. Desplegar en Render

El repositorio incluye [`render.yaml`](render.yaml) (Blueprint). Crea dos recursos:

* **`escape-room-estadistico`**: un Web Service de Node.
  * Build: `npm ci --omit=dev`
  * Start: `npm start`
  * Health check: `/healthz`
* **`escape-room-kv`**: un Key Value (compatible con Redis) para que las partidas sobrevivan a reinicios y despliegues. Solo es accesible desde la red privada de Render y su `REDIS_URL` se inyecta sola.

### Paso a paso

1. El código está en el repositorio privado [Joan-Mora/TimeQuest](https://github.com/Joan-Mora/TimeQuest). Las carpetas `.data/` y `node_modules/` y el PDF de la exposición quedan fuera por `.gitignore`.
2. En el [Dashboard de Render](https://dashboard.render.com): **New → Blueprint**, conecta tu cuenta de GitHub (Render pedirá permiso para ver el repositorio privado), elige `TimeQuest` y confirma. Cada `git push` a `main` vuelve a desplegar automáticamente.
3. Render te pedirá el valor de **`MODERATOR_KEY`**. Usa una clave de al menos 6 caracteres que no sea `profe123`.
4. Espera a que el despliegue termine y abre `https://<tu-servicio>.onrender.com/healthz`. Debe responder `{"ok":true,...}` e indicar `"store":"redis"`.
5. Entra a `https://<tu-servicio>.onrender.com/moderador` con tu clave.

**Sin Blueprint (manual):** crea un *Web Service* con runtime Node, los comandos de build y start de arriba, health check `/healthz` y las variables `NODE_ENV=production` y `MODERATOR_KEY`. Si además creas un Key Value, copia su *Internal Connection String* en la variable `REDIS_URL`. Sin `REDIS_URL` la app funciona igual, pero guarda en disco, y el disco de Render se borra en cada reinicio o despliegue.

**Opcional:** puedes ejecutar la prueba de carga contra Render:

```bash
node scripts/load-test.js --url https://<tu-servicio>.onrender.com --key TU_CLAVE --players 40
```

### Plan gratuito y arranque en frío

En el plan **Free**, el servicio se duerme tras 15 minutos sin tráfico. La primera visita después de eso tarda de 30 a 60 segundos en responder. Medidas incluidas y recomendadas:

* **Abre el panel o el proyector 10 minutos antes de la clase.** Eso despierta el servicio, y mientras alguna de esas pantallas esté abierta envía un ping a `/healthz` cada 4 minutos, así que no se vuelve a dormir.
* Si quieres que esté siempre despierto, configura un monitor gratuito (UptimeRobot, cron-job.org) que visite `/healthz` cada 10 minutos durante el horario de clase.
* **El día de la clase conviene el plan Starter** (unos USD 7/mes, se cobra por tiempo de uso, así que puedes subirlo solo ese día). No se duerme y tiene más CPU.
* El **Key Value gratuito no guarda en disco**: sobrevive a reinicios del servicio web, pero no a un reinicio del propio Key Value. Para una clase de una hora es suficiente; si quieres más garantía, usa un plan pagado del Key Value.
* **Usa una sola instancia.** El estado de la partida vive en memoria del proceso y el Key Value es solo respaldo, así que no actives el autoescalado ni pongas más de una instancia.
* Si el servidor se reinicia durante una partida, la sala vuelve **en pausa** y sin perder el progreso. El panel muestra el aviso y basta con pulsar *Reanudar*. Los celulares se reconectan solos.

---

## 4. Guía para el día de la clase

### Cómo crear una sala (moderador)

1. En el computador del salón (o tu celular) abre `https://<tu-servicio>.onrender.com/moderador` (en local: `http://localhost:3000/moderador`).
2. Escribe la **clave del moderador** y pulsa **Entrar**. El navegador la recuerda.
3. En **Crear una sala nueva** deja el título o cámbialo (se ve en el proyector) y pulsa **Crear sala**. Aparece arriba un **código de 5 letras** (por ejemplo `KYDSF`): es el que escriben los estudiantes.
4. En la barra superior tienes:
   * **Copiar enlace**: el enlace directo para los estudiantes, para pegar en el chat del curso;
   * **Ranking en vivo**: abre la vista de espectador en otra pestaña;
   * **Abrir proyector**: abre la pantalla del salón con el QR.
5. Si cierras la pestaña, al volver a `/moderador` la sala sigue ahí. En **Salas existentes** puedes abrirla o eliminar las de pruebas.

### Antes (30 a 10 minutos antes)

1. Crea la sala como se explica arriba.
2. Revisa la pestaña **Configuración**:
   * tiempo por candado (por defecto 8 min);
   * modo de retroalimentación (por defecto *veredicto*: el equipo sabe si acertó, pero la explicación llega al cerrar el candado);
   * pesos de la nota (por defecto 70 % aciertos, 30 % velocidad).
3. Pulsa **Abrir proyector** y lleva esa pestaña a la pantalla del salón (F11 para pantalla completa). Muestra el código, el QR y los estudiantes que van entrando.
4. Si quieres ajustar preguntas, usa la pestaña **Banco** (ver sección 5).

### Ingreso (unos 3 minutos)

1. Los estudiantes escanean el QR o entran a la URL y escriben el código y su nombre.
2. Cuando estén todos, en la pestaña **Equipos** pulsa **Armar equipos automáticamente**. Se hacen equipos de hasta 5 lo más parejos posible: 23 estudiantes quedan en 5, 5, 5, 4 y 4. Con 6 o más estudiantes ningún equipo queda de menos de 3. Los candados se reparten en rotación (equipo 1 → candado 1, …, equipo 5 → candado 1). También puedes fijar el número de equipos.
3. Si algo no te gusta, mueve estudiantes, renombra equipos o cambia el candado de un equipo. Quien llegue tarde se asigna solo al equipo con menos integrantes (se puede desactivar).

### Juego (8 minutos por defecto)

1. Pulsa **Iniciar** y confírmalo. Todos los candados arrancan a la vez con cuenta regresiva.
2. En cada equipo todos votan desde su celular y ven en vivo qué votan los demás. Un **capitán** (que rota en cada pregunta) confirma la respuesta del equipo.
   * Si el capitán se desconecta, la capitanía pasa al siguiente conectado.
   * Si está distraído, tras 30 segundos cualquiera puede **tomar el mando**.
3. Al responder las 5 preguntas el candado se abre, aunque haya errores. El proyector anuncia cada apertura con su puesto.
4. Tienes a mano **Pausar**/**Reanudar** en el mismo botón, **+30 s / +1 min** por candado o para todos, y **Terminar** si hace falta.
5. Para seguir los puntajes sin arruinar el suspenso del proyector, abre **Ranking en vivo** en tu celular o portátil (pide la misma clave). Muestra:
   * el ranking provisional con la nota de cada equipo, calculada con la misma fórmula y desempates que el podio final;
   * aciertos, la velocidad que tendría el equipo si abriera ahora, y su **techo** (la mejor nota que todavía puede alcanzar);
   * flechas ▲▼ cuando un equipo cambia de puesto;
   * los relojes de cada candado.

### Cierre (unos 5 minutos)

1. Cuando todos los candados se cierran (abiertos o por tiempo), la partida termina sola. En el proyector pulsa **Revelar podio**: aparece con suspenso del 3.º al 1.º.
2. En el proyector, **Pregunta más difícil y debate** muestra las preguntas con menos aciertos y un minuto de cuenta regresiva para el debate "¿Qué fue lo más difícil?".
3. Cada estudiante ve en su celular el desglose de su equipo, la revisión de sus respuestas con explicación y el botón **Mi certificado de Científico de Datos**, que se puede imprimir o guardar como PDF.
4. En la pestaña **Resultados** descarga **CSV por equipo** y **CSV por estudiante** (se abren bien en Excel en español). **Informe PDF** abre el informe imprimible, que puedes guardar como PDF desde el navegador.

### Si algo sale mal

| Situación | Qué hacer |
| --- | --- |
| Un estudiante cerró la pestaña o recargó | Que vuelva a abrir la misma URL en el mismo celular y navegador: la sesión se recupera sola. |
| Un estudiante tuvo que cambiar de celular | Que entre de nuevo con el código (aparecerá como "Nombre (2)"). En **Equipos**, muévelo a su equipo y expulsa la sesión vieja. El progreso es del equipo, así que no se pierde nada. |
| Un equipo está trabado porque el capitán no responde | Después de 30 s cualquier integrante ve el botón **Tomar el mando**. |
| Se cayó el Wi-Fi del salón | Pausa la partida; al volver la red, todos se reconectan solos. |
| El servidor se reinició | La sala vuelve en pausa con todo el progreso; pulsa **Reanudar**. |
| Se necesita más tiempo | **+30 s / +1 min** en la pestaña Partida, para un candado o para todos. |
| Hay que empezar de nuevo | **Reiniciar** vuelve a la sala de espera conservando jugadores y equipos. |

---

## 5. Editar las preguntas

Hay dos formas de hacerlo:

* **Desde el panel (pestaña Banco):**
  * editar enunciado, datos, pista, opciones, respuesta, tolerancia y explicación;
  * activar o desactivar, reordenar, duplicar o crear preguntas;
  * editar la historia de cada candado.

  Al guardar se valida todo y se aplica a las partidas **nuevas**; la partida en curso no cambia. Puedes descargar el banco en JSON, importar uno y restaurar el archivo original.
* **Editando `data/questions.json`** y ejecutando `npm run validate:questions`. Los cambios guardados desde el panel tienen prioridad sobre el archivo hasta que pulses *Restaurar archivo*.

Formato de cada pregunta:

```json
{
  "id": "L1-Q3",
  "lock": 1,
  "type": "mc",
  "difficulty": "media",
  "prompt": "Enunciado (admite **negritas** y saltos de línea)",
  "data": "Datos opcionales en un recuadro",
  "hint": "Pista opcional",
  "options": ["A", "B", "C", "D"],
  "answer": 2,
  "explanation": "Se muestra al revisar",
  "active": true
}
```

Los campos por tipo son:

* **Opción múltiple** (`"type": "mc"`): `answer` es el índice de la opción correcta, empezando en 0. Admite de 2 a 6 opciones.
* **Numérica** (`"type": "numeric"`): usa `"answer": 0.81`, `"tolerance": 0.01` y opcionalmente `"unit": "h"`. Se acepta punto o coma decimal.

Cada candado usa las primeras 5 preguntas activas, y las opciones se barajan distinto para cada equipo. El banco trae 5 preguntas activas y 2 de reserva por candado.

---

## 6. Puntuación

La nota de cada equipo va de 0 a 5:

\[ \text{Nota} = w_A \cdot \frac{\text{Aciertos}}{20} + w_V \cdot \text{Velocidad} \]

* **Aciertos:** 20 puntos por pregunta correcta (máximo 100). Dividido entre 20 queda en escala de 0 a 5.
* **Velocidad:**
  * por orden de apertura: 1.º 5.0, 2.º 4.5, 3.º 4.0, 4.º 3.5;
  * del 5.º en adelante baja 0.5 por puesto, con piso de 3.0;
  * si el tiempo se agota sin abrir el candado: 2.5.
* **Pesos por defecto:** \(w_A = 0.7\), \(w_V = 0.3\). Se ajustan en Configuración, que muestra una vista previa con escenarios.
* **Desempates, en orden:**
  1. más aciertos;
  2. haber abierto el candado;
  3. menor tiempo;
  4. orden de apertura decidido por el servidor;
  5. más preguntas respondidas;
  6. orden alfabético.

El orden de apertura lo decide el servidor, que procesa las confirmaciones una a una. Por eso nunca hay dos equipos con el mismo puesto, aunque confirmen en el mismo milisegundo.

---

## 7. Lista de pruebas manuales

Hazla una vez en local y otra en Render antes de la clase.

- [ ] `/healthz` responde `ok` (en Render, con `"store":"redis"`).
- [ ] Clave incorrecta en `/moderador` muestra error; con la correcta entra.
- [ ] Crear sala, abrir el proyector: se ven el código y el QR, y el QR abre la pantalla de ingreso con el código ya puesto.
- [ ] Entran al menos 6 personas o bots (`--room`); el proyector y el panel las muestran en vivo.
- [ ] Nombre repetido en la misma sala desde otro dispositivo: entra como "Nombre (2)".
- [ ] Armar equipos automáticamente con 7, 11 y 23 jugadores: tamaños parejos (4-3, 4-4-3, 5-5-5-4-4).
- [ ] Mover un jugador de equipo, renombrar un equipo, cambiarle el candado.
- [ ] Iniciar: todos los celulares cambian a la pregunta 1 con la misma cuenta regresiva que el proyector.
- [ ] Votar en dos celulares del mismo equipo: cada uno ve el voto del otro en vivo.
- [ ] Solo el capitán puede confirmar; la capitanía rota en la siguiente pregunta.
- [ ] Esperar 30 s sin confirmar: otro integrante ve **Tomar el mando** y puede confirmar.
- [ ] Recargar la página de un estudiante a mitad de partida: vuelve a la misma pregunta con su progreso.
- [ ] Ranking en vivo (`/espectador?sala=CÓDIGO`) pide la clave; se actualiza al confirmar cada respuesta y muestra ▲▼ cuando un equipo cambia de puesto.
- [ ] Al terminar, el ranking en vivo coincide con el podio del proyector.
- [ ] Probar en un celular pequeño (o en las herramientas del navegador a 320 px y 360 px de ancho): ingreso, sala de espera, pregunta de opción múltiple y numérica, candado cerrado, resultados y certificado, sin desplazamiento horizontal ni texto cortado.
- [ ] Apagar el Wi-Fi de un celular 20 s y volver a encenderlo: se reconecta solo.
- [ ] Pausar: los relojes se congelan y no se puede votar. Reanudar: continúan desde el mismo tiempo.
- [ ] +30 s a un candado: su reloj sube en todas las pantallas.
- [ ] Un equipo abre su candado: el proyector lo anuncia con su puesto y el equipo ve la revisión con explicaciones.
- [ ] Dejar que un candado se quede sin tiempo: se cierra con velocidad 2.5.
- [ ] Al cerrarse todos, la partida termina sola; **Revelar podio** anima del 3.º al 1.º.
- [ ] El debate del proyector muestra la pregunta más difícil y el minuto de cuenta regresiva.
- [ ] Certificado: muestra nombre, equipo, puesto e insignias; se imprime en una hoja A4 horizontal.
- [ ] CSV de equipos y de estudiantes se abren bien en Excel (tildes y decimales con coma).
- [ ] El informe imprimible se guarda como PDF sin cortes.
- [ ] En las herramientas del navegador (pestaña Red) no aparece la respuesta correcta antes de confirmar.
- [ ] Reiniciar la sala la devuelve a la espera con los mismos jugadores.
- [ ] (Render) Hacer *Manual Deploy* durante una partida de prueba: la sala vuelve en pausa con el progreso intacto.

---

## 8. Estructura del proyecto

```
src/
  server.js, app.js, config.js      Arranque, rutas HTTP (ingreso, QR, exportaciones, salud) y configuración
  modules/
    game/gameEngine.js              Reglas: inicio, votos, capitán, confirmación, tiempo, fin
    scoring/                        Nota, desempates e insignias
    rooms/, teams/                  Salas, jugadores, armado de equipos
    questions/                      Banco de preguntas, validación y corrección de respuestas
    timer/clock.js                  Reloj del servidor con pausas y tiempo extra
    realtime/                       Socket.IO y vistas filtradas por rol (nunca envían respuestas antes de tiempo)
    persistence/                    Guardado en Redis (Key Value) o en archivos
    exports/                        CSV
public/                             Interfaz (Preact + htm, sin paso de compilación)
data/questions.json                 Banco de preguntas
scripts/                            Validador del banco y prueba de carga
tests/                              Pruebas con node:test
docs/DECISIONES.md                  Arquitectura y decisiones para revisar
```
