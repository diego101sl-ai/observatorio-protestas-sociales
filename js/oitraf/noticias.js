/**
 * Página «Las últimas noticias del mundo del trabajo»: las unidades de registro
 * del sector Trabajadores de los últimos DIAS días, con la ficha completa que
 * publica el robot en data/noticias.json (cuerpo entero, actores, enlaces, eje,
 * género, órbita, región, momento, tag y declaraciones), organizadas en tres
 * bloques por escala (Internacional, Latinoamérica, Nacional/Argentina, que
 * incluye la Provincial) y, dentro de cada bloque, de la más nueva a la más
 * vieja agrupadas por día. La ventana es móvil: lo que cumple DIAS+1 días
 * desaparece solo y lo nuevo entra con la siguiente sincronización. Si todavía
 * no existe noticias.json se usa el extracto de data/hechos.json.
 */
import { initTema, fetchJson, el, vaciar, fmtFechaLarga, paisDeHecho } from "./comun.js";

initTema();

const $ = (id) => document.getElementById(id);
const DIAS = 10;
const PAGINA = matchMedia("(max-width: 640px)").matches ? 8 : 12;
export const BLOQUES = [
  { id: "internacional", escalas: ["Internacional"], titulo: "Internacional" },
  { id: "latinoamerica", escalas: ["Latinoamericana"], titulo: "Latinoamérica" },
  { id: "nacional", escalas: ["Nacional", "Provincial"], titulo: "Nacional · Argentina" },
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

/** Cuerpo de la UR en párrafos (saltos de línea del dashboard; si no hay, uno solo). */
function parrafos(texto) {
  const partes = String(texto || "").split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return partes.length ? partes : [];
}

function urlLink(l) { return typeof l === "string" ? l : l?.url; }
function esX(l) { return typeof l !== "string" && l?.tipo === "x"; }

/** Tarjeta de una noticia con la ficha completa. */
export function itemNoticia(h) {
  const links = (h.links || []).map((l) => ({ url: urlLink(l), x: esX(l) })).filter((l) => l.url);
  const principal = links.find((l) => !l.x) || links[0];
  const titulo = principal ? el("a", { href: principal.url, target: "_blank", rel: "noopener" }, h.titulo) : h.titulo;
  const p = paisDeHecho(h);
  const cuerpo = h.cuerpo ? parrafos(h.cuerpo) : (h.resumen ? [h.resumen] : []);
  const region = [h.region, h.provincia].filter(Boolean).join(" · ");
  const ficha = [["Eje", h.eje && h.eje !== h.sector ? h.eje : ""], ["Género", h.genero], ["Órbita", h.orbita], ["Momento", h.momento], ["Región", region], ["Geo", h.geo], ["Tag", h.tag]]
    .filter(([, v]) => v && String(v).trim());
  return el("li", { class: "hecho" },
    el("div", { class: "hecho-meta" },
      bandera(h), p ? el("span", {}, p.nombre) : null,
      el("span", { class: "escala-tag" }, h.escala),
      h.id ? el("span", { class: "hecho-ur" }, `UR ${h.id}`) : null,
      el("span", {}, h.medio), el("span", {}, fmtFechaLarga(h.fecha))),
    el("h3", { class: "hecho-titulo" }, titulo),
    cuerpo.length ? el("div", { class: "hecho-cuerpo" }, ...cuerpo.map((t) => el("p", {}, t))) : null,
    h.actores?.length ? el("div", { class: "hecho-actores" }, ...h.actores.map((a) => el("span", {}, a))) : null,
    ficha.length ? el("div", { class: "hecho-ficha" }, ...ficha.map(([k, v]) => el("span", {}, el("b", {}, `${k}: `), String(v)))) : null,
    h.declaraciones?.length ? el("details", { class: "hecho-decl" },
      el("summary", {}, `Declaraciones · ${h.declaraciones.length}`),
      ...h.declaraciones.map((d) => el("blockquote", {}, `«${d.cita}»`, d.quien ? el("cite", {}, d.quien) : null))) : null,
    links.length ? el("div", { class: "hecho-leer" },
      ...links.map((l, i) => el("a", { href: l.url, target: "_blank", rel: "noopener" },
        l.x ? "Publicación en X ↗" : (l === principal ? `Leer en ${h.medio} ↗` : `Enlace ${i + 1} ↗`)))) : null,
  );
}

function coincide(h, q) {
  return !q || `${h.titulo} ${h.cuerpo || h.resumen || ""} ${(h.actores || []).join(" ")} ${h.medio} ${h.eje || ""} ${h.region || ""} ${h.provincia || ""} ${h.tag || ""}`.toLowerCase().includes(q);
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

async function cargar() {
  try {
    const d = await fetchJson("data/noticias.json");
    if (Array.isArray(d.noticias)) return { generado: d.generado, hechos: d.noticias };
  } catch { /* todavía no existe: se usa el extracto de hechos.json */ }
  try {
    const d = await fetchJson("data/hechos.json");
    return { generado: d.generado, hechos: d.hechos || [] };
  } catch {
    return { generado: null, hechos: [] };
  }
}

async function iniciar() {
  const d = await cargar();
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
