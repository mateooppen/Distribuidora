import { openSqlite } from '../db/connection.js';
import { log } from '../lib/logger.js';

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS sync_runs (
  id_sync_run         INTEGER PRIMARY KEY,
  iniciado_en         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finalizado_en       TEXT,
  estado              TEXT NOT NULL DEFAULT 'en_curso'
    CHECK (estado IN ('en_curso','ok','error')),
  productos_nuevos    INTEGER NOT NULL DEFAULT 0,
  productos_actualizados INTEGER NOT NULL DEFAULT 0,
  marcas_fusionadas   INTEGER NOT NULL DEFAULT 0,
  duracion_seg        REAL,
  error_mensaje       TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

const CREATE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_sync_runs_iniciado ON sync_runs(iniciado_en);
`;

function main(): void {
  const db = openSqlite();
  try {
    const existe = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='sync_runs'`
    ).get()) as { name: string } | undefined;

    if (existe) {
      log.info('La tabla sync_runs ya existe, nada que hacer.');
      return;
    }

    db.exec(CREATE_TABLE);
    db.exec(CREATE_INDEX);
    log.info('Tabla sync_runs creada correctamente.');
  } finally {
    db.close();
  }
}

main();
