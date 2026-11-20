-- Esquema SQLite de la campaña de depuración de contactos comerciales.
-- Fechas como texto «AAAA-MM-DD HH:MM:SS» en hora local; booleanos como 0/1; listas como texto JSON.

CREATE TABLE usuarios (
  id             INTEGER PRIMARY KEY,
  usuario        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre         TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'comercial' CHECK (rol IN ('comercial', 'admin')),
  ultima_entrada TEXT,
  clave_hash     TEXT,                                -- scrypt; NULL = aún no tiene contraseña
  clave_inicial  INTEGER NOT NULL DEFAULT 1,          -- generada por el administrador: hay que cambiarla
  activo         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE unidades (
  codigo  TEXT PRIMARY KEY,
  texto   TEXT NOT NULL,
  familia TEXT NOT NULL CHECK (familia IN ('postventa', 'venta')),
  icono   TEXT NOT NULL CHECK (icono IN ('maquinas', 'marinos', 'terrestres')),
  orden   INTEGER NOT NULL
);

INSERT INTO unidades (codigo, texto, familia, icono, orden) VALUES
  ('POSTVENTA_MAQUINAS',           'Postventa · Máquinas',   'postventa', 'maquinas',   1),
  ('POSTVENTA_MOTORES_MARINOS',    'Postventa · Marinos',    'postventa', 'marinos',    2),
  ('POSTVENTA_MOTORES_TERRESTRES', 'Postventa · Terrestres', 'postventa', 'terrestres', 3),
  ('VENTAS_MAQUINAS',              'Venta · Máquinas',       'venta',     'maquinas',   4),
  ('VENTA_MOTORES_MARINOS',        'Venta · Marinos',        'venta',     'marinos',    5),
  ('VENTA_MOTORES_TERRESTRES',     'Venta · Terrestres',     'venta',     'terrestres', 6);

-- Un contacto es único en la campaña; lo pueden ver varios comerciales (tabla asignaciones).
CREATE TABLE contactos (
  id             INTEGER PRIMARY KEY,
  num_contacto   TEXT,                        -- las altas nuevas no lo tienen hasta que el sistema lo asigne
  cliente        TEXT NOT NULL,
  localidad      TEXT NOT NULL DEFAULT '',
  pagador        TEXT NOT NULL DEFAULT '',
  solicitante    TEXT NOT NULL DEFAULT '',
  nombre         TEXT NOT NULL DEFAULT '',
  apellido       TEXT NOT NULL DEFAULT '',
  desc_dpto      TEXT NOT NULL DEFAULT '',
  desc_funcion   TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  tel_contacto   TEXT NOT NULL DEFAULT '',    -- móvil/directo de la persona
  telefono       TEXT NOT NULL DEFAULT '',    -- centralita del cliente
  tel_ad1        TEXT NOT NULL DEFAULT '',
  tel_ad2        TEXT NOT NULL DEFAULT '',
  tel_ad3        TEXT NOT NULL DEFAULT '',
  tel_ad4        TEXT NOT NULL DEFAULT '',
  tel_ad5        TEXT NOT NULL DEFAULT '',
  estado         TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente', 'ok', 'modificado', 'baja', 'conflicto')),
  es_alta        INTEGER NOT NULL DEFAULT 0,
  creado_en      TEXT,
  validado_en    TEXT,
  validado_por   INTEGER REFERENCES usuarios (id),
  validado_admin INTEGER REFERENCES usuarios (id)  -- admin que lo revisó entrando como el comercial
);

CREATE INDEX contactos_estado_idx ON contactos (estado);
CREATE INDEX contactos_cliente_idx ON contactos (cliente, solicitante);

CREATE TABLE asignaciones (
  contacto_id INTEGER NOT NULL REFERENCES contactos (id) ON DELETE CASCADE,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  unidad      TEXT    NOT NULL REFERENCES unidades (codigo),
  PRIMARY KEY (contacto_id, usuario_id, unidad)
);

CREATE INDEX asignaciones_usuario_idx ON asignaciones (usuario_id, unidad);

CREATE TABLE propuestas (
  id           INTEGER PRIMARY KEY,
  contacto_id  INTEGER NOT NULL REFERENCES contactos (id) ON DELETE CASCADE,
  comercial_id INTEGER NOT NULL REFERENCES usuarios (id),
  admin_id     INTEGER REFERENCES usuarios (id),   -- administrador que la hizo «entrando como» el comercial
  tipo         TEXT NOT NULL CHECK (tipo IN ('alta', 'modificacion', 'baja')),
  estado       TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  en_conflicto INTEGER NOT NULL DEFAULT 0,
  motivo       TEXT NOT NULL DEFAULT '',
  comentario   TEXT NOT NULL DEFAULT '',
  creado_en    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  resuelto_en  TEXT,
  resuelto_por INTEGER REFERENCES usuarios (id),   -- quién la aprobó o rechazó
  diff         TEXT NOT NULL DEFAULT '[]'          -- JSON: [[campo, antes, después], ...]
);

CREATE INDEX propuestas_contacto_idx ON propuestas (contacto_id);
CREATE INDEX propuestas_pendientes_idx ON propuestas (comercial_id) WHERE estado = 'pendiente';

CREATE TABLE sesiones (
  id         TEXT PRIMARY KEY,                     -- token aleatorio de la cookie
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  como_id    INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,  -- comercial suplantado por un administrador
  creada_en  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  expira_en  TEXT NOT NULL
);

-- Lo último que ha dicho cada comercial de cada contacto, para detectar desacuerdos (conflictos)
CREATE TABLE veredictos (
  contacto_id INTEGER NOT NULL REFERENCES contactos (id) ON DELETE CASCADE,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  veredicto   TEXT NOT NULL CHECK (veredicto IN ('ok', 'alta', 'modificacion', 'baja')),
  admin_id    INTEGER REFERENCES usuarios (id),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (contacto_id, usuario_id)
);

CREATE TABLE departamentos (
  id     INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE funciones (
  id              INTEGER PRIMARY KEY,
  departamento_id INTEGER NOT NULL REFERENCES departamentos (id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  UNIQUE (departamento_id, nombre)
);
