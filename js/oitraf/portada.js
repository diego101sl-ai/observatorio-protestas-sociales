/**
 * Portada de OITraF: placas de indicadores (Argentina, América Latina, mundo),
 * cobertura de medios del dashboard, resumen del observatorio de protestas y
 * fuentes. Todo se lee de archivos estáticos generados por los robots.
 */
import {
  initTema, fetchJson, el, vaciar, fmtNum, fmtCompacto, fmtPeriodo, fmtPeriodoCorto, fmtDelta,
  fmtFechaLarga, fmtFechaCorta, nombreFuente, FUENTE_CORTA, SECTOR_COLOR, SECTORES, ESCALAS, LATAM,
  Catalogo, derivarSeries, primeraOracion,
} from "./comun.js";
import { lineChart, barChart, columnChart, sparkline, tabla } from "./graficos.js";

const state = { cat: null, hechos: null, protestas: null, escala: "Todas", sector: "Todos", mostrar: 20 };

function $(id) { return document.getElementById(id); }

// ---------------------------------------------------------------------------
// Placas
// ---------------------------------------------------------------------------
function placaDesde(s, cfg = {}) {
  if (!s) return null;
  const [pUlt, vUlt] = s.ultimo;
  const unidad = s.unidad;
  const grande = unidad === "personas" || unidad === "ARS" || unidad === "miles de puestos" || unidad === "USD PPA 2021";
  const valorTxt = grande ? fmtCompacto(vUlt, unidad) : fmtNum(vUlt, unidad);
  const deltas = [];
  if (s.anterior) {
    const d = fmtDelta(vUlt, s.anterior[1], unidad);
    if (d) deltas.push(el("span", {}, el("b", { class: d.clase }, d.texto), ` vs. ${fmtPeriodoCorto(s.anterior[0])}`));
  }
  if (s.frecuencia !== "anual" && s.serie.length > 1) {
    const pasos = { mensual: 12, trimestral: 4, semestral: 2 }[s.frecuencia];
    if (pasos && s.serie.length > pasos) {
      const d = fmtDelta(vUlt, s.serie[s.serie.length - 1 - pasos][1], unidad);
      if (d) deltas.push(el("span", {}, el("b", { class: d.clase }, d.texto), " interanual"));
    }
  }
  const bajada = cfg.bajada || `${primeraOracion(s.descripcion || s.nombre)}`;
  const fuente = el("span", { class: "placa-fuente" },
    "Fuente: ", el("a", { href: s.url, target: "_blank", rel: "noopener" }, nombreFuente(s)),
    s.ajuste ? ` · ${s.ajuste}` : "",
    s.conservada_de ? " · dato conservado de una corrida anterior" : "");
  const card = el("article", { class: `placa${cfg.destacada ? " placa--destacada" : ""}` },
    el("span", { class: "placa-volanta" }, cfg.volanta || state.cat.nombreTema(s.tema)),
    el("div", { class: "placa-num" }, valorTxt),
    el("div", { class: "placa-titulo" }, `${cfg.titulo || s.nombre} · ${fmtPeriodo(pUlt)}`),
    el("p", { class: "placa-bajada" }, bajada),
    deltas.length ? el("div", { class: "placa-delta" }, deltas) : null,
    el("div", { class: "placa-spark", "aria-hidden": "true" }),
    fuente,
    el("a", { class: "placa-fuente", href: `indicadores.html?geo=${encodeURIComponent(s.geo)}&tema=${encodeURIComponent(s.tema)}` }, "Ver serie completa →"),
  );
  sparkline(card.querySelector(".placa-spark"), s.serie, { color: cfg.destacada ? "#ffffff" : undefined });
  return card;
}

function placaVacia(texto) {
  return el("article", { class: "placa placa--vacia" }, texto);
}

const AR_PLACAS = [
  { volanta: "Desocupación", tema: "desocupacion", prefer: ["datosar", "ilo", "wb"] },
  { volanta: "Trabajo no registrado", tema: "informalidad", prefer: ["datosar", "wb"] },
  { volanta: "Empleo registrado", fuente: "datosar", codigo: "sipa_registrados" },
  { volanta: "Salario mínimo", fuente: "datosar", codigo: "smvm" },
  { volanta: "Salario real", fuente: "oitraf", codigo: "ripte_real_ia" },
  { volanta: "Precios", fuente: "oitraf", codigo: "ipc_interanual" },
  { volanta: "Pobreza", tema: "pobreza", codigo: "pobreza_personas", prefer: ["datosar", "wb"] },
  { volanta: "Canasta básica", fuente: "oitraf", codigo: "cbt_hogar" },
  { volanta: "Salario mínimo y pobreza", fuente: "oitraf", codigo: "smvm_en_canastas", destacada: true },
  { volanta: "Actividad", tema: "actividad", prefer: ["datosar", "ilo", "wb"] },
  { volanta: "Empleo", tema: "empleo", prefer: ["datosar", "ilo", "wb"] },
  { volanta: "Subocupación", tema: "subocupacion", prefer: ["datosar", "ilo"] },
];

function renderArgentina() {
  const cont = $("placas-ar");
  vaciar(cont);
  let n = 0;
  for (const cfg of AR_PLACAS) {
    const q = { geo: "ARG", tema: cfg.tema, fuente: cfg.fuente, prefer: cfg.prefer };
    let s = cfg.codigo ? state.cat.mejor({ ...q, codigo: cfg.codigo }) : state.cat.mejor(q);
    if (!s && cfg.codigo && cfg.tema) s = state.cat.mejor(q);
    if (!s) continue;
    cont.append(placaDesde(s, cfg));
    n++;
  }
  if (!n) cont.append(placaVacia("Los indicadores de Argentina se publican cuando corre el robot de datos (ver Fuentes)."));
  const salarial = state.cat.filtrar({ geo: "ARG", fuente: "datosar" });
  $("nota-ar").textContent = salarial.length
    ? `${salarial.length} series oficiales argentinas. Universos distintos: la EPH cubre 31 aglomerados urbanos; el SIPA, el empleo con aportes; el IPC y las canastas, precios al consumidor.`
    : "";
}

// ---------------------------------------------------------------------------
// América Latina
// ---------------------------------------------------------------------------
function mejorDesocupacion(geo) {
  return state.cat.mejor({ tema: "desocupacion", geo, prefer: ["ilo", "oecd", "eurostat", "bls", "datosar", "wb"] });
}

function renderLatam() {
  const cat = state.cat;
  const items = [];
  for (const g of LATAM) {
    const s = mejorDesocupacion(g);
    if (s) items.push({ etiqueta: s.geo_nombre, valor: s.ultimo[1], nota: `${fmtPeriodoCorto(s.ultimo[0])} · ${FUENTE_CORTA[s.fuente]}`, destacado: g === "ARG", detalle: s.nombre });
  }
  items.sort((a, b) => b.valor - a.valor);
  barChart($("chart-latam-barras"), { items, unidad: "%", aria: "Tasa de desocupación por país de América Latina, último dato disponible" });
  montarTabla($("chart-latam-barras"), [{ titulo: "País" }, { titulo: "Desocupación", num: true }, { titulo: "Período y fuente" }],
    items.map((i) => [i.etiqueta, fmtNum(i.valor, "%"), i.nota]));

  const geosLinea = ["LCN", "ARG", "BRA", "MEX", "CHL", "COL"];
  const series = geosLinea.map((g) => cat.mejor({ fuente: "wb", codigo: "SL.UEM.TOTL.ZS", geo: g }))
    .filter(Boolean).map((s) => ({ nombre: s.geo_nombre, puntos: s.serie.filter(([p]) => p >= "2005") }));
  lineChart($("chart-latam-linea"), { series, unidad: "%", aria: "Evolución anual de la desocupación en América Latina" });
  montarTabla($("chart-latam-linea"), [{ titulo: "Año" }, ...series.map((s) => ({ titulo: s.nombre, num: true }))],
    unirSeries(series).map((f) => [f[0], ...f.slice(1).map((v) => fmtNum(v, "%"))]));

  const cols = [
    { titulo: "País" },
    { titulo: "Desocupación", num: true },
    { titulo: "Juvenil (15-24)", num: true },
    { titulo: "Actividad", num: true },
    { titulo: "Informalidad", num: true },
    { titulo: "Empleo vulnerable", num: true },
  ];
  const celda = (s) => (s ? el("span", {}, fmtNum(s.ultimo[1], "%"), " ", el("span", { class: "periodo" }, fmtPeriodoCorto(s.ultimo[0]))) : "—");
  const filas = LATAM.map((g) => {
    const d = mejorDesocupacion(g);
    if (!d && !cat.filtrar({ geo: g }).length) return null;
    return {
      clase: g === "ARG" ? "is-arg" : null,
      celdas: [
        cat.datos.geos?.[g]?.nombre || g,
        celda(d),
        celda(cat.mejor({ tema: "desocupacion_juvenil", geo: g, prefer: ["ilo", "wb"] })),
        celda(cat.mejor({ tema: "actividad", geo: g, prefer: ["ilo", "datosar", "wb"] })),
        celda(cat.mejor({ tema: "informalidad", geo: g, prefer: ["datosar", "wb"] })),
        celda(cat.mejor({ fuente: "wb", codigo: "SL.EMP.VULN.ZS", geo: g })),
      ],
    };
  }).filter(Boolean);
  tabla($("tabla-latam"), cols, filas, { caption: "Indicadores laborales por país de América Latina" });
}

function unirSeries(series) {
  const xs = [...new Set(series.flatMap((s) => s.puntos.map((p) => p[0])))].sort();
  const mapas = series.map((s) => new Map(s.puntos));
  return xs.map((x) => [x, ...mapas.map((m) => (m.has(x) ? m.get(x) : null))]);
}

// ---------------------------------------------------------------------------
// Mundo
// ---------------------------------------------------------------------------
const MUNDO_PLACAS = [
  { geo: "WLD", volanta: "Mundo", prefer: ["wb"], imf: "WEOWORLD" },
  { geo: "LCN", volanta: "América Latina y el Caribe", prefer: ["wb"] },
  { geo: "USA", volanta: "Estados Unidos", prefer: ["bls", "oecd", "wb"], imf: "USA" },
  { geo: "EA20", volanta: "Zona euro", prefer: ["eurostat"] },
  { geo: "EU27_2020", volanta: "Unión Europea", prefer: ["eurostat"] },
  { geo: "CHN", volanta: "China", prefer: ["wb"], imf: "CHN" },
  { geo: "IND", volanta: "India", prefer: ["wb"], imf: "IND" },
  { geo: "OECD", volanta: "OCDE", prefer: ["oecd"], alt: "OED" },
];

function renderMundo() {
  const cat = state.cat;
  const cont = $("placas-mundo");
  vaciar(cont);
  let n = 0;
  for (const cfg of MUNDO_PLACAS) {
    let s = cat.mejor({ tema: "desocupacion", geo: cfg.geo, prefer: cfg.prefer });
    if (!s && cfg.alt) s = cat.mejor({ tema: "desocupacion", geo: cfg.alt, prefer: ["wb"] });
    if (!s) continue;
    const imf = cfg.imf ? cat.mejor({ fuente: "imf", codigo: "LUR", geo: cfg.imf }) : null;
    const anio = new Date().getFullYear();
    let bajada = primeraOracion(s.descripcion || s.nombre);
    if (imf) {
      const proy = imf.serie.find(([p]) => p === String(anio)) || imf.serie.find(([p]) => p === String(anio + 1));
      if (proy) bajada += ` El FMI proyecta ${fmtNum(proy[1], "%")} para ${proy[0]}.`;
    }
    cont.append(placaDesde(s, { volanta: cfg.volanta, titulo: "Desocupación", bajada }));
    n++;
  }
  if (!n) cont.append(placaVacia("Los indicadores internacionales se publican cuando corre el robot de datos."));

  const lineas = [
    cat.mejor({ fuente: "bls", codigo: "LNS14000000", geo: "USA" }),
    cat.mejor({ fuente: "eurostat", codigo: "une_rt_m.TOTAL", geo: "EA20" }),
    cat.mejor({ fuente: "oecd", geo: "OECD" }),
    cat.mejor({ fuente: "oecd", geo: "MEX" }) || cat.mejor({ fuente: "ilo", codigo: "UNE_DEAP_SEX_AGE_RT_M.AGE_YTHADULT_YGE15", geo: "MEX" }),
    cat.mejor({ fuente: "oecd", geo: "CHL" }) || cat.mejor({ fuente: "ilo", codigo: "UNE_DEAP_SEX_AGE_RT_M.AGE_YTHADULT_YGE15", geo: "CHL" }),
  ].filter(Boolean).map((s) => ({ nombre: `${s.geo_nombre} (${FUENTE_CORTA[s.fuente]})`, puntos: s.serie.filter(([p]) => p >= "2019-01") }));
  lineChart($("chart-mundo-linea"), { series: lineas, unidad: "%", aria: "Desocupación mensual en economías de referencia" });
  montarTabla($("chart-mundo-linea"), [{ titulo: "Mes" }, ...lineas.map((s) => ({ titulo: s.nombre, num: true }))],
    unirSeries(lineas).slice(-36).map((f) => [fmtPeriodo(f[0]), ...f.slice(1).map((v) => fmtNum(v, "%"))]));

  const regiones = ["WLD", "LCN", "EAS", "SAS", "SSF", "MEA", "ECS", "NAC", "EUU"];
  const vuln = regiones.map((g) => cat.mejor({ fuente: "wb", codigo: "SL.EMP.VULN.ZS", geo: g })).filter(Boolean)
    .map((s) => ({ etiqueta: s.geo_nombre, valor: s.ultimo[1], nota: s.ultimo[0], destacado: s.geo === "LCN" }))
    .sort((a, b) => b.valor - a.valor);
  barChart($("chart-mundo-vuln"), { items: vuln, unidad: "%", aria: "Empleo vulnerable por región del mundo" });
  montarTabla($("chart-mundo-vuln"), [{ titulo: "Región" }, { titulo: "Empleo vulnerable", num: true }, { titulo: "Año" }],
    vuln.map((i) => [i.etiqueta, fmtNum(i.valor, "%"), i.nota]));
}

/** Agrega a la tarjeta de un gráfico el botón «Tabla» con la vista alternativa. */
function montarTabla(chartEl, columnas, filas) {
  const card = chartEl.closest(".card");
  if (!card) return;
  let tools = card.querySelector(".card-tools");
  if (!tools) { tools = el("div", { class: "card-tools" }); card.querySelector(".card-head")?.append(tools); }
  const cont = el("div", { class: "table-scroll", hidden: true });
  tabla(cont, columnas, filas);
  chartEl.after(cont);
  const legend = card.querySelector(".legend");
  const btn = el("button", { class: "tool-btn", type: "button", "aria-pressed": "false" }, "Tabla");
  btn.addEventListener("click", () => {
    const abierta = cont.hidden;
    cont.hidden = !abierta;
    chartEl.hidden = abierta;
    if (legend) legend.hidden = abierta;
    btn.setAttribute("aria-pressed", String(abierta));
    btn.textContent = abierta ? "Gráfico" : "Tabla";
  });
  tools.append(btn);
}

// ---------------------------------------------------------------------------
// Cobertura de medios (dashboard Algoritmo Inteligente)
// ---------------------------------------------------------------------------
function hechosFiltrados() {
  const h = state.hechos?.hechos || [];
  return h.filter((x) => (state.escala === "Todas" || x.escala === state.escala) && (state.sector === "Todos" || x.sector === state.sector));
}

function chipRow(cont, opciones, actual, onPick) {
  vaciar(cont);
  for (const o of opciones) {
    const b = el("button", { class: `chip${o.valor === actual ? " is-active" : ""}`, type: "button", "aria-pressed": String(o.valor === actual) }, o.etiqueta);
    b.addEventListener("click", () => onPick(o.valor));
    cont.append(b);
  }
}

function renderCobertura() {
  const sec = $("cobertura");
  const d = state.hechos;
  const aviso = $("cobertura-aviso");
  if (!d || !d.hechos?.length) {
    aviso.hidden = false;
    vaciar(aviso);
    aviso.append(el("b", {}, "La cobertura de medios todavía no está publicada. "),
      "Se sincroniza desde el dashboard Algoritmo Inteligente cuando el robot cuenta con las credenciales de solo lectura (ver el README del repositorio).");
    sec.querySelector(".cobertura-grid").hidden = true;
    return;
  }
  if (d.modo === "semilla") {
    aviso.hidden = false;
    vaciar(aviso);
    aviso.append(el("b", {}, "Muestra del relevamiento. "), `Datos de ${fmtFechaCorta(d.ventana.desde)} a ${fmtFechaCorta(d.ventana.hasta)} tomados de una exportación del dashboard; la sincronización diaria se activa con las credenciales del dashboard.`);
  } else {
    aviso.hidden = true;
  }
  $("stat-ur").textContent = d.total.toLocaleString("es-AR");
  $("stat-medios").textContent = String(d.resumen.medios);
  $("stat-ventana").textContent = `${fmtFechaCorta(d.ventana.desde)} → ${fmtFechaCorta(d.ventana.hasta)}`;
  $("cobertura-sync").textContent = `Última sincronización: ${fmtFechaLarga(d.generado)} · corpus total del dashboard: ${d.total_corpus.toLocaleString("es-AR")} unidades de registro.`;

  const escalas = ["Todas", ...ESCALAS.filter((e) => d.resumen.por_escala[e])];
  chipRow($("chips-escala"), escalas.map((e) => ({ valor: e, etiqueta: e === "Todas" ? "Todas las escalas" : e })), state.escala, (v) => { state.escala = v; state.mostrar = 20; renderCoberturaDinamica(); });
  chipRow($("chips-sector"), [{ valor: "Todos", etiqueta: "Todos los sectores" }, ...SECTORES.map((s) => ({ valor: s, etiqueta: s.charAt(0) + s.slice(1).toLowerCase() }))], state.sector, (v) => { state.sector = v; state.mostrar = 20; renderCoberturaDinamica(); });

  const medios = $("medios-lista");
  vaciar(medios);
  for (const [m, c] of Object.entries(d.resumen.por_medio)) medios.append(el("li", {}, el("b", {}, m), ` ${c}`));
  renderCoberturaDinamica();
}

function renderCoberturaDinamica() {
  const d = state.hechos;
  const lista = hechosFiltrados();
  $("chips-escala").querySelectorAll(".chip").forEach((b) => { const on = b.textContent === (state.escala === "Todas" ? "Todas las escalas" : state.escala); b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); });
  $("chips-sector").querySelectorAll(".chip").forEach((b) => { const on = b.textContent.toUpperCase() === (state.sector === "Todos" ? "TODOS LOS SECTORES" : state.sector); b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); });

  // columnas por día
  const porDia = new Map(d.resumen.por_dia.map(([k]) => [k, 0]));
  for (const h of lista) porDia.set(h.fecha, (porDia.get(h.fecha) || 0) + 1);
  const items = [...porDia.entries()].map(([k, v]) => ({ etiqueta: fmtFechaCorta(k), corta: fmtFechaCorta(k).replace(/ \d{4}$/, ""), valor: v }));
  columnChart($("chart-ur-dia"), { items, unidad: "unidades de registro", aria: "Unidades de registro por día" });

  // barras por sector (dentro de la escala elegida)
  const base = (d.hechos || []).filter((x) => state.escala === "Todas" || x.escala === state.escala);
  const porSector = SECTORES.map((s) => ({ etiqueta: s.charAt(0) + s.slice(1).toLowerCase(), valor: base.filter((x) => x.sector === s).length, color: SECTOR_COLOR[s], destacado: false }))
    .filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  barChart($("chart-ur-sector"), { items: porSector, unidad: "", aria: "Unidades de registro por sector" });

  $("cobertura-count").textContent = `${lista.length.toLocaleString("es-AR")} unidades de registro${state.escala !== "Todas" ? ` · ${state.escala}` : ""}${state.sector !== "Todos" ? ` · ${state.sector.toLowerCase()}` : ""}`;
  const ul = $("hechos");
  vaciar(ul);
  for (const h of lista.slice(0, state.mostrar)) {
    const link = h.links?.[0];
    const titulo = link ? el("a", { href: link, target: "_blank", rel: "noopener" }, h.titulo) : h.titulo;
    ul.append(el("li", { class: "hecho" },
      el("div", { class: "hecho-meta" },
        el("span", {}, h.medio), el("span", {}, fmtFechaCorta(h.fecha)), el("span", { class: "escala-tag" }, h.escala),
        el("span", { class: "sector-chip", style: { "--sector": SECTOR_COLOR[h.sector] || "var(--mark-muted)" } }, h.sector.charAt(0) + h.sector.slice(1).toLowerCase())),
      el("h4", { class: "hecho-titulo" }, titulo),
      h.resumen ? el("p", { class: "hecho-resumen" }, h.resumen) : null,
      (h.links || []).length > 1 ? el("div", { class: "hecho-links" }, h.links.slice(1, 4).map((u, i) => el("a", { href: u, target: "_blank", rel: "noopener" }, `enlace ${i + 2}`))) : null));
  }
  const mas = $("hechos-mas");
  mas.hidden = lista.length <= state.mostrar;
  mas.onclick = () => { state.mostrar += 20; renderCoberturaDinamica(); };
}

// ---------------------------------------------------------------------------
// Protestas (resumen del mapa)
// ---------------------------------------------------------------------------
function renderProtestas() {
  const p = state.protestas;
  const box = $("protestas-stats");
  if (!p || !p.days?.length) { box.hidden = true; return; }
  const dias = p.days.slice(-7);
  let eventos = 0, focos = 0, top = null;
  for (const loc of p.locations || []) {
    let t = 0;
    for (const d of dias) t += loc.days?.[d]?.[0] || 0;
    if (t > 0) { focos++; eventos += t; if (!top || t > top.t) top = { name: loc.name, t }; }
  }
  $("prot-eventos").textContent = eventos.toLocaleString("es-AR");
  $("prot-focos").textContent = focos.toLocaleString("es-AR");
  $("prot-top").textContent = top ? top.name.split(",")[0] : "—";
  $("prot-fecha").textContent = `Últimos 7 días · actualizado ${fmtFechaLarga(p.generated)}`;
}

// ---------------------------------------------------------------------------
// Fuentes y estado
// ---------------------------------------------------------------------------
const DESCRIPCION_FUENTE = {
  wb: "Desocupación, actividad, empleo, informalidad, empleo vulnerable, productividad, precios, pobreza y desigualdad. Anual, países y regiones.",
  ilo: "Desocupación, actividad, empleo y subocupación de corto plazo (trimestral y mensual), a partir de las encuestas de hogares nacionales.",
  datosar: "Argentina: EPH (desocupación, actividad, empleo, subocupación, informalidad, pobreza), SIPA (empleo registrado), RIPTE, salario mínimo, IPC, canastas básicas y EMAE.",
  eurostat: "Desocupación mensual desestacionalizada de la Unión Europea, la zona euro y sus principales economías.",
  bls: "Estados Unidos: desocupación, actividad, empleo, nóminas no agrícolas y salario horario, mensual.",
  imf: "Desocupación, crecimiento e inflación anuales con proyecciones del FMI para países y el mundo.",
  oecd: "Desocupación armonizada mensual de los países de la OCDE, incluidos Chile, Colombia, Costa Rica y México.",
};

function renderFuentes() {
  const cat = state.cat;
  const cont = $("tabla-fuentes");
  const filas = Object.entries(cat.datos.fuentes || {}).map(([k, f]) => {
    const e = cat.datos.estado?.[k];
    const estado = el("span", { class: `estado ${e ? (e.ok ? "estado--ok" : "estado--err") : ""}` }, e ? (e.ok ? `${e.series} series` : "sin respuesta") : "pendiente");
    return [
      el("span", {}, el("a", { href: f.url, target: "_blank", rel: "noopener" }, f.nombre), el("br"), el("span", { class: "periodo" }, f.organismo)),
      el("span", { class: `badge ${f.tipo === "gobierno" ? "badge--gob" : "badge--mul"}` }, f.tipo === "gobierno" ? "Gobierno" : "Multilateral"),
      DESCRIPCION_FUENTE[k] || "",
      estado,
    ];
  });
  filas.push([
    el("span", {}, el("a", { href: "#cobertura" }, "Algoritmo Inteligente · Seguimiento de Medios"), el("br"), el("span", { class: "periodo" }, "Equipo de OITraF")),
    el("span", { class: "badge" }, "Relevamiento propio"),
    "Unidades de registro de 24 medios (5 nacionales, 4 latinoamericanos, 11 internacionales y 4 provinciales), clasificadas por escala, sector, eje y actores.",
    el("span", { class: `estado ${state.hechos ? "estado--ok" : ""}` }, state.hechos ? (state.hechos.modo === "semilla" ? "muestra" : `${state.hechos.total} UR`) : "pendiente"),
  ]);
  filas.push([
    el("span", {}, el("a", { href: "https://www.gdeltproject.org/", target: "_blank", rel: "noopener" }, "GDELT 2.0"), el("br"), el("span", { class: "periodo" }, "Proyecto GDELT (datos abiertos)")),
    el("span", { class: "badge" }, "Datos abiertos"),
    "Eventos de protesta detectados automáticamente en la prensa mundial (código CAMEO 14), para el mapa de protestas. Horario.",
    el("span", { class: `estado ${state.protestas ? "estado--ok" : ""}` }, state.protestas ? "activa" : "pendiente"),
  ]);
  tabla(cont, [{ titulo: "Fuente" }, { titulo: "Tipo" }, { titulo: "Qué aporta" }, { titulo: "Estado" }], filas);
  $("fuentes-gen").textContent = cat.datos.generado
    ? `Indicadores generados el ${fmtFechaLarga(cat.datos.generado)} · ${cat.datos.total_series} series oficiales.`
    : "El archivo de indicadores todavía no fue generado: ejecutá el workflow «Actualizar indicadores OITraF» en GitHub Actions.";
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
function renderHero() {
  const cat = state.cat;
  $("stat-series").textContent = cat.datos.total_series ? cat.datos.total_series.toLocaleString("es-AR") : "—";
  const fuentesOk = Object.values(cat.datos.estado || {}).filter((e) => e.ok).length;
  $("stat-fuentes").textContent = fuentesOk ? String(fuentesOk + 1) : "—";
  $("stat-ur-hero").textContent = state.hechos?.total ? state.hechos.total.toLocaleString("es-AR") : "—";
  $("stat-fecha").textContent = cat.datos.generado ? fmtFechaCorta(cat.datos.generado) : "pendiente";
  const geos = Object.keys(cat.datos.geos || {}).length;
  $("stat-geos").textContent = geos ? String(geos) : "—";
}

// ---------------------------------------------------------------------------
async function main() {
  initTema();
  const [ind, hechos, prot] = await Promise.all([
    fetchJson("data/indicadores.json"),
    fetchJson("data/hechos.json"),
    fetchJson("data/protests.json"),
  ]);
  state.cat = derivarSeries(new Catalogo(ind));
  state.hechos = hechos;
  state.protestas = prot;
  const pasos = [renderHero, renderArgentina, renderLatam, renderMundo, renderCobertura, renderProtestas, renderFuentes];
  for (const paso of pasos) {
    try { paso(); } catch (e) { console.error(`Error en ${paso.name}`, e); }
  }
  document.addEventListener("oitraf:tema", () => { /* los colores son variables CSS: nada que redibujar */ });
}

main();
