/**
 * Endpoints específicos del dashboard de inicio.
 *
 * GET /dashboard/resumen             → totales globales (un solo round-trip)
 * GET /dashboard/categorias-jerarquia → árbol de categorías padre+hijas con
 *                                       conteo de productos por nodo.
 *                                       Para padres, el conteo incluye los
 *                                       productos asignados a sus hijas.
 */

import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { db, sqlite } from '../db.js';

interface CategoriaNode {
  id_categoria: number;
  id_padre: number | null;
  nombre: string;
  slug: string;
  orden: number;
  total_productos: number;
  hijos: CategoriaNode[];
}

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Totales globales ─────────────────────────────────────────────────
  fastify.get('/dashboard/resumen', async () => {
    const [productos, marcas, categorias] = await Promise.all([
      db.selectFrom('productos').select(sql<number>`count(*)`.as('c')).executeTakeFirst(),
      db.selectFrom('marcas').select(sql<number>`count(*)`.as('c')).executeTakeFirst(),
      db.selectFrom('categorias').select(sql<number>`count(*)`.as('c')).executeTakeFirst(),
    ]);

    return {
      productos: Number(productos?.c ?? 0),
      marcas: Number(marcas?.c ?? 0),
      categorias: Number(categorias?.c ?? 0),
    };
  });

  // ── Categorías en árbol con conteos ─────────────────────────────────
  fastify.get('/dashboard/categorias-jerarquia', async () => {
    // Una sola query: para cada categoría, suma sus productos directos
    // + los productos de sus hijas (si tiene). Usar SQL crudo es más claro
    // que componer subqueries con Kysely.
    const rows = sqlite.prepare(
      `SELECT
         c.id_categoria,
         c.id_padre,
         c.nombre,
         c.slug,
         c.orden,
         (
           SELECT COUNT(*) FROM productos p
           WHERE p.id_categoria = c.id_categoria
              OR p.id_categoria IN (SELECT id_categoria FROM categorias WHERE id_padre = c.id_categoria)
         ) AS total_productos
       FROM categorias c
       ORDER BY c.orden ASC, c.nombre ASC`,
    ).all() as Array<{
      id_categoria: number;
      id_padre: number | null;
      nombre: string;
      slug: string;
      orden: number;
      total_productos: number;
    }>;

    const byId = new Map<number, CategoriaNode>();
    for (const r of rows) {
      byId.set(r.id_categoria, { ...r, hijos: [] });
    }

    const roots: CategoriaNode[] = [];
    for (const r of rows) {
      const node = byId.get(r.id_categoria)!;
      if (r.id_padre === null) roots.push(node);
      else byId.get(r.id_padre)?.hijos.push(node);
    }

    return { data: roots };
  });
};

export default dashboardRoutes;
