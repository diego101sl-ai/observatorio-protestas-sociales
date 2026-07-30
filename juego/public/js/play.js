'use strict';
/* Pantalla del jugador (celular) */
const socket = io();
const $ = sel => document.querySelector(sel);
const pantallas = ['#entrar', '#espera', '#pregunta', '#estado', '#fin'];
function mostrar(sel) {
  for (const p of pantallas) $(p).classList.toggle('oculto', p !== sel);
}

const FORMAS = ['▲', '■', '●', '◆'];
let miNombre = null;
let miUltimaOpcion = null;
let misPuntos = 0;
let timerBarra = null;

// prellenar código si vino por QR (?sala=1234)
const params = new URLSearchParams(location.search);
if (params.get('sala')) $('#codigo').value = params.get('sala');

$('#form-entrar').addEventListener('submit', e => {
  e.preventDefault();
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
    if (!resp.reconectado) mostrar('#espera');
  });
});

// reconexión automática si se recarga la página en medio de la partida
window.addEventListener('load', () => {
  const nombre = sessionStorage.getItem('cde-nombre');
  const sala = sessionStorage.getItem('cde-sala');
  if (nombre && sala && !miNombre) {
    $('#codigo').value = sala;
    $('#nombre').value = nombre;
  }
});

const EMOJIS = {
  detector_opiniones: '🔍', radar_sectorial: '🧭', ojo_de_aguila: '🦅',
  cazador_actores: '🎯', rayo: '⚡', campeon: '🏆', racha: '🔥',
  pluma_perfecta: '🖋️', maraton: '📚', veterano: '🗞️',
};

socket.on('partida:comenzo', () => {
  misPuntos = 0;
  $('#chip-puntos').textContent = '0 pts';
  $('#chip-puntos').classList.remove('oculto');
  $('#estado-emoji').textContent = '🗞️';
  $('#estado-titulo').textContent = '¡Arranca la edición!';
  $('#estado-puntos').textContent = '';
  $('#estado-posicion').textContent = '';
  mostrar('#estado');
});

socket.on('pregunta:nueva', p => {
  miUltimaOpcion = null;
  $('#texto-preg').textContent = p.texto;
  $('#contexto-preg').textContent = p.contexto || '';
  $('#opciones').innerHTML = p.opciones.map((op, i) =>
    `<button class="opcion op-${i}" data-i="${i}"><span class="forma">${FORMAS[i]}</span><span>${escapar(op)}</span></button>`
  ).join('');
  for (const btn of document.querySelectorAll('#opciones .opcion')) {
    btn.addEventListener('click', () => responder(Number(btn.dataset.i)));
  }
  const relleno = $('#barra-j').firstElementChild;
  relleno.style.transition = 'none';
  relleno.style.transform = 'scaleX(1)';
  clearTimeout(timerBarra);
  timerBarra = setTimeout(() => {
    relleno.style.transition = `transform ${p.duracion}s linear`;
    relleno.style.transform = 'scaleX(0)';
  }, 60);
  $('#barra-j').classList.toggle('urgente', p.nivel === 3);
  mostrar('#pregunta');
});

function responder(opcion) {
  if (miUltimaOpcion !== null) return;
  miUltimaOpcion = opcion;
  socket.emit('jugador:respuesta', { opcion });
  $('#estado-emoji').textContent = '📨';
  $('#estado-titulo').textContent = 'Enviado a la mesa de edición';
  $('#estado-puntos').textContent = '';
  $('#estado-posicion').textContent = 'Esperando al resto…';
  mostrar('#estado');
}

socket.on('pregunta:resultado', r => {
  const mio = r.detalle.find(d => d.nombre === miNombre);
  if (!mio) return;
  misPuntos = mio.puntos;
  $('#chip-puntos').textContent = `${misPuntos.toLocaleString('es-AR')} pts`;

  const pos = r.podio.find(p => p.nombre === miNombre);
  if (!mio.respondio) {
    $('#estado-emoji').textContent = '⏰';
    $('#estado-titulo').textContent = 'Se te fue el tiempo';
    $('#estado-puntos').textContent = '+0';
  } else if (mio.acerto) {
    $('#estado-emoji').textContent = mio.racha >= 3 ? '🔥' : '✅';
    $('#estado-titulo').textContent = mio.racha >= 3 ? `¡Correcta! Racha ×${mio.racha}` : '¡Correcta!';
    $('#estado-puntos').textContent = `+${mio.ganados.toLocaleString('es-AR')}`;
  } else {
    $('#estado-emoji').textContent = '❌';
    $('#estado-titulo').textContent = 'No era esa';
    $('#estado-puntos').textContent = '+0';
  }
  $('#estado-posicion').textContent = pos ? `Vas ${pos.posicion}º de ${r.podio.length} · mirá la pantalla central` : '';
  mostrar('#estado');
});

socket.on('partida:fin', ({ podio, resultados, insignias }) => {
  const mio = resultados.find(r => r.nombre === miNombre);
  if (!mio) return;
  const medallas = { 1: '🥇', 2: '🥈', 3: '🥉' };
  $('#fin-medalla').textContent = medallas[mio.posicion] || '📰';
  $('#fin-titulo').textContent = mio.posicion === 1 ? '¡Ganaste la edición!' : `${mio.posicion}º puesto`;
  $('#fin-resumen').innerHTML =
    `${mio.puntos.toLocaleString('es-AR')} puntos · ${mio.aciertos}/${mio.totalPreguntas} correctas<br>` +
    resumenHabilidades(mio.stats);
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
  // el capacitador lanzó otra partida con la misma sala
  if (miNombre) mostrar('#espera');
});

socket.on('sala:cerrada', () => {
  mostrar('#entrar');
  $('#error').textContent = 'La sala se cerró. Pedí un código nuevo.';
});

function escapar(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
