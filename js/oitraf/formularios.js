/**
 * Formularios de suscripción y de contacto para estudios a medida.
 * Envían al servicio configurado en config.js; si no hay servicio o falla,
 * abren el correo del visitante con el mensaje redactado. Incluyen un campo
 * trampa para robots de spam y exigen el consentimiento de datos.
 *
 * Estados visibles en la página: botón deshabilitado con «Enviando…» durante
 * el envío, mensaje de éxito, mensaje de error con botón de reintento y
 * aviso cuando se recurre al correo.
 */
import { CONTACTO } from "./config.js";

const TIEMPO_MAXIMO_MS = 15000;
const LARGO_MAXIMO_MAILTO = 1800; // los enlaces mailto muy largos fallan en algunos móviles

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

function mostrar(form, tipo, texto, accion) {
  const msg = form.querySelector(".form-msg");
  if (!msg) return;
  msg.replaceChildren(document.createTextNode(texto));
  if (accion) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "form-reintentar";
    btn.textContent = accion.etiqueta;
    btn.addEventListener("click", accion.alHacerClic);
    msg.append(" ", btn);
  }
  msg.className = `form-msg form-msg--${tipo}`;
  msg.hidden = false;
}

function ocultar(form) {
  const msg = form.querySelector(".form-msg");
  if (msg) msg.hidden = true;
}

async function enviarServicio(cfg, datos, asunto) {
  if (!cfg || !cfg.url) return false;
  const cuerpo = { ...datos, _subject: asunto, pagina: location.href.split("#")[0] };
  if (cfg.clave) cuerpo.access_key = cfg.clave;
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  try {
    const r = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  } finally {
    clearTimeout(temporizador);
  }
}

// Enlace mailto con asunto y cuerpo codificados (saltos de línea CRLF, RFC 6068)
export function enlaceCorreo(datos, asunto) {
  const lineas = Object.entries(datos).map(([k, v]) => `${k}: ${v}`);
  lineas.push("", `Enviado desde ${location.href.split("#")[0]}`);
  let cuerpo = lineas.join("\r\n").replace(/\r?\n/g, "\r\n");
  if (cuerpo.length > LARGO_MAXIMO_MAILTO) cuerpo = `${cuerpo.slice(0, LARGO_MAXIMO_MAILTO)}…`;
  return `mailto:${CONTACTO.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

function porCorreo(datos, asunto) {
  const a = document.createElement("a");
  a.href = enlaceCorreo(datos, asunto);
  a.rel = "noopener";
  document.body.append(a);
  a.click(); // un clic real funciona mejor que location.href en los navegadores móviles
  a.remove();
}

function conectar(id, cfg, asunto, gracias) {
  const form = document.getElementById(id);
  if (!form) return;
  const btn = form.querySelector('button[type="submit"]');
  const etiquetaOriginal = btn.textContent;

  const ocupado = (si) => {
    btn.disabled = si;
    btn.setAttribute("aria-busy", String(si));
    btn.textContent = si ? "Enviando…" : etiquetaOriginal;
  };

  const enviar = async () => {
    const datos = leer(form);
    if (!datos) return;
    ocultar(form);
    ocupado(true);
    try {
      if (await enviarServicio(cfg, datos, asunto)) {
        form.reset();
        mostrar(form, "ok", gracias);
        return;
      }
      // sin servicio configurado: correo del visitante
      porCorreo(datos, asunto);
      mostrar(form, "info", `Se abrió tu programa de correo con el mensaje listo para enviar a ${CONTACTO.email}. Si no se abrió, escribinos directamente a esa dirección.`);
    } catch (err) {
      console.warn("[OITraF] el servicio de formularios no respondió:", err);
      mostrar(form, "error", "No pudimos enviar el formulario. Podés reintentar o mandarlo por correo.", {
        etiqueta: "Reintentar",
        alHacerClic: enviar,
      });
      const msg = form.querySelector(".form-msg");
      const alt = document.createElement("a");
      alt.href = enlaceCorreo(datos, asunto);
      alt.textContent = "Enviar por correo";
      alt.className = "form-reintentar";
      msg.append(" ", alt);
    } finally {
      ocupado(false);
    }
  };

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    enviar();
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
