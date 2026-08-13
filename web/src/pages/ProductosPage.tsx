/**
 * Página principal: listado de productos con filtros, ordenamiento y paginación.
 * Toda la coordinación de estado vive acá; los componentes hijos son tontos.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { PaginationState, SortingState } from '@tanstack/react-table'
import { AgregarResultadosLista } from '@/components/AgregarResultadosLista'
import { Filtros } from '@/components/Filtros'
import { ProductosTable } from '@/components/ProductosTable'
import { ProductoDetalle } from '@/components/ProductoDetalle'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import {
  api,
  type SortKey,
  type CategoriaFiltro,
} from '@/lib/api'

// Columnas ordenables desde los encabezados de la tabla. `relevancia` no está
// acá a propósito: no es una columna, es el orden por defecto cuando hay
// búsqueda activa (ver `sortKey` más abajo).
const SORT_IDS: readonly SortKey[] = ['nombre', 'marca']

export function ProductosPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Estado de UI ─────────────────────────────────────────────────────
  // `search` se inicializa desde ?q= para que la búsqueda rápida del home funcione.
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const debouncedSearch = useDebouncedValue(search, 300)

  // Inicializo `marca` desde el query param (?marca=<id>) si existe.
  const initialMarca = (() => {
    const v = Number.parseInt(searchParams.get('marca') ?? '', 10)
    return Number.isFinite(v) && v > 0 ? v : null
  })()
  const [marca, setMarcaState] = useState<number | null>(initialMarca)

  // Wrapper que sincroniza marca con el URL.
  const setMarca = (v: number | null) => {
    setMarcaState(v)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v === null) next.delete('marca')
        else next.set('marca', String(v))
        return next
      },
      { replace: true },
    )
  }

  // Inicializo `categoria` desde ?categoria=<slug> si existe.
  const initialCategoria = searchParams.get('categoria') || null
  const [categoria, setCategoriaState] = useState<string | null>(initialCategoria)

  const setCategoria = (v: string | null) => {
    setCategoriaState(v)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v === null) next.delete('categoria')
        else next.set('categoria', v)
        return next
      },
      { replace: true },
    )
  }

  // Vacío = sin columna elegida por el usuario. Con búsqueda activa eso
  // significa "ordenar por relevancia"; sin búsqueda, alfabético por nombre.
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  })

  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Cuando cambia un filtro, volvemos a la página 1.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }, [debouncedSearch, marca, categoria])

  // Contexto de filtrado que se pasa a los desplegables para que ofrezcan solo
  // valores con resultados. Cada faceta omite su propio filtro del lado de la
  // API, así se puede saltar de una marca (o categoría) a otra sin limpiar.
  const contexto = useMemo(
    () => ({
      q: debouncedSearch.trim() || undefined,
      marca,
      categoria,
      estado: 'vigente' as const,
    }),
    [debouncedSearch, marca, categoria],
  )

  // Categorías con su conteo en contexto. Se refetchea al cambiar los filtros.
  const { data: categoriasData } = useQuery({
    queryKey: ['filtros-categorias', contexto],
    queryFn: () => api.filtrosCategorias(contexto),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
  const categorias: CategoriaFiltro[] = categoriasData?.data ?? []

  // ── Mapeo de sorting → API ───────────────────────────────────────────
  // Si el usuario eligió una columna, manda esa. Si no eligió ninguna:
  // relevancia cuando hay término de búsqueda, alfabético cuando no lo hay.
  // Buscar "harina de arroz" y recibir el resultado alfabético no sirve de
  // nada: hay cientos de productos que la mencionan entre sus ingredientes.
  const columnaElegida =
    sorting[0] && (SORT_IDS as readonly string[]).includes(sorting[0].id)
      ? (sorting[0].id as SortKey)
      : null

  const sortKey: SortKey =
    columnaElegida ?? (debouncedSearch.trim() ? 'relevancia' : 'nombre')
  const sortOrder = sorting[0]?.desc ? 'desc' : 'asc'

  // ── Query ────────────────────────────────────────────────────────────
  const filters = useMemo(
    () => ({
      q: debouncedSearch.trim() || undefined,
      marca,
      estado: 'vigente' as const,
      categoria,
      sort: sortKey,
      order: sortOrder as 'asc' | 'desc',
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
    }),
    [debouncedSearch, marca, categoria, sortKey, sortOrder, pagination],
  )

  const productosQuery = useQuery({
    queryKey: ['productos', filters],
    queryFn: () => api.productos(filters),
    placeholderData: keepPreviousData,
  })

  // ── Render ───────────────────────────────────────────────────────────
  const total = productosQuery.data?.total
  const totalStr = total !== undefined ? total.toLocaleString('es-AR') : '...'

  return (
    <div
      className="min-h-[calc(100vh-3.5rem)]"
      style={{ background: 'hsl(var(--bg-base))' }}
    >
      <div className="container mx-auto py-6 px-4 sm:py-10 sm:px-6 max-w-[1400px]">

        {/* ── Header de página ──────────────────────────────────────── */}
        <header className="flex items-baseline justify-between gap-4 flex-wrap mb-6 sm:mb-8">
          <div>
            <h1 className="font-mono leading-none mb-3">
              <span
                className="text-4xl sm:text-5xl font-bold tracking-tight"
                style={{ color: 'hsl(var(--text-primary))' }}
              >
                Productos
              </span>
            </h1>
            <p
              className="text-sm font-mono"
              style={{ color: 'hsl(var(--text-secondary))' }}
            >
              Certificados por ANMAT, importados del listado LIALG.
            </p>
          </div>

          {/*
           * Contador de resultados.
           * Desktop: stack vertical a la derecha (label arriba, número abajo).
           * Mobile: inline-flex con label al lado del número (más compacto).
           */}
          <div className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
            <p
              className="text-xs font-mono uppercase tracking-widest"
              style={{ color: 'hsl(var(--text-muted))' }}
            >
              resultados
            </p>
            <p
              className="text-2xl sm:text-3xl font-mono font-bold tabular-nums leading-none"
              style={{ color: 'hsl(var(--accent-color))' }}
            >
              {totalStr}
            </p>
          </div>
        </header>

        <Filtros
          search={search}
          onSearchChange={setSearch}
          marca={marca}
          onMarcaChange={setMarca}
          categoria={categoria}
          onCategoriaChange={setCategoria}
          categorias={categorias}
          contexto={contexto}
        />

        {productosQuery.error && (
          <div
            className="p-4 text-sm font-mono mb-3"
            style={{
              border: '1px solid hsl(var(--state-vencido))',
              background: 'hsl(var(--state-vencido) / 0.08)',
              color: 'hsl(var(--state-vencido))',
            }}
          >
            Error: {productosQuery.error instanceof Error
              ? productosQuery.error.message
              : 'desconocido'}
          </div>
        )}

        {/* Agregado masivo de todos los resultados de la búsqueda actual. */}
        <AgregarResultadosLista
          filtros={{
            q: filters.q,
            marca: filters.marca,
            estado: filters.estado,
            categoria: filters.categoria,
            sort: filters.sort,
            order: filters.order,
          }}
          total={total ?? 0}
        />

        <ProductosTable
          data={productosQuery.data?.data ?? []}
          total={productosQuery.data?.total ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          loading={productosQuery.isFetching}
          selectedId={selectedId}
          onRowClick={setSelectedId}
        />

        <ProductoDetalle
          productoId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  )
}
