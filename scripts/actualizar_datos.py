"""
Robot de datos del Observatorio de Protestas Sociales.

Lo ejecuta GitHub Actions cada hora (.github/workflows/actualizar-datos.yml):
descarga los ficheros de eventos crudos de GDELT 2.0, filtra los eventos de
protesta (código CAMEO raíz 14, con coordenadas) y publica:
  - data/protests.json  -> focos agregados por lugar y día (para el mapa)
  - data/articles.json  -> artículos recientes de la DOC 2.0 API
  - data/dias/*.json    -> caché de días completos (evita re-descargas)
"""
import io, json, os, time, urllib.request, zipfile
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
def pedir_articulos(query):
    url = (f"{DOC_API}?query={urllib.request.quote(query)}"
           "&mode=artlist&format=json&maxrecords=250&sort=datedesc&timespan=7d")
    data = json.loads(fetch(url).decode("utf-8", "replace"))
    return data.get("articles") or []

articulos = []
try:
    articulos = pedir_articulos("theme:PROTEST")
except Exception as err:
    print("artlist theme:PROTEST falló:", err)
if not articulos:
    time.sleep(6)
    try:
        articulos = pedir_articulos('protest OR protesta OR manifestacion OR "manifestation"')
    except Exception as err:
        print("artlist alternativo falló:", err)

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

if articulos:
    traducir_titulares(articulos)
    with open("data/articles.json", "w") as f:
        json.dump({"generated": salida["generated"], "articles": articulos},
                  f, ensure_ascii=False)
    print(f"articles.json: {len(articulos)} artículos")
else:
    print("Sin artículos nuevos; se conserva el archivo anterior si existe")

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
