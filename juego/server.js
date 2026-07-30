'use strict';
/**
 * CIERRE DE EDICIÓN — servidor del juego
 * Multijugador estilo Kahoot con mecánica de supervivencia por tiempo:
 * cada jugador tiene un reloj vital que corre mientras la pregunta está abierta;
 * acertar suma segundos, errar no suma nada. Cuando el reloj llega a cero,
 * el jugador queda fuera. Gana el último en pie.
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

// ---------- Reglas del reloj vital ----------
const RELOJ_INICIAL = 60_000;  // ms de vida con los que arranca cada jugador
const RELOJ_MAX = 90_000;      // tope del reloj (para que nadie se escape)
const MAX_PREGUNTAS = 30;      // tope duro de preguntas por partida
const PAUSA_RESULTADO = 5000;  // ms mostrando la respuesta correcta y explicación

// Fases: la ventana de respuesta (igual para todos) se achica y el premio también
function faseDePregunta(indice) {
  if (indice < 5) return { nivel: 1, nombre: 'REDACTOR', ventana: 15, gana: 10 };
  if (indice < 12) return { nivel: 2, nombre: 'EDITOR', ventana: 12, gana: 8 };
  if (indice < 20) return { nivel: 3, nombre: 'CIERRE DE EDICIÓN', ventana: 10, gana: 6 };
  return { nivel: 4, nombre: 'MUERTE SÚBITA', ventana: 8, gana: 5 };
}
const MAX_JUGADORES = 10;

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
  campeon:            { emoji: '🏆', nombre: 'Último en Pie', desc: 'Sobrevivió a toda la redacción' },
  al_limite:          { emoji: '🫀', nombre: 'Al Límite', desc: 'Se salvó con menos de 3 segundos en el reloj' },
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

  // 12 × hecho o no: 3 de cada defecto + 3 hechos reales
  const porDefecto = d => SENUELOS.filter(s => s.defecto === d);
  for (const defecto of ['falta_actor', 'falta_tiempo', 'opinion']) {
    for (const s of tomar(porDefecto(defecto), 3)) preguntas.push(preguntaSenuelo(s));
  }
  for (let i = 0; i < 3; i++) preguntas.push(preguntaHechoReal());

  // 7 × sector: los 6 sectores + 1 extra
  const sectores = mezclar(SECTORES.slice());
  sectores.push(alAzar(SECTORES));
  for (const sector of sectores) {
    preguntas.push(preguntaSector(alAzar(HECHOS.filter(h => h.sector === sector))));
  }

  // 6 × escala: las 4 escalas + 2 extra
  const escalas = mezclar(ESCALAS.slice());
  escalas.push(alAzar(ESCALAS), alAzar(ESCALAS));
  for (const escala of escalas) {
    preguntas.push(preguntaEscala(alAzar(HECHOS.filter(h => h.escala === escala))));
  }

  // 5 × concepto de actor
  for (const c of tomar(CONCEPTOS, 5)) preguntas.push(preguntaConcepto(c));

  return mezclar(preguntas).slice(0, MAX_PREGUNTAS);
}

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

// Tabla de posiciones: vivos ordenados por reloj, luego muertos por orden de eliminación
function tabla(sala) {
  const vivos = [...sala.jugadores.values()].filter(j => j.vivo)
    .sort((a, b) => b.reloj - a.reloj || b.puntos - a.puntos);
  const muertos = [...sala.jugadores.values()].filter(j => !j.vivo)
    .sort((a, b) => b.ordenMuerte - a.ordenMuerte);
  return [...vivos, ...muertos].map((j, i) => ({
    nombre: j.nombre, posicion: i + 1,
    vivo: j.vivo, restante: Math.max(0, Math.round(j.reloj)),
    racha: j.racha, preguntaMuerte: j.preguntaMuerte || null,
  }));
}

function crearSala(hostSocket) {
  const sala = {
    codigo: nuevoCodigo(),
    hostId: hostSocket.id,
    jugadores: new Map(),
    estado: 'lobby',
    preguntas: [],
    indice: -1,
    muertos: 0,
    abierta: null, // { inicio, ventanaMs, ganaMs, respuestas: Map(clave -> {opcion, ms}) }
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
  sala.muertos = 0;
  for (const j of sala.jugadores.values()) {
    j.puntos = 0; j.racha = 0; j.mejorRacha = 0;
    j.reloj = RELOJ_INICIAL; j.vivo = true;
    j.ordenMuerte = 0; j.preguntaMuerte = null; j.seSalvoAlLimite = false;
    j.stats = { hecho: { ok: 0, total: 0 }, sector: { ok: 0, total: 0 }, escala: { ok: 0, total: 0 }, actor: { ok: 0, total: 0 } };
    j.tiempos = [];
  }
  emitirA(sala, 'partida:comenzo', {
    relojInicial: RELOJ_INICIAL,
    jugadores: sala.jugadores.size,
  });
  setTimeout(() => siguientePregunta(sala), 3600); // cuenta regresiva en pantalla
}

function vivosConectados(sala) {
  return [...sala.jugadores.values()].filter(j => j.vivo && j.conectado);
}

function siguientePregunta(sala) {
  if (sala.estado !== 'jugando') return;
  const vivos = [...sala.jugadores.values()].filter(j => j.vivo);
  const finPorSupervivencia = sala.jugadores.size >= 2 ? vivos.length <= 1 : vivos.length === 0;
  sala.indice++;
  if (finPorSupervivencia || sala.indice >= sala.preguntas.length) return terminarPartida(sala);

  const p = sala.preguntas[sala.indice];
  const fase = faseDePregunta(sala.indice);
  sala.abierta = {
    inicio: Date.now(),
    ventanaMs: fase.ventana * 1000,
    ganaMs: fase.gana * 1000,
    respuestas: new Map(),
  };

  emitirA(sala, 'pregunta:nueva', {
    indice: sala.indice, maximo: sala.preguntas.length,
    nivel: fase.nivel, nombreNivel: fase.nombre,
    ventana: fase.ventana, gana: fase.gana,
    tipo: p.tipo, texto: p.texto, contexto: p.contexto,
    opciones: p.opciones, fuente: p.fuente,
    // relojes al momento de abrir: los clientes los hacen correr en pantalla
    relojes: tabla(sala),
    vivos: vivos.length,
  });

  sala.timer = setTimeout(() => cerrarPregunta(sala), sala.abierta.ventanaMs + 400);
}

function registrarRespuesta(sala, clave, opcion) {
  if (sala.estado !== 'jugando' || !sala.abierta) return;
  const j = sala.jugadores.get(clave);
  if (!j || !j.vivo) return;
  if (sala.abierta.respuestas.has(clave)) return;
  const ms = Date.now() - sala.abierta.inicio;
  if (ms > sala.abierta.ventanaMs + 300) return;
  sala.abierta.respuestas.set(clave, { opcion, ms });

  const vivos = vivosConectados(sala);
  emitirA(sala, 'pregunta:respondio', {
    respondieron: sala.abierta.respuestas.size,
    total: vivos.length,
  });

  // si todos los vivos conectados respondieron, cerrar antes (se deja de drenar el reloj)
  if (sala.abierta.respuestas.size >= vivos.length && vivos.length > 0) {
    clearTimeout(sala.timer);
    cerrarPregunta(sala);
  }
}

function cerrarPregunta(sala) {
  if (sala.estado !== 'jugando' || !sala.abierta) return;
  const p = sala.preguntas[sala.indice];
  const abierta = sala.abierta;
  sala.abierta = null;
  clearTimeout(sala.timer);

  // el tiempo drenado es el mismo para todos los vivos: lo que estuvo abierta la pregunta
  const drenaje = Math.min(Date.now() - abierta.inicio, abierta.ventanaMs);

  const detalle = [];
  const bajas = [];
  for (const [clave, j] of sala.jugadores) {
    if (!j.vivo) continue;
    const r = abierta.respuestas.get(clave);
    const acerto = r && r.opcion === p.correcta;
    let ganado = 0;

    j.reloj -= drenaje;
    if (acerto) {
      ganado = abierta.ganaMs;
      if (j.reloj <= 3000) j.seSalvoAlLimite = true; // se salvó con el reloj casi en cero
      j.reloj = Math.min(j.reloj + ganado, RELOJ_MAX);
      j.racha++;
      j.mejorRacha = Math.max(j.mejorRacha, j.racha);
      j.tiempos.push(r.ms);
      j.puntos += 500 + Math.round(500 * Math.max(0, 1 - r.ms / abierta.ventanaMs));
    } else {
      j.racha = 0;
    }
    j.stats[p.habilidad].total++;
    if (acerto) j.stats[p.habilidad].ok++;

    if (j.reloj <= 0) {
      j.reloj = 0;
      j.vivo = false;
      j.ordenMuerte = ++sala.muertos;
      j.preguntaMuerte = sala.indice + 1;
      bajas.push(j.nombre);
    }

    detalle.push({
      nombre: j.nombre, respondio: !!r, acerto: !!acerto,
      opcion: r ? r.opcion : null,
      ganadoMs: acerto ? ganado : 0,
      drenajeMs: Math.round(drenaje),
      restante: Math.max(0, Math.round(j.reloj)),
      vivo: j.vivo, racha: j.racha,
    });
  }

  const posiciones = tabla(sala);
  const vivos = posiciones.filter(t => t.vivo).length;

  emitirA(sala, 'pregunta:resultado', {
    indice: sala.indice,
    correcta: p.correcta, explicacion: p.explicacion,
    detalle, tabla: posiciones, bajas, vivos,
  });

  setTimeout(() => siguientePregunta(sala), PAUSA_RESULTADO);
}

function terminarPartida(sala) {
  sala.estado = 'fin';
  const posiciones = tabla(sala);
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
    const pos = posiciones.find(t => t.nombre === j.nombre).posicion;
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
    if (j.seSalvoAlLimite) otorgar('al_limite');
    if (j.mejorRacha >= 5) otorgar('racha');
    const totalOk = s.hecho.ok + s.sector.ok + s.escala.ok + s.actor.ok;
    const totalPreg = s.hecho.total + s.sector.total + s.escala.total + s.actor.total;
    if (totalPreg > 0 && totalOk === totalPreg) otorgar('pluma_perfecta');

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
      nombre: j.nombre, posicion: pos,
      vivo: j.vivo, restante: Math.max(0, Math.round(j.reloj)),
      preguntaMuerte: j.preguntaMuerte,
      aciertos: totalOk, totalPreguntas: totalPreg,
      stats: s, nuevasInsignias: nuevas,
      coleccion: Object.keys(perfil.insignias),
      partidas: perfil.partidas,
    });
  }
  guardarPerfiles();

  emitirA(sala, 'partida:fin', {
    tabla: posiciones,
    resultados,
    insignias: INSIGNIAS,
    preguntasJugadas: sala.indice,
  });
}

// ---------- Socket.io ----------
io.on('connection', socket => {
  socket.on('host:crear', () => {
    const sala = crearSala(socket);
    socket.emit('sala:creada', {
      codigo: sala.codigo,
      urls: direccionesLocales(),
      titulares: tomar(HECHOS, 40).map(h => ({ titulo: h.titulo, medio: h.medio })),
    });
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
      reloj: RELOJ_INICIAL, vivo: true, ordenMuerte: 0, preguntaMuerte: null, seSalvoAlLimite: false,
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
  console.log(`  Mecánica: reloj vital de ${RELOJ_INICIAL / 1000}s · acertar suma tiempo · gana el último en pie`);
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
