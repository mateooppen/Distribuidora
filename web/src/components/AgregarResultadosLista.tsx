/**
 * Acción "agregar todos los resultados de esta búsqueda" a la lista de pedido.
 *
 * ── Por qué el filtro es la selección ───────────────────────────────────────
 *
 * Cuando alguien busca "Schar sin TACC" ya declaró qué quiere; obligarlo a tildar
 * 47 casillas es hacerle repetir esa intención. Por eso el criterio de selección
 * masiva es el filtro activo y no un modo de selección con checkboxes, que además
 * introduciría un segundo estado ("tildado pero todavía no agregado") que se
 * pierde al cambiar de página.
 *
 * ── Guardas ─────────────────────────────────────────────────────────────────
 *
 * - Más de UMBRAL_CONFIRMACION resultados pide confirmación.
 * - Si no entran todos en la lista, el botón queda deshabilitado con el motivo
 *   al lado. No agrega parcialmente: media búsqueda cargada es peor que ninguna,
 *   porque no se ve dónde quedó cortada.
 *
 * La acción está SIEMPRE visible, incluso sin filtros y aunque no entren. Al
 * principio se ocultaba cuando no aplicaba, y el resultado fue que nadie se
 * enteraba de que existía: un control deshabilitado que explica por qué enseña
 * la mecánica; uno ausente no comunica nada.
 */

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ListPlus, Loader2 } from 'lucide-react'
import { api, type ProductoListItem, type ProductosFilters } from '@/lib/api'
import {
  LISTA_MAX_ITEMS,
  useListaPedido,
  type ResultadoAgregarVarios,
} from '@/lib/lista-pedido'

/** A partir de acá se pide confirmación antes de agregar. */
const UMBRAL_CONFIRMACION = 25

/** Tope de la API para `pageSize` (ver api/src/routes/productos.ts). */
const PAGE_SIZE_API = 200

export interface AgregarResultadosListaProps {
  /** Los mismos filtros del listado, sin paginación ni orden. */
  filtros: ProductosFilters
  /** Total de resultados que devolvió la búsqueda. */
  total: number
}

/**
 * Trae hasta `cantidad` productos del filtro. La API topea `pageSize` en 200 y la
 * lista admite hasta 300, así que puede hacer falta más de una página.
 */
async function traerResultados(
  filtros: ProductosFilters,
  cantidad: number,
): Promise<ProductoListItem[]> {
  const acumulado: ProductoListItem[] = []
  let page = 1

  while (acumulado.length < cantidad) {
    const res = await api.productos({ ...filtros, page, pageSize: PAGE_SIZE_API })
    acumulado.push(...res.data)
    if (res.data.length < PAGE_SIZE_API) break
    page++
  }

  return acumulado.slice(0, cantidad)
}

export function AgregarResultadosLista({
  filtros,
  total,
}: AgregarResultadosListaProps) {
  const { total: enLista, agregarVarios, accionDeshacer, deshacer } = useListaPedido()
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoAgregarVarios | null>(null)

  const espacioLibre = LISTA_MAX_ITEMS - enLista
  const entran = total <= espacioLibre

  const agregar = useMutation({
    mutationFn: async () => {
      const productos = await traerResultados(filtros, total)
      return agregarVarios(productos)
    },
    onSuccess: (r) => {
      setResultado(r)
      setConfirmando(false)
    },
  })

  if (total === 0) return null

  const lanzar = () => {
    setResultado(null)
    if (total > UMBRAL_CONFIRMACION) setConfirmando(true)
    else agregar.mutate()
  }

  const etiqueta =
    total === 1
      ? 'Agregar el resultado'
      : `Agregar los ${total.toLocaleString('es-AR')} resultados`

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      {/* ── Estado: agregando ─────────────────────────────────────────── */}
      {agregar.isPending ? (
        <Boton disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
          Agregando {total.toLocaleString('es-AR')}…
        </Boton>
      ) : !entran ? (
        /* ── Estado: no entran ───────────────────────────────────────────
          * El botón queda visible pero deshabilitado: si desapareciera, no
          * habría forma de saber que la acción existe.
          */
        <>
          <Boton disabled>
            <ListPlus className="h-4 w-4" />
            {etiqueta}
          </Boton>
          <Nota tono="alerta">
            No entran en la lista
            {espacioLibre > 0
              ? `: quedan ${espacioLibre} lugares de ${LISTA_MAX_ITEMS}`
              : `: ya está en el máximo de ${LISTA_MAX_ITEMS}`}
            . Afiná la búsqueda{espacioLibre > 0 ? '' : ' o sacá productos'}.
          </Nota>
        </>
      ) : confirmando ? (
        /* ── Estado: confirmando ─────────────────────────────────────── */
        <>
          <Nota>
            ¿Agregar los {total.toLocaleString('es-AR')} resultados de esta
            búsqueda?
          </Nota>
          <Boton tono="primario" onClick={() => agregar.mutate()}>
            Sí, agregar {total.toLocaleString('es-AR')}
          </Boton>
          <Boton onClick={() => setConfirmando(false)}>Cancelar</Boton>
        </>
      ) : (
        /* ── Estado: inicial ─────────────────────────────────────────── */
        <Boton onClick={lanzar}>
          <ListPlus className="h-4 w-4" />
          {etiqueta}
        </Boton>
      )}

      {/* ── Resultado ─────────────────────────────────────────────────── */}
      {agregar.error && (
        <Nota tono="error">
          No se pudieron agregar:{' '}
          {agregar.error instanceof Error ? agregar.error.message : 'error desconocido'}
        </Nota>
      )}

      {resultado && !agregar.isPending && (
        <div className="flex items-center gap-3">
          <Nota tono="ok">{resumen(resultado)}</Nota>
          {accionDeshacer && (
            <button
              type="button"
              onClick={() => {
                deshacer()
                setResultado(null)
              }}
              className="font-mono text-xs uppercase tracking-widest hover:underline"
              style={{ color: 'hsl(var(--accent-color))' }}
            >
              Deshacer
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** "47 agregados · 3 ya estaban · 1 sin RNPA" — se omiten los conteos en cero. */
function resumen(r: ResultadoAgregarVarios): string {
  const partes = [`${r.agregados} agregado${r.agregados === 1 ? '' : 's'}`]
  if (r.duplicados > 0) partes.push(`${r.duplicados} ya ${r.duplicados === 1 ? 'estaba' : 'estaban'}`)
  if (r.rechazados > 0) partes.push(`${r.rechazados} sin RNPA válido`)
  if (r.excedentes > 0) partes.push(`${r.excedentes} no ${r.excedentes === 1 ? 'entró' : 'entraron'}`)
  return partes.join(' · ')
}

// ── Subcomponentes ────────────────────────────────────────────────────────

function Boton({
  children,
  onClick,
  disabled,
  tono = 'neutro',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  tono?: 'neutro' | 'primario'
}) {
  const estilo =
    tono === 'primario'
      ? {
          background: 'hsl(var(--accent-color))',
          color: 'hsl(var(--bg-surface))',
          border: '1px solid hsl(var(--accent-color))',
        }
      : {
          background: 'transparent',
          color: 'hsl(var(--text-secondary))',
          border: '1px solid hsl(var(--border-default))',
        }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 px-3 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ ...estilo, borderRadius: 0 }}
    >
      {children}
    </button>
  )
}

function Nota({
  children,
  tono = 'neutro',
}: {
  children: React.ReactNode
  tono?: 'neutro' | 'alerta' | 'error' | 'ok'
}) {
  const color =
    tono === 'alerta'
      ? 'hsl(var(--state-revision))'
      : tono === 'error'
        ? 'hsl(var(--state-vencido))'
        : tono === 'ok'
          ? 'hsl(var(--state-vigente))'
          : 'hsl(var(--text-secondary))'

  return (
    <span
      className="font-mono text-xs leading-relaxed"
      style={{ color }}
    >
      {children}
    </span>
  )
}
