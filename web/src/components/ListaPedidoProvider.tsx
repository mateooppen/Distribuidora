/**
 * Provider del estado de la lista de pedido.
 *
 * Se monta una sola vez en App. Los tipos, helpers puros, el contexto y el hook
 * `useListaPedido` viven en `@/lib/lista-pedido` — acá queda solo el componente,
 * porque el fast-refresh de Vite exige que un archivo con componentes no exporte
 * otra cosa.
 *
 * ── Por qué un solo objeto de estado ────────────────────────────────────────
 *
 * `items` y `deshacer` van juntos en un `useState` porque cada mutación los
 * escribe a la vez: para poder revertir hay que guardar la lista previa. Con dos
 * estados separados hacía falta leer `items` del closure —el updater de setState
 * no puede tener efectos, se ejecuta dos veces bajo StrictMode— y eso rompía ante
 * clicks rápidos: varios `agregar` en el mismo tick de React leían todos la misma
 * lista vieja y solo sobrevivía el último.
 *
 * Con un objeto único cada mutación es un update funcional puro: recibe el estado
 * real, devuelve el siguiente, y las operaciones encadenadas se componen bien.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LISTA_MAX_ITEMS,
  ListaPedidoContext,
  STORAGE_KEY,
  aItem,
  claveDe,
  escribirStorage,
  leerStorage,
  nombreVisible,
  rnpaValido,
  type AccionDeshacer,
  type ItemLista,
  type ListaPedidoValue,
  type ProductoAgregable,
  type ResultadoAgregarVarios,
} from '@/lib/lista-pedido'

interface Estado {
  items: ItemLista[]
  deshacer: AccionDeshacer | null
}

export function ListaPedidoProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>(() => ({
    items: leerStorage(),
    deshacer: null,
  }))
  const [sinPersistencia, setSinPersistencia] = useState(false)

  const { items, deshacer: accionDeshacer } = estado

  // Evita escribir en el primer render lo mismo que se acaba de leer.
  const montado = useRef(false)
  useEffect(() => {
    if (!montado.current) {
      montado.current = true
      return
    }
    setSinPersistencia(!escribirStorage(items))
  }, [items])

  // Sincronización entre pestañas. Sin esto, dos pestañas abiertas se pisan la
  // lista entre sí y gana la última que escribe — perdiendo trabajo en silencio.
  // El evento `storage` solo se dispara en las OTRAS pestañas, así que no hay loop.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      // El deshacer se descarta: apunta a un estado previo de ESTA pestaña, que
      // ya no es el que está guardado.
      setEstado({ items: leerStorage(), deshacer: null })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const contiene = useCallback(
    (numero_registro: string | null | undefined) => {
      if (!numero_registro) return false
      const clave = claveDe(numero_registro)
      return items.some((it) => it.rnpa === clave)
    },
    [items],
  )

  const agregar = useCallback((producto: ProductoAgregable) => {
    if (!rnpaValido(producto.numero_registro)) return
    const clave = claveDe(producto.numero_registro!)
    setEstado((prev) => {
      if (prev.items.some((it) => it.rnpa === clave)) return prev
      if (prev.items.length >= LISTA_MAX_ITEMS) return prev
      // Agregar de a uno no ofrece deshacer: el propio botón queda en ✓ y
      // volver a tocarlo lo saca.
      return { items: [...prev.items, aItem(producto)], deshacer: null }
    })
  }, [])

  /**
   * Agrega un lote. Devuelve el desglose para que quien la llame pueda contar lo
   * que pasó ("47 agregados · 3 ya estaban").
   *
   * El desglose se calcula dentro del updater, que StrictMode ejecuta dos veces:
   * por eso el acumulador se reinicia en cada corrida en vez de sumar sobre lo
   * que quedó de la anterior.
   */
  const agregarVarios = useCallback(
    (productos: ProductoAgregable[]): ResultadoAgregarVarios => {
      const resultado: ResultadoAgregarVarios = {
        agregados: 0,
        duplicados: 0,
        rechazados: 0,
        excedentes: 0,
      }

      setEstado((prev) => {
        resultado.agregados = 0
        resultado.duplicados = 0
        resultado.rechazados = 0
        resultado.excedentes = 0

        const presentes = new Set(prev.items.map((it) => it.rnpa))
        const nuevos: ItemLista[] = []

        for (const p of productos) {
          if (!rnpaValido(p.numero_registro)) {
            resultado.rechazados++
            continue
          }
          const clave = claveDe(p.numero_registro!)
          if (presentes.has(clave)) {
            resultado.duplicados++
            continue
          }
          if (prev.items.length + nuevos.length >= LISTA_MAX_ITEMS) {
            resultado.excedentes++
            continue
          }
          presentes.add(clave)
          nuevos.push(aItem(p))
          resultado.agregados++
        }

        if (nuevos.length === 0) return prev

        const n = nuevos.length
        return {
          items: [...prev.items, ...nuevos],
          deshacer: {
            mensaje: `${n} producto${n === 1 ? '' : 's'} agregado${n === 1 ? '' : 's'}`,
            previo: prev.items,
          },
        }
      })

      return resultado
    },
    [],
  )

  const quitar = useCallback((numero_registro: string) => {
    const clave = claveDe(numero_registro)
    setEstado((prev) => {
      const item = prev.items.find((it) => it.rnpa === clave)
      if (!item) return prev
      return {
        items: prev.items.filter((it) => it.rnpa !== clave),
        // Sin comillas alrededor del nombre: muchas fantasías del dataset ya
        // vienen entrecomilladas ('"DULCE DE LECHE" "FRUTILLA"').
        deshacer: { mensaje: `Quitaste ${nombreVisible(item)}`, previo: prev.items },
      }
    })
  }, [])

  const alternar = useCallback(
    (producto: ProductoAgregable) => {
      if (!rnpaValido(producto.numero_registro)) return
      if (contiene(producto.numero_registro)) quitar(producto.numero_registro!)
      else agregar(producto)
    },
    [contiene, quitar, agregar],
  )

  const vaciar = useCallback(() => {
    setEstado((prev) => {
      if (prev.items.length === 0) return prev
      const n = prev.items.length
      return {
        items: [],
        deshacer: {
          mensaje: `Vaciaste la lista (${n} producto${n === 1 ? '' : 's'})`,
          previo: prev.items,
        },
      }
    })
  }, [])

  /**
   * Refresca el snapshot local con los datos frescos de la API. No agrega ni saca
   * ítems: los que ya no están en el catálogo los sigue mostrando la página con
   * su snapshot viejo y una etiqueta, para que el usuario decida.
   *
   * Identidad estable (sin dependencias) porque la llama el `queryFn` de la
   * revalidación: si cambiara en cada render, la query se dispararía en bucle.
   * Devuelve el estado anterior si nada cambió, para no provocar un render de más
   * ni una escritura inútil en localStorage.
   */
  const sincronizar = useCallback((frescos: ProductoAgregable[]) => {
    setEstado((prev) => {
      const porRnpa = new Map(
        frescos
          .filter((p) => rnpaValido(p.numero_registro))
          .map((p) => [claveDe(p.numero_registro!), p]),
      )

      let hubocambios = false
      const items = prev.items.map((item) => {
        const fresco = porRnpa.get(item.rnpa)
        if (!fresco) return item
        const igual =
          item.marca === fresco.nombre_marca &&
          item.producto === fresco.nombre_producto &&
          item.fantasia === fresco.nombre_fantasia &&
          item.id === fresco.id_producto
        if (igual) return item
        hubocambios = true
        // Se conserva `agregado`: es cuándo lo agregó el usuario, no cuándo se
        // refrescó el dato.
        return { ...item, ...aItem(fresco), agregado: item.agregado }
      })

      return hubocambios ? { ...prev, items } : prev
    })
  }, [])

  const deshacer = useCallback(() => {
    setEstado((prev) =>
      prev.deshacer ? { items: prev.deshacer.previo, deshacer: null } : prev,
    )
  }, [])

  const descartarDeshacer = useCallback(() => {
    setEstado((prev) => (prev.deshacer ? { ...prev, deshacer: null } : prev))
  }, [])

  const value = useMemo<ListaPedidoValue>(
    () => ({
      items,
      total: items.length,
      lleno: items.length >= LISTA_MAX_ITEMS,
      sinPersistencia,
      contiene,
      agregar,
      agregarVarios,
      quitar,
      alternar,
      vaciar,
      sincronizar,
      accionDeshacer,
      deshacer,
      descartarDeshacer,
    }),
    [
      items,
      sinPersistencia,
      contiene,
      agregar,
      agregarVarios,
      quitar,
      alternar,
      vaciar,
      sincronizar,
      accionDeshacer,
      deshacer,
      descartarDeshacer,
    ],
  )

  return (
    <ListaPedidoContext.Provider value={value}>
      {children}
    </ListaPedidoContext.Provider>
  )
}
