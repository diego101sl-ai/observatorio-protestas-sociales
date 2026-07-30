'use strict';
/* Motor de sonido de Cierre de Edición — WebAudio puro, sin archivos.
   Uso: Sonidos.activar() tras un gesto del usuario; luego Sonidos.correcta(), etc. */
window.Sonidos = (() => {
  let ctx = null;
  let mudo = localStorage.getItem('cde-mudo') === '1';

  function activar() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tono(freq, dur, { tipo = 'square', vol = 0.06, desliz = 0, retardo = 0 } = {}) {
    if (!ctx || mudo) return;
    const t = ctx.currentTime + retardo;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    if (desliz) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + desliz), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function ruido(dur, vol, retardo = 0) {
    if (!ctx || mudo) return;
    const t = ctx.currentTime + retardo;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const datos = buf.getChannelData(0);
    for (let i = 0; i < n; i++) datos[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    src.connect(g).connect(ctx.destination);
    src.start(t);
  }

  return {
    activar,
    get mudo() { return mudo; },
    alternarMudo() {
      mudo = !mudo;
      localStorage.setItem('cde-mudo', mudo ? '1' : '0');
      return mudo;
    },

    unirse()     { tono(660, 0.08, { tipo: 'sine', vol: 0.07 }); tono(880, 0.1, { tipo: 'sine', vol: 0.07, retardo: 0.09 }); },
    cuentaTic()  { tono(440, 0.09, { tipo: 'square', vol: 0.08 }); },
    cuentaYa()   { tono(880, 0.25, { tipo: 'square', vol: 0.09, desliz: 200 }); },
    pregunta()   { tono(523, 0.07, { tipo: 'triangle', vol: 0.08 }); tono(784, 0.1, { tipo: 'triangle', vol: 0.08, retardo: 0.08 }); },
    envio()      { tono(700, 0.05, { tipo: 'sine', vol: 0.06, desliz: 300 }); },
    correcta()   { tono(523, 0.1, { tipo: 'triangle', vol: 0.09 }); tono(784, 0.16, { tipo: 'triangle', vol: 0.09, retardo: 0.1 }); },
    incorrecta() { tono(170, 0.3, { tipo: 'sawtooth', vol: 0.07, desliz: -60 }); },
    ganoTiempo() { tono(988, 0.07, { tipo: 'square', vol: 0.06 }); tono(1319, 0.12, { tipo: 'square', vol: 0.06, retardo: 0.07 }); },
    tictac()     { tono(1100, 0.03, { tipo: 'square', vol: 0.045 }); },
    urgente()    { tono(1300, 0.05, { tipo: 'square', vol: 0.06 }); tono(1300, 0.05, { tipo: 'square', vol: 0.06, retardo: 0.12 }); },
    muerte()     {
      tono(400, 0.5, { tipo: 'sawtooth', vol: 0.09, desliz: -320 });
      ruido(0.28, 0.09, 0.32);
    },
    victoria() {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
        tono(f, i >= 4 ? 0.32 : 0.14, { tipo: 'triangle', vol: 0.09, retardo: i * 0.14 }));
    },
    finPartida() { tono(330, 0.2, { tipo: 'triangle', vol: 0.08 }); tono(262, 0.35, { tipo: 'triangle', vol: 0.08, retardo: 0.18 }); },
  };
})();
