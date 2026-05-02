# LIALG / Distribuidora

Base de datos consultable de productos certificados sin TACC en Argentina (LIALG de ANMAT).

Estado actual: **35.498 productos** de **4.951 marcas** clasificados en una taxonomía de **36 categorías**, importados desde el dataset histórico ANMAT 2019 + sincronizados con el listado online actual.

## Stack

| Capa | Tecnología |
|---|---|
| Base de datos | SQLite (better-sqlite3) |
| Query builder | Kysely |
| Importación / scripts | TypeScript ejecutado con tsx |
| Backend HTTP | Fastify + TypeScript |
| Frontend | Vite + React + TypeScript |
| Estilos | Tailwind CSS v3 |
| Componentes UI | shadcn/ui (copy-paste) |
| Tabla de datos | TanStack Table v8 (server-side) |
| State server | TanStack Query v5 |
| Routing | React Router v7 |

## Estructura del repo

```
.
├── data/                  # CSV original ANMAT + JSON scrapeado
├── db/                    # SQLite (lialg.db) — gitignoreado
├── src/                   # Scripts CLI (init / import / sync / categorize)
│   ├── db/                #   schema.sql + connection.ts + types.ts (Kysely)
│   ├── lib/               #   helpers (logger, normalize, levenshtein)
│   └── scripts/           #   init-db, import-anmat, scrape-lialg, sync-lialg, categorize, ...
│
├── api/                   # Servidor Fastify (subproyecto independiente)
│   ├── package.json
│   └── src/
│       ├── server.ts
│       ├── db.ts          # readonly + Kysely (importa types de ../../src/db/types)
│       └── routes/        # productos / filtros / marcas
│
└── web/                   # Frontend Vite + React (subproyecto independiente)
    ├── package.json
    ├── tailwind.config.ts
    ├── components.json    # config shadcn (preset default + neutral)
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── index.css
        ├── lib/           # api client, queryClient, useDebouncedValue, utils
        ├── components/    # Filtros, ProductosTable, MarcasTable, ProductoDetalle, ui/...
        └── pages/         # ProductosPage, MarcasPage
```

`api/` y `web/` son subproyectos independientes con su propio `package.json` y `node_modules`. **No** se usan workspaces.

## Cómo correr el dashboard

Asumiendo que la base ya está creada (ver "Reset desde cero" más abajo si no), abrir **dos terminales** desde la raíz del proyecto:

### Terminal 1 — API

```bash
cd api
npm install         # solo la primera vez
npm run dev         # tsx watch — port 3001
```

Cuando arranca, debería ver:
```
API escuchando en http://localhost:3001
```

### Terminal 2 — Frontend

```bash
cd web
npm install         # solo la primera vez
npm run dev         # vite — port 5173
```

Abrir `http://localhost:5173`.

## Endpoints del API

Base: `http://localhost:3001`

| Método | Path | Descripción |
|---|---|---|
| GET | `/api/health` | Healthcheck → `{ ok: true }` |
| GET | `/api/productos` | Listado paginado con filtros y orden. Query params: `q`, `marca`, `estado`, `sort` (`nombre\|marca\|fecha`), `order` (`asc\|desc`), `page`, `pageSize` (máx 200). |
| GET | `/api/productos/:id` | Detalle completo: producto + marca + categoría + presentaciones + aptitudes + últimas 10 verificaciones |
| GET | `/api/marcas` | Listado paginado con conteo de productos. Query params: `q`, `sort` (`nombre\|productos`), `order`, `page`, `pageSize` |
| GET | `/api/filtros/marcas` | Lista alfabética simple de marcas (id + nombre). Para popular el dropdown del filtro. |

CORS habilitado para `http://localhost:5173` (puerto default de Vite).

## Scripts del proyecto principal (`src/scripts/`)

Ejecutables desde la raíz con `npm run <script>`:

| Script | Qué hace |
|---|---|
| `db:init` | Crea la base SQLite vacía con el schema |
| `db:import` | Importa el CSV histórico ANMAT 2019 desde `data/alg.csv` |
| `db:reset` | `db:init` + `db:import` (rehace todo desde el CSV) |
| `db:stats` | Estadísticas de la base (filas por tabla, top marcas, etc.) |
| `db:diagnose` | Genera `data/merge-map-sugerido.json` con candidatos a fusión de marcas |
| `db:merge` | Aplica las fusiones de marcas del JSON manual |
| `db:auto-merge` | Aplica reglas automáticas de fusión (sub-líneas, word-splits, typos Lev=1) |
| `db:scrape` | Scrapea `listadoalg.anmat.gob.ar` y guarda `data/lialg-actual.json` |
| `db:sync` | Sincroniza la base con `data/lialg-actual.json` (estados + altas) |
| `db:categorize` | Inserta el árbol de categorías y asigna categoría a cada producto |

Cada script de mutación corre **dry-run por defecto**; pasar `-- --apply` para ejecutar. Por ejemplo:

```bash
npm run db:auto-merge -- --apply
```

### Reset desde cero

```bash
npm run db:reset                    # Esquema + import CSV 2019
npm run db:auto-merge -- --apply    # Fusión de marcas duplicadas
npm run db:scrape -- --save         # Scrape LIALG online (~7 min)
npm run db:sync -- --apply          # Sincronizar estados y altas
npm run db:categorize -- --apply    # Asignar categorías
```

## Decisiones de diseño relevantes

- **Búsqueda con `LIKE %x%`**: simple. No hay FTS5 todavía. Funciona razonablemente con 35k productos.
- **`nombre_fantasia` placeholder**: el CSV original usa `"No registra"`, `"-"` y similares como placeholders. El API los normaliza a `null` antes de devolverlos.
- **`marca` como subproyecto**: cada subproyecto tiene su propio `package.json` y `node_modules` (sin workspaces). El cruce se limita a `api/src/db.ts` que importa los **types** de Kysely de `src/db/types.ts` (zero cost en runtime).
- **TanStack Table en modo manual**: `manualPagination` + `manualSorting`. La API hace todo el trabajo; la tabla solo renderiza.
- **Sheet de shadcn con `transition` en lugar de keyframe-animation**: en `src/index.css` hay un override porque `tailwindcss-animate@1.0.7` no completaba la animación de salida (las animaciones quedaban en `running` con `currentTime: 0`). El fix es local al `[role="dialog"]` del dashboard.

## Pendientes / próximos pasos sugeridos

- Reescribir el endpoint `/api/filtros/marcas` para que devuelva las top N por cantidad o use un Combobox con búsqueda interna en el frontend (4951 opciones en un Select es mucho).
- Re-importar el CSV: hay mojibake en algunos nombres (ej. `"Óptimo"` quedó como `"Ã“ptimo"`). El detector de latin1 del importador no cubre todos los casos.
- Agregar pantalla de categorías navegable.
- CRUD para enriquecer datos comerciales (proveedores, EAN-13, precios) — ya sale del alcance de "consulta".
