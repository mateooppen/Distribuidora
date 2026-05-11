/**
 * Página principal: listado de productos con filtros, ordenamiento y paginación.
 * Toda la coordinación de estado vive acá; los componentes hijos son tontos.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { PaginationState, SortingState } from '@tanstack/react-table'
import { Filtros } from '@/components/Filtros'
import { ProductosTable } from '@/components/ProductosTable'
import { ProductoDetalle } from '@/components/ProductoDetalle'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import {
  api,
  type SortKey,
  type CategoriaFiltro,
} from '@/lib/api'

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

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'nombre', desc: false },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  })

  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Cuando cambia un filtro, volvemos a la página 1.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }, [debouncedSearch, marca, categoria])

  // Lista plana de categorías para el combobox
  const { data: categoriasData } = useQuery({
    queryKey: ['filtros-categorias'],
    queryFn: api.filtrosCategorias,
    staleTime: 10 * 60 * 1000,
  })
  const categorias: CategoriaFiltro[] = categoriasData?.data ?? []

  // ── Mapeo de sorting → API ───────────────────────────────────────────
  const sortKey: SortKey =
    sorting[0] && (SORT_IDS as readonly string[]).includes(sorting[0].id)
      ? (sorting[0].id as SortKey)
      : 'nombre'
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
