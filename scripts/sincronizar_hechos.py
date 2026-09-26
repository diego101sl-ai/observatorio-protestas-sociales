#!/usr/bin/env python3
"""
Sincroniza la cobertura de medios desde el dashboard «Algoritmo Inteligente ·
Seguimiento de Medios» (base de datos del equipo: ~300 unidades de registro
por día de 24 medios nacionales, latinoamericanos e internacionales) y publica
un extracto público en data/hechos.json para la web de OITraF.

El dashboard exige sesión. El robot usa una cuenta de solo lectura (rol
Lector) cuyas credenciales viven en los secretos del repositorio:

  DASHBOARD_URL       p. ej. https://mi-panel.onrender.com  (sin barra final)
  DASHBOARD_EMAIL     correo de la cuenta de solo lectura
  DASHBOARD_PASSWORD  su contraseña

Alternativa sin usuario: DASHBOARD_TOKEN (el JUEGO_TOKEN del dashboard), que
se envía en la cabecera X-Juego-Token al endpoint /api/juego/hechos.

Si no hay credenciales, no toca el archivo existente y termina sin error.

Qué se publica de cada hecho: título, resumen breve, medio, escala, sector,
eje, fecha, actores y enlaces a las notas originales. No se publica el cuerpo
completo ni datos de quien lo cargó.

Uso:
  python3 scripts/sincronizar_hechos.py               # sincroniza desde el dashboard
  python3 scripts/sincronizar_hechos.py --semilla X   # genera data/hechos.json desde un
                                                      # JSON exportado {"hechos": [...]}
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "hechos.json"
DIAS_VENTANA = int(os.environ.get("HECHOS_DIAS", "45"))
MAX_HECHOS = int(os.environ.get("HECHOS_MAX", "1500"))
UA = "OITraF-observatorio/1.0 (sincronización de cobertura)"

MEDIOS = {
    "Clarín": "Nacional", "Infobae": "Nacional", "La Nación": "Nacional", "Página 12": "Nacional",
    "El Destape Web": "Nacional", "Telesur": "Latinoamericana", "O Globo": "Latinoamericana",
    "La Jornada": "Latinoamericana", "El Diario de Hoy": "Latinoamericana", "Global Times": "Internacional",
    "Xinhua": "Internacional", "Financial Times": "Internacional", "The Economist": "Internacional",
    "The Wall Street Journal": "Internacional", "The Guardian": "Internacional",
    "The Washington Post": "Internacional", "Al Jazeera": "Internacional", "Haaretz": "Internacional",
    "Bloomberg": "Internacional", "Tehran Times": "Internacional", "El Diario de la República": "Provincial",
    "El Chorrillero": "Provincial", "La Gaceta Digital": "Provincial", "El Corredor Noticias": "Provincial",
}
SECTORES = ["TRABAJADORES", "AGENDA POLÍTICA", "ENERGÍA", "FINANZAS", "INDUSTRIA", "AGRO"]


def sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").upper()


def sector_de_eje(eje: str) -> str:
    """Porta server/src/domain.ts::sectorDeEje del dashboard."""
    e = sin_acentos(eje)
    if re.search(r"\bAGRO|AGROPECUARI|\bCAMPO\b|\bRURAL|GANADER|\bSOJ|COSECH|SIEMBRA|PROTEINA", e):
        return "AGRO"
    if re.search(r"TRABAJ|LABORAL|SINDICA|GREMI|\bCGT\b|\bCTA\b|\bEMPLEO|PARITARIA|SALARI|JUBILAC|PREVISIONAL|MUNDO DEL TRABAJO", e):
        return "TRABAJADORES"
    if re.search(r"INDUSTRI|MANUFACTUR|FABRIL|SECTOR PRODUCTIV|SEMICONDUCTOR|TECNOLOG|INNOVAC|INTELIGENCIA ARTIFICIAL|AUTOMOTR", e):
        return "INDUSTRIA"
    if re.search(r"ENERG|PETROLE|\bGAS\b|COMBUSTIBLE|HIDROELECTRIC|NUCLEAR|ELECTRIC|\bLITIO|MINERIA|VACA MUERTA|COMMODIT", e):
        return "ENERGÍA"
    if re.search(r"FINANZ|MERCADO.{0,4}CAPITAL|MERCADOS? FINANCIER|\bDEUDA|RIESGO PAIS|\bTASAS|INFLACION|TIPO DE CAMBIO|RESERVAS|\bDOLAR|\bBONOS|BANCO CENTRAL|\bBCRA\b|\bFMI\b|CORPORAC|\bM&A\b|MERCADOS DE CAPITAL|ECONOM|COMERCI|\bFISCAL|\bPIB\b|ACTIVIDAD ECONOMICA|RECESION|CRECIMIENTO", e):
        return "FINANZAS"
    return "AGENDA POLÍTICA"


def resumir(cuerpo: str, largo: int = 260) -> str:
    texto = re.sub(r"\s+", " ", cuerpo or "").strip()
    if len(texto) <= largo:
        return texto
    corte = texto[:largo].rfind(". ")
    return texto[:corte + 1] if corte > 100 else texto[:largo - 1].rstrip() + "…"


def links_de(h: dict) -> list[str]:
    urls: list[str] = []
    for l in h.get("links") or []:
        u = (l.get("url") if isinstance(l, dict) else l) or ""
        if u.startswith("http"):
            urls.append(u.strip())
    for k in ("linkUrl", "linkX"):
        u = h.get(k) or ""
        if isinstance(u, str) and u.startswith("http"):
            urls.append(u.strip())
    vistos, salida = set(), []
    for u in urls:
        k = re.sub(r"^https?://(www\.)?", "", u).rstrip("/").lower()
        if k not in vistos:
            vistos.add(k)
            salida.append(u)
    return salida


def normalizar(h: dict) -> dict | None:
    fecha = str(h.get("fecha") or "")[:10]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", fecha):
        return None
    medio = (h.get("medio") or "").strip()
    escala = (h.get("escala") or MEDIOS.get(medio) or "Nacional").strip()
    eje = (h.get("eje") or "").strip()
    sector = (h.get("sector") or "").strip() or sector_de_eje(eje)
    actores = h.get("actores") or []
    if isinstance(actores, str):
        try:
            actores = json.loads(actores)
        except ValueError:
            actores = [a.strip() for a in actores.split(",") if a.strip()]
    return {
        "id": h.get("id"),
        "titulo": (h.get("titulo") or "").strip(),
        "resumen": resumir(h.get("cuerpo") or ""),
        "medio": medio,
        "escala": escala,
        "sector": sector if sector in SECTORES else "AGENDA POLÍTICA",
        "eje": eje,
        "fecha": fecha,
        "genero": h.get("genero") or "Nota",
        "actores": [str(a) for a in actores][:8],
        "links": links_de(h),
    }


def resumen(hechos: list[dict], desde: str, hasta: str) -> dict:
    por_dia = Counter(h["fecha"] for h in hechos)
    dias = []
    d = dt.date.fromisoformat(desde)
    fin = dt.date.fromisoformat(hasta)
    while d <= fin:
        k = d.isoformat()
        dias.append([k, por_dia.get(k, 0)])
        d += dt.timedelta(days=1)
    return {
        "por_escala": dict(Counter(h["escala"] for h in hechos)),
        "por_sector": dict(Counter(h["sector"] for h in hechos)),
        "por_medio": dict(Counter(h["medio"] for h in hechos).most_common()),
        "por_dia": dias,
        "medios": len({h["medio"] for h in hechos}),
    }


def escribir(hechos_crudos: list[dict], modo: str, origen: str) -> None:
    hechos = [x for x in (normalizar(h) for h in hechos_crudos) if x and x["titulo"]]
    hechos.sort(key=lambda h: (h["fecha"], str(h.get("id") or "")), reverse=True)
    if not hechos:
        print("[!] No hay hechos válidos para publicar; se conserva el archivo anterior.")
        return
    hasta = hechos[0]["fecha"]
    desde = (dt.date.fromisoformat(hasta) - dt.timedelta(days=DIAS_VENTANA - 1)).isoformat()
    ventana = [h for h in hechos if h["fecha"] >= desde][:MAX_HECHOS]
    salida = {
        "generado": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "modo": modo,  # "dashboard" (sincronización real) o "semilla" (muestra)
        "origen": origen,
        "fuente": {
            "nombre": "Algoritmo Inteligente · Seguimiento de Medios",
            "descripcion": "Relevamiento diario del equipo de OITraF: unidades de registro clasificadas por escala, sector, eje y actores, a partir de 24 medios nacionales, latinoamericanos e internacionales.",
            "medios": list(MEDIOS.keys()),
        },
        "ventana": {"desde": desde, "hasta": hasta, "dias": DIAS_VENTANA},
        "total_corpus": len(hechos_crudos),
        "total": len(ventana),
        "resumen": resumen(ventana, desde, hasta),
        "hechos": ventana,
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[✓] {SALIDA.relative_to(RAIZ)}: {len(ventana)} hechos ({desde} → {hasta}), modo {modo}, "
          f"{SALIDA.stat().st_size // 1024} KB")


def pedir(url: str, *, headers: dict | None = None, data: bytes | None = None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def desde_dashboard() -> int:
    base = os.environ.get("DASHBOARD_URL", "").strip().rstrip("/")
    email = os.environ.get("DASHBOARD_EMAIL", "").strip()
    clave = os.environ.get("DASHBOARD_PASSWORD", "")
    token = os.environ.get("DASHBOARD_TOKEN", "").strip()
    if not base or not ((email and clave) or token):
        print("[i] Sin credenciales del dashboard (DASHBOARD_URL + DASHBOARD_EMAIL/PASSWORD o DASHBOARD_TOKEN). "
              "No se modifica data/hechos.json.")
        return 0
    try:
        if email and clave:
            sesion = pedir(f"{base}/api/auth/login", headers={"Content-Type": "application/json"},
                           data=json.dumps({"email": email, "password": clave}).encode())
            jwt = sesion.get("token")
            if not jwt:
                raise RuntimeError("el login no devolvió token")
            hechos = pedir(f"{base}/api/hechos", headers={"Authorization": f"Bearer {jwt}"})
            origen = f"{base}/api/hechos (sesión {sesion.get('user', {}).get('rol', '?')})"
        else:
            r = pedir(f"{base}/api/juego/hechos", headers={"X-Juego-Token": token})
            hechos = r.get("hechos") if isinstance(r, dict) else r
            origen = f"{base}/api/juego/hechos (token compartido)"
        if not isinstance(hechos, list):
            raise RuntimeError(f"respuesta inesperada: {str(hechos)[:200]}")
    except urllib.error.HTTPError as e:
        print(f"[ERR] dashboard respondió HTTP {e.code}: {e.read()[:300]!r}")
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"[ERR] no se pudo sincronizar con el dashboard: {e}")
        return 1
    escribir(hechos, "dashboard", origen)
    return 0


def desde_semilla(ruta: str) -> int:
    d = json.loads(Path(ruta).read_text(encoding="utf-8"))
    hechos = d.get("hechos") if isinstance(d, dict) else d
    escribir(hechos, "semilla", f"exportación {Path(ruta).name}")
    return 0


if __name__ == "__main__":
    if "--semilla" in sys.argv:
        sys.exit(desde_semilla(sys.argv[sys.argv.index("--semilla") + 1]))
    sys.exit(desde_dashboard())
