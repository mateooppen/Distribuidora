/**
 * Cliente HTTP del dashboard.
 *
 * Apunta a la API de Fastify en http://localhost:3001.
 * Tipos duplicados a propósito (boundary explícito de contrato HTTP).
 */

// En producción el frontend se sirve desde el mismo origen que la API,
// por lo que API_BASE queda vacío (rutas relativas). En dev apunta a :3001.
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

// ── Tipos ─────────────────────────────────────────────────────────────────

export type EstadoCertificacion =
  | 'vigente'
  | 'baja_permanente'
  | 'baja_provisoria'
  | 'en_tramite'
  | 'desconocido'

export type SortKey = 'nombre' | 'marca'
export type SortOrder = 'asc' | 'desc'

export interface ProductoListItem {
  id_producto: number
  nombre_producto: string
  nombre_fantasia: string | null
  numero_registro: string | null
  estado_certificacion: EstadoCertificacion
  updated_at: string
  id_marca: number
  nombre_marca: string
}

export interface ProductosFilters {
  q?: string
  marca?: number | null
  estado?: EstadoCertificacion | null
  categoria?: string | null
  sort?: SortKey
  order?: SortOrder
  page?: number
  pageSize?: number
}

// ── Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardResumen {
  productos: number
  marcas: number
  categorias: number
}

export interface DashboardResumenResponse {
  productos: number
  marcas: number
  categorias: number
}

export interface CategoriaNode {
  id_categoria: number
  id_padre: number | null
  nombre: string
  slug: string
  orden: number
  total_productos: number
  hijos: CategoriaNode[]
}

export interface DashboardCategoriasResponse {
  data: CategoriaNode[]
}

export interface CategoriaFiltro {
  id_categoria: number
  id_padre: number | null
  nombre: string
  slug: string
  orden: number
}

export interface FiltrosCategoriasResponse {
  data: CategoriaFiltro[]
}

export interface ProductosResponse {
  data: ProductoListItem[]
  total: number
  page: number
  pageSize: number
}

export interface MarcaFiltro {
  id_marca: number
  nombre_marca: string
  total_productos: number
}

export interface MarcasResponse {
  data: MarcaFiltro[]
}

export interface MarcaPorId {
  id_marca: number
  nombre_marca: string
  total_productos: number
}

export interface MarcaPorIdResponse {
  data: MarcaPorId
}

// Listado paginado de marcas (pantalla /marcas)
export type MarcasSortKey = 'nombre' | 'productos'

export interface MarcaListItem {
  id_marca: number
  nombre_marca: string
  empresa_titular: string | null
  cuit: string | null
  sitio_web: string | null
  total_productos: number
}

export interface MarcasFilters {
  q?: string
  sort?: MarcasSortKey
  order?: SortOrder
  page?: number
  pageSize?: number
}

export interface MarcasListResponse {
  data: MarcaListItem[]
  total: number
  page: number
  pageSize: number
}

// ── Detalle de producto ───────────────────────────────────────────────────

export type Formato =
  | 'paquete' | 'frasco' | 'sachet' | 'display' | 'caja'
  | 'botella' | 'lata' | 'bolsa' | 'blister' | 'otro'

export type UnidadMedida = 'g' | 'kg' | 'ml' | 'l' | 'unidades' | 'cc'

export type Disponibilidad =
  | 'disponible' | 'discontinuada' | 'estacional' | 'desconocida'

export type VerificacionTipo = 'alta' | 'chequeo' | 'cambio' | 'baja'
export type VerificacionFuente =
  | 'ANMAT_CSV' | 'ANMAT_ONLINE' | 'sitio_marca'
  | 'supermercado' | 'manual' | 'otro'
export type VerificacionResultado =
  | 'ok' | 'desactualizado' | 'baja_detectada' | 'error' | 'manual_review'

export interface MarcaDetalle {
  id_marca: number
  nombre_marca: string
  empresa_titular: string | null
  cuit: string | null
  sitio_web: string | null
  certificadora: string | null
}

export interface CategoriaDetalle {
  id_categoria: number
  nombre: string
  slug: string
  padre_nombre: string | null
}

export interface Presentacion {
  id_presentacion: number
  codigo_interno: string | null
  ean_13: string | null
  formato: Formato | null
  unidad_medida: UnidadMedida | null
  contenido_neto: number | null
  unidades_por_bulto: number | null
  dimensiones_bulto: string | null
  peso_bulto_kg: number | null
  disponibilidad: Disponibilidad
  foto_url: string | null
  fecha_ultima_actualizacion: string
}

export interface Aptitud {
  id_aptitud: number
  codigo: string
  nombre: string
  descripcion: string | null
  fuente: string | null
}

export interface Verificacion {
  id_verificacion: number
  id_presentacion: number
  fecha: string
  tipo: VerificacionTipo
  fuente: VerificacionFuente
  resultado: VerificacionResultado
  campo_modificado: string | null
  valor_anterior: string | null
  valor_nuevo: string | null
  observaciones: string | null
}

export interface ProductoDetalle {
  id_producto: number
  nombre_producto: string
  nombre_fantasia: string | null
  descripcion: string | null
  ingredientes: string | null
  info_nutricional: string | null
  vida_util_dias: number | null
  condiciones_conservacion: string | null
  tipo_registro: 'RNPA' | 'SENASA' | 'INV' | null
  numero_registro: string | null
  fecha_alta_registro: string | null
  estado_certificacion: EstadoCertificacion
  observaciones: string | null
  created_at: string
  updated_at: string
  marca: MarcaDetalle
  categoria: CategoriaDetalle | null
  presentaciones: Presentacion[]
  aptitudes: Aptitud[]
  verificaciones: Verificacion[]
}

export interface ProductoDetalleResponse {
  data: ProductoDetalle
}

// ── Admin / sync ──────────────────────────────────────────────────────────

export interface SyncRun {
  id_sync_run: number
  iniciado_en: string
  finalizado_en: string | null
  estado: 'en_curso' | 'ok' | 'error'
  productos_nuevos: number | null
  marcas_fusionadas: number | null
  duracion_seg: number | null
  error_mensaje: string | null
}

export interface UpdateStatusResponse {
  en_curso: boolean
  ultimo_run: SyncRun | null
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${path}`)
  }
  return (await res.json()) as T
}

async function post<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

function buildQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

// ── Endpoints ─────────────────────────────────────────────────────────────

export const api = {
  health: () => get<{ ok: boolean }>('/api/health'),

  dashboardResumen: () => get<DashboardResumenResponse>('/api/dashboard/resumen'),

  dashboardCategoriasJerarquia: () =>
    get<DashboardCategoriasResponse>('/api/dashboard/categorias-jerarquia'),

  filtrosCategorias: () =>
    get<FiltrosCategoriasResponse>('/api/filtros/categorias'),

  productos: (filters: ProductosFilters = {}) => {
    const query = buildQuery({
      q: filters.q,
      marca: filters.marca,
      estado: filters.estado,
      categoria: filters.categoria,
      sort: filters.sort,
      order: filters.order,
      page: filters.page,
      pageSize: filters.pageSize,
    })
    return get<ProductosResponse>(`/api/productos${query}`)
  },

  productoById: (id: number) =>
    get<ProductoDetalleResponse>(`/api/productos/${id}`),

  marcas: (filters: MarcasFilters = {}) => {
    const query = buildQuery({
      q: filters.q,
      sort: filters.sort,
      order: filters.order,
      page: filters.page,
      pageSize: filters.pageSize,
    })
    return get<MarcasListResponse>(`/api/marcas${query}`)
  },

  marcaById: (id: number) => get<MarcaPorIdResponse>(`/api/marcas/${id}`),

  filtrosMarcas: (q = '', limit = 30) => {
    const query = buildQuery({ q: q.trim() || undefined, limit })
    return get<MarcasResponse>(`/api/filtros/marcas${query}`)
  },

  syncStatus: () => get<UpdateStatusResponse>('/api/admin/update/status'),

  triggerUpdate: (token: string) =>
    post<{ ok: boolean; mensaje: string }>('/api/admin/update', token),
}
