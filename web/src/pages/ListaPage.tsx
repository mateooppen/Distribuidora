/**
 * Página de la lista de pedido: la revisión final antes de mandarle el Excel al
 * proveedor.
 *
 * Es el otro momento del panel lateral. El panel sirve para el bucle rápido
 * mientras se busca (ver qué llevo, sacar un error, seguir); acá se revisa todo
 * junto con espacio, y de acá sale el archivo.
 *
 * Al montar revalida contra la API: la lista vive en el navegador por RNPA y la
 * base se regenera entera en cada release, así que los nombres del snapshot
 * pueden estar viejos y algún producto puede haberse caído del catálogo.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Loader2, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type EstadoCertificacion } from '@/lib/api'
import { entregarArchivo } from '@/lib/entregar-archivo'
import {
  agruparPorMarca,
  nombreVisible,
  useListaPedido,
  type ItemLista,
} from '@/lib/lista-pedido'
import { cn } from '@/lib/utils'

export function ListaPage() {
  const {
    items,
    total,
    sinPersistencia,
    quitar,
    vaciar,
    sincronizar,
    accionDeshacer,
    deshacer,
  } = useListaPedido()

  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false)
  const [avisoEntrega, setAvisoEntrega] = useState<string | null>(null)

  // Ordenados para que la clave de la query no cambie por el orden de carga.
  const rnpas = useMemo(
    () => items.map((it) => it.rnpa).sort((a, b) => a.localeCompare(b)),
    [items],
  )

  const resolverQuery = useQuery({
    queryKey: ['lista-resolver', rnpas],
    // El refresco del snapshot va acá y no en un efecto: pasa una vez por fetch
    // en vez de una por render, y evita encadenar renders. `sincronizar` tiene
    // identidad estable, así que no realimenta la query.
    queryFn: async () => {
      const res = await api.listaResolver(rnpas)
      sincronizar(res.encontrados)
      return res
    },
    enabled: rnpas.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  const faltantes = useMemo(
    () => new Set(resolverQuery.data?.faltantes ?? []),
    [resolverQuery.data],
  )

  // Un producto puede seguir en el catálogo pero haber pasado a baja desde que
  // se agregó. Se exporta igual —el proveedor decide— pero conviene avisarlo.
  const estadoPorRnpa = useMemo(() => {
    const mapa = new Map<string, EstadoCertificacion>()
    for (const p of resolverQuery.data?.encontrados ?? []) {
      if (p.numero_registro) mapa.set(p.numero_registro, p.estado_certificacion)
    }
    return mapa
  }, [resolverQuery.data])

  const exportar = useMutation({
    mutationFn: async () => {
      const archivo = await api.listaExport(rnpas)
      return entregarArchivo(archivo)
    },
    onSuccess: (resultado) => {
      setAvisoEntrega(
        resultado === 'compartido'
          ? 'Listo, se compartió el archivo.'
          : resultado === 'descargado'
            ? 'Se descargó el Excel del pedido.'
            : null,
      )
    },
  })

  const grupos = agruparPorMarca(items)
  const exportables = total - faltantes.size

  return (
    <div
      className="min-h-[calc(100vh-3.5rem)]"
      style={{ background: 'hsl(var(--bg-base))' }}
    >
      <div className="container mx-auto py-6 px-4 sm:py-10 sm:px-6 max-w-[1000px] pb-32">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="flex items-baseline justify-between gap-4 flex-wrap mb-6 sm:mb-8">
          <div>
            <h1 className="font-mono leading-none mb-3">
              <span
                className="text-4xl sm:text-5xl font-bold tracking-tight"
                style={{ color: 'hsl(var(--text-primary))' }}
              >
                Lista de pedido
              </span>
            </h1>
            <p
              className="text-sm font-mono"
              style={{ color: 'hsl(var(--text-secondary))' }}
            >
              Revisá antes de exportar y mandarle el Excel al proveedor.
            </p>
          </div>

          {total > 0 && (
            <div className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
              <p
                className="text-xs font-mono uppercase tracking-widest"
                style={{ color: 'hsl(var(--text-muted))' }}
              >
                productos
              </p>
              <p
                className="text-2xl sm:text-3xl font-mono font-bold tabular-nums leading-none"
                style={{ color: 'hsl(var(--accent-color))' }}
              >
                {total}
              </p>
            </div>
          )}
        </header>

        {/* ── Avisos ───────────────────────────────────────────────────── */}
        <div className="space-y-2 mb-6 empty:mb-0">
          {sinPersistencia && (
            <Aviso tono="alerta">
              No se pudo guardar en este navegador (¿ventana privada?). La lista
              funciona, pero se pierde al cerrar la pestaña.
            </Aviso>
          )}

          {resolverQuery.error && (
            <Aviso tono="error">
              No se pudo verificar la lista contra el catálogo:{' '}
              {resolverQuery.error instanceof Error
                ? resolverQuery.error.message
                : 'error desconocido'}
              . Se muestran los datos guardados en este navegador.
            </Aviso>
          )}

          {faltantes.size > 0 && (
            <Aviso tono="alerta">
              {faltantes.size === 1
                ? '1 producto ya no figura en el catálogo de ANMAT'
                : `${faltantes.size} productos ya no figuran en el catálogo de ANMAT`}
              . Quedan marcados abajo y no se incluyen en el Excel.
            </Aviso>
          )}

          {exportar.error && (
            <Aviso tono="error">
              No se pudo generar el Excel:{' '}
              {exportar.error instanceof Error
                ? exportar.error.message
                : 'error desconocido'}
            </Aviso>
          )}

          {avisoEntrega && (
            <Aviso tono="ok" onCerrar={() => setAvisoEntrega(null)}>
              {avisoEntrega}
            </Aviso>
          )}

          {accionDeshacer && (
            <div
              className="flex items-center justify-between gap-3 px-3 py-2"
              style={{
                background: 'hsl(var(--bg-surface-raised))',
                border: '1px solid hsl(var(--border-default))',
              }}
            >
              <span
                className="font-mono text-xs leading-snug min-w-0 truncate"
                style={{ color: 'hsl(var(--text-secondary))' }}
              >
                {accionDeshacer.mensaje}
              </span>
              <button
                type="button"
                onClick={deshacer}
                className="font-mono text-xs uppercase tracking-widest shrink-0 hover:underline"
                style={{ color: 'hsl(var(--accent-color))' }}
              >
                Deshacer
              </button>
            </div>
          )}
        </div>

        {/* ── Contenido ────────────────────────────────────────────────── */}
        {total === 0 ? (
          <ListaVacia />
        ) : resolverQuery.isLoading ? (
          <GruposSkeleton />
        ) : (
          <div className="space-y-8">
            {grupos.map((grupo) => (
              <section key={grupo.marca}>
                <div
                  className="flex items-baseline gap-2 mb-2 pb-2"
                  style={{ borderBottom: '2px solid hsl(var(--border-default))' }}
                >
                  <h2
                    className="font-mono text-sm uppercase tracking-widest font-semibold"
                    style={{ color: 'hsl(var(--text-primary))' }}
                  >
                    {grupo.marca}
                  </h2>
                  <span
                    className="font-mono text-xs tabular-nums"
                    style={{ color: 'hsl(var(--accent-color))' }}
                  >
                    [{grupo.items.length}]
                  </span>
                </div>

                <ul>
                  {grupo.items.map((item) => (
                    <Fila
                      key={item.rnpa}
                      item={item}
                      falta={faltantes.has(item.rnpa)}
                      estado={estadoPorRnpa.get(item.rnpa)}
                      onQuitar={() => quitar(item.rnpa)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* ── Barra de acciones ──────────────────────────────────────────────
        * Fija abajo: en una lista larga el botón de exportar quedaría al final
        * de todo, y en mobile fuera del alcance del pulgar.
        */}
      {total > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30"
          style={{
            background: 'hsl(var(--bg-surface))',
            borderTop: '1px solid hsl(var(--border-default))',
          }}
        >
          {/*
            * Mobile: el contador arriba y los botones abajo. En una sola fila, el
            * texto ("12 en el Excel · 288 sin catálogo") desbordaba su caja y la
            * barra crecía hasta ocupar un quinto de la pantalla.
            */}
          <div className="container mx-auto max-w-[1000px] px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <p
              className="min-w-0 sm:flex-1 font-mono text-xs tabular-nums leading-snug"
              style={{ color: 'hsl(var(--text-secondary))' }}
            >
              {confirmandoVaciar ? (
                <>¿Sacar los {total} productos de la lista?</>
              ) : (
                <>
                  {exportables} en el Excel
                  {faltantes.size > 0 && (
                    <span style={{ color: 'hsl(var(--text-muted))' }}>
                      {' · '}
                      {faltantes.size} sin catálogo
                    </span>
                  )}
                </>
              )}
            </p>

            <div className="flex items-center gap-2">
              {confirmandoVaciar ? (
                <>
                  <BotonBarra
                    tono="peligro"
                    className="flex-1 sm:flex-none"
                    onClick={() => {
                      vaciar()
                      setConfirmandoVaciar(false)
                    }}
                  >
                    Sí, vaciar
                  </BotonBarra>
                  <BotonBarra
                    className="flex-1 sm:flex-none"
                    onClick={() => setConfirmandoVaciar(false)}
                  >
                    Cancelar
                  </BotonBarra>
                </>
              ) : (
                <>
                  <BotonBarra onClick={() => setConfirmandoVaciar(true)}>
                    Vaciar
                  </BotonBarra>
                  <BotonBarra
                    tono="primario"
                    className="flex-1 sm:flex-none"
                    onClick={() => {
                      setAvisoEntrega(null)
                      exportar.mutate()
                    }}
                    disabled={exportar.isPending || exportables === 0}
                  >
                    {exportar.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generando…
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Exportar a Excel
                      </>
                    )}
                  </BotonBarra>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────

function Fila({
  item,
  falta,
  estado,
  onQuitar,
}: {
  item: ItemLista
  falta: boolean
  estado: EstadoCertificacion | undefined
  onQuitar: () => void
}) {
  const dadoDeBaja =
    !falta && estado !== undefined && estado !== 'vigente'

  return (
    <li
      className={cn(
        'grid items-start gap-x-4 gap-y-1 py-3',
        'grid-cols-[1fr_44px] sm:grid-cols-[1fr_160px_44px]',
      )}
      style={{
        borderBottom: '1px solid hsl(var(--border-subtle))',
        opacity: falta ? 0.55 : 1,
      }}
    >
      <div className="min-w-0">
        <div
          className="text-sm font-sans font-medium leading-snug"
          style={{ color: 'hsl(var(--text-primary))' }}
        >
          {nombreVisible(item)}
        </div>

        {/* En mobile el RNPA va debajo del nombre; en desktop tiene su columna. */}
        <div
          className="sm:hidden font-mono text-[11px] mt-0.5"
          style={{ color: 'hsl(var(--text-muted))' }}
        >
          {item.rnpa}
        </div>

        {(falta || dadoDeBaja) && (
          <span
            className="inline-block mt-1 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
            style={{
              border: `1px solid hsl(var(--state-${falta ? 'vencido' : 'revision'}))`,
              color: `hsl(var(--state-${falta ? 'vencido' : 'revision'}))`,
            }}
          >
            {falta ? 'no figura en el catálogo' : `certificación: ${estado}`}
          </span>
        )}
      </div>

      <div
        className="hidden sm:block font-mono text-xs pt-0.5"
        style={{ color: 'hsl(var(--text-secondary))' }}
      >
        {item.rnpa}
      </div>

      <button
        type="button"
        onClick={onQuitar}
        className="h-11 w-11 -my-1.5 inline-flex items-center justify-center shrink-0 transition-colors"
        style={{ background: 'transparent', color: 'hsl(var(--text-muted))', borderRadius: 0 }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'hsl(var(--state-vencido))'
          e.currentTarget.style.background = 'hsl(var(--state-vencido) / 0.08)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'hsl(var(--text-muted))'
          e.currentTarget.style.background = 'transparent'
        }}
        aria-label={`Quitar ${nombreVisible(item)} de la lista`}
        title="Quitar de la lista"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  )
}

function BotonBarra({
  children,
  onClick,
  disabled,
  tono = 'neutro',
  className,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tono?: 'neutro' | 'primario' | 'peligro'
  className?: string
}) {
  const estilo =
    tono === 'primario'
      ? {
          background: 'hsl(var(--accent-color))',
          color: 'hsl(var(--bg-surface))',
          border: '1px solid hsl(var(--accent-color))',
        }
      : tono === 'peligro'
        ? {
            background: 'hsl(var(--state-vencido) / 0.1)',
            color: 'hsl(var(--state-vencido))',
            border: '1px solid hsl(var(--state-vencido))',
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
      className={cn(
        'h-11 px-4 inline-flex items-center justify-center gap-2 shrink-0',
        'font-mono text-xs uppercase tracking-widest transition-opacity',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      style={{ ...estilo, borderRadius: 0 }}
    >
      {children}
    </button>
  )
}

function Aviso({
  tono,
  children,
  onCerrar,
}: {
  tono: 'alerta' | 'error' | 'ok'
  children: React.ReactNode
  onCerrar?: () => void
}) {
  const color =
    tono === 'error'
      ? 'hsl(var(--state-vencido))'
      : tono === 'ok'
        ? 'hsl(var(--state-vigente))'
        : 'hsl(var(--state-revision))'

  return (
    <div
      className="flex items-start justify-between gap-3 px-3 py-2 font-mono text-xs leading-relaxed"
      style={{ border: `1px solid ${color}`, color }}
    >
      <span>{children}</span>
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          className="shrink-0 font-mono text-sm leading-none"
          aria-label="Cerrar aviso"
        >
          ×
        </button>
      )}
    </div>
  )
}

function GruposSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map((g) => (
        <section key={g}>
          <Skeleton className="h-5 w-40 mb-3" />
          {[0, 1, 2].map((f) => (
            <div key={f} className="py-3 flex items-center gap-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-24 hidden sm:block" />
              <Skeleton className="h-11 w-11" />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function ListaVacia() {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-24">
      <span className="font-mono text-3xl" style={{ color: 'hsl(var(--text-muted))' }}>
        ∅
      </span>
      <p
        className="font-mono text-sm font-semibold"
        style={{ color: 'hsl(var(--text-secondary))' }}
      >
        Tu lista está vacía
      </p>
      <p
        className="font-mono text-xs leading-relaxed max-w-[34ch]"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        Agregá productos con el botón + desde el listado y volvé acá para
        exportarlos.
      </p>
      <Link
        to="/productos"
        className="mt-2 h-11 px-5 inline-flex items-center font-mono text-xs uppercase tracking-widest transition-opacity hover:opacity-90"
        style={{
          background: 'hsl(var(--accent-color))',
          color: 'hsl(var(--bg-surface))',
          borderRadius: 0,
        }}
      >
        Ir al listado
      </Link>
    </div>
  )
}
