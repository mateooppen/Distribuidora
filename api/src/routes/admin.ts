/**
 * Endpoints de administración.
 *
 * GET /api/admin/update/status
 *   Estado de la última ejecución del pipeline. Sin autenticación: alimenta el
 *   panel informativo de la home y no expone nada sensible.
 *
 * GET /api/admin/sync-runs
 *   Historial de ejecuciones (tabla sync_runs). Requiere ADMIN_TOKEN.
 *
 * Autenticación: header Authorization: Bearer <ADMIN_TOKEN>.
 * Si ADMIN_TOKEN no está definido en el entorno el servidor rechaza los
 * requests con 503 para evitar dejar el endpoint abierto por olvido.
 *
 * NO HAY ENDPOINT PARA DISPARAR LA ACTUALIZACIÓN — y es deliberado.
 * ---------------------------------------------------------------
 * Existía un POST /api/admin/update que corría el pipeline como proceso hijo.
 * Se removió porque en el hosting actual (Render, plan gratuito) hacía daño:
 *
 *   1. No persistía. La base se genera durante el build y el disco del
 *      contenedor es efímero: cualquier escritura en caliente se pierde
 *      cuando el contenedor se recicla.
 *   2. Podía tirar abajo el servicio. El pipeline corría en el mismo
 *      contenedor de 512 MB que sirve la web, y el scrape acumula ~35.500
 *      productos en memoria.
 *   3. Público equivocado. Estaba expuesto en la home de una herramienta de
 *      consulta interna.
 *
 * La actualización hoy se dispara redesplegando, que es lo que regenera la
 * base: automáticamente vía .github/workflows/rebuild-programado.yml, o a mano
 * desde "Run workflow" en GitHub Actions o "Manual Deploy" en Render.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { sqlite } from '../db.js';

// ── Auth helper ───────────────────────────────────────────────────────────────

function checkAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  const token = process.env['ADMIN_TOKEN'];
  if (!token) {
    reply.code(503).send({ error: 'ADMIN_TOKEN no configurado en el servidor.' });
    return false;
  }
  const auth = request.headers['authorization'] ?? '';
  if (auth !== `Bearer ${token}`) {
    reply.code(401).send({ error: 'Token inválido o ausente.' });
    return false;
  }
  return true;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /admin/update/status ─────────────────────────────────────────────
  fastify.get('/admin/update/status', async (_request, _reply) => {

    const last = sqlite.prepare(
      `SELECT id_sync_run, iniciado_en, finalizado_en, estado,
              productos_nuevos, marcas_fusionadas, duracion_seg, error_mensaje
       FROM sync_runs
       ORDER BY iniciado_en DESC
       LIMIT 1`,
    ).get() as {
      id_sync_run: number;
      iniciado_en: string;
      finalizado_en: string | null;
      estado: string;
      productos_nuevos: number | null;
      marcas_fusionadas: number | null;
      duracion_seg: number | null;
      error_mensaje: string | null;
    } | undefined;

    // `en_curso` se deriva del dato, no de estado en memoria: el pipeline marca
    // la corrida como 'en_curso' al arrancar y la cierra como 'ok' o 'error'.
    // En la práctica el server siempre lee una base ya terminada (se genera en
    // build time), así que esto queda en false salvo que una corrida haya
    // quedado trunca — en cuyo caso es correcto mostrarlo.
    return {
      en_curso: last?.estado === 'en_curso',
      ultimo_run: last ?? null,
    };
  });

  // ── GET /admin/sync-runs ─────────────────────────────────────────────────
  fastify.get('/admin/sync-runs', async (request, reply) => {
    if (!checkAuth(request, reply)) return;

    const rows = sqlite.prepare(
      `SELECT id_sync_run, iniciado_en, finalizado_en, estado,
              productos_nuevos, marcas_fusionadas, duracion_seg, error_mensaje
       FROM sync_runs
       ORDER BY iniciado_en DESC
       LIMIT 50`,
    ).all() as Array<{
      id_sync_run: number;
      iniciado_en: string;
      finalizado_en: string | null;
      estado: string;
      productos_nuevos: number | null;
      marcas_fusionadas: number | null;
      duracion_seg: number | null;
      error_mensaje: string | null;
    }>;

    return { data: rows };
  });
};

export default adminRoutes;
