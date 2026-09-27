/**
 * Gráficos SVG sin dependencias, con la gramática del sistema de visualización:
 * marcas finas, grilla recesiva, una sola escala por gráfico, leyenda para dos o
 * más series, etiquetas directas selectivas, tooltip con todas las series y
 * vista de tabla alternativa. Se redibujan al cambiar el ancho del contenedor.
 */
import { el, vaciar, fmtNum, fmtPeriodo, fmtPeriodoCorto } from "./comun.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  return n;
}
function texto(x, y, contenido, attrs = {}) {
  const t = svgEl("text", { x, y, ...attrs });
  t.textContent = contenido;
  return t;
}

/** Escala «bonita»: devuelve {min, max, ticks}. */
function escalaBonita(min, max, n = 4, incluirCero = false) {
  if (incluirCero) { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) { min -= 1; max += 1; }
  const rango = max - min;
  const crudo = rango / n;
  const mag = Math.pow(10, Math.floor(Math.log10(crudo)));
  const candidatos = [1, 2, 2.5, 5, 10].map((m) => m * mag);
  const paso = candidatos.find((c) => c >= crudo) || candidatos[candidatos.length - 1];
  const lo = Math.floor(min / paso) * paso;
  const hi = Math.ceil(max / paso) * paso;
  const ticks = [];
  for (let v = lo; v <= hi + paso / 1000; v += paso) ticks.push(+v.toFixed(10));
  return { min: lo, max: hi, ticks };
}

function fmtTick(v, unidad) {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("es-AR", { maximumFractionDigits: unidad === "%" ? 1 : 2 });
}

/** Marca discreta de autoría en la esquina inferior derecha del gráfico. */
function marcaAgua(svg, W, H) {
  svg.append(texto(W - 4, H - 3, "OITraF", { class: "marca-agua", "text-anchor": "end", "aria-hidden": "true" }));
}

function observar(contenedor, dibujar) {
  let ancho = 0;
  const ro = new ResizeObserver((entradas) => {
    const w = Math.floor(entradas[0].contentRect.width);
    if (w > 0 && Math.abs(w - ancho) > 4) { ancho = w; dibujar(w); }
  });
  ro.observe(contenedor);
  contenedor._ro = ro;
  const w0 = contenedor.clientWidth || 600;
  ancho = w0;
  dibujar(w0);
}

function tooltipDe(contenedor) {
  let tt = contenedor.querySelector(".tooltip");
  if (!tt) { tt = el("div", { class: "tooltip", role: "status", "aria-live": "polite" }); contenedor.append(tt); }
  return tt;
}
function posicionarTooltip(tt, contenedor, x, y) {
  const w = contenedor.clientWidth, tw = tt.offsetWidth || 160;
  let left = x + 14;
  if (left + tw > w) left = x - tw - 14;
  if (left < 0) left = 4;
  tt.style.left = `${left}px`;
  tt.style.top = `${Math.max(0, y - 10)}px`;
}

/**
 * Gráfico de líneas.
 * spec = { series: [{nombre, puntos: [[periodo, valor]], color?, proyeccionDesde?}], unidad, alto, ceroBase, leyenda }
 */
export function lineChart(contenedor, spec) {
  vaciar(contenedor);
  contenedor.classList.add("chart");
  const series = (spec.series || []).filter((s) => s.puntos && s.puntos.length);
  if (!series.length) { contenedor.append(el("p", { class: "chart-empty" }, "Sin datos disponibles todavía.")); return; }
  const unidad = spec.unidad || "";
  const alto = spec.alto || 260;
  const xs = [...new Set(series.flatMap((s) => s.puntos.map((p) => p[0])))].sort();
  const idx = new Map(xs.map((p, i) => [p, i]));
  const mapas = series.map((s) => new Map(s.puntos));
  const valores = series.flatMap((s) => s.puntos.map((p) => p[1]));
  const vmin = Math.min(...valores), vmax = Math.max(...valores);
  const pad = (vmax - vmin) * 0.08 || Math.abs(vmax) * 0.08 || 1;
  let esc = escalaBonita(vmin - pad, vmax + pad, 4, !!spec.ceroBase);
  // si ningún valor es negativo, el eje no baja de cero
  if (vmin >= 0 && esc.min < 0) esc = escalaBonita(0, vmax + pad, 4, true);

  const dibujar = (W) => {
    vaciar(contenedor);
    const padL = 8 + Math.max(...esc.ticks.map((t) => fmtTick(t, unidad).length)) * 7;
    const padR = series.length <= 4 ? 58 : 16;
    const padT = 14, padB = 26;
    const H = alto, iw = Math.max(40, W - padL - padR), ih = H - padT - padB;
    const x = (i) => padL + (xs.length === 1 ? iw / 2 : (i / (xs.length - 1)) * iw);
    const y = (v) => padT + ih - ((v - esc.min) / (esc.max - esc.min)) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", tabindex: 0,
      "aria-label": spec.aria || `Gráfico de líneas${series.length > 1 ? ` con ${series.length} series` : ""}` });

    for (const t of esc.ticks) {
      svg.append(svgEl("line", { class: "gridline", x1: padL, x2: W - padR, y1: y(t), y2: y(t) }));
      svg.append(texto(padL - 6, y(t) + 4, fmtTick(t, unidad), { class: "axis-label", "text-anchor": "end" }));
    }
    // etiquetas X: como máximo 7, siempre la última
    const cada = Math.max(1, Math.ceil(xs.length / Math.max(2, Math.floor(iw / 90))));
    xs.forEach((p, i) => {
      const ultima = i === xs.length - 1;
      if (ultima || (i % cada === 0 && xs.length - 1 - i > cada / 2)) {
        svg.append(texto(x(i), H - 8, fmtPeriodoCorto(p), { class: "axis-label", "text-anchor": ultima ? "end" : (i === 0 ? "start" : "middle") }));
      }
    });

    const puntosFin = [];
    series.forEach((s, si) => {
      const color = s.color || SERIES[si % SERIES.length];
      const m = mapas[si];
      const segmentos = { solido: [], proy: [] };
      let anteriorProy = false;
      s.puntos.forEach(([p, v], k) => {
        const px = x(idx.get(p)), py = y(v);
        const esProy = s.proyeccionDesde && String(p) > String(s.proyeccionDesde);
        if (esProy && !anteriorProy && k > 0) {
          // el tramo proyectado arranca en el último punto observado
          const [pp, pv] = s.puntos[k - 1];
          segmentos.proy.push([x(idx.get(pp)), y(pv)]);
        }
        (esProy ? segmentos.proy : segmentos.solido).push([px, py]);
        anteriorProy = esProy;
      });
      const d = (pts) => pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
      if (series.length === 1 && segmentos.solido.length > 1) {
        const base = y(esc.min);
        const area = `${d(segmentos.solido)} L${segmentos.solido[segmentos.solido.length - 1][0].toFixed(1)},${base} L${segmentos.solido[0][0].toFixed(1)},${base} Z`;
        svg.append(svgEl("path", { class: "area", d: area, fill: color }));
      }
      if (segmentos.solido.length) svg.append(svgEl("path", { class: "line", d: d(segmentos.solido), stroke: color }));
      if (segmentos.proy.length > 1) svg.append(svgEl("path", { class: "line line--proy", d: d(segmentos.proy), stroke: color }));
      const ult = s.puntos[s.puntos.length - 1];
      puntosFin.push({ si, color, x: x(idx.get(ult[0])), y: y(ult[1]), v: ult[1], nombre: s.nombre });
      void m;
    });

    // puntos finales con anillo, y etiquetas directas sin solaparse
    puntosFin.sort((a, b) => a.y - b.y);
    for (let i = 1; i < puntosFin.length; i++) {
      if (puntosFin[i].y - puntosFin[i - 1].y < 13) puntosFin[i].ly = (puntosFin[i - 1].ly ?? puntosFin[i - 1].y) + 13;
    }
    for (const p of puntosFin) {
      svg.append(svgEl("circle", { class: "dot", cx: p.x, cy: p.y, r: 4, fill: p.color }));
      if (series.length <= 4) svg.append(texto(p.x + 8, (p.ly ?? p.y) + 4, fmtNum(p.v, unidad), { class: "end-label" }));
    }

    // capa de interacción: crosshair + tooltip con todas las series
    const cross = svgEl("line", { class: "crosshair", x1: 0, x2: 0, y1: padT, y2: padT + ih });
    svg.append(cross);
    const marcadores = series.map((s, si) => { const c = svgEl("circle", { class: "dot", r: 4.5, fill: s.color || SERIES[si % SERIES.length], opacity: 0 }); svg.append(c); return c; });
    const hit = svgEl("rect", { class: "hit", x: padL, y: 0, width: iw, height: H });
    svg.append(hit);
    const tt = tooltipDe(contenedor);
    let actual = xs.length - 1;
    const mostrar = (i) => {
      actual = i;
      const p = xs[i];
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
      contenedor.classList.add("is-hover");
      vaciar(tt);
      tt.append(el("div", { class: "tt-title" }, fmtPeriodo(p)));
      let yMedia = padT + ih / 2;
      series.forEach((s, si) => {
        const v = mapas[si].get(p);
        if (v === undefined) { marcadores[si].setAttribute("opacity", 0); }
        else { marcadores[si].setAttribute("opacity", 1); marcadores[si].setAttribute("cx", x(i)); marcadores[si].setAttribute("cy", y(v)); yMedia = y(v); }
        tt.append(el("div", { class: "tt-row" },
          el("span", { class: "tt-key", style: { background: s.color || SERIES[si % SERIES.length] } }),
          el("span", { class: "tt-val" }, v === undefined ? "—" : fmtNum(v, unidad)),
          series.length > 1 ? el("span", { class: "tt-name" }, s.nombre) : null));
      });
      tt.classList.add("is-visible");
      posicionarTooltip(tt, contenedor, x(i) * (contenedor.clientWidth / W), yMedia);
    };
    const ocultar = () => { tt.classList.remove("is-visible"); contenedor.classList.remove("is-hover"); marcadores.forEach((m) => m.setAttribute("opacity", 0)); };
    hit.addEventListener("pointermove", (ev) => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      let mejor = 0, dist = Infinity;
      xs.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < dist) { dist = d; mejor = i; } });
      mostrar(mejor);
    });
    hit.addEventListener("pointerleave", ocultar);
    svg.addEventListener("focus", () => mostrar(actual));
    svg.addEventListener("blur", ocultar);
    svg.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowLeft") { ev.preventDefault(); mostrar(Math.max(0, actual - 1)); }
      if (ev.key === "ArrowRight") { ev.preventDefault(); mostrar(Math.min(xs.length - 1, actual + 1)); }
    });
    marcaAgua(svg, W, H);
    contenedor.append(svg);
    contenedor.append(tt);
  };
  observar(contenedor, dibujar);

  if (series.length > 1 && spec.leyenda !== false) {
    const ul = el("ul", { class: "legend", "aria-label": "Series" });
    series.forEach((s, si) => ul.append(el("li", {}, el("span", { class: "swatch", style: { background: s.color || SERIES[si % SERIES.length] } }), s.nombre)));
    if (series.some((s) => s.proyeccionDesde)) ul.append(el("li", {}, el("span", { class: "swatch", style: { background: "var(--mark-muted)" } }), "línea punteada: proyección"));
    contenedor.after(ul);
  }
}

/**
 * Barras horizontales (ranking). spec = { items: [{etiqueta, valor, nota, destacado}], unidad, maxFilas }
 */
export function barChart(contenedor, spec) {
  vaciar(contenedor);
  contenedor.classList.add("chart");
  const items = (spec.items || []).filter((i) => i.valor !== null && i.valor !== undefined);
  if (!items.length) { contenedor.append(el("p", { class: "chart-empty" }, "Sin datos disponibles todavía.")); return; }
  const unidad = spec.unidad || "";
  const fila = 30, padT = 6, padB = 6;
  const H = padT + padB + items.length * fila;
  const maxV = Math.max(0, ...items.map((i) => i.valor));
  const minV = Math.min(0, ...items.map((i) => i.valor));
  const dibujar = (W) => {
    vaciar(contenedor);
    // en pantallas angostas la nota (período y fuente) queda solo en el tooltip y la tabla
    const conNota = W >= 560;
    const padL = Math.min(W < 560 ? 120 : 200, 8 + Math.max(...items.map((i) => i.etiqueta.length)) * 7.2);
    const maxChars = Math.floor((padL - 10) / 7.2);
    const recortar = (s) => (s.length > maxChars ? s.slice(0, Math.max(3, maxChars - 1)).trimEnd() + "…" : s);
    const padR = 8 + Math.max(...items.map((i) => (fmtNum(i.valor, unidad) + (conNota && i.nota ? "  " + i.nota : "")).length)) * 6.4;
    const iw = Math.max(40, W - padL - padR);
    const x = (v) => padL + ((v - minV) / ((maxV - minV) || 1)) * iw;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": spec.aria || "Gráfico de barras" });
    svg.append(svgEl("line", { class: "baseline", x1: x(0), x2: x(0), y1: padT, y2: H - padB }));
    const tt = tooltipDe(contenedor);
    items.forEach((it, i) => {
      const yTop = padT + i * fila + (fila - 20) / 2;
      const w = Math.max(2, Math.abs(x(it.valor) - x(0)));
      const g = svgEl("g", { class: "bar-row", tabindex: 0 });
      const color = it.destacado ? "var(--emphasis)" : (it.color || "var(--series-1)");
      const rect = svgEl("rect", { class: "bar", x: Math.min(x(0), x(it.valor)), y: yTop, width: w, height: 20, fill: color });
      // extremo redondeado solo en el lado del dato
      const clipId = `clip-${Math.random().toString(36).slice(2, 9)}`;
      const clip = svgEl("clipPath", { id: clipId });
      clip.append(svgEl("rect", { x: Math.min(x(0), x(it.valor)) - (it.valor < 0 ? 4 : 0), y: yTop, width: w + 4, height: 20, rx: 4 }));
      svg.append(clip);
      rect.setAttribute("clip-path", `url(#${clipId})`);
      g.append(rect);
      const etiqueta = texto(padL - 8, yTop + 14, recortar(it.etiqueta), { class: "axis-label", "text-anchor": "end", style: it.destacado ? "font-weight:700;fill:var(--text-primary)" : "" });
      if (etiqueta.textContent !== it.etiqueta) { const ti = svgEl("title"); ti.textContent = it.etiqueta; etiqueta.append(ti); }
      g.append(etiqueta);
      const lbl = texto(x(Math.max(0, it.valor)) + 6, yTop + 14, fmtNum(it.valor, unidad), { class: "value-label" });
      g.append(lbl);
      if (conNota && it.nota) g.append(texto(x(Math.max(0, it.valor)) + 16 + fmtNum(it.valor, unidad).length * 7.2, yTop + 14, it.nota, { class: "axis-label" }));
      const hit = svgEl("rect", { class: "hit", x: 0, y: padT + i * fila, width: W, height: fila });
      g.append(hit);
      const mostrar = (ev) => {
        vaciar(tt);
        tt.append(el("div", { class: "tt-title" }, it.etiqueta));
        tt.append(el("div", { class: "tt-row" }, el("span", { class: "tt-key", style: { background: color } }), el("span", { class: "tt-val" }, fmtNum(it.valor, unidad)), it.nota ? el("span", { class: "tt-name" }, it.nota) : null));
        if (it.detalle) tt.append(el("div", { class: "tt-name" }, it.detalle));
        tt.classList.add("is-visible");
        const r = svg.getBoundingClientRect();
        const px = ev && ev.clientX ? ev.clientX - r.left : x(it.valor) * (r.width / W);
        posicionarTooltip(tt, contenedor, px, (padT + i * fila) * (r.height / H));
      };
      g.addEventListener("pointermove", mostrar);
      g.addEventListener("focus", () => mostrar(null));
      g.addEventListener("pointerleave", () => tt.classList.remove("is-visible"));
      g.addEventListener("blur", () => tt.classList.remove("is-visible"));
      svg.append(g);
    });
    marcaAgua(svg, W, H);
    contenedor.append(svg);
    contenedor.append(tt);
  };
  observar(contenedor, dibujar);
}

/**
 * Columnas verticales (una serie temporal corta, p. ej. unidades de registro por día).
 * spec = { items: [{etiqueta, valor, corta?}], unidad, alto }
 */
export function columnChart(contenedor, spec) {
  vaciar(contenedor);
  contenedor.classList.add("chart");
  const items = spec.items || [];
  if (!items.length || !items.some((i) => i.valor > 0)) { contenedor.append(el("p", { class: "chart-empty" }, "Sin datos disponibles todavía.")); return; }
  const alto = spec.alto || 180;
  const max = Math.max(1, ...items.map((i) => i.valor));
  const esc = escalaBonita(0, max, 3, true);
  const dibujar = (W) => {
    vaciar(contenedor);
    const padL = 8 + Math.max(...esc.ticks.map((t) => fmtTick(t).length)) * 7, padR = 6, padT = 14, padB = 24;
    const H = alto, iw = Math.max(40, W - padL - padR), ih = H - padT - padB;
    const paso = iw / items.length;
    const bw = Math.min(24, Math.max(2, paso - 2));
    const y = (v) => padT + ih - (v / esc.max) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": spec.aria || "Gráfico de columnas" });
    for (const t of esc.ticks) {
      svg.append(svgEl("line", { class: "gridline", x1: padL, x2: W - padR, y1: y(t), y2: y(t) }));
      svg.append(texto(padL - 6, y(t) + 4, fmtTick(t), { class: "axis-label", "text-anchor": "end" }));
    }
    svg.append(svgEl("line", { class: "baseline", x1: padL, x2: W - padR, y1: y(0), y2: y(0) }));
    const tt = tooltipDe(contenedor);
    const maxIdx = items.reduce((m, it, i) => (it.valor > items[m].valor ? i : m), 0);
    const cada = Math.max(1, Math.ceil(items.length / Math.max(2, Math.floor(iw / 70))));
    items.forEach((it, i) => {
      const cx = padL + i * paso + paso / 2;
      const h = Math.max(it.valor > 0 ? 2 : 0, (it.valor / esc.max) * ih);
      const g = svgEl("g", { tabindex: 0 });
      const clipId = `clipc-${Math.random().toString(36).slice(2, 9)}`;
      const clip = svgEl("clipPath", { id: clipId });
      clip.append(svgEl("rect", { x: cx - bw / 2, y: y(0) - h, width: bw, height: h + 6, rx: 4 }));
      svg.append(clip);
      g.append(svgEl("rect", { class: "bar", x: cx - bw / 2, y: y(0) - h, width: bw, height: h, fill: it.color || "var(--series-1)", "clip-path": `url(#${clipId})` }));
      g.append(svgEl("rect", { class: "hit", x: padL + i * paso, y: 0, width: paso, height: H }));
      const ultima = i === items.length - 1;
      if (ultima || (i % cada === 0 && items.length - 1 - i > cada / 2)) {
        svg.append(texto(cx, H - 7, it.corta || it.etiqueta, { class: "axis-label", "text-anchor": "middle" }));
      }
      if (i === maxIdx && it.valor > 0) svg.append(texto(cx, y(it.valor) - 5, fmtNum(it.valor, ""), { class: "value-label", "text-anchor": "middle" }));
      const mostrar = () => {
        vaciar(tt);
        tt.append(el("div", { class: "tt-title" }, it.etiqueta));
        tt.append(el("div", { class: "tt-row" }, el("span", { class: "tt-val" }, fmtNum(it.valor, "")), el("span", { class: "tt-name" }, spec.unidad || "")));
        tt.classList.add("is-visible");
        const r = svg.getBoundingClientRect();
        posicionarTooltip(tt, contenedor, cx * (r.width / W), y(it.valor) * (r.height / H));
      };
      g.addEventListener("pointermove", mostrar);
      g.addEventListener("focus", mostrar);
      g.addEventListener("pointerleave", () => tt.classList.remove("is-visible"));
      g.addEventListener("blur", () => tt.classList.remove("is-visible"));
      svg.append(g);
    });
    marcaAgua(svg, W, H);
    contenedor.append(svg);
    contenedor.append(tt);
  };
  observar(contenedor, dibujar);
}

/** Minigráfico de línea para las placas. */
export function sparkline(contenedor, puntos, opciones = {}) {
  vaciar(contenedor);
  const pts = (puntos || []).slice(-(opciones.n || 24));
  if (pts.length < 2) return;
  const W = 160, H = 38, p = 3;
  const vs = pts.map((x) => x[1]);
  const min = Math.min(...vs), max = Math.max(...vs);
  const y = (v) => (max === min ? H / 2 : p + (H - 2 * p) - ((v - min) / (max - min)) * (H - 2 * p));
  const x = (i) => p + (i / (pts.length - 1)) * (W - 2 * p);
  const d = pts.map((pt, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pt[1]).toFixed(1)}`).join(" ");
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" });
  svg.append(svgEl("path", { d: `${d} L${x(pts.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`, fill: opciones.color || "var(--series-1)", opacity: 0.1 }));
  svg.append(svgEl("path", { d, fill: "none", stroke: opciones.color || "var(--series-1)", "stroke-width": 1.6, "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" }));
  const c = svgEl("circle", { cx: x(pts.length - 1), cy: y(vs[vs.length - 1]), r: 3, fill: opciones.color || "var(--series-1)", stroke: "var(--surface-1)", "stroke-width": 1.5 });
  svg.append(c);
  contenedor.append(svg);
}

/** Tabla de datos equivalente a un gráfico. columnas: [{titulo, num?}], filas: [[...]] */
export function tabla(contenedor, columnas, filas, opciones = {}) {
  vaciar(contenedor);
  const t = el("table", { class: "datos" });
  const thead = el("thead", {}, el("tr", {}, columnas.map((c) => el("th", { scope: "col", class: c.num ? "num" : null }, c.titulo))));
  const tbody = el("tbody");
  for (const f of filas) {
    const tr = el("tr", { class: f.clase || null });
    (f.celdas || f).forEach((v, i) => tr.append(el("td", { class: columnas[i]?.num ? "num" : null }, v instanceof Node ? v : String(v ?? "—"))));
    tbody.append(tr);
  }
  t.append(thead, tbody);
  if (opciones.caption) t.append(el("caption", { class: "sr-only" }, opciones.caption));
  contenedor.append(t);
  return t;
}
