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

  const run = sqlite.transaction(() => {
    // 0. Anotar placeholder "No Registra" (siempre, independientemente del JSON).
    const no_reg = sqlite.prepare(`SELECT id_marca FROM marcas WHERE slug = 'no-registra'`).get() as { id_marca: number } | undefined;
    if (no_reg) {
      if (!isApply) {
        log.info('[DRY-RUN] Anotaría observaciones en marca "No Registra" (id=%d)', no_reg.id_marca);
      } else {
        sqlite.prepare(
          `UPDATE marcas SET observaciones = 'Placeholder del CSV origen (ANMAT 2019): marca real desconocida. Los productos asociados requieren cruce con LIALG online en etapa 4.A.4.' WHERE id_marca = ?`,
        ).run(no_reg.id_marca);
        log.info('Marcada como placeholder: "No Registra" (id=%d, %d productos)', no_reg.id_marca, 499);
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
        log.warn(`Origen no encontrado: slug="${regla.origen_slug}" — puede haberse fusionado antes.`);
        continue;
      }
      if (!destino) {
        log.warn(`Destino no encontrado: slug="${regla.destino_slug}"`);
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
        // Re-asignar productos.
        sqlite.prepare(`UPDATE productos SET id_marca = ? WHERE id_marca = ?`).run(destino.id_marca, origen.id_marca);

        // Anotar en la marca destino que absorbió a origen.
        const nota = `[4.B] Absorbió "${origen.nombre_marca}" (${prods_origen} prods) — ${regla.motivo}`;
        const obs_actual = destino.observaciones ? destino.observaciones + '; ' + nota : nota;
        sqlite.prepare(`UPDATE marcas SET observaciones = ? WHERE id_marca = ?`).run(obs_actual, destino.id_marca);

        // Eliminar marca origen (ya sin productos; FK RESTRICT lo protege si algo falló).
        sqlite.prepare(`DELETE FROM marcas WHERE id_marca = ?`).run(origen.id_marca);

        log.info(`Fusionada: "${origen.nombre_marca}" (${prods_origen} prods) → "${destino.nombre_marca}"`);
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
    log.info(`\nResumen: ${aplicadas} acciones aplicadas, ${errores} errores.`);
    if (errores > 0) log.warn('Revisá los errores — la transacción pudo haber hecho rollback parcial.');
  } else {
    log.info('\nDRY-RUN completo. Pasá --apply para ejecutar los cambios.');
  }
}

main();
