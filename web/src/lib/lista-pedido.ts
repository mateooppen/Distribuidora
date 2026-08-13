/**
 * Lista de pedido — estado global + persistencia en localStorage.
 *
 * Es el "carrito" del dashboard: se cargan productos desde el listado filtrado y
 * más adelante se exportan en Excel para mandarle a un proveedor.
 *
 * ── Por qué la clave es el RNPA y no el id ───────────────────────────────────
 *
 * `productos.id_producto` es `INTEGER PRIMARY KEY`, o sea el rowid que SQLite
 * asigna por orden de inserción del CSV de ANMAT (ver src/scripts/import-anmat.ts).
 * La base se regenera entera en cada release: si upstream agregan o borran una
 * fila, todos los ids posteriores se corren. Una lista guardada por id apuntaría
 * a productos distintos después de un deploy, sin ningún síntoma visible.
 *
 * `(tipo_registro, numero_registro)` en cambio tiene UNIQUE en el esquema
 * (src/db/schema.sql:71) y está deduplicado en el import: es la identidad estable.
 * `id` se guarda igual, pero solo como atajo de lectura — nunca como identidad.
 *
 * Hoy los 35.498 productos son RNPA, así que `tipo` está fijo en 'RNPA'. Si algún
 * día entran SENASA o INV, hay que empezar a traer `tipo_registro` en el listado
 * y guardarlo acá.
 *
 * ── Snapshot ────────────────────────────────────────────────────────────────
 *
 * Cada ítem guarda marca/nombre además de la clave. Sirve para dos cosas: que el
 * panel renderice al instante sin esperar una request, y que un producto que
 * desaparezca del catálogo se pueda seguir mostrando como "ya no figura" en vez
 * de convertirse en una fila vacía. Los datos frescos los trae la API al exportar.
 *
 * El componente <ListaPedidoProvider> vive aparte, en components/, porque el
 * fast-refresh de Vite exige que un archivo con componentes no exporte otra cosa.
 * Acá quedan los tipos, los helpers puros, el contexto y el hook de consumo.
 */

import { createContext, useContext } from 'react'

// ── Constantes ────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'lialg-lista-pedido'
const STORAGE_VERSION = 1

/** Tope duro. Alcanza para cualquier pedido real y mantiene el panel usable. */
export const LISTA_MAX_ITEMS = 300

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface ItemLista {
  /** Tipo de registro. Hoy siempre 'RNPA' (ver cabecera). */
  tipo: 'RNPA'
  /** Número de registro — la clave estable. */
  rnpa: string
  /** Atajo de lectura. Puede quedar obsoleto tras una regeneración de la base. */
  id: number
  marca: string
  producto: string
  fantasia: string | null
  /** ISO. Define el orden de storage; la agrupación por marca es de presentación. */
  agregado: string
}

/**
 * Forma mínima que necesita un producto para entrar a la lista. La cumplen tanto
 * `ProductoListItem` (listado) como el detalle, aplanando `marca.nombre_marca`.
 */
export interface ProductoAgregable {
  id_producto: number
  nombre_producto: string
  nombre_fantasia: string | null
  numero_registro: string | null
  nombre_marca: string
}

export interface ResultadoAgregarVarios {
  agregados: number
  duplicados: number
  /** Sin RNPA utilizable. */
  rechazados: number
  /** Los que no entraron por el tope de LISTA_MAX_ITEMS. */
  excedentes: number
}

export interface AccionDeshacer {
  mensaje: string
  /** Estado completo anterior a la operación. Un solo nivel, no un historial. */
  previo: ItemLista[]
}

// ── Validación del RNPA ───────────────────────────────────────────────────

/**
 * En el dataset de ANMAT hay 4 productos con el campo corrido: el RNPA trae una
 * razón social, un guión suelto o la denominación entera. Esas claves no son
 * estables ni identifican nada, así que esos productos no se pueden agregar.
 *
 * El criterio es la plausibilidad, no el formato: los RNPA reales varían mucho
 * ("01-006162", "18-012260"), pero todos tienen al menos dos dígitos.
 */
export function rnpaValido(numero_registro: string | null | undefined): boolean {
  if (!numero_registro) return false
  const limpio = numero_registro.trim()
  if (limpio.length < 3) return false
  const digitos = limpio.replace(/\D/g, '')
  return digitos.length >= 2
}

/** Clave normalizada para comparar y deduplicar. */
export function claveDe(numero_registro: string): string {
  return numero_registro.trim()
}

// ── Persistencia ──────────────────────────────────────────────────────────

interface Persistido {
  v: number
  actualizada: string
  items: ItemLista[]
}

export function leerStorage(): ItemLista[] {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY)
    if (!crudo) return []
    const parsed = JSON.parse(crudo) as Persistido
    // Versión desconocida (de un futuro esquema): se ignora en vez de romper.
    if (!parsed || parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.items)) {
      return []
    }
    // Filtro defensivo: storage es editable por el usuario y sobrevive deploys.
    return parsed.items.filter(
      (it): it is ItemLista =>
        !!it &&
        typeof it.rnpa === 'string' &&
        rnpaValido(it.rnpa) &&
        typeof it.marca === 'string' &&
        typeof it.producto === 'string',
    )
  } catch {
    return []
  }
}

export function escribirStorage(items: ItemLista[]): boolean {
  try {
    const payload: Persistido = {
      v: STORAGE_VERSION,
      actualizada: new Date().toISOString(),
      items,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    // Modo privado, cuota llena o storage deshabilitado. La lista sigue viva en
    // memoria; el aviso lo da el panel.
    return false
  }
}

// ── Helpers de presentación ───────────────────────────────────────────────

export interface GrupoMarca {
  marca: string
  items: ItemLista[]
}

/**
 * Agrupa por marca alfabéticamente, y dentro de cada grupo por nombre visible.
 * Es el orden del panel, de /lista y del Excel: el proveedor ve todo lo suyo junto.
 */
export function agruparPorMarca(items: ItemLista[]): GrupoMarca[] {
  const mapa = new Map<string, ItemLista[]>()
  for (const it of items) {
    const grupo = mapa.get(it.marca)
    if (grupo) grupo.push(it)
    else mapa.set(it.marca, [it])
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([marca, items]) => ({
      marca,
      items: items
        .slice()
        .sort((a, b) =>
          nombreVisible(a).localeCompare(nombreVisible(b), 'es'),
        ),
    }))
}

/** Misma regla que usa la tabla del listado: fantasía si existe, si no la denominación. */
export function nombreVisible(item: ItemLista): string {
  return item.fantasia ?? item.producto
}

export function aItem(p: ProductoAgregable): ItemLista {
  return {
    tipo: 'RNPA',
    rnpa: claveDe(p.numero_registro!),
    id: p.id_producto,
    marca: p.nombre_marca,
    producto: p.nombre_producto,
    fantasia: p.nombre_fantasia,
    agregado: new Date().toISOString(),
  }
}

// ── Context ───────────────────────────────────────────────────────────────

export interface ListaPedidoValue {
  items: ItemLista[]
  total: number
  lleno: boolean
  /** true si localStorage no está disponible: la lista no sobrevive al cierre. */
  sinPersistencia: boolean

  contiene: (numero_registro: string | null | undefined) => boolean
  agregar: (producto: ProductoAgregable) => void
  agregarVarios: (productos: ProductoAgregable[]) => ResultadoAgregarVarios
  quitar: (numero_registro: string) => void
  alternar: (producto: ProductoAgregable) => void
  vaciar: () => void

  /**
   * Refresca el snapshot local con los datos que devolvió la API. Identidad
   * estable y sin dependencias, para poder llamarla desde el `queryFn` de la
   * revalidación sin reintroducir la query en bucle.
   */
  sincronizar: (frescos: ProductoAgregable[]) => void

  /** Última operación revertible. La consumen los banners de "Deshacer". */
  accionDeshacer: AccionDeshacer | null
  deshacer: () => void
  descartarDeshacer: () => void
}

export const ListaPedidoContext = createContext<ListaPedidoValue | null>(null)

export function useListaPedido(): ListaPedidoValue {
  const ctx = useContext(ListaPedidoContext)
  if (!ctx) {
    throw new Error('useListaPedido debe usarse dentro de <ListaPedidoProvider>')
  }
  return ctx
}

