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
import { BotonAgregarLista } from '@/components/BotonAgregarLista'
import { cn } from '@/lib/utils'
import type { ProductoListItem } from '@/lib/api'

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100] as const

/**
 * La columna de acción no es una columna de datos: no se ordena, no lleva el
 * prefijo "$" del header y queda fija a la derecha al scrollear en horizontal
 * (en mobile la tabla desborda y el botón quedaría fuera de alcance).
 */
const ACCION_COL = 'accion'

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
  {
    id: ACCION_COL,
    header: () => <span className="sr-only">Agregar a la lista de pedido</span>,
    enableSorting: false,
    cell: ({ row }) => <BotonAgregarLista producto={row.original} />,
  },
]

/**
 * Fondo de la celda sticky. Tiene que ser opaca (si no, el contenido de las otras
 * columnas se ve pasar por debajo al scrollear en horizontal), pero el zebra y el
 * hover de la fila son semitransparentes. Se compone el tinte —que la fila expone
 * en `--fila-tinte`— sobre una base opaca, en vez de aplanarlo a un color fijo.
 */
function fondoSticky(): string {
  return 'linear-gradient(var(--fila-tinte), var(--fila-tinte)), hsl(var(--bg-surface))'
}

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
      {/* ── Mobile: tarjetas ───────────────────────────────────────────
        * Cuatro columnas no entran en 375px. Antes la tabla scrolleaba en
        * horizontal con la columna de acción fija encima, y el RNPA quedaba
        * tapado debajo del botón. Acá cada producto es una tarjeta y no hay
        * scroll horizontal en ninguna parte.
        */}
      <div className="sm:hidden">
        <OrdenMobile sorting={sorting} onSortingChange={onSortingChange} />

        {loading && data.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: Math.min(pagination.pageSize, 8) }).map((_, i) => (
              <div
                key={`sk-${i}`}
                className="p-4 flex items-start gap-3"
                style={{
                  background: 'hsl(var(--bg-surface))',
                  border: '1px solid hsl(var(--border-default))',
                }}
              >
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
                <Skeleton className="h-11 w-11 shrink-0" />
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <SinResultados enmarcado />
        ) : (
          <ul className="space-y-2">
            {data.map((p) => (
              <TarjetaProducto
                key={p.id_producto}
                producto={p}
                seleccionado={p.id_producto === selectedId}
                onClick={() => onRowClick?.(p.id_producto)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── Desktop: tabla ─────────────────────────────────────────── */}
      <div
        className="hidden sm:block overflow-x-auto"
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
                  const esAccion = header.column.id === ACCION_COL
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'h-11 text-left align-middle font-mono text-[11px] uppercase tracking-widest font-semibold whitespace-nowrap',
                        esAccion ? 'w-px pl-2 pr-3 sticky right-0 z-10' : 'px-5',
                        canSort && 'cursor-pointer select-none hover:opacity-80 transition-opacity',
                      )}
                      style={{
                        color: 'hsl(var(--text-muted))',
                        ...(esAccion
                          ? {
                              background: 'hsl(var(--bg-surface-raised))',
                              borderLeft: '1px solid hsl(var(--border-subtle))',
                            }
                          : null),
                      }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="inline-flex items-center gap-2">
                        {!esAccion && <span>$</span>}
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
                  {/* Acción */}
                  <td className="pl-2 pr-3 py-3 align-middle">
                    <Skeleton className="h-11 w-11" />
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
                  <SinResultados />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, idx) => {
                const isSelected = row.original.id_producto === selectedId
                const isOdd = idx % 2 === 1
                // Zebra muy sutil para guiar la lectura horizontal
                const tinte = isSelected
                  ? 'hsl(var(--accent-color) / 0.08)'
                  : isOdd
                    ? 'hsl(var(--bg-surface-raised) / 0.4)'
                    : null
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original.id_producto)}
                    className={cn(
                      'transition-colors',
                      onRowClick && 'cursor-pointer',
                    )}
                    style={
                      {
                        // El tinte va en una custom property y no directo en
                        // `background` porque la celda sticky lo necesita para
                        // componerlo sobre su base opaca. Si el hover pintara
                        // solo el <tr>, la última columna quedaría sin iluminar.
                        '--fila-tinte': tinte ?? 'transparent',
                        background: 'var(--fila-tinte)',
                        borderBottom: '1px solid hsl(var(--border-subtle))',
                        // Barra de selección a la izquierda
                        boxShadow: isSelected
                          ? 'inset 3px 0 0 0 hsl(var(--accent-color))'
                          : 'none',
                      } as React.CSSProperties
                    }
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.setProperty(
                          '--fila-tinte',
                          'hsl(var(--bg-surface-raised) / 0.8)',
                        )
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.setProperty(
                          '--fila-tinte',
                          tinte ?? 'transparent',
                        )
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const esAccion = cell.column.id === ACCION_COL
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            esAccion
                              ? 'pl-2 pr-3 py-3 align-middle sticky right-0 z-10'
                              : 'px-5 py-4 align-top',
                          )}
                          style={
                            esAccion
                              ? {
                                  background: fondoSticky(),
                                  borderLeft: '1px solid hsl(var(--border-subtle))',
                                }
                              : undefined
                          }
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
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

// ── Subcomponentes: mobile ────────────────────────────────────────────────

/**
 * Un producto como tarjeta. Toda la tarjeta abre el detalle; el [+] agrega a la
 * lista y frena la propagación para no abrirlo.
 */
function TarjetaProducto({
  producto,
  seleccionado,
  onClick,
}: {
  producto: ProductoListItem
  seleccionado: boolean
  onClick: () => void
}) {
  return (
    <li
      onClick={onClick}
      className="p-4 flex items-start gap-3 cursor-pointer transition-colors"
      style={{
        background: seleccionado
          ? 'hsl(var(--accent-color) / 0.08)'
          : 'hsl(var(--bg-surface))',
        border: '1px solid hsl(var(--border-default))',
        boxShadow: seleccionado ? 'inset 3px 0 0 0 hsl(var(--accent-color))' : 'none',
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="font-sans font-semibold text-sm leading-snug line-clamp-2"
          style={{ color: 'hsl(var(--text-primary))' }}
        >
          {producto.nombre_fantasia ?? producto.nombre_producto}
        </div>

        {producto.nombre_fantasia && (
          <div
            className="text-xs font-mono mt-1 line-clamp-2"
            style={{ color: 'hsl(var(--text-muted))' }}
          >
            {producto.nombre_producto}
          </div>
        )}

        {/* Marca y RNPA en una línea: son los dos datos de identificación y
          * cada uno solo no justifica su propio renglón. */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-2">
          <span
            className="font-sans text-xs"
            style={{ color: 'hsl(var(--text-secondary))' }}
          >
            {producto.nombre_marca}
          </span>
          <span style={{ color: 'hsl(var(--border-default))' }}>·</span>
          <span
            className="font-mono text-[11px]"
            style={{ color: 'hsl(var(--text-muted))' }}
          >
            {producto.numero_registro ?? '—'}
          </span>
        </div>
      </div>

      <BotonAgregarLista producto={producto} className="-mt-1 -mr-1" />
    </li>
  )
}

/**
 * Ordenamiento para mobile. En la tabla vive en los encabezados de columna, que
 * en tarjetas no existen: sin esto se perdería la funcionalidad.
 */
function OrdenMobile({
  sorting,
  onSortingChange,
}: {
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
}) {
  const actual = sorting[0]

  /*
   * `SIN_COLUMNA` es un centinela y no la cadena vacía: Radix reserva `value=""`
   * para limpiar la selección y tira si un SelectItem la usa — con el listado en
   * tarjetas eso rompía toda la pantalla en mobile.
   *
   * Sin columna elegida, la página ordena por relevancia si hay búsqueda y
   * alfabéticamente si no la hay (ver ProductosPage).
   */
  const SIN_COLUMNA = 'auto'

  const opciones = [
    { id: SIN_COLUMNA, label: 'Relevancia' },
    { id: 'nombre:asc', label: 'Producto A→Z' },
    { id: 'nombre:desc', label: 'Producto Z→A' },
    { id: 'marca:asc', label: 'Marca A→Z' },
    { id: 'marca:desc', label: 'Marca Z→A' },
  ] as const

  const valor = actual
    ? `${actual.id}:${actual.desc ? 'desc' : 'asc'}`
    : SIN_COLUMNA

  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className="font-mono text-[11px] uppercase tracking-widest shrink-0"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        $ orden
      </span>
      <Select
        value={valor}
        onValueChange={(v) => {
          if (!v || v === SIN_COLUMNA) return onSortingChange([])
          const [id, dir] = v.split(':')
          onSortingChange([{ id: id!, desc: dir === 'desc' }])
        }}
      >
        <SelectTrigger
          className="h-9 flex-1 font-mono text-xs"
          style={{ borderColor: 'hsl(var(--border-default))', borderRadius: 0 }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((o) => (
            <SelectItem key={o.id} value={o.id} className="font-mono text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * `enmarcado` solo en mobile: en desktop esto va dentro de un <td> que ya está
 * adentro del recuadro de la tabla, y un borde más quedaría anidado.
 */
function SinResultados({ enmarcado = false }: { enmarcado?: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-12"
      style={
        enmarcado
          ? {
              background: 'hsl(var(--bg-surface))',
              border: '1px solid hsl(var(--border-default))',
            }
          : undefined
      }
    >
      <span className="font-mono text-2xl" style={{ color: 'hsl(var(--text-muted))' }}>
        ∅
      </span>
      <p
        className="font-mono text-sm font-semibold"
        style={{ color: 'hsl(var(--text-secondary))' }}
      >
        Sin resultados
      </p>
      <p className="font-mono text-xs" style={{ color: 'hsl(var(--text-muted))' }}>
        Probá modificar la búsqueda o limpiar los filtros.
      </p>
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
