# Traspaso de "Cierre de Edición"

Este documento existe para que quien continúe el trabajo en otro repositorio
tenga todo el contexto sin necesidad de la conversación original.

**El juego no tiene ninguna relación con el observatorio de protestas sociales.**
Quedó alojado en ese repositorio por error y debe mudarse al repositorio del
dashboard de relevamiento (`Algoritmo-Inteligente`), donde sí tiene sentido:
el juego se alimenta de los hechos que ese dashboard releva.

## Qué es

Juego multijugador de entrenamiento para periodistas que registran hechos.
Enseña a identificar: si un texto es un hecho bien registrado, quiénes son los
actores, a qué sector pertenece y en qué escala se ubica.

Formato estilo Kahoot: una pantalla central proyectada y hasta 10 jugadores
respondiendo desde el celular. Mecánica de supervivencia por tiempo — ver el
`README.md` de esta carpeta, que documenta reglas, niveles e insignias.

Stack: Node.js + Express + Socket.io. Frontend en HTML/CSS/JS puro, sin
frameworks ni dependencias de CDN (las tipografías se sirven localmente desde
`public/fonts/`).

## Estructura

```
juego/
├── server.js                    Motor del juego: salas, relojes, preguntas, insignias
├── package.json
├── data/
│   ├── hechos.json              2.344 hechos (GENERADO — ver abajo)
│   ├── senuelos.json            48 señuelos pedagógicos (CURADO A MANO)
│   ├── conceptos.json           14 cartas de concepto sobre actores (CURADO A MANO)
│   └── perfiles.json            Perfiles persistentes (generado en runtime, en .gitignore)
├── tools/
│   └── parsear-relevamiento.js  Convierte exportaciones .md del dashboard en hechos.json
└── public/
    ├── index.html               Portada
    ├── host.html + js/host.js   Pantalla central (proyector)
    ├── play.html + js/play.js   Pantalla del jugador (celular)
    ├── perfiles.html            Panel del capacitador
    ├── css/estilo.css           Sistema visual completo
    ├── js/sonidos.js            Motor de audio (WebAudio, sin archivos)
    ├── js/confeti.js            Confeti del podio
    └── fonts/                   Tipografías embebidas
```

## Cómo correrlo

```bash
cd juego
npm install
npm start
```

Imprime las direcciones de `/host`, `/play` y `/perfiles`.

## Estado actual

Funciona de punta a punta y estuvo desplegado en Render, probado con un equipo
real. La partida dura 5-7 minutos.

### Lo importante que hay que saber del origen de los datos

`data/hechos.json` es un **archivo congelado**, generado a partir de dos
exportaciones `.md` del dashboard con `tools/parsear-relevamiento.js`. Contiene
2.344 hechos de 4 escalas y 6 sectores.

El parser marca cada hecho con `conCargo`: detecta por expresión regular si el
texto identifica al actor **con su cargo** ("Nombre Apellido, ministro de…") o a
la institución con quien la conduce ("a cargo de…"). Solo esos 922 hechos pueden
salir en el juego como ejemplo de *hecho completo* — sin esa restricción el juego
presentaba como correctos registros a los que les faltaba el cargo, que fue un
error detectado en la primera prueba con periodistas.

## Trabajo pendiente, en orden de prioridad

### 1. Conectar el juego con los datos reales del dashboard

Es el motivo de la mudanza y lo más valioso. Hoy el juego usa el JSON congelado;
el dashboard tiene más de 10.000 hechos y suma alrededor de 194 por día.

Reemplazar la lectura de `data/hechos.json` por consultas a la base del dashboard
permitiría:

- Preguntas siempre actualizadas.
- Resolver el desbalance por sector: hoy TRABAJADORES tiene solo 145 hechos
  contra 1.653 de AGENDA POLÍTICA, así que esas preguntas se repiten.
- Filtrar la partida desde la pantalla central (por fecha, sector o escala).
- Usar los campos reales del dashboard para saber si un actor tiene cargo, en
  lugar de inferirlo con expresiones regulares.

Al hacerlo, conservar `tools/parsear-relevamiento.js` como alternativa para uso
sin conexión.

### 2. Aplicar un sistema de diseño

Está previsto rediseñar el frontend con un sistema hecho en Claude Design
(`claude.ai/design`). Restricciones a respetar:

- Se proyecta en aulas con luz: alto contraste, fondo oscuro, texto grande.
- Las tipografías deben ser de código abierto y servirse localmente: el juego no
  puede cargar fuentes desde una CDN.
- Las 5 opciones de respuesta necesitan color **y forma** distintos (no depender
  solo del color).

### 3. Limpiar las menciones al observatorio

Quedaron tres referencias que atan el juego a un proyecto con el que no tiene
relación, y hay que quitarlas:

- `public/index.html` — "Juego de entrenamiento para periodistas del observatorio…"
- `public/host.html` — rótulo "Observatorio · sala de entrenamiento"
- `README.md` — misma frase

### 4. Sumar material del sector trabajadores

Faltan señuelos y cartas de concepto específicos del sector trabajadores. Las 14
cartas actuales son casi todas sobre actores en general.

### 5. Órbitas

El modelo de datos reserva el campo `orbita` en cada hecho, hoy siempre `null`.
Las exportaciones del dashboard no lo incluían. Cuando esté disponible, se suma
como quinto tipo de desafío.

## Despliegue

Estuvo en Render con el blueprint `render.yaml` de la raíz del repositorio viejo
(`rootDir: juego`, `startCommand: node server.js`, plan gratuito). Al mudarse hay
que crear el servicio desde el repositorio nuevo.

Aviso del plan gratuito: el disco es efímero, así que `data/perfiles.json` —donde
viven las insignias y el historial de cada periodista— puede reiniciarse. Si el
recorrido acumulado importa, conviene una base de datos o un disco persistente.
En el repositorio del dashboard esto se resuelve solo si los perfiles pasan a la
base que ya existe ahí.
