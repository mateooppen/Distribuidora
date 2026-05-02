/**
 * Endpoints de soporte para los filtros del dashboard.
 *
 * GET /filtros/marcas
 *   q?      — filtro por nombre (LIKE %x%)
 *   limit?  — default 30, máx 200
 *
 *   Sin q: devuelve top-N marcas ordenadas por cantidad de productos (desc).
 *   Con q: devuelve matches del nombre, también ordenados por cantidad.
 *   Pensado para popular un combobox con autocomplete.
 */

import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { db } from '../db.js';

const filtrosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { q?: string; limit?: string } }>(
    '/filtros/marcas',
    async (req) => {
      const q = (req.query.q ?? '').trim();
      const limitRaw = Number.parseInt(req.query.limit ?? '', 10);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 200)
        : 30;

      let query = db
        .selectFrom('marcas as m')
        .leftJoin('productos as p', 'p.id_marca', 'm.id_marca')
        .select([
          'm.id_marca',
          'm.nombre_marca',
          sql<number>`count(p.id_producto)`.as('total_productos'),
        ])
        .groupBy(['m.id_marca', 'm.nombre_marca']);

      if (q) {
        query = query.where('m.nombre_marca', 'like', `%${q}%`);
      }

      const data = await query
        .orderBy('total_productos', 'desc')
        .orderBy('m.nombre_marca', 'asc')
        .limit(limit)
        .execute();

      return {
        data: data.map((r) => ({
          ...r,
          total_productos: Number(r.total_productos),
        })),
      };
    },
  );
};

export default filtrosRoutes;
