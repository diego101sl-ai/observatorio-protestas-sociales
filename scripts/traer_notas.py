"""
Descarga el texto completo de las notas listadas en data/notas.json (las que no
tienen todavía su archivo en notas/src/) y lo guarda como Markdown con un
encabezado de metadatos. Se ejecuta en GitHub Actions (el entorno de edición
no tiene salida a internet). Los sitios son WordPress: el cuerpo está en
`.entry-content` o `article`.

Uso: python3 scripts/traer_notas.py [--forzar] [--solo slug]
"""
import html, json, os, re, sys, time, unicodedata, urllib.request
from html.parser import HTMLParser

UA = {"User-Agent": "Mozilla/5.0 (compatible; OITraF/1.0; +https://diego101sl-ai.github.io/observatorio-protestas-sociales/)"}
SRC = "notas/src"

def slug_de(url: str) -> str:
    seg = url.rstrip("/").split("/")[-1]
    seg = re.sub(r"-por-diego-lorca$", "", seg)
    seg = re.sub(r"^edicionespecialmotorcumple9-", "", seg)
    return seg[:90]

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")

class Extractor(HTMLParser):
    """Convierte el cuerpo de la nota a Markdown sencillo: párrafos, títulos,
    citas, listas, negritas, cursivas y enlaces. Ignora scripts, figuras y
    bloques de «relacionadas» o compartir."""
    BLOQUES = {"p", "h1", "h2", "h3", "h4", "blockquote", "li", "ul", "ol", "figure", "div", "section", "aside", "footer", "table", "tr", "td", "th"}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.en_cuerpo = 0; self.prof = 0; self.salida = []; self.actual = []; self.saltar = 0
        self.pila = []; self.lista = []; self.en_cita = 0; self.href = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs); clases = (a.get("class") or "")
        if self.en_cuerpo == 0:
            if tag in ("div", "article", "section") and re.search(r"\bentry-content\b|\bpost-content\b|\btd-post-content\b|\barticle-content\b|\bsingle-content\b", clases):
                self.en_cuerpo = 1; self.prof = 0
            return
        if tag in ("script", "style", "figure", "iframe", "noscript", "form", "nav", "svg") or re.search(r"sharedaddy|jp-relatedposts|related|compartir|tags|social|yarpp|wp-block-embed|post-views|td-post-sharing|addtoany", clases):
            self.saltar += 1
        self.prof += 1
        if self.saltar: return
        if tag in ("p", "h1", "h2", "h3", "h4", "li", "blockquote", "ul", "ol"):
            self.cerrar_parrafo()
            if tag == "blockquote": self.en_cita += 1
            if tag in ("ul", "ol"): self.lista.append(tag)
            self.pila.append(tag)
        elif tag == "br": self.actual.append("\n")
        elif tag in ("strong", "b"): self.actual.append("**")
        elif tag in ("em", "i"): self.actual.append("*")
        elif tag == "a" and a.get("href", "").startswith("http"): self.href = a["href"]; self.actual.append("[")
    def handle_endtag(self, tag):
        if self.en_cuerpo == 0: return
        if tag in ("script", "style", "figure", "iframe", "noscript", "form", "nav", "svg") and self.saltar:
            self.saltar -= 1; self.prof -= 1; return
        if self.saltar and tag in ("div", "section", "aside", "span", "ul"):
            # cierre de un bloque saltado
            self.saltar -= 1; self.prof -= 1; return
        self.prof -= 1
        if self.prof <= 0:
            self.cerrar_parrafo(); self.en_cuerpo = 2; return
        if self.saltar: return
        if tag in ("p", "h1", "h2", "h3", "h4", "li", "blockquote", "ul", "ol"):
            if tag == "blockquote": self.en_cita = max(0, self.en_cita - 1)
            if tag in ("ul", "ol") and self.lista: self.lista.pop()
            self.cerrar_parrafo(tag)
        elif tag in ("strong", "b"): self.actual.append("**")
        elif tag in ("em", "i"): self.actual.append("*")
        elif tag == "a" and self.href: self.actual.append(f"]({self.href})"); self.href = None
    def handle_data(self, data):
        if self.en_cuerpo == 1 and not self.saltar: self.actual.append(data)
    def cerrar_parrafo(self, tag=None):
        texto = "".join(self.actual); self.actual = []
        texto = re.sub(r"[ \t ]+", " ", texto).strip()
        texto = re.sub(r"\*\*\s*\*\*", "", texto); texto = re.sub(r"\*\s*\*", "", texto)
        if not texto: return
        if tag in ("h1", "h2"): texto = "## " + texto
        elif tag in ("h3", "h4"): texto = "### " + texto
        elif tag == "li": texto = ("1. " if self.lista and self.lista[-1] == "ol" else "- ") + texto
        if self.en_cita and tag not in ("blockquote",): texto = "> " + texto
        self.salida.append(texto)

def fecha_de(pagina: str) -> str:
    m = re.search(r'property="article:published_time" content="(\d{4}-\d{2}-\d{2})', pagina) or \
        re.search(r'"datePublished":"(\d{4}-\d{2}-\d{2})', pagina) or \
        re.search(r'<time[^>]+datetime="(\d{4}-\d{2}-\d{2})', pagina)
    return m.group(1) if m else ""

def titulo_de(pagina: str) -> str:
    m = re.search(r'property="og:title" content="([^"]+)"', pagina)
    t = html.unescape(m.group(1)) if m else ""
    return re.sub(r"\s+[-|–]\s+(NODAL|Motor Económico|Radio Gráfica).*$", "", t).strip()

def bajar(nota: dict, forzar: bool) -> str:
    slug = slug_de(nota["url"]); ruta = os.path.join(SRC, f"{slug}.md")
    if os.path.exists(ruta) and not forzar:
        return f"{slug}: ya existe"
    pagina = fetch(nota["url"])
    ex = Extractor(); ex.feed(pagina); ex.cerrar_parrafo()
    cuerpo = ex.salida
    # quita firmas repetidas de pie («Por Diego Lorca», «(*) Director…») solo si están al final; se conservan como nota de autor
    if len(cuerpo) < 3:
        raise RuntimeError(f"cuerpo demasiado corto ({len(cuerpo)} bloques)")
    fecha = fecha_de(pagina) or nota.get("fecha", "")
    titulo = titulo_de(pagina) or nota["titulo"]
    meta = {"titulo": titulo, "medio": nota["medio"], "fecha": fecha, "url": nota["url"], "autor": nota.get("autor", "Diego Lorca"),
            "resumen": nota.get("resumen", ""), "temas": nota.get("temas", []), "tipo": nota.get("tipo", "nota")}
    with open(ruta, "w", encoding="utf-8") as f:
        f.write("---\n" + json.dumps(meta, ensure_ascii=False, indent=1) + "\n---\n\n" + "\n\n".join(cuerpo) + "\n")
    return f"{slug}: {len(cuerpo)} bloques, {sum(len(b) for b in cuerpo)} caracteres, fecha {fecha}"

def main():
    forzar = "--forzar" in sys.argv
    solo = sys.argv[sys.argv.index("--solo") + 1] if "--solo" in sys.argv else None
    os.makedirs(SRC, exist_ok=True)
    notas = json.load(open("data/notas.json", encoding="utf-8"))["notas"]
    errores = 0
    for n in notas:
        if not n.get("url") or n.get("tipo") == "semanal": continue
        if solo and slug_de(n["url"]) != solo: continue
        try:
            print(bajar(n, forzar), flush=True)
        except Exception as err:
            errores += 1; print(f"{slug_de(n['url'])}: ERROR {err}", flush=True)
        time.sleep(1.5)
    print(f"listo, {errores} errores")

if __name__ == "__main__":
    main()
