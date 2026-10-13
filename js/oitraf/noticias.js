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

/** Desarrollo breve: la primera oración u oraciones hasta ~240 caracteres. */
function breve(texto, largo = 240) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  if (t.length <= largo) return t;
  const corte = t.slice(0, largo);
  const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("; "));
  return (fin > 90 ? corte.slice(0, fin + 1) : corte.replace(/\s+\S*$/, "") + "…").trim();
}

/**
 * Tarjeta de una noticia: plegada muestra la ficha mínima, el título y un desarrollo
 * breve; al tocar el título o el cuerpo se despliega todo (cuerpo entero, actores,
 * ficha, declaraciones y enlaces). Los enlaces externos no pliegan ni despliegan.
 */
export function itemNoticia(h) {
  const links = (h.links || []).map((l) => ({ url: urlLink(l), x: esX(l) })).filter((l) => l.url);
  const principal = links.find((l) => !l.x) || links[0];
  const p = paisDeHecho(h);
  const texto = h.cuerpo || h.resumen || "";
  const cuerpo = h.cuerpo ? parrafos(h.cuerpo) : (h.resumen ? [h.resumen] : []);
  const resumenBreve = breve(texto);
  const region = [h.region, h.provincia].filter(Boolean).join(" · ");
  const ficha = [["Eje", h.eje && h.eje !== h.sector ? h.eje : ""], ["Género", h.genero], ["Órbita", h.orbita], ["Momento", h.momento], ["Región", region], ["Geo", h.geo], ["Tag", h.tag]]
    .filter(([, v]) => v && String(v).trim());
  const idDetalle = `det-${h.id || Math.random().toString(36).slice(2)}`;

  const btn = el("button", { class: "hecho-abrir", type: "button", "aria-expanded": "false", "aria-controls": idDetalle }, h.titulo);
  const pista = el("span", { class: "hecho-pista" }, "Leer más ▾");
  const detalle = el("div", { class: "hecho-detalle", id: idDetalle, hidden: true },
    cuerpo.length ? el("div", { class: "hecho-cuerpo" }, ...cuerpo.map((t) => el("p", {}, t))) : null,
    h.actores?.length ? el("div", { class: "hecho-actores" }, el("span", { class: "hecho-rotulo" }, "Actores"), ...h.actores.map((a) => el("span", {}, a))) : null,
    ficha.length ? el("div", { class: "hecho-ficha" }, ...ficha.map(([k, v]) => el("span", {}, el("b", {}, `${k}: `), String(v)))) : null,
    h.declaraciones?.length ? el("div", { class: "hecho-decl" },
      el("span", { class: "hecho-rotulo" }, `Declaraciones · ${h.declaraciones.length}`),
      ...h.declaraciones.map((d) => el("blockquote", {}, `«${d.cita}»`, d.quien ? el("cite", {}, d.quien) : null))) : null,
    links.length ? el("div", { class: "hecho-leer" },
      ...links.map((l, i) => el("a", { href: l.url, target: "_blank", rel: "noopener" },
        l.x ? "Publicación en X ↗" : (l === principal ? `Leer la nota en ${h.medio} ↗` : `Enlace ${i + 1} ↗`)))) : null,
  );
  const li = el("li", { class: "hecho hecho--plegable" },
    el("div", { class: "hecho-meta" },
      bandera(h), p ? el("span", {}, p.nombre) : null,
      el("span", { class: "escala-tag" }, h.escala),
      h.id ? el("span", { class: "hecho-ur" }, `UR ${h.id}`) : null,
      el("span", {}, h.medio), el("span", {}, fmtFechaLarga(h.fecha))),
    el("h3", { class: "hecho-titulo" }, btn),
    resumenBreve ? el("p", { class: "hecho-breve" }, resumenBreve, " ", pista) : null,
    detalle,
  );
  const alternar = (abrir) => {
    const abierto = abrir ?? detalle.hidden;
    detalle.hidden = !abierto;
    li.classList.toggle("is-open", abierto);
    btn.setAttribute("aria-expanded", String(abierto));
    pista.textContent = abierto ? "Mostrar menos ▴" : "Leer más ▾";
    li.querySelector(".hecho-breve")?.toggleAttribute("hidden", abierto && cuerpo.length > 0);
  };
  btn.addEventListener("click", () => alternar());
  li.addEventListener("click", (ev) => {
    if (ev.target.closest("a, button") || window.getSelection()?.toString()) return;
    alternar();
  });
  return li;
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
