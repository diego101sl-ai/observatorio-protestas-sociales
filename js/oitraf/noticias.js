/**
 * Página «Las últimas noticias del mundo del trabajo»: las unidades de registro
 * del sector Trabajadores de data/hechos.json (sincronizado desde el dashboard
 * cada 3 horas), de la más nueva a la más vieja, agrupadas por día, con filtros
 * por escala, medio y texto. Cada noticia lleva la bandera del país al que
 * refiere (deducida del título y el resumen; Argentina para las escalas
 * Nacional y Provincial) y enlaza a la nota original.
 */
import { initTema, fetchJson, el, vaciar, fmtFechaLarga, ESCALAS, paisDeHecho } from "./comun.js";

initTema();

const $ = (id) => document.getElementById(id);
const PAGINA = matchMedia("(max-width: 640px)").matches ? 10 : 20;
const state = { hechos: [], escala: "Todas", medio: "Todos", q: "", mostrar: PAGINA };

function bandera(h) {
  const p = paisDeHecho(h);
  return p ? el("img", { class: "bandera", src: `img/banderas/${p.cc}.svg`, alt: "", title: p.nombre, width: "16", height: "12", decoding: "async" }) : null;
}

function etiquetaDia(iso) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  const dif = Math.round((hoy - d) / 86400000);
  if (dif === 0) return "Hoy";
  if (dif === 1) return "Ayer";
  return fmtFechaLarga(iso);
}

/** Tarjeta de una noticia (también la usa la portada). */
export function itemNoticia(h, { compacto = false } = {}) {
  const link = h.links?.[0];
  const titulo = link ? el("a", { href: link, target: "_blank", rel: "noopener" }, h.titulo) : h.titulo;
  const p = paisDeHecho(h);
  return el("li", { class: "hecho" },
    el("div", { class: "hecho-meta" },
      bandera(h), p ? el("span", {}, p.nombre) : null,
      el("span", { class: "escala-tag" }, h.escala), el("span", {}, h.medio), el("span", {}, fmtFechaLarga(h.fecha))),
    el("h3", { class: "hecho-titulo" }, titulo),
    !compacto && h.resumen ? el("p", { class: "hecho-resumen" }, h.resumen) : null,
    !compacto && h.actores?.length ? el("div", { class: "hecho-actores" }, ...h.actores.slice(0, 6).map((a) => el("span", {}, a))) : null,
    !compacto && link ? el("div", { class: "hecho-leer" }, el("a", { href: link, target: "_blank", rel: "noopener" }, `Leer en ${h.medio} ↗`),
      ...(h.links || []).slice(1, 3).map((u, i) => el("a", { href: u, target: "_blank", rel: "noopener" }, `enlace ${i + 2} ↗`))) : null,
  );
}

function chipRow(cont, valores, activo, alElegir) {
  vaciar(cont);
  for (const v of valores) {
    const b = el("button", { class: `chip${v === activo ? " is-active" : ""}`, type: "button", "aria-pressed": String(v === activo) }, v);
    b.addEventListener("click", () => alElegir(v));
    cont.append(b);
  }
}

function filtradas() {
  const q = state.q.trim().toLowerCase();
  return state.hechos
    .filter((h) => state.escala === "Todas" || h.escala === state.escala)
    .filter((h) => state.medio === "Todos" || h.medio === state.medio)
    .filter((h) => !q || `${h.titulo} ${h.resumen || ""} ${(h.actores || []).join(" ")} ${h.medio} ${h.eje || ""}`.toLowerCase().includes(q));
}

function render() {
  chipRow($("chips-escala"), ["Todas", ...ESCALAS], state.escala, (v) => { state.escala = v; state.mostrar = PAGINA; render(); });
  const lista = filtradas();
  const ul = $("noticias-lista");
  vaciar(ul);
  let dia = "";
  for (const h of lista.slice(0, state.mostrar)) {
    if (h.fecha !== dia) {
      dia = h.fecha;
      ul.append(el("li", { class: "noticia-dia" }, etiquetaDia(dia)));
    }
    ul.append(itemNoticia(h));
  }
  $("noticias-vacio").hidden = lista.length > 0;
  const mas = $("noticias-mas");
  mas.hidden = lista.length <= state.mostrar;
  mas.onclick = () => { state.mostrar += PAGINA; render(); };
  $("noticias-cuenta").textContent = `${lista.length.toLocaleString("es-AR")} noticia${lista.length === 1 ? "" : "s"}${lista.length !== state.hechos.length ? ` de ${state.hechos.length.toLocaleString("es-AR")}` : ""}.`;
}

async function iniciar() {
  let d;
  try {
    d = await fetchJson("data/hechos.json");
  } catch {
    d = { hechos: [] };
  }
  state.hechos = (d.hechos || []).filter((h) => h.sector === "TRABAJADORES")
    .sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : (b.id || 0) - (a.id || 0)));
  $("noticias-gen").textContent = d.generado ? `Actualizado el ${fmtFechaLarga(d.generado)}.` : "";
  const medios = ["Todos", ...[...new Set(state.hechos.map((h) => h.medio))].sort((a, b) => a.localeCompare(b, "es"))];
  const sel = $("f-medio");
  vaciar(sel);
  for (const m of medios) sel.append(el("option", { value: m }, m === "Todos" ? "Todos los medios" : m));
  sel.addEventListener("change", (e) => { state.medio = e.target.value; state.mostrar = PAGINA; render(); });
  $("noticias-q").addEventListener("input", (e) => { state.q = e.target.value; state.mostrar = PAGINA; render(); });
  if (!state.hechos.length) {
    $("noticias-cuenta").textContent = "";
    $("noticias-vacio").textContent = "Las noticias se publican en cuanto termina la próxima sincronización del relevamiento.";
  }
  render();
}
iniciar();
