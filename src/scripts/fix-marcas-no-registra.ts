/**
 * Etapa 5.B.pre — Reasignación de marca para productos con placeholder "No Registra".
 *
 * ANMAT deja el campo marca vacío en ~1.600 productos; la marca real suele estar
 * codificada en nombre_fantasia con dos patrones distintos:
 *   1. "MARCA- descripción..."        → marca al inicio (primer segmento ≤ 2 palabras)
 *   2. "descripción... - MARCA"       → marca al final  (último segmento ≤ 2 palabras)
 *   3. Sin guión, ≤ 2 palabras        → toda la fantasía es la marca
 *
 * Casos ambiguos o donde el segmento extraído es un falso positivo (p.ej.
 * "GLUTEN FREE", "SIN TACC") quedan sin tocar.
 *
 * Uso:
 *   npm run db:fix-marcas             → dry-run: muestra plan sin aplicar
 *   npm run db:fix-marcas -- --apply  → aplica los cambios
 */

import { createDb } from '../db/connection.js';
import { normalizeMarca, slugify } from '../lib/normalize.js';
import { log } from '../lib/logger.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const PLACEHOLDER_MARCAS = new Set([
  'no registra', 'no aplica', 'sin marca', 'sin nombre',
  'no registra.', '-', '',
]);

// Segmentos que parecen marcas pero no lo son.
const FALSOS_POSITIVOS = new Set([
  'no registra', 'no aplica', 'sin marca', 'sin nombre', '-',
  'gluten free', 'sin gluten', 'libre de gluten', 'sin tacc',
  'zero', 'pluss', 'detox', 'premium', 'natural', 'organic',
  'light', 'diet', 'original', 'classic', 'extra',
  // Tipos de producto que aparecen al inicio de la fantasía en lugar de la marca
  'oyster sauce', 'soy sauce', 'teriyaki', 'fish sauce',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function esFalsoPositivo(s: string): boolean {
  return FALSOS_POSITIVOS.has(s.toLowerCase().trim());
}

/**
 * Intenta extraer la marca de nombre_fantasia.
 * Devuelve el string crudo (sin normalizar) o null si no es posible determinarlo.
 */
function extractCandidato(fantasia: string): string | null {
  const trimmed = fantasia.trim();
  if (!trimmed) return null;

  const firstSep = trimmed.indexOf('- ');

  if (firstSep > 0) {
    const primerSeg = trimmed.slice(0, firstSep).trim();
    const lastSep   = trimmed.lastIndexOf('- ');
    const ultimoSeg = trimmed.slice(lastSep + 2).trim();

    const palabrasPrimero = primerSeg.split(/\s+/).length;
    const palabrasUltimo  = ultimoSeg.split(/\s+/).length;

    // Patrón 1: marca al inicio — primer segmento corto, último largo
    if (palabrasPrimero <= 2 && palabrasUltimo > 2) {
      return esFalsoPositivo(primerSeg) ? null : primerSeg;
    }

    // Patrón 2: marca al final — último segmento corto, primer largo
    if (palabrasUltimo <= 2 && palabrasPrimero > 2) {
      return esFalsoPositivo(ultimoSeg) ? null : ultimoSeg;
    }

    // Ambos cortos: desempatar con falsos positivos.
    // Si el último es falso positivo pero el primero no → marca al inicio (ej: "SCHAR- ... - PREMIUM").
    // Si el primero es falso positivo pero el último no → marca al final.
    if (palabrasPrimero <= 2 && palabrasUltimo <= 2) {
      const primerEsFP = esFalsoPositivo(primerSeg);
      const ultimoEsFP = esFalsoPositivo(ultimoSeg);
      if (!primerEsFP && ultimoEsFP) return primerSeg;
      if (primerEsFP && !ultimoEsFP) return ultimoSeg;
      // Ambos son falsos positivos, o ninguno → no tocar
      return null;
    }

    // Ambos largos: no tocar
    return null;
  }

  // Sin guión: solo si ≤ 2 palabras (probablemente es la marca sola)
  const words = trimmed.split(/\s+/);
  if (words.length <= 2) {
    return esFalsoPositivo(trimmed) ? null : trimmed;
  }

  return null;
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ProductoRow {
  id_producto: number;
  nombre_producto: string;
  nombre_fantasia: string;
  numero_registro: string | null;
}

interface MarcaRow {
  id_marca: number;
  nombre_marca: string;
}

interface Op {
  id_producto: number;
  nombre_producto: string;
  numero_registro: string | null;
  fantasia: string;
  candidato: string;
  marca_normalizada: string;
  slug: string;
  marca_existente: MarcaRow | null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const isApply = process.argv.includes('--apply');
  if (!isApply) log.warn('Modo DRY-RUN. Pasá --apply para ejecutar los cambios.');

  const { sqlite } = createDb();

  // 1. Traer todos los productos con marca placeholder y fantasía no vacía.
  const productos = sqlite.prepare(`
    SELECT p.id_producto, p.nombre_producto, p.nombre_fantasia, p.numero_registro
    FROM productos p
    JOIN marcas m ON m.id_marca = p.id_marca
    WHERE lower(m.nombre_marca) IN (${[...PLACEHOLDER_MARCAS].map(() => '?').join(',')})
      AND p.nombre_fantasia IS NOT NULL
      AND trim(p.nombre_fantasia) != ''
  `).all(...PLACEHOLDER_MARCAS) as ProductoRow[];

  log.info(`Productos con marca placeholder y fantasía: ${productos.length}`);

  // 2. Planificar operaciones.
  const ops: Op[] = [];
  let sin_candidato = 0;

  for (const p of productos) {
    const candidato = extractCandidato(p.nombre_fantasia);
    if (!candidato) { sin_candidato++; continue; }

    const marca_normalizada = normalizeMarca(candidato);
    const slug = slugify(marca_normalizada);
    if (!slug) { sin_candidato++; continue; }

    const marcaExistente = sqlite.prepare(
      `SELECT id_marca, nombre_marca FROM marcas WHERE slug = ?`,
    ).get(slug) as MarcaRow | undefined ?? null;

    ops.push({
      id_producto:      p.id_producto,
      nombre_producto:  p.nombre_producto,
      numero_registro:  p.numero_registro,
      fantasia:         p.nombre_fantasia,
      candidato,
      marca_normalizada,
      slug,
      marca_existente:  marcaExistente,
    });
  }

  // 3. Resumen
  const ops_nueva_marca    = ops.filter(o => o.marca_existente === null);
  const ops_marca_existente = ops.filter(o => o.marca_existente !== null);

  const marcas_a_crear = new Map<string, string>();
  for (const o of ops_nueva_marca) {
    if (!marcas_a_crear.has(o.slug)) marcas_a_crear.set(o.slug, o.marca_normalizada);
  }

  const freq = new Map<string, number>();
  for (const o of ops) {
    freq.set(o.marca_normalizada, (freq.get(o.marca_normalizada) ?? 0) + 1);
  }
  const topMarcas = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  PLAN DE REASIGNACIÓN DE MARCAS (Fase A)                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nProductos a reasignar:          ${ops.length}`);
  console.log(`  → Marca ya existente en DB:    ${ops_marca_existente.length}`);
  console.log(`  → Marca nueva (a crear):       ${ops_nueva_marca.length}`);
  console.log(`  Marcas nuevas únicas:          ${marcas_a_crear.size}`);
  console.log(`Sin candidato extraíble:         ${sin_candidato}`);

  console.log('\n[Top 25 marcas candidatas por frecuencia]:');
  for (const [marca, cnt] of topMarcas) {
    const existe = ops.find(o => o.marca_normalizada === marca)?.marca_existente;
    const tag = existe ? `(existe: id=${existe.id_marca})` : '(nueva)';
    console.log(`  ${cnt.toString().padStart(4)} × "${marca}" ${tag}`);
  }

  console.log('\n[Marcas nuevas a crear]:');
  const marcasCrearEntries = [...marcas_a_crear.entries()]
    .map(([slug, nombre]) => ({ slug, nombre, cnt: freq.get(nombre) ?? 0 }))
    .sort((a, b) => b.cnt - a.cnt);
  for (const { slug, nombre, cnt } of marcasCrearEntries.slice(0, 40)) {
    console.log(`  ${cnt.toString().padStart(4)} productos → "${nombre}" (slug: ${slug})`);
  }
  if (marcas_a_crear.size > 40) {
    console.log(`  ... y ${marcas_a_crear.size - 40} más`);
  }

  console.log('\n[Muestra de reasignaciones — primeras 20]:');
  for (const o of ops.slice(0, 20)) {
    const destino = o.marca_existente
      ? `→ "${o.marca_existente.nombre_marca}" (id=${o.marca_existente.id_marca})`
      : `→ NUEVA "${o.marca_normalizada}"`;
    console.log(`  [${o.numero_registro ?? '—'}] ${o.nombre_producto.slice(0, 50)}`);
    console.log(`    fantasia: "${o.fantasia.slice(0, 70)}"`);
    console.log(`    ${destino}`);
  }

  if (!isApply) {
    log.info('\nDRY-RUN completo. Pasá --apply para ejecutar los cambios.');
    sqlite.close();
    return;
  }

  // 4. Aplicar en una transacción
  const run = sqlite.transaction(() => {
    let reasignados  = 0;
    let marcas_creadas = 0;
    let errores      = 0;

    const slugToId = new Map<string, number>();
    for (const o of ops) {
      if (o.marca_existente) slugToId.set(o.slug, o.marca_existente.id_marca);
    }

    for (const o of ops) {
      try {
        let id_marca: number;

        if (slugToId.has(o.slug)) {
          id_marca = slugToId.get(o.slug)!;
        } else {
          const ins = sqlite.prepare(
            `INSERT INTO marcas (nombre_marca, slug, pais_origen) VALUES (?, ?, 'AR')`,
          ).run(o.marca_normalizada, o.slug);
          id_marca = Number(ins.lastInsertRowid);
          slugToId.set(o.slug, id_marca);
          marcas_creadas++;
        }

        sqlite.prepare(
          `UPDATE productos SET id_marca = ? WHERE id_producto = ?`,
        ).run(id_marca, o.id_producto);

        reasignados++;
      } catch (err) {
        errores++;
        log.error(
          `Error en producto ${o.id_producto}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    log.info(`\nResultado:`);
    log.info(`  Productos reasignados: ${reasignados}`);
    log.info(`  Marcas nuevas creadas: ${marcas_creadas}`);
    log.info(`  Errores:               ${errores}`);
  });

  try {
    run();
  } finally {
    sqlite.close();
  }
}

main();
