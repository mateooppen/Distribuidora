/**
 * Combobox de marcas con autocomplete server-side.
 *
 * Sin `q`: API devuelve top-30 marcas por cantidad de productos.
 * Con `q`: API filtra por nombre y devuelve hasta 30 matches (también por
 *          cantidad de productos). El usuario nunca tiene 4951 items en el DOM.
 *
 * `value` y `onChange` operan solo con id; el componente resuelve el nombre
 * de la marca seleccionada llamando a /api/marcas/:id si hace falta.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronsUpDown } from 'lucide-react'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { api, type ContextoFiltros } from '@/lib/api'

export interface MarcaComboboxProps {
  value: number | null
  onChange: (id: number | null) => void
  placeholder?: string
  className?: string
  /**
   * Filtros activos del listado. Acota las marcas ofrecidas a las que tienen
   * productos en ese contexto: buscando "harina de arroz" aparecen las marcas
   * que la producen, no las 4.951 del padrón. La marca ya elegida no se
   * incluye en el contexto (lo ignora la API), así se puede saltar de una a
   * otra sin limpiar el filtro primero.
   */
  contexto?: ContextoFiltros
}

export function MarcaCombobox({
  value,
  onChange,
  placeholder = 'Todas las marcas',
  className,
  contexto,
}: MarcaComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)

  // Resolver el nombre de la marca seleccionada (si hay una).
  const selectedQuery = useQuery({
    queryKey: ['marca-by-id', value],
    queryFn: () => api.marcaById(value!),
    enabled: value !== null,
    staleTime: 5 * 60_000,
  })

  // Listado dinámico para el dropdown. El contexto entra en la queryKey para
  // que cambiar la búsqueda o la categoría refresque las marcas ofrecidas.
  const optionsQuery = useQuery({
    queryKey: ['filtros-marcas', debouncedSearch, contexto],
    queryFn: () => api.filtrosMarcas(debouncedSearch, 30, contexto),
    enabled: open,
    staleTime: 60_000,
  })

  const selectedNombre = value !== null
    ? selectedQuery.data?.data.nombre_marca
    : null

  const triggerLabel = value === null
    ? placeholder
    : selectedNombre ?? `Marca #${value}`

  const handleSelect = (id: number | null) => {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  const hayMarca = value !== null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full h-10 px-3 flex items-center justify-between gap-2 font-mono text-sm transition-colors',
            className,
          )}
          style={{
            background: 'hsl(var(--bg-surface))',
            color: hayMarca
              ? 'hsl(var(--text-primary))'
              : 'hsl(var(--text-muted))',
            border: '1px solid hsl(var(--border-default))',
            borderRadius: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'hsl(var(--bg-surface-raised))'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'hsl(var(--bg-surface))'
          }}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronsUpDown
            className="h-4 w-4 shrink-0"
            style={{ color: 'hsl(var(--text-muted))', opacity: 0.6 }}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[320px] p-0"
        align="start"
        style={{
          background: 'hsl(var(--bg-surface))',
          border: '1px solid hsl(var(--border-default))',
          borderRadius: 0,
        }}
      >
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            placeholder="buscar marca…"
            value={search}
            onValueChange={setSearch}
            className="font-mono text-sm"
          />
          <CommandList>
            {optionsQuery.isFetching && (
              <div
                className="px-3 py-6 text-center font-mono text-xs"
                style={{ color: 'hsl(var(--text-muted))' }}
              >
                buscando…
              </div>
            )}

            {!optionsQuery.isFetching && (
              <>
                {(optionsQuery.data?.data.length ?? 0) === 0 ? (
                  <CommandEmpty>
                    <span className="font-mono text-xs" style={{ color: 'hsl(var(--text-muted))' }}>
                      sin coincidencias
                    </span>
                  </CommandEmpty>
                ) : (
                  <CommandGroup
                    heading={
                      <span
                        className="font-mono text-[11px] uppercase tracking-widest"
                        style={{ color: 'hsl(var(--text-muted))' }}
                      >
                        ${' '}
                        {debouncedSearch
                          ? `coincidencias (${optionsQuery.data?.data.length})`
                          : (contexto?.q || contexto?.categoria)
                            // Con filtros activos ya no son "las top" del padrón
                            // sino las que tienen productos en ese contexto.
                            ? `marcas disponibles (${optionsQuery.data?.data.length})`
                            : 'top marcas'}
                      </span>
                    }
                  >
                    {/* Quitar filtro — sólo si hay marca seleccionada */}
                    {hayMarca && (
                      <CommandItem
                        key="__todas__"
                        value="__todas__"
                        onSelect={() => handleSelect(null)}
                        className="font-mono text-xs"
                        style={{ color: 'hsl(var(--state-vencido))' }}
                      >
                        <span className="mr-2">×</span>
                        Quitar filtro
                      </CommandItem>
                    )}

                    {optionsQuery.data?.data.map((m) => {
                      const isActive = value === m.id_marca
                      return (
                        <CommandItem
                          key={m.id_marca}
                          value={`${m.id_marca}-${m.nombre_marca}`}
                          onSelect={() => handleSelect(m.id_marca)}
                          className="font-mono text-sm"
                        >
                          {/* Indicador de selección: punto de color */}
                          <span
                            className="mr-2 inline-block w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              background: isActive
                                ? 'hsl(var(--accent-color))'
                                : 'transparent',
                            }}
                          />
                          <span
                            className="flex-1 truncate"
                            style={{
                              color: isActive
                                ? 'hsl(var(--accent-color))'
                                : 'hsl(var(--text-primary))',
                              fontWeight: isActive ? 600 : 400,
                            }}
                          >
                            {m.nombre_marca}
                          </span>
                          <span
                            className="ml-2 text-[11px] tabular-nums"
                            style={{ color: 'hsl(var(--text-muted))' }}
                          >
                            {m.total_productos.toLocaleString('es-AR')}
                          </span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
