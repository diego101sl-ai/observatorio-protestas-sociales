/**
 * Configuración de contacto y formularios de OITraF.
 *
 * El sitio es estático (GitHub Pages), así que los formularios envían los datos
 * a un servicio de formularios externo. Pasos para activarlos:
 *   1. Crear una cuenta gratuita en Formspree (https://formspree.io) con el
 *      correo institucional y crear dos formularios: «Suscripción» y «Contacto».
 *   2. Pegar acá las dos URL de envío (formato https://formspree.io/f/xxxxxxxx).
 *   3. Publicar el cambio. Mientras una URL esté vacía o el servicio falle, ese
 *      formulario abre el programa de correo del visitante con el mensaje ya
 *      redactado hacia `email`.
 *
 * La política de seguridad de contenido de index.html (connect-src y
 * form-action) autoriza únicamente https://formspree.io. Si en lugar de
 * Formspree se usa Web3Forms, hay que poner su URL de envío
 * (https://api.web3forms.com/submit) y la access_key en `clave`, y agregar
 * https://api.web3forms.com a esas dos directivas de la CSP.
 */
export const CONTACTO = {
  email: "oitrafuturo@gmail.com",
  // FALTA: URL del formulario «Suscripción» en Formspree (https://formspree.io/f/…)
  suscripcion: { url: "", clave: "" },
  // FALTA: URL del formulario «Contacto / estudios a medida» en Formspree (https://formspree.io/f/…)
  contacto: { url: "", clave: "" },
};
