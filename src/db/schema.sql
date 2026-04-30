-- =============================================================================
-- LIALG / Base de datos de productos sin TACC en Argentina
-- Esquema SQLite v0.1
-- =============================================================================
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE categorias (
  id_categoria      INTEGER PRIMARY KEY,
  id_padre          INTEGER,
  nombre            TEXT    NOT NULL,
  slug              TEXT    NOT NULL,
  descripcion       TEXT,
  orden             INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (id_padre) REFERENCES categorias(id_categoria)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE (id_padre, nombre),
  UNIQUE (slug)
);
CREATE INDEX idx_categorias_padre ON categorias(id_padre);

CREATE TABLE marcas (
  id_marca          INTEGER PRIMARY KEY,
  nombre_marca      TEXT    NOT NULL,
  slug              TEXT    NOT NULL,
  empresa_titular   TEXT,
  cuit              TEXT,
  sitio_web         TEXT,
  email_contacto    TEXT,
  telefono_contacto TEXT,
  certificadora     TEXT,
  pais_origen       TEXT NOT NULL DEFAULT 'AR',
  observaciones     TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (slug),
  CHECK (length(pais_origen) = 2)
);
CREATE INDEX idx_marcas_nombre ON marcas(nombre_marca);
CREATE INDEX idx_marcas_cuit   ON marcas(cuit) WHERE cuit IS NOT NULL;

CREATE TABLE productos (
  id_producto             INTEGER PRIMARY KEY,
  id_marca                INTEGER NOT NULL,
  id_categoria            INTEGER,
  nombre_producto         TEXT    NOT NULL,
  nombre_fantasia         TEXT,
  descripcion             TEXT,
  ingredientes            TEXT,
  info_nutricional        TEXT
    CHECK (info_nutricional IS NULL OR json_valid(info_nutricional)),
  vida_util_dias          INTEGER CHECK (vida_util_dias IS NULL OR vida_util_dias > 0),
  condiciones_conservacion TEXT,
  tipo_registro           TEXT
    CHECK (tipo_registro IN ('RNPA','SENASA','INV') OR tipo_registro IS NULL),
  numero_registro         TEXT,
  fecha_alta_registro     TEXT,
  estado_certificacion    TEXT NOT NULL DEFAULT 'desconocido'
    CHECK (estado_certificacion IN (
      'vigente','baja_permanente','baja_provisoria','en_tramite','desconocido'
    )),
  observaciones           TEXT,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (id_marca)     REFERENCES marcas(id_marca)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria)
    ON UPDATE CASCADE ON DELETE SET NULL,
  UNIQUE (tipo_registro, numero_registro)
);
CREATE INDEX idx_productos_marca     ON productos(id_marca);
CREATE INDEX idx_productos_categoria ON productos(id_categoria);
CREATE INDEX idx_productos_estado    ON productos(estado_certificacion);
CREATE INDEX idx_productos_nombre    ON productos(nombre_producto);

CREATE TABLE aptitudes (
  id_aptitud   INTEGER PRIMARY KEY,
  codigo       TEXT NOT NULL UNIQUE,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO aptitudes (codigo, nombre) VALUES
  ('vegano',         'Vegano'),
  ('vegetariano',    'Vegetariano'),
  ('sin_lactosa',    'Sin lactosa'),
  ('sin_azucar',     'Sin azúcar agregada'),
  ('kosher',         'Kosher'),
  ('halal',          'Halal'),
  ('organico',       'Orgánico'),
  ('sin_sodio',      'Sin sodio agregado'),
  ('reducido_grasas','Reducido en grasas'),
  ('integral',       'Integral'),
  ('keto',           'Apto keto'),
  ('diabeticos',     'Apto diabéticos');

CREATE TABLE producto_aptitudes (
  id_producto  INTEGER NOT NULL,
  id_aptitud   INTEGER NOT NULL,
  fuente       TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id_producto, id_aptitud),
  FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (id_aptitud)  REFERENCES aptitudes(id_aptitud)
    ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX idx_prod_apt_aptitud ON producto_aptitudes(id_aptitud);

CREATE TABLE presentaciones (
  id_presentacion             INTEGER PRIMARY KEY,
  id_producto                 INTEGER NOT NULL,
  codigo_interno              TEXT,
  ean_13                      TEXT,
  formato                     TEXT
    CHECK (formato IN ('paquete','frasco','sachet','display','caja','botella','lata','bolsa','blister','otro')
      OR formato IS NULL),
  unidad_medida               TEXT
    CHECK (unidad_medida IN ('g','kg','ml','l','unidades','cc') OR unidad_medida IS NULL),
  contenido_neto              REAL CHECK (contenido_neto IS NULL OR contenido_neto > 0),
  unidades_por_bulto          INTEGER CHECK (unidades_por_bulto IS NULL OR unidades_por_bulto > 0),
  dimensiones_bulto           TEXT,
  peso_bulto_kg               REAL CHECK (peso_bulto_kg IS NULL OR peso_bulto_kg > 0),
  disponibilidad              TEXT NOT NULL DEFAULT 'desconocida'
    CHECK (disponibilidad IN ('disponible','discontinuada','estacional','desconocida')),
  foto_url                    TEXT,
  fecha_ultima_actualizacion  TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
    ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE (ean_13)
);
CREATE INDEX idx_pres_producto       ON presentaciones(id_producto);
CREATE INDEX idx_pres_codigo         ON presentaciones(codigo_interno) WHERE codigo_interno IS NOT NULL;
CREATE INDEX idx_pres_disponibilidad ON presentaciones(disponibilidad);

CREATE TABLE verificaciones (
  id_verificacion   INTEGER PRIMARY KEY,
  id_presentacion   INTEGER NOT NULL,
  fecha             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  tipo              TEXT NOT NULL
    CHECK (tipo IN ('alta','chequeo','cambio','baja')),
  fuente            TEXT NOT NULL
    CHECK (fuente IN ('ANMAT_CSV','ANMAT_ONLINE','sitio_marca','supermercado','manual','otro')),
  resultado         TEXT NOT NULL
    CHECK (resultado IN ('ok','desactualizado','baja_detectada','error','manual_review')),
  campo_modificado  TEXT,
  valor_anterior    TEXT,
  valor_nuevo       TEXT,
  observaciones     TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (id_presentacion) REFERENCES presentaciones(id_presentacion)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX idx_verif_presentacion ON verificaciones(id_presentacion);
CREATE INDEX idx_verif_fecha        ON verificaciones(fecha);
CREATE INDEX idx_verif_tipo         ON verificaciones(tipo);

CREATE TRIGGER trg_categorias_updated AFTER UPDATE ON categorias
FOR EACH ROW BEGIN
  UPDATE categorias SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id_categoria = OLD.id_categoria;
END;

CREATE TRIGGER trg_marcas_updated AFTER UPDATE ON marcas
FOR EACH ROW BEGIN
  UPDATE marcas SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id_marca = OLD.id_marca;
END;

CREATE TRIGGER trg_productos_updated AFTER UPDATE ON productos
FOR EACH ROW BEGIN
  UPDATE productos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id_producto = OLD.id_producto;
END;

CREATE TRIGGER trg_presentaciones_updated AFTER UPDATE ON presentaciones
FOR EACH ROW BEGIN
  UPDATE presentaciones SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id_presentacion = OLD.id_presentacion;
END;

CREATE VIEW v_presentaciones_completas AS
SELECT
  p.id_presentacion, p.ean_13, p.codigo_interno, p.formato,
  p.unidad_medida, p.contenido_neto, p.disponibilidad,
  pr.id_producto, pr.nombre_producto, pr.tipo_registro,
  pr.numero_registro, pr.estado_certificacion,
  m.id_marca, m.nombre_marca, m.empresa_titular,
  c.id_categoria, c.nombre AS categoria_nombre,
  cp.nombre AS categoria_padre_nombre
FROM presentaciones p
JOIN productos pr  ON pr.id_producto  = p.id_producto
JOIN marcas m      ON m.id_marca      = pr.id_marca
LEFT JOIN categorias c  ON c.id_categoria = pr.id_categoria
LEFT JOIN categorias cp ON cp.id_categoria = c.id_padre;
