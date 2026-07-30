'use strict';
/**
 * CIERRE DE EDICIÓN — servidor del juego
 * Multijugador estilo Kahoot: pantalla central (host) + jugadores desde el celular.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PUERTO = process.env.PORT || 3000;

// ---------- Datos ----------
const HECHOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'hechos.json'), 'utf8'));
const SENUELOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'senuelos.json'), 'utf8'));
const CONCEPTOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'conceptos.json'), 'utf8'));

const SECTORES = ['AGENDA POLÍTICA', 'FINANZAS', 'TRABAJADORES', 'ENERGÍA', 'AGRO', 'INDUSTRIA'];
const ESCALAS = ['Internacional', 'Latinoamericana', 'Nacional', 'Provincial'];

// ---------- Perfiles persistentes ----------
const RUTA_PERFILES = path.join(__dirname, 'data', 'perfiles.json');
let perfiles = {};
try { perfiles = JSON.parse(fs.readFileSync(RUTA_PERFILES, 'utf8')); } catch (e) { perfiles = {}; }

function guardarPerfiles() {
  fs.writeFileSync(RUTA_PERFILES, JSON.stringify(perfiles, null, 1), 'utf8');
}

function claveJugador(nombre) {
  return nombre.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function obtenerPerfil(nombre) {
  const clave = claveJugador(nombre);
  if (!perfiles[clave]) {
    perfiles[clave] = {
      nombre: nombre.trim(),
      creado: new Date().toISOString().slice(0, 10),
      partidas: 0, victorias: 0, podios: 0,
      puntosTotales: 0, mejorPuntaje: 0,
      insignias: {},
      habilidades: {
        hecho: { ok: 0, total: 0 },
        sector: { ok: 0, total: 0 },
        escala: { ok: 0, total: 0 },
        actor: { ok: 0, total: 0 },
      },
      historial: [],
    };
  }
  return perfiles[clave];
}

// ---------- Insignias ----------
const INSIGNIAS = {
  detector_opiniones: { emoji: '🔍', nombre: 'Detector de Opiniones', desc: 'Gran puntería para separar hechos de opiniones' },
  radar_sectorial:    { emoji: '🧭', nombre: 'Radar Sectorial', desc: 'Clasifica sectores casi sin errar' },
  ojo_de_aguila:      { emoji: '🦅', nombre: 'Ojo de Águila', desc: 'Identifica la escala de un vistazo' },
  cazador_actores:    { emoji: '🎯', nombre: 'Cazador de Actores', desc: 'Distingue actores de individuos como nadie' },
  rayo:               { emoji: '⚡', nombre: 'Rayo', desc: 'Respuestas correctas más veloces de la partida' },
  campeon:            { emoji: '🏆', nombre: 'Campeón de Edición', desc: 'Primer puesto de la partida' },
  racha:              { emoji: '🔥', nombre: 'En Racha', desc: '5 respuestas correctas seguidas' },
  pluma_perfecta:     { emoji: '🖋️', nombre: 'Pluma Perfecta', desc: 'Partida sin un solo error' },
  maraton:            { emoji: '📚', nombre: 'Maratonista', desc: '5 partidas jugadas' },
  veterano:           { emoji: '🗞️', nombre: 'Veterano de Redacción', desc: '15 partidas jugadas' },
};

// ---------- Utilidades ----------
function alAzar(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function mezclar(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function tomar(arr, n) { return mezclar(arr).slice(0, n); }

// ---------- Generación de preguntas ----------
// Estructura de pregunta:
// { tipo, habilidad, texto, contexto, opciones: [str], correcta: idx, explicacion, fuente }

const OPCIONES_HECHO = ['Es un hecho completo', 'Le falta el actor', 'Le falta tiempo / lugar', 'Es una opinión'];
const DEFECTO_A_OPCION = { falta_actor: 1, falta_tiempo: 2, opinion: 3 };

function preguntaHechoReal() {
  const h = alAzar(HECHOS.filter(x => x.actores.length > 0 && x.resumen.length > 80));
  return {
    tipo: 'hecho_o_no', habilidad: 'hecho',
    texto: '¿Esto es un hecho bien registrado?',
    contexto: h.resumen,
    opciones: OPCIONES_HECHO, correcta: 0,
    explicacion: `Es un hecho completo: tiene actor identificado (${h.actores.slice(0, 2).join(', ')}${h.actores.length > 2 ? '…' : ''}), está ubicado en tiempo y espacio, y tiene fuente (${h.medio}, ${h.fecha}).`,
    fuente: h.medio,
  };
}

function preguntaSenuelo(senuelo) {
  return {
    tipo: 'hecho_o_no', habilidad: 'hecho',
    texto: '¿Esto es un hecho bien registrado?',
    contexto: senuelo.texto,
    opciones: OPCIONES_HECHO, correcta: DEFECTO_A_OPCION[senuelo.defecto],
    explicacion: senuelo.explicacion,
    fuente: null,
  };
}

function preguntaSector(h) {
  const distractores = tomar(SECTORES.filter(s => s !== h.sector), 3);
  const opciones = mezclar([h.sector, ...distractores]);
  return {
    tipo: 'sector', habilidad: 'sector',
    texto: '¿A qué SECTOR pertenece este hecho?',
    contexto: h.titulo,
    opciones, correcta: opciones.indexOf(h.sector),
    explicacion: `Sector ${h.sector}. Actores del hecho: ${h.actores.slice(0, 3).join('; ') || 's/d'}. (${h.medio}, ${h.fecha})`,
    fuente: h.medio,
  };
}

function preguntaEscala(h) {
  const opciones = mezclar(ESCALAS.slice());
  return {
    tipo: 'escala', habilidad: 'escala',
    texto: '¿Cuál es la ESCALA de este hecho?',
    contexto: h.titulo,
    opciones, correcta: opciones.indexOf(h.escala),
    explicacion: `Escala ${h.escala}. (${h.medio}, ${h.fecha})`,
    fuente: h.medio,
  };
}

function preguntaConcepto(c) {
  const barajadas = mezclar(c.opciones);
  return {
    tipo: 'concepto', habilidad: 'actor',
    texto: c.pregunta,
    contexto: null,
    opciones: barajadas.map(o => o.texto),
    correcta: barajadas.findIndex(o => o.correcta),
    explicacion: c.explicacion,
    fuente: 'Material de capacitación',
  };
}

function generarPartida() {
  const preguntas = [];

  // 4 × hecho o no: 3 señuelos (uno de cada defecto) + 1 hecho real
  const porDefecto = d => SENUELOS.filter(s => s.defecto === d);
  preguntas.push(preguntaSenuelo(alAzar(porDefecto('falta_actor'))));
  preguntas.push(preguntaSenuelo(alAzar(porDefecto('falta_tiempo'))));
  preguntas.push(preguntaSenuelo(alAzar(porDefecto('opinion'))));
  preguntas.push(preguntaHechoReal());

  // 4 × sector: hechos de sectores variados (evita que salga siempre Agenda Política)
  for (const sector of tomar(SECTORES, 4)) {
    const candidatos = HECHOS.filter(h => h.sector === sector);
    preguntas.push(preguntaSector(alAzar(candidatos)));
  }

  // 4 × escala: una de cada escala
  for (const escala of mezclar(ESCALAS.slice())) {
    const candidatos = HECHOS.filter(h => h.escala === escala);
    preguntas.push(preguntaEscala(alAzar(candidatos)));
  }

  // 3 × concepto de actor
  for (const c of tomar(CONCEPTOS, 3)) preguntas.push(preguntaConcepto(c));

  return mezclar(preguntas);
}

// Nivel y tiempos: la hora de cierre aprieta
function nivelDePregunta(indice) {
  if (indice < 5) return { nivel: 1, nombre: 'REDACTOR', duracion: 18 };
  if (indice < 10) return { nivel: 2, nombre: 'EDITOR', duracion: 14 };
  return { nivel: 3, nombre: 'CIERRE DE EDICIÓN', duracion: 10 };
}
const PAUSA_RESULTADO = 6000; // ms mostrando la respuesta correcta y explicación
const MAX_JUGADORES = 10;

// ---------- Servidor web ----------
const app = express();
const servidor = http.createServer(app);
const io = new Server(servidor);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/host', (_, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play', (_, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
app.get('/perfiles', (_, res) => res.sendFile(path.join(__dirname, 'public', 'perfiles.html')));

app.get('/api/perfiles', (_, res) => {
  res.json({ insignias: INSIGNIAS, perfiles });
});

app.get('/api/perfiles.csv', (_, res) => {
  const filas = [['nombre', 'partidas', 'victorias', 'podios', 'puntos_totales', 'mejor_puntaje',
    'hecho_ok', 'hecho_total', 'sector_ok', 'sector_total', 'escala_ok', 'escala_total', 'actor_ok', 'actor_total', 'insignias']];
  for (const p of Object.values(perfiles)) {
    const h = p.habilidades;
    filas.push([p.nombre, p.partidas, p.victorias, p.podios, p.puntosTotales, p.mejorPuntaje,
      h.hecho.ok, h.hecho.total, h.sector.ok, h.sector.total, h.escala.ok, h.escala.total, h.actor.ok, h.actor.total,
      Object.keys(p.insignias).join(' | ')]);
  }
  const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="perfiles-cierre-de-edicion.csv"');
  res.send('﻿' + csv);
});

// ---------- Salas ----------
const salas = new Map(); // codigo -> sala

function nuevoCodigo() {
  let codigo;
  do {
    codigo = String(Math.floor(1000 + Math.random() * 9000));
  } while (salas.has(codigo));
  return codigo;
}

function estadoLobby(sala) {
  return {
    codigo: sala.codigo,
    jugadores: [...sala.jugadores.values()].map(j => ({ nombre: j.nombre, conectado: j.conectado })),
    max: MAX_JUGADORES,
  };
}

function podio(sala) {
  return [...sala.jugadores.values()]
    .map(j => ({ nombre: j.nombre, puntos: j.puntos, racha: j.racha }))
    .sort((a, b) => b.puntos - a.puntos)
    .map((j, i) => ({ ...j, posicion: i + 1 }));
}

function crearSala(hostSocket) {
  const sala = {
    codigo: nuevoCodigo(),
    hostId: hostSocket.id,
    jugadores: new Map(), // clave -> jugador
    estado: 'lobby',
    preguntas: [],
    indice: -1,
    abierta: null, // { inicio, duracion, respuestas: Map(clave -> {opcion, ms}) }
    timer: null,
  };
  salas.set(sala.codigo, sala);
  hostSocket.join('sala-' + sala.codigo);
  hostSocket.data.codigoHost = sala.codigo;
  return sala;
}

function emitirA(sala, evento, datos) {
  io.to('sala-' + sala.codigo).emit(evento, datos);
}

function comenzarPartida(sala) {
  if (sala.estado !== 'lobby' || sala.jugadores.size === 0) return;
  sala.estado = 'jugando';
  sala.preguntas = generarPartida();
  sala.indice = -1;
  for (const j of sala.jugadores.values()) {
    j.puntos = 0; j.racha = 0; j.mejorRacha = 0;
    j.stats = { hecho: { ok: 0, total: 0 }, sector: { ok: 0, total: 0 }, escala: { ok: 0, total: 0 }, actor: { ok: 0, total: 0 } };
    j.tiempos = [];
  }
  emitirA(sala, 'partida:comenzo', { total: sala.preguntas.length });
  setTimeout(() => siguientePregunta(sala), 3200); // cuenta regresiva en pantalla
}

function siguientePregunta(sala) {
  if (sala.estado !== 'jugando') return;
  sala.indice++;
  if (sala.indice >= sala.preguntas.length) return terminarPartida(sala);

  const p = sala.preguntas[sala.indice];
  const info = nivelDePregunta(sala.indice);
  sala.abierta = { inicio: Date.now(), duracion: info.duracion * 1000, respuestas: new Map() };

  emitirA(sala, 'pregunta:nueva', {
    indice: sala.indice, total: sala.preguntas.length,
    nivel: info.nivel, nombreNivel: info.nombre, duracion: info.duracion,
    tipo: p.tipo, texto: p.texto, contexto: p.contexto,
    opciones: p.opciones, fuente: p.fuente,
    jugadores: sala.jugadores.size,
  });

  sala.timer = setTimeout(() => cerrarPregunta(sala), sala.abierta.duracion + 400);
}

function registrarRespuesta(sala, clave, opcion) {
  if (sala.estado !== 'jugando' || !sala.abierta) return;
  if (sala.abierta.respuestas.has(clave)) return;
  const ms = Date.now() - sala.abierta.inicio;
  if (ms > sala.abierta.duracion + 300) return;
  sala.abierta.respuestas.set(clave, { opcion, ms });

  emitirA(sala, 'pregunta:respondio', {
    respondieron: sala.abierta.respuestas.size,
    total: [...sala.jugadores.values()].filter(j => j.conectado).length,
  });

  // si todos los conectados respondieron, cerrar antes
  const conectados = [...sala.jugadores.values()].filter(j => j.conectado).length;
  if (sala.abierta.respuestas.size >= conectados && conectados > 0) {
    clearTimeout(sala.timer);
    setTimeout(() => cerrarPregunta(sala), 500);
  }
}

function cerrarPregunta(sala) {
  if (sala.estado !== 'jugando' || !sala.abierta) return;
  const p = sala.preguntas[sala.indice];
  const abierta = sala.abierta;
  sala.abierta = null;
  clearTimeout(sala.timer);

  const detalle = [];
  for (const [clave, j] of sala.jugadores) {
    const r = abierta.respuestas.get(clave);
    const acerto = r && r.opcion === p.correcta;
    let ganados = 0;
    if (acerto) {
      const restante = Math.max(0, 1 - r.ms / abierta.duracion);
      ganados = 500 + Math.round(500 * restante);
      j.racha++;
      j.mejorRacha = Math.max(j.mejorRacha, j.racha);
      j.tiempos.push(r.ms);
    } else {
      j.racha = 0;
    }
    j.puntos += ganados;
    j.stats[p.habilidad].total++;
    if (acerto) j.stats[p.habilidad].ok++;
    detalle.push({
      nombre: j.nombre, respondio: !!r, acerto: !!acerto,
      opcion: r ? r.opcion : null, ganados, puntos: j.puntos, racha: j.racha,
    });
  }

  emitirA(sala, 'pregunta:resultado', {
    indice: sala.indice, total: sala.preguntas.length,
    correcta: p.correcta, explicacion: p.explicacion,
    detalle, podio: podio(sala),
  });

  setTimeout(() => siguientePregunta(sala), PAUSA_RESULTADO);
}

function terminarPartida(sala) {
  sala.estado = 'fin';
  const tabla = podio(sala);
  const resultados = [];

  // ⚡ Rayo: mejor promedio de respuesta correcta (mínimo 5 correctas)
  let rayo = null, mejorProm = Infinity;
  for (const j of sala.jugadores.values()) {
    if (j.tiempos.length >= 5) {
      const prom = j.tiempos.reduce((a, b) => a + b, 0) / j.tiempos.length;
      if (prom < mejorProm) { mejorProm = prom; rayo = j.nombre; }
    }
  }

  for (const j of sala.jugadores.values()) {
    const perfil = obtenerPerfil(j.nombre);
    const pos = tabla.find(t => t.nombre === j.nombre).posicion;
    const nuevas = [];

    const otorgar = id => {
      if (!perfil.insignias[id]) { perfil.insignias[id] = { veces: 0, primera: new Date().toISOString().slice(0, 10) }; }
      perfil.insignias[id].veces++;
      nuevas.push(id);
    };

    const s = j.stats;
    if (s.hecho.total >= 3 && s.hecho.ok / s.hecho.total >= 0.75) otorgar('detector_opiniones');
    if (s.sector.total >= 3 && s.sector.ok / s.sector.total >= 0.75) otorgar('radar_sectorial');
    if (s.escala.total >= 3 && s.escala.ok / s.escala.total >= 0.75) otorgar('ojo_de_aguila');
    if (s.actor.total >= 2 && s.actor.ok === s.actor.total) otorgar('cazador_actores');
    if (rayo === j.nombre) otorgar('rayo');
    if (pos === 1 && sala.jugadores.size >= 2) otorgar('campeon');
    if (j.mejorRacha >= 5) otorgar('racha');
    const totalOk = s.hecho.ok + s.sector.ok + s.escala.ok + s.actor.ok;
    const totalPreg = s.hecho.total + s.sector.total + s.escala.total + s.actor.total;
    if (totalPreg > 0 && totalOk === totalPreg) otorgar('pluma_perfecta');

    // actualizar perfil persistente
    perfil.partidas++;
    if (pos === 1 && sala.jugadores.size >= 2) perfil.victorias++;
    if (pos <= 3 && sala.jugadores.size >= 3) perfil.podios++;
    perfil.puntosTotales += j.puntos;
    perfil.mejorPuntaje = Math.max(perfil.mejorPuntaje, j.puntos);
    for (const hab of ['hecho', 'sector', 'escala', 'actor']) {
      perfil.habilidades[hab].ok += s[hab].ok;
      perfil.habilidades[hab].total += s[hab].total;
    }
    if (perfil.partidas === 5) otorgar('maraton');
    if (perfil.partidas === 15) otorgar('veterano');
    perfil.historial.push({
      fecha: new Date().toISOString(),
      puntos: j.puntos, posicion: pos, jugadores: sala.jugadores.size,
      aciertos: `${totalOk}/${totalPreg}`,
    });
    if (perfil.historial.length > 60) perfil.historial = perfil.historial.slice(-60);

    resultados.push({
      nombre: j.nombre, posicion: pos, puntos: j.puntos,
      aciertos: totalOk, totalPreguntas: totalPreg,
      stats: s, nuevasInsignias: nuevas,
      coleccion: Object.keys(perfil.insignias),
      partidas: perfil.partidas,
    });
  }
  guardarPerfiles();

  emitirA(sala, 'partida:fin', {
    podio: tabla,
    resultados,
    insignias: INSIGNIAS,
  });
}

// ---------- Socket.io ----------
io.on('connection', socket => {
  socket.on('host:crear', () => {
    const sala = crearSala(socket);
    socket.emit('sala:creada', { codigo: sala.codigo, urls: direccionesLocales() });
  });

  socket.on('host:comenzar', () => {
    const sala = salas.get(socket.data.codigoHost);
    if (sala && sala.hostId === socket.id) comenzarPartida(sala);
  });

  socket.on('host:otra', () => {
    const sala = salas.get(socket.data.codigoHost);
    if (!sala || sala.hostId !== socket.id) return;
    sala.estado = 'lobby';
    sala.preguntas = [];
    sala.indice = -1;
    emitirA(sala, 'sala:reabierta', {});
    emitirA(sala, 'sala:lobby', estadoLobby(sala));
  });

  socket.on('jugador:entrar', ({ codigo, nombre }, respuesta) => {
    const sala = salas.get(String(codigo || '').trim());
    nombre = String(nombre || '').trim().slice(0, 24);
    if (!sala) return respuesta({ error: 'No existe una sala con ese código.' });
    if (!nombre) return respuesta({ error: 'Escribí tu nombre para entrar.' });
    const clave = claveJugador(nombre);
    const existente = sala.jugadores.get(clave);

    if (existente && existente.conectado) {
      return respuesta({ error: 'Ya hay alguien con ese nombre en la sala.' });
    }
    if (!existente && sala.jugadores.size >= MAX_JUGADORES) {
      return respuesta({ error: `La sala está completa (máximo ${MAX_JUGADORES} jugadores).` });
    }
    if (!existente && sala.estado !== 'lobby') {
      return respuesta({ error: 'La partida ya empezó. Esperá a la próxima.' });
    }

    const jugador = existente || {
      nombre, clave, puntos: 0, racha: 0, mejorRacha: 0,
      stats: { hecho: { ok: 0, total: 0 }, sector: { ok: 0, total: 0 }, escala: { ok: 0, total: 0 }, actor: { ok: 0, total: 0 } },
      tiempos: [],
    };
    jugador.conectado = true;
    jugador.socketId = socket.id;
    sala.jugadores.set(clave, jugador);
    socket.join('sala-' + sala.codigo);
    socket.data.codigoJugador = sala.codigo;
    socket.data.clave = clave;

    const perfil = obtenerPerfil(nombre);
    respuesta({
      ok: true, codigo: sala.codigo, nombre: jugador.nombre,
      reconectado: !!existente && sala.estado === 'jugando',
      perfil: { partidas: perfil.partidas, insignias: Object.keys(perfil.insignias) },
    });
    emitirA(sala, 'sala:lobby', estadoLobby(sala));
  });

  socket.on('jugador:respuesta', ({ opcion }) => {
    const sala = salas.get(socket.data.codigoJugador);
    if (sala && socket.data.clave != null) {
      registrarRespuesta(sala, socket.data.clave, Number(opcion));
    }
  });

  socket.on('disconnect', () => {
    // host se fue: la sala queda huérfana y se limpia a los 10 min
    if (socket.data.codigoHost) {
      const sala = salas.get(socket.data.codigoHost);
      if (sala && sala.hostId === socket.id) {
        setTimeout(() => {
          if (salas.get(sala.codigo) === sala) {
            clearTimeout(sala.timer);
            emitirA(sala, 'sala:cerrada', {});
            salas.delete(sala.codigo);
          }
        }, 10 * 60 * 1000);
      }
    }
    if (socket.data.codigoJugador) {
      const sala = salas.get(socket.data.codigoJugador);
      if (sala) {
        const j = sala.jugadores.get(socket.data.clave);
        if (j && j.socketId === socket.id) {
          j.conectado = false;
          if (sala.estado === 'lobby') sala.jugadores.delete(socket.data.clave);
          emitirA(sala, 'sala:lobby', estadoLobby(sala));
        }
      }
    }
  });
});

// ---------- Arranque ----------
function direccionesLocales() {
  const urls = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const info of iface || []) {
      if (info.family === 'IPv4' && !info.internal) urls.push(`http://${info.address}:${PUERTO}`);
    }
  }
  if (urls.length === 0) urls.push(`http://localhost:${PUERTO}`);
  return urls;
}

servidor.listen(PUERTO, () => {
  console.log('');
  console.log('  🗞️  CIERRE DE EDICIÓN — juego de entrenamiento periodístico');
  console.log('  ─────────────────────────────────────────────────────────');
  console.log(`  Base de datos: ${HECHOS.length} hechos · ${SENUELOS.length} señuelos · ${CONCEPTOS.length} cartas de concepto`);
  console.log('');
  console.log('  Pantalla central (proyector):');
  for (const u of direccionesLocales()) console.log(`    ${u}/host`);
  console.log('');
  console.log('  Jugadores (celulares, misma red wifi):');
  for (const u of direccionesLocales()) console.log(`    ${u}/play`);
  console.log('');
  console.log('  Panel de perfiles del capacitador:');
  for (const u of direccionesLocales()) console.log(`    ${u}/perfiles`);
  console.log('');
});
