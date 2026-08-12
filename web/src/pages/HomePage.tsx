import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type CategoriaNode } from '@/lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuracion(seg: number | null): string {
  if (seg === null) return '—'
  if (seg < 60) return `${seg.toFixed(0)}s`
  return `${Math.floor(seg / 60)}m ${Math.round(seg % 60)}s`
}

// Mapeo slug → channel de variable CSS (sin hsl())
const CAT_VAR: Record<string, string> = {
  lacteos:     '--cat-lacteos',
  panaderia:   '--cat-panaderia',
  cereales:    '--cat-cereales',
  chocolates:  '--cat-chocolates',
  dulces:      '--cat-dulces',
  bebidas:     '--cat-bebidas',
  aceites:     '--cat-aceites',
  carnes:      '--cat-carnes',
  snacks:      '--cat-snacks',
  helados:     '--cat-helados',
  suplementos: '--cat-suplementos',
}

function catVar(slug: string): string {
  const key = Object.keys(CAT_VAR).find(k => slug.includes(k))
  return key ? CAT_VAR[key] : '--cat-otros'
}

function catColor(slug: string): string {
  return `hsl(var(${catVar(slug)}))`
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: number | undefined
  accentVar: string  // nombre de variable CSS sin hsl(), ej: '--kpi-productos'
  isLast?: boolean
}

function KpiCard({ label, value, accentVar, isLast }: KpiCardProps) {
  const accentColor = `hsl(var(${accentVar}))`
  return (
    <div
      className="flex flex-col p-5 flex-1 min-w-[160px]"
      style={{
        background: 'hsl(var(--bg-surface))',
        // Borde izquierdo grueso de identidad; borde derecho fino de separación
        borderLeft: `4px solid ${accentColor}`,
        borderRight: isLast ? 'none' : '1px solid hsl(var(--border-subtle))',
        // Sin borde top/bottom individual — los maneja el contenedor
        borderTop: 'none',
        borderBottom: 'none',
      }}
    >
      <span
        className="text-xs font-mono uppercase tracking-widest mb-3"
        style={{ color: accentColor }}
      >
        $ {label}
      </span>
      {value !== undefined ? (
        <span
          className="text-5xl font-mono font-bold tabular-nums leading-none tracking-tight"
          style={{ color: 'hsl(var(--text-primary))' }}
        >
          {value.toLocaleString('es-AR')}
        </span>
      ) : (
        <Skeleton className="h-12 w-32" />
      )}
      <div className="mt-3">
        {/* TODO: delta — dato esperado: { valor: number, periodo: 'día' | 'semana' | 'mes' } — mostrar como "Δ +312  mes" en text-xs */}
      </div>
      <div>
        {/* TODO: sparkline — dato esperado: number[] (últimos N períodos) — mini gráfico de barras o línea, ~40px de alto */}
      </div>
    </div>
  )
}

// ── Sync Card ──────────────────────────────────────────────────────────────────

/**
 * Panel informativo de sincronización — solo lectura.
 *
 * No tiene acción para disparar la actualización, y es deliberado: la base se
 * regenera durante el build (ver .github/workflows/rebuild-programado.yml), no
 * en caliente. Disparar el pipeline desde acá no persistiría y podía tumbar el
 * servicio. Se actualiza redesplegando, desde GitHub Actions o Render.
 */
function SyncCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.syncStatus(),
    refetchInterval: (query) => query.state.data?.en_curso ? 10_000 : 60_000,
  })

  const ultimo = data?.ultimo_run ?? null

  const estadoColor =
    ultimo?.estado === 'ok'       ? 'hsl(var(--state-vigente))' :
    ultimo?.estado === 'error'    ? 'hsl(var(--state-vencido))' :
    ultimo?.estado === 'en_curso' ? 'hsl(var(--state-revision))' :
    'hsl(var(--text-muted))'

  const estadoLabel =
    data?.en_curso             ? 'En curso...' :
    ultimo?.estado === 'ok'    ? 'Exitoso' :
    ultimo?.estado === 'error' ? 'Error' :
    'Sin datos'

  return (
    <div
      className="flex flex-col"
      style={{
        background: 'hsl(var(--bg-surface-raised))',
        borderTop:    '3px solid hsl(var(--kpi-sync))',
        borderLeft:   '1px solid hsl(var(--border-default))',
        borderRight:  '1px solid hsl(var(--border-default))',
        borderBottom: '1px solid hsl(var(--border-default))',
      }}
    >
      {/* Encabezado del panel — barra superior diferenciada */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{
          background: 'hsl(var(--bg-surface))',
          borderBottom: '1px solid hsl(var(--border-default))',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: data?.en_curso
                ? 'hsl(var(--state-revision))'
                : 'hsl(var(--kpi-sync))',
              boxShadow: data?.en_curso
                ? '0 0 0 3px hsl(var(--state-revision) / 0.25)'
                : 'none',
            }}
          />
          <span
            className="text-xs font-mono uppercase tracking-widest font-semibold"
            style={{ color: 'hsl(var(--kpi-sync))' }}
          >
            panel de sincronización
          </span>
        </div>
        {data?.en_curso && (
          <span className="text-[11px] font-mono" style={{ color: 'hsl(var(--state-revision))' }}>
            ⏳ en curso
          </span>
        )}
      </div>

      {/* Contenido de sync */}
      <div className="px-4 py-3 flex-1">
        {isLoading ? (
          // Skeleton: 3 filas como las del estado real
          <div className="space-y-1.5">
            {[60, 90, 50].map((w, i) => (
              <div key={i} className="flex justify-between gap-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3" style={{ width: `${w}px` }} />
              </div>
            ))}
          </div>
        ) : ultimo ? (
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between gap-4">
              <span style={{ color: 'hsl(var(--text-muted))' }}>estado</span>
              <span style={{ color: estadoColor }}>{estadoLabel}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: 'hsl(var(--text-muted))' }}>última ejecución</span>
              <span style={{ color: 'hsl(var(--text-secondary))' }}>
                {formatFecha(ultimo.iniciado_en)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: 'hsl(var(--text-muted))' }}>duración</span>
              <span style={{ color: 'hsl(var(--text-secondary))' }}>
                {formatDuracion(ultimo.duracion_seg)}
              </span>
            </div>
            {ultimo.productos_nuevos !== null && ultimo.productos_nuevos > 0 && (
              <div className="flex justify-between gap-4">
                <span style={{ color: 'hsl(var(--text-muted))' }}>productos nuevos</span>
                <span style={{ color: 'hsl(var(--state-vigente))' }}>
                  +{ultimo.productos_nuevos}
                </span>
              </div>
            )}
            {ultimo.error_mensaje && (
              <p className="pt-1" style={{ color: 'hsl(var(--state-vencido))' }}>
                {ultimo.error_mensaje}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs font-mono" style={{ color: 'hsl(var(--text-muted))' }}>
            sin ejecuciones registradas.
          </p>
        )}

        {/* Nota al pie: explica que la actualización es automática, para que la
            ausencia de un botón no se lea como una funcionalidad faltante. */}
        <p
          className="text-[11px] font-mono mt-3 pt-2"
          style={{
            color: 'hsl(var(--text-muted))',
            borderTop: '1px solid hsl(var(--border-subtle))',
          }}
        >
          Actualización automática semanal.
        </p>
      </div>
    </div>
  )
}

// ── Búsqueda rápida ────────────────────────────────────────────────────────────

function BusquedaRapida() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = q.trim()
    if (trimmed) navigate(`/productos?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[55%]">
      {/* Label superior estilo terminal */}
      <label
        className="block text-xs font-mono uppercase tracking-widest mb-2"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        $ buscar
      </label>

      <div className="flex">
        {/* Prefijo > a la izquierda del input */}
        <span
          className="flex items-center justify-center h-10 px-3 font-mono text-sm shrink-0"
          style={{
            background: 'hsl(var(--bg-surface-raised))',
            color: 'hsl(var(--text-muted))',
            border: '1px solid hsl(var(--border-default))',
            borderRight: 'none',
          }}
        >
          {'>'}
        </span>
        <Input
          type="search"
          placeholder="nombre del producto, marca, número de registro…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          className="h-10 text-sm font-mono rounded-none flex-1"
          style={{
            borderColor: 'hsl(var(--border-default))',
            borderRadius: 0,
          }}
        />
        <button
          type="submit"
          disabled={!q.trim()}
          className="h-10 px-6 font-mono text-sm shrink-0 transition-opacity disabled:opacity-40"
          style={{
            background: 'hsl(var(--accent-color))',
            color: '#fff',
            border: '1px solid hsl(var(--accent-color))',
            borderRadius: 0,
          }}
        >
          Buscar
        </button>
      </div>
    </form>
  )
}

// ── Top Marcas ─────────────────────────────────────────────────────────────────

function TopMarcas() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['filtros-marcas-top'],
    queryFn: () => api.filtrosMarcas('', 15),
    staleTime: 5 * 60 * 1000,
  })

  const marcas = data?.data ?? []
  const maxProductos = marcas[0]?.total_productos ?? 1

  return (
    <section>
      <h2
        className="text-xs font-mono uppercase tracking-widest mb-4"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        $ top marcas
      </h2>

      {isLoading ? (
        // Skeleton: 15 filas con índice + nombre + conteo + barra
        <ul className="space-y-2.5">
          {Array.from({ length: 15 }).map((_, idx) => {
            // Ancho variable simulando ranking real (decreciente)
            const nameWidth = 90 - idx * 3
            const barWidth = 95 - idx * 5
            return (
              <li key={`skel-${idx}`}>
                <div className="flex justify-between items-baseline mb-1.5 gap-3">
                  <div className="flex items-baseline gap-2 min-w-0 flex-1">
                    <Skeleton className="h-2 w-4 shrink-0" />
                    <Skeleton
                      className="h-3"
                      style={{ width: `${Math.max(30, nameWidth)}%` }}
                    />
                  </div>
                  <Skeleton className="h-3 w-8 shrink-0" />
                </div>
                <Skeleton
                  className="h-[4px] block"
                  style={{ width: `${Math.max(20, barWidth)}%` }}
                />
              </li>
            )
          })}
        </ul>
      ) : (
      <ul className="space-y-2.5">
        {marcas.map((m, idx) => {
          const pct = Math.max(3, Math.round((m.total_productos / maxProductos) * 100))
          return (
            <li key={m.id_marca}>
              <button
                onClick={() => navigate(`/productos?marca=${m.id_marca}`)}
                className="w-full text-left group block"
              >
                <div className="flex justify-between items-baseline mb-1.5 gap-3">
                  {/* Índice + nombre */}
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className="text-[10px] font-mono tabular-nums shrink-0"
                      style={{ color: 'hsl(var(--text-muted))' }}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span
                      className="text-sm font-mono truncate transition-colors group-hover:underline"
                      style={{ color: 'hsl(var(--text-primary))' }}
                    >
                      {m.nombre_marca}
                    </span>
                  </div>
                  <span
                    className="text-xs font-mono font-semibold tabular-nums shrink-0"
                    style={{ color: 'hsl(var(--accent-color))' }}
                  >
                    {m.total_productos.toLocaleString('es-AR')}
                  </span>
                </div>
                {/* Barra proporcional: marca con más productos = 100% */}
                <div
                  className="h-[4px]"
                  style={{ background: 'hsl(var(--bg-surface-raised))' }}
                >
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: 'hsl(var(--accent-color))',
                    }}
                  />
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      )}
    </section>
  )
}

// ── Categorías ─────────────────────────────────────────────────────────────────

function CategoriaCard({ nodo }: { nodo: CategoriaNode }) {
  const navigate = useNavigate()
  const color = catColor(nodo.slug)

  return (
    <div
      className="p-4 transition-colors cursor-pointer group"
      style={{
        background: 'hsl(var(--bg-surface))',
        border: '1px solid hsl(var(--border-default))',
        borderLeft: `3px solid ${color}`,
      }}
      onClick={() => navigate(`/productos?categoria=${nodo.slug}`)}
    >
      {/* Nombre + conteo */}
      <div className="flex justify-between items-baseline mb-2 gap-3">
        <span
          className="font-mono text-sm font-semibold leading-tight truncate group-hover:underline"
          style={{ color }}
        >
          {nodo.nombre}
        </span>
        <span
          className="font-mono text-sm font-bold tabular-nums shrink-0"
          style={{ color }}
        >
          {nodo.total_productos.toLocaleString('es-AR')}
        </span>
      </div>

      {/* Subcategorías como texto corrido */}
      {nodo.hijos.length > 0 ? (
        <p
          className="text-[11px] font-mono leading-relaxed"
          style={{ color: 'hsl(var(--text-muted))' }}
        >
          {nodo.hijos.map((h, i) => (
            <span key={h.id_categoria}>
              {i > 0 && <span className="mx-1 opacity-50">·</span>}
              <span
                className="hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/productos?categoria=${h.slug}`)
                }}
              >
                {h.nombre}
              </span>
            </span>
          ))}
        </p>
      ) : (
        <p
          className="text-[11px] font-mono"
          style={{ color: 'hsl(var(--text-muted))' }}
        >
          —
        </p>
      )}
    </div>
  )
}

function CategoriaCardSkeleton() {
  return (
    <div
      className="p-4"
      style={{
        background: 'hsl(var(--bg-surface))',
        border: '1px solid hsl(var(--border-default))',
        borderLeft: '3px solid hsl(var(--border-default))',
      }}
    >
      <div className="flex justify-between items-baseline mb-2 gap-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-10 shrink-0" />
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  )
}

function CategoriasGrid() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-categorias'],
    queryFn: api.dashboardCategoriasJerarquia,
    staleTime: 5 * 60 * 1000,
  })

  // Orden: cantidad de productos descendente, con "Otros" siempre al final
  // (es un cajón de sastre, no una categoría principal).
  const categoriasOrdenadas = [...(data?.data ?? [])].sort((a, b) => {
    const aEsOtros = a.slug === 'otros'
    const bEsOtros = b.slug === 'otros'
    if (aEsOtros && !bEsOtros) return 1
    if (bEsOtros && !aEsOtros) return -1
    return b.total_productos - a.total_productos
  })

  return (
    <section>
      <h2
        className="text-xs font-mono uppercase tracking-widest mb-4"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        $ categorías
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <CategoriaCardSkeleton key={`skel-${i}`} />
            ))
          : categoriasOrdenadas.map((nodo) => (
              <CategoriaCard key={nodo.id_categoria} nodo={nodo} />
            ))}
      </div>
    </section>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────────

export function HomePage() {
  const { data: resumen } = useQuery({
    queryKey: ['dashboard-resumen'],
    queryFn: api.dashboardResumen,
    staleTime: 5 * 60 * 1000,
  })

  const totalStr = resumen?.productos !== undefined
    ? resumen.productos.toLocaleString('es-AR')
    : '...'

  return (
    <div
      className="min-h-[calc(100vh-3.5rem)]"
      style={{ background: 'hsl(var(--bg-base))' }}
    >
      <div className="container mx-auto py-6 px-4 sm:py-10 sm:px-6 max-w-[1400px]">

        {/* ── Header de página ───────────────────────────────────────── */}
        {/*   Layout en 2 columnas: título a la izquierda, sync a la derecha */}
        <div className="flex items-start justify-between gap-6 sm:gap-8 flex-wrap mb-8 sm:mb-10">

          {/* Columna izquierda: título + descripción + metadato */}
          <div className="flex-1 min-w-0">
            <h1 className="font-mono leading-none mb-3 flex flex-wrap items-baseline gap-x-3">
              <span
                className="text-4xl sm:text-6xl font-bold tracking-tight"
                style={{ color: 'hsl(var(--text-primary))' }}
              >
                San Felipa
              </span>
              <span
                className="text-4xl sm:text-6xl font-thin tracking-tight"
                style={{ color: 'hsl(var(--text-secondary))' }}
              >
                /LIALG
              </span>
            </h1>

            <p
              className="text-sm font-mono mb-2"
              style={{ color: 'hsl(var(--text-secondary))' }}
            >
              Listado integrado de alimentos libres de gluten — ANMAT Argentina
            </p>

            <p
              className="text-xs font-mono"
              style={{ color: 'hsl(var(--text-muted))' }}
            >
              v{new Date().getFullYear()}.{String(new Date().getMonth() + 1).padStart(2, '0')}
              {' · '}
              {totalStr} productos indexados
            </p>
          </div>

          {/* Columna derecha: Sincronización ANMAT */}
          <div className="w-full sm:w-[400px] shrink-0">
            <SyncCard />
          </div>
        </div>

        {/* ── KPI cards — bloque continuo sin gap ────────────────────── */}
        {/*   Contenedor: borde top/bottom de 2px, sin radius               */}
        <div
          className="flex flex-col sm:flex-row mb-8 overflow-hidden"
          style={{
            borderTop:    '2px solid hsl(var(--border-default))',
            borderBottom: '2px solid hsl(var(--border-default))',
          }}
        >
          <KpiCard
            label="total productos"
            value={resumen?.productos}
            accentVar="--kpi-productos"
          />
          <KpiCard
            label="total marcas"
            value={resumen?.marcas}
            accentVar="--kpi-marcas"
          />
          <KpiCard
            label="total categorías"
            value={resumen?.categorias}
            accentVar="--kpi-categorias"
            isLast
          />
        </div>

        {/* ── Búsqueda rápida ────────────────────────────────────────── */}
        <div className="my-8">
          <BusquedaRapida />
        </div>

        {/* ── Dos columnas: Top marcas + Categorías ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[35%_1fr] gap-10">
          <TopMarcas />
          <CategoriasGrid />
        </div>

      </div>
    </div>
  )
}
