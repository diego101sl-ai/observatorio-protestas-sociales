// Genera los SVG 3D del isotipo OITraF: tres circuitos (esferas + tubos) y el engranaje biselado.
import fs from 'node:fs';
const G = JSON.parse(fs.readFileSync(new URL('./grafo.json', import.meta.url), 'utf8'));
const OUT = new URL('../img/marca/', import.meta.url).pathname;
const { W, H } = G; const nodos = G.nodos; const aristas = G.aristas.slice();
// aristas que el raster perdió (contorno izquierdo y enlace al nodo derecho)
aristas.push({ i: 4, j: 20, c: 3 }, { i: 6, j: 9, c: 3 });
const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(...A.map((v, i) => v + (B[i] - v) * t)); };
const depth = (y) => 0.86 + 0.3 * (y / H);           // más abajo = más cerca = más grande
const f = (n) => +n.toFixed(2);
function circuito(c, base, nombre, { oscuro = '#000000', claro = '#ffffff', brillo = 0.72 } = {}) {
  const luz = mix(base, claro, 0.55), medio = base, sombra = mix(base, oscuro, 0.42), borde = mix(base, oscuro, 0.6);
  const id = nombre.replace(/[^a-z]/g, '');
  let defs = `<radialGradient id="g${id}" cx="34%" cy="30%" r="72%"><stop offset="0" stop-color="${luz}"/><stop offset="0.45" stop-color="${medio}"/><stop offset="1" stop-color="${sombra}"/></radialGradient>`;
  defs += `<filter id="s${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>`;
  defs += `<linearGradient id="t${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${luz}"/><stop offset="0.5" stop-color="${medio}"/><stop offset="1" stop-color="${sombra}"/></linearGradient>`;
  let tubos = '', esferas = '';
  for (const e of aristas) { if (e.c !== c) continue; const a = nodos[e.i], b = nodos[e.j]; const w = 3.9 * (depth(a.y) + depth(b.y)) / 2;
    const d = `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`;
    tubos += `<path d="${d}" stroke="${borde}" stroke-width="${f(w + 1.6)}" opacity="0.85"/>`;
    tubos += `<path d="${d}" stroke="${medio}" stroke-width="${f(w)}"/>`;
    tubos += `<path d="${d}" stroke="${luz}" stroke-width="${f(w * 0.38)}" opacity="0.75" transform="translate(-0.7 -0.8)"/>`; }
  for (const n of nodos) { if (n.c !== c) continue; const r = 14.6 * depth(n.y); const x = f(n.x), y = f(n.y);
    esferas += `<circle cx="${f(n.x + 2.2)}" cy="${f(n.y + 3.2)}" r="${f(r * 1.02)}" fill="${oscuro}" opacity="0.28" filter="url(#s${id})"/>`;
    esferas += `<circle cx="${x}" cy="${y}" r="${f(r)}" fill="url(#g${id})"/>`;
    esferas += `<circle cx="${x}" cy="${y}" r="${f(r - 0.4)}" fill="none" stroke="${borde}" stroke-width="0.8" opacity="0.35"/>`;
    esferas += `<ellipse cx="${f(n.x - r * 0.32)}" cy="${f(n.y - r * 0.38)}" rx="${f(r * 0.34)}" ry="${f(r * 0.22)}" transform="rotate(-30 ${f(n.x - r * 0.32)} ${f(n.y - r * 0.38)})" fill="${claro}" opacity="${brillo}"/>`; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Red del isotipo OITraF, circuito ${nombre}"><!-- © OITraF · Observatorio Internacional del Trabajo del Futuro --><defs>${defs}</defs><g fill="none" stroke-linecap="round">${tubos}</g><g>${esferas}</g></svg>`;
  fs.writeFileSync(OUT + `circuito-${nombre}.svg`, svg); return svg.length;
}
const t = [];
t.push(circuito(1, '#e5322d', 'rojo'));
t.push(circuito(2, '#f2c14e', 'amarillo', { brillo: 0.8 }));
t.push(circuito(3, '#0b2a5b', 'azul', { claro: '#9fb6e0', oscuro: '#02070f', brillo: 0.55 }));
t.push(circuito(3, '#e8eef8', 'azul-blanco', { claro: '#ffffff', oscuro: '#3d5a8a', brillo: 0.9 }));

// ---------- engranaje ----------
function engranaje(nombre, base, { claro, oscuro }) {
  const { cx, cy, perfil } = G.gear; const n = perfil.length;
  // suavizado circular del perfil para quitar el ruido del raster
  const sm = perfil.map((_, i) => { let s = 0; for (let k = -3; k <= 3; k++) s += perfil[(i + k + n) % n]; return s / 7; });
  const INSET = 4; // el trazo redondeado devuelve estos píxeles
  const pts = sm.map((r, i) => { const th = i * 2 * Math.PI / n; return [cx + Math.cos(th) * (r - INSET), cy + Math.sin(th) * (r - INSET)]; });
  const d = 'M' + pts.map(p => `${f(p[0])} ${f(p[1])}`).join('L') + 'Z';
  const rHub = 53, rHueco = 120;
  const cuerpo = `${d}M${f(cx + rHueco)} ${f(cy)}A${rHueco} ${rHueco} 0 1 0 ${f(cx - rHueco)} ${f(cy)}A${rHueco} ${rHueco} 0 1 0 ${f(cx + rHueco)} ${f(cy)}Z`;
  const luz = mix(base, claro, 0.5), sombra = mix(base, oscuro, 0.35), borde = mix(base, oscuro, 0.55);
  const id = nombre.replace(/[^a-z]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="Engranaje del isotipo OITraF"><!-- © OITraF · Observatorio Internacional del Trabajo del Futuro --><defs>
<linearGradient id="m${id}" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${luz}"/><stop offset="0.48" stop-color="${base}"/><stop offset="1" stop-color="${sombra}"/></linearGradient>
<radialGradient id="h${id}" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="${luz}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${sombra}"/></radialGradient>
<clipPath id="c${id}" clip-rule="evenodd"><path d="${cuerpo}" clip-rule="evenodd"/></clipPath>
<filter id="b${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<g fill="${oscuro}" opacity="0.22" filter="url(#b${id})" transform="translate(4 6)"><path d="${cuerpo}" fill-rule="evenodd"/><circle cx="${cx}" cy="${cy}" r="${rHub}"/></g>
<path d="${cuerpo}" fill="url(#m${id})" fill-rule="evenodd" stroke="url(#m${id})" stroke-width="${INSET * 2}" stroke-linejoin="round"/>
<g clip-path="url(#c${id})" fill="none" stroke-linejoin="round">
<path d="${cuerpo}" stroke="${claro}" stroke-width="7" opacity="0.55" transform="translate(-2.5 -2.5)"/>
<path d="${cuerpo}" stroke="${borde}" stroke-width="7" opacity="0.5" transform="translate(2.5 2.5)"/>
</g>
<circle cx="${cx}" cy="${cy}" r="${rHub}" fill="url(#h${id})"/>
<circle cx="${cx}" cy="${cy}" r="${rHub - 1.5}" fill="none" stroke="${borde}" stroke-width="2" opacity="0.4"/>
<ellipse cx="${f(cx - rHub * 0.3)}" cy="${f(cy - rHub * 0.36)}" rx="${f(rHub * 0.36)}" ry="${f(rHub * 0.2)}" transform="rotate(-30 ${f(cx - rHub * 0.3)} ${f(cy - rHub * 0.36)})" fill="${claro}" opacity="0.5"/>
</svg>`;
  fs.writeFileSync(OUT + `iso-engranaje${nombre}.svg`, svg); return svg.length;
}
t.push(engranaje('', '#0b2a5b', { claro: '#8fa8d8', oscuro: '#02070f' }));
t.push(engranaje('-blanco', '#eef2f8', { claro: '#ffffff', oscuro: '#4a6590' }));
console.log('bytes', t);
