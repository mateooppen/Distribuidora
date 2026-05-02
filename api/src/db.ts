/**
 * Conexión readonly a db/lialg.db.
 *
 * Variante simplificada de src/db/connection.ts: solo readonly, sin opciones.
 * Reusa las definiciones de tipos de Kysely importándolas directamente
 * desde la estructura existente en src/db/types.ts.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { DB } from '../../src/db/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// api/src/db.ts → ../../db/lialg.db
const DB_PATH = path.resolve(__dirname, '..', '..', 'db', 'lialg.db');

export const sqlite = new Database(DB_PATH, { readonly: true });
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('journal_mode = WAL');

export const db = new Kysely<DB>({
  dialect: new SqliteDialect({ database: sqlite }),
});

export type { DB } from '../../src/db/types.js';
