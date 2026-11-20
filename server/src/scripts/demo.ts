// Datos inventados para probar la aplicación sin una foto real: npm run db:demo
// Sustituye lo que haya en la base.
import 'dotenv/config';
import { hashClave } from '../auth.js';
import { getDb } from '../db.js';
import { migrar } from '../migrar.js';

// Generador pseudoaleatorio con semilla: los mismos datos en cada ejecución
let semilla = 20260930;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const uno = <T>(xs: T[]) => xs[Math.floor(azar() * xs.length)];

const NOMBRES = ['ANA', 'LUIS', 'MARTA', 'JAVIER', 'LUCIA', 'PABLO', 'ELENA', 'SERGIO', 'NURIA', 'DAVID', 'CARMEN', 'RAUL'];
const APELLIDOS = ['GARCIA', 'LOPEZ', 'MARTIN', 'RUIZ', 'SANZ', 'MORENO', 'GIL', 'NAVARRO', 'ROMERO', 'TORRES', 'VEGA', 'CANO'];
const CIUDADES = ['MADRID', 'SEVILLA', 'VALENCIA', 'BILBAO', 'ZARAGOZA', 'VIGO', 'MURCIA', 'GIJON'];
const DPTOS: [string, string[]][] = [
  ['Compras', ['JEFE DE COMPRAS', 'COMPRADOR']],
  ['Departamento Tecnico', ['JEFE DE TALLER', 'TECNICO']],
  ['Dirección', ['DIRECTOR', 'GERENTE']],
  ['Gestión', ['ADMINISTRATIVO', 'JEFE ADMINISTRATIVO']],
];
const UNIDADES = ['POSTVENTA_MAQUINAS', 'POSTVENTA_MAQUINAS', 'POSTVENTA_MOTORES_TERRESTRES', 'VENTAS_MAQUINAS',
  'POSTVENTA_MOTORES_MARINOS', 'VENTA_MOTORES_TERRESTRES', 'VENTA_MOTORES_MARINOS'];

const db = await getDb();
await migrar(db);

await db.transaction(async (tx) => {
  await tx.exec('DELETE FROM sesiones; DELETE FROM codigos_recuperacion; UPDATE accesos SET usuario_id = NULL, admin_id = NULL; DELETE FROM veredictos; DELETE FROM propuestas; DELETE FROM asignaciones; DELETE FROM cartera; DELETE FROM contactos; DELETE FROM usuarios; DELETE FROM funciones; DELETE FROM departamentos;');

  const comerciales = Array.from({ length: 14 }, (_, i) => {
    const nombre = uno(NOMBRES), ap1 = uno(APELLIDOS), ap2 = uno(APELLIDOS);
    return {
      usuario: (nombre[0] + ap1 + (i + 1)).toUpperCase(),
      nombre: `${ap1} ${ap2}, ${nombre}`,
      rol: 'comercial',
      ultima_entrada: i < 5 ? `2026-09-${String(20 + i).padStart(2, '0')} ${String(i + 8).padStart(2, '0')}:15:00` : null,
    };
  });
  comerciales.push({ usuario: 'admin', nombre: 'Administrador', rol: 'admin', ultima_entrada: '2026-09-30 14:00:00' });
  await tx.query(`INSERT INTO usuarios (usuario, nombre, rol, ultima_entrada)
    SELECT value->>'usuario', value->>'nombre', value->>'rol', value->>'ultima_entrada' FROM json_each(?1) WHERE true`,
  [JSON.stringify(comerciales)]);
  const admin = comerciales.length;

  const contactos = Array.from({ length: 700 }, (_, i) => {
    const [dpto, funciones] = uno(DPTOS);
    const nombre = uno(NOMBRES), apellido = uno(APELLIDOS);
    const r = azar();
    const estado = r < 0.62 ? 'pendiente' : r < 0.85 ? 'ok' : r < 0.95 ? 'modificado' : r < 0.98 ? 'baja' : 'conflicto';
    return {
      num_contacto: String(12000000 + i * 7), cliente: `CLIENTE DEMO ${1 + (i % 160)} S.L.`, localidad: uno(CIUDADES),
      pagador: String(3000000 + (i % 160)), solicitante: String(1000000 + (i % 160)), nombre, apellido,
      desc_dpto: dpto, desc_funcion: uno(funciones),
      email: azar() < 0.8 ? `${nombre}.${apellido}${i}@ejemplo.es`.toLowerCase() : '',
      tel_contacto: azar() < 0.6 ? '6' + String(10000000 + i * 131).slice(0, 8) : '',
      telefono: '9' + String(10000000 + (i % 160) * 977).slice(0, 8),
      estado,
      validado_por: estado === 'pendiente' ? null : 1 + Math.floor(azar() * 5),
      validado_en: estado === 'pendiente' ? null : `2026-09-${String(21 + Math.floor(azar() * 9)).padStart(2, '0')} 1${Math.floor(azar() * 9)}:30:00`,
    };
  });
  await tx.query(`INSERT INTO contactos (num_contacto, cliente, localidad, pagador, solicitante, nombre, apellido, desc_dpto,
      desc_funcion, email, tel_contacto, telefono, estado, validado_por, validado_en)
    SELECT value->>'num_contacto', value->>'cliente', value->>'localidad', value->>'pagador', value->>'solicitante', value->>'nombre', value->>'apellido', value->>'desc_dpto', value->>'desc_funcion', value->>'email', value->>'tel_contacto', value->>'telefono', value->>'estado', value->>'validado_por', value->>'validado_en' FROM json_each(?1) WHERE true`,
  [JSON.stringify(contactos)]);

  // Cada cliente tiene un comercial principal; uno de cada seis contactos lo ve también un segundo comercial
  const asignaciones: { contacto_id: number; usuario_id: number; unidad: string }[] = [];
  contactos.forEach((_, i) => {
    const principal = 1 + ((i % 160) % 14);
    asignaciones.push({ contacto_id: i + 1, usuario_id: principal, unidad: UNIDADES[principal % UNIDADES.length] });
    if (i % 6 === 0) asignaciones.push({ contacto_id: i + 1, usuario_id: 1 + (principal % 14), unidad: uno(UNIDADES) });
  });
  await tx.query(`INSERT INTO asignaciones SELECT value->>'contacto_id', value->>'usuario_id', value->>'unidad' FROM json_each(?1) WHERE true
    ON CONFLICT DO NOTHING`, [JSON.stringify(asignaciones)]);

  // Propuestas para los contactos modificados, de baja o en conflicto
  const propuestas = contactos.flatMap((c, i) => {
    const base = { contacto_id: i + 1, comercial_id: c.validado_por, creado_en: c.validado_en, motivo: '', comentario: '' };
    if (c.estado === 'modificado') {
      const aprobada = azar() < 0.6;
      return [{ ...base, tipo: 'modificacion', estado: aprobada ? 'aprobada' : 'pendiente', admin_id: aprobada ? admin : null,
        en_conflicto: false, resuelto_en: aprobada ? '2026-09-30 12:00:00' : null,
        diff: [['Función', 'TECNICO', c.desc_funcion], ['Móvil/directo de la persona', '', c.tel_contacto || '600000000']] }];
    }
    if (c.estado === 'baja') {
      return [{ ...base, tipo: 'baja', estado: 'pendiente', admin_id: null, en_conflicto: false, resuelto_en: null,
        motivo: 'Ya no trabaja en la empresa', diff: [] }];
    }
    if (c.estado === 'conflicto') {
      return [
        { ...base, tipo: 'baja', estado: 'pendiente', admin_id: null, en_conflicto: true, resuelto_en: null, motivo: 'Jubilado', diff: [] },
        { ...base, comercial_id: 1 + ((c.validado_por ?? 1) % 14), tipo: 'modificacion', estado: 'pendiente', admin_id: null,
          en_conflicto: true, resuelto_en: null, diff: [['Email', c.email, 'nuevo@ejemplo.es']] },
      ];
    }
    return [];
  });
  // Las propuestas se aplican al momento salvo las que están en conflicto (las correcciones a lo que validó otro)
  await tx.query(`INSERT INTO propuestas (contacto_id, comercial_id, admin_id, tipo, estado, en_conflicto, aplicada, motivo, comentario,
      creado_en, resuelto_en, resuelto_por, diff)
    SELECT value->>'contacto_id', value->>'comercial_id', value->>'admin_id', value->>'tipo', value->>'estado', value->>'en_conflicto',
      NOT value->>'en_conflicto', value->>'motivo', value->>'comentario', value->>'creado_en', value->>'resuelto_en',
      CASE WHEN value->>'resuelto_en' IS NOT NULL THEN ?2 END, value->'diff' FROM json_each(?1) WHERE true`,
  [JSON.stringify(propuestas.map((p) => ({ ...p, admin_id: null }))), admin]);

  // Encuestas, justificaciones de «no tiene» y fecha límite, para que se vean todas las pantallas del manual
  await tx.query(`UPDATE contactos SET enc_ventas = (id % 9 = 0), enc_postventa = (id % 7 = 0),
    enc_por = CASE WHEN id % 9 = 0 OR id % 7 = 0 THEN coalesce(validado_por, 1) END,
    enc_en = CASE WHEN id % 9 = 0 OR id % 7 = 0 THEN '2026-09-29 10:00:00' END`);
  await tx.query(`UPDATE contactos SET sin_email = 1, motivo_sin_email = 'No lo facilita', sin_datos_por = validado_por, sin_datos_en = validado_en
    WHERE email = '' AND estado = 'ok' AND id % 2 = 0`);
  await tx.query(`INSERT INTO config (clave, valor) VALUES ('fecha_limite', '31/10/2026')
    ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`);

  // Los OK cuentan como veredicto de quien los validó; las propuestas, como veredicto de quien las hizo
  await tx.query(`INSERT INTO veredictos (contacto_id, usuario_id, veredicto, creado_en)
    SELECT id, validado_por, 'ok', validado_en FROM contactos WHERE estado = 'ok' AND validado_por IS NOT NULL
    ON CONFLICT DO NOTHING`);
  await tx.query(`INSERT INTO veredictos (contacto_id, usuario_id, veredicto, creado_en)
    SELECT contacto_id, comercial_id, tipo, creado_en FROM (
      SELECT *, row_number() OVER (PARTITION BY contacto_id, comercial_id ORDER BY creado_en DESC) AS n FROM propuestas
    ) WHERE n = 1
    ON CONFLICT DO NOTHING`);

  // Usuarios de prueba con contraseña conocida (solo para la demo): admin/admin1234 y el primer comercial/demo1234
  await tx.query(`UPDATE usuarios SET clave_hash = ?1, clave_inicial = false WHERE usuario = 'admin'`, [await hashClave('admin1234')]);
  await tx.query(`UPDATE usuarios SET clave_hash = ?1, clave_inicial = false WHERE id = 1`, [await hashClave('demo1234')]);
});

console.log('Datos de demostración cargados ·', db.descripcion);
const [primero] = await db.query<{ usuario: string }>('SELECT usuario FROM usuarios WHERE id = 1');
console.log(`Entra con admin / admin1234, o como comercial con ${primero.usuario} / demo1234`);
await db.close();
