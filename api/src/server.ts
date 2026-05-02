/**
 * Server HTTP del dashboard LIALG.
 *
 * Stack: Fastify + better-sqlite3 (readonly) + Kysely.
 * Puerto default: 3001.
 * CORS habilitado para http://localhost:5173 (Vite).
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import productosRoutes from './routes/productos.js';
import filtrosRoutes from './routes/filtros.js';
import marcasRoutes from './routes/marcas.js';

const PORT = Number.parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const app = Fastify({
  logger: { level: 'info' },
});

await app.register(cors, {
  origin: 'http://localhost:5173',
});

// Health check
app.get('/api/health', async () => ({ ok: true }));

// Rutas de la API bajo el prefijo /api
await app.register(productosRoutes, { prefix: '/api' });
await app.register(filtrosRoutes, { prefix: '/api' });
await app.register(marcasRoutes, { prefix: '/api' });

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API escuchando en http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
