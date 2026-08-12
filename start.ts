/**
 * Entry point de producción.
 *
 * Verifica que la base exista y levanta el servidor. Nada más.
 *
 * Antes, si no encontraba la base, corría el pipeline completo acá mismo. Ya no:
 * la base se genera en GitHub Actions y el build la descarga como release asset
 * (ver scripts/fetch-db.mjs). Correr el scrape al arranque significaría demorar
 * ~20 minutos en levantar y acumular ~35.500 productos en memoria dentro de un
 * contenedor de 512 MB — con riesgo de morir por falta de memoria.
 *
 * Si la base falta, el servidor arranca igual: la API responde 503 en los
 * endpoints de datos, que es un modo degradado honesto y diagnosticable. La
 * solución en ese caso es correr el workflow "Actualizar base de datos".
 */

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env['DB_PATH'] ?? path.resolve(__dirname, 'db', 'lialg.db');

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
  console.error(`[start] ADVERTENCIA: no hay base de datos utilizable en ${DB_PATH}.`);
  console.error('[start] Los endpoints de datos van a responder 503.');
  console.error('[start] Para resolverlo: correr el workflow "Actualizar base de datos"');
  console.error('[start] desde la pestaña Actions del repositorio. Eso genera la base,');
  console.error('[start] la publica y dispara un deploy nuevo que la descarga.');
} else {
  console.log(`[start] DB encontrada en ${DB_PATH}. Iniciando servidor...`);
}

const server = spawn(
  'node',
  ['--import', 'tsx/esm', 'api/src/server.ts'],
  { stdio: 'inherit', cwd: __dirname }
);

server.on('exit', (code) => process.exit(code ?? 0));
