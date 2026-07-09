/**
 * Fuente de datos: GDELT 2.0 (https://www.gdeltproject.org/)
 * API pública, sin clave, con CORS abierto. Rastrea la cobertura mediática
 * mundial y etiqueta los artículos con el tema GKG "PROTEST".
 *
 * Limitaciones a tener en cuenta:
 *  - Mide COBERTURA (menciones en prensa), no eventos verificados.
 *  - La API GEO cubre como máximo los últimos 7 días.
 *  - Puede devolver HTTP 200 con un cuerpo de texto de error; se valida el JSON.
 */

const GEO_API = "https://api.gdeltproject.org/api/v2/geo/geo";
const DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";

function buildQuery({ keyword }) {
  let q = "theme:PROTEST";
  const kw = (keyword || "").trim();
  if (kw) q += ` "${kw.replaceAll('"', "")}"`;
  return q;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GDELT respondió HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // La API devuelve texto plano ("Timespan too large", rate limit…) con HTTP 200
    throw new Error(text.slice(0, 200) || "Respuesta vacía de GDELT");
  }
}

/**
 * Focos geolocalizados de cobertura de protestas.
 * @param {{timespan: number, keyword?: string}} opts timespan en minutos (máx. 7 días)
 * @returns {Promise<Array<{name: string, lat: number, lon: number, count: number}>>}
 */
export async function fetchProtestLocations({ timespan, keyword }) {
  const params = new URLSearchParams({
    query: buildQuery({ keyword }),
    format: "geojson",
    timespan: String(timespan),
  });
  const data = await fetchJson(`${GEO_API}?${params}`);
  const features = data?.features ?? [];
  return features
    .map((f) => ({
      name: f.properties?.name || "Lugar sin nombre",
      count: Number(f.properties?.count) || 1,
      lon: f.geometry?.coordinates?.[0],
      lat: f.geometry?.coordinates?.[1],
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .sort((a, b) => b.count - a.count);
}

/**
 * Artículos recientes sobre protestas.
 * @param {{timespan: number, keyword?: string, language?: string, max?: number}} opts
 * @returns {Promise<Array<{title: string, url: string, domain: string, country: string, language: string, seenDate: Date|null}>>}
 */
export async function fetchProtestArticles({ timespan, keyword, language, max = 40 }) {
  let query = buildQuery({ keyword });
  if (language) query += ` sourcelang:${language}`;
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: String(max),
    sort: "datedesc",
    timespan: String(timespan),
  });
  const data = await fetchJson(`${DOC_API}?${params}`);
  const articles = data?.articles ?? [];
  return articles.map((a) => ({
    title: a.title || a.url,
    url: a.url,
    domain: a.domain || "",
    country: a.sourcecountry || "",
    language: a.language || "",
    seenDate: parseSeenDate(a.seendate),
  }));
}

function parseSeenDate(s) {
  // Formato GDELT: "20260709T134500Z"
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || "");
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}
