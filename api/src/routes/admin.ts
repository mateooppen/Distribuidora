/**
 * Endpoints de administración — protegidos con ADMIN_TOKEN.
 *
 * POST /api/admin/update
 *   Dispara el pipeline completo de actualización (update.ts --apply) como
 *   proceso hijo. Responde 202 inmediatamente; el proceso corre en background.
 *   Si ya hay un update en curso, responde 409.
 *
 * GET /api/admin/sync-runs
 *   Devuelve el historial de ejecuciones del pipeline (tabla sync_runs).
 *
 * Autenticación: header Authorization: Bearer <ADMIN_TOKEN>.
 * Si ADMIN_TOKEN no está definido en el entorno el servidor rechaza todos los
 * requests con 503 para evitar dejar el endpoint abierto por olvido.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { sqlite } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const UPDATE_SCRIPT = path.join(REPO_ROOT, 'src', 'scripts', 'update.ts');

// Estado compartido en memoria: solo puede haber un update corriendo a la vez.
let updateRunning = false;

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
  // ── POST /admin/update ───────────────────────────────────────────────────
  fastify.post('/admin/update', async (request, reply) => {
    if (!checkAuth(request, reply)) return;

    if (updateRunning) {
      return reply.code(409).send({ error: 'Ya hay un update en curso.' });
    }

    updateRunning = true;
    reply.code(202).send({ ok: true, mensaje: 'Update iniciado en background.' });

    // Correr update.ts en un proceso hijo sin bloquear el servidor.
    const child = spawn(
      'node',
      ['--import', 'tsx/esm', UPDATE_SCRIPT, '--apply'],
      {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        env: { ...process.env },
      },
    );

    child.on('close', (code) => {
      updateRunning = false;
      fastify.log.info(`[admin/update] Proceso terminado con código ${code ?? 'null'}.`);
    });

    child.on('error', (err) => {
      updateRunning = false;
      fastify.log.error(`[admin/update] Error al lanzar proceso: ${err.message}`);
    });
  });

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

    return {
      en_curso: updateRunning,
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
