"""
Extractos de las notas publicadas en medios.

Para cada nota de data/notas.json con `url` y sin `extracto` (o todas, con
--forzar) consulta la API REST de WordPress del medio (los tres son sitios
WordPress), toma los primeros párrafos del cuerpo y guarda en el índice un
extracto breve (hasta ~520 caracteres, cortado en fin de oración), la cantidad
de palabras del texto completo (para estimar el tiempo de lectura) y la fecha
exacta de publicación. El texto completo no se guarda: el sitio publica el
extracto con enlace a la nota original.

Se ejecuta en GitHub Actions (el entorno de edición no tiene salida a internet).

Uso: python3 scripts/extractos_notas.py [--forzar]
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

UA = {"User-Agent": "Mozilla/5.0 (compatible; OITraF/1.0; +https://diego101sl-ai.github.io/observatorio-protestas-sociales/)",
      "Accept": "application/json, text/html;q=0.9"}
LARGO = 520
RUTA = "data/notas.json"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


class Parrafos(HTMLParser):
    """Devuelve el texto plano de los párrafos del cuerpo, en orden, sin
    figuras, incrustados, scripts ni bloques de compartir o relacionadas."""

    SALTAR = ("script", "style", "figure", "iframe", "noscript", "form", "nav", "svg", "video", "audio", "figcaption")
    SALTAR_CLASES = re.compile(r"sharedaddy|jp-relatedposts|related|compartir|share|yarpp|wp-block-embed|post-views|td-post-sharing|addtoany|tags|crp_related|wp-caption", re.I)

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parrafos: list[str] = []
        self.actual: list[str] = []
        self.saltar: list[str] = []

    def handle_starttag(self, tag, attrs):
        clases = dict(attrs).get("class") or ""
        if self.saltar:
            self.saltar.append(tag)
            return
        if tag in self.SALTAR or (clases and self.SALTAR_CLASES.search(clases)):
            self.saltar.append(tag)
            return
        if tag in ("p", "h1", "h2", "h3", "h4", "li", "blockquote", "div"):
            self.cerrar()
        elif tag == "br":
            self.actual.append(" ")

    def handle_endtag(self, tag):
        if self.saltar:
            if tag == self.saltar[-1]:
                self.saltar.pop()
            return
        if tag in ("p", "h1", "h2", "h3", "h4", "li", "blockquote", "div"):
            self.cerrar()

    def handle_data(self, data):
        if not self.saltar:
            self.actual.append(data)

    def cerrar(self):
        t = re.sub(r"\s+", " ", "".join(self.actual)).strip()
        self.actual = []
        if t:
            self.parrafos.append(t)


def limpiar(ps: list[str], titulo: str) -> list[str]:
    out = []
    for t in ps:
        t = re.sub(r"^\(?\s*Por\s+Diego Lorca\s*\)?\s*[:.\-–]?\s*", "", t, flags=re.I).strip()
        if len(t) < 60:
            continue
        if titulo and t.lower().startswith(titulo.lower()[:40]):
            continue
        if re.match(r"^(Compartir|Share|Etiquetas|Tags|Relacionad|Lee también|Leé también)", t, re.I):
            continue
        out.append(t)
    return out


def extracto_de(ps: list[str]) -> str:
    texto = ""
    for p in ps:
        if len(texto) + len(p) + 1 <= LARGO:
            texto = f"{texto} {p}".strip()
            continue
        resto = LARGO - len(texto)
        if resto > 120:
            corte = p[:resto]
            m = list(re.finditer(r"[.!?](\s|$)", corte))
            pedazo = corte[: m[-1].end()].strip() if m else corte.rsplit(" ", 1)[0] + "…"
            texto = f"{texto} {pedazo}".strip()
        break
    return texto


def via_api(url: str):
    o = urllib.parse.urlsplit(url)
    slug = url.rstrip("/").split("/")[-1]
    api = f"{o.scheme}://{o.netloc}/wp-json/wp/v2/posts?slug={urllib.parse.quote(slug)}&_fields=date,title,content"
    datos = json.loads(fetch(api).decode("utf-8", "replace"))
    if not isinstance(datos, list) or not datos:
        return None
    p = datos[0]
    titulo = html.unescape(re.sub(r"<[^>]+>", "", p.get("title", {}).get("rendered", ""))).strip()
    return titulo, (p.get("date") or "")[:10], p.get("content", {}).get("rendered", "")


def via_html(url: str):
    pagina = fetch(url).decode("utf-8", "replace")
    m = re.search(r'property="og:title" content="([^"]+)"', pagina)
    titulo = html.unescape(m.group(1)) if m else ""
    m = (re.search(r'property="article:published_time" content="(\d{4}-\d{2}-\d{2})', pagina)
         or re.search(r'"datePublished":"(\d{4}-\d{2}-\d{2})', pagina))
    fecha = m.group(1) if m else ""
    m = re.search(r'<div[^>]+class="[^"]*\b(?:entry-content|post-content|td-post-content|article-content)\b[^"]*"[^>]*>(.*)', pagina, re.S)
    return titulo, fecha, (m.group(1) if m else "")


def procesar(n: dict) -> str:
    res = None
    try:
        res = via_api(n["url"])
        origen = "api"
    except Exception as err:
        print(f"   api: {err}", flush=True)
    if not res or not res[2].strip():
        res = via_html(n["url"])
        origen = "html"
    titulo, fecha, cuerpo = res
    px = Parrafos()
    px.feed(cuerpo)
    px.cerrar()
    ps = limpiar(px.parrafos, titulo or n["titulo"])
    if len(ps) < 2:
        raise RuntimeError(f"cuerpo insuficiente ({len(ps)} párrafos, {origen})")
    n["extracto"] = extracto_de(ps)
    n["palabras"] = sum(len(re.findall(r"\w+", p)) for p in ps)
    n["lectura_min"] = max(1, round(n["palabras"] / 200))
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha):
        n["fecha"] = fecha
    return f"{len(n['extracto'])} caracteres de extracto, {n['palabras']} palabras, fecha {n['fecha']} ({origen})"


def main():
    forzar = "--forzar" in sys.argv
    datos = json.load(open(RUTA, encoding="utf-8"))
    errores = hechos = 0
    for n in datos["notas"]:
        if not n.get("url") or n.get("tipo") == "semanal":
            continue
        if n.get("extracto") and not forzar:
            continue
        try:
            print(n["url"].rstrip("/").split("/")[-1][:60], "→", procesar(n), flush=True)
            hechos += 1
        except Exception as err:
            errores += 1
            print(n["url"].rstrip("/").split("/")[-1][:60], "→ ERROR", err, flush=True)
        time.sleep(1.5)
    datos["notas"].sort(key=lambda x: x["fecha"], reverse=True)
    json.dump(datos, open(RUTA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"listo: {hechos} extractos, {errores} errores")


if __name__ == "__main__":
    main()
