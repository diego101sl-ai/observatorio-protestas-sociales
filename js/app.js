import { loadProtestData, loadArticles, loadAcledData } from "./sources/gdelt.js";

const REFRESH_EVERY_MS = 15 * 60 * 1000;

// Periodos disponibles por fuente: GDELT llega cada 15 min (ventana de 7 días);
// ACLED publica semanalmente (ventana de 30 días)
const PERIODS = {
  gdelt: [[1, "24 h"], [3, "3 días"], [7, "7 días"]],
  acled: [[7, "7 días"], [14, "14 días"], [30, "30 días"]],
};

const state = {
  source: "gdelt",
  days: 3, // ventana seleccionada, en días
  keyword: "",
  language: "",
  gdeltData: { generated: "", days: [], locations: [] },
  acledData: null,
  data: { generated: "", days: [], locations: [] }, // la fuente activa
  allArticles: [],
  // derivados de los filtros:
  locations: [],
  articles: [],
};

// ---------- Tema ----------
const root = document.documentElement;
const savedTheme = localStorage.getItem("theme");
if (savedTheme) root.dataset.theme = savedTheme;

function currentTheme() {
  return (
    root.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
}

document.getElementById("theme-toggle").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  localStorage.setItem("theme", next);
  applyBasemap();
  renderMarkers();
  renderLegend();
});

// ---------- Mapa ----------
if (typeof L === "undefined") {
  const el = document.getElementById("status");
  el.hidden = false;
  el.classList.add("is-error");
  el.textContent = "No se pudo cargar la librería del mapa (vendor/leaflet). Comprueba que la carpeta vendor/ está desplegada.";
  throw new Error("Leaflet no disponible");
}
const map = L.map("map", { worldCopyJump: true, minZoom: 2 }).setView([15, 0], 2);
let baseLayer = null;

function applyBasemap() {
  const style = currentTheme() === "dark" ? "dark_all" : "light_all";
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = L.tileLayer(
    `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`,
    {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 12,
    }
  ).addTo(map);
}
applyBasemap();

const markerLayer = L.layerGroup().addTo(map);
const markersByName = new Map();

function cssVar(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}

function binColors() {
  return [cssVar("--bin-1"), cssVar("--bin-2"), cssVar("--bin-3"), cssVar("--bin-4"), cssVar("--bin-5")];
}

// Umbrales por cuantiles para que los 5 bins repartan bien los datos reales
function computeBreaks(counts) {
  if (!counts.length) return [1, 2, 4, 8];
  const sorted = [...counts].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const breaks = [q(0.4), q(0.65), q(0.85), q(0.96)];
  // Garantiza umbrales estrictamente crecientes aunque haya muchos empates
  for (let i = 1; i < breaks.length; i++) {
    if (breaks[i] <= breaks[i - 1]) breaks[i] = breaks[i - 1] + 1;
  }
  return breaks;
}

let breaks = [1, 2, 4, 8];

function binIndex(count) {
  for (let i = 0; i < breaks.length; i++) if (count <= breaks[i]) return i;
  return breaks.length;
}

function radiusFor(count, maxCount) {
  const r = 4 + 14 * Math.sqrt(count / Math.max(1, maxCount));
  return Math.max(4, Math.min(18, r));
}

// ---------- Filtros (todo en el navegador, sin peticiones) ----------
function windowDays() {
  // Últimos N días del conjunto de datos, p.ej. ["20260707","20260708","20260709"]
  return state.data.days.slice(-state.days);
}

function applyFilters() {
  const days = windowDays();
  const kw = state.keyword.trim().toLowerCase();

  state.locations = state.data.locations
    .map((loc) => {
      let count = 0;
      let articles = 0;
      for (const d of days) {
        const v = loc.days?.[d];
        if (v) {
          count += v[0] || 0;
          articles += v[1] || 0;
        }
      }
      return { ...loc, count, articles };
    })
    .filter((loc) => loc.count > 0)
    .filter((loc) => !kw || loc.name.toLowerCase().includes(kw))
    .sort((a, b) => b.count - a.count);

  const cutoff = Date.now() - state.days * 86400000;
  state.articles = state.allArticles
    .filter((a) => !a.seenDate || a.seenDate.getTime() >= cutoff)
    .filter((a) => !state.language || a.language === state.language)
    .filter((a) => !kw || a.title.toLowerCase().includes(kw))
    .slice(0, 60);

  breaks = computeBreaks(state.locations.map((l) => l.count));
}

function renderAll() {
  applyFilters();
  renderMarkers();
  renderLegend();
  renderChart();
  renderStats();
  renderTopLocations();
  renderArticles();
  renderTable();
}

// ---------- Render ----------
function renderMarkers() {
  markerLayer.clearLayers();
  markersByName.clear();
  const colors = binColors();
  const surface = cssVar("--surface-1");
  const maxCount = state.locations[0]?.count ?? 1;

  for (const loc of state.locations) {
    const marker = L.circleMarker([loc.lat, loc.lon], {
      radius: radiusFor(loc.count, maxCount),
      fillColor: colors[binIndex(loc.count)],
      fillOpacity: 0.85,
      color: surface, // anillo de 2px del color de la superficie: separa marcas solapadas
      weight: 2,
    });
    const newsLink = loc.url
      ? `<a href="${escapeHtml(loc.url)}" target="_blank" rel="noopener">Noticia relacionada →</a>`
      : `<a href="https://www.google.com/search?q=${encodeURIComponent(
          "protestas " + loc.name
        )}&tbm=nws" target="_blank" rel="noopener">Buscar noticias →</a>`;
    marker.bindPopup(
      `<div class="popup-title">${escapeHtml(loc.name)}</div>
       <div class="popup-meta">${loc.count.toLocaleString("es")} eventos de protesta en el periodo</div>
       <div class="popup-meta">${newsLink}</div>`
    );
    marker.bindTooltip(`${loc.name} · ${loc.count.toLocaleString("es")}`);
    marker.addTo(markerLayer);
    markersByName.set(loc.name, marker);
  }
}

// ---------- Gráfico de evolución diaria (SVG, una sola serie) ----------
function fmtDia(ymd) {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  return d.toLocaleDateString("es", { day: "numeric", month: "short", timeZone: "UTC" });
}

function renderChart() {
  const el = document.getElementById("chart");
  const days = state.data.days;
  if (!days.length) {
    el.innerHTML = '<p class="chart-empty">Sin datos todavía.</p>';
    return;
  }
  const inWindow = new Set(windowDays());
  const kw = state.keyword.trim().toLowerCase();
  const totals = days.map((d) => {
    let t = 0;
    for (const loc of state.data.locations) {
      if (kw && !loc.name.toLowerCase().includes(kw)) continue;
      const v = loc.days?.[d];
      if (v) t += v[0] || 0;
    }
    return t;
  });

  const W = 720, H = 170, padL = 40, padR = 8, padT = 16, padB = 22;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const max = Math.max(1, ...totals);
  const step = iw / days.length;
  const bw = Math.min(48, step * 0.8); // hueco de ≥2px entre barras
  const y = (v) => padT + ih - (v / max) * ih;
  const maxIdx = totals.indexOf(Math.max(...totals));
  const everyN = Math.ceil(days.length / 8); // como máximo ~8 etiquetas en el eje X

  let cuerpo = "";
  days.forEach((d, i) => {
    const x = padL + i * step + (step - bw) / 2;
    const alto = Math.max(2, (totals[i] / max) * ih);
    const fill = inWindow.has(d) ? "var(--accent)" : "var(--hairline)";
    cuerpo +=
      `<g class="bar"><title>${fmtDia(d)}: ${totals[i].toLocaleString("es")} eventos</title>` +
      `<rect x="${x.toFixed(1)}" y="${(padT + ih - alto).toFixed(1)}" width="${bw.toFixed(1)}" height="${alto.toFixed(1)}" rx="2" fill="${fill}"></rect></g>`;
    // etiqueta el último día siempre, y el resto cada N — sin chocar con la última
    const esUltimo = i === days.length - 1;
    if (esUltimo || (i % everyN === 0 && days.length - 1 - i > everyN / 2)) {
      cuerpo += `<text class="axis-label" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${fmtDia(d)}</text>`;
    }
  });
  // etiqueta directa solo en el día máximo (no en todas las barras)
  cuerpo += `<text class="value-label" x="${(padL + maxIdx * step + step / 2).toFixed(1)}" y="${(y(totals[maxIdx]) - 5).toFixed(1)}" text-anchor="middle">${totals[maxIdx].toLocaleString("es")}</text>`;

  const ejes =
    `<line class="gridline" x1="${padL}" y1="${y(max).toFixed(1)}" x2="${W - padR}" y2="${y(max).toFixed(1)}"></line>` +
    `<text class="axis-label" x="${padL - 6}" y="${(y(max) + 4).toFixed(1)}" text-anchor="end">${max.toLocaleString("es")}</text>` +
    `<line class="baseline" x1="${padL}" y1="${padT + ih}" x2="${W - padR}" y2="${padT + ih}"></line>` +
    `<text class="axis-label" x="${padL - 6}" y="${padT + ih + 4}" text-anchor="end">0</text>`;

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Eventos de protesta por día">${ejes}${cuerpo}</svg>`;
}

function rangeLabel(from, to) {
  if (from >= to) return to.toLocaleString("es");
  return `${from.toLocaleString("es")} – ${to.toLocaleString("es")}`;
}

function renderLegend() {
  const colors = binColors();
  const labels = [
    `≤ ${breaks[0].toLocaleString("es")}`,
    rangeLabel(breaks[0] + 1, breaks[1]),
    rangeLabel(breaks[1] + 1, breaks[2]),
    rangeLabel(breaks[2] + 1, breaks[3]),
    `> ${breaks[3].toLocaleString("es")}`,
  ];
  document.getElementById("legend").innerHTML =
    `<strong>Eventos</strong>` +
    labels
      .map(
        (label, i) =>
          `<div class="legend-row"><span class="legend-swatch" style="background:${colors[i]}"></span>${label}</div>`
      )
      .join("");
}

function renderStats() {
  const total = state.locations.reduce((sum, l) => sum + l.count, 0);
  const top = state.locations[0];
  document.getElementById("stat-locations").textContent =
    state.locations.length.toLocaleString("es");
  document.getElementById("stat-mentions").textContent = total.toLocaleString("es");
  document.getElementById("stat-top").textContent = top ? top.name : "—";
  document.getElementById("stat-top-note").textContent = top
    ? `${top.count.toLocaleString("es")} eventos`
    : "sin datos en el periodo";
}

function renderTopLocations() {
  const el = document.getElementById("top-locations");
  el.innerHTML = "";
  for (const loc of state.locations.slice(0, 10)) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = loc.name;
    btn.addEventListener("click", () => {
      map.flyTo([loc.lat, loc.lon], 6);
      markersByName.get(loc.name)?.openPopup();
    });
    const count = document.createElement("span");
    count.className = "top-count";
    count.textContent = ` · ${loc.count.toLocaleString("es")}`;
    li.append(btn, count);
    el.appendChild(li);
  }
  if (!state.locations.length) {
    el.innerHTML = "<li>Sin resultados para estos filtros.</li>";
  }
}

function renderArticles() {
  const el = document.getElementById("articles");
  el.innerHTML = "";
  for (const art of state.articles) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = art.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = art.title;
    const meta = document.createElement("div");
    meta.className = "article-meta";
    meta.textContent = [art.domain, art.country, formatDate(art.seenDate)]
      .filter(Boolean)
      .join(" · ");
    li.append(a, meta);
    el.appendChild(li);
  }
  if (!state.articles.length) {
    el.innerHTML = "<li>Sin artículos para estos filtros.</li>";
  }
}

function renderTable() {
  const body = document.getElementById("table-body");
  body.innerHTML = "";
  state.locations.slice(0, 100).forEach((loc, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${i + 1}</td><td>${escapeHtml(loc.name)}</td>` +
      `<td>${loc.count.toLocaleString("es")}</td>` +
      `<td>${loc.lat.toFixed(2)}</td><td>${loc.lon.toFixed(2)}</td>`;
    body.appendChild(tr);
  });
}

// ---------- Utilidades ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function formatDate(d) {
  if (!d) return "";
  return d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function setStatus(message, isError = false) {
  const el = document.getElementById("status");
  el.hidden = !message;
  el.textContent = message || "";
  el.classList.toggle("is-error", isError);
}

function setUpdatedNote() {
  const el = document.getElementById("updated");
  if (!el) return;
  if (!state.data.generated) {
    el.textContent = "";
    return;
  }
  const d = new Date(state.data.generated);
  el.textContent = Number.isNaN(d.getTime())
    ? ""
    : `Datos actualizados: ${d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. `;
}

// ---------- Fuente de datos activa ----------
function setSource(source) {
  state.source = source;
  state.data = source === "acled" && state.acledData ? state.acledData : state.gdeltData;

  // Reetiquetar los chips de periodo según la fuente y activar el del medio
  const defs = PERIODS[source] || PERIODS.gdelt;
  const chips = [...document.querySelectorAll(".chip[data-days]")];
  chips.forEach((chip, i) => {
    const def = defs[Math.min(i, defs.length - 1)];
    chip.dataset.days = def[0];
    chip.textContent = def[1];
    chip.classList.toggle("is-active", i === 1);
    if (i === 1) chip.setAttribute("aria-pressed", "true");
    else chip.removeAttribute("aria-pressed");
  });
  state.days = defs[1][0];

  document.querySelectorAll(".chip[data-source]").forEach((chip) => {
    const active = chip.dataset.source === source;
    chip.classList.toggle("is-active", active);
    if (active) chip.setAttribute("aria-pressed", "true");
    else chip.removeAttribute("aria-pressed");
  });

  setUpdatedNote();
  renderAll();
}

// ---------- Carga de datos (archivos locales del repositorio) ----------
async function load() {
  const btn = document.getElementById("refresh");
  btn.disabled = true;
  setStatus("Cargando datos…");
  try {
    const [data, articles, acled] = await Promise.all([
      loadProtestData(),
      loadArticles(),
      loadAcledData(),
    ]);
    state.gdeltData = data;
    state.acledData = acled;
    state.allArticles = articles;

    // El selector de fuente solo aparece cuando el robot ya generó datos de ACLED
    document.getElementById("source-group").hidden = !acled;
    if (state.source === "acled" && !acled) state.source = "gdelt";
    state.data = state.source === "acled" && acled ? acled : data;

    renderAll();
    setUpdatedNote();
    if (!data.locations.length) {
      setStatus(
        "🕐 Los datos del mapa aún se están generando. El robot de datos (GitHub Actions) se ejecuta cada hora; " +
          "si acabas de crear la web, ejecútalo una vez a mano desde la pestaña Actions del repositorio."
      );
    } else {
      setStatus("");
    }
  } catch (err) {
    console.error(err);
    setStatus(
      `No se pudieron cargar los datos: ${err.message}. Comprueba que la carpeta data/ existe en el repositorio.`,
      true
    );
  } finally {
    btn.disabled = false;
  }
}

// ---------- Controles ----------
document.querySelectorAll(".chip[data-source]").forEach((chip) => {
  chip.addEventListener("click", () => setSource(chip.dataset.source));
});

document.querySelectorAll(".chip[data-days]").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip[data-days]").forEach((c) => {
      c.classList.remove("is-active");
      c.removeAttribute("aria-pressed");
    });
    chip.classList.add("is-active");
    chip.setAttribute("aria-pressed", "true");
    state.days = Number(chip.dataset.days);
    renderAll(); // filtro instantáneo, sin recargar datos
  });
});

document.getElementById("refresh").addEventListener("click", () => {
  state.keyword = document.getElementById("keyword").value;
  state.language = document.getElementById("language").value;
  load();
});

document.getElementById("keyword").addEventListener("input", () => {
  state.keyword = document.getElementById("keyword").value;
  renderAll();
});

document.getElementById("language").addEventListener("change", () => {
  state.language = document.getElementById("language").value;
  renderAll();
});

document.getElementById("table-toggle").addEventListener("click", (e) => {
  const view = document.getElementById("table-view");
  view.hidden = !view.hidden;
  e.target.setAttribute("aria-expanded", String(!view.hidden));
  e.target.textContent = view.hidden ? "Ver como tabla" : "Ocultar tabla";
  if (!view.hidden) view.scrollIntoView({ behavior: "smooth" });
});

// ---------- Arranque ----------
renderLegend();
load();
setInterval(load, REFRESH_EVERY_MS);
