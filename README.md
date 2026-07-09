# 📢 Observatorio de Protestas Sociales

Mapa web interactivo que monitorea la **cobertura mediática de protestas sociales en todo el mundo**, usando datos abiertos del proyecto [GDELT](https://www.gdeltproject.org/). Es una web 100 % estática: no necesita servidor, base de datos ni claves de API.

## Qué hace

- 🗺️ **Mapa mundial** (Leaflet) con los focos de protesta detectados en las noticias; el tamaño y el color de cada círculo indican la intensidad de la cobertura.
- 📊 **Resumen**: focos detectados, menciones totales y el foco más activo del periodo.
- 📰 **Cobertura reciente**: últimos artículos de prensa sobre protestas, con filtro por idioma.
- 🔎 **Filtros**: periodo (24 h / 3 días / 7 días), palabra clave (tema o lugar) e idioma.
- ♿ **Accesible**: vista de tabla alternativa, tema claro/oscuro, paleta validada para daltonismo.
- 🔄 Se actualiza sola cada 15 minutos.

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
2. El workflow `.github/workflows/deploy-pages.yml` se ejecuta en cada push a `main`.
3. Si el primer despliegue falla, activa Pages una vez a mano: **Settings → Pages → Source: GitHub Actions**.
4. Tu web quedará en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.

## Fuentes de datos

### GDELT (activa)

[GDELT 2.0](https://blog.gdeltproject.org/gdelt-geo-2-0-api-debuts/) rastrea la prensa mundial en tiempo casi real y etiqueta los artículos por tema. Este proyecto usa:

- **GEO 2.0 API** → focos geolocalizados con el tema `PROTEST` (máximo: últimos 7 días).
- **DOC 2.0 API** → lista de artículos recientes, filtrable por idioma.

⚠️ **Importante**: GDELT mide *cobertura mediática* (cuánto hablan los medios de protestas en cada lugar), no un recuento verificado de eventos. Es excelente para detectar tendencias y focos, pero no sustituye a una base de datos curada.

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
├── js/
│   ├── app.js              # lógica principal: mapa, filtros, paneles
│   ├── config.example.js   # plantilla de credenciales (ACLED)
│   └── sources/
│       ├── gdelt.js        # fuente activa: GDELT GEO + DOC
│       └── acled.js        # fuente preparada: ACLED
└── .github/workflows/
    └── deploy-pages.yml    # despliegue automático a GitHub Pages
```

## Ideas para seguir creciendo

- Combinar GDELT + ACLED en el mapa con un selector de fuente.
- Gráfico de evolución temporal (protestas por día) con la API `timelinevol` de GDELT.
- Alertas: aviso cuando un país supere un umbral de menciones.
- Guardar instantáneas diarias (GitHub Action + JSON) para tener histórico propio más allá de los 7 días de GDELT.
