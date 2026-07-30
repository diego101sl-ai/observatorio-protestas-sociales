# 🗞️ Cierre de Edición

Juego de entrenamiento para periodistas del observatorio: aprender a **identificar hechos,
actores, escalas y sectores** compitiendo en tiempo real, con material real del relevamiento
de medios. Estilo Kahoot: una pantalla central proyectada y hasta **10 jugadores** desde el celular.

## Cómo se juega

1. El capacitador abre la **pantalla central** (proyector) y crea una sala → aparece un código
   de 4 dígitos y un QR.
2. Cada periodista entra desde su celular (escanea el QR o va a la dirección y escribe el código
   y **su nombre — siempre el mismo**, porque guarda su historial).
3. El capacitador aprieta **Comenzar** y arranca la supervivencia:

### La mecánica: ganar y perder tiempo

- Cada jugador arranca con un **reloj vital de 60 segundos** (tope: 90s).
- El reloj **corre mientras la pregunta está abierta** — igual para todos. Cuando todos
  respondieron, la pregunta se cierra y el drenaje se detiene: responder rápido conviene a todos.
- **Acertás → ganás segundos** (+10s al principio; el premio se achica con los niveles).
  **Errás o no respondés → no ganás nada.**
- La **ventana para responder es la misma para todos** y se acorta con los niveles:
  *Redactor* 15s → *Editor* 12s → *Cierre de edición* 10s → *Muerte súbita* 8s.
- Cuando tu reloj llega a **cero quedás ☠ fuera de juego**. Gana **el último en pie**
  (tope de 30 preguntas; si sobreviven varios, gana el que más tiempo conserva).
- Después de cada pregunta se muestra la respuesta correcta con su **explicación pedagógica**
  y los relojes vitales de todos en vivo.
- Con **sonido**: entrada de jugadores, aciertos, tiempo ganado, tic-tac de urgencia,
  eliminaciones y fanfarria final (botón 🔊/🔇 en la pantalla central para silenciar).

Una partida típica dura **4 a 5 minutos**. Al final: podio animado, **insignias** para los
destacados y perfil actualizado.

### Tipos de desafío

| Desafío | Qué entrena |
|---|---|
| **Detector** — ¿hecho u otra cosa? | Distinguir hechos completos de textos sin actor, sin tiempo/lugar, u opiniones |
| **Radar sectorial** | Clasificar el hecho en su sector (Agenda Política, Finanzas, Trabajadores, Energía, Agro, Industria) |
| **Ojo de águila** | Identificar la escala (Internacional, Latinoamericana, Nacional, Provincial) |
| **Escuela de actores** | Diferenciar actores de individuos e instituciones, y la calidad en la que actúan |

## Perfiles persistentes e insignias

Las insignias y estadísticas de cada jugador **no se borran entre sesiones**: quedan en
`data/perfiles.json`, identificadas por nombre. El panel del capacitador (`/perfiles`) muestra
la precisión acumulada por habilidad, sugiere el **punto débil a reforzar** de cada periodista
y permite **exportar todo a CSV** para preparar ejercicios personalizados.

Insignias: 🔍 Detector de Opiniones · 🧭 Radar Sectorial · 🦅 Ojo de Águila · 🎯 Cazador de
Actores · ⚡ Rayo · 🏆 Último en Pie · 🫀 Al Límite (se salvó con menos de 3s en el reloj) ·
🔥 En Racha · 🖋️ Pluma Perfecta · 📚 Maratonista · 🗞️ Veterano de Redacción.

## Cómo ponerlo en marcha

Requisito: [Node.js](https://nodejs.org) 18 o superior instalado en la computadora del aula.

```bash
cd juego
npm install       # solo la primera vez
npm start
```

El servidor imprime las direcciones para conectarse:

- **Pantalla central**: `http://<ip-de-la-computadora>:3000/host`
- **Jugadores**: `http://<ip-de-la-computadora>:3000/play` (celulares en la **misma red wifi**)
- **Panel de perfiles**: `http://<ip-de-la-computadora>:3000/perfiles`

## Jugarlo online (equipo distribuido)

El repositorio ya trae la configuración de despliegue (`render.yaml` en la raíz). Pasos:

1. Crear una cuenta gratuita en [render.com](https://render.com) (con el botón "Sign in with GitHub").
2. En el panel: **New +** → **Blueprint** → conectar y elegir este repositorio.
3. Elegir la rama que contiene el juego y confirmar. Render lee `render.yaml` y despliega solo.
4. En 2-3 minutos queda una dirección pública tipo `https://cierre-de-edicion.onrender.com`:
   - Pantalla central: `…onrender.com/host`
   - Jugadores: `…onrender.com/play` (o escaneando el QR de la sala)
   - Panel del capacitador: `…onrender.com/perfiles`

> Avisos del plan gratuito: el servicio se duerme tras 15 minutos sin uso (la primera carga
> puede tardar un minuto en despertarlo) y **el disco es efímero**: los perfiles e insignias
> pueden reiniciarse cuando el servicio se reinicia. Para capacitaciones donde importa el
> recorrido acumulado de cada periodista, la notebook del aula conserva los perfiles siempre;
> el hosting gratuito es ideal para probar y jugar a distancia.

## Actualizar la base de hechos

Cuando haya un nuevo relevamiento exportado del dashboard (formato `.md`):

```bash
node tools/parsear-relevamiento.js ruta/al/relevamiento1.md ruta/al/relevamiento2.md
```

Regenera `data/hechos.json`. Los señuelos (`data/senuelos.json`) y las cartas de concepto
(`data/conceptos.json`) se editan a mano: son material pedagógico curado.

### Pendiente para la próxima versión

- **Órbitas**: el modelo de datos ya tiene el campo `orbita` reservado; cuando la exportación
  del dashboard incluya la órbita de cada hecho (o se defina el criterio para derivarla),
  se suma como quinto tipo de desafío.
