import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqlite, DB_PATH } from '../db/connection.js';
import { log } from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '..', 'db', 'schema.sql');

function main(): void {
  const db_dir = path.dirname(DB_PATH);
  if (!fs.existsSync(db_dir)) fs.mkdirSync(db_dir, { recursive: true });

  const stale = [DB_PATH, `${DB_PATH}-journal`, `${DB_PATH}-wal`, `${DB_PATH}-shm`];
  for (const f of stale) {
    if (fs.existsSync(f)) { fs.unlinkSync(f); log.info(`Borrado archivo previo: ${path.basename(f)}`); }
  }

  if (!fs.existsSync(SCHEMA_PATH)) {
    log.error(`No se encontró schema.sql en ${SCHEMA_PATH}`);
    process.exit(1);
  }
  const schema_sql = fs.readFileSync(SCHEMA_PATH, 'utf8');

  const sqlite = openSqlite();
  try {
    sqlite.exec(schema_sql);
    log.info(`Base creada en ${DB_PATH}`);

    const tables   = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[];
    const indexes  = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as { name: string }[];
    const triggers = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name`).all() as { name: string }[];
    const views    = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`).all() as { name: string }[];

    log.info(`Tablas (${tables.length}): ${tables.map(t => t.name).join(', ')}`);
    log.info(`Índices (${indexes.length}): ${indexes.map(i => i.name).join(', ')}`);
    log.info(`Triggers (${triggers.length}): ${triggers.map(t => t.name).join(', ')}`);
    log.info(`Vistas (${views.length}): ${views.map(v => v.name).join(', ')}`);
    log.info(`Aptitudes seed: ${(sqlite.prepare(`SELECT COUNT(*) AS c FROM aptitudes`).get() as { c: number }).c} filas`);
  } finally {
    sqlite.close();
  }
}

main();
