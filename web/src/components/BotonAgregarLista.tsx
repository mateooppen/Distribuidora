/**
 * Botón para agregar/quitar un producto de la lista de pedido.
 *
 * Es un toggle, no una acción de un solo sentido: el estado visual ES la
 * pertenencia a la lista. No hay paso intermedio de "seleccionado pero todavía
 * no agregado" — eso es justamente lo que se evita al no usar checkboxes, porque
 * un tilde sin confirmar se pierde al cambiar de página o de filtro.
 *
 * Estados:
 *   fuera      → [+]  borde tenue
 *   dentro     → [✓]  color de acento, fondo sutil
 *   dentro+hover → [−] color de baja: anticipa que el click va a quitar
 *   sin RNPA   → [+]  deshabilitado, con explicación en el tooltip
 *
 * Dos variantes: `icono` para la columna de la tabla, `completo` (con texto)
 * para el panel de detalle. El área táctil nunca baja de 44px.
 */

import { useState } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  rnpaValido,
  useListaPedido,
  type ProductoAgregable,
} from '@/lib/lista-pedido'

export interface BotonAgregarListaProps {
  producto: ProductoAgregable
  variante?: 'icono' | 'completo'
  className?: string
}

export function BotonAgregarLista({
  producto,
  variante = 'icono',
  className,
}: BotonAgregarListaProps) {
  const { contiene, alternar, lleno } = useListaPedido()
  const [hover, setHover] = useState(false)

  const dentro = contiene(producto.numero_registro)
  const registrable = rnpaValido(producto.numero_registro)
  // El tope solo bloquea agregar; quitar tiene que seguir funcionando.
  const bloqueadoPorTope = lleno && !dentro
  const deshabilitado = !registrable || bloqueadoPorTope

  const nombre = producto.nombre_fantasia ?? producto.nombre_producto

  const titulo = !registrable
    ? 'Sin número de registro válido — no se puede agregar al pedido'
    : bloqueadoPorTope
      ? 'La lista llegó al máximo de productos'
      : dentro
        ? 'Quitar de la lista'
        : 'Agregar a la lista'

  const etiqueta = dentro
    ? `Quitar ${nombre} de la lista de pedido`
    : `Agregar ${nombre} a la lista de pedido`

  // Quitar (hover sobre un ítem ya agregado) se pinta con el color de baja.
  const quitando = dentro && hover && !deshabilitado

  const color = deshabilitado
    ? 'hsl(var(--text-muted))'
    : quitando
      ? 'hsl(var(--state-vencido))'
      : dentro
        ? 'hsl(var(--accent-color))'
        : 'hsl(var(--text-secondary))'

  const borde = deshabilitado
    ? 'hsl(var(--border-subtle))'
    : quitando
      ? 'hsl(var(--state-vencido))'
      : dentro
        ? 'hsl(var(--accent-color))'
        : 'hsl(var(--border-default))'

  const fondo = quitando
    ? 'hsl(var(--state-vencido) / 0.08)'
    : dentro
      ? 'hsl(var(--accent-color) / 0.08)'
      : hover && !deshabilitado
        ? 'hsl(var(--bg-surface-raised))'
        : 'transparent'

  const Icono = quitando ? Minus : dentro ? Check : Plus

  return (
    <button
      type="button"
      onClick={(e) => {
        // La fila de la tabla abre el detalle al clickearse: este botón no debe
        // dispararlo.
        e.stopPropagation()
        alternar(producto)
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      // En touch no hay mouseleave confiable; el blur limpia el estado colgado.
      onBlur={() => setHover(false)}
      disabled={deshabilitado}
      aria-pressed={dentro}
      aria-label={etiqueta}
      title={titulo}
      className={cn(
        'inline-flex items-center justify-center shrink-0 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed',
        variante === 'icono'
          ? 'h-11 w-11'
          : 'h-11 w-full gap-2 px-4 font-mono text-xs uppercase tracking-widest',
        className,
      )}
      style={{
        background: fondo,
        color,
        border: `1px solid ${borde}`,
        borderRadius: 0,
        opacity: deshabilitado ? 0.45 : 1,
      }}
    >
      <Icono className="h-4 w-4" strokeWidth={2.5} />
      {variante === 'completo' && (
        <span>
          {!registrable
            ? 'Sin registro válido'
            : quitando
              ? 'Quitar de la lista'
              : dentro
                ? 'En la lista'
                : 'Agregar a la lista'}
        </span>
      )}
    </button>
  )
}
