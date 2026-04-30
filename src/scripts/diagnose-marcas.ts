/**
 * Etapa 4.B — Diagnóstico de marcas duplicadas o problemáticas.
 *
 * Genera 3 categorías de hallazgos:
 *   1. placeholders — marcas sentinela como "No Registra"
 *   2. siglas       — "Arcor S.A." coexiste con "Arcor" (alta confianza → auto-merge sugerido)
 *   3. sublineas    — "Sancor Yogs" ⊂ "Sancor" (informativo → el usuario decide)
 *   4. typos        — Levenshtein ≤ umbral entre slugs de longitud similar (media confianza)
 *
 * Salidas:
 *   - Reporte en stdout.
 *   - data/merge-map-sugerido.json → editarlo y pasarlo a apply-merge.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../db/connection.js';
import { levenshtein } from '../lib/levenshtein.js';
import { log } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '..', '..', 'data', 'merge-map-sugerido.json');

// Sufijos de sigla en forma slug (de más largo a más corto: orden importa).
const SIGLA_SUFFIXES = [
  '-s-a-i-c-f-i-a', '-s-a-c-i-f-i-a', '-s-a-i-c-a', '-s-a-i-c-f',
  '-s-a-c-i-f', '-s-a-c-i', '-s-a-i-c', '-s-a-u', '-s-a-s',
  '-s-r-l', '-s-c-a', '-s-c-s', '-s-h', '-s-a',
];

// Nombres que sabemos que son placeholders del origen.
const PLACEHOLDER_SLUGS = new Set(['no-registra', 'no-aplica', 'sin-marca', 'no-data']);

interface BrandRow {
  id_marca: number;
  nombre_marca: string;
  slug: string;
  prods: number;
}

export interface MergeRule {
  accion: 'merge' | 'skip';
  categoria: 'sigla' | 'sublinea' | 'typo' | 'placeholder';
  confianza: 'alta' | 'media' | 'baja';
  origen_slug: string;
  origen_nombre: string;
  origen_prods: number;
  destino_slug: string;
  destino_nombre: string;
  destino_prods: number;
  motivo: string;
}

/** Detecta si el slug termina en un sufijo de sigla conocido y devuelve el slug base. */
function stripSiglaSuffix(slug: string): string | null {
  for (const suf of SIGLA_SUFFIXES) {
    if (slug.endsWith(suf) && slug.length - suf.length >= 2) {
      return slug.slice(0, -suf.length);
    }
  }
  return null;
}

/** Umbral de Levenshtein aceptable según la longitud del slug más corto. */
function levThreshold(minLen: number): number {
  if (minLen <= 4) return 1;
  if (minLen <= 10) return 2;
  return 3;
}

function printTable(titulo: string, rows: Record<string, unknown>[]): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(` ${titulo}`);
  console.log('═'.repeat(60));
  if (rows.length === 0) { console.log(' (sin hallazgos)'); return; }
  const cols = Object.keys(rows[0] ?? {});
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const header = cols.map((c, i) => c.padEnd(widths[i] ?? c.length)).join(' | ');
  const sep    = widths.map(w => '-'.repeat(w)).join('-+-');
  console.log(' ' + header);
  console.log(' ' + sep);
  for (const r of rows) {
    console.log(' ' + cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i] ?? 0)).join(' | '));
  }
}

function main(): void {
  const { sqlite, kysely } = createDb({ readonly: true });
  void kysely;

  const all: BrandRow[] = sqlite.prepare(
    `SELECT id_marca, nombre_marca, slug,
       (SELECT COUNT(*) FROM productos WHERE id_marca = m.id_marca) AS prods
     FROM marcas m ORDER BY slug`,
  ).all() as BrandRow[];

  log.info(`Cargadas ${all.length} marcas para análisis.`);

  const slugMap = new Map<string, BrandRow>(all.map(r => [r.slug, r]));
  const rules: MergeRule[] = [];

  // ── 1. Placeholders ────────────────────────────────────────────────────────
  const placeholders = all.filter(r => PLACEHOLDER_SLUGS.has(r.slug));
  printTable('1. PLACEHOLDERS (no se fusionan — anotados para revisión)', placeholders.map(r => ({
    nombre: r.nombre_marca, slug: r.slug, productos: r.prods,
    nota: 'Marcar observaciones en marcas; cruzar con LIALG online en etapa 4.A.4',
  })));

  // ── 2. Siglas (alta confianza) ─────────────────────────────────────────────
  const sigla_rows: Record<string, unknown>[] = [];
  for (const r of all) {
    const base = stripSiglaSuffix(r.slug);
    if (!base) continue;
    const destino = slugMap.get(base);
    if (!destino || destino.id_marca === r.id_marca) continue;
    sigla_rows.push({
      origen: r.nombre_marca, prods_orig: r.prods,
      destino: destino.nombre_marca, prods_dest: destino.prods,
    });
    // La regla siempre es: origen=con sigla, destino=sin sigla (nombre más limpio).
    rules.push({
      accion: 'merge',
      categoria: 'sigla',
      confianza: 'alta',
      origen_slug: r.slug,
      origen_nombre: r.nombre_marca,
      origen_prods: r.prods,
      destino_slug: destino.slug,
      destino_nombre: destino.nombre_marca,
      destino_prods: destino.prods,
      motivo: `variante de sigla societaria: "${r.nombre_marca}" → "${destino.nombre_marca}"`,
    });
  }
  printTable('2. SIGLAS — alta confianza (se incluyen en merge-map-sugerido con accion=merge)', sigla_rows);

  // ── 3. Sub-líneas (informativo) ────────────────────────────────────────────
  // Criterio: slug de A empieza con slug de B + '-', Y B tiene ≥ 2x más productos que A.
  const sublinea_rows: Record<string, unknown>[] = [];
  const sigla_origenes = new Set(rules.map(r => r.origen_slug));
  for (const r of all) {
    if (sigla_origenes.has(r.slug)) continue;
    for (const padre of all) {
      if (padre.id_marca === r.id_marca) continue;
      if (!r.slug.startsWith(padre.slug + '-')) continue;
      if (padre.prods < 2) continue;
      sublinea_rows.push({
        sub_marca: r.nombre_marca, prods_sub: r.prods,
        posible_padre: padre.nombre_marca, prods_padre: padre.prods,
      });
      rules.push({
        accion: 'skip',   // por defecto no fusionar — el usuario decide
        categoria: 'sublinea',
        confianza: 'baja',
        origen_slug: r.slug,
        origen_nombre: r.nombre_marca,
        origen_prods: r.prods,
        destino_slug: padre.slug,
        destino_nombre: padre.nombre_marca,
        destino_prods: padre.prods,
        motivo: `slug "${r.slug}" tiene como prefijo a "${padre.slug}"`,
      });
    }
  }
  printTable('3. SUB-LÍNEAS — informativo (en merge-map-sugerido con accion=skip; cambiar a merge si querés fusionar)', sublinea_rows.slice(0, 30));
  if (sublinea_rows.length > 30) console.log(` ... y ${sublinea_rows.length - 30} más (ver JSON)`);

  // ── 4. Typos — Levenshtein ─────────────────────────────────────────────────
  // Agrupamos por los primeros 3 caracteres del slug para reducir comparaciones.
  const groups = new Map<string, BrandRow[]>();
  for (const r of all) {
    if (sigla_origenes.has(r.slug)) continue;
    const key = r.slug.slice(0, 3);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const typo_rows: Record<string, unknown>[] = [];
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

        const dist = levenshtein(a.slug, b.slug);
        const threshold = levThreshold(Math.min(a.slug.length, b.slug.length));
        if (dist === 0 || dist > threshold) continue;

        // La marca con más productos es el "destino" sugerido.
        const [origen, destino] = a.prods >= b.prods ? [b, a] : [a, b];
        typo_rows.push({
          marca_a: a.nombre_marca, prods_a: a.prods,
          marca_b: b.nombre_marca, prods_b: b.prods,
          distancia: dist,
        });
        rules.push({
          accion: 'skip',   // media confianza: el usuario revisa antes de fusionar
          categoria: 'typo',
          confianza: 'media',
          origen_slug: origen.slug,
          origen_nombre: origen.nombre_marca,
          origen_prods: origen.prods,
          destino_slug: destino.slug,
          destino_nombre: destino.nombre_marca,
          destino_prods: destino.prods,
          motivo: `Levenshtein(slug_a, slug_b) = ${dist}`,
        });
      }
    }
  }
  printTable('4. POSIBLES TYPOS — media confianza (en merge-map-sugerido con accion=skip; verificar manualmente)', typo_rows.slice(0, 30));
  if (typo_rows.length > 30) console.log(` ... y ${typo_rows.length - 30} más (ver JSON)`);

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(' RESUMEN');
  console.log('═'.repeat(60));
  console.log(` Placeholders encontrados:    ${placeholders.length}`);
  console.log(` Pares por sigla (alta conf): ${sigla_rows.length}`);
  console.log(` Sub-líneas detectadas:       ${sublinea_rows.length}`);
  console.log(` Posibles typos:              ${typo_rows.length}`);
  console.log(` Total reglas en JSON:        ${rules.length}`);
  console.log(` Reglas accion=merge:         ${rules.filter(r => r.accion === 'merge').length}`);
  console.log(` Reglas accion=skip:          ${rules.filter(r => r.accion === 'skip').length}`);

  // ── Export JSON ───────────────────────────────────────────────────────────
  const output = {
    instrucciones: [
      "Revisá este archivo y para cada regla con accion='skip' decidí:",
      "  - Si querés fusionar: cambiá a accion='merge'.",
      "  - Si no querés hacer nada: dejalo en 'skip' o borrá la entrada.",
      "Los de confianza='alta' (sigla) están listos para ejecutar.",
      "Luego corré: npm run db:merge (dry-run) o npm run db:merge -- --apply",
    ],
    reglas: rules,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  log.info(`\nArchivo generado: ${OUT_PATH}`);
  log.info(`Editá las reglas con accion='skip' que quieras convertir a 'merge' y luego corré:`);
  log.info(`  npm run db:merge          (dry-run)`);
  log.info(`  npm run db:merge -- --apply  (ejecutar)`);

  sqlite.close();
}

main();
