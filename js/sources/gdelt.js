/**
 * Fuente de datos: archivos estáticos generados cada hora por GitHub Actions
 * (ver .github/workflows/actualizar-datos.yml).
 *
 * El robot descarga los ficheros de eventos crudos de GDELT 2.0
 * (data.gdeltproject.org/gdeltv2), filtra los eventos de protesta
 * (código CAMEO raíz 14) y los agrega por ubicación en data/protests.json.
 * También guarda los artículos recientes de la DOC 2.0 API en
 * data/articles.json (esa API limita a 1 petición cada 5 s, por eso la
 * consulta el robot y no cada visitante).
 *
 * Ventaja: la web no depende de ninguna API externa en tiempo real —
 * solo lee sus propios archivos, sin CORS ni límites de peticiones.
 */

import { traducirLugar, traducirPais } from "../nombres-es.js";

async function fetchLocalJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer ${path} (HTTP ${res.status})`);
  return res.json();
}

/**
 * Datos del mapa.
 * @returns {Promise<{generated: string, days: string[], locations: Array<{
 *   name: string, cc: string, lat: number, lon: number, url?: string,
 *   days: Record<string, [number, number]>  // "YYYYMMDD" -> [eventos, artículos]
 * }>}>}
 */
export async function loadProtestData() {
  const data = await fetchLocalJson("data/protests.json");
  return {
    generated: data.generated || "",
    days: Array.isArray(data.days) ? data.days : [],
    locations: traducirLocalizaciones(data.locations),
  };
}

/**
 * Datos de ACLED (eventos verificados a mano), si el robot los ha generado.
 * Devuelve null si data/acled.json no existe todavía (ACLED sin configurar).
 * @returns {Promise<null | {generated: string, days: string[], locations: Array}>}
 */
export async function loadAcledData() {
  try {
    const data = await fetchLocalJson("data/acled.json");
    if (!Array.isArray(data.locations) || !data.locations.length) return null;
    return {
      generated: data.generated || "",
      days: Array.isArray(data.days) ? data.days : [],
      locations: traducirLocalizaciones(data.locations),
    };
  } catch {
    return null;
  }
}

// Los nombres de lugar llegan en inglés; se muestran traducidos al español
function traducirLocalizaciones(locations) {
  if (!Array.isArray(locations)) return [];
  return locations.map((loc) => ({ ...loc, name: traducirLugar(loc.name) }));
}

/**
 * Artículos de prensa recientes sobre protestas (el robot los pide ya
 * a medios en español; ver scripts/actualizar_datos.py).
 * @returns {Promise<Array<{title: string, url: string, domain: string,
 *   country: string, seenDate: Date|null}>>}
 */
export async function loadArticles() {
  const data = await fetchLocalJson("data/articles.json");
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles
    .filter((a) => a && a.url)
    .map((a) => ({
      title: a.title || a.url,
      url: a.url,
      domain: a.domain || "",
      country: traducirPais(a.sourcecountry || ""),
      seenDate: parseSeenDate(a.seendate),
    }));
}

function parseSeenDate(s) {
  // Formato GDELT: "20260709T134500Z"
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || "");
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}
