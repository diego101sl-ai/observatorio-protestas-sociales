# OITraF · Observatorio Internacional del Trabajo del Futuro

Sitio web del **OITraF** con los indicadores del mercado laboral de Argentina, América Latina y el mundo tomados de **fuentes oficiales** (institutos de estadística, ministerios y organismos multilaterales), la **cobertura diaria de 24 medios** relevada por el equipo en el dashboard *Algoritmo Inteligente · Seguimiento de Medios*, y el **observatorio de protestas sociales** (mapa mundial con datos de GDELT).

Es una web 100 % estática: no necesita servidor ni base de datos. Dos robots (GitHub Actions) descargan los datos y los guardan como JSON dentro del repositorio; las páginas solo leen esos archivos.

## Páginas

| Página | Qué muestra |
|---|---|
| `index.html` | Portal: placas de indicadores de **Argentina**, **América Latina** y **Mundo** (número grande, período de referencia, variación, minigráfico y fuente), gráficos comparados, **cobertura de medios** filtrable por escala y sector, resumen del observatorio de protestas y tabla de **fuentes y método**. |
| `indicadores.html` | Explorador de **todas las series**: filtros por escala, país, tema y fuente; búsqueda; comparación por geografía; cada serie con gráfico, tabla, descarga CSV y enlace al organismo. |
| `protestas.html` | Mapa mundial de protestas (GDELT), con filtros de período y palabra clave, cobertura traducida al español y vista de tabla. |

Registro editorial del observatorio (aplica a cada placa): dato verificable, fuente visible, período de referencia explícito. Cuando OITraF calcula un indicador (salario real, canasta del hogar, salario mínimo en canastas) se declara como elaboración propia y se enlaza la serie oficial de la que sale.

## Robots de datos

### 1. Indicadores laborales · `scripts/actualizar_indicadores.py`

Corre todos los días (`.github/workflows/actualizar-indicadores.yml`, 06:17 UTC) y también a mano desde **Actions → Actualizar indicadores OITraF → Run workflow** (opcionalmente con la lista de fuentes a consultar, por ejemplo `wb,datosar`). Escribe:

- `data/indicadores.json`: todas las series normalizadas (`fuente`, `codigo`, `tema`, `nombre`, `descripcion`, `unidad`, `frecuencia`, `geo`, `escala`, `url`, `ultimo`, `anterior`, `var_interanual`, `proyeccion_desde`, `serie`).
- `data/indicadores/estado.json`: resultado de cada fuente (ok / sin respuesta, cantidad de series, detalle del error).
- `data/indicadores/catalogo_datosgobar.json`: candidatas que el robot evaluó para cada serie argentina y la elegida, para revisar y fijar ids.

Si una fuente no responde, las series de esa fuente se conservan de la corrida anterior (marcadas con `conservada_de`) y la web lo indica.

| Clave | Fuente | Tipo | Qué aporta | Frecuencia |
|---|---|---|---|---|
| `wb` | [Banco Mundial · WDI](https://datos.bancomundial.org/) (incluye estimaciones modeladas de la OIT) | multilateral | desocupación total y juvenil, actividad (total, mujeres, varones), empleo, empleo vulnerable, informalidad, cuenta propia, asalariados, jóvenes que no estudian ni trabajan, productividad, fuerza laboral, empleo por sector, inflación, PIB, pobreza, Gini | anual · 39 países y 14 agregados |
| `ilo` | [OIT · ILOSTAT](https://ilostat.ilo.org/es/) | multilateral | desocupación (trimestral y mensual), desocupación juvenil, actividad, empleo, subocupación horaria | trimestral y mensual · América Latina y economías de referencia |
| `datosar` | [datos.gob.ar · Series de Tiempo](https://datos.gob.ar/series/api/) (INDEC, Secretaría de Trabajo, Ministerio de Economía) | gobierno | EPH: desocupación, actividad, empleo, subocupación, asalariados sin descuento jubilatorio, pobreza e indigencia · SIPA: trabajadores registrados y asalariados privados · RIPTE · salario mínimo · IPC nacional · canastas básicas · EMAE | trimestral, semestral y mensual |
| `eurostat` | [Eurostat](https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table) | multilateral | desocupación total y juvenil desestacionalizada (UE27, zona euro, Alemania, España, Francia, Italia) | mensual |
| `bls` | [Bureau of Labor Statistics](https://www.bls.gov/data/) | gobierno | Estados Unidos: desocupación, actividad, empleo/población, desocupación de 16 a 19 años, nóminas no agrícolas, salario horario | mensual |
| `imf` | [FMI · WEO](https://www.imf.org/external/datamapper/) | multilateral | desocupación, crecimiento e inflación con proyecciones | anual |
| `oecd` | [OCDE · Data Explorer](https://data-explorer.oecd.org/) | multilateral | desocupación armonizada (incluye Chile, Colombia, Costa Rica y México) | mensual |

Elaboraciones de OITraF calculadas en el navegador a partir de esas series (`js/oitraf/comun.js`, `derivarSeries`): inflación mensual e interanual (del índice IPC), variación interanual real del RIPTE y del salario mínimo (deflactadas por IPC), Canasta Básica Total del hogar de cuatro integrantes (CBT × 3,09) y salario mínimo medido en canastas del hogar.

Las series argentinas se localizan en el catálogo oficial por búsqueda de texto con reglas de inclusión, exclusión, frecuencia y publicador (`AR_SERIES` en el script). Los `ids` de las series principales ya están fijados en cada entrada; la búsqueda queda como respaldo y sus candidatas se guardan en `data/indicadores/catalogo_datosgobar.json` para revisar cambios del catálogo.

### 2. Cobertura de medios · `scripts/sincronizar_hechos.py`

Se ejecuta en el mismo workflow. Inicia sesión en el dashboard *Algoritmo Inteligente* con una **cuenta de solo lectura** y publica en `data/hechos.json` un extracto de las últimas semanas (título, resumen breve, medio, escala, sector, eje, fecha, actores y enlaces a las notas). No publica el cuerpo completo de los hechos ni datos de quien los cargó.

Secretos del repositorio (**Settings → Secrets and variables → Actions**):

| Secreto | Valor |
|---|---|
| `DASHBOARD_URL` | URL del dashboard, sin barra final |
| `DASHBOARD_EMAIL` | correo de la cuenta de solo lectura (rol Lector) |
| `DASHBOARD_PASSWORD` | su contraseña |

Sin credenciales, el paso no modifica el archivo existente y la web muestra un aviso en la sección de cobertura. Variables opcionales: `HECHOS_DIAS` (ventana, 45 por defecto) y `HECHOS_MAX` (tope de hechos, 1500).

También puede generarse una muestra desde una exportación JSON del dashboard: `python3 scripts/sincronizar_hechos.py --semilla exportacion.json` (la web la marca como «muestra»).

### 3. Protestas · `scripts/actualizar_datos.py`

Robot horario del mapa de protestas (GDELT y, opcionalmente, ACLED). Ver la sección **Observatorio de protestas** más abajo.

## Cómo ejecutarla en local

```bash
python3 -m http.server 8000
# o
npx serve .
```

Abrir <http://localhost:8000>. Los módulos ES no funcionan abriendo los `.html` directamente desde el disco. Para probar los robots: `python3 scripts/actualizar_indicadores.py --solo wb` (necesita salida a internet).

## Cómo desplegarla en GitHub Pages

1. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
2. Ejecutar una vez a mano los workflows **Actualizar indicadores OITraF** y **Actualizar datos de protestas** (pestaña Actions). Los robots programados solo corren desde la rama por defecto.
3. Cargar los secretos del dashboard para activar la cobertura de medios.
4. La web queda en `https://<usuario>.github.io/<repositorio>/`.

## Estructura del proyecto

```
.
├── index.html                 # portal OITraF
├── indicadores.html           # explorador de todas las series
├── protestas.html             # mapa de protestas (GDELT)
├── img/marca/                 # marca OITraF: isotipo coloreado en capas (red + engranaje) para la animación, logos horizontal/vertical, favicon
├── css/
│   ├── oitraf.css             # identidad OITraF (marino + rojo), tokens claro/oscuro, paleta de gráficos validada
│   └── style.css              # estilos del mapa de protestas
├── js/
│   ├── oitraf/
│   │   ├── comun.js           # tema, formato es-AR, catálogo de series, indicadores derivados, CSV
│   │   ├── graficos.js        # líneas, barras, columnas, minigráficos y tablas (SVG, sin dependencias)
│   │   ├── portada.js         # secciones del portal
│   │   └── indicadores.js     # explorador
│   ├── app.js, nombres-es.js, sources/   # mapa de protestas
├── scripts/
│   ├── actualizar_indicadores.py
│   ├── sincronizar_hechos.py
│   └── actualizar_datos.py
├── data/
│   ├── indicadores.json       # series oficiales (lo genera el robot)
│   ├── indicadores/           # estado por fuente y catálogo de datos.gob.ar
│   ├── hechos.json            # cobertura de medios (lo genera el robot con credenciales)
│   ├── protests.json, articles.json, traducciones.json, dias/   # protestas
└── .github/workflows/
    ├── actualizar-indicadores.yml
    └── actualizardatos (1).yml
```

## Accesibilidad y visualización

- Identidad OITraF: isotipo oficial coloreado (los tres circuitos de la red se encienden por turnos y el engranaje gira detrás del corte, `img/marca/`, medidas en `isotipo.json`), wordmark en Open Sans (equivalente libre de la tipografía del logo). El giro se desactiva con `prefers-reduced-motion`. Tema claro y oscuro (botón y preferencia del sistema), paleta categórica y rampa secuencial validadas para daltonismo y contraste en ambos modos.
- Cada gráfico tiene vista de tabla, tooltip con todas las series al pasar el puntero y navegación por teclado (flechas) en los de líneas; nunca hay dos ejes en un mismo gráfico.
- Los textos de los hechos y las etiquetas de datos se insertan con `textContent`, nunca como HTML.

## Observatorio de protestas

Mapa interactivo que monitorea los **eventos de protesta social en todo el mundo** con datos abiertos de [GDELT](https://www.gdeltproject.org/): un robot horario descarga los ficheros de eventos de GDELT 2.0, filtra los eventos de protesta (código CAMEO 14, con coordenadas reales) y guarda `data/protests.json` y `data/articles.json`. La página ofrece mapa (Leaflet), resumen, cobertura reciente traducida al español, filtros por período y palabra clave, vista de tabla y gráfico de evolución diaria.

⚠️ GDELT detecta eventos automáticamente en las noticias: es excelente para tendencias y focos, pero no es un recuento verificado a mano.

**ACLED (opcional)**: base académica de eventos verificados a mano. Crear cuenta en <https://acleddata.com/> y cargar los secretos `ACLED_USERNAME` y `ACLED_PASSWORD`; el robot guarda `data/acled.json` y la web muestra un selector GDELT/ACLED.

## Licencias de los datos

Banco Mundial, OIT, datos.gob.ar y Eurostat publican bajo CC BY 4.0; BLS es dominio público; FMI y OCDE permiten el uso con atribución; GDELT es de uso libre con atribución. Cada placa y cada serie enlazan al organismo que publica el dato.
