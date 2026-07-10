# 📢 Observatorio de Protestas Sociales

Mapa web interactivo que monitorea los **eventos de protesta social en todo el mundo**, usando datos abiertos del proyecto [GDELT](https://www.gdeltproject.org/). Es una web 100 % estática: no necesita servidor, base de datos ni claves de API.

## Cómo funciona

Un **robot de datos** (GitHub Actions, `.github/workflows/actualizar-datos.yml`) se ejecuta **cada hora**: descarga los ficheros de eventos crudos de GDELT 2.0, filtra los eventos de protesta (código CAMEO 14, con coordenadas reales) y guarda el resultado en `data/protests.json` y `data/articles.json` dentro del propio repositorio. La web solo lee esos archivos — no depende de ninguna API externa en tiempo real, así que no le afectan límites de peticiones, CORS ni APIs que cambien o desaparezcan.

## Qué hace

- 🗺️ **Mapa mundial** (Leaflet) con los eventos de protesta geolocalizados; el tamaño y el color de cada círculo indican cuántos eventos hubo en ese lugar.
- 📊 **Resumen**: focos detectados, eventos totales y el foco más activo del periodo.
- 📰 **Cobertura reciente**: últimos artículos de prensa en español sobre protestas en todo el mundo.
- 🔎 **Filtros instantáneos**: periodo (24 h / 3 días / 7 días) y palabra clave (tema o lugar) — sin recargar.
- 🇪🇸 **Todo en español**: los nombres de países y ciudades se traducen en el navegador (`js/nombres-es.js`) y los artículos se piden a medios en español.
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

### ACLED (opcional)

[ACLED](https://acleddata.com/) es la base de datos académica de referencia: eventos de protesta **verificados y codificados a mano** (publicación semanal). El robot la consulta con el [nuevo sistema OAuth de ACLED](https://acleddata.com/api-documentation/getting-started) y guarda `data/acled.json`; la web muestra entonces un selector GDELT/ACLED. Para activarla:

1. Crea una cuenta gratuita en <https://acleddata.com/> (uso no comercial).
2. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**, y crea dos secretos:
   - `ACLED_USERNAME` → el correo de tu cuenta de ACLED
   - `ACLED_PASSWORD` → tu contraseña de ACLED
3. Ejecuta el workflow a mano (Actions → Run workflow) o espera a la siguiente hora.

Las credenciales viven cifradas en GitHub y nunca aparecen en el código ni en la web. Si los secretos no existen, el robot simplemente omite ACLED.

## Estructura del proyecto

```
observatorio-protestas-sociales/
├── index.html              # estructura de la página
├── css/style.css           # estilos y paleta (claro/oscuro)
├── data/
│   ├── protests.json       # focos por lugar y día (lo genera el robot)
│   ├── articles.json       # artículos recientes (lo genera el robot)
│   ├── acled.json          # eventos verificados de ACLED (opcional)
│   └── dias/               # caché de días completos del robot
├── js/
│   ├── app.js              # lógica: mapa, gráfico, filtros, paneles
│   ├── nombres-es.js       # traducción de países y ciudades al español
│   └── sources/
│       └── gdelt.js        # lectura de los datos generados
├── scripts/
│   └── actualizar_datos.py # el robot: GDELT + ACLED -> data/
└── .github/workflows/
    └── actualizar-datos.yml # ejecuta el robot cada hora
```

## Ideas para seguir creciendo

- Alertas: aviso cuando un país supere un umbral de eventos.
- Ampliar la ventana de histórico más allá de 7 días (la caché diaria del robot ya lo permite).
