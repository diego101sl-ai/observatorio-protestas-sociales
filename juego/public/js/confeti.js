'use strict';
/* Confeti liviano en canvas para el podio final. window.Confeti.lanzar() */
window.Confeti = (() => {
  const COLORES = ['#ffc531', '#ffb200', '#3f7ef7', '#e94f57', '#26bd7e', '#f0f4fa', '#f2a71b'];
  let canvas, ctx, piezas = [], animando = false;

  function preparar() {
    canvas = document.getElementById('confeti');
    if (!canvas) return false;
    ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    return true;
  }
  window.addEventListener('resize', () => {
    if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  });

  function lanzar(cantidad = 160) {
    if (!canvas && !preparar()) return;
    for (let i = 0; i < cantidad; i++) {
      piezas.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.4,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: COLORES[Math.floor(Math.random() * COLORES.length)],
        vy: 110 + Math.random() * 160,
        vx: (Math.random() - 0.5) * 70,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 7,
        balanceo: Math.random() * Math.PI * 2,
      });
    }
    if (!animando) { animando = true; ultimo = performance.now(); requestAnimationFrame(cuadro); }
  }

  let ultimo = 0;
  function cuadro(t) {
    const dt = Math.min((t - ultimo) / 1000, 0.04);
    ultimo = t;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of piezas) {
      p.balanceo += dt * 3;
      p.x += (p.vx + Math.sin(p.balanceo) * 30) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.6 + 0.4 * Math.sin(p.balanceo * 2)));
      ctx.restore();
    }
    piezas = piezas.filter(p => p.y < canvas.height + 30);
    if (piezas.length > 0) requestAnimationFrame(cuadro);
    else { animando = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  function limpiar() {
    piezas = [];
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { lanzar, limpiar };
})();
