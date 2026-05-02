/**
 * Filtros del listado de productos: input de texto + combobox de marca + dropdown de estado.
 */

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MarcaCombobox } from '@/components/MarcaCombobox'
import { type EstadoCertificacion } from '@/lib/api'

const TODOS = '__todos__'

export interface FiltrosProps {
  search: string
  onSearchChange: (v: string) => void
  marca: number | null
  onMarcaChange: (v: number | null) => void
  estado: EstadoCertificacion | null
  onEstadoChange: (v: EstadoCertificacion | null) => void
  total?: number
}

const ESTADOS: { value: EstadoCertificacion; label: string }[] = [
  { value: 'vigente',         label: 'Vigente' },
  { value: 'baja_provisoria', label: 'Baja provisoria' },
  { value: 'baja_permanente', label: 'Baja permanente' },
  { value: 'en_tramite',      label: 'En trámite' },
  { value: 'desconocido',     label: 'Desconocido' },
]

export function Filtros({
  search,
  onSearchChange,
  marca,
  onMarcaChange,
  estado,
  onEstadoChange,
  total,
}: FiltrosProps) {
  const tieneFiltros = !!search || marca !== null || estado !== null

  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Buscar por nombre, fantasía, RNPA o marca…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-sm"
        />

        <MarcaCombobox
          value={marca}
          onChange={onMarcaChange}
          placeholder="Marca"
        />

        <Select
          value={estado ?? TODOS}
          onValueChange={(v) =>
            onEstadoChange(v === TODOS ? null : (v as EstadoCertificacion))
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {ESTADOS.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tieneFiltros && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSearchChange('')
              onMarcaChange(null)
              onEstadoChange(null)
            }}
          >
            Limpiar
          </Button>
        )}
      </div>

      {typeof total === 'number' && (
        <div className="text-sm text-muted-foreground">
          {total === 0
            ? 'Sin resultados'
            : `${total.toLocaleString('es-AR')} producto${total === 1 ? '' : 's'}`}
        </div>
      )}
    </div>
  )
}
