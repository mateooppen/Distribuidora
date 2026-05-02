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
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  api,
  type Aptitud,
  type EstadoCertificacion,
  type Presentacion,
  type ProductoDetalle as ProductoDetalleData,
  type Verificacion,
} from '@/lib/api'

// ── Componentes auxiliares ────────────────────────────────────────────────

function NoDisponible() {
  return <span className="text-muted-foreground/60 italic">no disponible</span>
}

function Field({
  label,
  children,
  empty,
}: {
  label: string
  children?: React.ReactNode
  empty?: boolean
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground pt-0.5">
        {label}
      </dt>
      <dd className="text-sm">{empty ? <NoDisponible /> : children}</dd>
    </div>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
        {typeof count === 'number' && (
          <span className="text-xs text-muted-foreground">({count})</span>
        )}
      </div>
      {children}
    </section>
  )
}

// ── Estado badge (mismo que en la tabla) ──────────────────────────────────

const ESTADO_LABELS: Record<
  EstadoCertificacion,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  vigente:         { label: 'Vigente',         variant: 'default'     },
  baja_provisoria: { label: 'Baja provisoria', variant: 'secondary'   },
  baja_permanente: { label: 'Baja permanente', variant: 'destructive' },
  en_tramite:      { label: 'En trámite',      variant: 'outline'     },
  desconocido:     { label: 'Desconocido',     variant: 'outline'     },
}

function EstadoBadge({ estado }: { estado: EstadoCertificacion }) {
  const { label, variant } = ESTADO_LABELS[estado]
  return <Badge variant={variant}>{label}</Badge>
}

// ── Subsecciones ──────────────────────────────────────────────────────────

function ProductoSection({ producto }: { producto: ProductoDetalleData }) {
  const fmtFecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-AR') : null

  return (
    <Section title="Producto">
      <dl className="space-y-2">
        <Field label="Nombre">{producto.nombre_producto}</Field>

        <Field
          label="Nombre fantasía"
          empty={!producto.nombre_fantasia}
        >
          {producto.nombre_fantasia}
        </Field>

        <Field label="Estado">
          <EstadoBadge estado={producto.estado_certificacion} />
        </Field>

        <Field label="Categoría" empty={!producto.categoria}>
          {producto.categoria && (
            <span>
              {producto.categoria.padre_nombre && (
                <>
                  <span className="text-muted-foreground">
                    {producto.categoria.padre_nombre}
                  </span>{' '}
                  /{' '}
                </>
              )}
              {producto.categoria.nombre}
            </span>
          )}
        </Field>

        <Field label="Tipo de registro" empty={!producto.tipo_registro}>
          {producto.tipo_registro}
        </Field>

        <Field label="N° de registro" empty={!producto.numero_registro}>
          <span className="font-mono">{producto.numero_registro}</span>
        </Field>

        <Field
          label="Alta del registro"
          empty={!producto.fecha_alta_registro}
        >
          {fmtFecha(producto.fecha_alta_registro)}
        </Field>

        <Field label="Marca">
          <span>{producto.marca.nombre_marca}</span>
          {producto.marca.empresa_titular && (
            <span className="block text-xs text-muted-foreground mt-0.5">
              {producto.marca.empresa_titular}
            </span>
          )}
          {producto.marca.cuit && (
            <span className="block text-xs text-muted-foreground font-mono">
              CUIT {producto.marca.cuit}
            </span>
          )}
          {producto.marca.sitio_web && (
            <a
              href={producto.marca.sitio_web}
              target="_blank"
              rel="noreferrer"
              className="block text-xs text-blue-600 hover:underline mt-0.5"
            >
              {producto.marca.sitio_web}
            </a>
          )}
        </Field>

        <Field label="Descripción" empty={!producto.descripcion}>
          {producto.descripcion}
        </Field>

        <Field label="Ingredientes" empty={!producto.ingredientes}>
          <p className="whitespace-pre-wrap">{producto.ingredientes}</p>
        </Field>

        <Field label="Vida útil" empty={producto.vida_util_dias === null}>
          {producto.vida_util_dias} días
        </Field>

        <Field
          label="Conservación"
          empty={!producto.condiciones_conservacion}
        >
          {producto.condiciones_conservacion}
        </Field>

        <Field label="Observaciones" empty={!producto.observaciones}>
          <p className="whitespace-pre-wrap">{producto.observaciones}</p>
        </Field>

        <Field label="Última actualización">
          {new Date(producto.updated_at).toLocaleString('es-AR')}
        </Field>
      </dl>
    </Section>
  )
}

function PresentacionesSection({ items }: { items: Presentacion[] }) {
  return (
    <Section title="Presentaciones" count={items.length}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 italic">
          no hay presentaciones cargadas
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <div
              key={p.id_presentacion}
              className="border rounded-md p-3 bg-muted/30"
            >
              <dl className="space-y-1.5">
                <Field label="Formato" empty={!p.formato}>
                  {p.formato}
                </Field>
                <Field
                  label="Contenido neto"
                  empty={p.contenido_neto === null}
                >
                  {p.contenido_neto} {p.unidad_medida ?? ''}
                </Field>
                <Field label="EAN-13" empty={!p.ean_13}>
                  <span className="font-mono">{p.ean_13}</span>
                </Field>
                <Field label="Disponibilidad">{p.disponibilidad}</Field>
                {p.codigo_interno && (
                  <Field label="Código interno">
                    <span className="font-mono">{p.codigo_interno}</span>
                  </Field>
                )}
              </dl>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function AptitudesSection({ items }: { items: Aptitud[] }) {
  return (
    <Section title="Aptitudes" count={items.length}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 italic">
          no se registraron aptitudes
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((a) => (
            <Badge key={a.id_aptitud} variant="secondary">
              {a.nombre}
            </Badge>
          ))}
        </div>
      )}
    </Section>
  )
}

function VerificacionesSection({ items }: { items: Verificacion[] }) {
  return (
    <Section title="Historial de verificaciones" count={items.length}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 italic">
          sin verificaciones registradas
        </p>
      ) : (
        <ol className="space-y-2 border-l-2 border-muted pl-4">
          {items.map((v) => (
            <li key={v.id_verificacion} className="relative">
              <div className="text-xs text-muted-foreground">
                {new Date(v.fecha).toLocaleString('es-AR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="text-sm">
                <span className="font-medium">{v.tipo}</span>
                <span className="text-muted-foreground"> · {v.fuente}</span>
                <span className="text-muted-foreground"> · {v.resultado}</span>
              </div>
              {v.campo_modificado && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {v.campo_modificado}: <span className="font-mono">{v.valor_anterior ?? '∅'}</span>
                  {' → '}
                  <span className="font-mono">{v.valor_nuevo ?? '∅'}</span>
                </div>
              )}
              {v.observaciones && (
                <div className="text-xs text-muted-foreground mt-0.5 italic">
                  {v.observaciones}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Section>
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
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-lg leading-tight pr-8">
            {data?.data.nombre_fantasia ?? data?.data.nombre_producto ?? 'Producto'}
          </SheetTitle>
          {data?.data.nombre_fantasia && (
            <SheetDescription className="text-xs line-clamp-2">
              {data.data.nombre_producto}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-6 space-y-6 px-4 pb-6">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Cargando detalle…</p>
          )}

          {error && (
            <div className="border border-destructive/50 bg-destructive/10 text-destructive rounded-md p-3 text-sm">
              Error: {error instanceof Error ? error.message : 'desconocido'}
            </div>
          )}

          {data && (
            <>
              <ProductoSection producto={data.data} />
              <Separator />
              <PresentacionesSection items={data.data.presentaciones} />
              <Separator />
              <AptitudesSection items={data.data.aptitudes} />
              <Separator />
              <VerificacionesSection items={data.data.verificaciones} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
