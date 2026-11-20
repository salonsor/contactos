// Segundo factor de acceso: código de 6 cifras de una aplicación de autenticación (TOTP, RFC 6238),
// con códigos de recuperación de un solo uso, registro de accesos y límite de intentos fallidos.
//
// El secreto TOTP se guarda cifrado con AES-256-GCM. La clave sale de CLAVE_2FA (server/.env o las variables del
// proyecto en Vercel, 32 bytes en base64) o, fuera de Vercel y si no está, del fichero server/.clave-2fa, que se
// crea la primera vez. Conviene guardarla aparte
// de las copias de la base: sin ella, los secretos no sirven de nada.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import QRCode from 'qrcode';
import type { EventoAcceso } from '../../shared/tipos.js';
import type { Db } from './db.js';

const EMISOR = 'Depuración de contactos';
const PERIODO = 30;           // segundos por código
const CIFRAS = 6;
const MARGEN = 1;             // se acepta el código anterior y el siguiente (relojes desajustados)
export const MAX_INTENTOS_SESION = 5;
const VENTANA_MIN = 15;
const MAX_FALLOS_USUARIO = 10;
const MAX_FALLOS_IP = 30;

// ── Clave de cifrado ──

let claveCache: Buffer | null = null;
const claveMaestra = () => {
  if (claveCache) return claveCache;
  const env = process.env.CLAVE_2FA?.trim();
  let clave: Buffer;
  if (env) {
    clave = Buffer.from(env, 'base64');
  } else if (process.env.VERCEL) {
    // En Vercel no hay disco donde guardar el fichero: la clave tiene que venir en las variables de entorno
    throw new Error('Falta la variable de entorno CLAVE_2FA en el proyecto de Vercel');
  } else {
    const fichero = path.resolve(process.cwd(), '.clave-2fa');
    if (!existsSync(fichero)) {
      writeFileSync(fichero, randomBytes(32).toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
      console.warn(`Creada la clave de cifrado del segundo factor en ${fichero}. Guárdala aparte de las copias de la base.`);
    }
    clave = Buffer.from(readFileSync(fichero, 'utf8').trim(), 'base64');
  }
  if (clave.length !== 32) throw new Error('CLAVE_2FA debe ser de 32 bytes en base64 (p. ej. node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))")');
  return (claveCache = clave);
};
// Subclaves distintas para cifrar secretos y para firmar los códigos de recuperación
const subclave = (uso: string) => createHmac('sha256', claveMaestra()).update(uso).digest();

export const cifrar = (texto: string) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', subclave('cifrado-totp'), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join(':');
};

export const descifrar = (guardado: string) => {
  const [v, iv, tag, datos] = guardado.split(':');
  if (v !== 'v1') throw new Error('Formato de secreto desconocido');
  const d = createDecipheriv('aes-256-gcm', subclave('cifrado-totp'), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
};

// ── TOTP ──

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const base32 = (buf: Buffer) => {
  let bits = 0, valor = 0, sal = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { sal += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) sal += B32[(valor << (5 - bits)) & 31];
  return sal;
};
const deBase32 = (s: string) => {
  let bits = 0, valor = 0;
  const sal: number[] = [];
  for (const ch of s.replace(/[\s=]/g, '').toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Secreto no válido');
    valor = (valor << 5) | i; bits += 5;
    if (bits >= 8) { sal.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(sal);
};

/** Código TOTP del intervalo `paso` (HMAC-SHA1, truncado dinámico de la RFC 4226) */
export const totp = (secretoB32: string, paso: number) => {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', deBase32(secretoB32)).update(contador).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** CIFRAS).padStart(CIFRAS, '0');
};

const pasoActual = () => Math.floor(Date.now() / 1000 / PERIODO);

const iguales = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Devuelve el intervalo del código si es válido y posterior al último usado; si no, null */
export const comprobarTotp = (secretoB32: string, codigo: string, ultimoPaso: number | null) => {
  const limpio = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return null;
  const ahora = pasoActual();
  for (let p = ahora - MARGEN; p <= ahora + MARGEN; p++) {
    if (ultimoPaso !== null && p <= ultimoPaso) continue;
    if (iguales(totp(secretoB32, p), limpio)) return p;
  }
  return null;
};

export const nuevoSecreto = () => base32(randomBytes(20));

export const datosAlta = async (usuario: string, secretoB32: string) => {
  const uri = `otpauth://totp/${encodeURIComponent(`${EMISOR}:${usuario}`)}?secret=${secretoB32}`
    + `&issuer=${encodeURIComponent(EMISOR)}&algorithm=SHA1&digits=${CIFRAS}&period=${PERIODO}`;
  return {
    qr: await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
    // En grupos de 4 para teclearlo a mano si no se puede leer el QR
    secreto: secretoB32.match(/.{1,4}/g)!.join(' '),
  };
};

// ── Códigos de recuperación ──

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const N_CODIGOS = 10;
const normalizarCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashCodigo = (c: string) => createHmac('sha256', subclave('codigos-recuperacion')).update(normalizarCodigo(c)).digest('base64');
export const pareceCodigoRecuperacion = (c: string) => normalizarCodigo(c).length === 8 && !/^\d+$/.test(normalizarCodigo(c));

export const nuevosCodigos = () => Array.from({ length: N_CODIGOS }, () => {
  const s = Array.from(randomBytes(8), (b) => LETRAS[b % LETRAS.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
});

// ── Registro de accesos y límite de intentos ──

const ipDe = (req: Request) => (req.ip ?? '').replace(/^::ffff:/, '').slice(0, 64);

/** Apunta un evento de acceso; `req` null = hecho desde la consola del servidor */
export const registrar = (db: Pick<Db, 'query'>, req: Request | null, evento: EventoAcceso,
  quien: { usuarioId?: number | null; usuario?: string; adminId?: number | null }) => db.query(`
  INSERT INTO accesos (usuario_id, usuario, evento, ip, agente, admin_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
[quien.usuarioId ?? null, (quien.usuario ?? '').slice(0, 60), evento, req ? ipDe(req) : 'consola',
  req ? String(req.get('user-agent') ?? '').slice(0, 200) : '', quien.adminId ?? null]);

const FALLOS = `('clave_incorrecta', 'codigo_incorrecto')`;

/**
 * Fallos de los últimos 15 minutos (se guardan en la base, así que sobreviven a un reinicio). Por usuario,
 * desde su último acceso correcto; por IP, en total. Devuelve el motivo del bloqueo o null.
 */
export const bloqueo = async (db: Db, usuario: string, req: Request) => {
  const [r] = await db.query<{ porUsuario: number; porIp: number }>(`
    SELECT
      (SELECT count(*) FROM accesos a WHERE a.usuario = ?1 COLLATE NOCASE AND a.evento IN ${FALLOS}
         AND a.fecha > datetime('now', 'localtime', ?3)
         AND a.id > coalesce((SELECT max(id) FROM accesos b WHERE b.usuario = ?1 COLLATE NOCASE AND b.evento = 'acceso_concedido'), 0)) AS porUsuario,
      (SELECT count(*) FROM accesos a WHERE a.ip = ?2 AND a.evento IN ${FALLOS} AND a.fecha > datetime('now', 'localtime', ?3)) AS porIp`,
  [usuario.slice(0, 60), ipDe(req), `-${VENTANA_MIN} minutes`]);
  if (r.porUsuario >= MAX_FALLOS_USUARIO) return 'usuario';
  if (r.porIp >= MAX_FALLOS_IP) return 'ip';
  return null;
};
