#!/usr/bin/env python3
"""
Robot de indicadores del mercado laboral — OITraF.

Descarga series oficiales de gobiernos y organismos multilaterales y las
normaliza en un único archivo estático (data/indicadores.json) que lee la web.
Corre en GitHub Actions (ver .github/workflows/actualizar-indicadores.yml);
no necesita claves de API ni dependencias fuera de la biblioteca estándar.

Fuentes (cada una se descarga de forma independiente: si una falla, el resto
se publica igual y el estado queda registrado en data/indicadores/estado.json):

  wb        Banco Mundial · Indicadores del Desarrollo Mundial (incluye las
            estimaciones modeladas de la OIT). Anual, ~40 países y agregados.
  ilo       OIT · ILOSTAT (indicadores de corto plazo, trimestral y mensual).
  datosar   Argentina · API de Series de Tiempo de datos.gob.ar (INDEC,
            Secretaría de Trabajo / SIPA, Ministerio de Economía).
  eurostat  Eurostat · desocupación mensual de la UE y la zona euro.
  bls       Estados Unidos · Bureau of Labor Statistics.
  imf       FMI · Perspectivas de la Economía Mundial (WEO), con proyecciones.
  oecd      OCDE · tasas de desocupación armonizadas mensuales.

Uso:  python3 scripts/actualizar_indicadores.py [--solo wb,ilo,...]
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
CARPETA = DATA / "indicadores"
SALIDA = DATA / "indicadores.json"
ESTADO = CARPETA / "estado.json"
CATALOGO_AR = CARPETA / "catalogo_datosgobar.json"

UA = "OITraF-observatorio/1.0 (robot de datos; +https://github.com/diego101sl-ai/observatorio-protestas-sociales)"
HOY = dt.date.today()
ANIO = HOY.year

# ---------------------------------------------------------------------------
# Geografías
# ---------------------------------------------------------------------------
PAISES = {
    "ARG": "Argentina", "BOL": "Bolivia", "BRA": "Brasil", "CHL": "Chile", "COL": "Colombia",
    "CRI": "Costa Rica", "CUB": "Cuba", "DOM": "República Dominicana", "ECU": "Ecuador",
    "SLV": "El Salvador", "GTM": "Guatemala", "HND": "Honduras", "HTI": "Haití", "MEX": "México",
    "NIC": "Nicaragua", "PAN": "Panamá", "PRY": "Paraguay", "PER": "Perú", "URY": "Uruguay",
    "VEN": "Venezuela",
    "USA": "Estados Unidos", "CAN": "Canadá", "CHN": "China", "IND": "India", "JPN": "Japón",
    "KOR": "Corea del Sur", "DEU": "Alemania", "ESP": "España", "FRA": "Francia", "ITA": "Italia",
    "GBR": "Reino Unido", "RUS": "Rusia", "TUR": "Turquía", "ZAF": "Sudáfrica", "NGA": "Nigeria",
    "EGY": "Egipto", "IDN": "Indonesia", "AUS": "Australia", "SAU": "Arabia Saudita",
    # agregados del Banco Mundial
    "WLD": "Mundo", "LCN": "América Latina y el Caribe", "EUU": "Unión Europea", "OED": "OCDE",
    "HIC": "Países de ingreso alto", "UMC": "Países de ingreso medio alto",
    "LMC": "Países de ingreso medio bajo", "LIC": "Países de ingreso bajo",
    "EAS": "Asia oriental y Pacífico", "SAS": "Asia meridional", "SSF": "África subsahariana",
    "MEA": "Oriente Medio y Norte de África", "ECS": "Europa y Asia central", "NAC": "América del Norte",
    # códigos usados por Eurostat / OCDE / FMI
    "EU27_2020": "Unión Europea (27)", "EA21": "Zona euro", "EA20": "Zona euro (20 países)", "OECD": "OCDE", "WEOWORLD": "Mundo",
    "G7": "G7", "G20": "G20",
}
LATAM = ["ARG", "BOL", "BRA", "CHL", "COL", "CRI", "CUB", "DOM", "ECU", "SLV", "GTM", "HND",
         "HTI", "MEX", "NIC", "PAN", "PRY", "PER", "URY", "VEN"]
MUNDO = ["USA", "CAN", "CHN", "IND", "JPN", "KOR", "DEU", "ESP", "FRA", "ITA", "GBR", "RUS",
         "TUR", "ZAF", "NGA", "EGY", "IDN", "AUS", "SAU"]
AGREGADOS_WB = ["WLD", "LCN", "EUU", "OED", "HIC", "UMC", "LMC", "LIC", "EAS", "SAS", "SSF",
                "MEA", "ECS", "NAC"]
# Mapa ISO2 → ISO3 para los agregados, que en la API del Banco Mundial a veces
# vienen sin countryiso3code.
ISO2_WB = {"1W": "WLD", "ZJ": "LCN", "EU": "EUU", "OE": "OED", "XD": "HIC", "XT": "UMC",
           "XN": "LMC", "XM": "LIC", "Z4": "EAS", "8S": "SAS", "ZG": "SSF", "ZQ": "MEA",
           "Z7": "ECS", "XU": "NAC"}


def escala_de(geo: str) -> str:
    if geo == "ARG":
        return "Nacional"
    if geo in LATAM or geo == "LCN":
        return "Latinoamericana"
    return "Internacional"


def nombre_geo(geo: str) -> str:
    return PAISES.get(geo, geo)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
def http_get(url: str, *, timeout: int = 90, headers: dict | None = None, data: bytes | None = None,
             reintentos: int = 3) -> bytes:
    """GET (o POST si hay data) con reintentos y espera exponencial."""
    ultimo: Exception | None = None
    for intento in range(reintentos):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            ultimo = e
            # 4xx que no sea 429: no vale la pena reintentar
            if 400 <= e.code < 500 and e.code != 429:
                raise
        except Exception as e:  # noqa: BLE001
            ultimo = e
        time.sleep(2 * (intento + 1))
    assert ultimo is not None
    raise ultimo


def http_json(url: str, **kw):
    return json.loads(http_get(url, **kw).decode("utf-8", "replace"))


def http_csv(url: str, **kw) -> list[dict]:
    texto = http_get(url, **kw).decode("utf-8-sig", "replace")
    return list(csv.DictReader(io.StringIO(texto)))


# ---------------------------------------------------------------------------
# Modelo de salida
# ---------------------------------------------------------------------------
FUENTES = {
    "wb": {
        "nombre": "Banco Mundial · Indicadores del Desarrollo Mundial",
        "organismo": "Banco Mundial (incluye estimaciones modeladas de la OIT)",
        "tipo": "multilateral",
        "url": "https://datos.bancomundial.org/",
        "api": "https://api.worldbank.org/v2/",
        "licencia": "CC BY 4.0",
    },
    "ilo": {
        "nombre": "OIT · ILOSTAT",
        "organismo": "Organización Internacional del Trabajo",
        "tipo": "multilateral",
        "url": "https://ilostat.ilo.org/es/data/",
        "api": "https://rplumber.ilo.org/",
        "licencia": "CC BY 4.0",
    },
    "datosar": {
        "nombre": "datos.gob.ar · Series de Tiempo (INDEC, Secretaría de Trabajo, Ministerio de Economía)",
        "organismo": "Gobierno de la República Argentina",
        "tipo": "gobierno",
        "url": "https://datos.gob.ar/series/api/",
        "api": "https://apis.datos.gob.ar/series/api/",
        "licencia": "CC BY 4.0",
    },
    "eurostat": {
        "nombre": "Eurostat",
        "organismo": "Comisión Europea",
        "tipo": "multilateral",
        "url": "https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table",
        "api": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/",
        "licencia": "CC BY 4.0",
    },
    "bls": {
        "nombre": "Bureau of Labor Statistics",
        "organismo": "Gobierno de los Estados Unidos",
        "tipo": "gobierno",
        "url": "https://www.bls.gov/data/",
        "api": "https://api.bls.gov/publicAPI/v2/",
        "licencia": "Dominio público",
    },
    "imf": {
        "nombre": "FMI · Perspectivas de la Economía Mundial (WEO)",
        "organismo": "Fondo Monetario Internacional",
        "tipo": "multilateral",
        "url": "https://www.imf.org/external/datamapper/",
        "api": "https://www.imf.org/external/datamapper/api/v1/",
        "licencia": "Uso con atribución",
    },
    "oecd": {
        "nombre": "OCDE · Data Explorer",
        "organismo": "Organización para la Cooperación y el Desarrollo Económicos",
        "tipo": "multilateral",
        "url": "https://data-explorer.oecd.org/",
        "api": "https://sdmx.oecd.org/public/rest/",
        "licencia": "Uso con atribución",
    },
}

# Temas: agrupan indicadores equivalentes de distintas fuentes para que la web
# pueda ofrecer «la desocupación» sin importar de dónde salga la serie.
TEMAS = {
    "desocupacion": "Desocupación",
    "desocupacion_juvenil": "Desocupación juvenil",
    "actividad": "Tasa de actividad",
    "actividad_mujeres": "Actividad femenina",
    "actividad_varones": "Actividad masculina",
    "empleo": "Tasa de empleo",
    "subocupacion": "Subocupación",
    "informalidad": "Informalidad",
    "empleo_vulnerable": "Empleo vulnerable",
    "cuenta_propia": "Cuenta propia",
    "asalariados": "Asalariados",
    "nini": "Jóvenes que no estudian ni trabajan",
    "productividad": "Productividad laboral",
    "fuerza_laboral": "Fuerza laboral",
    "empleo_registrado": "Empleo registrado",
    "empleo_sector": "Empleo por sector",
    "salarios": "Salarios",
    "salario_minimo": "Salario mínimo",
    "precios": "Precios",
    "canasta": "Canasta básica",
    "pobreza": "Pobreza",
    "desigualdad": "Desigualdad",
    "actividad_economica": "Actividad económica",
}

series: list[dict] = []
estado: dict[str, dict] = {}


def agregar(*, fuente: str, codigo: str, tema: str, nombre: str, descripcion: str, unidad: str,
            frecuencia: str, geo: str, puntos: list[tuple[str, float]], url: str,
            geo_nombre: str | None = None, proyeccion_desde: str | None = None,
            nota: str | None = None, ajuste: str | None = None) -> None:
    limpios: dict[str, float] = {}
    for p, v in puntos:
        if v is None or not p:
            continue
        limpios[str(p)] = float(v)
    puntos = sorted(limpios.items())
    if not proyeccion_desde:
        # Un valor ya legislado o programado para meses futuros (p. ej. el salario
        # mínimo) se conserva en la serie solo si ya empezó a regir.
        puntos = [(p, v) for p, v in puntos if not _es_futuro(p)]
    if not puntos:
        return
    observados = [(p, v) for p, v in puntos if not proyeccion_desde or p[:4] < proyeccion_desde] or puntos
    ultimo = observados[-1]
    anterior = observados[-2] if len(observados) > 1 else None
    # Variación interanual (para mensual/trimestral) o respecto del dato previo.
    interanual = None
    pasos = {"mensual": 12, "trimestral": 4, "semestral": 2, "anual": 1}.get(frecuencia)
    if pasos and len(puntos) > pasos:
        interanual = round(ultimo[1] - puntos[-1 - pasos][1], 3)
    series.append({
        "id": f"{fuente}.{codigo}.{geo}",
        "fuente": fuente,
        "codigo": codigo,
        "tema": tema,
        "nombre": nombre,
        "descripcion": descripcion,
        "unidad": unidad,
        "frecuencia": frecuencia,
        "geo": geo,
        "geo_nombre": geo_nombre or nombre_geo(geo),
        "escala": escala_de(geo),
        "url": url,
        "ultimo": list(ultimo),
        "anterior": list(anterior) if anterior else None,
        "var_interanual": interanual,
        "proyeccion_desde": proyeccion_desde,
        "nota": nota,
        "ajuste": ajuste,
        "serie": [[p, round(v, 4)] for p, v in puntos],
    })


def _inicio_periodo(p: str) -> dt.date | None:
    m = re.match(r"^(\d{4})(?:-(\d{2})|-T(\d)|-S(\d))?$", str(p))
    if not m:
        return None
    anio = int(m.group(1))
    if m.group(2):
        return dt.date(anio, int(m.group(2)), 1)
    if m.group(3):
        return dt.date(anio, (int(m.group(3)) - 1) * 3 + 1, 1)
    if m.group(4):
        return dt.date(anio, 1 if m.group(4) == "1" else 7, 1)
    return dt.date(anio, 1, 1)


def _es_futuro(p: str) -> bool:
    ini = _inicio_periodo(p)
    return bool(ini and ini > HOY)


def registrar(fuente: str, ok: bool, detalle: str = "", n: int = 0, t0: float = 0.0) -> None:
    estado[fuente] = {
        "ok": ok,
        "series": n,
        "detalle": detalle,
        "segundos": round(time.time() - t0, 1) if t0 else None,
        "consultado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    marca = "OK " if ok else "ERR"
    print(f"[{marca}] {fuente}: {n} series. {detalle}".strip())


def numero(x) -> float | None:
    if x is None or x == "":
        return None
    try:
        v = float(str(x).replace(",", "."))
    except ValueError:
        return None
    if v != v:  # NaN
        return None
    return v


def sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


# ---------------------------------------------------------------------------
# 1) Banco Mundial (WDI + estimaciones modeladas OIT)
# ---------------------------------------------------------------------------
WB_INDICADORES = [
    # codigo, tema, nombre, descripcion, unidad
    ("SL.UEM.TOTL.ZS", "desocupacion", "Tasa de desocupación",
     "Personas desocupadas como porcentaje de la fuerza laboral. Estimación modelada de la OIT.", "%"),
    ("SL.UEM.1524.ZS", "desocupacion_juvenil", "Desocupación juvenil (15 a 24 años)",
     "Jóvenes de 15 a 24 años desocupados como porcentaje de la fuerza laboral de esa edad. Estimación modelada de la OIT.", "%"),
    ("SL.TLF.CACT.ZS", "actividad", "Tasa de actividad (15 años y más)",
     "Población económicamente activa como porcentaje de la población de 15 años y más. Estimación modelada de la OIT.", "%"),
    ("SL.TLF.CACT.FE.ZS", "actividad_mujeres", "Tasa de actividad femenina",
     "Mujeres activas como porcentaje de la población femenina de 15 años y más. Estimación modelada de la OIT.", "%"),
    ("SL.TLF.CACT.MA.ZS", "actividad_varones", "Tasa de actividad masculina",
     "Varones activos como porcentaje de la población masculina de 15 años y más. Estimación modelada de la OIT.", "%"),
    ("SL.EMP.TOTL.SP.ZS", "empleo", "Tasa de empleo (15 años y más)",
     "Personas ocupadas como porcentaje de la población de 15 años y más. Estimación modelada de la OIT.", "%"),
    ("SL.EMP.VULN.ZS", "empleo_vulnerable", "Empleo vulnerable",
     "Trabajadores por cuenta propia y familiares no remunerados como porcentaje del empleo total. Estimación modelada de la OIT.", "%"),
    ("SL.EMP.SELF.ZS", "cuenta_propia", "Trabajo por cuenta propia",
     "Trabajadores independientes (empleadores, cuenta propia, cooperativistas y familiares) como porcentaje del empleo total.", "%"),
    ("SL.EMP.WORK.ZS", "asalariados", "Asalariados",
     "Trabajadores en relación de dependencia como porcentaje del empleo total. Estimación modelada de la OIT.", "%"),
    ("SL.UEM.NEET.ZS", "nini", "Jóvenes que no estudian ni trabajan",
     "Jóvenes de 15 a 24 años que no estudian, no trabajan ni reciben formación, como porcentaje de la población de esa edad.", "%"),
    ("SL.GDP.PCAP.EM.KD", "productividad", "Productividad laboral",
     "PIB por persona ocupada, en dólares internacionales constantes de 2021 (PPA).", "USD PPA 2021"),
    ("SL.TLF.TOTL.IN", "fuerza_laboral", "Fuerza laboral total",
     "Personas de 15 años y más que ofrecen trabajo (ocupadas y desocupadas). Estimación modelada de la OIT.", "personas"),
    ("SL.AGR.EMPL.ZS", "empleo_sector", "Empleo en agricultura",
     "Porcentaje del empleo total en agricultura, silvicultura y pesca. Estimación modelada de la OIT.", "%"),
    ("SL.IND.EMPL.ZS", "empleo_sector", "Empleo en industria",
     "Porcentaje del empleo total en minería, manufactura, construcción y servicios públicos. Estimación modelada de la OIT.", "%"),
    ("SL.SRV.EMPL.ZS", "empleo_sector", "Empleo en servicios",
     "Porcentaje del empleo total en servicios. Estimación modelada de la OIT.", "%"),
    ("FP.CPI.TOTL.ZG", "precios", "Inflación anual (IPC)",
     "Variación anual del índice de precios al consumidor.", "%"),
    ("NY.GDP.MKTP.KD.ZG", "actividad_economica", "Crecimiento del PIB",
     "Variación anual del producto interno bruto a precios constantes.", "%"),
    ("SI.POV.NAHC", "pobreza", "Pobreza (línea nacional)",
     "Porcentaje de la población bajo la línea de pobreza nacional de cada país.", "%"),
    ("SI.POV.GINI", "desigualdad", "Índice de Gini",
     "Desigualdad de ingresos: 0 es igualdad perfecta y 100, desigualdad máxima.", "índice"),
]


def descargar_wb() -> None:
    t0 = time.time()
    geos = LATAM + MUNDO + AGREGADOS_WB
    n = 0
    errores = []
    for codigo, tema, nombre, descripcion, unidad in WB_INDICADORES:
        url = (f"https://api.worldbank.org/v2/country/{';'.join(geos)}/indicator/{codigo}"
               f"?format=json&per_page=20000&date=2000:{ANIO}")
        try:
            cuerpo = http_json(url)
        except Exception as e:  # noqa: BLE001
            errores.append(f"{codigo}: {e}")
            continue
        if not isinstance(cuerpo, list) or len(cuerpo) < 2 or not cuerpo[1]:
            errores.append(f"{codigo}: respuesta vacía")
            continue
        por_geo: dict[str, list[tuple[str, float]]] = {}
        for obs in cuerpo[1]:
            iso3 = (obs.get("countryiso3code") or "").strip() or ISO2_WB.get((obs.get("country") or {}).get("id", ""), "")
            if not iso3 or iso3 not in PAISES:
                continue
            v = numero(obs.get("value"))
            if v is None:
                continue
            por_geo.setdefault(iso3, []).append((str(obs.get("date")), v))
        for geo, puntos in por_geo.items():
            agregar(fuente="wb", codigo=codigo, tema=tema, nombre=nombre, descripcion=descripcion,
                    unidad=unidad, frecuencia="anual", geo=geo, puntos=puntos,
                    url=f"https://datos.bancomundial.org/indicador/{codigo}?locations={geo}")
            n += 1
        time.sleep(0.3)
    registrar("wb", n > 0, "; ".join(errores)[:600], n, t0)


# ---------------------------------------------------------------------------
# 2) OIT · ILOSTAT (corto plazo: trimestral y mensual)
# ---------------------------------------------------------------------------
ILO_INDICADORES = [
    # id (o lista de ids alternativos), tema, nombre, descripcion, filtros (sex, classif1), frecuencia
    ("EMP_NIFL_SEX_RT_A", "informalidad", "Empleo informal (OIT)",
     "Empleo informal como porcentaje del empleo total, definición armonizada de la OIT sobre las encuestas de hogares de cada país.",
     {"sex": "SEX_T"}, "anual"),
    ("UNE_DEAP_SEX_AGE_RT_Q", "desocupacion", "Tasa de desocupación (trimestral)",
     "Desocupados como porcentaje de la fuerza laboral, total de 15 años y más. Encuestas de hogares de cada país compiladas por la OIT.",
     {"sex": "SEX_T", "classif1": "AGE_YTHADULT_YGE15"}, "trimestral"),
    ("UNE_DEAP_SEX_AGE_RT_M", "desocupacion", "Tasa de desocupación (mensual)",
     "Desocupados como porcentaje de la fuerza laboral, total de 15 años y más. Series mensuales de los institutos de estadística compiladas por la OIT.",
     {"sex": "SEX_T", "classif1": "AGE_YTHADULT_YGE15"}, "mensual"),
    ("UNE_DEAP_SEX_AGE_RT_Q", "desocupacion_juvenil", "Desocupación juvenil (trimestral)",
     "Desocupados de 15 a 24 años como porcentaje de la fuerza laboral de esa edad.",
     {"sex": "SEX_T", "classif1": "AGE_YTHADULT_Y15-24"}, "trimestral"),
    ("EAP_DWAP_SEX_AGE_RT_Q", "actividad", "Tasa de actividad (trimestral)",
     "Fuerza laboral como porcentaje de la población en edad de trabajar (15 años y más).",
     {"sex": "SEX_T", "classif1": "AGE_YTHADULT_YGE15"}, "trimestral"),
    ("EMP_DWAP_SEX_AGE_RT_Q", "empleo", "Tasa de empleo (trimestral)",
     "Ocupados como porcentaje de la población en edad de trabajar (15 años y más).",
     {"sex": "SEX_T", "classif1": "AGE_YTHADULT_YGE15"}, "trimestral"),
    (["TRU_DEMP_SEX_AGE_RT_Q", "TRU_DEMP_SEX_AGE_RT_A"], "subocupacion", "Subocupación horaria",
     "Ocupados que trabajan menos horas de las que quieren y están disponibles para trabajar más, como porcentaje del empleo.",
     {"sex": "SEX_T", "classif1": "AGE_YTHADULT_YGE15"}, "trimestral"),
]
ILO_GEOS = LATAM + ["USA", "CAN", "ESP", "ITA", "DEU", "FRA", "GBR", "JPN", "KOR", "TUR", "ZAF", "AUS"]


def _periodo_ilo(t: str) -> str:
    t = t.strip()
    m = re.match(r"^(\d{4})Q(\d)$", t)
    if m:
        return f"{m.group(1)}-T{m.group(2)}"
    m = re.match(r"^(\d{4})M(\d{1,2})$", t)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    return t


def descargar_ilo() -> None:
    t0 = time.time()
    n = 0
    errores = []
    for ids, tema, nombre, descripcion, filtros, frecuencia in ILO_INDICADORES:
        filas: list[dict] = []
        iid = ""
        for iid in ([ids] if isinstance(ids, str) else ids):
            params = {"id": iid, "ref_area": "+".join(ILO_GEOS), "timefrom": "2010", "format": ".csv", **filtros}
            url = "https://rplumber.ilo.org/data/indicator/?" + urllib.parse.urlencode(params, safe="+")
            try:
                filas = http_csv(url, timeout=180)
            except Exception as e:  # noqa: BLE001
                errores.append(f"{iid}/{filtros.get('classif1', '')}: {e}")
                filas = []
            if filas:
                break
        if not filas:
            continue
        if iid.endswith("_A"):
            frecuencia = "anual"
        elif iid.endswith("_M"):
            frecuencia = "mensual"
        elif iid.endswith("_Q"):
            frecuencia = "trimestral"
        por_geo: dict[str, list[tuple[str, float]]] = {}
        for f in filas:
            geo = (f.get("ref_area") or f.get("REF_AREA") or "").strip()
            if geo not in PAISES:
                continue
            # Por si el servidor ignora los filtros: se vuelven a aplicar acá.
            if filtros.get("sex") and (f.get("sex") or filtros["sex"]) != filtros["sex"]:
                continue
            if filtros.get("classif1") and (f.get("classif1") or filtros["classif1"]) != filtros["classif1"]:
                continue
            v = numero(f.get("obs_value") or f.get("OBS_VALUE"))
            if v is None:
                continue
            por_geo.setdefault(geo, []).append((_periodo_ilo(f.get("time") or f.get("TIME_PERIOD") or ""), v))
        for geo, puntos in por_geo.items():
            agregar(fuente="ilo", codigo=f"{iid}.{filtros.get('classif1', '')}", tema=tema, nombre=nombre,
                    descripcion=descripcion, unidad="%", frecuencia=frecuencia, geo=geo, puntos=puntos,
                    url=f"https://rshiny.ilo.org/dataexplorer/?lang=es&id={iid}")
            n += 1
        time.sleep(0.5)
    registrar("ilo", n > 0, "; ".join(errores)[:600], n, t0)


# ---------------------------------------------------------------------------
# 3) Argentina · datos.gob.ar (Series de Tiempo)
# ---------------------------------------------------------------------------
API_AR = "https://apis.datos.gob.ar/series/api/"

# Cada entrada define cómo encontrar la serie en el catálogo oficial. Si se
# conoce el id se usa directo; si no, se busca por texto y se elige la mejor
# candidata según las palabras obligatorias/prohibidas del título y la
# frecuencia esperada. El robot guarda las candidatas en
# data/indicadores/catalogo_datosgobar.json para poder fijar ids a mano.
AR_SERIES = [
    {
        "clave": "eph_desocupacion", "tema": "desocupacion", "nombre": "Tasa de desocupación (EPH)",
        "descripcion": "Desocupados como porcentaje de la población económicamente activa. Total de 31 aglomerados urbanos, INDEC.",
        "unidad": "%", "frecuencia": "trimestral", "ids": ["42.3_EPH_PUNTUATAL_0_M_30"],
        "buscar": "tasa de desocupación total aglomerados",
        "incluir": ["desocupaci"], "excluir": ["mujer", "varon", "jefe", "años", "gba", "cuyo", "noa", "nea", "pampeana", "patag", "region", "aglomerado de", "gran ", "concordia", "neuquen", "neuquén", "caba", "formosa", "posadas", "salta", "jujuy", "corrientes", "interior"],
        "publicador": "indec",
    },
    {
        "clave": "eph_actividad", "tema": "actividad", "nombre": "Tasa de actividad (EPH)",
        "descripcion": "Población económicamente activa como porcentaje de la población total. Total de 31 aglomerados urbanos, INDEC.",
        "unidad": "%", "frecuencia": "trimestral", "ids": ["43.2_ECTAT_0_T_33", "42.3_EPH_PUNTUATAL_0_M_27"],
        "buscar": "tasa de actividad total aglomerados",
        "incluir": ["actividad"], "excluir": ["mujer", "varon", "jefe", "años", "gba", "cuyo", "noa", "nea", "pampeana", "patag", "region", "aglomerado de", "gran ", "economica", "económica", "emae", "industrial", "construc"],
        "publicador": "indec",
    },
    {
        "clave": "eph_empleo", "tema": "empleo", "nombre": "Tasa de empleo (EPH)",
        "descripcion": "Ocupados como porcentaje de la población total. Total de 31 aglomerados urbanos, INDEC.",
        "unidad": "%", "frecuencia": "trimestral", "ids": ["44.2_ECTET_0_T_30", "42.3_EPH_PUNTUATAL_0_M_24"],
        "buscar": "tasa de empleo total aglomerados",
        "incluir": ["empleo"], "excluir": ["mujer", "varon", "jefe", "años", "gba", "cuyo", "noa", "nea", "pampeana", "patag", "region", "aglomerado de", "gran ", "registrad", "privado", "publico", "público", "sub", "no registrado", "demanda", "expectativ", "índice", "indice"],
        "publicador": "indec",
    },
    {
        "clave": "eph_subocupacion", "tema": "subocupacion", "nombre": "Tasa de subocupación (EPH)",
        "descripcion": "Ocupados que trabajan menos de 35 horas semanales por causas involuntarias y desean trabajar más, como porcentaje de la PEA. Total de 31 aglomerados urbanos, INDEC.",
        "unidad": "%", "frecuencia": "trimestral", "ids": ["46.2_ECTST_0_T_36"],
        "buscar": "tasa de subocupación total aglomerados",
        "incluir": ["subocupaci"], "excluir": ["demandante", "no demandante", "mujer", "varon", "gba", "cuyo", "noa", "nea", "pampeana", "patag", "region", "aglomerado de", "gran "],
        "publicador": "indec",
    },
    {
        "clave": "eph_informalidad", "tema": "informalidad", "nombre": "Asalariados sin descuento jubilatorio (EPH)",
        "descripcion": "Asalariados a los que no se les descuenta aporte jubilatorio, como porcentaje del total de asalariados. Indicador oficial de informalidad laboral, INDEC.",
        "unidad": "%", "frecuencia": "trimestral", "ids": ["52.2_ASDJ_0_0_37"],
        "buscar": "asalariados sin descuento jubilatorio",
        "incluir": ["descuento jubilatorio"], "excluir": ["con descuento", "mujer", "varon", "gba", "cuyo", "noa", "nea", "pampeana", "patag", "region"],
        "publicador": "indec",
    },
    {
        "clave": "sipa_registrados", "tema": "empleo_registrado", "nombre": "Trabajadores registrados (SIPA)",
        "descripcion": "Total de trabajadores con aportes al Sistema Integrado Previsional Argentino, todas las modalidades. Secretaría de Trabajo, Empleo y Seguridad Social.",
        "unidad": "personas", "frecuencia": "mensual", "ids": ["151.1_TL_SIN_TAC_2012_M_15"],
        "buscar": "trabajadores registrados total SIPA",
        "incluir": ["registrad"], "excluir": ["variaci", "índice", "indice", "%", "mujer", "varon", "provincia", "rama"],
        "publicador": "trabajo",
    },
    {
        "clave": "sipa_privados", "tema": "empleo_registrado", "nombre": "Asalariados registrados del sector privado (SIPA)",
        "descripcion": "Asalariados registrados en empresas privadas, sin estacionalidad. Secretaría de Trabajo, Empleo y Seguridad Social.",
        "unidad": "personas", "frecuencia": "mensual", "ids": ["152.1_TL_SIN_EST_2009_M_13"],
        "buscar": "asalariados registrados sector privado desestacionalizado",
        "incluir": ["privado"], "excluir": ["variaci", "índice", "indice", "%", "mujer", "varon", "provincia", "rama", "casas"],
        "publicador": "trabajo",
    },
    {
        "clave": "ripte", "tema": "salarios", "nombre": "RIPTE",
        "descripcion": "Remuneración Imponible Promedio de los Trabajadores Estables, en pesos corrientes. Secretaría de Trabajo, Empleo y Seguridad Social.",
        "unidad": "ARS", "frecuencia": "mensual", "ids": ["158.1_REPTE_0_0_5"],
        "buscar": "RIPTE remuneración imponible promedio",
        "incluir": ["ripte"], "excluir": ["variaci", "%", "índice", "indice"],
        "publicador": "",
    },
    {
        "clave": "smvm", "tema": "salario_minimo", "nombre": "Salario Mínimo, Vital y Móvil",
        "descripcion": "Salario mínimo mensual fijado por el Consejo Nacional del Empleo, la Productividad y el Salario Mínimo, Vital y Móvil (o por resolución de la Secretaría de Trabajo), en pesos corrientes.",
        "unidad": "ARS", "frecuencia": "mensual", "ids": ["57.1_SMVMM_0_M_34"],
        "buscar": "salario mínimo vital y móvil",
        "incluir": ["salario m"], "excluir": ["variaci", "%", "hora", "diario", "jornal"],
        "publicador": "",
    },
    {
        "clave": "ipc_nivel_general", "tema": "precios", "nombre": "IPC nacional (nivel general)",
        "descripcion": "Índice de precios al consumidor, cobertura nacional, nivel general. Base diciembre 2016 = 100, INDEC.",
        "unidad": "índice", "frecuencia": "mensual", "ids": ["148.3_INIVELNAL_DICI_M_26"],
        "buscar": "índice de precios al consumidor nacional nivel general",
        "incluir": ["nivel general"], "excluir": ["variaci", "%", "gba", "region", "núcleo", "nucleo", "regulados", "estacional"],
        "publicador": "indec",
    },
    {
        "clave": "cbt", "tema": "canasta", "nombre": "Canasta Básica Total (adulto equivalente)",
        "descripcion": "Valor mensual de la Canasta Básica Total por adulto equivalente, GBA, en pesos corrientes. Línea de pobreza, INDEC.",
        "unidad": "ARS", "frecuencia": "mensual", "ids": ["150.1_CSTA_BATAL_0_D_20"],
        "buscar": "canasta básica total adulto equivalente",
        "incluir": ["total"], "excluir": ["alimentaria", "variaci", "%", "hogar", "familia"],
        "publicador": "indec",
    },
    {
        "clave": "cba", "tema": "canasta", "nombre": "Canasta Básica Alimentaria (adulto equivalente)",
        "descripcion": "Valor mensual de la Canasta Básica Alimentaria por adulto equivalente, GBA, en pesos corrientes. Línea de indigencia, INDEC.",
        "unidad": "ARS", "frecuencia": "mensual", "ids": ["150.1_CSTA_BARIA_0_D_26"],
        "buscar": "canasta básica alimentaria adulto equivalente",
        "incluir": ["alimentaria"], "excluir": ["variaci", "%", "hogar", "familia"],
        "publicador": "indec",
    },
    {
        "clave": "pobreza_personas", "tema": "pobreza", "nombre": "Pobreza (personas, EPH)",
        "descripcion": "Personas bajo la línea de pobreza como porcentaje de la población de 31 aglomerados urbanos. Semestral, INDEC.",
        "unidad": "%", "frecuencia": "semestral", "ids": ["64.2_POBLACION_NUA_0_0_34_74"], "desfase_semestres": 1,
        "buscar": "pobreza personas total aglomerados",
        "incluir": ["pobreza"], "excluir": ["hogar", "indigen", "gba", "cuyo", "noa", "nea", "pampeana", "patag", "region", "aglomerado de", "gran "],
        "publicador": "indec",
    },
    {
        "clave": "indigencia_personas", "tema": "pobreza", "nombre": "Indigencia (personas, EPH)",
        "descripcion": "Personas bajo la línea de indigencia como porcentaje de la población de 31 aglomerados urbanos. Semestral, INDEC.",
        "unidad": "%", "frecuencia": "semestral", "ids": [],
        "buscar": "indigente continua",
        "incluir": ["indigen", "continua"], "excluir": ["hogar", "gba", "cuyo", "noa", "nea", "pampeana", "patag", "region", "aglomerado", "gran ", "interior", "partidos"],
        "publicador": "indec",
    },
    {
        "clave": "emae", "tema": "actividad_economica", "nombre": "EMAE (desestacionalizado)",
        "descripcion": "Estimador Mensual de Actividad Económica, serie desestacionalizada. Base 2004 = 100, INDEC.",
        "unidad": "índice", "frecuencia": "mensual", "ids": ["143.3_NO_PR_2004_A_31"],
        "buscar": "EMAE desestacionalizado",
        "incluir": ["desestacionaliz"], "excluir": ["variaci", "%", "tendencia", "sector", "rama"],
        "publicador": "indec",
    },
]
FREC_AR = {"R/P1M": "mensual", "R/P3M": "trimestral", "R/P6M": "semestral", "R/P1Y": "anual", "R/P1D": "diaria"}


def _puntuar_candidata(c: dict, spec: dict) -> int:
    campo = c.get("field", {})
    titulo = sin_acentos(campo.get("title", "") + " " + campo.get("description", ""))
    solo_titulo = sin_acentos(campo.get("title", ""))
    pub = sin_acentos(((c.get("dataset") or {}).get("publisher") or {}).get("name", "") + " " + (c.get("dataset") or {}).get("title", ""))
    p = 0
    for w in spec["incluir"]:
        if sin_acentos(w) in titulo:
            p += 10
        else:
            return -999
    for w in spec["excluir"]:
        if sin_acentos(w) in solo_titulo:
            return -999
    if spec.get("publicador") and sin_acentos(spec["publicador"]) in pub:
        p += 5
    if FREC_AR.get(campo.get("frequency", ""), "") == spec["frecuencia"]:
        p += 8
    else:
        p -= 6
    fin = campo.get("time_index_end") or ""
    if fin >= f"{ANIO - 1}":
        p += 6  # serie viva
    elif fin < f"{ANIO - 2}":
        return -999  # serie discontinuada: no sirve para un observatorio en curso
    if "total" in solo_titulo:
        p += 2
    return p


def descargar_datosar() -> None:
    t0 = time.time()
    CARPETA.mkdir(parents=True, exist_ok=True)
    n = 0
    errores = []
    catalogo: dict[str, list] = {}
    for spec in AR_SERIES:
        elegida = None
        candidatas = []
        try:
            r = http_json(API_AR + "search/?" + urllib.parse.urlencode({"q": spec["buscar"], "limit": 60}))
            candidatas = r.get("data", [])
        except Exception as e:  # noqa: BLE001
            errores.append(f"búsqueda {spec['clave']}: {e}")
        puntuadas = sorted(((_puntuar_candidata(c, spec), c) for c in candidatas), key=lambda x: -x[0])
        catalogo[spec["clave"]] = [
            {"puntaje": p, "id": c["field"]["id"], "titulo": c["field"].get("title"),
             "descripcion": c["field"].get("description"), "frecuencia": c["field"].get("frequency"),
             "fin": c["field"].get("time_index_end"), "publicador": ((c.get("dataset") or {}).get("publisher") or {}).get("name")}
            for p, c in puntuadas[:8]
        ]
        ids = list(spec.get("ids") or [])
        if puntuadas and puntuadas[0][0] > 0:
            ids.append(puntuadas[0][1]["field"]["id"])
        for sid in ids:
            try:
                r = http_json(API_AR + "series/?" + urllib.parse.urlencode(
                    {"ids": sid, "format": "json", "limit": 5000, "start_date": "2003-01-01"}))
            except Exception as e:  # noqa: BLE001
                errores.append(f"{spec['clave']} {sid}: {e}")
                continue
            datos = r.get("data") or []
            meta = (r.get("meta") or [None, {}])
            campo = (meta[1] if len(meta) > 1 else {}).get("field", {}) if isinstance(meta, list) else {}
            puntos = []
            for fila in datos:
                if len(fila) < 2:
                    continue
                v = numero(fila[1])
                if v is None:
                    continue
                fecha = str(fila[0])[:10]
                anio, mes = int(fecha[:4]), int(fecha[5:7])
                if spec["frecuencia"] == "trimestral":
                    periodo = f"{anio}-T{(mes - 1) // 3 + 1}"
                elif spec["frecuencia"] == "semestral":
                    # Algunas series semestrales vienen fechadas al cierre del período:
                    # desfase_semestres=1 corre la etiqueta un semestre hacia atrás.
                    sem = 1 if mes <= 6 else 2
                    for _ in range(int(spec.get("desfase_semestres", 0))):
                        sem -= 1
                        if sem == 0:
                            sem, anio = 2, anio - 1
                    periodo = f"{anio}-S{sem}"
                elif spec["frecuencia"] == "anual":
                    periodo = str(anio)
                else:
                    periodo = f"{anio}-{mes:02d}"
                puntos.append((periodo, v))
            if not puntos:
                errores.append(f"{spec['clave']} {sid}: sin datos")
                continue
            maximo = max(v for _, v in puntos)
            unidades_meta = sin_acentos(str(campo.get("units") or ""))
            if spec["unidad"] == "%" and maximo <= 1.0:
                puntos = [(p_, v * 100) for p_, v in puntos]  # proporción → porcentaje
            if spec["unidad"] == "personas" and (maximo < 50000 or "miles" in unidades_meta):
                puntos = [(p_, v * 1000) for p_, v in puntos]  # miles → personas
            elegida = sid
            agregar(fuente="datosar", codigo=spec["clave"], tema=spec["tema"], nombre=spec["nombre"],
                    descripcion=spec["descripcion"], unidad=spec["unidad"], frecuencia=spec["frecuencia"],
                    geo="ARG", puntos=puntos,
                    url=f"https://datos.gob.ar/series/api/series/?ids={sid}&format=csv",
                    nota=f"Serie oficial {sid}: {campo.get('title') or ''}".strip())
            n += 1
            break
        catalogo[spec["clave"] + "__elegida"] = elegida
        time.sleep(0.3)
    CATALOGO_AR.write_text(json.dumps(catalogo, ensure_ascii=False, indent=1), encoding="utf-8")
    registrar("datosar", n > 0, "; ".join(errores)[:800], n, t0)


# ---------------------------------------------------------------------------
# 4) Eurostat · desocupación mensual
# ---------------------------------------------------------------------------
def _jsonstat(ds: dict) -> list[tuple[dict, float]]:
    """Aplana un JSON-stat 2.0 en pares (coordenadas, valor)."""
    ids = ds["id"]
    size = ds["size"]
    dims = ds["dimension"]
    etiquetas = []
    for d in ids:
        idx = dims[d]["category"]["index"]
        if isinstance(idx, dict):
            orden = sorted(idx.items(), key=lambda kv: kv[1])
            etiquetas.append([k for k, _ in orden])
        else:
            etiquetas.append(list(idx))
    valores = ds["value"]
    if isinstance(valores, list):
        valores = {i: v for i, v in enumerate(valores) if v is not None}
    salida = []
    for k, v in valores.items():
        i = int(k)
        coords = {}
        for d, s, et in zip(reversed(ids), reversed(size), reversed(etiquetas)):
            coords[d] = et[i % s]
            i //= s
        salida.append((coords, float(v)))
    return salida


def descargar_eurostat() -> None:
    t0 = time.time()
    n = 0
    detalle = ""
    geos = ["EU27_2020", "EA21", "EA20", "DEU", "ESP", "FRA", "ITA"]
    eu = {"DEU": "DE", "ESP": "ES", "FRA": "FR", "ITA": "IT", "EU27_2020": "EU27_2020", "EA21": "EA21", "EA20": "EA20"}
    inv = {v: k for k, v in eu.items()}
    base = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
    consultas = [
        ("une_rt_m", "desocupacion", "Tasa de desocupación (mensual, desestacionalizada)",
         "Desocupados como porcentaje de la población activa, 15 a 74 años, ajustada por estacionalidad.",
         {"s_adj": "SA", "age": "TOTAL", "unit": "PC_ACT", "sex": "T"}, "mensual"),
        ("une_rt_m", "desocupacion_juvenil", "Desocupación juvenil (mensual, desestacionalizada)",
         "Desocupados menores de 25 años como porcentaje de la población activa de esa edad, ajustada por estacionalidad.",
         {"s_adj": "SA", "age": "Y_LT25", "unit": "PC_ACT", "sex": "T"}, "mensual"),
    ]
    for tabla, tema, nombre, descripcion, filtros, frecuencia in consultas:
        q = [("format", "JSON"), ("lang", "EN"), ("sinceTimePeriod", "2010-01")] + [(k, v) for k, v in filtros.items()]
        q += [("geo", eu[g]) for g in geos]
        try:
            ds = http_json(base + tabla + "?" + urllib.parse.urlencode(q))
            por_geo: dict[str, list[tuple[str, float]]] = {}
            for coords, v in _jsonstat(ds):
                g = inv.get(coords.get("geo", ""))
                if g:
                    por_geo.setdefault(g, []).append((coords["time"], v))
            for g, puntos in por_geo.items():
                agregar(fuente="eurostat", codigo=f"{tabla}.{filtros['age']}", tema=tema, nombre=nombre,
                        descripcion=descripcion, unidad="%", frecuencia=frecuencia, geo=g, puntos=puntos,
                        url="https://ec.europa.eu/eurostat/databrowser/view/une_rt_m/default/table",
                        ajuste="desestacionalizado")
                n += 1
        except Exception as e:  # noqa: BLE001
            detalle += f"{tabla}/{filtros['age']}: {e}; "
    registrar("eurostat", n > 0, detalle[:600], n, t0)


# ---------------------------------------------------------------------------
# 5) Estados Unidos · BLS
# ---------------------------------------------------------------------------
BLS_SERIES = [
    ("LNS14000000", "desocupacion", "Tasa de desocupación (mensual, desestacionalizada)",
     "Desocupados como porcentaje de la fuerza laboral civil, 16 años y más. Current Population Survey.", "%"),
    ("LNS11300000", "actividad", "Tasa de actividad (mensual, desestacionalizada)",
     "Fuerza laboral civil como porcentaje de la población civil de 16 años y más.", "%"),
    ("LNS12300000", "empleo", "Empleo sobre población (mensual, desestacionalizada)",
     "Ocupados como porcentaje de la población civil de 16 años y más.", "%"),
    ("LNS14000012", "desocupacion_juvenil", "Desocupación de 16 a 19 años (mensual, desestacionalizada)",
     "Desocupados de 16 a 19 años como porcentaje de la fuerza laboral de esa edad.", "%"),
    ("CES0000000001", "empleo_registrado", "Empleo no agrícola (nóminas, miles)",
     "Puestos de trabajo asalariados no agrícolas, en miles, desestacionalizado. Current Employment Statistics.", "miles de puestos"),
    ("CES0500000003", "salarios", "Salario horario promedio, sector privado",
     "Ingreso promedio por hora de los asalariados del sector privado, en dólares corrientes, desestacionalizado.", "USD/hora"),
]
MESES_BLS = {"M01": "01", "M02": "02", "M03": "03", "M04": "04", "M05": "05", "M06": "06", "M07": "07",
             "M08": "08", "M09": "09", "M10": "10", "M11": "11", "M12": "12"}


def descargar_bls() -> None:
    t0 = time.time()
    n = 0
    detalle = ""
    cuerpo = json.dumps({"seriesid": [s[0] for s in BLS_SERIES], "startyear": str(ANIO - 9), "endyear": str(ANIO)}).encode()
    try:
        r = http_json("https://api.bls.gov/publicAPI/v2/timeseries/data/", data=cuerpo,
                      headers={"Content-Type": "application/json"})
        if r.get("status") != "REQUEST_SUCCEEDED":
            raise RuntimeError(str(r.get("message"))[:300])
        for s in r.get("Results", {}).get("series", []):
            spec = next((x for x in BLS_SERIES if x[0] == s.get("seriesID")), None)
            if not spec:
                continue
            puntos = []
            for d in s.get("data", []):
                mes = MESES_BLS.get(d.get("period", ""))
                v = numero(d.get("value"))
                if mes and v is not None:
                    puntos.append((f"{d['year']}-{mes}", v))
            if puntos:
                agregar(fuente="bls", codigo=spec[0], tema=spec[1], nombre=spec[2], descripcion=spec[3],
                        unidad=spec[4], frecuencia="mensual", geo="USA", puntos=puntos,
                        url=f"https://data.bls.gov/timeseries/{spec[0]}", ajuste="desestacionalizado")
                n += 1
    except Exception as e:  # noqa: BLE001
        detalle = str(e)
    registrar("bls", n > 0, detalle[:600], n, t0)


# ---------------------------------------------------------------------------
# 6) FMI · WEO (DataMapper)
# ---------------------------------------------------------------------------
IMF_INDICADORES = [
    ("LUR", "desocupacion", "Tasa de desocupación (WEO)",
     "Desocupación como porcentaje de la fuerza laboral según el FMI; los años posteriores al actual son proyecciones.", "%"),
    ("NGDP_RPCH", "actividad_economica", "Crecimiento del PIB real (WEO)",
     "Variación anual del PIB a precios constantes según el FMI; los años posteriores al actual son proyecciones.", "%"),
    ("PCPIPCH", "precios", "Inflación promedio anual (WEO)",
     "Variación promedio anual del índice de precios al consumidor según el FMI; incluye proyecciones.", "%"),
]


def descargar_imf() -> None:
    t0 = time.time()
    n = 0
    detalle = ""
    for codigo, tema, nombre, descripcion, unidad in IMF_INDICADORES:
        # Sin lista de países en la ruta: la API devuelve todos y se filtra acá
        # (con la lista, un código desconocido hace fallar toda la consulta).
        url = f"https://www.imf.org/external/datamapper/api/v1/{codigo}"
        try:
            r = http_json(url)
            valores = (r.get("values") or {}).get(codigo) or {}
            for geo, por_anio in valores.items():
                if geo not in PAISES:
                    continue
                puntos = [(str(a), v) for a, v in por_anio.items() if numero(v) is not None and 1990 <= int(a) <= ANIO + 5]
                if puntos:
                    agregar(fuente="imf", codigo=codigo, tema=tema, nombre=nombre, descripcion=descripcion,
                            unidad=unidad, frecuencia="anual", geo=geo, puntos=puntos,
                            url=f"https://www.imf.org/external/datamapper/{codigo}@WEO/{geo}",
                            proyeccion_desde=str(ANIO))
                    n += 1
        except Exception as e:  # noqa: BLE001
            detalle += f"{codigo}: {e}; "
        time.sleep(0.3)
    registrar("imf", n > 0, detalle[:600], n, t0)


# ---------------------------------------------------------------------------
# 7) OCDE · desocupación armonizada mensual
# ---------------------------------------------------------------------------
def descargar_oecd() -> None:
    t0 = time.time()
    n = 0
    detalle = ""
    geos = ["CHL", "COL", "CRI", "MEX", "USA", "CAN", "JPN", "KOR", "DEU", "ESP", "FRA", "ITA", "GBR", "TUR", "AUS", "OECD", "EA20", "EA21"]
    url = ("https://sdmx.oecd.org/public/rest/data/OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M,1.0/"
           + "+".join(geos) + "........?startPeriod=2010-01&dimensionAtObservation=AllDimensions&format=csvfilewithlabels")
    try:
        filas = http_csv(url, timeout=180)
        por_geo: dict[str, list[tuple[str, float]]] = {}
        for f in filas:
            def col(nombre: str) -> str:
                return (f.get(nombre) or "").strip()
            if col("MEASURE") and col("MEASURE") not in ("UNE_LF_M", "UNE_LF"):
                continue
            if col("SEX") and col("SEX") != "_T":
                continue
            if col("AGE") and col("AGE") not in ("Y_GE15", "_T"):
                continue
            if col("ADJUSTMENT") and col("ADJUSTMENT") != "Y":
                continue
            if col("TRANSFORMATION") and col("TRANSFORMATION") not in ("_Z", ""):
                continue
            geo = col("REF_AREA")
            v = numero(col("OBS_VALUE"))
            periodo = col("TIME_PERIOD")
            m = re.match(r"^(\d{4})-Q(\d)$", periodo)
            frec = "trimestral" if m else ("mensual" if re.match(r"^\d{4}-\d{2}$", periodo) else "anual")
            if m:
                periodo = f"{m.group(1)}-T{m.group(2)}"
            if geo in PAISES and v is not None:
                por_geo.setdefault((geo, frec), []).append((periodo, v))
        for (geo, frec), puntos in por_geo.items():
            etiqueta = {"mensual": "mensual", "trimestral": "trimestral", "anual": "anual"}[frec]
            agregar(fuente="oecd", codigo=f"UNE_LF_{frec[0].upper()}", tema="desocupacion",
                    nombre=f"Tasa de desocupación armonizada ({etiqueta}, desestacionalizada)",
                    descripcion="Desocupados como porcentaje de la fuerza laboral, 15 años y más, definición armonizada de la OCDE.",
                    unidad="%", frecuencia=frec, geo=geo, puntos=puntos,
                    url="https://data-explorer.oecd.org/vis?df[ds]=dsDisseminateFinalDMZ&df[id]=DSD_LFS%40DF_IALFS_UNE_M&df[ag]=OECD.SDD.TPS",
                    ajuste="desestacionalizado")
            n += 1
    except Exception as e:  # noqa: BLE001
        detalle = str(e)
    registrar("oecd", n > 0, detalle[:600], n, t0)


# ---------------------------------------------------------------------------
# Salida
# ---------------------------------------------------------------------------
def escribir() -> None:
    CARPETA.mkdir(parents=True, exist_ok=True)
    # Si una fuente falló por completo, se conservan sus series de la corrida anterior.
    previo: dict = {}
    if SALIDA.exists():
        try:
            previo = json.loads(SALIDA.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            previo = {}
    conservadas = 0
    fuentes_ok = {f for f, e in estado.items() if e["ok"]}
    for s in previo.get("series", []):
        if s.get("fuente") not in fuentes_ok and s.get("fuente") in estado:
            s["conservada_de"] = previo.get("generado")
            series.append(s)
            conservadas += 1
    if conservadas:
        print(f"[i] {conservadas} series conservadas de la corrida anterior (fuentes sin respuesta).")

    series.sort(key=lambda s: (s["escala"], s["geo_nombre"], s["tema"], s["fuente"], s["codigo"]))
    salida = {
        "generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "publicado_por": "OITraF · Observatorio Internacional del Trabajo del Futuro",
        "licencia": "Compilación y elaboraciones de OITraF bajo CC BY 4.0 (citar a OITraF con enlace). Cada serie conserva la licencia del organismo indicado en 'fuente' y 'url'.",
        "temas": TEMAS,
        "fuentes": FUENTES,
        "geos": {g: {"nombre": nombre_geo(g), "escala": escala_de(g)} for g in sorted({s["geo"] for s in series})},
        "estado": estado,
        "total_series": len(series),
        "series": series,
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ESTADO.write_text(json.dumps({"generado": salida["generado"], "estado": estado, "total_series": len(series)},
                                 ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[✓] {SALIDA.relative_to(RAIZ)}: {len(series)} series, {SALIDA.stat().st_size // 1024} KB")


def main(argv: list[str]) -> int:
    solo = None
    if "--solo" in argv:
        solo = set(argv[argv.index("--solo") + 1].split(","))
    pasos = [("wb", descargar_wb), ("ilo", descargar_ilo), ("datosar", descargar_datosar),
             ("eurostat", descargar_eurostat), ("bls", descargar_bls), ("imf", descargar_imf),
             ("oecd", descargar_oecd)]
    for clave, fn in pasos:
        if solo and clave not in solo:
            continue
        try:
            fn()
        except Exception as e:  # noqa: BLE001  — nunca tumbar la corrida entera
            registrar(clave, False, f"excepción no controlada: {e}")
    escribir()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
