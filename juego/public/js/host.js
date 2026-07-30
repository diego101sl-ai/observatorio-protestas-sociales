'use strict';
/* Pantalla central (proyector) */
const socket = io();

const $ = sel => document.querySelector(sel);
const pantallas = ['#inicio', '#lobby', '#cuenta', '#juego', '#fin'];
function mostrar(sel) {
  for (const p of pantallas) $(p).classList.toggle('oculto', p !== sel);
}

const FORMAS = ['▲', '■', '●', '◆'];
let totalPreguntas = 15;
let timerBarra = null;

// ---------- Crear sala ----------
$('#btn-crear').addEventListener('click', () => socket.emit('host:crear'));

socket.on('sala:creada', ({ codigo, urls }) => {
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
socket.on('sala:lobby', ({ jugadores }) => {
  $('#cuenta-jugadores').textContent = jugadores.length;
  $('#lista-jugadores').innerHTML = jugadores
    .map(j => `<span class="ficha-jugador" style="${j.conectado ? '' : 'opacity:.4'}">${escapar(j.nombre)}</span>`)
    .join('');
  $('#btn-comenzar').disabled = jugadores.length === 0;
});

socket.on('sala:reabierta', () => mostrar('#lobby'));

$('#btn-comenzar').addEventListener('click', () => socket.emit('host:comenzar'));
$('#btn-otra').addEventListener('click', () => socket.emit('host:otra'));

// ---------- Cuenta regresiva ----------
socket.on('partida:comenzo', ({ total }) => {
  totalPreguntas = total;
  mostrar('#cuenta');
  let n = 3;
  $('#cuenta div').textContent = n;
  const intervalo = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(intervalo); return; }
    $('#cuenta div').textContent = n;
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
  $('#chip-nivel').textContent = `Nivel ${p.nivel} · ${p.nombreNivel}`;
  $('#chip-nivel').className = `chip nivel-${p.nivel}`;
  $('#progreso').textContent = `${p.indice + 1} / ${p.total}`;
  $('#progreso').classList.remove('oculto');

  $('#tipo-pregunta').textContent = NOMBRES_TIPO[p.tipo] || p.tipo;
  $('#texto-pregunta').textContent = p.texto;
  $('#contexto').textContent = p.contexto || '';
  $('#contexto').classList.toggle('oculto', !p.contexto);
  $('#explicacion').classList.add('oculto');

  $('#grilla-opciones').innerHTML = p.opciones.map((op, i) =>
    `<div class="opcion op-${i}" data-i="${i}"><span class="forma">${FORMAS[i]}</span><span>${escapar(op)}</span></div>`
  ).join('');

  $('#respondieron').textContent = `0/${p.jugadores} respondieron`;

  // barra de tiempo
  const barra = $('#barra');
  const relleno = barra.firstElementChild;
  barra.classList.toggle('urgente', p.nivel === 3);
  relleno.style.transition = 'none';
  relleno.style.transform = 'scaleX(1)';
  clearTimeout(timerBarra);
  timerBarra = setTimeout(() => {
    relleno.style.transition = `transform ${p.duracion}s linear`;
    relleno.style.transform = 'scaleX(0)';
  }, 60);
});

socket.on('pregunta:respondio', ({ respondieron, total }) => {
  $('#respondieron').textContent = `${respondieron}/${total} respondieron`;
});

// ---------- Resultado ----------
socket.on('pregunta:resultado', r => {
  clearTimeout(timerBarra);
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

  pintarPodio(r.podio);
});

function pintarPodio(podio) {
  $('#podio-vivo').innerHTML = podio.slice(0, 10).map((j, i) =>
    `<div class="fila-podio p${j.posicion}" style="animation-delay:${i * 0.05}s">
       <span class="pos">${j.posicion}</span>
       <span class="nombre-j">${escapar(j.nombre)}${j.racha >= 3 ? ' 🔥' : ''}</span>
       <span class="pts">${j.puntos.toLocaleString('es-AR')}</span>
     </div>`
  ).join('');
}

// ---------- Final ----------
socket.on('partida:fin', ({ podio, resultados, insignias }) => {
  mostrar('#fin');
  $('#chip-nivel').classList.add('oculto');
  $('#progreso').classList.add('oculto');

  const clases = ['oro', 'plata', 'bronce'];
  const medallas = ['🥇', '🥈', '🥉'];
  // orden visual: 2° - 1° - 3°
  const orden = [podio[1], podio[0], podio[2]].filter(Boolean);
  $('#escenario').innerHTML = orden.map(j => {
    const idx = j.posicion - 1;
    return `<div class="columna-podio ${clases[idx]}">
      <span class="quien">${escapar(j.nombre)}</span>
      <span class="cuanto tele">${j.puntos.toLocaleString('es-AR')} pts</span>
      <div class="bloque">${medallas[idx]}</div>
    </div>`;
  }).join('');

  $('#resto-tabla').innerHTML = podio.slice(3).map(j =>
    `<div class="fila-podio">
       <span class="pos">${j.posicion}</span>
       <span class="nombre-j">${escapar(j.nombre)}</span>
       <span class="pts">${j.puntos.toLocaleString('es-AR')}</span>
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
