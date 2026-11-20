import type { Catalogo, ClienteDetalle, ClienteResumen, ContactoComercial, MisClientes, Propuesta, Unidad } from '../../shared/tipos.js';
import type { Db } from './db.js';

// Un cliente se identifica por nombre, solicitante y unidad de negocio (si se lleva por dos unidades, son dos líneas);
// la clave va en la URL
export const claveCliente = (cliente: string, solicitante: string, unidad: string) =>
  Buffer.from(JSON.stringify([cliente, solicitante, unidad])).toString('base64url');

export const leerClave = (clave: string) => {
  try {
    const [cliente, solicitante, unidad] = JSON.parse(Buffer.from(clave, 'base64url').toString('utf8'));
    if (typeof cliente === 'string' && typeof solicitante === 'string' && typeof unidad === 'string') return { cliente, solicitante, unidad };
  } catch { /* clave mal formada */ }
  return null;
};

// Clientes del comercial: sus contactos agrupados por cliente y unidad, con la facturación del listado de la campaña
// (cartera). De mayor a menor facturación; los que no están en el listado, al final.
const SQL_CLIENTES = `
  SELECT g.*, ca.facturacion
  FROM (
    SELECT c.cliente, c.solicitante, a.unidad, min(c.localidad) AS localidad, min(c.provincia) AS provincia, min(c.pagador) AS pagador,
      count(DISTINCT c.id) AS total,
      count(DISTINCT CASE WHEN c.estado <> 'pendiente' THEN c.id END) AS revisados,
      count(DISTINCT p.id) AS pendientes
    FROM asignaciones a
    JOIN contactos c ON c.id = a.contacto_id
    LEFT JOIN propuestas p ON p.contacto_id = c.id AND p.comercial_id = ?1 AND p.estado = 'pendiente'
    WHERE a.usuario_id = ?1 %FILTRO%
    GROUP BY c.cliente, c.solicitante, a.unidad
  ) g
  LEFT JOIN (SELECT solicitante, unidad, max(facturacion) AS facturacion FROM cartera WHERE usuario_id = ?1 GROUP BY solicitante, unidad) ca
    ON ca.solicitante = g.solicitante AND ca.unidad = g.unidad
  ORDER BY ca.facturacion IS NULL, ca.facturacion DESC, g.cliente, g.unidad`;

type FilaCliente = Omit<ClienteResumen, 'clave'>;
const conClave = (f: FilaCliente): ClienteResumen => ({ ...f, clave: claveCliente(f.cliente, f.solicitante, f.unidad) });

export const misClientes = async (db: Db, usuarioId: number): Promise<MisClientes> => {
  const unidades = await db.query<Unidad>(`
    SELECT codigo, texto, familia, icono FROM unidades u
    WHERE EXISTS (SELECT 1 FROM asignaciones a WHERE a.usuario_id = ?1 AND a.unidad = u.codigo)
    ORDER BY orden`, [usuarioId]);
  const filas = await db.query<FilaCliente>(SQL_CLIENTES.replace('%FILTRO%', ''), [usuarioId]);
  return { unidades, clientes: filas.map(conClave) };
};

export const clienteDetalle = async (db: Db, usuarioId: number, clave: string): Promise<ClienteDetalle | null> => {
  const k = leerClave(clave);
  if (!k) return null;
  const [cli] = await db.query<FilaCliente>(
    SQL_CLIENTES.replace('%FILTRO%', 'AND c.cliente = ?2 AND c.solicitante = ?3 AND a.unidad = ?4'), [usuarioId, k.cliente, k.solicitante, k.unidad]);
  if (!cli) return null;

  const contactos = await db.query<Omit<ContactoComercial, 'mi_propuesta'>>(`
    SELECT c.id, c.num_contacto, c.nombre, c.apellido, c.desc_dpto, c.desc_funcion, c.email, c.tel_contacto, c.telefono,
      c.tel_ad1, c.tel_ad2, c.tel_ad3, c.tel_ad4, c.tel_ad5, c.estado, c.es_alta,
      v.nombre AS validado_por, c.validado_por = ?1 AS validado_por_mi, va.nombre AS validado_admin, c.validado_en,
      c.enc_ventas, c.enc_postventa, c.sin_email, c.motivo_sin_email, c.sin_movil, c.motivo_sin_movil,
      CASE WHEN EXISTS (SELECT 1 FROM propuestas p WHERE p.contacto_id = c.id AND p.tipo = 'baja' AND p.estado = 'aprobada')
        THEN 'Baja aprobada por el administrador: ya no se puede cambiar' END AS bloqueado
    FROM asignaciones a
    JOIN contactos c ON c.id = a.contacto_id
    LEFT JOIN usuarios v ON v.id = c.validado_por
    LEFT JOIN usuarios va ON va.id = c.validado_admin
    WHERE a.usuario_id = ?1 AND a.unidad = ?4 AND c.cliente = ?2 AND c.solicitante = ?3
    ORDER BY c.estado <> 'pendiente', c.apellido, c.nombre, c.id`, [usuarioId, k.cliente, k.solicitante, k.unidad]);
  const ids = JSON.stringify(contactos.map((c) => c.id));

  // Mi última propuesta de cada contacto; si la deshice, ya no hay nada que enseñar
  const mias = await db.query<Propuesta & { contacto_id: number }>(`
    SELECT contacto_id, id, tipo, estado, comercial, admin, resuelto_por, en_conflicto, aplicada, motivo, comentario, creado_en, resuelto_en, diff
    FROM (
      SELECT p.contacto_id, p.id, p.tipo, p.estado, co.nombre AS comercial, ad.nombre AS admin, rp.nombre AS resuelto_por, p.en_conflicto,
        p.aplicada, p.motivo, p.comentario, p.creado_en, p.resuelto_en, p.diff,
        row_number() OVER (PARTITION BY p.contacto_id ORDER BY p.id DESC) AS n
      FROM propuestas p JOIN usuarios co ON co.id = p.comercial_id LEFT JOIN usuarios ad ON ad.id = p.admin_id
        LEFT JOIN usuarios rp ON rp.id = p.resuelto_por
      WHERE p.comercial_id = ?1 AND p.contacto_id IN (SELECT value FROM json_each(?2))
    ) WHERE n = 1 AND estado <> 'anulada'`, [usuarioId, ids]);
  const miaPor = new Map(mias.map(({ contacto_id, ...p }) => [contacto_id, p]));

  // «Este cliente también lo lleva…»: los demás comerciales del cliente, en cualquier unidad
  const companeros = await db.query<{ nombre: string }>(`
    SELECT DISTINCT u.nombre FROM asignaciones a JOIN contactos c ON c.id = a.contacto_id JOIN usuarios u ON u.id = a.usuario_id
    WHERE c.cliente = ?1 AND c.solicitante = ?2 AND a.usuario_id <> ?3 ORDER BY u.nombre`, [k.cliente, k.solicitante, usuarioId]);

  // Centralita habitual del cliente (la más repetida), para rellenar el alta
  const [centralita] = await db.query<{ telefono: string }>(`
    SELECT telefono FROM contactos WHERE cliente = ?1 AND solicitante = ?2 AND telefono <> ''
    GROUP BY telefono ORDER BY count(*) DESC LIMIT 1`, [k.cliente, k.solicitante]);

  const [unidad] = await db.query<Unidad>('SELECT codigo, texto, familia, icono FROM unidades WHERE codigo = ?1', [k.unidad]);

  return {
    cliente: conClave(cli),
    unidad,
    companeros: companeros.map((c) => c.nombre),
    centralita: centralita?.telefono ?? '',
    contactos: contactos.map((c) => ({ ...c, mi_propuesta: miaPor.get(c.id) ?? null })),
  };
};

/**
 * Tabla oficial de departamentos y funciones. Si se cargó el maestro (con códigos), solo lo que está en él; si no, el
 * catálogo que se formó con los contactos.
 */
export const catalogo = async (db: Pick<Db, 'query'>): Promise<Catalogo> => {
  const filas = await db.query<{ nombre: string; codigo: string | null; funciones: { nombre: string; codigo: string | null }[] }>(`
    WITH oficial AS (SELECT EXISTS (SELECT 1 FROM departamentos WHERE codigo IS NOT NULL) AS hay)
    SELECT d.nombre, d.codigo,
      (SELECT json_group_array(json_object('nombre', nombre, 'codigo', codigo)) FROM (
         SELECT f.nombre, f.codigo FROM funciones f, oficial o
         WHERE f.departamento_id = d.id AND (NOT o.hay OR f.codigo IS NOT NULL) ORDER BY f.nombre)) AS funciones
    FROM departamentos d, oficial o
    WHERE NOT o.hay OR d.codigo IS NOT NULL
    ORDER BY d.nombre`);
  return { departamentos: filas };
};

/** Completa el catálogo con los departamentos y funciones que aparecen en los contactos */
export const rellenarCatalogo = async (db: Pick<Db, 'query'>) => {
  await db.query(`INSERT INTO departamentos (nombre)
    SELECT DISTINCT desc_dpto FROM contactos WHERE desc_dpto <> '' ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO funciones (departamento_id, nombre)
    SELECT DISTINCT d.id, c.desc_funcion FROM contactos c JOIN departamentos d ON d.nombre = c.desc_dpto
    WHERE c.desc_funcion <> '' ON CONFLICT DO NOTHING`);
};
