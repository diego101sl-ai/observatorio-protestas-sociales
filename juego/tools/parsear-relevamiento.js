#!/usr/bin/env node
/**
 * Convierte exportaciones del dashboard "Algoritmo Inteligente" (.md)
 * en la base de hechos del juego (data/hechos.json).
 *
 * Uso: node tools/parsear-relevamiento.js archivo1.md [archivo2.md ...]
 */
const fs = require('fs');
const path = require('path');

const SECTORES_VALIDOS = new Set([
  'AGENDA POLÍTICA', 'FINANZAS', 'TRABAJADORES', 'ENERGÍA', 'AGRO', 'INDUSTRIA',
]);
const ESCALAS_VALIDAS = new Set([
  'Nacional', 'Provincial', 'Latinoamericana', 'Internacional',
]);

const archivos = process.argv.slice(2);
if (archivos.length === 0) {
  console.error('Uso: node tools/parsear-relevamiento.js archivo1.md [archivo2.md ...]');
  process.exit(1);
}

const hechos = [];
let descartados = 0;

for (const archivo of archivos) {
  const texto = fs.readFileSync(archivo, 'utf8');
  const bloques = texto.split(/\n---\n/);
  for (const bloque of bloques) {
    const tituloM = bloque.match(/^##\s+\d+\.\s+(.+)$/m);
    const metaM = bloque.match(/^\*\*(.+?)\*\*\s+·\s+(\d{4}-\d{2}-\d{2})\s+·\s+([^·]+?)\s+·\s+([^·]+?)\s+·\s+Actores:\s*(.*)$/m);
    if (!tituloM || !metaM) continue;

    const titulo = tituloM[1].trim();
    const medio = metaM[1].trim();
    const fecha = metaM[2].trim();
    const escala = metaM[3].trim();
    const sector = metaM[4].trim();
    const actores = metaM[5].split(';').map(a => a.trim()).filter(Boolean);

    if (!SECTORES_VALIDOS.has(sector) || !ESCALAS_VALIDAS.has(escala)) {
      descartados++;
      continue;
    }

    // El resumen es el primer párrafo largo después de la línea de metadatos
    const lineas = bloque.split('\n').map(l => l.trim());
    let resumen = '';
    for (const l of lineas) {
      if (l.startsWith('##') || l.startsWith('**') || l.startsWith('- Link') || l === '' || l === 'continua') continue;
      if (l.length > resumen.length) resumen = l;
    }
    // Recorte al final de una oración cerca de los 300 caracteres
    if (resumen.length > 320) {
      const corte = resumen.slice(0, 320).lastIndexOf('. ');
      resumen = corte > 120 ? resumen.slice(0, corte + 1) : resumen.slice(0, 300) + '…';
    }

    const linkM = bloque.match(/- Link:\s*(\S+)/);

    hechos.push({
      id: hechos.length + 1,
      titulo, medio, fecha, escala, sector,
      orbita: null, // pendiente: se completará cuando la fuente exporte la órbita
      actores, resumen,
      link: linkM ? linkM[1] : null,
    });
  }
}

// Deduplicar por título
const vistos = new Set();
const unicos = hechos.filter(h => {
  const clave = h.titulo.toLowerCase();
  if (vistos.has(clave)) return false;
  vistos.add(clave);
  return true;
});
unicos.forEach((h, i) => { h.id = i + 1; });

const salida = path.join(__dirname, '..', 'data', 'hechos.json');
fs.writeFileSync(salida, JSON.stringify(unicos, null, 1), 'utf8');

const porEscala = {};
const porSector = {};
for (const h of unicos) {
  porEscala[h.escala] = (porEscala[h.escala] || 0) + 1;
  porSector[h.sector] = (porSector[h.sector] || 0) + 1;
}
console.log(`Hechos válidos: ${unicos.length} (descartados por sector/escala no válidos: ${descartados}, duplicados: ${hechos.length - unicos.length})`);
console.log('Por escala:', porEscala);
console.log('Por sector:', porSector);
console.log('Guardado en', salida);
