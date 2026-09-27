/**
 * Configuración de contacto y formularios de OITraF.
 *
 * El sitio es estático (GitHub Pages), así que los formularios envían los datos
 * a un servicio de formularios externo. Pasos para activarlos:
 *   1. Crear una cuenta gratuita en Formspree (https://formspree.io) o Web3Forms
 *      (https://web3forms.com) con el correo institucional.
 *   2. Crear un formulario para «Suscripción» y otro para «Contacto» y pegar acá
 *      las URL de envío (Formspree: https://formspree.io/f/xxxxxxxx;
 *      Web3Forms: https://api.web3forms.com/submit con el access_key en `clave`).
 *   3. Publicar el cambio. Si la URL queda vacía, el formulario abre el programa
 *      de correo del visitante con el mensaje ya redactado hacia `email`.
 */
export const CONTACTO = {
  email: "oitrafuturo@gmail.com",
  suscripcion: { url: "", clave: "" },
  contacto: { url: "", clave: "" },
};
