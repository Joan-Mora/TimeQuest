# Guía de clase: Escape Room Estadístico

Guía operativa para el docente que va a usar la actividad en el salón. La instalación, el despliegue y la arquitectura están en el [README](../README.md) y en [`DECISIONES.md`](DECISIONES.md).

## Contenido

1. [Preparar el servicio en Render](#1-preparar-el-servicio-en-render)
2. [Cómo crear una sala](#2-cómo-crear-una-sala-moderador)
3. [Antes de la clase](#3-antes-30-a-10-minutos-antes)
4. [Ingreso](#4-ingreso-unos-3-minutos)
5. [Juego](#5-juego-8-minutos-por-defecto)
6. [Cierre](#6-cierre-unos-5-minutos)
7. [Si algo sale mal](#7-si-algo-sale-mal)
8. [Probar con celulares reales en la misma red Wi-Fi](#8-probar-con-celulares-reales-en-la-misma-red-wi-fi)
9. [Editar las preguntas](#9-editar-las-preguntas)
10. [Lista de pruebas manuales](#10-lista-de-pruebas-manuales)

---

## 1. Preparar el servicio en Render

En el plan **Free**, el servicio se duerme tras 15 minutos sin tráfico. La primera visita después de eso tarda de 30 a 60 segundos en responder. Medidas incluidas y recomendadas:

* **Abre el panel o el proyector 10 minutos antes de la clase.** Eso despierta el servicio, y mientras alguna de esas pantallas esté abierta envía un ping a `/healthz` cada 4 minutos, así que no se vuelve a dormir.
* Si quieres que esté siempre despierto, configura un monitor gratuito (UptimeRobot, cron-job.org) que visite `/healthz` cada 10 minutos durante el horario de clase.
* **El día de la clase conviene el plan Starter.** No se duerme y tiene más CPU; como se cobra por tiempo de uso, puedes subirlo solo ese día.
* El **Key Value gratuito no guarda en disco**: sobrevive a reinicios del servicio web, pero no a un reinicio del propio Key Value. Para una clase de una hora es suficiente; si quieres más garantía, usa un plan pagado del Key Value.
* **Usa una sola instancia.** El estado de la partida vive en memoria del proceso y el Key Value es solo respaldo, así que no actives el autoescalado ni pongas más de una instancia.
* Si el servidor se reinicia durante una partida, la sala vuelve **en pausa** y sin perder el progreso. El panel muestra el aviso y basta con pulsar *Reanudar*. Los celulares se reconectan solos.

Si quieres ensayar la clase completa tú solo, usa el **modo ensayo**: crea una sala en el panel, ejecuta `node scripts/load-test.js --room ABCDE --players 19` y entra tú desde el celular como el estudiante número 20.

## 2. Cómo crear una sala (moderador)

1. En el computador del salón (o tu celular) abre `https://<tu-servicio>.onrender.com/moderador` (en local: `http://localhost:3000/moderador`).
2. Escribe la **clave del moderador** y pulsa **Entrar**. El navegador la recuerda.
3. En **Nueva sala** deja el título o cámbialo (se ve en el proyector) y pulsa **Crear sala**. Aparece un **código de 5 letras** (por ejemplo `KYDSF`): es el que escriben los estudiantes.
4. El panel tiene cinco secciones: **Sala** (invitación y equipos), **En vivo**, **Resultados**, **Preguntas** y **Ajustes**. En el computador están en la barra lateral; en el celular, en la barra inferior. Arriba a la derecha siempre está el botón principal del momento (**Iniciar**, **Pausar**/**Reanudar**, **Revelar podio**) y una guía de pasos te indica qué sigue.
5. Los accesos rápidos son:
   * **Copiar enlace**: el enlace directo para los estudiantes, para pegar en el chat del curso (también al tocar el código);
   * **Ranking en vivo**: abre la vista de espectador en otra pestaña;
   * **Proyector**: abre la pantalla del salón con el QR.
6. Si cierras la pestaña, al volver a `/moderador` la sala sigue ahí. En **Salas guardadas** puedes abrirla o eliminar las de pruebas.

## 3. Antes (30 a 10 minutos antes)

1. Crea la sala como se explica arriba.
2. Revisa la sección **Ajustes**:
   * tiempo por candado (por defecto 8 min);
   * modo de retroalimentación (por defecto *veredicto*: el equipo sabe si acertó, pero la explicación llega al cerrar el candado);
   * pesos de la nota (por defecto 70 % aciertos, 30 % velocidad).
3. Pulsa **Proyector** y lleva esa pestaña a la pantalla del salón (F11 para pantalla completa). Muestra el código, el QR y los estudiantes que van entrando.
4. Si quieres ajustar preguntas, usa la sección **Preguntas** (ver la sección 9).

## 4. Ingreso (unos 3 minutos)

1. Los estudiantes escanean el QR o entran a la URL y escriben el código y su nombre.
2. Cuando estén todos, en la sección **Sala** pulsa **Armar al azar**. Se hacen equipos de hasta 5 lo más parejos posible: 23 estudiantes quedan en 5, 5, 5, 4 y 4. Con 6 o más estudiantes ningún equipo queda de menos de 3. Los candados se reparten en rotación (equipo 1 → candado 1, …, equipo 5 → candado 1). También puedes fijar el número de equipos.
3. Si algo no te gusta, mueve estudiantes, renombra equipos o cambia el candado de un equipo. Quien llegue tarde se asigna solo al equipo con menos integrantes (se puede desactivar).

## 5. Juego (8 minutos por defecto)

1. Pulsa **Iniciar** y confírmalo. Todos los candados arrancan a la vez con cuenta regresiva.
2. En cada equipo todos votan desde su celular y ven en vivo qué votan los demás. Un **capitán** (que rota en cada pregunta) confirma la respuesta del equipo.
   * Si el capitán se desconecta, la capitanía pasa al siguiente conectado.
   * Si está distraído, tras 30 segundos cualquiera puede **tomar el mando**.
3. Al responder las 5 preguntas el candado se abre, aunque haya errores. El proyector anuncia cada apertura con su puesto.
4. Tienes a mano **Pausar**/**Reanudar** en el mismo botón, **+30 s / +1 min** por candado o para todos, y **Terminar** si hace falta.
5. Para seguir los puntajes sin arruinar el suspenso del proyector, abre **Ranking en vivo** en tu celular o portátil (pide la misma clave). Muestra:
   * el ranking provisional con la nota de cada equipo, calculada con la misma fórmula y desempates que el podio final;
   * aciertos, la velocidad que tendría el equipo si abriera ahora, y su **techo** (la mejor nota que todavía puede alcanzar);
   * flechas cuando un equipo sube o baja de puesto;
   * los relojes de cada candado.

## 6. Cierre (unos 5 minutos)

1. Cuando todos los candados se cierran (abiertos o por tiempo), la partida termina sola. En el panel pulsa **Revelar podio** (el botón dorado de arriba a la derecha): el proyector lo muestra con suspenso del 3.º al 1.º.
2. En el proyector, **Pregunta más difícil y debate** muestra las preguntas con menos aciertos y un minuto de cuenta regresiva para el debate "¿Qué fue lo más difícil?".
3. Cada estudiante ve en su celular el desglose de su equipo, la revisión de sus respuestas con explicación y el botón **Mi certificado de Científico de Datos**, que se puede imprimir o guardar como PDF.
4. En la sección **Resultados** descarga **CSV por equipo** y **CSV por estudiante** (se abren bien en Excel en español) o el libro **Excel (.xlsx)** con resumen, ranking, notas y preguntas en hojas con formato. **Informe PDF** abre el informe imprimible, que puedes guardar como PDF desde el navegador.

## 7. Si algo sale mal

| Situación | Qué hacer |
| --- | --- |
| Un estudiante cerró la pestaña o recargó | Que vuelva a abrir la misma URL en el mismo celular y navegador: la sesión se recupera sola. |
| Un estudiante tuvo que cambiar de celular | Que entre de nuevo con el código (aparecerá como "Nombre (2)"). En **Sala**, muévelo a su equipo y expulsa la sesión vieja. El progreso es del equipo, así que no se pierde nada. |
| Un equipo está trabado porque el capitán no responde | Después de 30 s cualquier integrante ve el botón **Tomar el mando**. |
| Se cayó el Wi-Fi del salón | Pausa la partida; al volver la red, todos se reconectan solos. |
| El servidor se reinició | La sala vuelve en pausa con todo el progreso; pulsa **Reanudar**. |
| Se necesita más tiempo | **+30 s / +1 min** en la sección En vivo, para un candado o para todos. |
| Hay que empezar de nuevo | **Reiniciar** vuelve a la sala de espera conservando jugadores y equipos. |

## 8. Probar con celulares reales en la misma red Wi-Fi

1. Averigua la IP de tu computador (`ipconfig` en Windows, busca "Dirección IPv4", por ejemplo `192.168.1.40`).
2. Abre el panel y el proyector usando esa IP: `http://192.168.1.40:3000/moderador`. Así el QR del proyector apunta a una dirección que los celulares sí alcanzan. (Otra opción: define `PUBLIC_URL=http://192.168.1.40:3000`.)
3. Si Windows pregunta por el firewall, permite el acceso de Node en redes privadas.

## 9. Editar las preguntas

Hay dos formas de hacerlo:

* **Desde el panel (sección Preguntas):**
  * editar enunciado, datos, pista, opciones, respuesta, tolerancia y explicación;
  * activar o desactivar, reordenar, duplicar o crear preguntas;
  * editar la historia de cada candado.

  Al guardar se valida todo y se aplica a las partidas **nuevas**; la partida en curso no cambia. Puedes descargar el banco en JSON, importar uno y restaurar el archivo original.
* **Editando `data/questions.json`** y ejecutando `npm run validate:questions`. Los cambios guardados desde el panel tienen prioridad sobre el archivo hasta que pulses *Restaurar*.

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

## 10. Lista de pruebas manuales

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
