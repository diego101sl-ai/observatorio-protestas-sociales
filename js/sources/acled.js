/**
 * Fuente de datos: ACLED (https://acleddata.com/) — PENDIENTE DE ACTIVAR.
 *
 * ACLED es la base de datos académica de referencia sobre protestas y
 * conflictos: eventos verificados y codificados a mano, no solo cobertura
 * mediática. Requiere registro gratuito (uso no comercial):
 *
 *   1. Crea una cuenta en https://acleddata.com/register/
 *   2. Genera tu clave en https://developer.acleddata.com/
 *   3. Copia `js/config.example.js` a `js/config.js` y rellena ACLED_KEY
 *      y ACLED_EMAIL (config.js está en .gitignore: la clave nunca se sube).
 *   4. En `js/app.js`, importa y combina `fetchAcledEvents` con los datos
 *      de GDELT (misma forma de salida: {name, lat, lon, count}).
 *
 * IMPORTANTE: en una web 100 % estática la clave viaja al navegador del
 * visitante. Para uso personal está bien; para una web pública, sirve ACLED
 * a través de un pequeño proxy (Cloudflare Worker, Netlify Function…) que
 * guarde la clave en el servidor.
 */

const ACLED_API = "https://api.acleddata.com/acled/read";

/**
 * Eventos de protesta verificados por ACLED, agregados por ubicación
 * con la misma forma que la fuente GDELT para poder combinarlos.
 * @param {{apiKey: string, email: string, days?: number}} opts
 * @returns {Promise<Array<{name: string, lat: number, lon: number, count: number}>>}
 */
export async function fetchAcledEvents({ apiKey, email, days = 7 }) {
  if (!apiKey || !email) {
    throw new Error("ACLED no está configurado: añade tu clave en js/config.js");
  }
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    key: apiKey,
    email,
    event_type: "Protests",
    event_date: since,
    event_date_where: ">=",
    limit: "2000",
  });
  const res = await fetch(`${ACLED_API}?${params}`);
  if (!res.ok) throw new Error(`ACLED respondió HTTP ${res.status}`);
  const data = await res.json();
  const events = data?.data ?? [];

  // Agrega eventos por ciudad para pintarlos como focos en el mapa
  const byPlace = new Map();
  for (const e of events) {
    const lat = Number(e.latitude);
    const lon = Number(e.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const name = [e.location, e.country].filter(Boolean).join(", ");
    const key = `${name}|${lat.toFixed(2)}|${lon.toFixed(2)}`;
    const prev = byPlace.get(key);
    if (prev) prev.count += 1;
    else byPlace.set(key, { name, lat, lon, count: 1 });
  }
  return [...byPlace.values()].sort((a, b) => b.count - a.count);
}
