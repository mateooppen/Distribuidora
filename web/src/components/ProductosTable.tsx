/**
 * Tabla de productos con TanStack Table en modo server-side:
 *   - manualPagination + manualSorting (la API hace el trabajo).
 *   - Columnas con header clickeable para ordenar.
 *   - Click en fila abre el panel de detalle.
 */

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ProductoListItem } from '@/lib/api'

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100] as const

// ── Columnas ──────────────────────────────────────────────────────────────

const columns: ColumnDef<ProductoListItem>[] = [
  {
    id: 'nombre',
    accessorKey: 'nombre_producto',
    header: 'Producto',
    enableSorting: true,
    cell: ({ row }) => {
      const p = row.original
      return (
        <div>
          <div
            className="font-sans font-semibold text-sm leading-snug line-clamp-2"
            style={{ color: 'hsl(var(--text-primary))' }}
          >
            {p.nombre_fantasia ?? p.nombre_producto}
          </div>
          {p.nombre_fantasia && (
            <div
              className="text-xs font-mono mt-1 line-clamp-1"
              style={{ color: 'hsl(var(--text-muted))' }}
            >
              {p.nombre_producto}
            </div>
          )}
        </div>
      )
    },
  },
  {
    id: 'marca',
    accessorKey: 'nombre_marca',
    header: 'Marca',
    enableSorting: true,
    cell: ({ row }) => (
      <span className="font-sans text-sm" style={{ color: 'hsl(var(--text-secondary))' }}>
        {row.original.nombre_marca}
      </span>
    ),
  },
  {
    id: 'rnpa',
    accessorKey: 'numero_registro',
    header: 'RNPA',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
        {row.original.numero_registro ?? '—'}
      </span>
    ),
  },
]

// ── Componente ────────────────────────────────────────────────────────────

export interface ProductosTableProps {
  data: ProductoListItem[]
  total: number
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  loading?: boolean
  selectedId?: number | null
  onRowClick?: (id: number) => void
}

export function ProductosTable({
  data,
  total,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  loading,
  selectedId,
  onRowClick,
}: ProductosTableProps) {
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize))

  const table = useReactTable({
    data,
    columns,
    state: { pagination, sorting },
    onPaginationChange,
    onSortingChange,
    manualPagination: true,
    manualSorting: true,
    pageCount,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className={cn('space-y-4', loading && 'opacity-70 transition-opacity')}>
      {/* ── Tabla ──────────────────────────────────────────────────── */}
      <div
        className="overflow-auto"
        style={{
          background: 'hsl(var(--bg-surface))',
          border: '1px solid hsl(var(--border-default))',
        }}
      >
        <table className="w-full text-sm">
          {/* Header */}
          <thead
            style={{
              background: 'hsl(var(--bg-surface-raised))',
              borderBottom: '2px solid hsl(var(--border-default))',
            }}
          >
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'h-11 px-5 text-left align-middle font-mono text-[11px] uppercase tracking-widest font-semibold whitespace-nowrap',
                        canSort && 'cursor-pointer select-none hover:opacity-80 transition-opacity',
                      )}
                      style={{ color: 'hsl(var(--text-muted))' }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="inline-flex items-center gap-2">
                        <span>$</span>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span style={{ color: 'hsl(var(--text-muted))' }}>
                            {sortDir === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : sortDir === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          {/* Body */}
          <tbody>
            {loading && table.getRowModel().rows.length === 0 ? (
              // Skeleton rows — primer load (sin datos previos)
              Array.from({ length: pagination.pageSize }).map((_, idx) => (
                <tr
                  key={`skeleton-${idx}`}
                  style={{
                    background: idx % 2 === 1
                      ? 'hsl(var(--bg-surface-raised) / 0.4)'
                      : 'transparent',
                    borderBottom: '1px solid hsl(var(--border-subtle))',
                  }}
                >
                  {/* Producto */}
                  <td className="px-5 py-4 align-top">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </td>
                  {/* Marca */}
                  <td className="px-5 py-4 align-top">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  {/* RNPA */}
                  <td className="px-5 py-4 align-top">
                    <Skeleton className="h-3 w-20" />
                  </td>
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="h-40 text-center"
                  style={{ color: 'hsl(var(--text-muted))' }}
                >
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <span
                      className="font-mono text-2xl"
                      style={{ color: 'hsl(var(--text-muted))' }}
                    >
                      ∅
                    </span>
                    <p
                      className="font-mono text-sm font-semibold"
                      style={{ color: 'hsl(var(--text-secondary))' }}
                    >
                      Sin resultados
                    </p>
                    <p
                      className="font-mono text-xs"
                      style={{ color: 'hsl(var(--text-muted))' }}
                    >
                      Probá modificar la búsqueda o limpiar los filtros.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, idx) => {
                const isSelected = row.original.id_producto === selectedId
                const isOdd = idx % 2 === 1
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original.id_producto)}
                    className={cn(
                      'transition-colors',
                      onRowClick && 'cursor-pointer',
                    )}
                    style={{
                      // Zebra muy sutil para guiar la lectura horizontal
                      background: isSelected
                        ? 'hsl(var(--accent-color) / 0.08)'
                        : isOdd
                          ? 'hsl(var(--bg-surface-raised) / 0.4)'
                          : 'transparent',
                      borderBottom: '1px solid hsl(var(--border-subtle))',
                      // Barra de selección a la izquierda
                      boxShadow: isSelected
                        ? 'inset 3px 0 0 0 hsl(var(--accent-color))'
                        : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'hsl(var(--bg-surface-raised) / 0.8)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = isOdd
                          ? 'hsl(var(--bg-surface-raised) / 0.4)'
                          : 'transparent'
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-5 py-4 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">

        {/* Selector de page size */}
        <div className="flex items-center gap-2 font-mono text-xs" style={{ color: 'hsl(var(--text-muted))' }}>
          <span>mostrar</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(v) =>
              onPaginationChange({ pageIndex: 0, pageSize: Number(v) })
            }
          >
            <SelectTrigger
              className="h-8 w-[72px] font-mono text-xs"
              style={{ borderColor: 'hsl(var(--border-default))', borderRadius: 0 }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} className="font-mono">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>por página</span>
        </div>

        {/* Navegación */}
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs tabular-nums" style={{ color: 'hsl(var(--text-muted))' }}>
            página{' '}
            <span style={{ color: 'hsl(var(--text-primary))' }}>
              {pagination.pageIndex + 1}
            </span>
            {' / '}
            <span style={{ color: 'hsl(var(--text-secondary))' }}>
              {pageCount.toLocaleString('es-AR')}
            </span>
          </span>
          <div className="flex gap-2">
            <PageButton
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage() || loading}
            >
              ‹ Anterior
            </PageButton>
            <PageButton
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage() || loading}
            >
              Siguiente ›
            </PageButton>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Subcomponente: botón de paginación ────────────────────────────────────

function PageButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 px-3 text-xs font-mono transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background: 'transparent',
        color: 'hsl(var(--text-secondary))',
        border: '1px solid hsl(var(--border-default))',
        borderRadius: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'hsl(var(--bg-surface-raised))'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}
