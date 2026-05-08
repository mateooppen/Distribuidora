/**
 * Reasignación de marca para productos con placeholder "No Registra".
 *
 * ANMAT deja el campo marca vacío en ~1.600 productos; la marca real suele estar
 * codificada en nombre_fantasia (o nombre_producto) con dos mecanismos:
 *
 * Pasada A — heurística de separadores:
 *   1. "MARCA- descripción..."        → marca al inicio (primer segmento ≤ 2 palabras)
 *   2. "descripción... - MARCA"       → marca al final  (último segmento ≤ 2 palabras)
 *   3. Sin guión, ≤ 2 palabras        → toda la fantasía es la marca
 *   Desempate: si ambos segmentos son cortos, se usa el que NO sea falso positivo.
 *
 * Pasada B — lista manual de substrings:
 *   Para marcas conocidas que no siguen los patrones anteriores, se busca el
 *   substring en nombre_fantasia y nombre_producto (case-insensitive).
 *   Cada entrada mapea un substring a un nombre de marca normalizado.
 *
 * Uso:
 *   npm run db:fix-marcas             → dry-run: muestra plan sin aplicar
 *   npm run db:fix-marcas -- --apply  → aplica los cambios
 */

import type { Database } from 'better-sqlite3';
import { createDb } from '../db/connection.js';
import { normalizeMarca, slugify } from '../lib/normalize.js';
import { log } from '../lib/logger.js';
import { MARCAS_SUBSTRING_MAP } from '../data/marcas-substring-map.js';

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

// La tabla de substrings → marca vive en src/data/marcas-substring-map.ts.
// Importada arriba como MARCAS_SUBSTRING_MAP.

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
  fuente: string;
  marca_existente: MarcaRow | null;
}

// ── Helpers de resolución de marca ───────────────────────────────────────────

function resolverMarcaExistente(sqlite: Database, slug: string): MarcaRow | null {
  return sqlite.prepare(
    `SELECT id_marca, nombre_marca FROM marcas WHERE slug = ?`,
  ).get(slug) as MarcaRow | undefined ?? null;
}

function buildOp(sqlite: Database, p: ProductoRow, candidato: string, fuente: string): Op {
  const marca_normalizada = normalizeMarca(candidato);
  const slug = slugify(marca_normalizada);
  return {
    id_producto:     p.id_producto,
    nombre_producto: p.nombre_producto,
    numero_registro: p.numero_registro,
    fantasia:        p.nombre_fantasia ?? '',
    candidato,
    marca_normalizada,
    slug,
    fuente,
    marca_existente: resolverMarcaExistente(sqlite, slug),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const isApply = process.argv.includes('--apply');
  if (!isApply) log.warn('Modo DRY-RUN. Pasá --apply para ejecutar los cambios.');

  const { sqlite } = createDb();

  // 1. Traer todos los productos con marca placeholder (con o sin fantasía).
  const productos = sqlite.prepare(`
    SELECT p.id_producto, p.nombre_producto, p.nombre_fantasia, p.numero_registro
    FROM productos p
    JOIN marcas m ON m.id_marca = p.id_marca
    WHERE lower(m.nombre_marca) IN (${[...PLACEHOLDER_MARCAS].map(() => '?').join(',')})
  `).all(...PLACEHOLDER_MARCAS) as ProductoRow[];

  log.info(`Productos con marca placeholder: ${productos.length}`);

  // 2. Planificar — pasada A (heurística) y pasada B (substrings manuales).
  const ops: Op[] = [];
  const yaAsignados = new Set<number>(); // id_producto ya cubiertos
  let sin_candidato_a = 0;
  let sin_candidato_b = 0;

  // Pasada A: heurística de separadores sobre nombre_fantasia
  for (const p of productos) {
    if (!p.nombre_fantasia?.trim()) continue;
    const candidato = extractCandidato(p.nombre_fantasia);
    if (!candidato) { sin_candidato_a++; continue; }
    const op = buildOp(sqlite, p, candidato, 'heuristica');
    if (!op.slug) { sin_candidato_a++; continue; }
    ops.push(op);
    yaAsignados.add(p.id_producto);
  }

  // Pasada B: búsqueda manual por substrings en fantasia y nombre_producto
  for (const p of productos) {
    if (yaAsignados.has(p.id_producto)) continue;
    const haystack = [p.nombre_fantasia ?? '', p.nombre_producto].join(' ').toLowerCase();
    let matched = false;
    for (const [substr, nombreMarca] of MARCAS_SUBSTRING_MAP) {
      if (haystack.includes(substr.toLowerCase())) {
        const op = buildOp(sqlite, p, nombreMarca, `substring:"${substr}"`);
        if (!op.slug) continue;
        ops.push(op);
        yaAsignados.add(p.id_producto);
        matched = true;
        break;
      }
    }
    if (!matched) sin_candidato_b++;
  }

  // 3. Resumen
  const ops_a = ops.filter(o => o.fuente === 'heuristica');
  const ops_b = ops.filter(o => o.fuente !== 'heuristica');
  const ops_nueva_marca = ops.filter(o => o.marca_existente === null);

  const marcas_a_crear = new Map<string, string>();
  for (const o of ops_nueva_marca) {
    if (!marcas_a_crear.has(o.slug)) marcas_a_crear.set(o.slug, o.marca_normalizada);
  }

  log.info(
    `Fix-marcas: ${ops.length} a reasignar (A: ${ops_a.length}, B: ${ops_b.length}), ` +
    `marcas nuevas: ${marcas_a_crear.size}, sin candidato: ${sin_candidato_a + sin_candidato_b}`,
  );

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

    // Pasada C: corregir marcas sucias creadas en iteraciones anteriores
    // Cada entrada: [slug_sucio, slug_correcto]
    const MERGES_MARCAS_SUCIAS: [string, string][] = [
      ['schar-gluten-free-snackies', 'schar'],
    ];
    let merges_aplicados = 0;
    for (const [slugSucio, slugCorrect] of MERGES_MARCAS_SUCIAS) {
      const marcaSucia = sqlite.prepare(
        `SELECT id_marca FROM marcas WHERE slug = ?`,
      ).get(slugSucio) as { id_marca: number } | undefined;
      const marcaCorrecta = sqlite.prepare(
        `SELECT id_marca FROM marcas WHERE slug = ?`,
      ).get(slugCorrect) as { id_marca: number } | undefined;

      if (marcaSucia && marcaCorrecta) {
        const moved = sqlite.prepare(
          `UPDATE productos SET id_marca = ? WHERE id_marca = ?`,
        ).run(marcaCorrecta.id_marca, marcaSucia.id_marca);
        sqlite.prepare(`DELETE FROM marcas WHERE id_marca = ?`).run(marcaSucia.id_marca);
        merges_aplicados++;
        log.info(`  Merge: "${slugSucio}" → "${slugCorrect}" (${moved.changes} productos)`);
      }
    }

    log.info(`\nResultado:`);
    log.info(`  Productos reasignados: ${reasignados}`);
    log.info(`  Marcas nuevas creadas: ${marcas_creadas}`);
    log.info(`  Merges de marcas sucias: ${merges_aplicados}`);
    log.info(`  Errores:               ${errores}`);
  });

  try {
    run();
  } finally {
    sqlite.close();
  }
}

main();
