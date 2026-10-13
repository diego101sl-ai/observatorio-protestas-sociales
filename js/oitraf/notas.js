/**
 * Página «Publicaciones»: notas en medios y notas semanales del equipo.
 * Lee data/notas.json (una entrada por nota: medio, fecha, título, url, resumen,
 * temas, autor, tipo «nota» o «semanal», y opcionalmente «archivo» para una
 * nota alojada en este sitio). Filtros por medio, año y texto.
 */
import { initTema, fetchJson, el, vaciar, fmtFechaLarga } from "./comun.js";

initTema();

const $ = (id) => document.getElementById(id);
const state = { datos: null, medio: "Todos", anio: "Todos", q: "" };

function fmtFecha(f) {
  if (!f) return "";
  if (/^\d{4}$/.test(f)) return f;
  if (/^\d{4}-\d{2}$/.test(f)) {
    const d = new Date(`${f}-15T12:00:00Z`);
    return d.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return fmtFechaLarga(f);
}

function chipRow(cont, valores, activo, alElegir) {
  vaciar(cont);
  for (const v of valores) {
    const b = el("button", { class: `chip${v === activo ? " is-active" : ""}`, type: "button", "aria-pressed": String(v === activo) }, v);
    b.addEventListener("click", () => alElegir(v));
    cont.append(b);
  }
}

function itemNota(n) {
  const href = n.archivo || n.url;
  const meta = [n.medio, fmtFecha(n.fecha), n.autor && n.autor !== "Diego Lorca" ? n.autor : null].filter(Boolean);
  return el("li", { class: "hecho" },
    el("div", { class: "hecho-meta" }, ...meta.map((m, i) => el("span", {}, (i ? " · " : "") + m)), n.tipo === "semanal" ? el("span", { class: "escala-tag" }, " nota semanal") : null),
    el("h3", { class: "hecho-titulo" }, href ? el("a", { href, target: n.archivo ? "_self" : "_blank", rel: "noopener" }, n.titulo) : n.titulo),
    n.resumen ? el("p", { class: "hecho-resumen" }, n.resumen) : null,
    n.temas?.length ? el("div", { class: "hecho-links" }, ...n.temas.map((t) => el("span", { class: "sector-chip" }, t))) : null,
  );
}

function render() {
  const d = state.datos;
  const todas = d.notas.filter((n) => n.tipo !== "semanal");
  const semanales = d.notas.filter((n) => n.tipo === "semanal");

  const lsem = $("lista-semanales");
  vaciar(lsem);
  if (semanales.length) {
    for (const n of semanales) lsem.append(itemNota(n));
    $("sem-nota").textContent = `${semanales.length} nota${semanales.length === 1 ? "" : "s"} del equipo.`;
  } else {
    lsem.append(el("li", { class: "hecho" }, el("p", { class: "hecho-resumen" }, "Las primeras notas semanales se publican próximamente. Suscribite para recibirlas por correo."),
      el("div", { class: "hecho-links" }, el("a", { class: "btn btn-outline", href: "index.html#suscripcion" }, "Recibir las notas"))));
    $("sem-nota").textContent = "";
  }

  const medios = ["Todos", ...[...new Set(todas.map((n) => n.medio))]];
  const anios = ["Todos", ...[...new Set(todas.map((n) => n.fecha.slice(0, 4)))].sort().reverse()];
  chipRow($("chips-medio"), medios, state.medio, (v) => { state.medio = v; render(); });
  chipRow($("chips-anio"), anios, state.anio, (v) => { state.anio = v; render(); });

  const q = state.q.trim().toLowerCase();
  const lista = todas
    .filter((n) => state.medio === "Todos" || n.medio === state.medio)
    .filter((n) => state.anio === "Todos" || n.fecha.startsWith(state.anio))
    .filter((n) => !q || `${n.titulo} ${n.resumen || ""} ${(n.temas || []).join(" ")} ${n.medio}`.toLowerCase().includes(q));

  const ul = $("lista-notas");
  vaciar(ul);
  for (const n of lista) ul.append(itemNota(n));
  $("pub-vacio").hidden = lista.length > 0;
  $("pub-cuenta").textContent = `${lista.length} de ${todas.length} notas · ${medios.length - 1} medios.`;
}

async function iniciar() {
  try {
    state.datos = await fetchJson("data/notas.json");
  } catch {
    state.datos = { notas: [] };
  }
  $("pub-gen").textContent = state.datos.actualizado ? `Lista actualizada el ${fmtFechaLarga(state.datos.actualizado)}.` : "";
  $("pub-q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  render();
}
iniciar();
