/**
 * Ítem "Lista" del navbar. Es un link normal a /lista, al lado de Inicio,
 * Productos y Marcas.
 *
 * Antes era un botón con ícono que abría un panel lateral, y desde ahí había que
 * tocar otra vez para llegar a la pantalla: dos acciones para un destino, con un
 * ícono que no comunicaba a dónde llevaba —y menos con la lista vacía—. Ahora es
 * texto, vive donde están los demás destinos, y llega en un toque.
 *
 * El contador hace un "pop" breve al crecer: es el único feedback de que un
 * click en [+] hizo algo cuando estás en el listado.
 */

import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useListaPedido } from '@/lib/lista-pedido'

export function BotonListaNavbar({
  className,
}: {
  className?: (props: { isActive: boolean }) => string
}) {
  const { total } = useListaPedido()
  const [pop, setPop] = useState(false)
  const anterior = useRef(total)

  useEffect(() => {
    const crecio = total > anterior.current
    anterior.current = total
    if (!crecio) return
    setPop(true)
    const t = setTimeout(() => setPop(false), 260)
    return () => clearTimeout(t)
  }, [total])

  return (
    <NavLink
      to="/lista"
      className={className}
      aria-label={
        total === 0
          ? 'Lista de pedido (vacía)'
          : `Lista de pedido (${total} producto${total === 1 ? '' : 's'})`
      }
    >
      {/*
        * El contador va posicionado sobre el texto y no en línea: así el ancho
        * del ítem no depende de si el número tiene 1, 2 o 3 dígitos. En línea,
        * pasar de "Lista 9" a "Lista 300" empujaba el destino fuera del área
        * visible del nav en pantallas de 360px.
        *
        * El `pr-` reserva el lugar del badge dentro de la caja del link, para que
        * no lo recorte el overflow del nav.
        */}
      <span className={cn('relative inline-flex items-center', total > 0 && 'pr-6')}>
        Lista
        {total > 0 && (
          <span
            className={cn(
              'absolute right-0 top-1/2 -translate-y-1/2',
              'min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center',
              'font-mono text-[10px] font-semibold tabular-nums leading-none',
            )}
            style={{
              background: 'hsl(var(--accent-color))',
              color: 'hsl(var(--bg-surface))',
              transform: pop
                ? 'translateY(-50%) scale(1.3)'
                : 'translateY(-50%) scale(1)',
              transition: 'transform 130ms ease-out',
            }}
          >
            {total}
          </span>
        )}
      </span>
    </NavLink>
  )
}
