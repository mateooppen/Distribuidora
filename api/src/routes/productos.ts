/**
 * Rutas de productos.
 *
 * GET /productos
 *   q?         — texto libre (LIKE %x% en nombre_producto, nombre_fantasia,
 *                              numero_registro y nombre_marca)
 *   marca?     — id_marca exacto
 *   estado?    — estado_certificacion exacto
 *   categoria? — slug de categoría (acepta slug de padre o de hija;
 *                 si es padre, incluye productos de todas sus hijas)
 *   sort?      — 'nombre' | 'marca'  (default 'nombre')
 *   order?     — 'asc' | 'desc'      (default 'asc')
 *   page?      — 1-based, default 1
 *   pageSize?  — default 50, máx 200
 *
 *   → { data: ProductoListItem[], total: number, page, pageSize }
 *
 * Limpieza de datos: nombre_fantasia con valores placeholder
 * ("No registra", "-", etc.) se devuelven como null.
 */

import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { db } from '../db.js';
import { parseFiltros, whereFiltros } from '../lib/filtros-productos.js';
import { cleanFantasia } from '../lib/nombre-producto.js';

// ── Constantes de validación ──────────────────────────────────────────────

// Claves de ordenamiento aceptadas. La expresión SQL real se elige en .orderBy() abajo.
//   relevancia → cercanía al término buscado (ver más abajo). Requiere `q`.
//   nombre     → ordena por nombre_fantasia (o nombre_producto si está vacío)
//   marca      → ordena por nombre de la marca
const SORT_COLUMNS = {
  relevancia: true,
  nombre: true,
  marca: true,
} as const;
type SortKey = keyof typeof SORT_COLUMNS;

// ── Helpers de parsing ────────────────────────────────────────────────────

function parseIntSafe(v: string | undefined, def: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? '', 10);
  if (!Number.isFinite(n) || n < min) return def;
  return Math.min(n, max);
}

interface Querystring {
  q?: string;
  marca?: string;
  estado?: string;
  categoria?: string;
  sort?: string;
  order?: string;
  page?: string;
  pageSize?: string;
}

// Resuelve un slug de categoría → lista de id_categoria a filtrar.
// ── Route ─────────────────────────────────────────────────────────────────

const productosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: Querystring }>('/productos', async (req) => {
    // Los filtros se parsean y se aplican con la misma lógica que usan los
    // endpoints de facetas, para que los desplegables nunca ofrezcan opciones
    // sin resultados (ver lib/filtros-productos.ts).
    const filtros = await parseFiltros(req.query);
    const q = filtros.q ?? '';

    const sort: SortKey = (req.query.sort && req.query.sort in SORT_COLUMNS)
      ? (req.query.sort as SortKey)
      : 'nombre';
    const order = req.query.order === 'desc' ? 'desc' : 'asc';

    const page = parseIntSafe(req.query.page, 1, 1, 1_000_000);
    const pageSize = parseIntSafe(req.query.pageSize, 50, 1, 200);

    // Base query (con joins). Inmutable en Kysely → reusable para count + data.
    // Los alias `p` y `m` son los que esperan las condiciones compartidas.
    // Acá no se excluye ninguna faceta: el listado sí aplica todos los filtros.
    const base = db
      .selectFrom('productos as p')
      .innerJoin('marcas as m', 'm.id_marca', 'p.id_marca')
      .where(whereFiltros(filtros));

    // Count
    const countRow = await base
      .select(sql<number>`count(*)`.as('total'))
      .executeTakeFirst();
    const total = Number(countRow?.total ?? 0);

    // Expresión del nombre visible: fantasía si existe, si no la denominación.
    // COLLATE NOCASE para alfabético case-insensitive en SQLite.
    const nombreExpr = sql`COALESCE(NULLIF(TRIM(p.nombre_fantasia), ''), p.nombre_producto) COLLATE NOCASE`;

    // Data
    let dataQuery = base.select([
      'p.id_producto',
      'p.nombre_producto',
      'p.nombre_fantasia',
      'p.numero_registro',
      'p.estado_certificacion',
      'p.updated_at',
      'm.id_marca',
      'm.nombre_marca',
    ]);

    // ── Orden por relevancia ─────────────────────────────────────────────
    // ANMAT no usa nombre_producto como denominación corta sino como
    // descripción larga de composición (66 caracteres en promedio, hasta 369).
    // Por eso buscar "harina de arroz" devuelve tanto los productos que SON
    // harina de arroz como los cientos que la llevan entre sus ingredientes:
    //
    //   "Harina de arroz – Libre de gluten"                        ← es
    //   "Premezcla a base de fécula de mandioca y harina de arroz" ← contiene
    //
    // Lo que los separa es la POSICIÓN del término, no el campo: la
    // denominación arranca con lo que el producto es y recién después enumera
    // la composición. De ahí que el primer criterio sea "empieza con".
    //
    // Es ordenamiento, no filtro: no se oculta ningún resultado, solo se
    // ordena para que lo buscado quede primero.
    if (sort === 'relevancia' && q) {
      const empiezaCon = `${q}%`;
      const contiene = `%${q}%`;
      dataQuery = dataQuery.orderBy(
        sql<number>`CASE
          WHEN p.nombre_producto LIKE ${empiezaCon} THEN 0
          WHEN TRIM(COALESCE(p.nombre_fantasia, '')) <> '' AND p.nombre_fantasia LIKE ${empiezaCon} THEN 1
          WHEN m.nombre_marca LIKE ${contiene} OR p.numero_registro LIKE ${contiene} THEN 2
          ELSE 3
        END`,
        'asc',
      );
    }

    const rows = await dataQuery
      .orderBy(sort === 'marca' ? sql`m.nombre_marca COLLATE NOCASE` : nombreExpr, order)
      .orderBy('p.id_producto', 'asc') // tiebreaker estable para paginación
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();

    return {
      data: rows.map((r) => ({
        ...r,
        nombre_fantasia: cleanFantasia(r.nombre_fantasia),
      })),
      total,
      page,
      pageSize,
    };
  });

  // ── GET /productos/:id — detalle completo ──────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/productos/:id',
    async (req, reply) => {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        reply.code(400);
        return { error: 'id inválido' };
      }

      // 1. Producto + marca
      const baseRow = await db
        .selectFrom('productos as p')
        .innerJoin('marcas as m', 'm.id_marca', 'p.id_marca')
        .where('p.id_producto', '=', id)
        .select([
          'p.id_producto',
          'p.nombre_producto',
          'p.nombre_fantasia',
          'p.descripcion',
          'p.ingredientes',
          'p.info_nutricional',
          'p.vida_util_dias',
          'p.condiciones_conservacion',
          'p.tipo_registro',
          'p.numero_registro',
          'p.fecha_alta_registro',
          'p.estado_certificacion',
          'p.observaciones',
          'p.created_at',
          'p.updated_at',
          'p.id_marca',
          'p.id_categoria',
          'm.nombre_marca',
          'm.empresa_titular',
          'm.cuit',
          'm.sitio_web',
          'm.certificadora',
        ])
        .executeTakeFirst();

      if (!baseRow) {
        reply.code(404);
        return { error: 'Producto no encontrado' };
      }

      // 2. Categoría (con nombre del padre si tiene)
      const categoria =
        baseRow.id_categoria === null
          ? null
          : await db
              .selectFrom('categorias as c')
              .leftJoin('categorias as cp', 'cp.id_categoria', 'c.id_padre')
              .where('c.id_categoria', '=', baseRow.id_categoria)
              .select([
                'c.id_categoria',
                'c.nombre',
                'c.slug',
                'cp.nombre as padre_nombre',
              ])
              .executeTakeFirst();

      // 3. Presentaciones
      const presentaciones = await db
        .selectFrom('presentaciones')
        .where('id_producto', '=', id)
        .select([
          'id_presentacion',
          'codigo_interno',
          'ean_13',
          'formato',
          'unidad_medida',
          'contenido_neto',
          'unidades_por_bulto',
          'dimensiones_bulto',
          'peso_bulto_kg',
          'disponibilidad',
          'foto_url',
          'fecha_ultima_actualizacion',
        ])
        .orderBy('id_presentacion', 'asc')
        .execute();

      // 4. Aptitudes
      const aptitudes = await db
        .selectFrom('producto_aptitudes as pa')
        .innerJoin('aptitudes as a', 'a.id_aptitud', 'pa.id_aptitud')
        .where('pa.id_producto', '=', id)
        .select(['a.id_aptitud', 'a.codigo', 'a.nombre', 'a.descripcion', 'pa.fuente'])
        .orderBy('a.nombre', 'asc')
        .execute();

      // 5. Verificaciones (a través de las presentaciones del producto)
      const presIds = presentaciones.map((p) => p.id_presentacion);
      const verificaciones =
        presIds.length === 0
          ? []
          : await db
              .selectFrom('verificaciones')
              .where('id_presentacion', 'in', presIds)
              .select([
                'id_verificacion',
                'id_presentacion',
                'fecha',
                'tipo',
                'fuente',
                'resultado',
                'campo_modificado',
                'valor_anterior',
                'valor_nuevo',
                'observaciones',
              ])
              .orderBy('fecha', 'desc')
              .orderBy('id_verificacion', 'desc')
              .limit(10)
              .execute();

      return {
        data: {
          id_producto: baseRow.id_producto,
          nombre_producto: baseRow.nombre_producto,
          nombre_fantasia: cleanFantasia(baseRow.nombre_fantasia),
          descripcion: baseRow.descripcion,
          ingredientes: baseRow.ingredientes,
          info_nutricional: baseRow.info_nutricional,
          vida_util_dias: baseRow.vida_util_dias,
          condiciones_conservacion: baseRow.condiciones_conservacion,
          tipo_registro: baseRow.tipo_registro,
          numero_registro: baseRow.numero_registro,
          fecha_alta_registro: baseRow.fecha_alta_registro,
          estado_certificacion: baseRow.estado_certificacion,
          observaciones: baseRow.observaciones,
          created_at: baseRow.created_at,
          updated_at: baseRow.updated_at,
          marca: {
            id_marca: baseRow.id_marca,
            nombre_marca: baseRow.nombre_marca,
            empresa_titular: baseRow.empresa_titular,
            cuit: baseRow.cuit,
            sitio_web: baseRow.sitio_web,
            certificadora: baseRow.certificadora,
          },
          categoria: categoria ?? null,
          presentaciones,
          aptitudes,
          verificaciones,
        },
      };
    },
  );
};

export default productosRoutes;
