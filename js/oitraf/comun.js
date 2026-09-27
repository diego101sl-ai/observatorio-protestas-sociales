/**
 * Utilidades compartidas del portal OITraF: tema claro/oscuro, carga de datos,
 * formato de números y períodos, catálogo de series e indicadores derivados.
 */

// ---------- Tema ----------
export function initTema() {
  const root = document.documentElement;
  let guardado = null;
  try { guardado = localStorage.getItem("oitraf-tema"); } catch { /* sin almacenamiento */ }
  if (guardado === "light" || guardado === "dark") root.dataset.theme = guardado;
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const oscuroSistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const actual = root.dataset.theme || (oscuroSistema ? "dark" : "light");
    const siguiente = actual === "dark" ? "light" : "dark";
    root.dataset.theme = siguiente;
    try { localStorage.setItem("oitraf-tema", siguiente); } catch { /* ignorar */ }
    document.dispatchEvent(new CustomEvent("oitraf:tema"));
  });
}

// ---------- Datos ----------
export async function fetchJson(ruta) {
  try {
    const r = await fetch(ruta, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ---------- DOM ----------
/** Crea un elemento. Los hijos de texto se insertan con textContent (nunca HTML). */
export function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    n.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return n;
}

export function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

// ---------- Formato ----------
const LOCALE = "es-AR";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ORDINAL = { 1: "1.er", 2: "2.º", 3: "3.er", 4: "4.º" };

export function fmtNum(v, unidad = "", opciones = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  let dec = opciones.decimales;
  if (dec === undefined) {
    if (unidad === "" && Number.isInteger(v)) dec = 0;
    else if (unidad === "canastas") dec = 2;
    else if (unidad === "%" || unidad === "p.p." || unidad === "índice") dec = 1;
    else if (unidad === "USD/hora") dec = 2;
    else if (abs >= 1000) dec = 0;
    else if (abs >= 100) dec = 1;
    else dec = 2;
  }
  const num = v.toLocaleString(LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  switch (unidad) {
    case "%": return `${num} %`;
    case "p.p.": return `${num} p.p.`;
    case "ARS": return `$ ${num}`;
    case "USD/hora": return `US$ ${num}`;
    case "USD PPA 2021": return `US$ ${num}`;
    case "miles de puestos": return `${num} mil`;
    case "personas": return num;
    case "canastas": return `${num} canastas`;
    default: return num;
  }
}

/** Versión compacta para números grandes (13.084.000 → 13,08 M). */
export function fmtCompacto(v, unidad = "") {
  if (v === null || v === undefined) return "—";
  const abs = Math.abs(v);
  let texto;
  if (abs >= 1e9) texto = `${(v / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 2 })} mil M`;
  else if (abs >= 1e6) texto = `${(v / 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 2 })} M`;
  else if (abs >= 1e4) texto = `${(v / 1e3).toLocaleString(LOCALE, { maximumFractionDigits: 0 })} mil`;
  else return fmtNum(v, unidad);
  if (unidad === "ARS") return `$ ${texto}`;
  if (unidad === "miles de puestos") return `${(v / 1e3).toLocaleString(LOCALE, { maximumFractionDigits: 2 })} M`;
  return texto;
}

/** "2026-T1" → "1.er trimestre de 2026"; "2026-07" → "julio de 2026"; "2026-S1" → "1.er semestre de 2026". */
export function fmtPeriodo(p) {
  if (!p) return "";
  const s = String(p);
  let m;
  if ((m = /^(\d{4})-T(\d)$/.exec(s))) return `${ORDINAL[m[2]] || m[2]} trimestre de ${m[1]}`;
  if ((m = /^(\d{4})-S(\d)$/.exec(s))) return `${ORDINAL[m[2]] || m[2]} semestre de ${m[1]}`;
  if ((m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s))) {
    const mes = MESES[Number(m[2]) - 1] || m[2];
    return m[3] ? `${Number(m[3])} de ${mes} de ${m[1]}` : `${mes} de ${m[1]}`;
  }
  return s;
}

/** Etiqueta corta para ejes: "ene 26", "T1 26", "S1 26", "2026". */
export function fmtPeriodoCorto(p) {
  const s = String(p || "");
  let m;
  if ((m = /^(\d{4})-T(\d)$/.exec(s))) return `T${m[2]} ${m[1].slice(2)}`;
  if ((m = /^(\d{4})-S(\d)$/.exec(s))) return `S${m[2]} ${m[1].slice(2)}`;
  if ((m = /^(\d{4})-(\d{2})/.exec(s))) return `${MESES_CORTOS[Number(m[2]) - 1] || m[2]} ${m[1].slice(2)}`;
  return s;
}

export function fmtFechaLarga(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
}

export function fmtFechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  return `${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * Variación entre dos valores: para tasas (%) devuelve puntos porcentuales;
 * para niveles, variación porcentual. Devuelve {texto, clase, signo}.
 */
export function fmtDelta(actual, previo, unidad) {
  if (actual === null || previo === null || actual === undefined || previo === undefined) return null;
  let diff, texto;
  if (unidad === "%" || unidad === "p.p.") {
    diff = actual - previo;
    texto = `${diff > 0 ? "+" : ""}${diff.toLocaleString(LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} p.p.`;
  } else {
    if (!previo) return null;
    diff = (actual / previo - 1) * 100;
    texto = `${diff > 0 ? "+" : ""}${diff.toLocaleString(LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
  }
  if (Math.abs(diff) < 0.05) {
    texto = unidad === "%" || unidad === "p.p." ? "0,0 p.p." : "0,0 %";
    return { texto: `sin cambios (${texto})`, clase: "flat", valor: 0 };
  }
  const clase = diff > 0 ? "up" : "down";
  return { texto, clase, valor: diff };
}

// ---------- Fuentes y nombres ----------
export const FUENTE_CORTA = {
  wb: "Banco Mundial",
  ilo: "OIT · ILOSTAT",
  datosar: "datos.gob.ar",
  eurostat: "Eurostat",
  bls: "BLS (EE.UU.)",
  imf: "FMI · WEO",
  oecd: "OCDE",
  oitraf: "Elaboración OITraF",
};

/** Organismo productor de cada serie argentina publicada en datos.gob.ar. */
export function organismoAR(codigo = "") {
  if (codigo.startsWith("eph_") || codigo.startsWith("pobreza") || codigo.startsWith("indigencia")) return "INDEC · Encuesta Permanente de Hogares";
  if (codigo.startsWith("sipa_")) return "Secretaría de Trabajo · SIPA";
  if (codigo === "ripte") return "Secretaría de Trabajo · RIPTE";
  if (codigo === "smvm") return "Consejo del Salario / Secretaría de Trabajo";
  if (codigo.startsWith("ipc")) return "INDEC · Índice de precios al consumidor";
  if (codigo === "cbt" || codigo === "cba" || codigo === "cbt_hogar" || codigo === "smvm_en_canastas") return "INDEC · Canastas básicas";
  if (codigo === "indice_salarios") return "INDEC · Índice de salarios";
  if (codigo === "emae") return "INDEC · EMAE";
  return "Fuente oficial";
}

export function nombreFuente(s) {
  if (!s) return "";
  if (s.fuente === "datosar") return `${organismoAR(s.codigo)} (datos.gob.ar)`;
  if (s.fuente === "oitraf") return s.nota || "Elaboración OITraF sobre fuentes oficiales";
  return FUENTE_CORTA[s.fuente] || s.fuente;
}

export const SECTOR_COLOR = {
  "TRABAJADORES": "var(--series-2)",
  "AGENDA POLÍTICA": "var(--series-1)",
  "FINANZAS": "var(--series-6)",
  "INDUSTRIA": "var(--series-3)",
  "ENERGÍA": "var(--series-4)",
  "AGRO": "var(--series-5)",
};
export const SECTORES = Object.keys(SECTOR_COLOR);
export const ESCALAS = ["Internacional", "Latinoamericana", "Nacional", "Provincial"];

export const LATAM = ["ARG", "BOL", "BRA", "CHL", "COL", "CRI", "CUB", "DOM", "ECU", "SLV", "GTM", "HND",
  "HTI", "MEX", "NIC", "PAN", "PRY", "PER", "URY", "VEN"];

// ---------- Catálogo de series ----------
const PREFERENCIA = ["datosar", "ilo", "oecd", "eurostat", "bls", "wb", "imf", "oitraf"];

export class Catalogo {
  constructor(datos) {
    this.datos = datos || { series: [], fuentes: {}, temas: {}, estado: {}, geos: {} };
    this.series = this.datos.series || [];
    this.porId = new Map(this.series.map((s) => [s.id, s]));
  }

  filtrar(q = {}) {
    return this.series.filter((s) =>
      (!q.fuente || s.fuente === q.fuente) &&
      (!q.codigo || s.codigo === q.codigo || s.codigo.startsWith(q.codigo + ".")) &&
      (!q.tema || s.tema === q.tema) &&
      (!q.geo || s.geo === q.geo) &&
      (!q.escala || s.escala === q.escala) &&
      (!q.frecuencia || s.frecuencia === q.frecuencia));
  }

  /** La mejor serie para un tema y una geografía, según la preferencia de fuentes. */
  mejor(q = {}) {
    const candidatas = this.filtrar(q);
    if (!candidatas.length) return null;
    const pref = q.prefer || PREFERENCIA;
    // Una fuente preferida no gana si su último dato tiene dos o más años menos
    // que el de otra candidata: la actualidad manda sobre la preferencia.
    const anio = (s) => Number(String(s.ultimo?.[0] || "0").slice(0, 4));
    const masReciente = Math.max(...candidatas.map(anio));
    candidatas.sort((a, b) => {
      const va = anio(a) < masReciente - 1, vb = anio(b) < masReciente - 1;
      if (va !== vb) return va ? 1 : -1;
      const pa = pref.indexOf(a.fuente), pb = pref.indexOf(b.fuente);
      if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      // misma fuente: preferir el dato más reciente, luego el más frecuente
      const ua = String(a.ultimo?.[0] || ""), ub = String(b.ultimo?.[0] || "");
      if (ua.slice(0, 4) !== ub.slice(0, 4)) return ub.slice(0, 4).localeCompare(ua.slice(0, 4));
      const fr = { mensual: 0, trimestral: 1, semestral: 2, anual: 3 };
      return (fr[a.frecuencia] ?? 9) - (fr[b.frecuencia] ?? 9);
    });
    return candidatas[0];
  }

  geosDe(escala) {
    const set = new Map();
    for (const s of this.series) if (!escala || s.escala === escala) set.set(s.geo, s.geo_nombre);
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }

  temasDe(q = {}) {
    const set = new Set(this.filtrar(q).map((s) => s.tema));
    return [...set].sort((a, b) => (this.datos.temas?.[a] || a).localeCompare(this.datos.temas?.[b] || b, "es"));
  }

  nombreTema(t) { return this.datos.temas?.[t] || t; }
}

// ---------- Indicadores derivados (elaboración OITraF) ----------
function mapa(serie) { return new Map(serie.serie.map(([p, v]) => [p, v])); }
function mesesAtras(periodo, n) {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) return null;
  let y = Number(m[1]), mo = Number(m[2]) - n;
  while (mo <= 0) { mo += 12; y -= 1; }
  return `${y}-${String(mo).padStart(2, "0")}`;
}
function nuevaSerie(base, extra, puntos) {
  if (!puntos.length) return null;
  const ult = puntos[puntos.length - 1];
  const ant = puntos.length > 1 ? puntos[puntos.length - 2] : null;
  const pasos = { mensual: 12, trimestral: 4, semestral: 2, anual: 1 }[extra.frecuencia || base.frecuencia] || 1;
  const ia = puntos.length > pasos ? +(ult[1] - puntos[puntos.length - 1 - pasos][1]).toFixed(3) : null;
  return {
    fuente: "oitraf", geo: base.geo, geo_nombre: base.geo_nombre, escala: base.escala, url: base.url,
    frecuencia: base.frecuencia, descripcion: "", ajuste: null, proyeccion_desde: null,
    ...extra,
    id: `oitraf.${extra.codigo}.${base.geo}`,
    serie: puntos, ultimo: ult, anterior: ant, var_interanual: ia,
  };
}

/** Agrega al catálogo series calculadas a partir de las oficiales (IPC interanual, salario real, canasta del hogar…). */
export function derivarSeries(cat) {
  const ipc = cat.mejor({ fuente: "datosar", codigo: "ipc_nivel_general", geo: "ARG" });
  const ripte = cat.mejor({ fuente: "datosar", codigo: "ripte", geo: "ARG" });
  const smvm = cat.mejor({ fuente: "datosar", codigo: "smvm", geo: "ARG" });
  const cbt = cat.mejor({ fuente: "datosar", codigo: "cbt", geo: "ARG" });
  const nuevas = [];

  if (ipc) {
    const m = mapa(ipc);
    const ia = [], mensual = [];
    for (const [p, v] of ipc.serie) {
      const p12 = mesesAtras(p, 12), p1 = mesesAtras(p, 1);
      if (p12 && m.has(p12) && m.get(p12)) ia.push([p, +((v / m.get(p12) - 1) * 100).toFixed(2)]);
      if (p1 && m.has(p1) && m.get(p1)) mensual.push([p, +((v / m.get(p1) - 1) * 100).toFixed(2)]);
    }
    nuevas.push(nuevaSerie(ipc, {
      codigo: "ipc_interanual", tema: "precios", unidad: "%", nombre: "Inflación interanual (IPC nacional)",
      descripcion: "Variación del índice de precios al consumidor nacional, nivel general, respecto del mismo mes del año anterior.",
      nota: "Elaboración OITraF sobre el IPC nacional nivel general del INDEC (datos.gob.ar).",
    }, ia));
    nuevas.push(nuevaSerie(ipc, {
      codigo: "ipc_mensual", tema: "precios", unidad: "%", nombre: "Inflación mensual (IPC nacional)",
      descripcion: "Variación mensual del índice de precios al consumidor nacional, nivel general.",
      nota: "Elaboración OITraF sobre el IPC nacional nivel general del INDEC (datos.gob.ar).",
    }, mensual));
  }

  const realIA = (nominal, codigo, nombre, descripcion) => {
    if (!nominal || !ipc) return;
    const mn = mapa(nominal), mp = mapa(ipc);
    const puntos = [];
    for (const [p, v] of nominal.serie) {
      const p12 = mesesAtras(p, 12);
      if (!p12 || !mn.has(p12) || !mp.has(p) || !mp.has(p12)) continue;
      const real = ((v / mn.get(p12)) / (mp.get(p) / mp.get(p12)) - 1) * 100;
      puntos.push([p, +real.toFixed(2)]);
    }
    nuevas.push(nuevaSerie(nominal, {
      codigo, tema: "salarios", unidad: "%", nombre, descripcion,
      nota: `Elaboración OITraF: ${nominal.nombre} deflactado por el IPC nacional del INDEC (datos.gob.ar).`,
    }, puntos));
  };
  realIA(ripte, "ripte_real_ia", "Salario real: variación interanual del RIPTE",
    "Variación interanual de la remuneración promedio de los trabajadores registrados estables, descontada la inflación. Valores negativos indican pérdida de poder adquisitivo.");
  realIA(smvm, "smvm_real_ia", "Salario mínimo real: variación interanual",
    "Variación interanual del Salario Mínimo, Vital y Móvil descontada la inflación. Valores negativos indican pérdida de poder adquisitivo.");

  if (cbt) {
    const hogar = cbt.serie.map(([p, v]) => [p, +(v * 3.09).toFixed(0)]);
    const cbtHogar = nuevaSerie(cbt, {
      codigo: "cbt_hogar", tema: "canasta", unidad: "ARS", nombre: "Canasta Básica Total, hogar de cuatro integrantes",
      descripcion: "Línea de pobreza para un hogar de dos adultos y dos menores (3,09 adultos equivalentes), según la metodología del INDEC.",
      nota: "Elaboración OITraF: CBT por adulto equivalente del INDEC (datos.gob.ar) multiplicada por 3,09.",
    }, hogar);
    nuevas.push(cbtHogar);
    if (smvm) {
      const mh = new Map(hogar);
      const puntos = smvm.serie.filter(([p]) => mh.has(p) && mh.get(p)).map(([p, v]) => [p, +(v / mh.get(p)).toFixed(3)]);
      nuevas.push(nuevaSerie(smvm, {
        codigo: "smvm_en_canastas", tema: "salario_minimo", unidad: "canastas",
        nombre: "Salario mínimo medido en canastas básicas del hogar",
        descripcion: "Cuántas Canastas Básicas Totales de un hogar de cuatro integrantes compra un Salario Mínimo, Vital y Móvil. Por debajo de 1, el salario mínimo no alcanza la línea de pobreza de ese hogar.",
        nota: "Elaboración OITraF: SMVM (Secretaría de Trabajo) sobre la CBT del hogar tipo (INDEC), ambas vía datos.gob.ar.",
      }, puntos));
    }
  }

  for (const s of nuevas) if (s) { cat.series.push(s); cat.porId.set(s.id, s); }
  return cat;
}

// ---------- Descargas ----------
export function descargarCSV(nombre, filas) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cabecera = [
    `# Fuente: OITraF · Observatorio Internacional del Trabajo del Futuro · ${location.href.split("#")[0]}`,
    `# Descargado el ${new Date().toISOString().slice(0, 10)}. Elaboraciones propias bajo CC BY 4.0 (citar a OITraF con enlace); los datos oficiales conservan la licencia del organismo indicado en la columna «fuente».`,
  ].join("\n");
  const csv = cabecera + "\n" + filas.map((f) => f.map(esc).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Primera oración de una descripción (para las bajadas cortas). */
export function primeraOracion(texto = "") {
  const m = /^(.+?\.)(\s|$)/.exec(texto.trim());
  return m ? m[1] : texto;
}
