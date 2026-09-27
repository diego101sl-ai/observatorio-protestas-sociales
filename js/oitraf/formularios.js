/**
 * Formularios de suscripción y de contacto para estudios a medida.
 * Envían al servicio configurado en config.js; si no hay servicio o falla,
 * abren el correo del visitante con el mensaje redactado. Incluyen un campo
 * trampa para robots de spam y exigen el consentimiento de datos.
 */
import { CONTACTO } from "./config.js";

function leer(form) {
  const fd = new FormData(form);
  if (fd.get("_trampa")) return null; // robot de spam
  const datos = {};
  fd.forEach((v, k) => {
    if (k.startsWith("_")) return;
    const val = String(v).trim();
    if (!val) return;
    datos[k] = datos[k] ? `${datos[k]}, ${val}` : val;
  });
  return datos;
}

function mostrar(form, tipo, texto) {
  const msg = form.querySelector(".form-msg");
  if (!msg) return;
  msg.textContent = texto;
  msg.className = `form-msg form-msg--${tipo}`;
  msg.hidden = false;
}

async function enviarServicio(cfg, datos, asunto) {
  if (!cfg || !cfg.url) return false;
  const cuerpo = { ...datos, _subject: asunto, pagina: location.href.split("#")[0] };
  if (cfg.clave) cuerpo.access_key = cfg.clave;
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return true;
}

function porCorreo(datos, asunto) {
  const cuerpo = Object.entries(datos).map(([k, v]) => `${k}: ${v}`).join("\n");
  const href = `mailto:${CONTACTO.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo + "\n\nEnviado desde " + location.href.split("#")[0])}`;
  window.location.href = href;
}

function conectar(id, cfg, asunto, gracias) {
  const form = document.getElementById(id);
  if (!form) return;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const datos = leer(form);
    if (!datos) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      if (await enviarServicio(cfg, datos, asunto)) {
        form.reset();
        mostrar(form, "ok", gracias);
        return;
      }
      porCorreo(datos, asunto);
      mostrar(form, "info", `Se abrió tu programa de correo con el mensaje listo para enviar a ${CONTACTO.email}. Si no se abrió, escribinos directamente a esa dirección.`);
    } catch {
      porCorreo(datos, asunto);
      mostrar(form, "info", `No pudimos enviar el formulario automáticamente; se abrió tu programa de correo con el mensaje listo para ${CONTACTO.email}.`);
    } finally {
      btn.disabled = false;
    }
  });
}

conectar("form-suscripcion", CONTACTO.suscripcion, "Suscripción a OITraF",
  "¡Gracias por suscribirte! Vas a recibir los informes, las ediciones especiales y el relevamiento completo de OITraF.");
conectar("form-contacto", CONTACTO.contacto, "Consulta por estudio a medida · OITraF",
  "Recibimos tu consulta. El equipo de OITraF se va a comunicar con vos a la brevedad.");

for (const a of document.querySelectorAll("a[data-correo]")) {
  a.href = `mailto:${CONTACTO.email}`;
  a.textContent = CONTACTO.email;
}
