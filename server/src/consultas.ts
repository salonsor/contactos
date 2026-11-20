import type { Actividad, Avance, Cifras, CriterioGlobal, DatosContacto, Estado, Ficha, FilaContacto, Listado, Propuesta, TipoPropuesta, Unidad } from '../../shared/tipos.js';
import { ESTADOS, faltanDatos } from '../../shared/tipos.js';
import type { Db } from './db.js';

// Columnas comunes de una fila del listado (alias c = contactos, v = usuario que lo validó)
const COLS_FILA = `
  c.id, c.cliente, c.localidad, c.nombre, c.apellido, c.desc_funcion, c.email, c.tel_contacto, c.telefono,
  c.estado, c.es_alta, coalesce(v.nombre, '') AS validado_por, c.enc_ventas, c.enc_postventa,
  (SELECT count(*) FROM propuestas p WHERE p.contacto_id = c.id AND p.estado = 'pendiente') AS pendientes`;

const COLS_FALTA = 'c.tel_ad1, c.tel_ad2, c.tel_ad3, c.tel_ad4, c.tel_ad5, c.sin_email, c.sin_movil';

export const ahoraLocal = () => {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
};

/** Comerciales = quien figura como comercial de algún cliente (un administrador también puede serlo) */
const COMERCIALES_CON_CONTACTOS = `
  SELECT u.* FROM usuarios u
  WHERE EXISTS (SELECT 1 FROM asignaciones a WHERE a.usuario_id = u.id)`;

// Cifras de un comercial: contactos, revisados y propuestas suyas pendientes (agrupadas por lo que se indique)
const SQL_CIFRAS = (agrupar: string) => `
  SELECT a.usuario_id, ${agrupar} AS unidad,
    count(DISTINCT a.contacto_id) AS t,
    count(DISTINCT CASE WHEN c.estado <> 'pendiente' THEN a.contacto_id END) AS r,
    count(DISTINCT p.id) AS p
  FROM asignaciones a
  JOIN contactos c ON c.id = a.contacto_id
  LEFT JOIN propuestas p ON p.contacto_id = a.contacto_id AND p.comercial_id = a.usuario_id AND p.estado = 'pendiente'
  GROUP BY a.usuario_id${agrupar === "''" ? '' : ', ' + agrupar}`;

type FilaFalta = DatosContacto & { sin_email: boolean; sin_movil: boolean };
const falta = (c: FilaFalta) => { const f = faltanDatos(c); return f.email || f.movil; };

export const avance = async (db: Db): Promise<Avance> => {
  const [k] = await db.query<{
    contactos: number; revisados: number; propuestas_pendientes: number; conflictos: number;
    comerciales: number; sin_entrar: number; n_enc_ventas: number; n_enc_postventa: number; n_sin_email: number; n_sin_movil: number;
  }>(`
    WITH com AS (${COMERCIALES_CON_CONTACTOS})
    SELECT
      (SELECT count(*) FROM contactos) AS contactos,
      (SELECT count(*) FROM contactos WHERE estado <> 'pendiente') AS revisados,
      (SELECT count(*) FROM propuestas WHERE estado = 'pendiente' AND NOT en_conflicto) AS propuestas_pendientes,
      (SELECT count(*) FROM contactos WHERE estado = 'conflicto') AS conflictos,
      (SELECT count(*) FROM com) AS comerciales,
      (SELECT count(*) FROM com WHERE ultima_entrada IS NULL) AS sin_entrar,
      (SELECT count(*) FROM contactos WHERE enc_ventas) AS n_enc_ventas,
      (SELECT count(*) FROM contactos WHERE enc_postventa) AS n_enc_postventa,
      (SELECT count(*) FROM contactos WHERE sin_email) AS n_sin_email,
      (SELECT count(*) FROM contactos WHERE sin_movil) AS n_sin_movil`);

  const estados = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<Estado, number>;
  for (const r of await db.query<{ estado: Estado; n: number }>('SELECT estado, count(*) AS n FROM contactos GROUP BY estado')) {
    estados[r.estado] = r.n;
  }

  // (Los recuentos llevan el prefijo n_: enc_ventas, sin_email… son columnas booleanas y db.ts las convertiría)
  // Contactos distintos con al menos una propuesta aprobada de cada tipo: los que van a la hoja CAMBIOS
  const aprobados: Record<TipoPropuesta, number> = { alta: 0, modificacion: 0, baja: 0 };
  for (const r of await db.query<{ tipo: TipoPropuesta; n: number }>(
    `SELECT tipo, count(DISTINCT contacto_id) AS n FROM propuestas WHERE estado = 'aprobada' GROUP BY tipo`)) {
    aprobados[r.tipo] = r.n;
  }

  // Les falta el email o un móvil sin haber justificado que no lo tienen (el móvil se reconoce por su forma: en JS)
  const sinDatos = await db.query<FilaFalta>(`SELECT c.email, c.tel_contacto, c.telefono, ${COLS_FALTA} FROM contactos c`);

  const unidades = await db.query<Unidad>('SELECT codigo, texto, familia, icono FROM unidades ORDER BY orden');

  const comerciales = await db.query<{ id: number; nombre: string; usuario: string; ultima_entrada: string | null }>(`
    SELECT id, nombre, usuario, ultima_entrada FROM (${COMERCIALES_CON_CONTACTOS}) ORDER BY nombre`);

  // Cifras por comercial y unidad, y el total del comercial (unidad '')
  const cifras = [
    ...await db.query<{ usuario_id: number; unidad: string } & Cifras>(SQL_CIFRAS('a.unidad')),
    ...await db.query<{ usuario_id: number; unidad: string } & Cifras>(SQL_CIFRAS("''")),
  ];
  const porComercial = new Map<number, Record<string, Cifras>>();
  for (const c of cifras) {
    const m = porComercial.get(c.usuario_id) ?? {};
    m[c.unidad] = { t: c.t, r: c.r, p: c.p };
    porComercial.set(c.usuario_id, m);
  }

  return {
    generadoEn: ahoraLocal(),
    kpis: {
      contactos: k.contactos,
      revisados: k.revisados,
      propuestasPendientes: k.propuestas_pendientes,
      conflictos: k.conflictos,
      comercialesSinEntrar: k.sin_entrar,
      comerciales: k.comerciales,
    },
    estados,
    aprobados,
    encuestas: { ventas: k.n_enc_ventas, postventa: k.n_enc_postventa },
    datos: { sinEmail: k.n_sin_email, sinMovil: k.n_sin_movil, falta: sinDatos.filter(falta).length },
    unidades,
    comerciales: comerciales.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      usuario: c.usuario,
      ultimaEntrada: c.ultima_entrada,
      porUnidad: porComercial.get(c.id) ?? {},
    })),
  };
};

export type FiltroComercial = 'todos' | 'revisados' | 'pendientes';

/** Contactos de un comercial, opcionalmente de una sola unidad */
export const listadoComercial = async (
  db: Db, id: number, filtro: FiltroComercial, unidad: string,
): Promise<Listado | null> => {
  const [comercial] = await db.query<{ id: number; nombre: string; usuario: string }>(
    'SELECT id, nombre, usuario FROM usuarios WHERE id = ?1', [id]);
  if (!comercial) return null;
  const condEstado = filtro === 'revisados' ? `AND c.estado <> 'pendiente'`
    : filtro === 'pendientes' ? `AND c.estado = 'pendiente'` : '';
  const filas = await db.query<FilaContacto>(`
    SELECT ${COLS_FILA}, a.unidad, un.texto AS unidad_texto
    FROM asignaciones a
    JOIN contactos c ON c.id = a.contacto_id
    JOIN unidades un ON un.codigo = a.unidad
    LEFT JOIN usuarios v ON v.id = c.validado_por
    WHERE a.usuario_id = ?1 AND (?2 = '' OR a.unidad = ?2) ${condEstado}
    ORDER BY c.cliente, c.apellido, c.nombre`, [id, unidad]);
  return { global: false, filas, comercial, unidad };
};

/** Contactos de toda la campaña por estado, cambio aprobado, encuesta o falta de datos: una fila por contacto */
export const listadoGlobal = async (db: Db, criterio: CriterioGlobal): Promise<Listado> => {
  const [cond, valor] = 'estado' in criterio ? ['c.estado = ?1', criterio.estado]
    : 'aprobado' in criterio
      ? [`EXISTS (SELECT 1 FROM propuestas p WHERE p.contacto_id = c.id AND p.estado = 'aprobada' AND p.tipo = ?1)`, criterio.aprobado]
      : 'encuesta' in criterio ? [criterio.encuesta === 'ventas' ? 'c.enc_ventas AND ?1 = ?1' : 'c.enc_postventa AND ?1 = ?1', '']
        : criterio.datos === 'sin_email' ? ['c.sin_email AND ?1 = ?1', '']
          : criterio.datos === 'sin_movil' ? ['c.sin_movil AND ?1 = ?1', ''] : ['?1 = ?1', ''];
  let filas = await db.query<FilaContacto & FilaFalta>(`
    SELECT ${COLS_FILA}, ${COLS_FALTA}
    FROM contactos c
    LEFT JOIN usuarios v ON v.id = c.validado_por
    WHERE ${cond}
    ORDER BY c.cliente, c.apellido, c.nombre`, [valor]);
  if ('datos' in criterio && criterio.datos === 'falta') filas = filas.filter(falta);

  // Comerciales y unidades de cada contacto, unidos por « · »
  const ids = JSON.stringify(filas.map((f) => f.id));
  const asig = await db.query<{ contacto_id: number; unidad: string; unidad_texto: string; comercial: string }>(`
    SELECT a.contacto_id, a.unidad, un.texto AS unidad_texto, us.nombre AS comercial
    FROM asignaciones a
    JOIN unidades un ON un.codigo = a.unidad
    JOIN usuarios us ON us.id = a.usuario_id
    WHERE a.contacto_id IN (SELECT value FROM json_each(?1))
    ORDER BY us.nombre, un.orden`, [ids]);
  const porContacto = new Map<number, { unidad: Set<string>; texto: Set<string>; com: Set<string> }>();
  for (const a of asig) {
    const m = porContacto.get(a.contacto_id) ?? { unidad: new Set(), texto: new Set(), com: new Set() };
    m.unidad.add(a.unidad); m.texto.add(a.unidad_texto); m.com.add(a.comercial);
    porContacto.set(a.contacto_id, m);
  }
  const unir = (s?: Set<string>) => [...(s ?? [])].join(' · ');
  return {
    global: true,
    filas: filas.map(({ tel_ad1: _1, tel_ad2: _2, tel_ad3: _3, tel_ad4: _4, tel_ad5: _5, sin_email: _6, sin_movil: _7, ...f }) => {
      const m = porContacto.get(f.id);
      return { ...f, unidad: unir(m?.unidad), unidad_texto: unir(m?.texto), comerciales: unir(m?.com) };
    }),
  };
};

export const SQL_PROPUESTA = `
  p.id, p.tipo, p.estado, co.nombre AS comercial, ad.nombre AS admin, rp.nombre AS resuelto_por, p.en_conflicto, p.aplicada,
  p.motivo, p.comentario, p.creado_en, p.resuelto_en, p.diff`;
export const JOIN_PROPUESTA = `
  JOIN usuarios co ON co.id = p.comercial_id
  LEFT JOIN usuarios ad ON ad.id = p.admin_id
  LEFT JOIN usuarios rp ON rp.id = p.resuelto_por`;

export const SQL_ACTIVIDAD = `
  SELECT ac.id, ac.fecha, ac.contacto_id, ac.contacto, u.nombre AS usuario, ad.nombre AS admin, ac.accion, ac.detalle
  FROM actividad ac LEFT JOIN usuarios u ON u.id = ac.usuario_id LEFT JOIN usuarios ad ON ad.id = ac.admin_id`;

export const ficha = async (db: Db, id: number): Promise<Ficha | null> => {
  const [c] = await db.query<Omit<Ficha, 'ven' | 'propuestas' | 'tel_adicionales' | 'actividad'> & Record<`tel_ad${1 | 2 | 3 | 4 | 5}`, string>>(`
    SELECT c.id, c.num_contacto, c.cliente, c.localidad, c.provincia, c.pagador, c.solicitante, c.nombre, c.apellido,
      c.desc_dpto, c.desc_funcion, c.cod_dpto, c.cod_funcion, c.email, c.tel_contacto, c.telefono,
      c.tel_ad1, c.tel_ad2, c.tel_ad3, c.tel_ad4, c.tel_ad5, c.estado, c.es_alta,
      v.nombre AS validado_por, va.nombre AS validado_admin, c.validado_en,
      c.enc_ventas, c.enc_postventa, c.sin_email, c.motivo_sin_email, c.sin_movil, c.motivo_sin_movil
    FROM contactos c
    LEFT JOIN usuarios v ON v.id = c.validado_por
    LEFT JOIN usuarios va ON va.id = c.validado_admin
    WHERE c.id = ?1`, [id]);
  if (!c) return null;
  const ven = await db.query<{ comercial: string; unidad: string; unidad_texto: string }>(`
    SELECT us.nombre AS comercial, a.unidad, un.texto AS unidad_texto
    FROM asignaciones a JOIN usuarios us ON us.id = a.usuario_id JOIN unidades un ON un.codigo = a.unidad
    WHERE a.contacto_id = ?1 ORDER BY us.nombre, un.orden`, [id]);
  const propuestas = await db.query<Propuesta>(`
    SELECT ${SQL_PROPUESTA} FROM propuestas p ${JOIN_PROPUESTA}
    WHERE p.contacto_id = ?1 ORDER BY p.creado_en, p.id`, [id]);
  const actividad = await db.query<Actividad>(`${SQL_ACTIVIDAD} WHERE ac.contacto_id = ?1 ORDER BY ac.id DESC`, [id]);
  const { tel_ad1, tel_ad2, tel_ad3, tel_ad4, tel_ad5, ...resto } = c;
  return {
    ...resto,
    tel_adicionales: [tel_ad1, tel_ad2, tel_ad3, tel_ad4, tel_ad5].filter(Boolean),
    ven,
    propuestas,
    actividad,
  };
};
