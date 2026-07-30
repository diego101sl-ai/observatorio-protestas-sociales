'use strict';
/* Pantalla central (proyector) */
const socket = io();

const $ = sel => document.querySelector(sel);
const pantallas = ['#inicio', '#lobby', '#cuenta', '#juego', '#fin', '#repaso'];
function mostrar(sel) {
  for (const p of pantallas) $(p).classList.toggle('oculto', p !== sel);
}

const FORMAS = ['▲', '■', '●', '◆', '★'];
const RELOJ_MAX_VISUAL = 130000;
let timerBarra = null;
let drenaje = null;      // intervalo que hace correr los relojes en pantalla
let relojes = [];        // snapshot de la tabla al abrir la pregunta
let inicioPregunta = 0;
let graciaMs = 0;        // segundos de lectura en los que el reloj no corre
let ventanaMs = 0;
let preguntaAbierta = false;
let jugadoresPrevios = 0;
let tictacTimer = null;

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- Sonido ----------
document.addEventListener('click', () => Sonidos.activar(), { once: true });
const btnSonido = $('#btn-sonido');
function pintarSonido() { btnSonido.textContent = Sonidos.mudo ? '🔇' : '🔊'; }
btnSonido.addEventListener('click', () => { Sonidos.activar(); Sonidos.alternarMudo(); pintarSonido(); });
pintarSonido();

// ---------- Crear sala ----------
$('#btn-crear').addEventListener('click', () => { Sonidos.activar(); socket.emit('host:crear'); });

socket.on('sala:creada', ({ codigo, urls, titulares }) => {
  // ticker de titulares reales (contenido duplicado para el bucle continuo)
  if (titulares && titulares.length) {
    const trozo = titulares
      .map(t => `<b>${escapar(t.titulo)}</b> <span class="sep">▪</span> `)
      .join('');
    $('#cinta-titulares').innerHTML = trozo + trozo;
  }
  $('#codigo-sala').textContent = codigo.split('').join(' ');
  // si la pantalla central se abrió como localhost, el QR debe usar la IP real de la red
  const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const base = (esLocal && urls[0]) ? urls[0] : location.origin;
  const urlJugar = `${base}/play?sala=${codigo}`;
  $('#url-sala').textContent = urlJugar.replace(/^https?:\/\//, '');
  if (window.qrcode) {
    const qr = qrcode(0, 'M');
    qr.addData(urlJugar);
    qr.make();
    $('#qr').innerHTML = qr.createSvgTag({ scalable: true, margin: 0 });
  } else {
    $('#qr').classList.add('oculto');
  }
  mostrar('#lobby');
});

// ---------- Lobby ----------
const PALETA_AVATAR = ['#e94f57', '#3f7ef7', '#f2a71b', '#26bd7e', '#a86ef0', '#ff7aa8', '#3fc4d6', '#ff8c4d', '#7fd44d', '#6b83ff'];
function colorAvatar(nombre) {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA_AVATAR[h % PALETA_AVATAR.length];
}
function iniciales(nombre) {
  return nombre.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

socket.on('sala:lobby', ({ jugadores }) => {
  if (jugadores.length > jugadoresPrevios) Sonidos.unirse();
  jugadoresPrevios = jugadores.length;
  $('#cuenta-jugadores').textContent = jugadores.length;
  $('#lista-jugadores').innerHTML = jugadores
    .map(j => `<span class="ficha-jugador" style="${j.conectado ? '' : 'opacity:.4'}">
        <span class="avatar" style="background:${colorAvatar(j.nombre)}">${escapar(iniciales(j.nombre))}</span>
        ${escapar(j.nombre)}</span>`)
    .join('');
  $('#btn-comenzar').disabled = jugadores.length === 0;
});

socket.on('sala:reabierta', () => mostrar('#lobby'));

$('#btn-comenzar').addEventListener('click', () => { Sonidos.activar(); socket.emit('host:comenzar'); });
$('#btn-otra').addEventListener('click', () => socket.emit('host:otra'));

// ---------- Cuenta regresiva ----------
socket.on('partida:comenzo', ({ relojInicial, pedidos, donacion }) => {
  mostrar('#cuenta');
  $('#pedidos-vivo').innerHTML = '';
  $('#regla-reloj').innerHTML =
    `Cada uno arranca con <b>${Math.round(relojInicial / 1000)} segundos</b> de vida. Acertar suma tiempo.<br>` +
    `Quien esté en apuros puede pedir <b>${donacion} segundos</b> a un compañero (${pedidos} veces por partida).<br>` +
    `Gana el último en pie.`;
  let n = 3;
  const num = $('#cuenta .numero');
  const animar = () => {
    num.textContent = n;
    num.classList.remove('salto');
    void num.offsetWidth; // reinicia la animación
    num.classList.add('salto');
  };
  animar();
  Sonidos.cuentaTic();
  const intervalo = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(intervalo); Sonidos.cuentaYa(); return; }
    Sonidos.cuentaTic();
    animar();
  }, 1000);
});

// ---------- Pregunta ----------
const NOMBRES_TIPO = {
  hecho_o_no: 'Detector · ¿hecho u otra cosa?',
  sector: 'Radar sectorial',
  escala: 'Ojo de águila · escala',
  concepto: 'Escuela de actores',
};

socket.on('pregunta:nueva', p => {
  mostrar('#juego');
  Sonidos.pregunta();
  $('#chip-nivel').textContent = `Nivel ${p.nivel} · ${p.nombreNivel}`;
  $('#chip-nivel').className = `chip nivel-${Math.min(p.nivel, 3)}`;
  $('#progreso').textContent = `Pregunta ${p.indice + 1} · +${p.gana}s por acierto` +
    (p.impuesto ? ` · −${p.impuesto}s de cierre` : '');
  $('#progreso').classList.remove('oculto');

  $('#tipo-pregunta').textContent = NOMBRES_TIPO[p.tipo] || p.tipo;
  $('#texto-pregunta').textContent = p.texto;
  $('#contexto').textContent = p.contexto || '';
  $('#contexto').classList.toggle('oculto', !p.contexto);
  $('#explicacion').classList.add('oculto');
  $('#bajas').classList.add('oculto');
  $('#pedidos-vivo').innerHTML = '';

  $('#grilla-opciones').innerHTML = p.opciones.map((op, i) =>
    `<div class="opcion op-${i}" data-i="${i}"><span class="forma">${FORMAS[i]}</span><span>${escapar(op)}</span></div>`
  ).join('');

  $('#respondieron').textContent = `0/${p.vivos} respondieron`;

  // barra de la ventana de respuesta
  const barra = $('#barra');
  const relleno = barra.firstElementChild;
  barra.classList.toggle('urgente', p.nivel >= 3);
  relleno.style.transition = 'none';
  relleno.style.transform = 'scaleX(1)';
  clearTimeout(timerBarra);
  timerBarra = setTimeout(() => {
    relleno.style.transition = `transform ${p.ventana}s linear`;
    relleno.style.transform = 'scaleX(0)';
  }, 60);

  // tictac en los últimos 4 segundos de la ventana
  clearTimeout(tictacTimer);
  tictacTimer = setTimeout(() => {
    if (!preguntaAbierta) return;
    let quedan = 4;
    const tic = setInterval(() => {
      if (!preguntaAbierta || --quedan < 0) { clearInterval(tic); return; }
      Sonidos.tictac();
    }, 1000);
  }, Math.max(0, (p.ventana - 4) * 1000));

  // relojes vitales corriendo en vivo
  relojes = p.relojes;
  inicioPregunta = Date.now();
  graciaMs = (p.gracia || 0) * 1000;
  ventanaMs = p.ventana * 1000;
  preguntaAbierta = true;
  clearInterval(drenaje);
  pintarRelojes();
  drenaje = setInterval(pintarRelojes, 200);
});

function pintarRelojes() {
  const transcurrido = preguntaAbierta
    ? Math.max(0, Math.min(Date.now() - inicioPregunta - graciaMs, ventanaMs - graciaMs))
    : 0;
  $('#podio-vivo').innerHTML = relojes.map((j, i) => {
    if (!j.vivo) {
      return `<div class="fila-podio muerto">
        <span class="pos">☠</span>
        <span class="nombre-j">${escapar(j.nombre)}</span>
        <span class="pts tele">P${j.preguntaMuerte}</span>
      </div>`;
    }
    const resta = Math.max(0, j.restante - transcurrido);
    const pct = Math.min(100, (resta / RELOJ_MAX_VISUAL) * 100);
    const critico = resta < 8000;
    return `<div class="fila-podio ${i === 0 ? 'p1' : ''} ${critico ? 'critico' : ''}">
      <span class="pos">${i + 1}</span>
      <span class="nombre-j">${escapar(j.nombre)}${j.racha >= 3 ? ' 🔥' : ''}</span>
      <span class="pts tele">${resta === 0 ? 'AL LÍMITE' : fmt(resta)}</span>
      <div class="reloj-vital"><div style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

socket.on('pregunta:respondio', ({ respondieron, total }) => {
  $('#respondieron').textContent = `${respondieron}/${total} respondieron`;
});

// ---------- Pedidos de tiempo ----------
socket.on('tiempo:pedido', ({ nombre, segundos }) => {
  Sonidos.pedido();
  const aviso = document.createElement('div');
  aviso.className = 'aviso-pedido';
  aviso.dataset.de = nombre;
  aviso.innerHTML = `<span class="mano">🙋</span><span><b>${escapar(nombre)}</b> pide ${segundos} segundos</span>`;
  $('#pedidos-vivo').appendChild(aviso);
});

socket.on('tiempo:donado', ({ de, para, segundos, relojes: tablaNueva }) => {
  Sonidos.donacion();
  quitarAviso(para);
  const aviso = document.createElement('div');
  aviso.className = 'aviso-pedido';
  aviso.innerHTML = `<span class="mano">🤝</span><span><b>${escapar(de)}</b> le dio ${segundos}s a <b>${escapar(para)}</b></span>`;
  $('#pedidos-vivo').appendChild(aviso);
  setTimeout(() => aviso.remove(), 5000);
  relojes = tablaNueva;
  pintarRelojes();
});

socket.on('tiempo:vencido', ({ nombre }) => quitarAviso(nombre));

function quitarAviso(nombre) {
  for (const el of document.querySelectorAll('#pedidos-vivo .aviso-pedido')) {
    if (el.dataset.de === nombre) el.remove();
  }
}

// ---------- Resultado ----------
socket.on('pregunta:resultado', r => {
  preguntaAbierta = false;
  clearTimeout(timerBarra);
  clearInterval(drenaje);
  const relleno = $('#barra').firstElementChild;
  relleno.style.transition = 'none';
  relleno.style.transform = 'scaleX(0)';

  for (const el of document.querySelectorAll('#grilla-opciones .opcion')) {
    const i = Number(el.dataset.i);
    el.classList.toggle('correcta', i === r.correcta);
    el.classList.toggle('apagada', i !== r.correcta);
  }
  $('#explicacion').textContent = r.explicacion;
  $('#explicacion').classList.remove('oculto');

  if (r.bajas.length > 0) {
    Sonidos.muerte();
    $('#bajas').textContent = `☠ ${r.bajas.join(', ')} — fuera de juego`;
    $('#bajas').classList.remove('oculto');
    // flash a pantalla completa
    $('#quien-cayo').textContent = r.bajas.join(' · ');
    const flash = $('#flash-baja');
    flash.classList.add('activo');
    setTimeout(() => flash.classList.remove('activo'), 2100);
  } else if (r.detalle.some(d => d.acerto)) {
    Sonidos.ganoTiempo();
  }

  relojes = r.tabla;
  pintarRelojes();
});

// ---------- Final ----------
// ---------- Repaso ----------
const NOMBRES_TIPO_CORTO = {
  hecho_o_no: 'Detector', sector: 'Sector', escala: 'Escala', concepto: 'Actores',
};
$('#btn-repaso').addEventListener('click', () => { Confeti.limpiar(); mostrar('#repaso'); });
$('#btn-volver-podio').addEventListener('click', () => mostrar('#fin'));

function pintarRepaso(repaso) {
  $('#lista-repaso').innerHTML = repaso.map(p => `
    <div class="repaso-item">
      <div class="cabecera">
        <span class="numero">${p.n.toString().padStart(2, '0')}</span>
        <span class="etiqueta">${NOMBRES_TIPO_CORTO[p.tipo] || p.tipo}</span>
      </div>
      <span class="consigna">${escapar(p.texto)}</span>
      ${p.contexto ? `<div class="cita">${escapar(p.contexto)}</div>` : ''}
      <div class="respuesta">
        <span class="marca-ok">✓ ${escapar(p.opciones[p.correcta])}</span>
      </div>
      <div class="porque">${escapar(p.explicacion)}</div>
    </div>`).join('');
}

socket.on('partida:fin', ({ tabla, resultados, insignias, preguntasJugadas, repaso }) => {
  if (repaso) pintarRepaso(repaso);
  preguntaAbierta = false;
  clearInterval(drenaje);
  mostrar('#fin');
  Sonidos.victoria();
  Confeti.lanzar(180);
  setTimeout(() => Confeti.lanzar(120), 900);
  $('#chip-nivel').classList.add('oculto');
  $('#progreso').classList.add('oculto');
  $('#sub-fin').textContent = `${preguntasJugadas} preguntas · ${tabla.length} periodistas`;

  const clases = ['oro', 'plata', 'bronce'];
  const medallas = ['🥇', '🥈', '🥉'];
  const orden = [tabla[1], tabla[0], tabla[2]].filter(Boolean);
  $('#escenario').innerHTML = orden.map(j => {
    const idx = j.posicion - 1;
    const detalle = j.vivo
      ? `sobrevivió con ${fmt(j.restante)}`
      : `cayó en la pregunta ${j.preguntaMuerte}`;
    return `<div class="columna-podio ${clases[idx]}">
      <span class="quien">${escapar(j.nombre)}</span>
      <span class="cuanto tele">${detalle}</span>
      <div class="bloque">${medallas[idx]}</div>
    </div>`;
  }).join('');

  $('#resto-tabla').innerHTML = tabla.slice(3).map(j =>
    `<div class="fila-podio ${j.vivo ? '' : 'muerto'}">
       <span class="pos">${j.posicion}</span>
       <span class="nombre-j">${escapar(j.nombre)}</span>
       <span class="pts tele">${j.vivo ? fmt(j.restante) : '☠ P' + j.preguntaMuerte}</span>
     </div>`
  ).join('');

  const conNuevas = resultados.filter(r => r.nuevasInsignias.length > 0);
  $('#insignias-fin').innerHTML = conNuevas.length === 0 ? '' :
    `<span class="etiqueta centrado">Insignias ganadas</span>` +
    conNuevas.map(r =>
      `<div class="jugador-insignias">
         <span class="quien">${escapar(r.nombre)}</span>
         ${r.nuevasInsignias.map((id, i) => {
           const ins = insignias[id];
           return `<span class="insignia nueva" style="animation-delay:${0.3 + i * 0.15}s">
                     <span class="emoji">${ins.emoji}</span>${ins.nombre}</span>`;
         }).join('')}
       </div>`
    ).join('');
});

socket.on('sala:cerrada', () => location.reload());

function escapar(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
