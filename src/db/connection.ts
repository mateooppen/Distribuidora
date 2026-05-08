import Database from 'better-sqlite3';
import fs from 'node:fs';
import { Kysely, SqliteDialect } from 'kysely';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DB_PATH = process.env['DB_PATH'] ?? path.resolve(__dirname, '..', '..', 'db', 'lialg.db');

export interface OpenOptions {
  readonly?: boolean;
  filename?: string;
}

export function openSqlite(options: OpenOptions = {}): Database.Database {
  const filename = options.filename ?? DB_PATH;
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(filename, { readonly: options.readonly ?? false });
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  return sqlite;
}

export function createDb(options: OpenOptions = {}): { kysely: Kysely<DB>; sqlite: Database.Database } {
  const sqlite = openSqlite(options);
  const kysely = new Kysely<DB>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  return { kysely, sqlite };
}
