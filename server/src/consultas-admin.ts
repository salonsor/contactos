import type {
  Acceso, Actividad, Config, Conflicto, Contadores, DatosContacto, EstadoPropuesta, Propuesta, PropuestaAdmin, Tablero, TipoPropuesta, UsuarioAdmin,
} from '../../shared/tipos.js';
import { CAMPOS } from '../../shared/tipos.js';
import type { Db } from './db.js';
import { JOIN_PROPUESTA, SQL_ACTIVIDAD, SQL_PROPUESTA } from './consultas.js';

export const contadores = async (db: Db): Promise<Contadores> => {
  const [r] = await db.query<Contadores>(`SELECT
    (SELECT count(*) FROM propuestas WHERE estado = 'pendiente' AND NOT en_conflicto) AS propuestasPendientes,
    (SELECT count(*) FROM contactos WHERE estado = 'conflicto') AS conflictos`);
  return r;
};

export interface FiltroPropuestas {
  /** Vacío = todos */
  estados: EstadoPropuesta[];
  tipos: TipoPropuesta[];
  comerciales: number[];
  /** Sin las pendientes en conflicto: esas se deciden en Conflictos */
  sinConflicto: boolean;
}

export const propuestas = async (db: Db, f: FiltroPropuestas): Promise<PropuestaAdmin[]> => {
  const cond: string[] = [];
  const params: unknown[] = [];
  const param = (v: unknown) => { params.push(v); return `?${params.length}`; };
  if (f.estados.length) cond.push(`p.estado IN (SELECT value FROM json_each(${param(JSON.stringify(f.estados))}))`);
  if (f.tipos.length) cond.push(`p.tipo IN (SELECT value FROM json_each(${param(JSON.stringify(f.tipos))}))`);
  if (f.comerciales.length) cond.push(`p.comercial_id IN (SELECT value FROM json_each(${param(JSON.stringify(f.comerciales))}))`);
  if (f.sinConflicto) cond.push(`NOT (p.estado = 'pendiente' AND p.en_conflicto)`);
  return db.query<PropuestaAdmin>(`
    SELECT ${SQL_PROPUESTA}, c.id AS contacto_id, trim(c.nombre || ' ' || c.apellido) AS contacto, c.num_contacto, c.cliente, c.localidad,
      c.estado AS estado_contacto, c.cod_dpto, c.cod_funcion,
      coalesce((SELECT group_concat(DISTINCT un.texto) FROM asignaciones a JOIN unidades un ON un.codigo = a.unidad
                WHERE a.contacto_id = c.id AND a.usuario_id = p.comercial_id), '') AS unidad_texto
    FROM propuestas p
    JOIN contactos c ON c.id = p.contacto_id
    ${JOIN_PROPUESTA}
    ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
    ORDER BY p.estado = 'pendiente' DESC, coalesce(p.resuelto_en, p.creado_en) DESC, p.id DESC
    LIMIT 2000`, params);
};

export const conflictos = async (db: Db): Promise<Conflicto[]> => {
  const contactos = await db.query<Omit<Conflicto, 'propuestas' | 'datos'> & DatosContacto>(`
    SELECT c.id AS contacto_id, trim(c.nombre || ' ' || c.apellido) AS contacto, c.num_contacto, c.desc_funcion, c.cliente, c.localidad,
      v.nombre AS validado_por, c.validado_en,
      c.nombre, c.apellido, c.desc_dpto, c.email, c.tel_contacto, c.telefono, c.tel_ad1, c.tel_ad2, c.tel_ad3, c.tel_ad4, c.tel_ad5
    FROM contactos c LEFT JOIN usuarios v ON v.id = c.validado_por
    WHERE c.estado = 'conflicto' ORDER BY c.cliente, c.apellido`);
  if (!contactos.length) return [];
  const ids = JSON.stringify(contactos.map((c) => c.contacto_id));
  const props = await db.query<Propuesta & { contacto_id: number }>(`
    SELECT p.contacto_id, ${SQL_PROPUESTA}
    FROM propuestas p ${JOIN_PROPUESTA}
    WHERE p.contacto_id IN (SELECT value FROM json_each(?1)) ORDER BY p.creado_en, p.id`, [ids]);
  const actividad = await db.query<Actividad>(`${SQL_ACTIVIDAD}
    WHERE ac.contacto_id IN (SELECT value FROM json_each(?1)) AND ac.accion IN ('ok', 'sin_datos', 'resolver')
    ORDER BY ac.fecha, ac.id`, [ids]);
  return contactos.map((c) => {
    const datos = Object.fromEntries(CAMPOS.map(({ k }) => [k, c[k] ?? ''])) as DatosContacto;
    const historial = props.filter((p) => p.contacto_id === c.contacto_id).map(({ contacto_id: _, ...p }) => p);
    // Toda escritura de datos deja su diff en una propuesta: el «antes» del primer cambio de cada campo es el dato de origen
    const inicial = { ...datos };
    for (const { k, t } of CAMPOS) {
      for (const p of historial) {
        const d = p.diff?.find((x) => x[0] === t);
        if (d) { inicial[k] = p.tipo === 'alta' ? d[2] : d[1]; break; }
      }
    }
    return {
      contacto_id: c.contacto_id, contacto: c.contacto, num_contacto: c.num_contacto, desc_funcion: c.desc_funcion,
      cliente: c.cliente, localidad: c.localidad, validado_por: c.validado_por, validado_en: c.validado_en,
      datos,
      propuestas: historial.filter((p) => p.estado === 'pendiente' && p.en_conflicto),
      inicial,
      historial,
      actividad: actividad.filter((a) => a.contacto_id === c.contacto_id),
    };
  });
};

export const usuarios = (db: Db) => db.query<UsuarioAdmin>(`
  SELECT u.id, u.usuario, u.cod_empleado AS codigo, u.nombre, u.rol, u.activo, u.clave_hash IS NOT NULL AS tieneClave,
    u.clave_inicial AS claveInicial, u.totp_secreto IS NOT NULL AS dobleFactor, u.ultima_entrada AS ultimaEntrada,
    u.ultima_actividad AS ultimaActividad,
    CASE WHEN u.ultima_actividad IS NULL THEN NULL
      ELSE CAST((julianday('now', 'localtime') - julianday(u.ultima_actividad)) * 1440 AS INTEGER) END AS minutosInactivo,
    count(DISTINCT a.contacto_id) > 0 AS esComercial,
    count(DISTINCT a.contacto_id) AS contactos,
    count(DISTINCT CASE WHEN c.estado <> 'pendiente' THEN a.contacto_id END) AS revisados
  FROM usuarios u
  LEFT JOIN asignaciones a ON a.usuario_id = u.id
  LEFT JOIN contactos c ON c.id = a.contacto_id
  GROUP BY u.id
  ORDER BY u.rol = 'admin' DESC, u.nombre`);

/** «Ahora en la aplicación»: quién está conectado y qué se ha hecho hoy */
export const tablero = async (db: Db): Promise<Tablero> => {
  const [r] = await db.query<{ conectados: number; inactivos: number; entradas: number }>(`SELECT
    (SELECT count(*) FROM usuarios WHERE ultima_actividad >= datetime('now', 'localtime', '-5 minutes')) AS conectados,
    (SELECT count(*) FROM usuarios WHERE ultima_actividad < datetime('now', 'localtime', '-5 minutes')
       AND ultima_actividad >= datetime('now', 'localtime', '-15 minutes')) AS inactivos,
    (SELECT count(DISTINCT usuario_id) FROM accesos WHERE evento = 'acceso_concedido' AND fecha >= date('now', 'localtime')) AS entradas`);
  const accionesHoy = await db.query<{ accion: string; n: number }>(`
    SELECT accion, count(*) AS n FROM actividad WHERE fecha >= date('now', 'localtime') GROUP BY accion ORDER BY n DESC`);
  return { conectados: r.conectados, inactivos: r.inactivos, entradasHoy: r.entradas, accionesHoy };
};

/** Lo que ha hecho un usuario (en su nombre, o él como administrador) */
export const actividadUsuario = (db: Db, id: number) => db.query<Actividad>(`
  ${SQL_ACTIVIDAD} WHERE ac.usuario_id = ?1 OR ac.admin_id = ?1 ORDER BY ac.id DESC LIMIT 500`, [id]);

/** Registro de accesos: los 500 últimos, opcionalmente de un usuario o de un tipo de evento */
export const accesos = (db: Db, f: { usuario: string; evento: string }) => db.query<Acceso>(`
  SELECT a.id, a.fecha, a.usuario, u.nombre, a.evento, a.ip, a.agente, ad.nombre AS admin
  FROM accesos a
  LEFT JOIN usuarios u ON u.id = a.usuario_id
  LEFT JOIN usuarios ad ON ad.id = a.admin_id
  WHERE (?1 = '' OR a.usuario = ?1 COLLATE NOCASE) AND (?2 = '' OR a.evento = ?2)
  ORDER BY a.id DESC
  LIMIT 500`, [f.usuario, f.evento]);

// ── Configuración ──

export const leerConfig = async (db: Pick<Db, 'query'>): Promise<Config> => {
  const filas = await db.query<{ clave: string; valor: string }>('SELECT clave, valor FROM config');
  const v = new Map(filas.map((f) => [f.clave, f.valor]));
  return { fechaLimite: v.get('fecha_limite') ?? '', vaciosExportacion: v.get('vacios_exportacion') === '' ? '' : '#' };
};

export const guardarConfig = async (db: Db, c: Partial<Config>) => {
  if (typeof c.fechaLimite === 'string') {
    await db.query(`INSERT INTO config (clave, valor) VALUES ('fecha_limite', ?1) ON CONFLICT (clave) DO UPDATE SET valor = ?1`, [c.fechaLimite.trim().slice(0, 60)]);
  }
  if (c.vaciosExportacion === '#' || c.vaciosExportacion === '') {
    await db.query(`INSERT INTO config (clave, valor) VALUES ('vacios_exportacion', ?1) ON CONFLICT (clave) DO UPDATE SET valor = ?1`, [c.vaciosExportacion]);
  }
  return leerConfig(db);
};
