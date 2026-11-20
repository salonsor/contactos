-- Datos que trae la base del programa anterior (contactos.sqlite) y que el esquema inicial no recogía.

-- Código de empleado del comercial
ALTER TABLE usuarios ADD COLUMN cod_empleado TEXT;
CREATE UNIQUE INDEX usuarios_cod_empleado_idx ON usuarios (cod_empleado) WHERE cod_empleado IS NOT NULL;

-- Provincia del cliente (como la localidad, se repite en cada contacto del cliente)
ALTER TABLE contactos ADD COLUMN cod_provincia TEXT NOT NULL DEFAULT '';
ALTER TABLE contactos ADD COLUMN provincia     TEXT NOT NULL DEFAULT '';
-- Códigos del maestro de departamentos y funciones; se recalculan al cambiar desc_dpto o desc_funcion
ALTER TABLE contactos ADD COLUMN cod_dpto      TEXT NOT NULL DEFAULT '';
ALTER TABLE contactos ADD COLUMN cod_funcion   TEXT NOT NULL DEFAULT '';
-- Teléfonos adicionales que tiene el contacto en el sistema de origen (pueden ser más de los cinco que se ven)
ALTER TABLE contactos ADD COLUMN n_tel_adicionales INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contactos ADD COLUMN enc_ventas    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contactos ADD COLUMN enc_postventa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contactos ADD COLUMN sin_email     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contactos ADD COLUMN motivo_sin_email TEXT NOT NULL DEFAULT '';
ALTER TABLE contactos ADD COLUMN sin_movil     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contactos ADD COLUMN motivo_sin_movil TEXT NOT NULL DEFAULT '';

-- Códigos del maestro (NULL en los que solo aparecen en los contactos)
ALTER TABLE departamentos ADD COLUMN codigo TEXT;
CREATE UNIQUE INDEX departamentos_codigo_idx ON departamentos (codigo) WHERE codigo IS NOT NULL;
ALTER TABLE funciones ADD COLUMN codigo TEXT;
CREATE UNIQUE INDEX funciones_codigo_idx ON funciones (departamento_id, codigo) WHERE codigo IS NOT NULL;

-- Cartera: cada cliente que lleva un comercial en una unidad, con su peso en facturación
CREATE TABLE cartera (
  usuario_id      INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  unidad          TEXT    NOT NULL REFERENCES unidades (codigo),
  pagador         TEXT    NOT NULL,
  solicitante     TEXT    NOT NULL,
  cliente         TEXT    NOT NULL,
  num_orden       INTEGER,             -- puesto del cliente por facturación
  facturacion     REAL,
  pct_total       REAL,                -- 0,0523 = 5,23 % del total
  pct_acum        REAL,
  fact_ultimo_ano REAL,
  area            TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (usuario_id, unidad, pagador, solicitante)
);

CREATE INDEX cartera_cliente_idx ON cartera (cliente, solicitante);
