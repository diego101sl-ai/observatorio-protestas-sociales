# OITraF · Observatorio Internacional del Trabajo del Futuro

Sitio web del **OITraF** con los indicadores del mercado laboral de Argentina, América Latina y el mundo tomados de **fuentes oficiales** (institutos de estadística, ministerios y organismos multilaterales), la **cobertura diaria de 24 medios** relevada por el equipo en el dashboard *Algoritmo Inteligente · Seguimiento de Medios*, y el **observatorio de protestas sociales** (mapa mundial con datos de GDELT).

Es una web 100 % estática: no necesita servidor ni base de datos. Dos robots (GitHub Actions) descargan los datos y los guardan como JSON dentro del repositorio; las páginas solo leen esos archivos.

## Páginas

| Página | Qué muestra |
|---|---|
| `index.html` | Portal: placas de indicadores de **Argentina**, **América Latina** y **Mundo** (número grande, período de referencia, variación, minigráfico y fuente), gráficos comparados, **cobertura de medios** filtrable por escala y sector, resumen del observatorio de protestas y tabla de **fuentes y método**. |
| `indicadores.html` | Explorador de **todas las series**: filtros por escala, país, tema y fuente; búsqueda; comparación por geografía; cada serie con gráfico, tabla, descarga CSV y enlace al organismo. |
| `protestas.html` | Mapa mundial de protestas (GDELT) con la misma cabecera, tipografía y pie que el portal; filtros de período y palabra clave, cobertura traducida al español, gráfico diario y vista de tabla. |

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

Sin credenciales, el paso no modifica el archivo existente y la web muestra un aviso en la sección de cobertura. Variables opcionales: `HECHOS_DIAS` (ventana, 45 por defecto), `HECHOS_MAX` (tope de hechos, 4000) y `HECHOS_SECTORES` (sectores que se publican en la web; por defecto `TRABAJADORES,AGRO,INDUSTRIA`, el resto del relevamiento queda reservado a suscriptores).

También puede cargarse una exportación del dashboard sin credenciales:

- `python3 scripts/sincronizar_hechos.py --markdown Relevamiento_AlgoritmoInteligente_AAAA-MM-DD.md` importa la exportación Markdown del dashboard (una sección `## UR` por hecho, con línea de metadatos, resumen y enlaces). El sector se toma del campo exportado o, si falta, se infiere del eje; la web lo marca como «exportación».
- `python3 scripts/sincronizar_hechos.py --semilla exportacion.json` genera una muestra desde una exportación JSON (la web la marca como «muestra»).

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
│   └── style.css              # solo lo específico del mapa de protestas (ticker, filtros, mapa, leyenda, tabla, Leaflet)
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

Mapa interactivo (teselas de OpenStreetMap, sin clave de API) que monitorea los **eventos de protesta social en todo el mundo** con datos abiertos de [GDELT](https://www.gdeltproject.org/): un robot horario descarga los ficheros de eventos de GDELT 2.0, filtra los eventos de protesta (código CAMEO 14, con coordenadas reales) y guarda `data/protests.json` y `data/articles.json`. La página ofrece mapa (Leaflet), resumen, cobertura reciente traducida al español, filtros por período y palabra clave, vista de tabla y gráfico de evolución diaria.

⚠️ GDELT detecta eventos automáticamente en las noticias: es excelente para tendencias y focos, pero no es un recuento verificado a mano.

**ACLED (opcional)**: base académica de eventos verificados a mano. Crear cuenta en <https://acleddata.com/> y cargar los secretos `ACLED_USERNAME` y `ACLED_PASSWORD`; el robot guarda `data/acled.json` y la web muestra un selector GDELT/ACLED.

## Suscripción y contacto

La portada tiene un formulario de **suscripción** (informes, ediciones especiales y relevamiento completo) y otro de **contacto para estudios a medida** (sindicatos, gobiernos, universidades, medios y organizaciones). Como el sitio es estático, los envíos van a un servicio de formularios que se configura en `js/oitraf/config.js`:

1. Crear una cuenta en [Formspree](https://formspree.io) con el correo institucional y un formulario para cada uso («Suscripción» y «Contacto»).
2. Pegar las dos URL de envío (`https://formspree.io/f/…`) en `CONTACTO.suscripcion.url` y `CONTACTO.contacto.url`; los dos valores que faltan están marcados con `FALTA` en el archivo.
3. Publicar. Mientras una URL esté vacía o el servicio falle, el formulario muestra el estado (enviando, enviado, error con reintento) y abre el programa de correo del visitante con el mensaje redactado hacia `CONTACTO.email`.

La política de seguridad de contenido de `index.html` autoriza únicamente `https://formspree.io` en `connect-src` y `form-action`. Si se prefiere Web3Forms, hay que cargar su URL y la `access_key` en `clave` y agregar `https://api.web3forms.com` a esas dos directivas.

Ambos formularios exigen consentimiento para el uso de los datos, llevan un campo trampa contra robots y la política de seguridad de contenido solo autoriza esos dos dominios de envío. La lista de suscriptores queda en el servicio elegido (o en el correo); para enviar boletines conviene volcarla a una herramienta de correo masivo.

## Seguridad y autoría

- **Política de seguridad de contenido** (`Content-Security-Policy` por `<meta>`, ya que GitHub Pages no permite cabeceras HTTP propias): solo scripts propios, estilos propios y de Google Fonts, imágenes propias (más las teselas de OpenStreetMap en el mapa); sin `eval`, sin objetos embebidos, sin envío de formularios a terceros. Referrer restringido y protección contra incrustación en marcos ajenos.
- **Atribución automática al copiar** (`js/oitraf/proteccion.js`): todo fragmento de más de 60 caracteres copiado desde el sitio llega al portapapeles con la fuente, la URL, la fecha de consulta y la licencia, en texto plano y en HTML con enlace. No se bloquean la selección ni el clic derecho, por accesibilidad.
- **Marca en gráficos y descargas**: los gráficos llevan la marca OITraF; los CSV, dos líneas de atribución en el encabezado más la columna `fuente` de cada dato; los JSON del robot, los campos `publicado_por` y `licencia`.
- **Licencia y cita**: `LICENCIA.md` (CC BY 4.0 para las elaboraciones propias; los datos oficiales conservan la suya), bloque «Cómo citar» en la portada con cita sugerida copiable, metadatos `copyright`, `rel="license"`, Open Graph y JSON-LD (schema.org) que declaran a OITraF como autor.
- **Rastreadores**: `robots.txt` permite la indexación y desautoriza a los rastreadores de entrenamiento de IA; `sitemap.xml` con las tres páginas.
- Recomendado en GitHub: activar **Enforce HTTPS** en Pages y proteger la rama `main` (Settings → Branches) para que solo el equipo y los robots puedan publicar.

## Isotipo 3D

Las capas animadas del isotipo (`img/marca/circuito-*.svg` e `img/marca/iso-engranaje*.svg`) se generan con `node scripts/gen3d.mjs` a partir de `scripts/grafo.json`, que describe los nodos, las aristas por color y el perfil del engranaje extraídos del logo original con `node scripts/grafo.mjs`. Las esferas y los tubos llevan sombreado para dar volumen; la geometría es la del logo oficial.

## Licencias de los datos

Banco Mundial, OIT, datos.gob.ar y Eurostat publican bajo CC BY 4.0; BLS es dominio público; FMI y OCDE permiten el uso con atribución; GDELT es de uso libre con atribución. Cada placa y cada serie enlazan al organismo que publica el dato.
