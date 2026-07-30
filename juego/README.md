# 🗞️ Cierre de Edición

Juego de entrenamiento para periodistas del observatorio: aprender a **identificar hechos,
actores, escalas y sectores** compitiendo en tiempo real, con material real del relevamiento
de medios. Estilo Kahoot: una pantalla central proyectada y hasta **10 jugadores** desde el celular.

## Cómo se juega

1. El capacitador abre la **pantalla central** (proyector) y crea una sala → aparece un código
   de 4 dígitos y un QR.
2. Cada periodista entra desde su celular (escanea el QR o va a la dirección y escribe el código
   y **su nombre — siempre el mismo**, porque guarda su historial).
3. El capacitador aprieta **Comenzar**. La partida dura entre 4 y 5 minutos: 15 preguntas en
   3 niveles que se aceleran (*Redactor* 20s → *Editor* 15s → *Cierre de edición* 10s).
4. Cada pregunta suma **500 puntos + hasta 500 por velocidad**. Después de cada una se muestra
   la respuesta correcta con su explicación pedagógica y el podio en vivo.
5. Al final: podio animado, **insignias** para los destacados y perfil actualizado.

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
Actores · ⚡ Rayo · 🏆 Campeón de Edición · 🔥 En Racha · 🖋️ Pluma Perfecta · 📚 Maratonista ·
🗞️ Veterano de Redacción.

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

> También se puede desplegar gratis en servicios como Render o Railway (comando de inicio:
> `node server.js`, carpeta raíz: `juego/`). Ojo: en esos servicios el disco puede ser efímero
> y los perfiles reiniciarse en cada despliegue; para el aula, la notebook local es lo más simple
> y conserva los perfiles.

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
