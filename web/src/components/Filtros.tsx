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
}

// Label común para cada filtro — estilo "$ ..." consistente con la home
function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-mono uppercase tracking-widest mb-1.5"
      style={{ color: 'hsl(var(--text-muted))' }}
    >
      $ {children}
    </label>
  )
}

export function Filtros({
  search,
  onSearchChange,
  marca,
  onMarcaChange,
  categoria,
  onCategoriaChange,
  categorias,
}: FiltrosProps) {
  const tieneFiltros = !!search || marca !== null || categoria !== null

  const padres = categorias.filter((c) => c.id_padre === null)
  const hijasPor = (idPadre: number) =>
    categorias.filter((c) => c.id_padre === idPadre)

  return (
    <div
      className="mb-6 p-5"
      style={{
        background: 'hsl(var(--bg-surface))',
        border: '1px solid hsl(var(--border-default))',
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-4 items-end">

        {/* Búsqueda con prefijo > estilo terminal */}
        <div>
          <FilterLabel>buscar</FilterLabel>
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
              placeholder="nombre, fantasía, RNPA o marca…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-10 text-sm font-mono flex-1"
              style={{
                borderColor: 'hsl(var(--border-default))',
                borderRadius: 0,
              }}
            />
          </div>
        </div>

        {/* Marca */}
        <div>
          <FilterLabel>marca</FilterLabel>
          <MarcaCombobox
            value={marca}
            onChange={onMarcaChange}
            placeholder="Todas las marcas"
          />
        </div>

        {/* Categoría */}
        <div>
          <FilterLabel>categoría</FilterLabel>
          <Select
            value={categoria ?? TODOS}
            onValueChange={(v) => onCategoriaChange(v === TODOS ? null : v)}
          >
            <SelectTrigger
              className="h-10 font-mono text-sm"
              style={{
                borderColor: 'hsl(var(--border-default))',
                borderRadius: 0,
                background: 'hsl(var(--bg-surface))',
              }}
            >
              <SelectValue placeholder="Todas las categorías" />
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
        </div>

        {/* Botón Limpiar — visible solo si hay filtros activos */}
        <div>
          {/* Spacer para alinear con los otros campos (que tienen label encima) */}
          <div className="h-[22px]" />
          <button
            onClick={() => {
              onSearchChange('')
              onMarcaChange(null)
              onCategoriaChange(null)
            }}
            disabled={!tieneFiltros}
            className="h-10 px-4 text-xs font-mono uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'transparent',
              color: 'hsl(var(--text-secondary))',
              border: '1px solid hsl(var(--border-default))',
              borderRadius: 0,
            }}
            onMouseEnter={(e) => {
              if (tieneFiltros) e.currentTarget.style.background = 'hsl(var(--bg-surface-raised))'
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
  )
}
