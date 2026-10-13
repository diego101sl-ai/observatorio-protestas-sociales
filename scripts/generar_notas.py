"""
Genera las páginas de lectura de las notas (notas/<slug>.html) a partir de
notas/src/<slug>.md (encabezado JSON entre líneas `---` y cuerpo en Markdown
sencillo) y actualiza data/notas.json con `archivo`, `palabras` y
`lectura_min`. Respeta el sistema de diseño de css/oitraf.css.

Uso: python3 scripts/generar_notas.py
"""
import glob
import html
import json
import os
import re
from datetime import date

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(RAIZ, "notas", "src")
OUT = os.path.join(RAIZ, "notas")
SITIO = "https://diego101sl-ai.github.io/observatorio-protestas-sociales/"
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def fecha_larga(f: str) -> str:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", f):
        a, m, d = f.split("-")
        return f"{int(d)} de {MESES[int(m) - 1]} de {a}"
    if re.fullmatch(r"\d{4}-\d{2}", f):
        a, m = f.split("-")
        return f"{MESES[int(m) - 1]} de {a}"
    return f


def inline(t: str) -> str:
    t = html.escape(t, quote=False)
    t = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])", r"<em>\1</em>", t)
    return t.replace("\n", "<br>")


def markdown_a_html(md: str) -> tuple[str, int]:
    bloques = [b.strip() for b in re.split(r"\n\s*\n", md.strip()) if b.strip()]
    salida: list[str] = []
    palabras = 0
    lista_abierta = None

    def cerrar_lista():
        nonlocal lista_abierta
        if lista_abierta:
            salida.append(f"</{lista_abierta}>")
            lista_abierta = None

    for b in bloques:
        palabras += len(re.findall(r"\w+", b))
        if b.startswith("## "):
            cerrar_lista()
            salida.append(f"<h2>{inline(b[3:])}</h2>")
        elif b.startswith("### "):
            cerrar_lista()
            salida.append(f"<h3>{inline(b[4:])}</h3>")
        elif b.startswith("> "):
            cerrar_lista()
            salida.append(f"<blockquote><p>{inline(b[2:])}</p></blockquote>")
        elif re.match(r"^(- |1\. )", b):
            tag = "ol" if b.startswith("1. ") else "ul"
            if lista_abierta != tag:
                cerrar_lista()
                salida.append(f"<{tag}>")
                lista_abierta = tag
            item = re.sub(r"^(- |1\. )", "", b)
            salida.append(f"<li>{inline(item)}</li>")
        else:
            cerrar_lista()
            salida.append(f"<p>{inline(b)}</p>")
    cerrar_lista()
    return "\n".join(salida), palabras


SUFIJO_MEDIO = {"Radio Gráfica": "-radiografica", "Motor Económico": "-motoreconomico"}


def slug_de_url(url: str, medio: str, usados: set) -> str:
    seg = url.rstrip("/").split("/")[-1]
    seg = re.sub(r"-por-diego-lorca$", "", seg)
    seg = re.sub(r"^edicionespecialmotorcumple9-", "", seg)[:90]
    if seg in usados:
        seg += SUFIJO_MEDIO.get(medio, "-" + re.sub(r"[^a-z]", "", medio.lower()))
    return seg


def leer_md(ruta: str) -> tuple[dict, str]:
    txt = open(ruta, encoding="utf-8").read()
    m = re.match(r"---\n(.*?)\n---\n(.*)$", txt, re.S)
    if not m:
        raise ValueError(f"{ruta}: falta el encabezado")
    return json.loads(m.group(1)), m.group(2)


def plantilla() -> tuple[str, str]:
    base = open(os.path.join(RAIZ, "notas.html"), encoding="utf-8").read()
    masthead = base[base.index('  <header class="masthead">'):base.index('  </header>') + len('  </header>')]
    footer = base[base.index('  <footer class="footer">'):base.index('  </footer>') + len('  </footer>')]

    def relativo(s: str) -> str:
        s = s.replace('href="index.html', 'href="../index.html')
        for p in ("indicadores.html", "protestas.html", "nosotros.html", "notas.html"):
            s = s.replace(f'href="{p}"', f'href="../{p}"')
        return s.replace('src="img/', 'src="../img/')

    return relativo(masthead), relativo(footer)


def pagina(meta: dict, cuerpo_html: str, palabras: int, slug: str, anterior, siguiente, masthead: str, footer: str) -> str:
    titulo = meta["titulo"]
    medio = meta["medio"]
    fecha = meta.get("fecha", "")
    url = meta.get("url", "")
    resumen = meta.get("resumen", "")
    autor = meta.get("autor", "Diego Lorca")
    temas = meta.get("temas", [])
    minutos = max(1, round(palabras / 200))
    canon = f"{SITIO}notas/{slug}.html"
    desc = html.escape(resumen or titulo, quote=True)
    t_esc = html.escape(titulo, quote=True)
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": titulo, "datePublished": fecha,
          "author": {"@type": "Person", "name": autor},
          "publisher": {"@type": "Organization", "name": "OITraF", "url": SITIO},
          "mainEntityOfPage": canon, "inLanguage": "es", "wordCount": palabras}
    if url:
        ld["isBasedOn"] = url
    nav = ""
    if anterior or siguiente:
        a = (f'<a class="nota-nav-item" href="{anterior["archivo"].split("/")[-1]}"><span class="kicker">Anterior</span>'
             f'<span>{html.escape(anterior["titulo"])}</span></a>') if anterior else "<span></span>"
        s = (f'<a class="nota-nav-item nota-nav-item--der" href="{siguiente["archivo"].split("/")[-1]}"><span class="kicker">Siguiente</span>'
             f'<span>{html.escape(siguiente["titulo"])}</span></a>') if siguiente else "<span></span>"
        nav = f'<nav class="nota-nav" aria-label="Otras notas">{a}{s}</nav>'
    es_extracto = bool(meta.get("extracto"))
    if es_extracto:
        original = (f'Extracto. La nota completa está publicada en <a href="{html.escape(url)}" target="_blank" rel="noopener">{html.escape(medio)}</a> '
                    f'({fecha_larga(fecha)}); los derechos del texto pertenecen a su autor y al medio.')
        cuerpo_html = (f'<div class="nota-extracto">{cuerpo_html}</div>'
                       f'<p class="nota-leer"><a class="btn btn-red" href="{html.escape(url)}" target="_blank" rel="noopener">Leer la nota completa en {html.escape(medio)} ↗</a></p>')
    elif url:
        original = (f'Publicada originalmente en <a href="{html.escape(url)}" target="_blank" rel="noopener">{html.escape(medio)}</a> '
                    f'el {fecha_larga(fecha)}.')
    else:
        original = f"Nota del equipo de OITraF, {fecha_larga(fecha)}."
    temas_html = "".join(f'<span class="sector-chip">{html.escape(t)}</span>' for t in temas)
    bajada = f'<p class="nota-bajada">{html.escape(resumen)}</p>' if resumen else ""
    temas_bloque = f'<div class="hecho-links nota-temas">{temas_html}</div>' if temas_html else ""
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="#071b3d">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.counterapi.dev; object-src 'none'; base-uri 'self'; form-action 'self'">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="author" content="{html.escape(autor, quote=True)}">
  <meta name="copyright" content="© {html.escape(autor, quote=True)} · OITraF. Publicada originalmente en {html.escape(medio, quote=True)}.">
  <link rel="canonical" href="{canon}">
  <meta property="og:site_name" content="OITraF">
  <meta property="og:type" content="article">
  <meta property="og:title" content="{t_esc}">
  <meta property="og:description" content="{desc}">
  <meta property="og:url" content="{canon}">
  <meta property="og:image" content="{SITIO}img/marca/oitraf-isotipo-color.png">
  <meta property="article:published_time" content="{fecha}">
  <meta property="article:author" content="{html.escape(autor, quote=True)}">
  <meta name="twitter:card" content="summary">
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
  <title>{t_esc} · OITraF</title>
  <link rel="icon" type="image/png" href="../img/marca/favicon-64.png">
  <link rel="apple-touch-icon" href="../img/marca/oitraf-isotipo-color.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600&family=JetBrains+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="../css/oitraf.css">
</head>
<body data-nota="{slug}">
  <a class="skip-link" href="#texto">Saltar al texto</a>

{masthead}

  <main class="nota-pagina">
    <article class="shell nota-articulo" aria-labelledby="h-nota">
      <header class="nota-cabecera">
        <p class="kicker"><span class="dot" aria-hidden="true"></span>{html.escape(medio)} · {fecha_larga(fecha)}</p>
        <h1 id="h-nota" class="display nota-titulo">{html.escape(titulo)}</h1>
        {bajada}
        <div class="nota-meta">
          <span class="nota-autor">Por <b>{html.escape(autor)}</b></span>
          <span class="nota-dato" title="Tiempo estimado de lectura">{minutos} min de lectura</span>
          <span class="nota-dato nota-lecturas" id="nota-lecturas" hidden><b id="nota-lecturas-n">—</b> lecturas</span>
        </div>
      </header>
      <div class="nota-texto" id="texto">
{cuerpo_html}
      </div>
      <footer class="nota-pie">
        <p class="nota-original">{original}</p>
        {temas_bloque}
        <div class="nota-acciones">
          <a class="btn btn-outline" href="../notas.html">← Todas las publicaciones</a>
          <a class="btn btn-outline" href="../index.html#suscripcion">Recibir las notas por correo</a>
        </div>
        {nav}
      </footer>
    </article>
  </main>

{footer}

  <script type="module" src="../js/oitraf/nota.js"></script>
  <script type="module" src="../js/oitraf/proteccion.js"></script>
</body>
</html>
'''


def main():
    masthead, footer = plantilla()
    ruta_datos = os.path.join(RAIZ, "data", "notas.json")
    datos = json.load(open(ruta_datos, encoding="utf-8"))
    por_url = {n.get("url"): n for n in datos["notas"] if n.get("url")}
    por_archivo = {n.get("archivo"): n for n in datos["notas"] if n.get("archivo")}
    generadas = []
    # 1) Notas propias del equipo: texto completo en notas/src/<slug>.md
    for ruta in sorted(glob.glob(os.path.join(SRC, "*.md"))):
        slug = os.path.splitext(os.path.basename(ruta))[0]
        meta, md = leer_md(ruta)
        cuerpo, palabras = markdown_a_html(md)
        entrada = por_url.get(meta.get("url")) or por_archivo.get(f"notas/{slug}.html")
        if not entrada:
            entrada = {k: meta.get(k) for k in ("medio", "fecha", "titulo", "url", "resumen", "temas", "autor", "tipo")}
            entrada["tipo"] = entrada.get("tipo") or "semanal"
            datos["notas"].append(entrada)
        if meta.get("fecha") and re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["fecha"]):
            entrada["fecha"] = meta["fecha"]
        if meta.get("titulo"):
            entrada["titulo"] = meta["titulo"]
        entrada.update({"archivo": f"notas/{slug}.html", "palabras": palabras, "lectura_min": max(1, round(palabras / 200))})
        generadas.append((slug, meta, cuerpo, palabras, entrada))
    # 2) Notas publicadas en medios: solo el extracto guardado en el índice, con enlace al original
    usados = {s for s, *_ in generadas}
    # de la más antigua a la más nueva, así la publicación original conserva el nombre base
    # y la republicación en otro medio recibe el sufijo del medio
    for entrada in sorted(datos["notas"], key=lambda n: n["fecha"]):
        if not entrada.get("extracto") or not entrada.get("url"):
            continue
        slug = slug_de_url(entrada["url"], entrada["medio"], usados)
        usados.add(slug)
        cuerpo = "".join(f"<p>{inline(p)}</p>" for p in re.split(r"\n\s*\n", entrada["extracto"].strip()) if p.strip())
        palabras = int(entrada.get("palabras") or 0)
        entrada.update({"archivo": f"notas/{slug}.html", "lectura_min": max(1, round(palabras / 200)) if palabras else entrada.get("lectura_min", 1)})
        meta = dict(entrada)
        generadas.append((slug, meta, cuerpo, palabras, entrada))
    datos["notas"].sort(key=lambda n: n["fecha"], reverse=True)
    orden = [n for n in datos["notas"] if n.get("archivo")]
    for slug, meta, cuerpo, palabras, entrada in generadas:
        i = orden.index(entrada)
        siguiente = orden[i - 1] if i > 0 else None          # más nueva
        anterior = orden[i + 1] if i + 1 < len(orden) else None  # más vieja
        with open(os.path.join(OUT, f"{slug}.html"), "w", encoding="utf-8") as f:
            f.write(pagina(meta, cuerpo, palabras, slug, anterior, siguiente, masthead, footer))
    datos["actualizado"] = date.today().isoformat()
    json.dump(datos, open(ruta_datos, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    actualizar_sitemap(orden)
    print(f"{len(generadas)} páginas generadas; {len(datos['notas'])} notas en el índice")


def actualizar_sitemap(notas: list) -> None:
    """Reemplaza las entradas notas/*.html del sitemap por las vigentes."""
    ruta = os.path.join(RAIZ, "sitemap.xml")
    s = open(ruta, encoding="utf-8").read()
    s = re.sub(r"  <url>\s*<loc>[^<]*/notas/[^<]*</loc>.*?</url>\n", "", s, flags=re.S)
    partes = []
    for n in notas:
        f = n["fecha"]
        lastmod = f if re.fullmatch(r"\d{4}-\d{2}-\d{2}", f) else (f + "-15" if re.fullmatch(r"\d{4}-\d{2}", f) else f[:4] + "-01-01")
        partes.append(f"  <url>\n    <loc>{SITIO}{n['archivo']}</loc>\n    <lastmod>{lastmod}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.6</priority>\n  </url>\n")
    entradas = "".join(partes)
    s = s.replace("</urlset>", entradas + "</urlset>")
    open(ruta, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    main()
