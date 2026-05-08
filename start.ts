import fs from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env['DB_PATH'] ?? path.resolve(__dirname, 'db', 'lialg.db');

function dbIsEmpty(): boolean {
  if (!fs.existsSync(DB_PATH)) return true;
  const stat = fs.statSync(DB_PATH);
  return stat.size < 1024;
}

if (dbIsEmpty()) {
  console.log(`[start] DB no encontrada o vacía en ${DB_PATH}. Corriendo pipeline inicial...`);
  const result = spawnSync(
    'node',
    ['--import', 'tsx/esm', 'src/scripts/update.ts', '--apply'],
    { stdio: 'inherit', cwd: __dirname }
  );
  if (result.status !== 0) {
    console.error('[start] Pipeline falló. Abortando.');
    process.exit(1);
  }
  console.log('[start] Pipeline completado. Iniciando servidor...');
} else {
  console.log(`[start] DB encontrada en ${DB_PATH}. Iniciando servidor...`);
}

const server = spawn(
  'node',
  ['--import', 'tsx/esm', 'api/src/server.ts'],
  { stdio: 'inherit', cwd: __dirname }
);

server.on('exit', (code) => process.exit(code ?? 0));
