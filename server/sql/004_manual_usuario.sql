-- Lo que pide el manual de usuario (octubre de 2026) y el esquema anterior no recogía.

-- Configuración de la campaña (rueda dentada del administrador)
CREATE TABLE config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);
INSERT INTO config (clave, valor) VALUES ('fecha_limite', ''), ('vacios_exportacion', '#');

-- Última petición de cada usuario: columna «Conexión» (conectado 5 min, inactivo hasta 15) y tablero del día
ALTER TABLE usuarios ADD COLUMN ultima_actividad TEXT;

-- Quién marcó las encuestas y quién justificó que falta el email o el móvil (se guardan al momento, sin aprobación)
ALTER TABLE contactos ADD COLUMN enc_por INTEGER REFERENCES usuarios (id);
ALTER TABLE contactos ADD COLUMN enc_admin INTEGER REFERENCES usuarios (id);
ALTER TABLE contactos ADD COLUMN enc_en TEXT;
ALTER TABLE contactos ADD COLUMN sin_datos_por INTEGER REFERENCES usuarios (id);
ALTER TABLE contactos ADD COLUMN sin_datos_admin INTEGER REFERENCES usuarios (id);
ALTER TABLE contactos ADD COLUMN sin_datos_en TEXT;

-- Propuestas: dos estados nuevos y la aplicación provisional.
--   superada: quedó sin efecto al decidir el administrador otra propuesta del mismo contacto (conflictos)
--   anulada:  la deshizo el propio comercial con «Deshacer»
--   aplicada: el cambio ya se ve en los datos del contacto (las correcciones en conflicto no se aplican hasta decidir)
--   previo:   cómo estaba el contacto antes de la propuesta, para devolverlo a ese estado al deshacer o rechazar
-- SQLite no permite cambiar un CHECK: la tabla se rehace con los mismos datos.
CREATE TABLE propuestas_nueva (
  id           INTEGER PRIMARY KEY,
  contacto_id  INTEGER NOT NULL REFERENCES contactos (id) ON DELETE CASCADE,
  comercial_id INTEGER NOT NULL REFERENCES usuarios (id),
  admin_id     INTEGER REFERENCES usuarios (id),
  tipo         TEXT NOT NULL CHECK (tipo IN ('alta', 'modificacion', 'baja')),
  estado       TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'superada', 'anulada')),
  en_conflicto INTEGER NOT NULL DEFAULT 0,
  aplicada     INTEGER NOT NULL DEFAULT 0,
  motivo       TEXT NOT NULL DEFAULT '',
  comentario   TEXT NOT NULL DEFAULT '',
  creado_en    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  resuelto_en  TEXT,
  resuelto_por INTEGER REFERENCES usuarios (id),
  diff         TEXT NOT NULL DEFAULT '[]',
  previo       TEXT NOT NULL DEFAULT '{}'
);
-- Las pendientes de antes no estaban aplicadas a los datos; aprobar escribe siempre los valores nuevos, así que basta con
-- marcarlas como aplicadas (salvo las que estaban en conflicto) para que cuenten como antes en el estado del contacto.
INSERT INTO propuestas_nueva (id, contacto_id, comercial_id, admin_id, tipo, estado, en_conflicto, aplicada, motivo, comentario,
  creado_en, resuelto_en, resuelto_por, diff)
SELECT id, contacto_id, comercial_id, admin_id, tipo, estado, en_conflicto, CASE WHEN en_conflicto THEN 0 ELSE 1 END, motivo, comentario,
  creado_en, resuelto_en, resuelto_por, diff
FROM propuestas;
DROP TABLE propuestas;
ALTER TABLE propuestas_nueva RENAME TO propuestas;
CREATE INDEX propuestas_contacto_idx ON propuestas (contacto_id);
CREATE INDEX propuestas_pendientes_idx ON propuestas (comercial_id) WHERE estado = 'pendiente';

-- Registro de actividad: la línea de tiempo de la ficha y «lo que ha hecho» cada usuario
CREATE TABLE actividad (
  id          INTEGER PRIMARY KEY,
  fecha       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  contacto_id INTEGER,                                 -- se conserva aunque el contacto (un alta) desaparezca
  contacto    TEXT    NOT NULL DEFAULT '',             -- nombre del contacto en ese momento
  usuario_id  INTEGER REFERENCES usuarios (id),        -- en cuyo nombre se hizo
  admin_id    INTEGER REFERENCES usuarios (id),        -- administrador que lo hizo «entrando como» el comercial
  accion      TEXT    NOT NULL,
  detalle     TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX actividad_contacto_idx ON actividad (contacto_id);
CREATE INDEX actividad_usuario_idx ON actividad (usuario_id, fecha);
CREATE INDEX actividad_fecha_idx ON actividad (fecha);
