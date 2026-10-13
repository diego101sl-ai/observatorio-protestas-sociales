/**
 * Página de lectura de una nota: tema claro/oscuro y contador de lecturas.
 * El contador usa un servicio externo sin clave (api.counterapi.dev, espacio
 * «oitraf-notas»); si no responde, el dato simplemente no se muestra.
 */
import { initTema } from "./comun.js";

initTema();

const CONTADOR = "https://api.counterapi.dev/v1/oitraf-notas/";

async function contarLectura() {
  const slug = document.body.dataset.nota;
  const caja = document.getElementById("nota-lecturas");
  const num = document.getElementById("nota-lecturas-n");
  if (!slug || !caja || !num) return;
  try {
    // una lectura por visita de pestaña: al recargar no se vuelve a contar
    const clave = `oitraf-leida-${slug}`;
    let yaContada = false;
    try { yaContada = sessionStorage.getItem(clave) === "1"; } catch { /* sin almacenamiento */ }
    const r = await fetch(`${CONTADOR}${encodeURIComponent(slug)}${yaContada ? "" : "/up"}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    const n = Number(d.count ?? d.value ?? d.data?.count);
    if (!Number.isFinite(n)) return;
    try { sessionStorage.setItem(clave, "1"); } catch { /* ignorar */ }
    num.textContent = n.toLocaleString("es-AR");
    caja.hidden = false;
  } catch {
    /* servicio no disponible: se omite el contador */
  }
}
contarLectura();
