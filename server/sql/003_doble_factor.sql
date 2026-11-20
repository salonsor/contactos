-- Verificación en dos pasos: contraseña y código de 6 cifras de una aplicación de autenticación (TOTP, RFC 6238).

-- Secreto TOTP cifrado con AES-256-GCM (nunca en claro); NULL = aún no ha dado de alta la aplicación
ALTER TABLE usuarios ADD COLUMN totp_secreto TEXT;
ALTER TABLE usuarios ADD COLUMN totp_activado_en TEXT;
-- Último intervalo de 30 s aceptado: un código ya usado no vale otra vez
ALTER TABLE usuarios ADD COLUMN totp_ultimo_paso INTEGER;

-- Códigos de recuperación de un solo uso, por si se pierde el móvil; se guarda su HMAC, no el código
CREATE TABLE codigos_recuperacion (
  id         INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  hash       TEXT    NOT NULL,
  usado_en   TEXT
);
CREATE INDEX codigos_recuperacion_usuario_idx ON codigos_recuperacion (usuario_id);

-- Una sesión empieza a medias (contraseña correcta) y se completa con el segundo factor.
-- Las sesiones abiertas antes de esta migración no pasaron el segundo factor: se cierran.
DELETE FROM sesiones;
ALTER TABLE sesiones ADD COLUMN paso TEXT NOT NULL DEFAULT 'completa' CHECK (paso IN ('segundo_factor', 'completa'));
ALTER TABLE sesiones ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0;   -- códigos fallidos en esta sesión
ALTER TABLE sesiones ADD COLUMN totp_alta TEXT;                         -- secreto cifrado propuesto durante el alta

-- Registro de accesos: quién, cuándo, desde dónde y qué pasó. Nunca guarda contraseñas ni códigos.
CREATE TABLE accesos (
  id         INTEGER PRIMARY KEY,
  fecha      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  usuario_id INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
  usuario    TEXT    NOT NULL DEFAULT '',   -- lo que se escribió, para los intentos con usuarios que no existen
  evento     TEXT    NOT NULL,
  ip         TEXT    NOT NULL DEFAULT '',
  agente     TEXT    NOT NULL DEFAULT '',
  admin_id   INTEGER REFERENCES usuarios (id) ON DELETE SET NULL   -- administrador que hizo la acción, si la hubo
);
CREATE INDEX accesos_fecha_idx ON accesos (fecha);
CREATE INDEX accesos_usuario_idx ON accesos (usuario COLLATE NOCASE, fecha);
CREATE INDEX accesos_ip_idx ON accesos (ip, fecha);
