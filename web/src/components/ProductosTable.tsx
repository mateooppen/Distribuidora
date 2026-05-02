/**
 * Tabla de productos con TanStack Table en modo server-side:
 *   - manualPagination + manualSorting (la API hace el trabajo).
 *   - Columnas con header clickeable para ordenar (nombre, marca, fecha).
 *   - Click en fila no implementado todavía (Iter 4).
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { EstadoCertificacion, ProductoListItem } from '@/lib/api'

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100] as const

// ── Estado → badge ────────────────────────────────────────────────────────

const ESTADO_LABELS: Record<
  EstadoCertificacion,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  vigente:         { label: 'Vigente',         variant: 'default'     },
  baja_provisoria: { label: 'Baja provisoria', variant: 'secondary'   },
  baja_permanente: { label: 'Baja permanente', variant: 'destructive' },
  en_tramite:      { label: 'En trámite',      variant: 'outline'     },
  desconocido:     { label: 'Desconocido',     variant: 'outline'     },
}

function EstadoBadge({ estado }: { estado: EstadoCertificacion }) {
  const { label, variant } = ESTADO_LABELS[estado]
  return <Badge variant={variant}>{label}</Badge>
}

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
          <div className="font-medium leading-snug line-clamp-2">
            {p.nombre_fantasia ?? p.nombre_producto}
          </div>
          {p.nombre_fantasia && (
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
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
    cell: ({ row }) => row.original.nombre_marca,
  },
  {
    id: 'rnpa',
    accessorKey: 'numero_registro',
    header: 'RNPA',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.numero_registro ?? '—'}
      </span>
    ),
  },
  {
    id: 'estado',
    accessorKey: 'estado_certificacion',
    header: 'Estado',
    enableSorting: false,
    cell: ({ row }) => <EstadoBadge estado={row.original.estado_certificacion} />,
  },
  {
    id: 'fecha',
    accessorKey: 'updated_at',
    header: 'Última actualización',
    enableSorting: true,
    cell: ({ row }) =>
      new Date(row.original.updated_at).toLocaleDateString('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
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
    <div className={cn('space-y-3', loading && 'opacity-60')}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortDir = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(canSort && 'cursor-pointer select-none')}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      <div className="inline-flex items-center gap-1.5">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {canSort && (
                          <span className="text-muted-foreground/60">
                            {sortDir === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : sortDir === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5" />
                            )}
                          </span>
                        )}
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-muted-foreground text-sm"
                >
                  {loading ? 'Cargando…' : 'Sin resultados'}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isSelected = row.original.id_producto === selectedId
                return (
                  <TableRow
                    key={row.id}
                    data-state={isSelected ? 'selected' : undefined}
                    className={cn(
                      onRowClick && 'cursor-pointer hover:bg-muted/50 transition-colors',
                      isSelected && 'bg-muted',
                    )}
                    onClick={() => onRowClick?.(row.original.id_producto)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="align-top py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginación + selector de page size */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Mostrar</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(v) =>
              onPaginationChange({ pageIndex: 0, pageSize: Number(v) })
            }
          >
            <SelectTrigger className="h-8 w-[78px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>por página</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            Página {pagination.pageIndex + 1} de {pageCount.toLocaleString('es-AR')}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage() || loading}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage() || loading}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
