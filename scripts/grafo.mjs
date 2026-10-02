import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const M = new URL('../img/marca/', import.meta.url).pathname;
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(M + f).toString('base64');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();
await page.setContent(`<img id="red" src="${b64('iso-red.png')}"><img id="gear" src="${b64('iso-engranaje.png')}">`);
await page.waitForFunction(() => [...document.images].every(i => i.complete));
const res = await page.evaluate(() => {
  const data = (img) => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return { W: c.width, H: c.height, d: x.getImageData(0, 0, c.width, c.height).data }; };
  // ---------- red ----------
  const { W, H, d } = data(document.getElementById('red'));
  const N = W * H; const cls = new Uint8Array(N); // 0 nada, 1 rojo, 2 amarillo, 3 azul, 4 otro
  for (let i = 0; i < N; i++) { const a = d[i * 4 + 3]; if (a < 90) continue; const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    if (r > 150 && g < 110 && b < 110) cls[i] = 1; else if (r > 180 && g > 130 && b < 130) cls[i] = 2; else if (b > 90 && b > r + 30) cls[i] = 3; else cls[i] = 4; }
  const any = new Uint8Array(N); for (let i = 0; i < N; i++) any[i] = cls[i] && cls[i] !== 4 ? 1 : 0;
  const R = 6; const er = new Uint8Array(N);
  for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) { let ok = 1; for (let dy = -R; dy <= R && ok; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R) continue; if (!any[(y + dy) * W + x + dx]) { ok = 0; break; } } er[y * W + x] = ok; }
  const seen = new Uint8Array(N); const nodos = [];
  for (let p = 0; p < N; p++) { if (!er[p] || seen[p]) continue; const st = [p]; seen[p] = 1; let n = 0, sx = 0, sy = 0; const col = [0, 0, 0, 0, 0];
    while (st.length) { const q = st.pop(); const qx = q % W, qy = (q - qx) / W; n++; sx += qx; sy += qy; col[cls[q]]++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const r2 = ny * W + nx; if (er[r2] && !seen[r2]) { seen[r2] = 1; st.push(r2); } } }
    if (n < 15) continue; const c = col.indexOf(Math.max(col[1], col[2], col[3])); nodos.push({ x: sx / n, y: sy / n, r: Math.sqrt(n / Math.PI) + R, c, n }); }
  // radio real: media de distancias al borde en 16 direcciones
  for (const nd of nodos) { let s = 0, k = 0; for (let a = 0; a < 16; a++) { const ca = Math.cos(a * Math.PI / 8), sa = Math.sin(a * Math.PI / 8); let rr = 0; while (rr < 40) { const px = Math.round(nd.x + ca * rr), py = Math.round(nd.y + sa * rr); if (px < 0 || py < 0 || px >= W || py >= H || cls[py * W + px] !== nd.c) break; rr++; } if (rr < 40) { s += rr; k++; } } nd.r = s / k; }
  // aristas
  const hit = (x, y, c) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const px = Math.round(x + dx), py = Math.round(y + dy); if (px < 0 || py < 0 || px >= W || py >= H) continue; const v = cls[py * W + px]; if (v && v !== 4 && (!c || v === c)) return v; } return 0; };
  const aristas = [];
  for (let i = 0; i < nodos.length; i++) for (let j = i + 1; j < nodos.length; j++) { const a = nodos[i], b = nodos[j]; const L = Math.hypot(b.x - a.x, b.y - a.y); const t0 = (a.r + 4) / L, t1 = 1 - (b.r + 4) / L; if (t1 <= t0) continue;
    const S = Math.max(24, Math.round(L / 3)); let ok = 0; const col = [0, 0, 0, 0, 0]; let tot = 0;
    for (let s = 0; s <= S; s++) { const t = t0 + (t1 - t0) * s / S; tot++; const v = hit(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); if (v) { ok++; col[v]++; } }
    const frac = ok / tot; if (frac < 0.9) continue; const c = col.indexOf(Math.max(col[1], col[2], col[3]));
    // descartar aristas que pasan por un tercer nodo (colineales)
    let pasa = false; for (let k = 0; k < nodos.length && !pasa; k++) { if (k === i || k === j) continue; const n = nodos[k]; const t = ((n.x - a.x) * (b.x - a.x) + (n.y - a.y) * (b.y - a.y)) / (L * L); if (t <= 0.02 || t >= 0.98) continue; const dx = a.x + (b.x - a.x) * t - n.x, dy = a.y + (b.y - a.y) * t - n.y; if (Math.hypot(dx, dy) < n.r + 2) pasa = true; }
    if (pasa) continue; aristas.push({ i, j, c, frac: +frac.toFixed(2), L: Math.round(L) }); }
  // ---------- engranaje: perfil polar ----------
  const g = data(document.getElementById('gear')); const gc = { x: 0, y: 0 }; let gn = 0;
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) if (g.d[(y * g.W + x) * 4 + 3] > 90) { gc.x += x; gc.y += y; gn++; }
  gc.x /= gn; gc.y /= gn;
  const op = (x, y) => { const px = Math.round(x), py = Math.round(y); return px >= 0 && py >= 0 && px < g.W && py < g.H && g.d[(py * g.W + px) * 4 + 3] > 90; };
  const perfil = []; for (let a = 0; a < 720; a++) { const th = a * Math.PI / 360; let rr = 0, last = 0; for (let r = 0; r < g.W / 2; r += 0.5) if (op(gc.x + Math.cos(th) * r, gc.y + Math.sin(th) * r)) last = r; perfil.push(+last.toFixed(1)); }
  // anillo interior: radios de transición a lo largo del eje x
  const trans = []; let prev = op(gc.x, gc.y); for (let r = 0.5; r < g.W / 2; r += 0.5) { const cur = op(gc.x + r, gc.y); if (cur !== prev) { trans.push(+r.toFixed(1)); prev = cur; } }
  return { W, H, nodos, aristas, gear: { W: g.W, H: g.H, cx: +gc.x.toFixed(1), cy: +gc.y.toFixed(1), perfil, trans } };
});
await browser.close();
fs.writeFileSync(new URL('./grafo.json', import.meta.url), JSON.stringify(res));
const { nodos, aristas, gear } = res;
console.log('nodos', nodos.length, 'aristas', aristas.length);
console.log(nodos.map((n, i) => `${i}:${['', 'R', 'A', 'B'][n.c]}(${n.x.toFixed(0)},${n.y.toFixed(0)},r${n.r.toFixed(1)})`).join(' '));
console.log(aristas.map(e => `${e.i}-${e.j}${['', 'R', 'A', 'B'][e.c]}`).join(' '));
console.log('gear', gear.cx, gear.cy, 'trans', gear.trans, 'rmax', Math.max(...gear.perfil), 'rmin', Math.min(...gear.perfil));
