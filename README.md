# 📢 Observatorio de Protestas Sociales

Mapa web interactivo que monitorea los **eventos de protesta social en todo el mundo**, usando datos abiertos del proyecto [GDELT](https://www.gdeltproject.org/). Es una web 100 % estática: no necesita servidor, base de datos ni claves de API.

## Cómo funciona

Un **robot de datos** (GitHub Actions, `.github/workflows/actualizar-datos.yml`) se ejecuta **cada hora**: descarga los ficheros de eventos crudos de GDELT 2.0, filtra los eventos de protesta (código CAMEO 14, con coordenadas reales) y guarda el resultado en `data/protests.json` y `data/articles.json` dentro del propio repositorio. La web solo lee esos archivos — no depende de ninguna API externa en tiempo real, así que no le afectan límites de peticiones, CORS ni APIs que cambien o desaparezcan.

## Qué hace

- 🗺️ **Mapa mundial** (Leaflet) con los eventos de protesta geolocalizados; el tamaño y el color de cada círculo indican cuántos eventos hubo en ese lugar.
- 📊 **Resumen**: focos detectados, eventos totales y el foco más activo del periodo.
- 📰 **Cobertura reciente**: últimos artículos de prensa sobre protestas, con filtro por idioma.
- 🔎 **Filtros instantáneos**: periodo (24 h / 3 días / 7 días), palabra clave (tema o lugar) e idioma — sin recargar.
- ♿ **Accesible**: vista de tabla alternativa, tema claro/oscuro, paleta validada para daltonismo.
- 🔄 Los datos se regeneran cada hora; la página los relee cada 15 minutos.

## Cómo ejecutarla en local

Solo necesitas servir los archivos (los módulos ES no funcionan abriendo `index.html` directamente):

```bash
# con Python
python3 -m http.server 8000
# o con Node
npx serve .
```

Y abre <http://localhost:8000>.

## Cómo desplegarla en GitHub Pages

1. Sube este proyecto a la **raíz** de su propio repositorio.
2. Activa Pages: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Crea el workflow `.github/workflows/actualizar-datos.yml` (si no se subió con el resto) y ejecútalo una vez a mano: pestaña **Actions → Actualizar datos de protestas → Run workflow**.
4. Tu web quedará en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.

## Fuentes de datos

### GDELT (activa)

[GDELT 2.0](https://www.gdeltproject.org/) monitorea la prensa mundial en tiempo casi real (en 65 idiomas) y codifica automáticamente los acontecimientos que detecta. Este proyecto usa:

- **Ficheros de eventos** (`data.gdeltproject.org/gdeltv2`, cada 15 min) → eventos con código CAMEO 14 («protesta») y coordenadas del lugar. Los procesa el robot de datos, no el navegador.
- **DOC 2.0 API** → lista de artículos recientes (también vía el robot: esa API limita a 1 petición cada 5 s).
- La antigua **GEO 2.0 API** de GDELT fue descontinuada (devuelve 404); por eso el proyecto usa los ficheros crudos, que son la fuente estable.

⚠️ **Importante**: GDELT detecta eventos *automáticamente en las noticias*; es excelente para tendencias y focos, pero no es un recuento verificado a mano ni sustituye a una base de datos curada.

### ACLED (preparada, pendiente de activar)

[ACLED](https://acleddata.com/) es la base de datos académica de referencia: eventos de protesta **verificados y codificados a mano**. El módulo `js/sources/acled.js` ya está listo; para activarlo:

1. Regístrate gratis en <https://acleddata.com/register/> y genera tu clave en <https://developer.acleddata.com/>.
2. Copia `js/config.example.js` a `js/config.js` y rellena `ACLED_KEY` y `ACLED_EMAIL` (el archivo está en `.gitignore`, tu clave no se subirá).
3. En `js/app.js`, importa `fetchAcledEvents` y combínala con los datos de GDELT.

> Para una web pública conviene no exponer la clave en el navegador: usa un proxy pequeño (Cloudflare Worker o Netlify Function) que la guarde en el servidor.

## Estructura del proyecto

```
observatorio-protestas-sociales/
├── index.html              # estructura de la página
├── css/style.css           # estilos y paleta (claro/oscuro)
├── data/
│   ├── protests.json       # focos por lugar y día (lo genera el robot)
│   ├── articles.json       # artículos recientes (lo genera el robot)
│   └── dias/               # caché de días completos del robot
├── js/
│   ├── app.js              # lógica principal: mapa, filtros, paneles
│   ├── config.example.js   # plantilla de credenciales (ACLED)
│   └── sources/
│       ├── gdelt.js        # lectura de los datos generados
│       └── acled.js        # fuente preparada: ACLED
└── .github/workflows/
    └── actualizar-datos.yml # robot de datos (cada hora)
```

## Ideas para seguir creciendo

- Combinar GDELT + ACLED en el mapa con un selector de fuente.
- Gráfico de evolución temporal (protestas por día) — los datos por día ya están en `data/protests.json`.
- Alertas: aviso cuando un país supere un umbral de eventos.
- Ampliar la ventana de histórico más allá de 7 días (la caché diaria del robot ya lo permite).
