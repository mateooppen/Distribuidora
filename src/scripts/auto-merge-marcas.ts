/**
 * Etapa 4.B — Fusión automática de marcas por reglas.
 *
 * REGLAS (en orden de precedencia):
 *
 *   1. Sub-línea: el slug de A empieza con slug de B + '-'
 *      → merge A → B (padre más cercano, no necesariamente la raíz)
 *      → orden de aplicación: hijos más profundos primero (slug más largo)
 *        para que las cadenas X-Y-Z → X-Y → X resuelvan correctamente.
 *
 *   2. Word-split: slugify(A) sin guiones === slugify(B) sin guiones
 *      Ejemplo: "Singluten" / "Sin Gluten", "Bodyvida" / "Body Vida"
 *      → merge el de menos productos hacia el de más.
 *
 *   3. Typo Lev=1, mismo primer token del slug (antes del primer '-')
 *      Ejemplo: "Alimenpes" / "Alimpenpes", "Burger King" / "Burgen King"
 *      → merge el de menos productos hacia el de más.
 *
 *   4. Typo Lev=1, distinto primer token, ≤2 productos en el origen
 *      Y primeros 4 chars del slug son iguales.
 *      Captura marcas muy menores con error tipográfico claro.
 *      → merge el de ≤2 productos hacia el otro.
 *
 *   Lev=2/3 con distinto primer token: NO se fusionan automáticamente
 *   (demasiados falsos positivos: "La Loma"/"La Joya", "Del Campo"/"Del Tambo").
 *
 * Modo de uso:
 *   npm run db:auto-merge            → dry-run
 *   npm run db:auto-merge -- --apply → ejecutar
 */

import { createDb } from '../db/connection.js';
import { levenshtein } from '../lib/levenshtein.js';
import { log } from '../lib/logger.js';

interface BrandRow {
  id_marca: number;
  nombre_marca: string;
  slug: string;
  prods: number;
}

interface MergeOp {
  regla: string;
  origen_id: number;
  origen_nombre: string;
  origen_slug: string;
  origen_prods: number;
  destino_id: number;
  destino_nombre: string;
  destino_slug: string;
  destino_prods: number;
}

function firstToken(slug: string): string {
  return slug.split('-')[0] ?? slug;
}

function sinGuiones(slug: string): string {
  return slug.replace(/-/g, '');
}

/**
 * Devuelve true si los slugs tienen la misma longitud y TODOS los caracteres
 * que difieren son dígitos en ambas posiciones.
 * Ejemplo: "base-1" vs "base-2" → true (no es un typo, son variantes numeradas).
 * Ejemplo: "burger-king" vs "burgen-king" → false (es un typo de letra).
 */
function differsByDigitOnly(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let hasDiff = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (!/\d/.test(a[i]!) || !/\d/.test(b[i]!)) return false;
      hasDiff = true;
    }
  }
  return hasDiff;
}

/** Devuelve el parent más cercano (slug más largo que sea prefijo de child + '-'). */
function closestParent(slug: string, slugMap: Map<string, BrandRow>): BrandRow | null {
  let best: BrandRow | null = null;
  let bestLen = 0;
  for (const [ps, pb] of slugMap) {
    if (ps === slug) continue;
    if (slug.startsWith(ps + '-') && ps.length > bestLen) {
      best = pb;
      bestLen = ps.length;
    }
  }
  return best;
}

function main(): void {
  const isApply = process.argv.includes('--apply');
  if (!isApply) log.warn('Modo DRY-RUN. Pasá --apply para ejecutar.');

  const { sqlite, kysely } = createDb();
  void kysely;

  const all: BrandRow[] = sqlite.prepare(
    `SELECT id_marca, nombre_marca, slug,
       (SELECT COUNT(*) FROM productos WHERE id_marca = m.id_marca) AS prods
     FROM marcas m ORDER BY slug`,
  ).all() as BrandRow[];

  log.info(`Cargadas ${all.length} marcas para análisis.`);

  const slugMap = new Map<string, BrandRow>(all.map(r => [r.slug, r]));
  const ops: MergeOp[] = [];
  const origenSlugs = new Set<string>();

  // ── REGLA 1: Sub-líneas ───────────────────────────────────────────────────
  const sublinea_ops: MergeOp[] = [];
  for (const r of all) {
    const parent = closestParent(r.slug, slugMap);
    if (!parent) continue;
    sublinea_ops.push({
      regla: 'sublinea',
      origen_id: r.id_marca, origen_nombre: r.nombre_marca, origen_slug: r.slug, origen_prods: r.prods,
      destino_id: parent.id_marca, destino_nombre: parent.nombre_marca, destino_slug: parent.slug, destino_prods: parent.prods,
    });
    origenSlugs.add(r.slug);
  }
  // Hijos más profundos primero (slug más largo) para resolver cadenas.
  sublinea_ops.sort((a, b) => b.origen_slug.length - a.origen_slug.length);
  ops.push(...sublinea_ops);

  // ── REGLAS 2–4: Typos (solo para marcas que NO son sub-líneas) ─────────────
  const typo_candidates = all.filter(r => !origenSlugs.has(r.slug));
  const groups = new Map<string, BrandRow[]>();
  for (const r of typo_candidates) {
    const key = r.slug.slice(0, 3);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const seenPairs = new Set<string>();

  for (const group of groups.values()) {
    for (let i = 0; i < group.length - 1; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (Math.abs(a.slug.length - b.slug.length) > 4) continue;

        const pairKey = [a.id_marca, b.id_marca].sort().join(':');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        // Determinar destino/origen (destino = más productos, origen = menos).
        const [origen, destino] = a.prods <= b.prods ? [a, b] : [b, a];

        const dist = levenshtein(a.slug, b.slug);
        const sameFT = firstToken(a.slug) === firstToken(b.slug);
        const wordSplit = sinGuiones(a.slug) === sinGuiones(b.slug);
        const sharedPrefix4 = a.slug.slice(0, 4) === b.slug.slice(0, 4);
        // Excluir variantes numeradas ("Base 1"/"Base 2", "Carne 3.1"/"Carne 6:1", etc.)
        const soloDigitoDifiere = differsByDigitOnly(a.slug, b.slug);

        let regla: string | null = null;

        if (wordSplit && !soloDigitoDifiere) {
          regla = 'word-split'; // regla 2
        } else if (dist === 1 && sameFT && !soloDigitoDifiere) {
          regla = 'lev1-mismo-token'; // regla 3
        } else if (dist === 1 && !sameFT && origen.prods <= 2 && sharedPrefix4 && !soloDigitoDifiere) {
          regla = 'lev1-menor-con-prefijo'; // regla 4
        }

        if (!regla) continue;

        ops.push({
          regla,
          origen_id: origen.id_marca, origen_nombre: origen.nombre_marca, origen_slug: origen.slug, origen_prods: origen.prods,
          destino_id: destino.id_marca, destino_nombre: destino.nombre_marca, destino_slug: destino.slug, destino_prods: destino.prods,
        });
        origenSlugs.add(origen.slug);
      }
    }
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  const byRegla = new Map<string, MergeOp[]>();
  for (const op of ops) {
    if (!byRegla.has(op.regla)) byRegla.set(op.regla, []);
    byRegla.get(op.regla)!.push(op);
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  RESUMEN DE FUSIONES AUTOMÁTICAS                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  for (const [regla, lista] of byRegla) {
    console.log(`\n[${regla}] — ${lista.length} fusiones`);
    const muestra = lista.slice(0, 8);
    for (const op of muestra) {
      console.log(`  "${op.origen_nombre}" (${op.origen_prods}) → "${op.destino_nombre}" (${op.destino_prods})`);
    }
    if (lista.length > 8) console.log(`  ... y ${lista.length - 8} más`);
  }
  console.log(`\nTotal: ${ops.length} fusiones`);

  if (!isApply) {
    log.info('\nDRY-RUN completo. Pasá --apply para ejecutar.');
    sqlite.close();
    return;
  }

  // ── Aplicar ───────────────────────────────────────────────────────────────
  let aplicadas = 0;
  let warnings = 0;

  const run = sqlite.transaction(() => {
    for (const op of ops) {
      // Re-fetch por slug en lugar de id (el id destino puede haber cambiado
      // si el destino fue a su vez absorbido en una op anterior de la cadena).
      const destino_actual = sqlite.prepare(
        `SELECT id_marca FROM marcas WHERE slug = ?`,
      ).get(op.destino_slug) as { id_marca: number } | undefined;

      if (!destino_actual) {
        // El destino ya no existe — puede que haya sido absorbido también.
        // Buscamos si el origen aún existe y qué id_marca tienen sus productos.
        log.debug(`Destino no encontrado: ${op.destino_slug} (posible cascada ya resuelta)`);
        warnings++;
        continue;
      }

      const origen_actual = sqlite.prepare(
        `SELECT id_marca FROM marcas WHERE slug = ?`,
      ).get(op.origen_slug) as { id_marca: number } | undefined;

      if (!origen_actual) {
        log.debug(`Origen ya no existe: ${op.origen_slug}`);
        continue;
      }

      sqlite.prepare(
        `UPDATE productos SET id_marca = ? WHERE id_marca = ?`,
      ).run(destino_actual.id_marca, origen_actual.id_marca);

      const obs_row = sqlite.prepare(
        `SELECT observaciones FROM marcas WHERE id_marca = ?`,
      ).get(destino_actual.id_marca) as { observaciones: string | null } | undefined;
      const nota = `[4.B/${op.regla}] Absorbió "${op.origen_nombre}"`;
      const nueva_obs = obs_row?.observaciones ? `${obs_row.observaciones}; ${nota}` : nota;
      sqlite.prepare(
        `UPDATE marcas SET observaciones = ? WHERE id_marca = ?`,
      ).run(nueva_obs, destino_actual.id_marca);

      sqlite.prepare(`DELETE FROM marcas WHERE id_marca = ?`).run(origen_actual.id_marca);
      aplicadas++;
    }
  });

  try {
    run();
  } finally {
    sqlite.close();
  }

  log.info(`\nFusiones aplicadas: ${aplicadas} | Warnings (destino ya absorbido): ${warnings}`);
}

main();
