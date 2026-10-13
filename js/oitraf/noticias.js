/**
 * Página «Las últimas noticias del mundo del trabajo»: las unidades de registro
 * del sector Trabajadores de data/hechos.json (sincronizado desde el dashboard
 * cada 3 horas) de los últimos DIAS días, organizadas en tres bloques por escala
 * (Internacional, Latinoamérica, Nacional/Argentina, que incluye la Provincial)
 * y, dentro de cada bloque, de la más nueva a la más vieja agrupadas por día.
 * La ventana es móvil: lo que cumple DIAS+1 días desaparece solo y lo nuevo
 * entra con la siguiente sincronización. Cada noticia lleva la bandera del
 * país al que refiere y enlaza a la nota original.
 */
import { initTema, fetchJson, el, vaciar, fmtFechaLarga, paisDeHecho } from "./comun.js";

initTema();

const $ = (id) => document.getElementById(id);
const DIAS = 10;
const PAGINA = matchMedia("(max-width: 640px)").matches ? 8 : 12;
export const BLOQUES = [
  { id: "internacional", escalas: ["Internacional"], titulo: "Internacional", kicker: "Mundo" },
  { id: "latinoamerica", escalas: ["Latinoamericana"], titulo: "Latinoamérica", kicker: "Región" },
  { id: "nacional", escalas: ["Nacional", "Provincial"], titulo: "Nacional · Argentina", kicker: "Argentina" },
];
const state = { hechos: [], q: "", mostrar: Object.fromEntries(BLOQUES.map((b) => [b.id, PAGINA])) };

/** Fecha límite (inclusive): hoy menos DIAS-1 días, en hora local. */
export function desdeVentana(dias = DIAS, hoy = new Date()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Noticias del sector Trabajadores dentro de la ventana, de la más nueva a la más vieja. */
export function noticiasRecientes(hechos, dias = DIAS) {
  const desde = desdeVentana(dias);
  return (hechos || [])
    .filter((h) => h.sector === "TRABAJADORES" && h.fecha >= desde)
    .sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : (b.id || 0) - (a.id || 0)));
}

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

/** Tarjeta de una noticia. */
export function itemNoticia(h, { compacto = false } = {}) {
  const link = h.links?.[0];
  const titulo = link ? el("a", { href: link, target: "_blank", rel: "noopener" }, h.titulo) : h.titulo;
  const p = paisDeHecho(h);
  return el("li", { class: "hecho" },
    el("div", { class: "hecho-meta" },
      bandera(h), p ? el("span", {}, p.nombre) : null,
      h.escala === "Provincial" ? el("span", { class: "escala-tag" }, "Provincial") : null,
      el("span", {}, h.medio), el("span", {}, fmtFechaLarga(h.fecha))),
    el("h3", { class: "hecho-titulo" }, titulo),
    !compacto && h.resumen ? el("p", { class: "hecho-resumen" }, h.resumen) : null,
    !compacto && h.actores?.length ? el("div", { class: "hecho-actores" }, ...h.actores.slice(0, 6).map((a) => el("span", {}, a))) : null,
    !compacto && link ? el("div", { class: "hecho-leer" }, el("a", { href: link, target: "_blank", rel: "noopener" }, `Leer en ${h.medio} ↗`),
      ...(h.links || []).slice(1, 3).map((u, i) => el("a", { href: u, target: "_blank", rel: "noopener" }, `enlace ${i + 2} ↗`))) : null,
  );
}

function coincide(h, q) {
  return !q || `${h.titulo} ${h.resumen || ""} ${(h.actores || []).join(" ")} ${h.medio} ${h.eje || ""}`.toLowerCase().includes(q);
}

function renderBloque(b) {
  const q = state.q.trim().toLowerCase();
  const lista = state.hechos.filter((h) => b.escalas.includes(h.escala)).filter((h) => coincide(h, q));
  const ul = $(`lista-${b.id}`);
  vaciar(ul);
  let dia = "";
  for (const h of lista.slice(0, state.mostrar[b.id])) {
    if (h.fecha !== dia) {
      dia = h.fecha;
      ul.append(el("li", { class: "noticia-dia" }, etiquetaDia(dia)));
    }
    ul.append(itemNoticia(h));
  }
  $(`vacio-${b.id}`).hidden = lista.length > 0;
  const mas = $(`mas-${b.id}`);
  mas.hidden = lista.length <= state.mostrar[b.id];
  mas.onclick = () => { state.mostrar[b.id] += PAGINA; renderBloque(b); };
  const total = state.hechos.filter((h) => b.escalas.includes(h.escala)).length;
  $(`cuenta-${b.id}`).textContent = `${lista.length.toLocaleString("es-AR")} noticia${lista.length === 1 ? "" : "s"}${lista.length !== total ? ` de ${total.toLocaleString("es-AR")}` : ""} en los últimos ${DIAS} días.`;
  $(`chip-${b.id}`).textContent = `${b.titulo} · ${lista.length}`;
}

function render() {
  for (const b of BLOQUES) renderBloque(b);
}

async function iniciar() {
  let d;
  try {
    d = await fetchJson("data/hechos.json");
  } catch {
    d = { hechos: [] };
  }
  state.hechos = noticiasRecientes(d.hechos);
  const desde = desdeVentana();
  $("noticias-gen").textContent = d.generado
    ? `Del ${fmtFechaLarga(desde)} a hoy · actualizado el ${fmtFechaLarga(d.generado)}.`
    : "";
  $("noticias-q").addEventListener("input", (e) => { state.q = e.target.value; for (const b of BLOQUES) state.mostrar[b.id] = PAGINA; render(); });
  if (!state.hechos.length) {
    for (const b of BLOQUES) $(`vacio-${b.id}`).textContent = "Las noticias se publican en cuanto termina la próxima sincronización del relevamiento.";
  }
  render();
}
iniciar();
