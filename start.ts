import fs from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DB_PATH } from './src/db/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dbIsEmpty(): boolean {
  if (!fs.existsSync(DB_PATH)) return true;
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare('SELECT COUNT(*) AS n FROM productos').get() as { n: number };
    db.close();
    return row.n === 0;
  } catch {
    return true;
  }
}

if (dbIsEmpty()) {
  console.log(`[start] DB no encontrada o vacía en ${DB_PATH}. Corriendo pipeline inicial...`);
  const result = spawnSync(
    'node',
    ['--import', 'tsx/esm', 'src/scripts/update.ts', '--apply'],
    { stdio: 'inherit', cwd: __dirname }
  );
  if (result.status !== 0) {
    console.error('[start] Pipeline falló. El servidor arrancará igual (endpoints responderán 503 hasta próxima sincronización).');
  } else {
    console.log('[start] Pipeline completado. Iniciando servidor...');
  }
} else {
  console.log(`[start] DB encontrada en ${DB_PATH}. Iniciando servidor...`);
}

const server = spawn(
  'node',
  ['--import', 'tsx/esm', 'api/src/server.ts'],
  { stdio: 'inherit', cwd: __dirname }
);

server.on('exit', (code) => process.exit(code ?? 0));
