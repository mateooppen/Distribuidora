/**
 * Listado de marcas con paginación y ordenamiento server-side.
 * Click en una marca → navega a /?marca=<id> (productos pre-filtrados).
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { PaginationState, SortingState } from '@tanstack/react-table'
import { Input } from '@/components/ui/input'
import { MarcasTable } from '@/components/MarcasTable'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { api, type MarcasSortKey } from '@/lib/api'

const SORT_IDS: readonly MarcasSortKey[] = ['nombre', 'productos']

export function MarcasPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  // Sort por defecto: cantidad de productos descendente (las marcas con más
  // productos primero — orden más útil al entrar a la página).
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'productos', desc: true },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  })

  // Reset a página 1 cuando cambia la búsqueda
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }, [debouncedSearch])

  const sortKey: MarcasSortKey =
    sorting[0] && (SORT_IDS as readonly string[]).includes(sorting[0].id)
      ? (sorting[0].id as MarcasSortKey)
      : 'nombre'
  const sortOrder = sorting[0]?.desc ? 'desc' : 'asc'

  const filters = useMemo(
    () => ({
      q: debouncedSearch.trim() || undefined,
      sort: sortKey,
      order: sortOrder as 'asc' | 'desc',
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
    }),
    [debouncedSearch, sortKey, sortOrder, pagination],
  )

  const marcasQuery = useQuery({
    queryKey: ['marcas-listado', filters],
    queryFn: () => api.marcas(filters),
    placeholderData: keepPreviousData,
  })

  const handleRowClick = (idMarca: number) => {
    navigate(`/productos?marca=${idMarca}`)
  }

  const total = marcasQuery.data?.total
  const totalStr = total !== undefined ? total.toLocaleString('es-AR') : '...'

  return (
    <div
      className="min-h-[calc(100vh-3.5rem)]"
      style={{ background: 'hsl(var(--bg-base))' }}
    >
      <div className="container mx-auto py-6 px-4 sm:py-10 sm:px-6 max-w-[1200px]">

        {/* ── Header de página ──────────────────────────────────────── */}
        <header className="flex items-baseline justify-between gap-4 flex-wrap mb-6 sm:mb-8">
          <div>
            <h1 className="font-mono leading-none mb-3">
              <span
                className="text-4xl sm:text-5xl font-bold tracking-tight"
                style={{ color: 'hsl(var(--text-primary))' }}
              >
                Marcas
              </span>
            </h1>
            <p
              className="text-sm font-mono"
              style={{ color: 'hsl(var(--text-secondary))' }}
            >
              Marcas certificadas con cantidad de productos asociados.
            </p>
          </div>

          {/* Contador de resultados — inline en mobile, stack en desktop */}
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

        {/* ── Card de filtros (solo búsqueda) ───────────────────────── */}
        <div
          className="mb-6 p-5"
          style={{
            background: 'hsl(var(--bg-surface))',
            border: '1px solid hsl(var(--border-default))',
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-[2fr_auto] gap-4 items-end">

            {/* Búsqueda con prefijo > estilo terminal */}
            <div>
              <label
                className="block text-[11px] font-mono uppercase tracking-widest mb-1.5"
                style={{ color: 'hsl(var(--text-muted))' }}
              >
                $ buscar marca
              </label>
              <div className="flex">
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
                  placeholder="nombre de la marca…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 text-sm font-mono flex-1"
                  style={{
                    borderColor: 'hsl(var(--border-default))',
                    borderRadius: 0,
                  }}
                />
              </div>
            </div>

            {/* Botón Limpiar */}
            <div>
              <div className="h-[22px]" />
              <button
                onClick={() => setSearch('')}
                disabled={!search}
                className="h-10 px-4 text-xs font-mono uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: 'transparent',
                  color: 'hsl(var(--text-secondary))',
                  border: '1px solid hsl(var(--border-default))',
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => {
                  if (search) e.currentTarget.style.background = 'hsl(var(--bg-surface-raised))'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                × Limpiar
              </button>
            </div>

          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────────── */}
        {marcasQuery.error && (
          <div
            className="p-4 text-sm font-mono mb-3"
            style={{
              border: '1px solid hsl(var(--state-vencido))',
              background: 'hsl(var(--state-vencido) / 0.08)',
              color: 'hsl(var(--state-vencido))',
            }}
          >
            Error: {marcasQuery.error instanceof Error ? marcasQuery.error.message : 'desconocido'}
          </div>
        )}

        {/* ── Tabla ─────────────────────────────────────────────────── */}
        <MarcasTable
          data={marcasQuery.data?.data ?? []}
          total={marcasQuery.data?.total ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          loading={marcasQuery.isFetching}
          onRowClick={handleRowClick}
        />

      </div>
    </div>
  )
}
