/**
 * Lógica compartida de filtrado de productos.
 *
 * POR QUÉ EXISTE
 * --------------
 * Tres consultas distintas necesitan aplicar exactamente los mismos filtros:
 *
 *   /productos           → el listado en sí
 *   /filtros/marcas      → qué marcas ofrecer, dado lo ya filtrado
 *   /filtros/categorias  → qué categorías ofrecer, dado lo ya filtrado
 *
 * Si cada una armara su propio WHERE, alcanzaría con tocar una sola para que
 * los desplegables empiecen a ofrecer opciones que no devuelven resultados.
 * Acá vive la definición única.
 *
 * BÚSQUEDA FACETADA
 * -----------------
 * Los desplegables muestran únicamente valores con resultados dentro de lo que
 * ya está filtrado. La regla, que evita dejar al usuario encerrado:
 *
 *   Cada faceta se calcula con todos los filtros activos MENOS el propio.
 *
 * Si el desplegable de marcas se filtrara también por la marca ya elegida,
 * mostraría solo esa y no habría forma de saltar a otra sin limpiar primero.
 * De ahí el parámetro `excepto`.
 *
 * REQUISITO DE LOS ALIAS
 * ----------------------
 * Las condiciones se escriben como SQL crudo referenciando `p` (productos) y
 * `m` (marcas). Toda consulta que las use tiene que declarar esos alias.
 */

import { sql } from 'kysely';
import { db } from '../db.js';
import type { EstadoCertificacion } from '../../../src/db/types.js';

export const VALID_ESTADOS: readonly EstadoCertificacion[] = [
  'vigente',
  'baja_permanente',
  'baja_provisoria',
  'en_tramite',
  'desconocido',
];

/** Faceta que se excluye del propio cálculo. */
export type Faceta = 'marca' | 'categoria';

export interface FiltrosProducto {
  q: string | null;
  marcaId: number | null;
  /** null = sin filtro. Array vacío = slug inexistente, no debe matchear nada. */
  categoriaIds: number[] | null;
  estado: EstadoCertificacion | null;
}

export interface QuerystringFiltros {
  q?: string;
  marca?: string;
  categoria?: string;
  estado?: string;
}

/**
 * Resuelve un slug de categoría a los ids que abarca.
 * Si es categoría padre incluye sus hijas, para que filtrar por "Lácteos"
 * traiga también "Quesos" y "Yogures". Si es hoja, devuelve solo su id.
 * Slug inexistente → array vacío (el llamador debe forzar resultado vacío).
 */
export async function resolveCategoriaIds(slug: string): Promise<number[]> {
  const cat = await db
    .selectFrom('categorias')
    .where('slug', '=', slug)
    .select(['id_categoria'])
    .executeTakeFirst();
  if (!cat) return [];

  const hijas = await db
    .selectFrom('categorias')
    .where('id_padre', '=', cat.id_categoria)
    .select(['id_categoria'])
    .execute();

  return [cat.id_categoria, ...hijas.map((h) => h.id_categoria)];
}

/** Parsea y valida los filtros que vienen por querystring. */
export async function parseFiltros(
  query: QuerystringFiltros,
): Promise<FiltrosProducto> {
  const q = (query.q ?? '').trim() || null;

  const marcaRaw = Number.parseInt(query.marca ?? '', 10);
  const marcaId = Number.isFinite(marcaRaw) && marcaRaw > 0 ? marcaRaw : null;

  const estadoRaw = query.estado;
  const estado =
    estadoRaw && (VALID_ESTADOS as readonly string[]).includes(estadoRaw)
      ? (estadoRaw as EstadoCertificacion)
      : null;

  const categoriaSlug = (query.categoria ?? '').trim() || null;
  const categoriaIds = categoriaSlug
    ? await resolveCategoriaIds(categoriaSlug)
    : null;

  return { q, marcaId, categoriaIds, estado };
}

/**
 * Condiciones SQL de los filtros activos, listas para unir con AND.
 * `excepto` omite una faceta para que su propio desplegable no se autolimite.
 *
 * Devuelve fragmentos que asumen los alias `p` y `m`.
 */
export function condicionesFiltro(
  f: FiltrosProducto,
  excepto?: Faceta,
): ReturnType<typeof sql<boolean>>[] {
  const cond: ReturnType<typeof sql<boolean>>[] = [];

  if (f.q) {
    const t = `%${f.q}%`;
    cond.push(sql<boolean>`(
      p.nombre_producto LIKE ${t}
      OR p.nombre_fantasia LIKE ${t}
      OR p.numero_registro LIKE ${t}
      OR m.nombre_marca LIKE ${t}
    )`);
  }

  if (f.estado) {
    cond.push(sql<boolean>`p.estado_certificacion = ${f.estado}`);
  }

  if (f.marcaId !== null && excepto !== 'marca') {
    cond.push(sql<boolean>`p.id_marca = ${f.marcaId}`);
  }

  if (f.categoriaIds !== null && excepto !== 'categoria') {
    if (f.categoriaIds.length === 0) {
      // Slug inexistente: no debe matchear nada.
      cond.push(sql<boolean>`1 = 0`);
    } else {
      cond.push(sql<boolean>`p.id_categoria IN (${sql.join(f.categoriaIds)})`);
    }
  }

  return cond;
}

/**
 * Une las condiciones en un único fragmento para usar dentro de un WHERE.
 * Sin filtros activos devuelve `1 = 1`, para poder interpolarlo siempre.
 */
export function whereFiltros(f: FiltrosProducto, excepto?: Faceta) {
  const cond = condicionesFiltro(f, excepto);
  if (cond.length === 0) return sql<boolean>`1 = 1`;
  return cond.reduce((acc, c) => sql<boolean>`${acc} AND ${c}`);
}
