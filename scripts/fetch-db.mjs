/**
 * Descarga la base de datos publicada como release asset de GitHub.
 *
 * POR QUÉ EXISTE
 * --------------
 * La generación de la base (scrape de ANMAT + normalización + categorización)
 * tarda ~20 minutos. Antes corría como último paso del build, lo que hacía que
 * cualquier deploy de código —cambiar un filtro, sacar un botón— costara esos
 * 20 minutos y regenerara datos que no habían cambiado.
 *
 * Ahora son dos procesos independientes:
 *
 *   Generar la base   → .github/workflows/actualizar-base.yml (semanal)
 *                       corre el pipeline y publica db/lialg.db como release.
 *   Deployar código   → el build baja ese archivo ya hecho. Segundos.
 *
 * COMPORTAMIENTO
 * --------------
 * Si db/lialg.db ya existe localmente, no hace nada. Eso protege la base de
 * desarrollo: correr `npm run build` en tu máquina no te la pisa con la de
 * producción. En Render el contenedor arranca limpio, así que siempre descarga.
 *
 * El repositorio es público, por lo que el asset se descarga sin autenticación.
 * Si alguna vez pasa a privado, hay que agregar un token al request.
 *
 * CONFIGURACIÓN
 * -------------
 * Se puede sobreescribir el origen con variables de entorno:
 *   DB_RELEASE_REPO  (default: mateooppen/Distribuidora)
 *   DB_RELEASE_TAG   (default: base-datos)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(REPO_ROOT, 'db', 'lialg.db');

const REPO = process.env['DB_RELEASE_REPO'] ?? 'mateooppen/Distribuidora';
const TAG = process.env['DB_RELEASE_TAG'] ?? 'base-datos';
const URL = `https://github.com/${REPO}/releases/download/${TAG}/lialg.db`;

function log(msg) {
  console.log(`[fetch-db] ${msg}`);
}

if (fs.existsSync(DB_PATH)) {
  const mb = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1);
  log(`La base ya existe (${mb} MB). No se descarga nada.`);
  process.exit(0);
}

log(`Descargando desde ${URL}`);

const res = await fetch(URL, { redirect: 'follow' });

if (!res.ok) {
  console.error(`[fetch-db] ERROR: el servidor respondió ${res.status} ${res.statusText}.`);
  console.error('');
  console.error('  Causa más probable: el release todavía no existe.');
  console.error('  Se crea corriendo el workflow "Actualizar base de datos"');
  console.error('  desde la pestaña Actions del repositorio (Run workflow).');
  console.error('  Ese workflow genera la base, la publica y dispara el deploy.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
await fs.promises.writeFile(DB_PATH, Buffer.from(await res.arrayBuffer()));

const mb = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1);
log(`Listo: ${mb} MB en ${DB_PATH}`);
