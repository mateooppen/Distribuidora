import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { createDb } from '../db/connection.js';
import { log } from '../lib/logger.js';
import { cleanText, normalizeMarca, slugify } from '../lib/normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.resolve(__dirname, '..', '..', 'data', 'alg.csv');

interface FilaCsv {
  marca: string;
  nombre_fantasia: string;
  denominacion: string;
  rnpa: string;
}

interface Stats {
  filas_leidas: number;
  marcas_creadas: number;
  marcas_reusadas: number;
  productos_creados: number;
  presentaciones_creadas: number;
  verificaciones_creadas: number;
  duplicados_origen: number;
  sin_registro: number;
  errores: number;
}

function mapearColumnas(raw: Record<string, unknown>): Pick<FilaCsv, 'marca' | 'nombre_fantasia' | 'denominacion' | 'rnpa'> | null {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    norm[slugify(k)] = typeof v === 'string' ? v : v == null ? '' : String(v);
  }
  const marca          = norm['marca'] ?? norm['nombre-marca'] ?? '';
  const nombre_fantasia = norm['nombre-fantasia'] ?? norm['fantasia'] ?? '';
  const denominacion   = norm['denominacion'] ?? norm['producto'] ?? '';
  const rnpa           = norm['rnpa'] ?? norm['n-rnpa'] ?? '';
  if (!marca && !rnpa && !denominacion) return null;
  return { marca, nombre_fantasia, denominacion, rnpa };
}

function main(): void {
  if (!fs.existsSync(CSV_PATH)) {
    log.error(`No se encontró el CSV en ${CSV_PATH}`);
    process.exit(1);
  }

  let texto = fs.readFileSync(CSV_PATH, 'utf8');
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  if (/Ã[©±¡³¼¨]/.test(texto)) {
    log.warn('Detectado mojibake utf8/latin1; re-leyendo como latin1');
    texto = fs.readFileSync(CSV_PATH, 'latin1');
  }

  const primera_linea = texto.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primera_linea.match(/;/g) || []).length > (primera_linea.match(/,/g) || []).length ? ';' : ',';
  log.info(`Parseando CSV con separador "${sep}"`);

  const filas_raw = parse(texto, {
    columns: true, delimiter: sep, skip_empty_lines: true, trim: true,
    relax_column_count: true, relax_quotes: true,
  }) as Record<string, unknown>[];

  log.info(`Filas leídas del CSV: ${filas_raw.length}`);

  const { kysely, sqlite } = createDb();
  const stats: Stats = {
    filas_leidas: filas_raw.length, marcas_creadas: 0, marcas_reusadas: 0,
    productos_creados: 0, presentaciones_creadas: 0, verificaciones_creadas: 0,
    duplicados_origen: 0, sin_registro: 0, errores: 0,
  };

  const cache_marca_id = new Map<string, number>();
  const rnpas_vistos = new Set<string>();

  const run = sqlite.transaction(() => {
    for (let i = 0; i < filas_raw.length; i++) {
      const raw = filas_raw[i];
      if (!raw) continue;
      const fila = mapearColumnas(raw);
      if (!fila) { stats.errores++; log.warn(`Fila ${i + 1}: no pude mapear columnas`); continue; }

      const marca_norm    = normalizeMarca(fila.marca);
      const denominacion  = cleanText(fila.denominacion);
      const nombre_fantasia = cleanText(fila.nombre_fantasia);
      const rnpa          = cleanText(fila.rnpa);

      if (!rnpa) { stats.sin_registro++; continue; }
      if (rnpas_vistos.has(`RNPA::${rnpa}`)) { stats.duplicados_origen++; continue; }
      rnpas_vistos.add(`RNPA::${rnpa}`);

      try {
        const slug_marca = slugify(marca_norm) || 'sin-marca';
        let id_marca = cache_marca_id.get(slug_marca);
        if (id_marca === undefined) {
          const existente = sqlite.prepare(`SELECT id_marca FROM marcas WHERE slug = ?`).get(slug_marca) as { id_marca: number } | undefined;
          if (existente) { id_marca = existente.id_marca; stats.marcas_reusadas++; }
          else {
            const ins = sqlite.prepare(`INSERT INTO marcas (nombre_marca, slug, pais_origen) VALUES (?, ?, 'AR')`).run(marca_norm || '(sin marca)', slug_marca);
            id_marca = Number(ins.lastInsertRowid);
            stats.marcas_creadas++;
          }
          cache_marca_id.set(slug_marca, id_marca);
        } else { stats.marcas_reusadas++; }

        const ins_prod = sqlite.prepare(
          `INSERT INTO productos (id_marca, nombre_producto, nombre_fantasia, tipo_registro, numero_registro, estado_certificacion, observaciones) VALUES (?, ?, ?, 'RNPA', ?, 'vigente', ?)`
        ).run(id_marca, denominacion ?? '(sin denominación)', nombre_fantasia, rnpa, 'Importado desde dataset ANMAT 2019 (datos.gob.ar)');
        const id_producto = Number(ins_prod.lastInsertRowid);
        stats.productos_creados++;

        const ins_pres = sqlite.prepare(`INSERT INTO presentaciones (id_producto, disponibilidad) VALUES (?, 'desconocida')`).run(id_producto);
        const id_presentacion = Number(ins_pres.lastInsertRowid);
        stats.presentaciones_creadas++;

        sqlite.prepare(`INSERT INTO verificaciones (id_presentacion, tipo, fuente, resultado, observaciones) VALUES (?, 'alta', 'ANMAT_CSV', 'ok', ?)`).run(id_presentacion, 'Alta inicial desde dataset ANMAT 2019 (datos.gob.ar)');
        stats.verificaciones_creadas++;
      } catch (err) {
        stats.errores++;
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Fila ${i + 1}: error al insertar (rnpa=${rnpa}): ${msg}`);
      }
    }
  });

  try { run(); } finally { void kysely.destroy(); sqlite.close(); }

  log.info('====== RESUMEN DE IMPORTACIÓN ======');
  log.info(`Filas leídas:           ${stats.filas_leidas}`);
  log.info(`Marcas creadas:         ${stats.marcas_creadas}`);
  log.info(`Marcas reusadas:        ${stats.marcas_reusadas}`);
  log.info(`Productos creados:      ${stats.productos_creados}`);
  log.info(`Presentaciones creadas: ${stats.presentaciones_creadas}`);
  log.info(`Verificaciones creadas: ${stats.verificaciones_creadas}`);
  log.info(`Duplicados en origen:   ${stats.duplicados_origen}`);
  log.info(`Filas sin RNPA:         ${stats.sin_registro}`);
  log.info(`Errores:                ${stats.errores}`);
}

main();
