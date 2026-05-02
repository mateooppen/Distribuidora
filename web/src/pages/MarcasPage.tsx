/**
 * Listado de marcas con paginación y ordenamiento server-side.
 * Click en una marca → navega a /?marca=<id> (productos pre-filtrados).
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { PaginationState, SortingState } from '@tanstack/react-table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MarcasTable } from '@/components/MarcasTable'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { api, type MarcasSortKey } from '@/lib/api'

const SORT_IDS: readonly MarcasSortKey[] = ['nombre', 'productos']

export function MarcasPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'nombre', desc: false },
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
    navigate(`/?marca=${idMarca}`)
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-[1200px]">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Marcas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Listado de marcas certificadas con cantidad de productos por marca.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input
          type="search"
          placeholder="Buscar marca por nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
            Limpiar
          </Button>
        )}
        {typeof marcasQuery.data?.total === 'number' && (
          <span className="text-sm text-muted-foreground ml-auto">
            {marcasQuery.data.total.toLocaleString('es-AR')}{' '}
            {marcasQuery.data.total === 1 ? 'marca' : 'marcas'}
          </span>
        )}
      </div>

      {marcasQuery.error && (
        <div className="border border-destructive/50 bg-destructive/10 text-destructive rounded-md p-4 text-sm mb-3">
          Error: {marcasQuery.error instanceof Error ? marcasQuery.error.message : 'desconocido'}
        </div>
      )}

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
  )
}
