/**
 * Etapa 4.B — Aplica las fusiones de marcas definidas en merge-map-sugerido.json.
 *
 * Modo de uso:
 *   npm run db:merge            → dry-run (solo imprime lo que haría)
 *   npm run db:merge -- --apply → ejecuta las fusiones en la base
 *
 * Para cada regla con accion='merge':
 *   1. Re-asigna los productos de `origen_slug` a `destino_slug`.
 *   2. Elimina la marca origen (que ya quedó sin productos).
 *   3. Anota la fusión en `observaciones` de la marca destino.
 * Reglas con accion='skip' se ignoran.
 *
 * La base de datos NO tiene columna `activo` en marcas; usamos DELETE directo
 * porque el FK en productos es ON DELETE RESTRICT, o sea si quedan productos
 * asociados el DELETE falla — eso actúa como guard de integridad.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../db/connection.js';
import { log } from '../lib/logger.js';
import type { MergeRule } from './diagnose-marcas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.resolve(__dirname, '..', '..', 'data', 'merge-map-sugerido.json');

interface MergeFile {
  instrucciones: string[];
  reglas: MergeRule[];
}

interface BrandRow {
  id_marca: number;
  nombre_marca: string;
  observaciones: string | null;
}

function main(): void {
  const isApply = process.argv.includes('--apply');
  if (!isApply) {
    log.warn('Modo DRY-RUN. Nada se va a modificar. Pasá --apply para ejecutar.');
  }

  if (!fs.existsSync(MAP_PATH)) {
    log.error(`No se encontró ${MAP_PATH}`);
    log.error('Corré primero: npm run db:diagnose');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) as MergeFile;
  const activas = raw.reglas.filter(r => r.accion === 'merge');

  if (activas.length === 0) {
    log.warn('No hay reglas con accion=merge en el JSON. Nada que hacer.');
    return;
  }
  log.info(`Reglas a ejecutar: ${activas.length} (de ${raw.reglas.length} totales).`);

  const { sqlite, kysely } = createDb();
  void kysely;

  let aplicadas = 0;
  let errores = 0;
  let origenes_no_encontrados = 0;
  let destinos_no_encontrados = 0;

  const run = sqlite.transaction(() => {
    // 0. Anotar placeholder "No Registra" (siempre, independientemente del JSON).
    const no_reg = sqlite.prepare(`SELECT id_marca FROM marcas WHERE slug = 'no-registra'`).get() as { id_marca: number } | undefined;
    if (no_reg) {
      if (!isApply) {
        log.info('[DRY-RUN] Anotaría observaciones en marca "No Registra"');
      } else {
        sqlite.prepare(
          `UPDATE marcas SET observaciones = 'Placeholder del CSV origen (ANMAT 2019): marca real desconocida. Los productos asociados requieren cruce con LIALG online en etapa 4.A.4.' WHERE id_marca = ?`,
        ).run(no_reg.id_marca);
        aplicadas++;
      }
    }

    // 1. Procesar cada regla de merge.
    for (const regla of activas) {
      const origen = sqlite.prepare(
        `SELECT id_marca, nombre_marca, observaciones FROM marcas WHERE slug = ?`,
      ).get(regla.origen_slug) as BrandRow | undefined;

      const destino = sqlite.prepare(
        `SELECT id_marca, nombre_marca, observaciones FROM marcas WHERE slug = ?`,
      ).get(regla.destino_slug) as BrandRow | undefined;

      if (!origen) {
        origenes_no_encontrados++;
        continue;
      }
      if (!destino) {
        destinos_no_encontrados++;
        errores++;
        continue;
      }

      const prods_origen = (sqlite.prepare(`SELECT COUNT(*) AS c FROM productos WHERE id_marca = ?`).get(origen.id_marca) as { c: number }).c;

      if (!isApply) {
        log.info(
          `[DRY-RUN] Fusionaría "${origen.nombre_marca}" (${prods_origen} prods) → "${destino.nombre_marca}" | motivo: ${regla.motivo}`,
        );
        continue;
      }

      try {
        sqlite.prepare(`UPDATE productos SET id_marca = ? WHERE id_marca = ?`).run(destino.id_marca, origen.id_marca);

        const nota = `[4.B] Absorbió "${origen.nombre_marca}" (${prods_origen} prods) — ${regla.motivo}`;
        const obs_actual = destino.observaciones ? destino.observaciones + '; ' + nota : nota;
        sqlite.prepare(`UPDATE marcas SET observaciones = ? WHERE id_marca = ?`).run(obs_actual, destino.id_marca);

        sqlite.prepare(`DELETE FROM marcas WHERE id_marca = ?`).run(origen.id_marca);

        aplicadas++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Error fusionando "${origen.nombre_marca}" → "${destino.nombre_marca}": ${msg}`);
        errores++;
      }
    }
  });

  try {
    run();
  } finally {
    sqlite.close();
  }

  if (isApply) {
    log.info(`Merge: ${aplicadas} fusiones aplicadas, ${errores} errores, ${origenes_no_encontrados} orígenes ya fusionados previamente, ${destinos_no_encontrados} destinos no encontrados.`);
  } else {
    log.info('DRY-RUN completo. Pasá --apply para ejecutar los cambios.');
  }
}

main();
