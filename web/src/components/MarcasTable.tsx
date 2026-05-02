/**
 * Tabla de marcas con TanStack Table en modo server-side.
 * Click en una marca llama a `onRowClick(id)` (usado para navegar al
 * listado de productos pre-filtrado).
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { MarcaListItem } from '@/lib/api'

const PAGE_SIZE_OPTIONS = [15, 25, 50, 100] as const

const columns: ColumnDef<MarcaListItem>[] = [
  {
    id: 'nombre',
    accessorKey: 'nombre_marca',
    header: 'Marca',
    enableSorting: true,
    cell: ({ row }) => <span className="font-medium">{row.original.nombre_marca}</span>,
  },
  {
    id: 'empresa',
    accessorKey: 'empresa_titular',
    header: 'Empresa titular',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.empresa_titular ?? (
        <span className="text-muted-foreground/60 italic">—</span>
      ),
  },
  {
    id: 'productos',
    accessorKey: 'total_productos',
    header: 'Productos',
    enableSorting: true,
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.total_productos.toLocaleString('es-AR')}
      </span>
    ),
  },
]

export interface MarcasTableProps {
  data: MarcaListItem[]
  total: number
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  loading?: boolean
  onRowClick?: (id: number) => void
}

export function MarcasTable({
  data,
  total,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  loading,
  onRowClick,
}: MarcasTableProps) {
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
                        {flexRender(header.column.columnDef.header, header.getContext())}
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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    onRowClick && 'cursor-pointer hover:bg-muted/50 transition-colors',
                  )}
                  onClick={() => onRowClick?.(row.original.id_marca)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
