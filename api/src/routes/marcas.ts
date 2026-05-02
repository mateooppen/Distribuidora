/**
 * Rutas de marcas.
 *
 * GET /marcas
 *   q?         — filtro por nombre (LIKE %x%)
 *   sort?      — 'nombre' | 'productos'  (default 'nombre')
 *   order?     — 'asc' | 'desc'          (default 'asc')
 *   page?      — 1-based, default 1
 *   pageSize?  — default 50, máx 200
 *
 *   → { data: MarcaListItem[], total: number, page, pageSize }
 *
 * `total_productos` se calcula con LEFT JOIN + GROUP BY: incluye también
 * marcas sin productos (count = 0).
 */

import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { db } from '../db.js';

const SORT_COLUMNS = {
  nombre: 'm.nombre_marca',
  productos: 'total_productos',
} as const;
type SortKey = keyof typeof SORT_COLUMNS;

interface Querystring {
  q?: string;
  sort?: string;
  order?: string;
  page?: string;
  pageSize?: string;
}

function parseIntSafe(v: string | undefined, def: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? '', 10);
  if (!Number.isFinite(n) || n < min) return def;
  return Math.min(n, max);
}

const marcasRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /marcas/:id — usado por el combobox para resolver el nombre de
  // la marca actualmente seleccionada cuando viene desde URL/state.
  fastify.get<{ Params: { id: string } }>(
    '/marcas/:id',
    async (req, reply) => {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        reply.code(400);
        return { error: 'id inválido' };
      }

      const row = await db
        .selectFrom('marcas as m')
        .leftJoin('productos as p', 'p.id_marca', 'm.id_marca')
        .where('m.id_marca', '=', id)
        .select([
          'm.id_marca',
          'm.nombre_marca',
          sql<number>`count(p.id_producto)`.as('total_productos'),
        ])
        .groupBy(['m.id_marca', 'm.nombre_marca'])
        .executeTakeFirst();

      if (!row) {
        reply.code(404);
        return { error: 'Marca no encontrada' };
      }
      return {
        data: { ...row, total_productos: Number(row.total_productos) },
      };
    },
  );

  fastify.get<{ Querystring: Querystring }>('/marcas', async (req) => {
    const q = (req.query.q ?? '').trim();
    const sort: SortKey = (req.query.sort && req.query.sort in SORT_COLUMNS)
      ? (req.query.sort as SortKey)
      : 'nombre';
    const order = req.query.order === 'desc' ? 'desc' : 'asc';
    const page = parseIntSafe(req.query.page, 1, 1, 1_000_000);
    const pageSize = parseIntSafe(req.query.pageSize, 50, 1, 200);

    let base = db
      .selectFrom('marcas as m')
      .leftJoin('productos as p', 'p.id_marca', 'm.id_marca');

    if (q) {
      base = base.where('m.nombre_marca', 'like', `%${q}%`);
    }

    // Total de marcas (no de productos): sólo cuenta filas distintas de m.
    const totalRow = await db
      .selectFrom('marcas as m')
      .select(sql<number>`count(*)`.as('total'))
      .$if(!!q, (qb) => qb.where('m.nombre_marca', 'like', `%${q}%`))
      .executeTakeFirst();
    const total = Number(totalRow?.total ?? 0);

    const rows = await base
      .select([
        'm.id_marca',
        'm.nombre_marca',
        'm.empresa_titular',
        'm.cuit',
        'm.sitio_web',
        sql<number>`count(p.id_producto)`.as('total_productos'),
      ])
      .groupBy(['m.id_marca', 'm.nombre_marca', 'm.empresa_titular', 'm.cuit', 'm.sitio_web'])
      .orderBy(sql.ref(SORT_COLUMNS[sort]), order)
      .orderBy('m.id_marca', 'asc') // tiebreaker estable
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute();

    return {
      data: rows.map((r) => ({
        ...r,
        total_productos: Number(r.total_productos),
      })),
      total,
      page,
      pageSize,
    };
  });
};

export default marcasRoutes;
