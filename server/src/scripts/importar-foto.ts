// Carga en la base los datos de una «foto» HTML del panel de Avance (AVANCE_CONTACTOS_AAAAMMDD_HHMM.html).
// La foto lleva embebidos todos los contactos, comerciales y propuestas en window.DATOS_OFFLINE.
//
//   npm run db:importar -- "C:\ruta\AVANCE_CONTACTOS_20260930_1440.html" [--vaciar]
//
// --vaciar borra antes los contactos, asignaciones, propuestas y usuarios existentes.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { getDb } from '../db.js';
import { migrar } from '../migrar.js';

interface FilaFoto {
  id: number; usuario_id: number; cliente: string; localidad: string; pagador: string; solicitante: string;
  unidad: string; num_contacto: string | null; nombre: string; apellido: string; desc_funcion: string;
  desc_dpto: string; email: string; tel_contacto: string; telefono: string;
  tel_ad1: string; tel_ad2: string; tel_ad3: string; tel_ad4: string; tel_ad5: string;
  estado: string; es_alta: number; creado_en: string | null; validado_en: string | null;
  validado_por: string | null; validado_admin: string | null;
}
interface PropuestaFoto {
  tipo: string; comercial: string; admin: string; creado_en: string; estado: string; en_conflicto: number;
  motivo: string; comentario: string; resuelto_en: string | null; diff: [string, string, string][];
}
interface Foto {
  contactos: Record<string, FilaFoto[]>;
  usuarios: Record<string, { nombre: string; usuario: string }>;
  propuestas?: Record<string, PropuestaFoto[]>;
}

const args = process.argv.slice(2);
const ruta = args.find((a) => !a.startsWith('--'));
const vaciar = args.includes('--vaciar');
if (!ruta) {
  console.error('Uso: npm run db:importar -- <foto.html> [--vaciar]');
  process.exit(1);
}

const html = await readFile(ruta, 'utf8');
const m = html.match(/window\.DATOS_OFFLINE\s*=\s*(\{.*\});?\s*<\/script>/);
if (!m) {
  console.error('No encuentro window.DATOS_OFFLINE en el fichero: ¿es una foto del panel de Avance?');
  process.exit(1);
}
const foto = JSON.parse(m[1]) as Foto;

const db = await getDb();
await migrar(db);

const resumen = await db.transaction(async (tx) => {
  const [{ n }] = await tx.query<{ n: number }>('SELECT count(*) AS n FROM contactos');
  if (n && !vaciar) throw new Error(`La base ya tiene ${n} contactos. Repite con --vaciar para sustituirlos.`);
  if (vaciar) await tx.exec('DELETE FROM sesiones; DELETE FROM codigos_recuperacion; UPDATE accesos SET usuario_id = NULL, admin_id = NULL; DELETE FROM veredictos; DELETE FROM propuestas; DELETE FROM asignaciones; DELETE FROM cartera; DELETE FROM contactos; DELETE FROM usuarios; DELETE FROM funciones; DELETE FROM departamentos;');

  // Unidades: todas las de la foto tienen que existir
  const unidades = new Set((await tx.query<{ codigo: string }>('SELECT codigo FROM unidades')).map((u) => u.codigo));
  const filas = Object.values(foto.contactos).flat();
  const desconocidas = [...new Set(filas.map((f) => f.unidad))].filter((u) => !unidades.has(u));
  if (desconocidas.length) throw new Error('Unidades desconocidas en la foto: ' + desconocidas.join(', '));

  // Usuarios: los comerciales de la foto con su id; el administrador se crea si alguna propuesta o validación lo cita
  const usuarios = Object.entries(foto.usuarios).map(([id, u]) => ({ id: Number(id), usuario: u.usuario, nombre: u.nombre, rol: 'comercial' }));
  const idPorNombre = new Map(usuarios.map((u) => [u.nombre, u.id]));
  const propuestas = Object.entries(foto.propuestas ?? {}).flatMap(([cid, ps]) => ps.map((p) => ({ ...p, contacto_id: Number(cid) })));
  const citados = new Set<string>([
    ...filas.flatMap((f) => [f.validado_por, f.validado_admin]),
    ...propuestas.flatMap((p) => [p.comercial, p.admin]),
  ].filter((x): x is string => !!x));
  let siguiente = Math.max(0, ...usuarios.map((u) => u.id)) + 1;
  for (const nombre of citados) {
    if (idPorNombre.has(nombre)) continue;
    const usuario = nombre === 'Administrador' ? 'admin' : nombre.toLowerCase().replace(/[^a-z0-9]+/g, '.');
    usuarios.push({ id: siguiente, usuario, nombre, rol: 'admin' });
    idPorNombre.set(nombre, siguiente++);
  }
  const id = (nombre: string | null) => (nombre ? idPorNombre.get(nombre) ?? null : null);

  await tx.query(`
    INSERT INTO usuarios (id, usuario, nombre, rol)
    SELECT value->>'id', value->>'usuario', value->>'nombre', value->>'rol' FROM json_each(?1) WHERE true`,
  [JSON.stringify(usuarios)]);

  // Contactos: una vez cada uno (la foto repite el contacto por cada comercial que lo ve)
  const contactos = new Map<number, FilaFoto>();
  for (const f of filas) if (!contactos.has(f.id)) contactos.set(f.id, f);
  await tx.query(`
    INSERT INTO contactos (id, num_contacto, cliente, localidad, pagador, solicitante, nombre, apellido, desc_dpto,
      desc_funcion, email, tel_contacto, telefono, tel_ad1, tel_ad2, tel_ad3, tel_ad4, tel_ad5, estado, es_alta,
      creado_en, validado_en, validado_por, validado_admin)
    SELECT value->>'id', value->>'num_contacto', value->>'cliente', value->>'localidad', value->>'pagador', value->>'solicitante', value->>'nombre', value->>'apellido', value->>'desc_dpto', value->>'desc_funcion', value->>'email', value->>'tel_contacto', value->>'telefono', value->>'tel_ad1', value->>'tel_ad2', value->>'tel_ad3', value->>'tel_ad4', value->>'tel_ad5', value->>'estado', value->>'es_alta', value->>'creado_en', value->>'validado_en', value->>'validado_por', value->>'validado_admin' FROM json_each(?1) WHERE true`,
  [JSON.stringify([...contactos.values()].map((f) => ({
    id: f.id, num_contacto: f.num_contacto, cliente: f.cliente, localidad: f.localidad ?? '', pagador: f.pagador ?? '',
    solicitante: f.solicitante ?? '', nombre: f.nombre ?? '', apellido: f.apellido ?? '', desc_dpto: f.desc_dpto ?? '',
    desc_funcion: f.desc_funcion ?? '', email: f.email ?? '', tel_contacto: f.tel_contacto ?? '', telefono: f.telefono ?? '',
    tel_ad1: f.tel_ad1 ?? '', tel_ad2: f.tel_ad2 ?? '', tel_ad3: f.tel_ad3 ?? '', tel_ad4: f.tel_ad4 ?? '', tel_ad5: f.tel_ad5 ?? '',
    estado: f.estado, es_alta: !!f.es_alta, creado_en: f.creado_en, validado_en: f.validado_en,
    validado_por: id(f.validado_por), validado_admin: id(f.validado_admin),
  })))]);

  await tx.query(`
    INSERT INTO asignaciones (contacto_id, usuario_id, unidad)
    SELECT value->>'contacto_id', value->>'usuario_id', value->>'unidad' FROM json_each(?1) WHERE true
    ON CONFLICT DO NOTHING`,
  [JSON.stringify(filas.map((f) => ({ contacto_id: f.id, usuario_id: f.usuario_id, unidad: f.unidad })))]);

  await tx.query(`
    INSERT INTO propuestas (contacto_id, comercial_id, admin_id, tipo, estado, en_conflicto, motivo, comentario,
      creado_en, resuelto_en, diff)
    SELECT value->>'contacto_id', value->>'comercial_id', value->>'admin_id', value->>'tipo', value->>'estado', value->>'en_conflicto', value->>'motivo', value->>'comentario', value->>'creado_en', value->>'resuelto_en', value->'diff' FROM json_each(?1) WHERE true`,
  [JSON.stringify(propuestas.map((p) => ({
    contacto_id: p.contacto_id, comercial_id: id(p.comercial), admin_id: id(p.admin), tipo: p.tipo, estado: p.estado,
    en_conflicto: !!p.en_conflicto, motivo: p.motivo ?? '', comentario: p.comentario ?? '', creado_en: p.creado_en,
    resuelto_en: p.resuelto_en, diff: p.diff ?? [],
  })))]);

  // Los OK cuentan como veredicto de quien los validó (para detectar desacuerdos con otros comerciales)
  await tx.query(`INSERT INTO veredictos (contacto_id, usuario_id, veredicto, admin_id, creado_en)
    SELECT id, validado_por, CASE WHEN es_alta THEN 'alta' ELSE 'ok' END, validado_admin, coalesce(validado_en, datetime('now', 'localtime'))
    FROM contactos WHERE estado = 'ok' AND validado_por IS NOT NULL ON CONFLICT DO NOTHING`);


  return { usuarios: usuarios.length, contactos: contactos.size, asignaciones: filas.length, propuestas: propuestas.length };
});

console.log('Importado:', resumen, '·', db.descripcion);
await db.close();
