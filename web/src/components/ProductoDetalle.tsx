/**
 * Panel lateral con el detalle completo de un producto.
 * Se monta sobre un Sheet de shadcn (cerrable con Esc / click fuera).
 *
 * Recibe un id; cuando es null el panel está cerrado.
 * Hace su propia query a /api/productos/:id.
 */

import { useQuery } from '@tanstack/react-query'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  type Aptitud,
  type Presentacion,
  type ProductoDetalle as ProductoDetalleData,
  type Verificacion,
  type VerificacionFuente,
  type VerificacionTipo,
} from '@/lib/api'

// ── Helpers ────────────────────────────────────────────────────────────────

function NoDisponible() {
  return (
    <span
      className="font-mono text-xs italic"
      style={{ color: 'hsl(var(--text-muted))' }}
    >
      no disponible
    </span>
  )
}

function Field({
  label,
  children,
  empty,
  always,
}: {
  label: string
  children?: React.ReactNode
  empty?: boolean
  always?: boolean
}) {
  if (empty && !always) return null
  return (
    <div
      className="grid grid-cols-[150px_1fr] gap-3 items-start pb-3 border-b last:pb-0 last:border-b-0"
      style={{ borderBottomColor: 'hsl(var(--border-subtle) / 0.5)' }}
    >
      <dt
        className="font-mono text-[11px] uppercase tracking-widest pt-0.5"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        {label}
      </dt>
      <dd
        className="text-sm"
        style={{ color: 'hsl(var(--text-primary))' }}
      >
        {empty ? <NoDisponible /> : children}
      </dd>
    </div>
  )
}

function SectionTitle({
  children,
  count,
}: {
  children: React.ReactNode
  count?: number
}) {
  return (
    <div className="flex items-baseline gap-2 mb-4">
      <h3
        className="font-mono text-xs uppercase tracking-widest font-semibold"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        $ {children}
      </h3>
      {typeof count === 'number' && (
        <span
          className="font-mono text-xs tabular-nums"
          style={{ color: 'hsl(var(--accent-color))' }}
        >
          [{count}]
        </span>
      )}
    </div>
  )
}

function SectionDivider() {
  return (
    <div
      className="my-8"
      style={{ borderTop: '1px solid hsl(var(--border-subtle))' }}
    />
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-mono text-xs italic"
      style={{ color: 'hsl(var(--text-muted))' }}
    >
      {children}
    </p>
  )
}

// ── Subsecciones ──────────────────────────────────────────────────────────

// Divisor sutil entre grupos de campos
function GroupDivider() {
  return (
    <div
      className="my-4"
      style={{ borderTop: '1px dashed hsl(var(--border-subtle))' }}
    />
  )
}

// Bloque de texto largo (descripción, ingredientes, observaciones)
function TextBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="font-mono text-[11px] uppercase tracking-widest mb-2"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        {label}
      </div>
      <div
        className="text-sm leading-relaxed whitespace-pre-wrap p-3"
        style={{
          color: 'hsl(var(--text-primary))',
          background: 'hsl(var(--bg-surface-raised) / 0.5)',
          borderLeft: '2px solid hsl(var(--border-default))',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function ProductoSection({ producto }: { producto: ProductoDetalleData }) {
  const fmtFecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-AR') : null

  // ¿Hay al menos un bloque de texto largo para renderizar?
  const tieneContenidoExtendido =
    producto.descripcion || producto.ingredientes || producto.observaciones

  // ¿Hay datos de características?
  const tieneCaracteristicas =
    producto.vida_util_dias !== null || producto.condiciones_conservacion

  return (
    <section>
      <SectionTitle>Producto</SectionTitle>

      {/* ── Identidad ─────────────────────────────────────────── */}
      <dl className="[&>div:not(:last-child)]:mb-3">
        <Field label="Nombre" always>{producto.nombre_producto}</Field>

        <Field label="Nombre fantasía" empty={!producto.nombre_fantasia}>
          {producto.nombre_fantasia}
        </Field>

        <Field label="Marca" always>
          <span style={{ color: 'hsl(var(--text-primary))' }}>
            {producto.marca.nombre_marca}
          </span>
          {producto.marca.empresa_titular && (
            <span
              className="block text-xs mt-1"
              style={{ color: 'hsl(var(--text-secondary))' }}
            >
              {producto.marca.empresa_titular}
            </span>
          )}
          {producto.marca.cuit && (
            <span
              className="block text-xs font-mono mt-0.5"
              style={{ color: 'hsl(var(--text-muted))' }}
            >
              CUIT {producto.marca.cuit}
            </span>
          )}
          {producto.marca.sitio_web && (
            <a
              href={producto.marca.sitio_web}
              target="_blank"
              rel="noreferrer"
              className="block text-xs font-mono mt-1 hover:underline"
              style={{ color: 'hsl(var(--accent-color))' }}
            >
              ↗ {producto.marca.sitio_web}
            </a>
          )}
        </Field>

        <Field label="Categoría" empty={!producto.categoria}>
          {producto.categoria && (
            <span>
              {producto.categoria.padre_nombre && (
                <span style={{ color: 'hsl(var(--text-muted))' }}>
                  {producto.categoria.padre_nombre} /{' '}
                </span>
              )}
              {producto.categoria.nombre}
            </span>
          )}
        </Field>
      </dl>

      {/* ── Registro ANMAT ────────────────────────────────────── */}
      {(producto.numero_registro || producto.fecha_alta_registro) && (
        <>
          <GroupDivider />
          <dl className="[&>div:not(:last-child)]:mb-3">
            <Field label="N° de registro" empty={!producto.numero_registro}>
              <span className="font-mono text-xs">{producto.numero_registro}</span>
            </Field>

            <Field label="Alta del registro" empty={!producto.fecha_alta_registro}>
              <span className="font-mono text-xs">
                {fmtFecha(producto.fecha_alta_registro)}
              </span>
            </Field>
          </dl>
        </>
      )}

      {/* ── Características ───────────────────────────────────── */}
      {tieneCaracteristicas && (
        <>
          <GroupDivider />
          <dl className="[&>div:not(:last-child)]:mb-3">
            <Field label="Vida útil" empty={producto.vida_util_dias === null}>
              {producto.vida_util_dias} días
            </Field>

            <Field label="Conservación" empty={!producto.condiciones_conservacion}>
              {producto.condiciones_conservacion}
            </Field>
          </dl>
        </>
      )}

      {/* ── Contenido extendido (textos largos) ───────────────── */}
      {tieneContenidoExtendido && (
        <>
          <GroupDivider />
          <div className="space-y-4">
            {producto.descripcion && (
              <TextBlock label="Descripción">{producto.descripcion}</TextBlock>
            )}
            {producto.ingredientes && (
              <TextBlock label="Ingredientes">{producto.ingredientes}</TextBlock>
            )}
            {producto.observaciones && (
              <TextBlock label="Observaciones">{producto.observaciones}</TextBlock>
            )}
          </div>
        </>
      )}

      {/* ── Metadato del sistema ──────────────────────────────── */}
      <GroupDivider />
      <dl>
        <Field label="Última actualización" always>
          <span className="font-mono text-xs">
            {new Date(producto.updated_at).toLocaleString('es-AR')}
          </span>
        </Field>
      </dl>
    </section>
  )
}

function PresentacionesSection({ items }: { items: Presentacion[] }) {
  return (
    <section>
      <SectionTitle count={items.length}>Presentaciones</SectionTitle>
      {items.length === 0 ? (
        <EmptyState>no hay presentaciones cargadas</EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <div
              key={p.id_presentacion}
              className="p-4"
              style={{
                background: 'hsl(var(--bg-surface-raised) / 0.4)',
                border: '1px solid hsl(var(--border-subtle))',
              }}
            >
              <dl className="space-y-2">
                <Field label="Formato" empty={!p.formato}>{p.formato}</Field>
                <Field label="Contenido neto" empty={p.contenido_neto === null}>
                  <span className="font-mono">
                    {p.contenido_neto} {p.unidad_medida ?? ''}
                  </span>
                </Field>
                <Field label="EAN-13" empty={!p.ean_13}>
                  <span className="font-mono text-xs">{p.ean_13}</span>
                </Field>
                <Field label="Disponibilidad" always>{p.disponibilidad}</Field>
                <Field label="Código interno" empty={!p.codigo_interno}>
                  <span className="font-mono text-xs">{p.codigo_interno}</span>
                </Field>
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function AptitudesSection({ items }: { items: Aptitud[] }) {
  return (
    <section>
      <SectionTitle count={items.length}>Aptitudes</SectionTitle>
      {items.length === 0 ? (
        <EmptyState>no se registraron aptitudes</EmptyState>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((a) => (
            <span
              key={a.id_aptitud}
              className="inline-flex items-center px-2.5 py-1 font-mono text-[11px]"
              style={{
                background: 'hsl(var(--bg-surface-raised))',
                color: 'hsl(var(--text-secondary))',
                border: '1px solid hsl(var(--border-default))',
              }}
            >
              {a.nombre}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Verificaciones — timeline legible ──────────────────────────────────────

// Traducciones de tipos técnicos a frases naturales en español
const TIPO_LABEL: Record<VerificacionTipo, string> = {
  alta:    'Producto agregado al catálogo',
  chequeo: 'Verificación de datos',
  cambio:  'Datos actualizados',
  baja:    'Producto dado de baja',
}

const FUENTE_LABEL: Record<VerificacionFuente, string> = {
  ANMAT_CSV:    'Importación oficial ANMAT',
  ANMAT_ONLINE: 'Consulta web ANMAT',
  sitio_marca:  'Sitio de la marca',
  supermercado: 'Supermercado',
  manual:       'Verificación manual',
  otro:         'Otra fuente',
}

// Mapeo de tipo → variable de color semántico
function tipoColor(tipo: VerificacionTipo): string {
  switch (tipo) {
    case 'alta':    return 'hsl(var(--state-vigente))'
    case 'baja':    return 'hsl(var(--state-vencido))'
    case 'cambio':  return 'hsl(var(--state-revision))'
    case 'chequeo': return 'hsl(var(--accent-color))'
  }
}

function VerificacionItem({ v }: { v: Verificacion }) {
  const fecha = new Date(v.fecha).toLocaleDateString('es-AR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const color = tipoColor(v.tipo)
  const titulo = TIPO_LABEL[v.tipo]
  const fuente = FUENTE_LABEL[v.fuente]

  return (
    <li className="relative pl-6">
      {/* Dot de la timeline, posicionado sobre la línea vertical */}
      <span
        className="absolute left-0 top-1.5 w-3 h-3 rounded-full"
        style={{
          background: color,
          boxShadow: '0 0 0 3px hsl(var(--bg-surface))',
        }}
      />

      <div
        className="font-mono text-[11px] uppercase tracking-widest mb-1"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        {fecha}
      </div>

      <div className="text-sm font-semibold" style={{ color }}>
        {titulo}
      </div>

      {v.campo_modificado && (
        <p className="text-xs mt-1" style={{ color: 'hsl(var(--text-secondary))' }}>
          Se actualizó el campo{' '}
          <span className="font-mono" style={{ color: 'hsl(var(--text-primary))' }}>
            {v.campo_modificado}
          </span>
        </p>
      )}

      {v.observaciones && (
        <p
          className="text-xs mt-1 italic"
          style={{ color: 'hsl(var(--text-secondary))' }}
        >
          {v.observaciones}
        </p>
      )}

      <p
        className="text-[11px] mt-1 font-mono"
        style={{ color: 'hsl(var(--text-muted))' }}
      >
        Fuente: {fuente}
      </p>
    </li>
  )
}

function VerificacionesSection({ items }: { items: Verificacion[] }) {
  return (
    <section>
      <SectionTitle count={items.length}>Historial</SectionTitle>
      {items.length === 0 ? (
        <EmptyState>sin verificaciones registradas</EmptyState>
      ) : (
        <ol
          className="space-y-5 pl-1"
          style={{ borderLeft: '1px solid hsl(var(--border-default))' }}
        >
          {items.map((v) => (
            <VerificacionItem key={v.id_verificacion} v={v} />
          ))}
        </ol>
      )}
    </section>
  )
}

// ── Skeleton del panel ────────────────────────────────────────────────────

function ProductoSkeleton() {
  // 7 filas que imitan el grid [150px_1fr] de los Field reales
  const widths = ['70%', '60%', '50%', '80%', '40%', '55%', '45%']
  return (
    <div>
      {/* Subtítulo de sección ($ producto) */}
      <Skeleton className="h-3 w-24 mb-4" />

      <dl className="[&>div:not(:last-child)]:mb-3">
        {widths.map((w, i) => (
          <div
            key={i}
            className="grid grid-cols-[150px_1fr] gap-3 items-start pb-3 border-b last:border-b-0"
            style={{ borderBottomColor: 'hsl(var(--border-subtle) / 0.5)' }}
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4" style={{ width: w }} />
          </div>
        ))}
      </dl>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────

export interface ProductoDetalleProps {
  productoId: number | null
  onClose: () => void
}

export function ProductoDetalle({ productoId, onClose }: ProductoDetalleProps) {
  const open = productoId !== null

  const { data, isLoading, error } = useQuery({
    queryKey: ['producto', productoId],
    queryFn: () => api.productoById(productoId!),
    enabled: open,
    staleTime: 60_000,
  })

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
        style={{
          background: 'hsl(var(--bg-surface))',
          borderLeft: '3px solid hsl(var(--accent-color))',
        }}
      >
        {/* Header del panel */}
        <SheetHeader
          className="px-6 py-5 sticky top-0 z-20"
          style={{
            background: 'hsl(var(--bg-surface))',
            borderBottom: '1px solid hsl(var(--border-default))',
          }}
        >
          {/* Fila superior: kicker + botón cerrar */}
          <div className="flex items-center justify-between mb-2">
            <div
              className="font-mono text-[11px] uppercase tracking-widest"
              style={{ color: 'hsl(var(--text-muted))' }}
            >
              $ detalle del producto
            </div>
            <SheetClose
              className="h-8 w-8 inline-flex items-center justify-center font-mono text-base transition-colors shrink-0"
              style={{
                background: 'transparent',
                color: 'hsl(var(--text-secondary))',
                border: '1px solid hsl(var(--border-default))',
                borderRadius: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'hsl(var(--bg-surface-raised))'
                e.currentTarget.style.color = 'hsl(var(--text-primary))'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'hsl(var(--text-secondary))'
              }}
              aria-label="Cerrar panel"
            >
              ×
              <span className="sr-only">Cerrar</span>
            </SheetClose>
          </div>

          <SheetTitle
            className="text-xl font-bold leading-tight font-sans"
            style={{ color: 'hsl(var(--text-primary))' }}
          >
            {data?.data.nombre_fantasia ?? data?.data.nombre_producto ?? 'Producto'}
          </SheetTitle>
          {data?.data.nombre_fantasia && (
            <SheetDescription
              className="text-xs font-mono line-clamp-2 mt-1"
              style={{ color: 'hsl(var(--text-muted))' }}
            >
              {data.data.nombre_producto}
            </SheetDescription>
          )}
        </SheetHeader>

        {/* Contenido */}
        <div className="px-6 py-6">
          {isLoading && (
            <ProductoSkeleton />
          )}

          {error && (
            <div
              className="p-3 text-sm font-mono"
              style={{
                border: '1px solid hsl(var(--state-vencido))',
                background: 'hsl(var(--state-vencido) / 0.08)',
                color: 'hsl(var(--state-vencido))',
              }}
            >
              Error: {error instanceof Error ? error.message : 'desconocido'}
            </div>
          )}

          {data && (
            <>
              <ProductoSection producto={data.data} />
              <SectionDivider />
              <PresentacionesSection items={data.data.presentaciones} />
              <SectionDivider />
              <AptitudesSection items={data.data.aptitudes} />
              <SectionDivider />
              <VerificacionesSection items={data.data.verificaciones} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
