/**
 * Server HTTP del dashboard LIALG.
 *
 * Stack: Fastify + better-sqlite3 (readonly) + Kysely.
 * Puerto default: 3001.
 * CORS habilitado para http://localhost:5173 (Vite).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import productosRoutes from './routes/productos.js';
import filtrosRoutes from './routes/filtros.js';
import marcasRoutes from './routes/marcas.js';
import dashboardRoutes from './routes/dashboard.js';
import adminRoutes from './routes/admin.js';
import listaRoutes from './routes/lista.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number.parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const IS_PROD = process.env['NODE_ENV'] === 'production';

// En producción el frontend compilado vive en web/dist/ relativo a la raíz del repo.
// En dev no se sirve (Vite corre por separado en :5173).
const WEB_DIST = path.resolve(__dirname, '..', '..', 'web', 'dist');
const SERVE_STATIC = IS_PROD && fs.existsSync(WEB_DIST);

const app = Fastify({
  logger: { level: IS_PROD ? 'warn' : 'info' },
});

// CORS: en dev permite Vite; en prod el frontend se sirve desde el mismo origen
await app.register(cors, {
  origin: IS_PROD ? false : (process.env['CORS_ORIGIN'] ?? 'http://localhost:5173'),
});

// Archivos estáticos del frontend (solo en producción)
if (SERVE_STATIC) {
  await app.register(staticPlugin, {
    root: WEB_DIST,
    prefix: '/',
    // No interceptar rutas /api con el plugin estático
    index: false,
  });
}

// Health check
app.get('/api/health', async () => ({ ok: true, env: IS_PROD ? 'production' : 'development' }));

// Rutas de la API bajo el prefijo /api
await app.register(productosRoutes, { prefix: '/api' });
await app.register(filtrosRoutes, { prefix: '/api' });
await app.register(marcasRoutes, { prefix: '/api' });
await app.register(dashboardRoutes, { prefix: '/api' });
await app.register(adminRoutes, { prefix: '/api' });
await app.register(listaRoutes, { prefix: '/api' });

// SPA fallback: cualquier ruta que no sea /api devuelve index.html (solo en prod)
if (SERVE_STATIC) {
  app.get('/', (_req, reply) => reply.sendFile('index.html', WEB_DIST));
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html', WEB_DIST);
  });
}

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API escuchando en http://localhost:${PORT}${SERVE_STATIC ? ' (sirviendo frontend)' : ''}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
