'use strict';
/* Pantalla del jugador (celular) */
const socket = io();
const $ = sel => document.querySelector(sel);
const pantallas = ['#entrar', '#espera', '#pregunta', '#estado', '#muerto', '#fin', '#mi-repaso'];
function mostrar(sel) {
  for (const p of pantallas) $(p).classList.toggle('oculto', p !== sel);
}

const FORMAS = ['▲', '■', '●', '◆', '★'];
let miNombre = null;
let miUltimaOpcion = null;
let miReloj = 0;          // ms restantes al abrir la pregunta
let inicioPregunta = 0;
let preguntaAbierta = false;
let estoyVivo = true;
let timerBarra = null;
let drenaje = null;
let urgenteSono = false;
let graciaMs = 0;
let ventanaMs = 0;
let pedidosRestantes = 0;
let segundosDonacion = 5;
let pediAhora = false;        // ya pedí en esta pregunta
let pedidoAjeno = null;       // { clave, nombre } de un compañero que pide
let ultimoRepaso = null;      // { repaso, misRespuestas } para la pantalla final

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const EMOJIS = {
  detector_opiniones: '🔍', radar_sectorial: '🧭', ojo_de_aguila: '🦅',
  cazador_actores: '🎯', rayo: '⚡', campeon: '🏆', al_limite: '🫀', racha: '🔥',
  pluma_perfecta: '🖋️', maraton: '📚', veterano: '🗞️', companera: '🤝',
};

// prellenar código si vino por QR (?sala=1234)
const params = new URLSearchParams(location.search);
if (params.get('sala')) $('#codigo').value = params.get('sala');

window.addEventListener('load', () => {
  const nombre = sessionStorage.getItem('cde-nombre');
  const sala = sessionStorage.getItem('cde-sala');
  if (nombre && sala && !miNombre) {
    $('#codigo').value = sala;
    $('#nombre').value = nombre;
  }
});

$('#form-entrar').addEventListener('submit', e => {
  e.preventDefault();
  Sonidos.activar();
  $('#error').textContent = '';
  socket.emit('jugador:entrar', {
    codigo: $('#codigo').value.trim(),
    nombre: $('#nombre').value.trim(),
  }, resp => {
    if (resp.error) { $('#error').textContent = resp.error; return; }
    miNombre = resp.nombre;
    sessionStorage.setItem('cde-nombre', resp.nombre);
    sessionStorage.setItem('cde-sala', resp.codigo);
    $('#chip-yo').textContent = miNombre;
    $('#chip-yo').classList.remove('oculto');
    $('#cred-nombre').textContent = miNombre;
    $('#cred-partidas').textContent = resp.perfil.partidas === 0
      ? 'Primera partida — ¡bienvenido/a a la redacción!'
      : `${resp.perfil.partidas} partida${resp.perfil.partidas === 1 ? '' : 's'} jugada${resp.perfil.partidas === 1 ? '' : 's'}`;
    $('#mi-coleccion').innerHTML = (resp.perfil.insignias || [])
      .map(id => `<span class="insignia">${EMOJIS[id] || '🏅'}</span>`).join('');
    Sonidos.unirse();
    if (!resp.reconectado) mostrar('#espera');
  });
});

socket.on('partida:comenzo', ({ relojInicial, pedidos, donacion, umbralPedir, minimoDonar }) => {
  estoyVivo = true;
  miReloj = relojInicial;
  pedidosRestantes = pedidos;
  segundosDonacion = donacion;
  if (umbralPedir) UMBRAL_PEDIR = umbralPedir;
  if (minimoDonar) MINIMO_DONAR = minimoDonar;
  pedidoAjeno = null;
  ultimoRepaso = null;
  $('#chip-reloj').textContent = `⏱ ${fmt(miReloj)}`;
  $('#chip-reloj').classList.remove('oculto');
  $('#estado-emoji').textContent = '🗞️';
  $('#estado-titulo').textContent = '¡Arranca la edición!';
  $('#estado-detalle').textContent = `Tenés ${fmt(relojInicial)} de vida. Acertá para sumar tiempo.`;
  $('#estado-reloj').textContent = '';
  mostrar('#estado');
});

socket.on('pregunta:nueva', p => {
  if (!estoyVivo) return; // los eliminados miran la pantalla central
  miUltimaOpcion = null;
  urgenteSono = false;
  const mio = p.relojes.find(r => r.nombre === miNombre);
  if (mio) miReloj = mio.restante;

  $('#texto-preg').textContent = p.texto;
  $('#contexto-preg').textContent = p.contexto || '';
  $('#premio-preg').textContent = `+${p.gana}s si acertás`;
  $('#opciones').innerHTML = p.opciones.map((op, i) =>
    `<button class="opcion op-${i}" data-i="${i}"><span class="forma">${FORMAS[i]}</span><span>${escapar(op)}</span></button>`
  ).join('');
  for (const btn of document.querySelectorAll('#opciones .opcion')) {
    btn.addEventListener('click', () => responder(Number(btn.dataset.i)));
  }

  // barra de la ventana común
  const relleno = $('#barra-j').firstElementChild;
  relleno.style.transition = 'none';
  relleno.style.transform = 'scaleX(1)';
  clearTimeout(timerBarra);
  timerBarra = setTimeout(() => {
    relleno.style.transition = `transform ${p.ventana}s linear`;
    relleno.style.transform = 'scaleX(0)';
  }, 60);
  $('#barra-j').classList.toggle('urgente', p.nivel >= 3);

  // mi reloj vital corre mientras la pregunta está abierta (tras la gracia de lectura)
  inicioPregunta = Date.now();
  graciaMs = (p.gracia || 0) * 1000;
  ventanaMs = p.ventana * 1000;
  pediAhora = false;
  pedidoAjeno = null;
  preguntaAbierta = true;
  clearInterval(drenaje);
  pintarMiReloj();
  drenaje = setInterval(pintarMiReloj, 150);

  Sonidos.pregunta();
  mostrar('#pregunta');
});

const RELOJ_MAX_VISUAL = 90000;
const LARGO_ARO = 276.5;

function transcurridoReal() {
  if (!preguntaAbierta) return 0;
  return Math.max(0, Math.min(Date.now() - inicioPregunta - graciaMs, ventanaMs - graciaMs));
}

function pintarMiReloj() {
  const resta = Math.max(0, miReloj - transcurridoReal());
  pintarAyuda(resta);
  $('#mi-reloj').textContent = fmt(resta);
  const critico = resta < 8000;
  $('#aro').classList.toggle('critico', critico);
  const fraccion = Math.min(1, resta / RELOJ_MAX_VISUAL);
  $('#aro-frente').style.strokeDashoffset = String(LARGO_ARO * (1 - fraccion));
  $('#chip-reloj').textContent = `⏱ ${fmt(resta)}`;
  if (critico && !urgenteSono && preguntaAbierta) {
    urgenteSono = true;
    Sonidos.urgente();
  }
}

// ---------- Pedir / donar segundos (umbrales los define el servidor) ----------
let UMBRAL_PEDIR = 35000;
let MINIMO_DONAR = 12000;

function pintarAyuda(restaMs) {
  const zona = $('#zona-ayuda');
  let html = '';

  if (pedidoAjeno && pedidoAjeno.nombre !== miNombre && estoyVivo && restaMs > MINIMO_DONAR) {
    html += `<button class="boton donar" data-donar="${escapar(pedidoAjeno.clave)}">
        🤝 Darle ${segundosDonacion}s a ${escapar(pedidoAjeno.nombre)}</button>`;
  } else if (pedidoAjeno && pedidoAjeno.nombre !== miNombre && estoyVivo) {
    html += `<span class="nota-ayuda">${escapar(pedidoAjeno.nombre)} pide ${segundosDonacion}s · necesitás más de ${MINIMO_DONAR / 1000}s para poder dar</span>`;
  }

  if (estoyVivo && !pediAhora && pedidosRestantes > 0 && restaMs <= UMBRAL_PEDIR) {
    html += `<button class="boton pedir" data-pedir="1">
        🙋 Pedir ${segundosDonacion} segundos (te quedan ${pedidosRestantes})</button>`;
  }

  if (zona.innerHTML !== html) zona.innerHTML = html;
}

function limpiarAyuda() {
  $('#zona-ayuda').innerHTML = '';
}

document.addEventListener('click', e => {
  const pedir = e.target.closest('[data-pedir]');
  if (pedir) {
    pediAhora = true;
    socket.emit('jugador:pedirTiempo');
    Sonidos.pedido();
    pintarAyuda(0);
    return;
  }
  const donar = e.target.closest('[data-donar]');
  if (donar) {
    socket.emit('jugador:donarTiempo', { clave: donar.dataset.donar });
    pedidoAjeno = null;
    pintarAyuda(miReloj - transcurridoReal());
  }
});

socket.on('tiempo:pedido', ({ clave, nombre, restantes }) => {
  if (nombre === miNombre) {
    pedidosRestantes = restantes;
  } else {
    pedidoAjeno = { clave, nombre };
    Sonidos.pedido();
  }
  pintarAyuda(miReloj - transcurridoReal());
});

socket.on('tiempo:donado', ({ de, para, segundos, relojes }) => {
  if (pedidoAjeno && pedidoAjeno.nombre === para) pedidoAjeno = null;
  const mio = relojes.find(r => r.nombre === miNombre);
  if (mio) {
    // el servidor manda el reloj ya con la donación aplicada; reanclamos el cronómetro local
    miReloj = mio.restante + transcurridoReal();
  }
  if (para === miNombre) {
    Sonidos.donacion();
    $('#estado-detalle').textContent = `🤝 ${de} te dio ${segundos} segundos`;
  } else if (de === miNombre) {
    Sonidos.donacion();
  }
  pintarMiReloj();
});

socket.on('tiempo:vencido', ({ nombre }) => {
  if (pedidoAjeno && pedidoAjeno.nombre === nombre) pedidoAjeno = null;
  pintarAyuda(miReloj - transcurridoReal());
});

socket.on('tiempo:rechazado', ({ motivo }) => {
  pedidoAjeno = null;
  $('#zona-ayuda').innerHTML = `<span class="nota-ayuda">${escapar(motivo)}</span>`;
  setTimeout(() => pintarAyuda(miReloj - transcurridoReal()), 2500);
});

function responder(opcion) {
  if (miUltimaOpcion !== null || !estoyVivo) return;
  miUltimaOpcion = opcion;
  socket.emit('jugador:respuesta', { opcion });
  Sonidos.envio();
  $('#estado-emoji').textContent = '📨';
  $('#estado-titulo').textContent = 'Enviado a la mesa de edición';
  $('#estado-detalle').textContent = 'Tu reloj sigue corriendo hasta que respondan todos…';
  $('#estado-reloj').textContent = '';
  mostrar('#estado');
}

socket.on('pregunta:resultado', r => {
  preguntaAbierta = false;
  clearInterval(drenaje);
  const mio = r.detalle.find(d => d.nombre === miNombre);
  if (!mio) return;
  miReloj = mio.restante;
  $('#chip-reloj').textContent = `⏱ ${fmt(miReloj)}`;

  if (!mio.vivo) {
    estoyVivo = false;
    limpiarAyuda();
    Sonidos.muerte();
    const pos = r.tabla.find(t => t.nombre === miNombre);
    $('#muerto-posicion').textContent =
      `Quedaste ${pos ? pos.posicion + 'º' : 'fuera'} · caíste en la pregunta ${r.indice + 1}`;
    mostrar('#muerto');
    return;
  }

  if (!mio.respondio) {
    Sonidos.incorrecta();
    $('#estado-emoji').textContent = '⏰';
    $('#estado-titulo').textContent = 'No llegaste a responder';
    $('#estado-detalle').textContent = 'Sin respuesta no se gana tiempo.';
  } else if (mio.acerto) {
    Sonidos.correcta();
    setTimeout(() => Sonidos.ganoTiempo(), 250);
    $('#estado-emoji').textContent = mio.racha >= 3 ? '🔥' : '✅';
    $('#estado-titulo').textContent = mio.racha >= 3 ? `¡Correcta! Racha ×${mio.racha}` : '¡Correcta!';
    $('#estado-detalle').textContent = `+${Math.round(mio.ganadoMs / 1000)} segundos para tu reloj`;
  } else {
    Sonidos.incorrecta();
    $('#estado-emoji').textContent = '❌';
    $('#estado-titulo').textContent = 'No era esa';
    $('#estado-detalle').textContent = 'No ganás tiempo. El reloj sigue corriendo.';
  }
  const pos = r.tabla.filter(t => t.vivo).findIndex(t => t.nombre === miNombre);
  $('#estado-reloj').textContent = `⏱ ${fmt(miReloj)} · ${pos >= 0 ? `vas ${pos + 1}º de ${r.vivos} vivos` : ''}`;
  mostrar('#estado');
});

// ---------- Repaso personal ----------
$('#btn-mi-repaso').addEventListener('click', () => mostrar('#mi-repaso'));
$('#btn-volver-fin').addEventListener('click', () => mostrar('#fin'));

function pintarMiRepaso(repaso, misRespuestas) {
  const porIndice = new Map(misRespuestas.map(r => [r.indice, r]));
  $('#lista-mi-repaso').innerHTML = repaso.map((p, i) => {
    const mia = porIndice.get(i);
    const clase = !mia ? '' : mia.acerto ? 'acerte' : 'erre';
    const miTexto = mia && mia.opcion !== null ? p.opciones[mia.opcion] : null;
    return `<div class="repaso-item ${clase}">
      <div class="cabecera">
        <span class="numero">${p.n.toString().padStart(2, '0')}</span>
        <span class="etiqueta">${mia ? (mia.acerto ? '✅ correcta' : '❌ incorrecta') : '— no jugada'}</span>
      </div>
      <span class="consigna">${escapar(p.texto)}</span>
      ${p.contexto ? `<div class="cita">${escapar(p.contexto)}</div>` : ''}
      <div class="respuesta">
        <span class="marca-ok">✓ ${escapar(p.opciones[p.correcta])}</span>
        ${miTexto && !mia.acerto ? `<span class="marca-mal">${escapar(miTexto)}</span>` : ''}
      </div>
      <div class="porque">${escapar(p.explicacion)}</div>
    </div>`;
  }).join('');
}

socket.on('partida:fin', ({ resultados, insignias, repaso }) => {
  preguntaAbierta = false;
  clearInterval(drenaje);
  limpiarAyuda();
  const mio = resultados.find(r => r.nombre === miNombre);
  if (!mio) return;
  if (repaso) pintarMiRepaso(repaso, mio.respuestas || []);
  const medallas = { 1: '🥇', 2: '🥈', 3: '🥉' };
  if (mio.posicion === 1) Sonidos.victoria(); else Sonidos.finPartida();
  $('#fin-medalla').textContent = medallas[mio.posicion] || '📰';
  $('#fin-titulo').textContent = mio.posicion === 1 ? '¡Último/a en pie!' : `${mio.posicion}º puesto`;
  $('#fin-resumen').innerHTML =
    (mio.vivo ? `Sobreviviste con ${fmt(mio.restante)} en el reloj` : `Caíste en la pregunta ${mio.preguntaMuerte}`) +
    `<br>${mio.aciertos}/${mio.totalPreguntas} correctas · ` + resumenHabilidades(mio.stats);
  $('#fin-nuevas').innerHTML = mio.nuevasInsignias.map((id, i) => {
    const ins = insignias[id];
    return `<span class="insignia nueva" style="animation-delay:${0.2 + i * 0.2}s"><span class="emoji">${ins.emoji}</span>${ins.nombre}</span>`;
  }).join('');
  $('#fin-coleccion').innerHTML = mio.coleccion.map(id => {
    const ins = insignias[id];
    return `<span class="insignia" title="${escapar(ins.desc)}"><span class="emoji">${ins.emoji}</span>${ins.nombre}</span>`;
  }).join('') || '<span class="etiqueta">Todavía sin insignias — ¡se vienen!</span>';
  mostrar('#fin');
});

function resumenHabilidades(s) {
  const partes = [];
  if (s.hecho.total) partes.push(`hechos ${s.hecho.ok}/${s.hecho.total}`);
  if (s.sector.total) partes.push(`sector ${s.sector.ok}/${s.sector.total}`);
  if (s.escala.total) partes.push(`escala ${s.escala.ok}/${s.escala.total}`);
  if (s.actor.total) partes.push(`actores ${s.actor.ok}/${s.actor.total}`);
  return partes.join(' · ');
}

socket.on('sala:reabierta', () => {
  estoyVivo = true;
  limpiarAyuda();
  if (miNombre) mostrar('#espera');
});

socket.on('sala:cerrada', () => {
  mostrar('#entrar');
  $('#error').textContent = 'La sala se cerró. Pedí un código nuevo.';
});

function escapar(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
