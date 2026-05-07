import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MarcaCombobox } from '@/components/MarcaCombobox'
import { type CategoriaFiltro } from '@/lib/api'

const TODOS = '__todos__'

export interface FiltrosProps {
  search: string
  onSearchChange: (v: string) => void
  marca: number | null
  onMarcaChange: (v: number | null) => void
  categoria: string | null
  onCategoriaChange: (v: string | null) => void
  categorias: CategoriaFiltro[]
  total?: number
}

export function Filtros({
  search,
  onSearchChange,
  marca,
  onMarcaChange,
  categoria,
  onCategoriaChange,
  categorias,
  total,
}: FiltrosProps) {
  const tieneFiltros = !!search || marca !== null || categoria !== null

  const padres = categorias.filter((c) => c.id_padre === null)
  const hijasPor = (idPadre: number) =>
    categorias.filter((c) => c.id_padre === idPadre)

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
          value={categoria ?? TODOS}
          onValueChange={(v) => onCategoriaChange(v === TODOS ? null : v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas las categorías</SelectItem>
            {padres.map((padre) => {
              const hijas = hijasPor(padre.id_categoria)
              return (
                <SelectGroup key={padre.id_categoria}>
                  <SelectLabel className="font-semibold">{padre.nombre}</SelectLabel>
                  <SelectItem value={padre.slug}>
                    — Todas ({padre.nombre})
                  </SelectItem>
                  {hijas.map((h) => (
                    <SelectItem key={h.id_categoria} value={h.slug}>
                      &nbsp;&nbsp;{h.nombre}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )
            })}
          </SelectContent>
        </Select>

        {tieneFiltros && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSearchChange('')
              onMarcaChange(null)
              onCategoriaChange(null)
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
