"""
Robot de datos del Observatorio de Protestas Sociales.

Lo ejecuta GitHub Actions cada hora (.github/workflows/actualizar-datos.yml):
descarga los ficheros de eventos crudos de GDELT 2.0, filtra los eventos de
protesta (código CAMEO raíz 14, con coordenadas) y publica:
  - data/protests.json  -> focos agregados por lugar y día (para el mapa)
  - data/articles.json  -> artículos recientes de la DOC 2.0 API
  - data/dias/*.json    -> caché de días completos (evita re-descargas)
"""
import io, json, os, re, time, unicodedata, urllib.error, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

VENTANA_DIAS = 7
MAX_FOCOS = 1500
BASE = "http://data.gdeltproject.org/gdeltv2/"
DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
UA = {"User-Agent": "ObservatorioProtestas/1.0 (+github.com pages project)"}

def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

# Columnas del formato de eventos GDELT 2.0 (61 columnas, separadas por tab):
# 28 EventRootCode ("14" = protesta), 33 NumArticles, 52 ActionGeo_FullName,
# 53 ActionGeo_CountryCode, 56 lat, 57 lon, 60 SOURCEURL
def parsear_zip(blob, agg):
    try:
        zf = zipfile.ZipFile(io.BytesIO(blob))
        texto = zf.read(zf.namelist()[0]).decode("utf-8", "replace")
    except Exception:
        return
    for linea in texto.split("\n"):
        c = linea.split("\t")
        if len(c) < 61 or c[28] != "14":
            continue
        try:
            lat, lon = float(c[56]), float(c[57])
        except ValueError:
            continue
        nombre = c[52] or "Lugar sin nombre"
        clave = f"{nombre}|{round(lat, 2)}|{round(lon, 2)}"
        e = agg.setdefault(clave, {"name": nombre, "cc": c[53],
                                   "lat": round(lat, 3), "lon": round(lon, 3),
                                   "n": 0, "art": 0, "url": ""})
        e["n"] += 1
        try:
            e["art"] += int(c[33] or 0)
        except ValueError:
            pass
        if c[60]:
            e["url"] = c[60]

def franjas(dia_inicio, fin):
    # Marcas de tiempo de 15 min: 000000, 001500, 003000...
    t, out = dia_inicio, []
    tope = min(dia_inicio + timedelta(days=1), fin)
    while t < tope:
        out.append(t.strftime("%Y%m%d%H%M%S"))
        t += timedelta(minutes=15)
    return out

def agregar_dia(dia_inicio, fin, ruta_cache, es_completo):
    if es_completo and os.path.exists(ruta_cache):
        with open(ruta_cache) as f:
            return json.load(f)
    agg, urls = {}, []
    for ts in franjas(dia_inicio, fin):
        urls.append(f"{BASE}{ts}.export.CSV.zip")
        urls.append(f"{BASE}{ts}.translation.export.CSV.zip")
    ok = 0
    def bajar(u):
        nonlocal ok
        try:
            blob = fetch(u)
            ok += 1
            return blob
        except Exception:
            return None
    with ThreadPoolExecutor(max_workers=12) as pool:
        for blob in pool.map(bajar, urls):
            if blob:
                parsear_zip(blob, agg)
    datos = list(agg.values())
    print(f"{dia_inicio:%Y%m%d}: {ok}/{len(urls)} ficheros, {len(datos)} focos")
    if es_completo:
        os.makedirs(os.path.dirname(ruta_cache), exist_ok=True)
        with open(ruta_cache, "w") as f:
            json.dump(datos, f)
    return datos

# Los ficheros se publican con unos minutos de retraso
ahora = datetime.now(timezone.utc) - timedelta(minutes=20)
dias, focos = [], {}
for i in range(VENTANA_DIAS - 1, -1, -1):
    d = ahora - timedelta(days=i)
    ymd = d.strftime("%Y%m%d")
    dias.append(ymd)
    inicio = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    filas = agregar_dia(inicio, ahora, f"data/dias/{ymd}.json", es_completo=(i > 0))
    for e in filas:
        clave = f"{e['name']}|{e['lat']}|{e['lon']}"
        foco = focos.setdefault(clave, {"name": e["name"], "cc": e.get("cc", ""),
                                        "lat": e["lat"], "lon": e["lon"],
                                        "url": "", "days": {}})
        foco["days"][ymd] = [e["n"], e.get("art", 0)]
        if e.get("url"):
            foco["url"] = e["url"]

lista = sorted(focos.values(),
               key=lambda l: -sum(v[0] for v in l["days"].values()))[:MAX_FOCOS]
os.makedirs("data", exist_ok=True)
salida = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
          "window_days": VENTANA_DIAS, "days": dias, "locations": lista}
with open("data/protests.json", "w") as f:
    json.dump(salida, f, ensure_ascii=False)
print(f"protests.json: {len(lista)} focos en {len(dias)} días")

# Borra cachés de días fuera de la ventana
if os.path.isdir("data/dias"):
    for fichero in os.listdir("data/dias"):
        if fichero.endswith(".json") and fichero[:-5] not in dias:
            os.remove(os.path.join("data/dias", fichero))

# ---- Artículos recientes (DOC 2.0 API: máx. 1 petición cada 5 s) ----
# Los runners de GitHub comparten direcciones IP, así que la API responde
# 429 (Too Many Requests) con frecuencia: cada consulta se reintenta con
# esperas crecientes y el resultado de cada una queda en
# data/articulos_estado.json (fecha, cantidad por consulta y error).
ESTADO_ARTICULOS = "data/articulos_estado.json"
ESPERA_ENTRE_CONSULTAS = 20
REINTENTOS = (30, 60, 90)   # segundos de espera antes de cada reintento

def pedir_articulos(query):
    url = (f"{DOC_API}?query={urllib.request.quote(query)}"
           "&mode=artlist&format=json&maxrecords=250&sort=datedesc&timespan=7d")
    ultimo_error = None
    for intento, espera in enumerate((0,) + REINTENTOS):
        if espera:
            time.sleep(espera)
        try:
            crudo = fetch(url).decode("utf-8", "replace")
            data = json.loads(crudo) if crudo.strip() else {}
            return data.get("articles") or [], None
        except Exception as err:
            ultimo_error = f"{type(err).__name__}: {err}"
            if not (isinstance(err, urllib.error.HTTPError) and err.code in (429, 500, 502, 503, 504)) \
               and not isinstance(err, (urllib.error.URLError, TimeoutError, json.JSONDecodeError)):
                break
    return [], ultimo_error

# Consultas complementarias (la API limita a 250 resultados por consulta):
# por tema (PROTEST y STRIKE), por idioma de origen y por palabras clave. La
# etiqueta PROTEST de GDELT es generosa y trae mucho ruido, así que después
# se filtra por el titular (ver más abajo).
CONSULTAS = [
    "theme:PROTEST",
    "theme:STRIKE",
    "theme:PROTEST sourcelang:spanish",
    "theme:PROTEST sourcelang:portuguese",
    '(protesta OR protestas OR manifestacion OR manifestantes OR huelga OR cacerolazo OR "paro nacional")',
    '(protest OR protesters OR demonstrators OR demonstration OR "general strike" OR riots)',
]
articulos, urls_vistas = [], set()
estado_consultas = []
for i, consulta in enumerate(CONSULTAS):
    if i:
        time.sleep(ESPERA_ENTRE_CONSULTAS)
    recibidos, error = pedir_articulos(consulta)
    nuevos = 0
    for a in recibidos:
        u = a.get("url")
        if u and u not in urls_vistas:
            urls_vistas.add(u)
            articulos.append(a)
            nuevos += 1
    estado_consultas.append({"consulta": consulta, "crudos": len(recibidos), "nuevos": nuevos, "error": error})
    print(f"consulta {i + 1}: {len(recibidos)} crudos, {nuevos} nuevos" + (f" | error: {error}" if error else ""))
print(f"artículos crudos recibidos: {len(articulos)}")

# Artículos de la corrida anterior que siguen dentro de la ventana de 7 días:
# se conservan para que un 429 o una consulta floja no vacíe la cobertura.
def cargar_previos():
    try:
        with open("data/articles.json") as f:
            previos = json.load(f).get("articles") or []
    except Exception:
        return []
    limite = (datetime.now(timezone.utc) - timedelta(days=VENTANA_DIAS)).strftime("%Y%m%dT%H%M%SZ")
    return [a for a in previos if a.get("url") and (a.get("seendate") or "") >= limite]

previos = [a for a in cargar_previos() if a["url"] not in urls_vistas]
nuevos_crudos = len(articulos)
articulos.extend(previos)
print(f"artículos previos conservados: {len(previos)}")

# ---- Traducción de titulares al español ----
# La cobertura es de medios de todo el mundo, en cualquier idioma; el titular
# se traduce al español (endpoint público de Google Translate) y se guarda en
# el campo "title_es". Una caché (data/traducciones.json, clave = URL del
# artículo) evita retraducir cada hora los titulares ya conocidos.
TRAD_CACHE = "data/traducciones.json"

def traducir_texto(texto):
    url = ("https://translate.googleapis.com/translate_a/single"
           "?client=gtx&sl=auto&tl=es&dt=t&q=" + urllib.request.quote(texto))
    data = json.loads(fetch(url, timeout=20).decode("utf-8", "replace"))
    return "".join(s[0] for s in (data[0] or []) if s and s[0]).strip()

def traducir_titulares(articulos):
    try:
        with open(TRAD_CACHE) as f:
            cache = json.load(f)
    except Exception:
        cache = {}
    pendientes = []
    for a in articulos:
        titulo = (a.get("title") or "").strip()
        if not titulo:
            continue
        if (a.get("language") or "").lower() == "spanish":
            a["title_es"] = titulo
            continue
        clave = a.get("url") or titulo
        if cache.get(clave):
            a["title_es"] = cache[clave]
        else:
            pendientes.append((a, clave, titulo))

    def traducir(item):
        _, _, titulo = item
        try:
            return traducir_texto(titulo)
        except Exception:
            return ""

    with ThreadPoolExecutor(max_workers=4) as pool:
        for (a, clave, titulo), traduccion in zip(pendientes, pool.map(traducir, pendientes)):
            if traduccion:
                a["title_es"] = traduccion
                cache[clave] = traduccion

    # la caché solo conserva los artículos de la ventana actual
    actuales = {a.get("url") or (a.get("title") or "") for a in articulos}
    cache = {k: v for k, v in cache.items() if k in actuales}
    with open(TRAD_CACHE, "w") as f:
        json.dump(cache, f, ensure_ascii=False)
    con_es = sum(1 for a in articulos if a.get("title_es"))
    print(f"titulares traducidos al español: {con_es}/{len(articulos)}"
          f" ({len(pendientes)} nuevos en esta pasada)")

# ---- Solo noticias de protesta ----
# GDELT etiqueta un artículo como PROTEST aunque la protesta se mencione de
# pasada en el cuerpo del texto; aquí se conservan únicamente los artículos
# cuyo TITULAR (traducido u original) habla de protestas.
PATRON_PROTESTA = re.compile(
    # español (titular traducido)
    r"protest|manifesta|huelga|huelguista|\bmarchas?\b|marcharon|disturbio|revuelta|\bmotin|amotinad|"
    r"movilizac|se movilizan?\b|cacerolazo|piquete|\bplanton|\bparos?\b|cortes? de ruta|bloqueo|"
    r"represion|pancarta|toman? las calles|sal(en|ieron|io) a las? calles?|levantamiento|"
    r"acampe|ocupan|sentada|boicot|concentracion (de|frente|contra)|rebeli|sublevaci|activistas?|"
    r"gas(es)? lacrimogen|detenid[oa]s (en|durante|tras) (la|una|el) (protesta|marcha|manifesta)|"
    # inglés y otros idiomas (titular original)
    r"demonstrat|\brall(y|ies)\b|\briots?\b|unrest|uprising|walkout|sit-in|picket|blockade|boycott|"
    r"tear gas|crackdown|dispers|mobili[sz]|"
    r"\bstrik(e|es|ers|ing)\b|clash(es|ed)? with|take to the streets|took to the streets|"
    r"greve|sciopero|streik|protesto|manifestazione|manifestacao|manifestation|manifestant")
# falsos positivos frecuentes: huelga/strike de otro significado
PATRON_EXCLUIR = re.compile(r"air ?strike|drone strike|missile strike|lightning strike|strike (out|zone|price|rate)|"
                            r"paro cardiaco|paro cardiorrespiratorio|puesta en marcha|en marcha|marcha atras")

def normalizar(texto):
    texto = unicodedata.normalize("NFKD", str(texto).lower())
    return "".join(c for c in texto if not unicodedata.combining(c))

def es_noticia_de_protesta(a):
    texto = normalizar((a.get("title_es") or "") + " | " + (a.get("title") or ""))
    texto = PATRON_EXCLUIR.sub(" ", texto)
    return bool(PATRON_PROTESTA.search(texto))

if articulos:
    try:
        traducir_titulares(articulos)
    except Exception as err:
        print("traducción omitida en esta corrida:", err)
    total = len(articulos)
    articulos = [a for a in articulos if es_noticia_de_protesta(a)]
    # la misma noticia llega a veces por varias URLs: una sola por titular
    titulares_vistos = set()
    unicos = []
    for a in articulos:
        t = normalizar(a.get("title_es") or a.get("title") or "")
        if t not in titulares_vistos:
            titulares_vistos.add(t)
            unicos.append(a)
    articulos = unicos
    articulos.sort(key=lambda a: a.get("seendate") or "", reverse=True)
    articulos = articulos[:250]
    print(f"filtro de protestas: {len(articulos)}/{total} artículos conservados")
    with open("data/articles.json", "w") as f:
        json.dump({"generated": salida["generated"], "articles": articulos},
                  f, ensure_ascii=False)
    print(f"articles.json: {len(articulos)} artículos")
else:
    print("Sin artículos nuevos ni previos; se conserva el archivo anterior si existe")

with open(ESTADO_ARTICULOS, "w") as f:
    json.dump({
        "cuando": salida["generated"],
        "consultas": estado_consultas,
        "crudos_nuevos": nuevos_crudos,
        "previos_conservados": len(previos),
        "publicados": len(articulos),
        "errores": sum(1 for c in estado_consultas if c["error"]),
    }, f, ensure_ascii=False, indent=1)

# ---- ACLED (opcional): datos verificados a mano ----
# Requiere los secretos ACLED_USERNAME y ACLED_PASSWORD en el repositorio
# (Settings -> Secrets and variables -> Actions). ACLED publica semanalmente,
# por eso se pide una ventana de 30 dias. API: https://acleddata.com/api-documentation/
# El resultado (o el error exacto) queda siempre en data/acled_estado.json.
import urllib.error
import urllib.parse

VENTANA_ACLED = 30
usuario_acled = os.environ.get("ACLED_USERNAME", "").strip()
clave_acled = os.environ.get("ACLED_PASSWORD", "").strip()
estado_acled = ""

if not usuario_acled or not clave_acled:
    estado_acled = "omitido: faltan los secretos ACLED_USERNAME/ACLED_PASSWORD"
else:
    try:
        cuerpo = urllib.parse.urlencode({
            "username": usuario_acled, "password": clave_acled,
            "grant_type": "password", "client_id": "acled", "scope": "authenticated",
        }).encode()
        peticion = urllib.request.Request(
            "https://acleddata.com/oauth/token", data=cuerpo,
            headers={**UA, "Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(peticion, timeout=60) as r:
            token = json.loads(r.read().decode())["access_token"]

        desde = (ahora - timedelta(days=VENTANA_ACLED - 1)).strftime("%Y-%m-%d")
        params = urllib.parse.urlencode({
            "event_type": "Protests",
            "event_date": desde, "event_date_where": ">=",
            "limit": "10000",
            "fields": "event_date|latitude|longitude|location|country|source_url",
        })
        peticion = urllib.request.Request(
            f"https://acleddata.com/api/acled/read?{params}",
            headers={**UA, "Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(peticion, timeout=180) as r:
            eventos_acled = json.loads(r.read().decode()).get("data") or []

        dias_acled = [(ahora - timedelta(days=i)).strftime("%Y%m%d")
                      for i in range(VENTANA_ACLED - 1, -1, -1)]
        focos_acled = {}
        for e in eventos_acled:
            try:
                lat, lon = float(e["latitude"]), float(e["longitude"])
            except (KeyError, TypeError, ValueError):
                continue
            ymd = (e.get("event_date") or "").replace("-", "")
            if len(ymd) != 8:
                continue
            nombre = ", ".join(x for x in (e.get("location"), e.get("country")) if x) or "Lugar sin nombre"
            clave_f = f"{nombre}|{round(lat, 2)}|{round(lon, 2)}"
            foco = focos_acled.setdefault(clave_f, {"name": nombre, "cc": e.get("country", ""),
                                                    "lat": round(lat, 3), "lon": round(lon, 3),
                                                    "url": "", "days": {}})
            v = foco["days"].setdefault(ymd, [0, 0])
            v[0] += 1
            if e.get("source_url"):
                foco["url"] = str(e["source_url"]).split(";")[0].strip()

        lista_acled = sorted(focos_acled.values(),
                             key=lambda l: -sum(v[0] for v in l["days"].values()))[:MAX_FOCOS]
        with open("data/acled.json", "w") as f:
            json.dump({"generated": salida["generated"], "window_days": VENTANA_ACLED,
                       "days": dias_acled, "locations": lista_acled}, f, ensure_ascii=False)
        estado_acled = f"ok: {len(lista_acled)} focos a partir de {len(eventos_acled)} eventos verificados"
    except Exception as err:
        detalle = str(err)
        if isinstance(err, urllib.error.HTTPError):
            try:
                detalle += " | respuesta: " + err.read().decode("utf-8", "replace")[:300]
            except Exception:
                pass
        estado_acled = f"error: {detalle}"

print("ACLED ->", estado_acled)
with open("data/acled_estado.json", "w") as f:
    json.dump({"cuando": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "estado": estado_acled}, f, ensure_ascii=False)
