import { fetchProtestLocations, fetchProtestArticles } from "./sources/gdelt.js";

const REFRESH_EVERY_MS = 15 * 60 * 1000;

const state = {
  timespan: 4320, // minutos (3 días)
  keyword: "",
  language: "",
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
    marker.bindPopup(
      `<div class="popup-title">${escapeHtml(loc.name)}</div>
       <div class="popup-meta">${loc.count.toLocaleString("es")} menciones en el periodo</div>
       <div class="popup-meta"><a href="https://www.google.com/search?q=${encodeURIComponent(
         "protestas " + loc.name
       )}&tbm=nws" target="_blank" rel="noopener">Buscar noticias →</a></div>`
    );
    marker.bindTooltip(`${loc.name} · ${loc.count.toLocaleString("es")}`);
    marker.addTo(markerLayer);
    markersByName.set(loc.name, marker);
  }
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
    `<strong>Menciones</strong>` +
    labels
      .map(
        (label, i) =>
          `<div class="legend-row"><span class="legend-swatch" style="background:${colors[i]}"></span>${label}</div>`
      )
      .join("");
}

// ---------- Paneles ----------
function renderStats() {
  const total = state.locations.reduce((sum, l) => sum + l.count, 0);
  const top = state.locations[0];
  document.getElementById("stat-locations").textContent =
    state.locations.length.toLocaleString("es");
  document.getElementById("stat-mentions").textContent = total.toLocaleString("es");
  document.getElementById("stat-top").textContent = top ? top.name : "—";
  document.getElementById("stat-top-note").textContent = top
    ? `${top.count.toLocaleString("es")} menciones`
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

// ---------- Carga de datos ----------
async function load() {
  const btn = document.getElementById("refresh");
  btn.disabled = true;
  setStatus("Cargando datos de GDELT…");
  try {
    const opts = {
      timespan: state.timespan,
      keyword: state.keyword,
      language: state.language,
    };
    const [locations, articles] = await Promise.all([
      fetchProtestLocations(opts),
      fetchProtestArticles(opts),
    ]);
    state.locations = locations;
    state.articles = articles;
    breaks = computeBreaks(locations.map((l) => l.count));
    renderMarkers();
    renderLegend();
    renderStats();
    renderTopLocations();
    renderArticles();
    renderTable();
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(
      `No se pudieron cargar los datos: ${err.message}. GDELT limita las peticiones; espera unos segundos y pulsa «Actualizar».`,
      true
    );
  } finally {
    btn.disabled = false;
  }
}

// ---------- Controles ----------
document.querySelectorAll(".chip[data-timespan]").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip[data-timespan]").forEach((c) => {
      c.classList.remove("is-active");
      c.removeAttribute("aria-pressed");
    });
    chip.classList.add("is-active");
    chip.setAttribute("aria-pressed", "true");
    state.timespan = Number(chip.dataset.timespan);
    load();
  });
});

document.getElementById("refresh").addEventListener("click", () => {
  state.keyword = document.getElementById("keyword").value;
  state.language = document.getElementById("language").value;
  load();
});

document.getElementById("keyword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("refresh").click();
});

document.getElementById("language").addEventListener("change", () => {
  document.getElementById("refresh").click();
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
