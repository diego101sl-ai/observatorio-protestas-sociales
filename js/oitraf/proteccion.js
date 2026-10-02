/**
 * Protección de la autoría de OITraF.
 *
 * No bloquea la selección ni el clic derecho (eso se salta en segundos y
 * perjudica a lectores con tecnologías de asistencia). En cambio:
 *  - al copiar un fragmento de texto, agrega al portapapeles la fuente, la URL,
 *    la fecha de consulta y la licencia, en texto plano y en HTML con enlace;
 *  - completa el bloque «Cómo citar» con la fecha y la URL actuales y ofrece
 *    copiar la cita;
 *  - impide que la página se incruste en un marco de otro sitio (clickjacking),
 *    ya que GitHub Pages no permite cabeceras HTTP propias.
 */
const NOMBRE = "OITraF · Observatorio Internacional del Trabajo del Futuro";
const LICENCIA = "Elaboraciones propias de OITraF bajo licencia CC BY 4.0 (reutilización permitida citando la fuente con enlace). Los datos oficiales conservan la licencia del organismo que los publica.";
const MINIMO = 60; // caracteres: por debajo se copia sin pie (una cifra, un nombre)

function urlLimpia() {
  return location.href.split("#")[0];
}

function fechaLarga() {
  return new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

function escapar(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Título de la página sin la marca repetida (la cita ya nombra a OITraF). */
function tituloPagina() {
  const t = document.title.replace(/^OITraF\s*·\s*/, "").replace(/\s*·\s*OITraF$/, "").trim();
  return t === "Observatorio Internacional del Trabajo del Futuro"
    ? "Indicadores del mercado laboral, cobertura de medios y protestas sociales"
    : t;
}

export function citaSugerida() {
  const anio = new Date().getFullYear();
  return `OITraF (${anio}). ${tituloPagina()}. Observatorio Internacional del Trabajo del Futuro. Recuperado el ${fechaLarga()} de ${urlLimpia()}`;
}

function atribucionAlCopiar() {
  document.addEventListener("copy", (ev) => {
    const objetivo = ev.target;
    if (objetivo && objetivo.closest && objetivo.closest("input, textarea, [contenteditable]")) return;
    const seleccion = document.getSelection();
    const texto = seleccion ? seleccion.toString() : "";
    if (!texto || texto.trim().length < MINIMO || !ev.clipboardData) return;
    const url = urlLimpia();
    const pie = `\n\n—\nFuente: ${NOMBRE}. «${tituloPagina()}», ${url} (consultado el ${fechaLarga()}). ${LICENCIA}`;
    ev.clipboardData.setData("text/plain", texto + pie);
    ev.clipboardData.setData(
      "text/html",
      `<div>${escapar(texto).replace(/\n/g, "<br>")}</div>` +
      `<p style="font-size:smaller;color:#555">Fuente: <a href="${escapar(url)}">${escapar(NOMBRE)}</a>, «${escapar(tituloPagina())}» (consultado el ${fechaLarga()}). ${escapar(LICENCIA)}</p>`,
    );
    ev.preventDefault();
  });
}

function bloqueCita() {
  const cita = document.getElementById("cita-texto");
  if (cita) cita.textContent = citaSugerida();
  const btn = document.getElementById("cita-copiar");
  if (btn) {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(citaSugerida());
        btn.textContent = "Cita copiada";
      } catch {
        btn.textContent = "Seleccioná y copiá el texto";
      }
      setTimeout(() => { btn.textContent = "Copiar cita"; }, 2200);
    });
  }
}

function evitarMarcos() {
  try {
    if (window.top !== window.self) window.top.location.replace(location.href);
  } catch {
    // otro origen: el navegador ya bloquea el acceso; no hay nada más que hacer
  }
}

function anioDelPie() {
  const nodo = document.getElementById("anio-legal");
  if (nodo && !nodo.textContent) nodo.textContent = String(new Date().getFullYear());
}

export function initProteccion() {
  evitarMarcos();
  atribucionAlCopiar();
  bloqueCita();
  anioDelPie();
}

initProteccion();
