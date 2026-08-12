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
import { type CategoriaFiltro, type ContextoFiltros } from '@/lib/api'

const TODOS = '__todos__'

export interface FiltrosProps {
  search: string
  onSearchChange: (v: string) => void
  marca: number | null
  onMarcaChange: (v: number | null) => void
  categoria: string | null
  onCategoriaChange: (v: string | null) => void
  /** Ya vienen con el conteo en contexto; las de conteo 0 se ocultan acá. */
  categorias: CategoriaFiltro[]
  /** Filtros activos, para acotar las opciones que ofrece cada desplegable. */
  contexto?: ContextoFiltros
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
  contexto,
}: FiltrosProps) {
  const tieneFiltros = !!search || marca !== null || categoria !== null

  const hijasPor = (idPadre: number) =>
    categorias.filter((c) => c.id_padre === idPadre)

  // Total de un padre = lo suyo más lo de sus hijas, igual que cuando se
  // filtra por su slug (la API resuelve padre → padre + hijas).
  const totalDe = (padre: CategoriaFiltro) =>
    padre.total_productos +
    hijasPor(padre.id_categoria).reduce((s, h) => s + h.total_productos, 0)

  // Poda: se ocultan las categorías sin resultados en el contexto actual, para
  // no ofrecer opciones que devuelven la lista vacía. Un padre sobrevive si él
  // o alguna de sus hijas tiene resultados.
  //
  // Excepción: la categoría seleccionada nunca se oculta. Al elegirla, el
  // contexto pasa a incluirla y el resto se va a cero; si la escondiéramos,
  // el desplegable quedaría mostrando un valor inexistente en su lista.
  const visible = (c: CategoriaFiltro) =>
    c.total_productos > 0 || c.slug === categoria

  const padres = categorias
    .filter((c) => c.id_padre === null)
    .filter((p) => totalDe(p) > 0 || p.slug === categoria ||
      hijasPor(p.id_categoria).some((h) => h.slug === categoria))

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
            contexto={contexto}
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
              {padres.length === 0 && (
                <div
                  className="px-2 py-3 text-xs font-mono"
                  style={{ color: 'hsl(var(--text-muted))' }}
                >
                  sin categorías con resultados
                </div>
              )}
              {padres.map((padre) => {
                const hijas = hijasPor(padre.id_categoria).filter(visible)
                return (
                  <SelectGroup key={padre.id_categoria}>
                    <SelectLabel className="font-semibold">{padre.nombre}</SelectLabel>
                    <SelectItem value={padre.slug}>
                      — Todas ({totalDe(padre).toLocaleString('es-AR')})
                    </SelectItem>
                    {hijas.map((h) => (
                      <SelectItem key={h.id_categoria} value={h.slug}>
                        &nbsp;&nbsp;{h.nombre}{' '}
                        <span style={{ color: 'hsl(var(--text-muted))' }}>
                          ({h.total_productos.toLocaleString('es-AR')})
                        </span>
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
