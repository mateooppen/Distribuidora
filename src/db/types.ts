import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type AutoTimestamp = ColumnType<string, string | undefined, string | undefined>;

export interface CategoriasTable {
  id_categoria: Generated<number>;
  id_padre: number | null;
  nombre: string;
  slug: string;
  descripcion: string | null;
  orden: ColumnType<number, number | undefined, number | undefined>;
  created_at: AutoTimestamp;
  updated_at: AutoTimestamp;
}

export interface MarcasTable {
  id_marca: Generated<number>;
  nombre_marca: string;
  slug: string;
  empresa_titular: string | null;
  cuit: string | null;
  sitio_web: string | null;
  email_contacto: string | null;
  telefono_contacto: string | null;
  certificadora: string | null;
  pais_origen: ColumnType<string, string | undefined, string | undefined>;
  observaciones: string | null;
  created_at: AutoTimestamp;
  updated_at: AutoTimestamp;
}

export type TipoRegistro = 'RNPA' | 'SENASA' | 'INV';
export type EstadoCertificacion =
  | 'vigente'
  | 'baja_permanente'
  | 'baja_provisoria'
  | 'en_tramite'
  | 'desconocido';

export interface ProductosTable {
  id_producto: Generated<number>;
  id_marca: number;
  id_categoria: number | null;
  nombre_producto: string;
  nombre_fantasia: string | null;
  descripcion: string | null;
  ingredientes: string | null;
  info_nutricional: string | null;
  vida_util_dias: number | null;
  condiciones_conservacion: string | null;
  tipo_registro: TipoRegistro | null;
  numero_registro: string | null;
  fecha_alta_registro: string | null;
  estado_certificacion: ColumnType<EstadoCertificacion, EstadoCertificacion | undefined, EstadoCertificacion | undefined>;
  observaciones: string | null;
  created_at: AutoTimestamp;
  updated_at: AutoTimestamp;
}

export interface AptitudesTable {
  id_aptitud: Generated<number>;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  created_at: AutoTimestamp;
}

export interface ProductoAptitudesTable {
  id_producto: number;
  id_aptitud: number;
  fuente: string | null;
  created_at: AutoTimestamp;
}

export type Formato = 'paquete' | 'frasco' | 'sachet' | 'display' | 'caja' | 'botella' | 'lata' | 'bolsa' | 'blister' | 'otro';
export type UnidadMedida = 'g' | 'kg' | 'ml' | 'l' | 'unidades' | 'cc';
export type Disponibilidad = 'disponible' | 'discontinuada' | 'estacional' | 'desconocida';

export interface PresentacionesTable {
  id_presentacion: Generated<number>;
  id_producto: number;
  codigo_interno: string | null;
  ean_13: string | null;
  formato: Formato | null;
  unidad_medida: UnidadMedida | null;
  contenido_neto: number | null;
  unidades_por_bulto: number | null;
  dimensiones_bulto: string | null;
  peso_bulto_kg: number | null;
  disponibilidad: ColumnType<Disponibilidad, Disponibilidad | undefined, Disponibilidad | undefined>;
  foto_url: string | null;
  fecha_ultima_actualizacion: AutoTimestamp;
  created_at: AutoTimestamp;
  updated_at: AutoTimestamp;
}

export type VerificacionTipo = 'alta' | 'chequeo' | 'cambio' | 'baja';
export type VerificacionFuente = 'ANMAT_CSV' | 'ANMAT_ONLINE' | 'sitio_marca' | 'supermercado' | 'manual' | 'otro';
export type VerificacionResultado = 'ok' | 'desactualizado' | 'baja_detectada' | 'error' | 'manual_review';

export interface VerificacionesTable {
  id_verificacion: Generated<number>;
  id_presentacion: number;
  fecha: AutoTimestamp;
  tipo: VerificacionTipo;
  fuente: VerificacionFuente;
  resultado: VerificacionResultado;
  campo_modificado: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  observaciones: string | null;
  created_at: AutoTimestamp;
}

export interface VPresentacionesCompletasView {
  id_presentacion: number;
  ean_13: string | null;
  codigo_interno: string | null;
  formato: Formato | null;
  unidad_medida: UnidadMedida | null;
  contenido_neto: number | null;
  disponibilidad: Disponibilidad;
  id_producto: number;
  nombre_producto: string;
  tipo_registro: TipoRegistro | null;
  numero_registro: string | null;
  estado_certificacion: EstadoCertificacion;
  id_marca: number;
  nombre_marca: string;
  empresa_titular: string | null;
  id_categoria: number | null;
  categoria_nombre: string | null;
  categoria_padre_nombre: string | null;
}

export interface DB {
  categorias: CategoriasTable;
  marcas: MarcasTable;
  productos: ProductosTable;
  aptitudes: AptitudesTable;
  producto_aptitudes: ProductoAptitudesTable;
  presentaciones: PresentacionesTable;
  verificaciones: VerificacionesTable;
  v_presentaciones_completas: VPresentacionesCompletasView;
}

export type Marca = Selectable<MarcasTable>;
export type NewMarca = Insertable<MarcasTable>;
export type MarcaUpdate = Updateable<MarcasTable>;
export type Producto = Selectable<ProductosTable>;
export type NewProducto = Insertable<ProductosTable>;
export type Presentacion = Selectable<PresentacionesTable>;
export type NewPresentacion = Insertable<PresentacionesTable>;
export type Verificacion = Selectable<VerificacionesTable>;
export type NewVerificacion = Insertable<VerificacionesTable>;
