/**
 * Rutas de la lista de pedido.
 *
 * POST /lista/resolver
 *   { rnpas: string[] } → { encontrados: ProductoListItem[], faltantes: string[] }
 *
 * POST /lista/export
 *   { rnpas: string[] } → archivo .xlsx (attachment)
 *
 * ── Por qué la clave es el RNPA ─────────────────────────────────────────────
 *
 * La lista vive en el localStorage del navegador y la base se regenera entera en
 * cada release. `id_producto` es el rowid asignado por orden de inserción del CSV
 * de ANMAT: si upstream agregan o borran una fila, todos los ids posteriores se
 * corren y una lista guardada por id apuntaría a productos distintos. En cambio
 * `(tipo_registro, numero_registro)` tiene UNIQUE en el esquema. Por eso el
 * cliente manda RNPAs y el servidor resuelve contra la base actual.
 *
 * ── Por qué POST ────────────────────────────────────────────────────────────
 *
 * No escriben nada: la base sigue readonly y no hay estado en el servidor. Es
 * POST porque una lista puede traer 300 RNPAs y no entran cómodos en una query
 * string.
 */

import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db.js';
import { cleanFantasia } from '../lib/nombre-producto.js';
import { generarXlsxPedido, nombreArchivo, type FilaPedido } from '../lib/xlsx-lista.js';

// Mismo tope que aplica el cliente (web/src/lib/lista-pedido.ts). Acá además
// protege de que alguien mande un body gigante a mano.
const MAX_RNPAS = 300;

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Body {
  rnpas?: unknown;
}

interface RnpasValidos {
  ok: true;
  rnpas: string[];
}

interface RnpasInvalidos {
  ok: false;
  error: string;
}

/**
 * Valida y normaliza el body. Deduplica preservando el orden de llegada, aunque
 * el orden final lo define la agrupación por marca: sirve para que `faltantes`
 * no repita el mismo RNPA dos veces.
 */
function parseRnpas(body: Body | undefined): RnpasValidos | RnpasInvalidos {
  const crudo = body?.rnpas;
  if (!Array.isArray(crudo)) {
    return { ok: false, error: 'Se espera { rnpas: string[] }' };
  }
  if (crudo.length > MAX_RNPAS) {
    return { ok: false, error: `Máximo ${MAX_RNPAS} productos por pedido` };
  }

  const vistos = new Set<string>();
  const rnpas: string[] = [];
  for (const item of crudo) {
    if (typeof item !== 'string') continue;
    const limpio = item.trim();
    // Mismo criterio de plausibilidad que el cliente: al menos dos dígitos.
    // Los RNPA reales varían mucho de formato, pero ninguno es texto puro.
    if (limpio.length < 3) continue;
    if (limpio.replace(/\D/g, '').length < 2) continue;
    if (vistos.has(limpio)) continue;
    vistos.add(limpio);
    rnpas.push(limpio);
  }

  return { ok: true, rnpas };
}

interface FilaResuelta extends FilaPedido {
  id_producto: number;
  estado_certificacion: string;
  id_marca: number;
}

/** Trae de la base los productos correspondientes a los RNPA pedidos. */
async function resolver(rnpas: string[]): Promise<FilaResuelta[]> {
  if (rnpas.length === 0) return [];
  const rows = await db
    .selectFrom('productos as p')
    .innerJoin('marcas as m', 'm.id_marca', 'p.id_marca')
    .where('p.tipo_registro', '=', 'RNPA')
    .where('p.numero_registro', 'in', rnpas)
    .select([
      'p.id_producto',
      'p.nombre_producto',
      'p.nombre_fantasia',
      'p.numero_registro',
      'p.estado_certificacion',
      'm.id_marca',
      'm.nombre_marca',
    ])
    .execute();

  return rows.map((r) => ({
    ...r,
    nombre_fantasia: cleanFantasia(r.nombre_fantasia),
  }));
}

const listaRoutes: FastifyPluginAsync = async (fastify) => {
  // ── POST /lista/resolver ────────────────────────────────────────────────
  // Lo llama el cliente al abrir la lista, para revalidar contra la base actual:
  // corrige nombres que cambiaron y detecta productos que ya no están en el
  // catálogo. El snapshot del navegador es solo para render instantáneo.
  fastify.post<{ Body: Body }>('/lista/resolver', async (req, reply) => {
    const parsed = parseRnpas(req.body);
    if (!parsed.ok) {
      reply.code(400);
      return { error: parsed.error };
    }

    const encontrados = await resolver(parsed.rnpas);
    const presentes = new Set(
      encontrados.map((f) => f.numero_registro).filter((v): v is string => !!v),
    );

    return {
      encontrados: encontrados.map((f) => ({
        id_producto: f.id_producto,
        nombre_producto: f.nombre_producto,
        nombre_fantasia: f.nombre_fantasia,
        numero_registro: f.numero_registro,
        estado_certificacion: f.estado_certificacion,
        id_marca: f.id_marca,
        nombre_marca: f.nombre_marca,
      })),
      faltantes: parsed.rnpas.filter((r) => !presentes.has(r)),
    };
  });

  // ── POST /lista/export ──────────────────────────────────────────────────
  // El Excel se arma con datos frescos de la base, no con el snapshot del
  // navegador: si un nombre cambió desde que se agregó el producto, al proveedor
  // le llega el actual. Los RNPA que ya no existen se omiten (el cliente los
  // muestra marcados antes de exportar).
  fastify.post<{ Body: Body }>('/lista/export', async (req, reply) => {
    const parsed = parseRnpas(req.body);
    if (!parsed.ok) {
      reply.code(400);
      return { error: parsed.error };
    }
    if (parsed.rnpas.length === 0) {
      reply.code(400);
      return { error: 'La lista está vacía' };
    }

    const filas = await resolver(parsed.rnpas);
    if (filas.length === 0) {
      reply.code(404);
      return { error: 'Ninguno de los productos de la lista está en el catálogo' };
    }

    const buffer = await generarXlsxPedido(filas);
    const archivo = nombreArchivo();

    reply
      .header('Content-Type', XLSX_MIME)
      .header('Content-Disposition', `attachment; filename="${archivo}"`)
      .header('Content-Length', String(buffer.length))
      // Sin esto el navegador no ve el nombre del archivo cuando la API está en
      // otro origen (dev: :3001 contra :5173).
      .header('Access-Control-Expose-Headers', 'Content-Disposition');

    return reply.send(buffer);
  });
};

export default listaRoutes;
