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
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { Button } from '@/components/ui/button'
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
import { api } from '@/lib/api'

export interface MarcaComboboxProps {
  value: number | null
  onChange: (id: number | null) => void
  placeholder?: string
  className?: string
}

export function MarcaCombobox({
  value,
  onChange,
  placeholder = 'Marca',
  className,
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

  // Listado dinámico para el dropdown.
  const optionsQuery = useQuery({
    queryKey: ['filtros-marcas', debouncedSearch],
    queryFn: () => api.filtrosMarcas(debouncedSearch, 30),
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-[240px] justify-between font-normal',
            value === null && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar marca…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {optionsQuery.isFetching && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Buscando…
              </div>
            )}

            {!optionsQuery.isFetching && (
              <>
                {(optionsQuery.data?.data.length ?? 0) === 0 ? (
                  <CommandEmpty>Sin coincidencias</CommandEmpty>
                ) : (
                  <CommandGroup
                    heading={
                      debouncedSearch
                        ? `Coincidencias (${optionsQuery.data?.data.length})`
                        : 'Top marcas'
                    }
                  >
                    {/* Opción "Todas" siempre arriba */}
                    {value !== null && (
                      <CommandItem
                        key="__todas__"
                        value="__todas__"
                        onSelect={() => handleSelect(null)}
                        className="text-muted-foreground"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Quitar filtro
                      </CommandItem>
                    )}

                    {optionsQuery.data?.data.map((m) => (
                      <CommandItem
                        key={m.id_marca}
                        value={`${m.id_marca}-${m.nombre_marca}`}
                        onSelect={() => handleSelect(m.id_marca)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            value === m.id_marca ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="flex-1 truncate">{m.nombre_marca}</span>
                        <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                          {m.total_productos.toLocaleString('es-AR')}
                        </span>
                      </CommandItem>
                    ))}
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
