// Carga en la base los datos de la base SQLite del programa anterior (por defecto server/sql/contactos.sqlite).
// Esa base se abre solo para leer: no se modifica.
//
//   npm run db:importar-sqlite -- [ruta\contactos.sqlite] [--vaciar]
//
// Se conservan los ids de usuarios y contactos. Las contraseñas no se traen (el programa anterior usaba otro
// formato y nadie había llegado a entrar): después hay que dar contraseñas provisionales (db:clave, db:clave-defecto
// o la pantalla Usuarios). --vaciar borra antes los contactos, asignaciones, propuestas y usuarios existentes.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db.js';
import { migrar } from '../migrar.js';
import { rellenarCatalogo } from '../consultas-comercial.js';

const args = process.argv.slice(2);
const ruta = path.resolve(args.find((a) => !a.startsWith('--'))
  ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../../sql/contactos.sqlite'));
const vaciar = args.includes('--vaciar');

const origen = new DatabaseSync(ruta, { readOnly: true });
const leer = <T>(sql: string) => origen.prepare(sql).all() as T[];

// Solo se sabe convertir una campaña sin empezar: el programa anterior guarda las revisiones de otra forma
const [revisado] = leer<{ contactos: number; propuestas: number; eventos: number }>(`
  SELECT (SELECT count(*) FROM contactos WHERE estado <> 'pendiente' OR es_alta OR rechazado OR validado_por IS NOT NULL) AS contactos,
    (SELECT count(*) FROM propuestas) AS propuestas, (SELECT count(*) FROM eventos) AS eventos`);
if (revisado.contactos || revisado.propuestas || revisado.eventos) {
  console.error(`La base de origen ya tiene revisiones (${revisado.contactos} contactos revisados o dados de alta, `
    + `${revisado.propuestas} propuestas, ${revisado.eventos} eventos) y este importador no sabe convertirlas.`);
  process.exit(1);
}

const usuarios = leer(`
  SELECT id, usuario, nombre, cod_empleado, CASE WHEN es_admin THEN 'admin' ELSE 'comercial' END AS rol,
    activo, ultimo_acceso AS ultima_entrada
  FROM usuarios`);
const contactos = leer(`
  SELECT c.id, nullif(c.num_contacto, '') AS num_contacto, coalesce(cl.nombre, '') AS cliente,
    coalesce(cl.localidad, '') AS localidad, cl.pagador, cl.solicitante,
    coalesce(cl.provincia, '') AS cod_provincia, coalesce(cl.desc_provincia, '') AS provincia,
    coalesce(c.nombre, '') AS nombre, coalesce(c.apellido, '') AS apellido,
    coalesce(c.cod_dpto, '') AS cod_dpto, coalesce(c.desc_dpto, '') AS desc_dpto,
    coalesce(c.cod_funcion, '') AS cod_funcion, coalesce(c.desc_funcion, '') AS desc_funcion,
    coalesce(c.email, '') AS email, coalesce(c.tel_contacto, '') AS tel_contacto, coalesce(c.telefono, '') AS telefono,
    coalesce(c.tel_ad1, '') AS tel_ad1, coalesce(c.tel_ad2, '') AS tel_ad2, coalesce(c.tel_ad3, '') AS tel_ad3,
    coalesce(c.tel_ad4, '') AS tel_ad4, coalesce(c.tel_ad5, '') AS tel_ad5,
    cast(coalesce(nullif(c.n_tel_adicionales, ''), '0') AS INTEGER) AS n_tel_adicionales,
    c.enc_ventas, c.enc_postventa, c.sin_email, c.motivo_sin_email, c.sin_movil, c.motivo_sin_movil
  FROM contactos c JOIN clientes cl ON cl.id = c.cliente_id`);
const asignaciones = leer<{ unidad: string }>('SELECT contacto_id, usuario_id, unidad FROM contacto_comercial');
const cartera = leer<{ unidad: string }>(`
  SELECT a.usuario_id, a.unidad, cl.pagador, cl.solicitante, coalesce(cl.nombre, '') AS cliente, a.num_orden, a.facturacion,
    a.pct_total, a.pct_acum, a.fact_ultimo_ano, coalesce(a.area, '') AS area
  FROM asignaciones a JOIN clientes cl ON cl.id = a.cliente_id`);
const dptos = leer('SELECT cod AS codigo, descripcion AS nombre FROM maestro_dptos');
const funciones = leer('SELECT cod_dpto, cod AS codigo, descripcion AS nombre FROM maestro_funciones');
origen.close();

const db = await getDb();
if (path.resolve(db.descripcion.replace(/^SQLite en /, '')) === ruta) {
  console.error('La base de origen es la misma que usa la aplicación: indica otra en SQLITE_PATH (server/.env).');
  process.exit(1);
}
await migrar(db);

const json = (xs: unknown[]) => [JSON.stringify(xs)];

const resumen = await db.transaction(async (tx) => {
  const [{ n }] = await tx.query<{ n: number }>('SELECT count(*) AS n FROM contactos');
  if (n && !vaciar) throw new Error(`La base ya tiene ${n} contactos. Repite con --vaciar para sustituirlos.`);
  if (vaciar) await tx.exec('DELETE FROM sesiones; DELETE FROM codigos_recuperacion; UPDATE accesos SET usuario_id = NULL, admin_id = NULL; DELETE FROM veredictos; DELETE FROM propuestas; DELETE FROM asignaciones; DELETE FROM cartera; DELETE FROM contactos; DELETE FROM usuarios; DELETE FROM funciones; DELETE FROM departamentos;');

  const unidades = new Set((await tx.query<{ codigo: string }>('SELECT codigo FROM unidades')).map((u) => u.codigo));
  const desconocidas = [...new Set([...asignaciones, ...cartera].map((a) => a.unidad))].filter((u) => !unidades.has(u));
  if (desconocidas.length) throw new Error('Unidades desconocidas en la base de origen: ' + desconocidas.join(', '));

  await tx.query(`
    INSERT INTO usuarios (id, usuario, nombre, cod_empleado, rol, activo, ultima_entrada)
    SELECT value->>'id', value->>'usuario', value->>'nombre', value->>'cod_empleado', value->>'rol', value->>'activo', value->>'ultima_entrada'
    FROM json_each(?1) WHERE true`, json(usuarios));

  await tx.query(`
    INSERT INTO departamentos (codigo, nombre) SELECT value->>'codigo', value->>'nombre' FROM json_each(?1) WHERE true`, json(dptos));
  await tx.query(`
    INSERT INTO funciones (departamento_id, codigo, nombre)
    SELECT d.id, value->>'codigo', value->>'nombre' FROM json_each(?1) JOIN departamentos d ON d.codigo = value->>'cod_dpto'`, json(funciones));

  await tx.query(`
    INSERT INTO contactos (id, num_contacto, cliente, localidad, pagador, solicitante, cod_provincia, provincia, nombre, apellido,
      cod_dpto, desc_dpto, cod_funcion, desc_funcion, email, tel_contacto, telefono, tel_ad1, tel_ad2, tel_ad3, tel_ad4, tel_ad5,
      n_tel_adicionales, enc_ventas, enc_postventa, sin_email, motivo_sin_email, sin_movil, motivo_sin_movil)
    SELECT value->>'id', value->>'num_contacto', value->>'cliente', value->>'localidad', value->>'pagador', value->>'solicitante', value->>'cod_provincia', value->>'provincia', value->>'nombre', value->>'apellido', value->>'cod_dpto', value->>'desc_dpto', value->>'cod_funcion', value->>'desc_funcion', value->>'email', value->>'tel_contacto', value->>'telefono', value->>'tel_ad1', value->>'tel_ad2', value->>'tel_ad3', value->>'tel_ad4', value->>'tel_ad5', value->>'n_tel_adicionales', value->>'enc_ventas', value->>'enc_postventa', value->>'sin_email', value->>'motivo_sin_email', value->>'sin_movil', value->>'motivo_sin_movil'
    FROM json_each(?1) WHERE true`, json(contactos));

  await tx.query(`
    INSERT INTO asignaciones (contacto_id, usuario_id, unidad)
    SELECT value->>'contacto_id', value->>'usuario_id', value->>'unidad' FROM json_each(?1) WHERE true`, json(asignaciones));

  await tx.query(`
    INSERT INTO cartera (usuario_id, unidad, pagador, solicitante, cliente, num_orden, facturacion, pct_total, pct_acum, fact_ultimo_ano, area)
    SELECT value->>'usuario_id', value->>'unidad', value->>'pagador', value->>'solicitante', value->>'cliente', value->>'num_orden', value->>'facturacion', value->>'pct_total', value->>'pct_acum', value->>'fact_ultimo_ano', value->>'area'
    FROM json_each(?1) WHERE true`, json(cartera));

  // Departamentos y funciones que usan los contactos sin estar en el maestro (p. ej. «Sin asignar»)
  await rellenarCatalogo(tx);

  return { usuarios: usuarios.length, contactos: contactos.length, asignaciones: asignaciones.length, cartera: cartera.length };
});

console.log('Importado:', resumen, '·', db.descripcion);
console.log('Ningún usuario tiene contraseña todavía: dásela con «npm run db:clave -- <usuario>» o «npm run db:clave-defecto».');
await db.close();
