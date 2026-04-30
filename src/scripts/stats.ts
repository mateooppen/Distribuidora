import { createDb } from '../db/connection.js';

interface Row { [k: string]: unknown; }

function imprimirTabla(titulo: string, rows: Row[]): void {
  console.log(`\n=== ${titulo} ===`);
  if (rows.length === 0) { console.log('(sin filas)'); return; }
  const cols = Object.keys(rows[0] ?? {});
  console.log(cols.join(' | '));
  console.log(cols.map(() => '---').join(' | '));
  for (const r of rows) console.log(cols.map(c => String(r[c] ?? '')).join(' | '));
}

function main(): void {
  const { sqlite, kysely } = createDb({ readonly: true });
  try {
    const tablas = ['categorias','marcas','productos','aptitudes','producto_aptitudes','presentaciones','verificaciones'];
    imprimirTabla('Conteo por tabla', tablas.map(t => ({ tabla: t, filas: (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c })));

    imprimirTabla('Top 20 marcas por cantidad de productos',
      sqlite.prepare(`SELECT m.nombre_marca, COUNT(p.id_producto) AS productos FROM marcas m LEFT JOIN productos p ON p.id_marca = m.id_marca GROUP BY m.id_marca ORDER BY productos DESC, m.nombre_marca ASC LIMIT 20`).all() as Row[]);

    imprimirTabla('Productos por estado_certificacion',
      sqlite.prepare(`SELECT estado_certificacion, COUNT(*) AS productos FROM productos GROUP BY estado_certificacion ORDER BY productos DESC`).all() as Row[]);

    imprimirTabla('Productos sin categoría asignada',
      [sqlite.prepare(`SELECT COUNT(*) AS productos FROM productos WHERE id_categoria IS NULL`).get() as Row]);

    imprimirTabla('RNPAs por longitud',
      sqlite.prepare(`SELECT length(numero_registro) AS longitud, COUNT(*) AS productos FROM productos WHERE tipo_registro = 'RNPA' GROUP BY longitud ORDER BY longitud`).all() as Row[]);

    imprimirTabla('Marcas: con CUIT vs sin CUIT',
      [sqlite.prepare(`SELECT SUM(CASE WHEN cuit IS NOT NULL THEN 1 ELSE 0 END) AS con_cuit, SUM(CASE WHEN cuit IS NULL THEN 1 ELSE 0 END) AS sin_cuit FROM marcas`).get() as Row]);

    imprimirTabla('Marcas con nombre < 3 caracteres',
      sqlite.prepare(`SELECT id_marca, nombre_marca, slug FROM marcas WHERE length(nombre_marca) < 3 ORDER BY id_marca LIMIT 50`).all() as Row[]);

    imprimirTabla('Productos con nombre < 3 caracteres',
      sqlite.prepare(`SELECT id_producto, id_marca, nombre_producto, numero_registro FROM productos WHERE length(nombre_producto) < 3 ORDER BY id_producto LIMIT 50`).all() as Row[]);

    imprimirTabla('RNPAs duplicados en productos (debería estar vacío)',
      sqlite.prepare(`SELECT numero_registro, COUNT(*) AS apariciones FROM productos WHERE tipo_registro = 'RNPA' GROUP BY numero_registro HAVING COUNT(*) > 1 LIMIT 50`).all() as Row[]);
  } finally {
    void kysely.destroy();
    sqlite.close();
  }
}

main();
