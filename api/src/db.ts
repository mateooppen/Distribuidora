/**
 * Conexión readonly a lialg.db.
 *
 * La ruta se resuelve en este orden:
 *   1. Variable de entorno DB_PATH (usado en producción → /data/lialg.db)
 *   2. db/lialg.db relativo a la raíz del repo (desarrollo local)
 *
 * Si el archivo no existe el servidor arranca igual pero los endpoints
 * devuelven 503 hasta que la DB esté disponible.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { DB } from '../../src/db/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '..', '..', 'db', 'lialg.db');
export const DB_PATH = process.env['DB_PATH'] ?? DEFAULT_DB_PATH;

function openDb(): { sqlite: Database.Database; db: Kysely<DB> } | null {
  if (!fs.existsSync(DB_PATH)) return null;
  const sqlite = new Database(DB_PATH, { readonly: true });
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  const db = new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) });
  return { sqlite, db };
}

const conn = openDb();

if (!conn) {
  console.warn(`[db] DB no encontrada en ${DB_PATH}. Los endpoints devolverán 503.`);
}

// Proxy que lanza 503 si la DB no está disponible
function makeProxy<T extends object>(): T {
  return new Proxy({} as T, {
    get: () => {
      throw Object.assign(new Error(`DB no disponible (${DB_PATH})`), { statusCode: 503 });
    },
  });
}

export const sqlite: Database.Database = conn?.sqlite ?? makeProxy();
export const db: Kysely<DB> = conn?.db ?? makeProxy();
export type { DB } from '../../src/db/types.js';
