/**
 * Pipeline unificado de actualización de datos LIALG.
 *
 * Ejecuta en orden:
 *   1. db:scrape    — descarga el listado actualizado de ANMAT
 *   2. db:sync      — sincroniza productos nuevos y cambios de estado
 *   3. db:fix-marcas — normaliza marcas "No Registra"
 *   4. db:merge     — fusiona marcas duplicadas según merge-map-sugerido.json
 *   5. db:categorize — (re)categoriza productos sin categoría
 *
 * Registra el resultado en la tabla sync_runs.
 *
 * Uso:
 *   npm run db:update             → dry-run (ningún paso escribe en la DB)
 *   npm run db:update -- --apply  → ejecuta todos los pasos
 *   npm run db:update -- --desde sync  → arranca desde el paso sync (saltea scrape)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqlite, DB_PATH } from '../db/connection.js';
import { log } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.resolve(__dirname, '..', 'db', 'schema.sql');

const isApply = process.argv.includes('--apply');
const desdeIdx = process.argv.indexOf('--desde');
const desdeStep = desdeIdx !== -1 ? process.argv[desdeIdx + 1] : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function initializeDbIfNeeded(): void {
  if (fs.existsSync(DB_PATH)) return;

  log.info('Base de datos no encontrada. Inicializando esquema...');

  if (!fs.existsSync(SCHEMA_PATH)) {
    log.error(`No se encontró schema.sql en ${SCHEMA_PATH}`);
    process.exit(1);
  }

  const schema_sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const db = openSqlite();
  try {
    db.exec(schema_sql);
    log.info(`Base de datos inicializada en ${DB_PATH}`);
  } finally {
    db.close();
  }
}

function snapshot(campo: string): number {
  const db = openSqlite({ readonly: true });
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${campo}`).get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

function snapshotMarcas(): number {
  return snapshot('marcas');
}

function snapshotProductos(): number {
  return snapshot('productos');
}

function correrPaso(
  nombre: string,
  script: string,
  args: string[],
): { ok: boolean; duracion_ms: number } {
  const t0 = Date.now();
  const etiqueta = `[${nombre}]`;

  if (!isApply) {
    log.info(`${etiqueta} DRY-RUN — se ejecutaría: tsx ${script} ${args.filter(a => a !== '--apply').join(' ')}`);
    return { ok: true, duracion_ms: 0 };
  }

  log.info(`${etiqueta} Iniciando...`);

  const resultado = spawnSync('node', ['--import', 'tsx/esm', script, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });

  const duracion_ms = Date.now() - t0;

  if (resultado.status !== 0) {
    log.error(`${etiqueta} Falló con código ${resultado.status ?? 'null'} (${(duracion_ms / 1000).toFixed(1)}s)`);
    return { ok: false, duracion_ms };
  }

  log.info(`${etiqueta} OK (${(duracion_ms / 1000).toFixed(1)}s)`);
  return { ok: true, duracion_ms };
}

function debeCorrer(paso: string): boolean {
  if (!desdeStep) return true;
  const orden = ['scrape', 'sync', 'fix-marcas', 'merge', 'categorize'];
  const desdePos = orden.indexOf(desdeStep);
  const pasoPos  = orden.indexOf(paso);
  return desdePos === -1 || pasoPos >= desdePos;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  initializeDbIfNeeded();

  if (!isApply) {
    log.warn('Modo DRY-RUN. Pasá --apply para ejecutar los cambios.');
  }

  const t_inicio = Date.now();

  // Snapshots antes de empezar
  const productos_antes  = isApply ? snapshotProductos() : 0;
  const marcas_antes     = isApply ? snapshotMarcas()    : 0;

  let id_sync_run: number | null = null;
  let error_mensaje: string | null = null;

  // Registrar inicio en sync_runs
  if (isApply) {
    const db = openSqlite();
    try {
      const ins = db.prepare(
        `INSERT INTO sync_runs (estado) VALUES ('en_curso')`
      ).run();
      id_sync_run = Number(ins.lastInsertRowid);
      log.info(`Sync run #${id_sync_run} iniciado.`);
    } finally {
      db.close();
    }
  }

  // ── Pasos del pipeline ────────────────────────────────────────────────────

  const pasos: Array<{
    id: string;
    nombre: string;
    script: string;
    args: string[];
  }> = [
    {
      id: 'scrape',
      nombre: 'Scrape ANMAT',
      script: 'src/scripts/scrape-lialg.ts',
      args: ['--save', '--force'],
    },
    {
      id: 'sync',
      nombre: 'Sync DB',
      script: 'src/scripts/sync-lialg.ts',
      args: ['--apply'],
    },
    {
      id: 'fix-marcas',
      nombre: 'Fix marcas',
      script: 'src/scripts/fix-marcas-no-registra.ts',
      args: ['--apply'],
    },
    {
      id: 'merge',
      nombre: 'Merge marcas',
      script: 'src/scripts/apply-merge.ts',
      args: ['--apply'],
    },
    {
      id: 'categorize',
      nombre: 'Categorizar',
      script: 'src/scripts/categorize.ts',
      args: ['--apply'],
    },
  ];

  let duracion_total_ms = 0;

  for (const paso of pasos) {
    if (!debeCorrer(paso.id)) {
      log.info(`[${paso.nombre}] Salteado (--desde ${desdeStep})`);
      continue;
    }

    const { ok, duracion_ms } = correrPaso(paso.nombre, paso.script, paso.args);
    duracion_total_ms += duracion_ms;

    if (!ok) {
      error_mensaje = `Falló en el paso "${paso.nombre}"`;
      break;
    }
  }

  // ── Estadísticas finales ──────────────────────────────────────────────────

  const duracion_seg = duracion_total_ms / 1000;
  const productos_nuevos      = isApply ? Math.max(0, snapshotProductos() - productos_antes) : 0;
  const marcas_fusionadas     = isApply ? Math.max(0, marcas_antes - snapshotMarcas())       : 0;
  const estado: 'ok' | 'error' = error_mensaje ? 'error' : 'ok';

  if (isApply) {
    log.info(`Update ${estado}: productos nuevos: ${productos_nuevos}, marcas fusionadas: ${marcas_fusionadas}, duración: ${duracion_seg.toFixed(1)}s${error_mensaje ? ` — ERROR: ${error_mensaje}` : ''}`);
  } else {
    log.info('DRY-RUN completado. Ningún dato fue modificado. Ejecutá con --apply para aplicar los cambios.');
  }

  // Actualizar sync_runs con resultado
  if (isApply && id_sync_run !== null) {
    const db = openSqlite();
    try {
      db.prepare(`
        UPDATE sync_runs SET
          finalizado_en          = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
          estado                 = ?,
          productos_nuevos       = ?,
          marcas_fusionadas      = ?,
          duracion_seg           = ?,
          error_mensaje          = ?
        WHERE id_sync_run = ?
      `).run(estado, productos_nuevos, marcas_fusionadas, duracion_seg, error_mensaje, id_sync_run);
      log.info(`Sync run #${id_sync_run} registrado como "${estado}".`);
    } finally {
      db.close();
    }
  }

  if (error_mensaje) process.exit(1);
}

main().catch(err => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
