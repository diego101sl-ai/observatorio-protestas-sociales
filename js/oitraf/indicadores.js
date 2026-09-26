/**
 * Explorador de indicadores: todas las series oficiales, filtrables por escala,
 * geografía, tema y fuente, con gráfico, tabla, descarga CSV y enlace a la fuente.
 */
import {
  initTema, fetchJson, el, vaciar, fmtNum, fmtCompacto, fmtPeriodo, fmtPeriodoCorto, fmtDelta, fmtFechaLarga,
  nombreFuente, FUENTE_CORTA, Catalogo, derivarSeries, descargarCSV,
} from "./comun.js";
import { lineChart, barChart, tabla } from "./graficos.js";

const state = { cat: null, escala: "", geo: "", tema: "", fuente: "", q: "", limite: 24 };
const $ = (id) => document.getElementById(id);

function leerURL() {
  const p = new URLSearchParams(location.search);
  state.geo = p.get("geo") || "";
  state.tema = p.get("tema") || "";
  state.escala = p.get("escala") || "";
  state.fuente = p.get("fuente") || "";
  state.q = p.get("q") || "";
}
function escribirURL() {
  const p = new URLSearchParams();
  for (const k of ["escala", "geo", "tema", "fuente", "q"]) if (state[k]) p.set(k, state[k]);
  history.replaceState(null, "", `${location.pathname}${p.toString() ? "?" + p : ""}`);
}

function opciones(select, lista, actual, primera) {
  vaciar(select);
  select.append(el("option", { value: "" }, primera));
  for (const [v, t] of lista) select.append(el("option", { value: v, selected: v === actual ? true : null }, t));
  if (actual && !lista.some(([v]) => v === actual)) { select.append(el("option", { value: actual, selected: true }, actual)); }
}

function poblarControles() {
  const cat = state.cat;
  opciones($("f-escala"), [["Nacional", "Nacional (Argentina)"], ["Latinoamericana", "Latinoamericana"], ["Internacional", "Internacional"]], state.escala, "Todas las escalas");
  opciones($("f-geo"), cat.geosDe(state.escala || null), state.geo, "Todas las geografías");
  const temas = cat.temasDe({ escala: state.escala || null, geo: state.geo || null }).map((t) => [t, cat.nombreTema(t)]);
  opciones($("f-tema"), temas, state.tema, "Todos los temas");
  const fuentes = [...new Set(cat.filtrar({ escala: state.escala || null, geo: state.geo || null, tema: state.tema || null }).map((s) => s.fuente))]
    .map((f) => [f, FUENTE_CORTA[f] || f]);
  opciones($("f-fuente"), fuentes, state.fuente, "Todas las fuentes");
  $("f-q").value = state.q;
}

function coincide(s, q) {
  if (!q) return true;
  const t = `${s.nombre} ${s.descripcion} ${s.geo_nombre} ${s.codigo} ${s.tema}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => t.includes(w));
}

function resultados() {
  return state.cat.filtrar({ escala: state.escala || null, geo: state.geo || null, tema: state.tema || null, fuente: state.fuente || null })
    .filter((s) => coincide(s, state.q))
    .sort((a, b) => {
      // Argentina primero, luego por tema, frecuencia más alta y nombre
      if ((a.geo === "ARG") !== (b.geo === "ARG")) return a.geo === "ARG" ? -1 : 1;
      if (a.tema !== b.tema) return state.cat.nombreTema(a.tema).localeCompare(state.cat.nombreTema(b.tema), "es");
      if (a.geo_nombre !== b.geo_nombre) return a.geo_nombre.localeCompare(b.geo_nombre, "es");
      const fr = { mensual: 0, trimestral: 1, semestral: 2, anual: 3 };
      return (fr[a.frecuencia] ?? 9) - (fr[b.frecuencia] ?? 9);
    });
}

function tarjeta(s) {
  const grande = ["personas", "ARS", "miles de puestos", "USD PPA 2021"].includes(s.unidad);
  const chart = el("div", { class: "chart" });
  const tablaCont = el("div", { class: "table-scroll", hidden: true });
  const btnTabla = el("button", { class: "tool-btn", type: "button", "aria-pressed": "false" }, "Tabla");
  const btnCsv = el("button", { class: "tool-btn", type: "button" }, "CSV");
  const linkFuente = el("a", { class: "tool-btn", href: s.url, target: "_blank", rel: "noopener" }, "Fuente ↗");
  const d = s.anterior ? fmtDelta(s.ultimo[1], s.anterior[1], s.unidad) : null;
  const card = el("article", { class: "card serie-card", id: s.id.replace(/[^a-zA-Z0-9_-]/g, "_") },
    el("div", { class: "card-head" },
      el("div", {},
        el("div", { class: "kicker" }, el("span", { class: "badge" }, s.geo_nombre), " ", el("span", { class: `badge ${state.cat.datos.fuentes?.[s.fuente]?.tipo === "gobierno" ? "badge--gob" : "badge--mul"}` }, FUENTE_CORTA[s.fuente] || s.fuente), " ", el("span", { class: "badge" }, s.frecuencia)),
        el("h3", {}, s.nombre),
        el("div", { class: "valor-actual" },
          el("span", { class: "v num" }, grande ? fmtCompacto(s.ultimo[1], s.unidad) : fmtNum(s.ultimo[1], s.unidad)),
          el("span", { class: "p" }, fmtPeriodo(s.ultimo[0])),
          d ? el("span", { class: "p" }, el("b", { class: d.clase }, d.texto), ` vs. ${fmtPeriodoCorto(s.anterior[0])}`) : null,
          s.proyeccion_desde ? el("span", { class: "p" }, `Proyecciones desde ${Number(s.proyeccion_desde) + 1}`) : null)),
      el("div", { class: "card-tools" }, btnTabla, btnCsv, linkFuente)),
    chart, tablaCont,
    el("p", { class: "card-foot" },
      s.descripcion ? `${s.descripcion} ` : "",
      `Serie ${fmtPeriodoCorto(s.serie[0][0])} → ${fmtPeriodoCorto(s.ultimo[0])} (${s.serie.length} datos). `,
      "Fuente: ", el("a", { href: s.url, target: "_blank", rel: "noopener" }, nombreFuente(s)),
      s.ajuste ? ` · ${s.ajuste}` : "", s.nota && s.fuente !== "oitraf" ? ` · ${s.nota}` : "",
      s.conservada_de ? " · dato conservado de una corrida anterior" : ""));
  lineChart(chart, { series: [{ nombre: s.nombre, puntos: s.serie, proyeccionDesde: s.proyeccion_desde }], unidad: s.unidad, alto: 220, aria: `${s.nombre}, ${s.geo_nombre}` });
  tabla(tablaCont, [{ titulo: "Período" }, { titulo: s.unidad || "Valor", num: true }], [...s.serie].reverse().map(([p, v]) => [fmtPeriodo(p), fmtNum(v, s.unidad)]));
  btnTabla.addEventListener("click", () => {
    const abrir = tablaCont.hidden;
    tablaCont.hidden = !abrir; chart.hidden = abrir;
    btnTabla.setAttribute("aria-pressed", String(abrir)); btnTabla.textContent = abrir ? "Gráfico" : "Tabla";
  });
  btnCsv.addEventListener("click", () => {
    descargarCSV(`oitraf_${s.id}.csv`, [["periodo", "valor", "unidad", "indicador", "geografia", "fuente", "url"],
      ...s.serie.map(([p, v]) => [p, v, s.unidad, s.nombre, s.geo_nombre, nombreFuente(s), s.url])]);
  });
  return card;
}

function comparacion(lista) {
  const cont = $("comparacion");
  vaciar(cont);
  cont.hidden = true;
  if (!state.tema || state.geo) return;
  // Una barra por geografía, tomando la serie más reciente de la fuente predominante.
  const porGeo = new Map();
  for (const s of lista) {
    const actual = porGeo.get(s.geo);
    if (!actual || String(s.ultimo[0]).slice(0, 4) > String(actual.ultimo[0]).slice(0, 4)) porGeo.set(s.geo, s);
  }
  const series = [...porGeo.values()];
  const unidades = new Set(series.map((s) => s.unidad));
  if (series.length < 3 || unidades.size !== 1) return;
  const unidad = [...unidades][0];
  const items = series.map((s) => ({ etiqueta: s.geo_nombre, valor: s.ultimo[1], nota: `${fmtPeriodoCorto(s.ultimo[0])} · ${FUENTE_CORTA[s.fuente]}`, destacado: s.geo === "ARG", detalle: s.nombre }))
    .sort((a, b) => b.valor - a.valor).slice(0, 40);
  const chart = el("div", { class: "chart" });
  const card = el("div", { class: "card" },
    el("div", { class: "card-head" }, el("div", {}, el("h3", {}, `${state.cat.nombreTema(state.tema)}: comparación por geografía`), el("p", { class: "sub" }, "Último dato disponible de cada geografía. Cada barra indica su período y fuente; las definiciones nacionales pueden diferir."))),
    chart);
  cont.append(card);
  cont.hidden = false;
  barChart(chart, { items, unidad, aria: `Comparación de ${state.cat.nombreTema(state.tema)} por geografía` });
}

function render() {
  const lista = resultados();
  $("resultados-meta").textContent = `${lista.length.toLocaleString("es-AR")} series${lista.length !== state.cat.series.length ? ` de ${state.cat.series.length.toLocaleString("es-AR")}` : ""}.`;
  comparacion(lista);
  const cont = $("resultados");
  vaciar(cont);
  for (const s of lista.slice(0, state.limite)) cont.append(tarjeta(s));
  const mas = $("resultados-mas");
  mas.hidden = lista.length <= state.limite;
  mas.onclick = () => { state.limite += 24; render(); };
  if (!lista.length) cont.append(el("p", { class: "aviso" }, "Ninguna serie coincide con los filtros. Probá con otra combinación o borrá la búsqueda."));

  // Catálogo completo (compacto)
  const filas = lista.slice(0, 400).map((s) => [
    el("a", { href: `#${s.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`, onclick: (ev) => { if (!document.getElementById(s.id.replace(/[^a-zA-Z0-9_-]/g, "_"))) { ev.preventDefault(); state.limite = lista.indexOf(s) + 1; render(); location.hash = s.id.replace(/[^a-zA-Z0-9_-]/g, "_"); } } }, s.nombre),
    s.geo_nombre,
    fmtNum(s.ultimo[1], s.unidad),
    el("span", { class: "periodo" }, fmtPeriodo(s.ultimo[0])),
    FUENTE_CORTA[s.fuente] || s.fuente,
  ]);
  tabla($("catalogo"), [{ titulo: "Indicador" }, { titulo: "Geografía" }, { titulo: "Último dato", num: true }, { titulo: "Período" }, { titulo: "Fuente" }], filas);
  $("catalogo-nota").textContent = lista.length > 400 ? `Se muestran 400 de ${lista.length} filas; refiná los filtros para ver el resto.` : "";
}

function enganchar() {
  const cambiar = (k, v) => { state[k] = v; if (k === "escala") { state.geo = ""; } state.limite = 24; escribirURL(); poblarControles(); render(); };
  $("f-escala").addEventListener("change", (e) => cambiar("escala", e.target.value));
  $("f-geo").addEventListener("change", (e) => cambiar("geo", e.target.value));
  $("f-tema").addEventListener("change", (e) => cambiar("tema", e.target.value));
  $("f-fuente").addEventListener("change", (e) => cambiar("fuente", e.target.value));
  let t;
  $("f-q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => cambiar("q", e.target.value.trim()), 220); });
  $("f-limpiar").addEventListener("click", () => { Object.assign(state, { escala: "", geo: "", tema: "", fuente: "", q: "", limite: 24 }); escribirURL(); poblarControles(); render(); });
  $("csv-todo").addEventListener("click", () => {
    const lista = resultados();
    descargarCSV("oitraf_indicadores.csv", [["id", "indicador", "geografia", "escala", "tema", "frecuencia", "unidad", "periodo", "valor", "fuente", "url"],
      ...lista.flatMap((s) => s.serie.map(([p, v]) => [s.id, s.nombre, s.geo_nombre, s.escala, state.cat.nombreTema(s.tema), s.frecuencia, s.unidad, p, v, nombreFuente(s), s.url]))]);
  });
}

async function main() {
  initTema();
  leerURL();
  const ind = await fetchJson("data/indicadores.json");
  state.cat = derivarSeries(new Catalogo(ind));
  if (!ind) {
    $("resultados-meta").textContent = "El archivo data/indicadores.json todavía no existe. Ejecutá el workflow «Actualizar indicadores OITraF» en GitHub Actions para generarlo.";
  }
  $("gen").textContent = ind?.generado ? `Datos generados el ${fmtFechaLarga(ind.generado)} · ${ind.total_series} series.` : "";
  poblarControles();
  enganchar();
  render();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

main();
