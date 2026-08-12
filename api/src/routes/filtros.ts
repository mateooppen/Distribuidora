/**
 * Endpoints de soporte para los filtros (búsqueda facetada).
 *
 * Ambos aceptan el contexto de filtrado actual y devuelven solo valores que
 * tienen resultados dentro de ese contexto: buscando "harina de arroz", el
 * desplegable de marcas ofrece únicamente las marcas que la producen, no las
 * 4.951 del padrón.
 *
 * Cada faceta se excluye de su propio cálculo (ver lib/filtros-productos.ts),
 * así el usuario siempre puede saltar de una marca a otra sin limpiar antes.
 *
 * GET /filtros/marcas
 *   nombre?  — autocomplete sobre el nombre de la marca (LIKE %x%)
 *   limit?   — default 30, máx 200
 *   q?, categoria?, estado?  — contexto de filtrado (`marca` se ignora acá)
 *   Devuelve marcas con al menos un producto en contexto, ordenadas por
 *   cantidad descendente. `total_productos` es el conteo EN CONTEXTO, no el
 *   total histórico de la marca.
 *
 * GET /filtros/categorias
 *   q?, marca?, estado?  — contexto de filtrado (`categoria` se ignora acá)
 *   Devuelve las 36 categorías (planas, con id_padre) con su conteo en
 *   contexto. Se devuelven todas, incluso con conteo 0: el frontend arma el
 *   árbol y decide qué esconder, porque una categoría padre sin productos
 *   propios puede tener hijas que sí tienen.
 */

import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { db } from '../db.js';
import { parseFiltros, whereFiltros } from '../lib/filtros-productos.js';

interface QsMarcas {
  nombre?: string;
  limit?: string;
  q?: string;
  categoria?: string;
  estado?: string;
}

interface QsCategorias {
  q?: string;
  marca?: string;
  estado?: string;
}

const filtrosRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Marcas ───────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: QsMarcas }>('/filtros/marcas', async (req) => {
    const nombre = (req.query.nombre ?? '').trim();

    const limitRaw = Number.parseInt(req.query.limit ?? '', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, 200)
      : 30;

    const filtros = await parseFiltros(req.query);

    // innerJoin (no left): una marca sin productos en contexto no es una
    // opción válida de filtro, así que no debe aparecer.
    let query = db
      .selectFrom('marcas as m')
      .innerJoin('productos as p', 'p.id_marca', 'm.id_marca')
      .select([
        'm.id_marca',
        'm.nombre_marca',
        sql<number>`count(p.id_producto)`.as('total_productos'),
      ])
      .where(whereFiltros(filtros, 'marca'))
      .groupBy(['m.id_marca', 'm.nombre_marca']);

    if (nombre) {
      query = query.where('m.nombre_marca', 'like', `%${nombre}%`);
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
  });

  // ── Categorías ───────────────────────────────────────────────────────────
  fastify.get<{ Querystring: QsCategorias }>('/filtros/categorias', async (req) => {
    const filtros = await parseFiltros(req.query);
    const w = whereFiltros(filtros, 'categoria');

    // Subconsulta correlacionada en vez de JOIN + GROUP BY: así se devuelven
    // las 36 categorías siempre, con conteo 0 las que no aplican. Con un JOIN
    // las vacías desaparecerían de la salida y el frontend no podría dibujar
    // un padre cuyas hijas sí tienen resultados.
    const data = await db
      .selectFrom('categorias as c')
      .select([
        'c.id_categoria',
        'c.id_padre',
        'c.nombre',
        'c.slug',
        'c.orden',
        sql<number>`(
          SELECT COUNT(*)
          FROM productos p
          JOIN marcas m ON m.id_marca = p.id_marca
          WHERE p.id_categoria = c.id_categoria AND ${w}
        )`.as('total_productos'),
      ])
      .orderBy('c.orden', 'asc')
      .orderBy('c.nombre', 'asc')
      .execute();

    return {
      data: data.map((r) => ({
        ...r,
        total_productos: Number(r.total_productos),
      })),
    };
  });
};

export default filtrosRoutes;
