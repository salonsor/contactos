import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import type { Rol, Sesion } from '../../shared/tipos.js';
import type { Db } from './db.js';

const scrypt = promisify(scryptCb) as (clave: string, sal: Buffer, largo: number) => Promise<Buffer>;

export const COOKIE = 'sid';
const DURACION_HORAS = 12;
/** Tiempo para escribir el código de la aplicación tras acertar la contraseña */
const DURACION_PENDIENTE_MIN = 5;

export const hashClave = async (clave: string) => {
  const sal = randomBytes(16);
  const h = await scrypt(clave, sal, 64);
  return `scrypt$${sal.toString('base64')}$${h.toString('base64')}`;
};

export const comprobarClave = async (clave: string, guardada: string | null) => {
  const [alg, sal, h] = (guardada ?? '').split('$');
  if (alg !== 'scrypt' || !sal || !h) return false;
  const esperado = Buffer.from(h, 'base64');
  const calculado = await scrypt(clave, Buffer.from(sal, 'base64'), esperado.length);
  return timingSafeEqual(esperado, calculado);
};

/** Contraseña legible para dársela al comercial: sin caracteres que se confundan (0/O, 1/l) */
// Siempre aleatoria y distinta por usuario. La común (CLAVE_POR_DEFECTO) solo se usa en las cargas masivas:
// db:clave-defecto y los comerciales nuevos de la carga por Excel.
export const generarClave = () => {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(10), (b) => letras[b % letras.length]).join('');
};

export const leerCookie = (req: Request, nombre: string) => {
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
};

export const ponerCookie = (res: Response, valor: string, req: Request) => {
  res.cookie(COOKIE, valor, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: DURACION_HORAS * 3600 * 1000,
    path: '/',
  });
};

/**
 * Tras la contraseña, una sesión a medias que solo sirve para el segundo factor y caduca en 5 minutos;
 * tras el segundo factor, la sesión completa (con un token nuevo: el de la sesión a medias deja de valer).
 */
export const crearSesion = async (db: Pick<Db, 'query'>, usuarioId: number, paso: 'segundo_factor' | 'completa') => {
  const id = randomBytes(32).toString('base64url');
  const duracion = paso === 'completa' ? `+${DURACION_HORAS} hours` : `+${DURACION_PENDIENTE_MIN} minutes`;
  await db.query(
    `INSERT INTO sesiones (id, usuario_id, paso, expira_en) VALUES (?1, ?2, ?3, datetime('now', 'localtime', ?4))`,
    [id, usuarioId, paso, duracion]);
  await db.query(`DELETE FROM sesiones WHERE expira_en < datetime('now', 'localtime')`);
  return id;
};

export interface Contexto {
  sesionId: string;
  /** Quien ha iniciado sesión */
  real: { id: number; nombre: string; usuario: string; rol: Rol; claveInicial: boolean; esComercial: boolean };
  /** En nombre de quién actúa: el comercial suplantado o él mismo */
  efectivo: { id: number; nombre: string; usuario: string; rol: Rol };
}

/** Sesión a medias: la contraseña era correcta y falta el segundo factor */
export interface Pendiente {
  sesionId: string;
  usuarioId: number;
  usuario: string;
  nombre: string;
  /** Secreto TOTP cifrado; null si aún no ha dado de alta la aplicación */
  totpSecreto: string | null;
  totpUltimoPaso: number | null;
  /** Secreto propuesto durante el alta, cifrado */
  totpAlta: string | null;
  intentos: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    ctx?: Contexto;
    pendiente?: Pendiente;
  }
}

/** Carga la sesión de la cookie, si la hay y no ha caducado. Una sesión a medias no da acceso a nada más que al segundo factor. */
export const cargarSesion = (db: Db) => async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const sid = leerCookie(req, COOKIE);
    if (sid) {
      const [s] = await db.query<{
        id: number; nombre: string; usuario: string; rol: Rol; clave_inicial: boolean; es_comercial: boolean;
        como_id: number | null; como_nombre: string | null; como_usuario: string | null; como_rol: Rol | null;
        paso: 'segundo_factor' | 'completa'; intentos: number; totp_alta: string | null;
        totp_secreto: string | null; totp_ultimo_paso: number | null;
      }>(`
        SELECT u.id, u.nombre, u.usuario, u.rol, u.clave_inicial, u.totp_secreto, u.totp_ultimo_paso,
          EXISTS (SELECT 1 FROM asignaciones a WHERE a.usuario_id = u.id) AS es_comercial,
          s.paso, s.intentos, s.totp_alta,
          c.id AS como_id, c.nombre AS como_nombre, c.usuario AS como_usuario, c.rol AS como_rol
        FROM sesiones s
        JOIN usuarios u ON u.id = s.usuario_id AND u.activo
        LEFT JOIN usuarios c ON c.id = s.como_id
        WHERE s.id = ?1 AND s.expira_en > datetime('now', 'localtime')`, [sid]);
      if (s?.paso === 'segundo_factor') {
        req.pendiente = {
          sesionId: sid, usuarioId: s.id, usuario: s.usuario, nombre: s.nombre, totpSecreto: s.totp_secreto,
          totpUltimoPaso: s.totp_ultimo_paso, totpAlta: s.totp_alta, intentos: s.intentos,
        };
      } else if (s) {
        const real = { id: s.id, nombre: s.nombre, usuario: s.usuario, rol: s.rol, claveInicial: s.clave_inicial, esComercial: s.es_comercial };
        // Última petición: columna «Conexión» de Usuarios (se apunta como mucho una vez por minuto)
        await db.query(`UPDATE usuarios SET ultima_actividad = datetime('now', 'localtime')
          WHERE id = ?1 AND (ultima_actividad IS NULL OR ultima_actividad < datetime('now', 'localtime', '-1 minute'))`, [s.id]);
        req.ctx = {
          sesionId: sid,
          real,
          efectivo: s.como_id
            ? { id: s.como_id, nombre: s.como_nombre!, usuario: s.como_usuario!, rol: s.como_rol! }
            : real,
        };
      }
    }
    next();
  } catch (e) {
    next(e);
  }
};

export const aSesion = (ctx: Contexto): Sesion => ({
  paso: 'completa',
  id: ctx.real.id,
  nombre: ctx.real.nombre,
  usuario: ctx.real.usuario,
  rol: ctx.real.rol,
  claveInicial: ctx.real.claveInicial,
  esComercial: ctx.real.esComercial,
  como: ctx.efectivo.id !== ctx.real.id ? { id: ctx.efectivo.id, nombre: ctx.efectivo.nombre, usuario: ctx.efectivo.usuario } : null,
});

export const exigirSesion = (req: Request, res: Response, next: NextFunction) => {
  if (!req.ctx) return res.status(401).json({ error: 'Inicia sesión' });
  // Con la contraseña generada por el administrador solo se puede cambiarla
  if (req.ctx.real.claveInicial) return res.status(403).json({ error: 'Cambia tu contraseña antes de seguir', cambiarClave: true });
  next();
};

/** Administrador actuando como tal (no mientras está «entrando como» un comercial) */
export const exigirAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.ctx?.real.rol !== 'admin' || req.ctx.efectivo.id !== req.ctx.real.id) {
    return res.status(403).json({ error: 'Solo para administradores' });
  }
  next();
};

/**
 * Las peticiones que cambian algo deben llegar como JSON: un formulario de otra web no puede enviar
 * Content-Type application/json sin permiso CORS, y la cookie es SameSite=Lax.
 */
export const soloJson = (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
    return res.status(415).json({ error: 'Las peticiones deben ser JSON' });
  }
  next();
};
