/**
 * Etapa 4.A.4 — Sincronización de la DB con el listado LIALG actual.
 *
 * Lee data/lialg-actual.json (generado por scrape-lialg.ts) y cruza con la
 * base de datos para:
 *   1. Actualizar estado_certificacion de productos existentes.
 *   2. Insertar productos nuevos (presentes en LIALG pero no en nuestra DB).
 *   3. Registrar verificaciones para cada cambio detectado.
 *
 * Uso:
 *   npm run db:sync             → dry-run (muestra cambios sin aplicar)
 *   npm run db:sync -- --apply  → aplica los cambios
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../db/connection.js';
import { slugify, normalizeMarca } from '../lib/normalize.js';
import { log } from '../lib/logger.js';
import type { ProductoLialg } from './scrape-lialg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = path.resolve(__dirname, '..', '..', 'data', 'lialg-actual.json');

// ── Estado mapping ────────────────────────────────────────────────────────────

type DbEstado = 'vigente' | 'baja_permanente' | 'baja_provisoria' | 'en_tramite' | 'desconocido';

function mapEstado(raw: string): DbEstado {
  const s = raw.trim().toUpperCase();
  if (s === 'VIGENTE')         return 'vigente';
  if (s.includes('PERMANENTE')) return 'baja_permanente';
  if (s.includes('PROVISORIA')) return 'baja_provisoria';
  if (s.includes('TRAMITE'))    return 'en_tramite';
  return 'desconocido';
}

// ── DB row types ──────────────────────────────────────────────────────────────

interface ProductoRow {
  id_producto: number;
  id_marca: number;
  nombre_producto: string;
  nombre_fantasia: string | null;
  numero_registro: string;
  estado_certificacion: string;
}

interface MarcaRow {
  id_marca: number;
}

interface PresentacionRow {
  id_presentacion: number;
}

// ── Contadores ────────────────────────────────────────────────────────────────

interface Stats {
  encontrados: number;
  sin_cambio: number;
  estado_actualizado: number;
  nuevos_insertados: number;
  rnpa_invalido: number;
  errores: number;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const isApply = process.argv.includes('--apply');
  if (!isApply) log.warn('Modo DRY-RUN. Pasá --apply para ejecutar los cambios.');

  if (!fs.existsSync(INPUT_PATH)) {
    log.error(`No existe ${INPUT_PATH}. Ejecutá primero: npm run db:scrape -- --save`);
    process.exit(1);
  }

  const scraped: ProductoLialg[] = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  log.info(`Cargados ${scraped.length} productos del JSON scrapeado.`);

  const { sqlite, kysely } = createDb();
  void kysely;

  const stats: Stats = {
    encontrados: 0, sin_cambio: 0, estado_actualizado: 0,
    nuevos_insertados: 0, rnpa_invalido: 0, errores: 0,
  };

  // Operaciones planificadas.
  const ops_update: Array<{
    id_producto: number;
    id_presentacion: number;
    estado_anterior: string;
    estado_nuevo: DbEstado;
    nombre_producto: string;
    rnpa: string;
  }> = [];

  const ops_insert: Array<{
    scraped: ProductoLialg;
    estado: DbEstado;
  }> = [];

  // ── Fase 1: análisis ──────────────────────────────────────────────────────

  for (const item of scraped) {
    if (!item.rnpa || item.rnpa.trim() === '') {
      stats.rnpa_invalido++;
      continue;
    }

    const rnpa = item.rnpa.trim();
    const estado_nuevo = mapEstado(item.estado);

    const row = sqlite.prepare(
      `SELECT p.id_producto, p.id_marca, p.nombre_producto, p.nombre_fantasia,
              p.numero_registro, p.estado_certificacion,
              pr.id_presentacion
       FROM productos p
       JOIN presentaciones pr ON pr.id_producto = p.id_producto
       WHERE p.tipo_registro = 'RNPA' AND p.numero_registro = ?
       LIMIT 1`,
    ).get(rnpa) as (ProductoRow & { id_presentacion: number }) | undefined;

    if (row) {
      stats.encontrados++;
      if (row.estado_certificacion === estado_nuevo) {
        stats.sin_cambio++;
      } else {
        ops_update.push({
          id_producto:     row.id_producto,
          id_presentacion: row.id_presentacion,
          estado_anterior: row.estado_certificacion,
          estado_nuevo,
          nombre_producto: row.nombre_producto,
          rnpa,
        });
      }
    } else {
      ops_insert.push({ scraped: item, estado: estado_nuevo });
    }
  }

  // ── Resumen ───────────────────────────────────────────────────────────────

  const updates_baja = ops_update.filter(o =>
    o.estado_nuevo === 'baja_permanente' || o.estado_nuevo === 'baja_provisoria',
  );
  const updates_otros = ops_update.filter(o =>
    o.estado_nuevo !== 'baja_permanente' && o.estado_nuevo !== 'baja_provisoria',
  );

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  RESUMEN DE SINCRONIZACIÓN LIALG                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\nProductos en JSON scrapeado:       ${scraped.length}`);
  console.log(`Encontrados en DB (por RNPA):      ${stats.encontrados}`);
  console.log(`  Sin cambio de estado:             ${stats.sin_cambio}`);
  console.log(`  Con cambio de estado:             ${ops_update.length}`);
  console.log(`    → Bajas (permanente/provisoria): ${updates_baja.length}`);
  console.log(`    → Otros cambios:                 ${updates_otros.length}`);
  console.log(`No encontrados en DB (nuevos):     ${ops_insert.length}`);
  console.log(`RNPAs vacíos/inválidos:            ${stats.rnpa_invalido}`);

  if (ops_update.length > 0) {
    console.log('\n[Muestra de cambios de estado — primeras 10]:');
    for (const o of ops_update.slice(0, 10)) {
      console.log(
        `  RNPA ${o.rnpa}: "${o.nombre_producto}" | ${o.estado_anterior} → ${o.estado_nuevo}`,
      );
    }
    if (ops_update.length > 10) console.log(`  ... y ${ops_update.length - 10} más`);
  }

  if (ops_insert.length > 0) {
    console.log('\n[Muestra de productos nuevos — primeros 10]:');
    for (const o of ops_insert.slice(0, 10)) {
      console.log(
        `  RNPA ${o.scraped.rnpa}: "${o.scraped.denominacion}" [${o.scraped.marca}] (${o.estado})`,
      );
    }
    if (ops_insert.length > 10) console.log(`  ... y ${ops_insert.length - 10} más`);
  }

  if (!isApply) {
    log.info('\nDRY-RUN completo. Pasá --apply para ejecutar los cambios.');
    sqlite.close();
    return;
  }

  // ── Fase 2: aplicar ───────────────────────────────────────────────────────

  const run = sqlite.transaction(() => {
    // 2a. Actualizar estados.
    for (const o of ops_update) {
      try {
        sqlite.prepare(
          `UPDATE productos SET estado_certificacion = ? WHERE id_producto = ?`,
        ).run(o.estado_nuevo, o.id_producto);

        const resultado = (o.estado_nuevo === 'baja_permanente' || o.estado_nuevo === 'baja_provisoria')
          ? 'baja_detectada' : 'desactualizado';

        sqlite.prepare(
          `INSERT INTO verificaciones
             (id_presentacion, tipo, fuente, resultado, campo_modificado, valor_anterior, valor_nuevo, observaciones)
           VALUES (?, 'cambio', 'ANMAT_ONLINE', ?, 'estado_certificacion', ?, ?, ?)`,
        ).run(
          o.id_presentacion,
          resultado,
          o.estado_anterior,
          o.estado_nuevo,
          `Sincronización LIALG ${new Date().toISOString().slice(0, 10)}`,
        );

        stats.estado_actualizado++;
      } catch (err) {
        stats.errores++;
        log.error(`Error actualizando RNPA ${o.rnpa}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // 2b. Insertar productos nuevos.
    for (const o of ops_insert) {
      try {
        const rnpa = o.scraped.rnpa.trim();
        const marca_norm  = normalizeMarca(o.scraped.marca);
        const slug_marca  = slugify(marca_norm) || 'sin-marca';
        const denominacion = o.scraped.denominacion.trim() || '(sin denominación)';
        const nombre_fantasia = o.scraped.nombre_fantasia.trim() || null;

        // Buscar o crear marca.
        let id_marca: number;
        const marcaExist = sqlite.prepare(
          `SELECT id_marca FROM marcas WHERE slug = ?`,
        ).get(slug_marca) as MarcaRow | undefined;

        if (marcaExist) {
          id_marca = marcaExist.id_marca;
        } else {
          const ins = sqlite.prepare(
            `INSERT INTO marcas (nombre_marca, slug, pais_origen) VALUES (?, ?, 'AR')`,
          ).run(marca_norm || '(sin marca)', slug_marca);
          id_marca = Number(ins.lastInsertRowid);
        }

        // Insertar producto.
        const ins_prod = sqlite.prepare(
          `INSERT INTO productos
             (id_marca, nombre_producto, nombre_fantasia, tipo_registro, numero_registro,
              estado_certificacion, observaciones)
           VALUES (?, ?, ?, 'RNPA', ?, ?, 'Importado desde LIALG online')`,
        ).run(id_marca, denominacion, nombre_fantasia, rnpa, o.estado);
        const id_producto = Number(ins_prod.lastInsertRowid);

        // Insertar presentación.
        const ins_pres = sqlite.prepare(
          `INSERT INTO presentaciones (id_producto, disponibilidad) VALUES (?, 'desconocida')`,
        ).run(id_producto);
        const id_presentacion = Number(ins_pres.lastInsertRowid);

        // Insertar verificación de alta.
        sqlite.prepare(
          `INSERT INTO verificaciones
             (id_presentacion, tipo, fuente, resultado, observaciones)
           VALUES (?, 'alta', 'ANMAT_ONLINE', 'ok', ?)`,
        ).run(
          id_presentacion,
          `Alta desde scraping LIALG ${new Date().toISOString().slice(0, 10)}`,
        );

        stats.nuevos_insertados++;
      } catch (err) {
        stats.errores++;
        log.error(
          `Error insertando RNPA ${o.scraped.rnpa}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  });

  try {
    run();
  } finally {
    sqlite.close();
  }

  log.info(`\nSincronización completada:`);
  log.info(`  Estados actualizados:  ${stats.estado_actualizado}`);
  log.info(`  Productos nuevos:      ${stats.nuevos_insertados}`);
  log.info(`  Errores:               ${stats.errores}`);
}

main();
