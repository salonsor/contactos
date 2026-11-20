// Excel de carga (manual, capítulo 19): hojas CAMBIOS, ESTADO y RESUMEN.
//
//   CAMBIOS  lo que hay que cargar en el sistema: contactos con una acción aprobada y los marcados para alguna encuesta.
//            Las columnas del listado de origen, con la unidad delante y, detrás, las encuestas (SI/NO), la acción
//            (ALTA, MODIFICACIÓN, BAJA o ENCUESTA), quién la propuso, si la hizo un administrador en su nombre, la fecha,
//            quién la aprobó, el motivo de la baja y los motivos de «no tiene email / móvil».
//   ESTADO   todos los contactos, una fila por comercial que lo ve (un alta, una sola vez).
//   RESUMEN  los recuentos.
import ExcelJS from 'exceljs';
import type { DatosContacto, Estado } from '../../shared/tipos.js';
import { ESTADO_TEXTO, faltanDatos } from '../../shared/tipos.js';
import { leerConfig } from './consultas-admin.js';
import type { Db } from './db.js';

/** Columnas del listado de origen de la campaña (contacto, cliente y cartera del comercial) */
const ORIGEN: { k: string; t: string; ancho: number; texto?: boolean; vacio?: boolean }[] = [
  { k: 'pagador', t: 'Pagador', ancho: 11, texto: true },
  { k: 'solicitante', t: 'Solicitante', ancho: 11, texto: true },
  { k: 'cliente', t: 'Cliente', ancho: 34 },
  { k: 'localidad', t: 'Localidad', ancho: 18 },
  { k: 'cod_provincia', t: 'CodProvincia', ancho: 9, texto: true },
  { k: 'provincia', t: 'Provincia', ancho: 14 },
  { k: 'num_contacto', t: 'Nº contacto', ancho: 13, texto: true },
  { k: 'nombre', t: 'NombreCon', ancho: 16 },
  { k: 'apellido', t: 'ApellidoCon', ancho: 20 },
  { k: 'cod_dpto', t: 'Departamento', ancho: 10, texto: true },
  { k: 'desc_dpto', t: 'DescDepartamento', ancho: 20 },
  { k: 'cod_funcion', t: 'Funcion', ancho: 10, texto: true },
  { k: 'desc_funcion', t: 'DescFuncion', ancho: 22 },
  { k: 'email', t: 'Email', ancho: 30, vacio: true },
  { k: 'tel_contacto', t: 'Tel Contacto', ancho: 14, texto: true, vacio: true },
  { k: 'telefono', t: 'Telefono', ancho: 14, texto: true, vacio: true },
  { k: 'tel_ad1', t: 'TelAdicional1', ancho: 14, texto: true, vacio: true },
  { k: 'tel_ad2', t: 'TelAdicional2', ancho: 14, texto: true, vacio: true },
  { k: 'tel_ad3', t: 'TelAdicional3', ancho: 14, texto: true, vacio: true },
  { k: 'tel_ad4', t: 'TelAdicional4', ancho: 14, texto: true, vacio: true },
  { k: 'tel_ad5', t: 'TelAdicional5', ancho: 14, texto: true, vacio: true },
  { k: 'n_tel_adicionales', t: 'NTelAdicionales', ancho: 9 },
  { k: 'cod_empleado', t: 'CodEmpleado', ancho: 11, texto: true },
  { k: 'desc_empleado', t: 'DescEmpleado', ancho: 30 },
  { k: 'area', t: 'Area', ancho: 12 },
  { k: 'num_orden', t: 'NumOrden', ancho: 9 },
  { k: 'facturacion', t: 'Facturacion', ancho: 14 },
  { k: 'pct_total', t: 'PctTotal', ancho: 9 },
  { k: 'pct_acum', t: 'PctAcum', ancho: 9 },
  { k: 'fact_ultimo_ano', t: 'FactUltimoAno', ancho: 14 },
];

type Fila = Record<string, string | number | null>;

const estilarCabecera = (hoja: ExcelJS.Worksheet) => {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FF111111' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCD11' } };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnCount } };
};

/** Las columnas con códigos y teléfonos van como texto, para que conserven los ceros a la izquierda */
const columnasTexto = (hoja: ExcelJS.Worksheet) => {
  for (const c of ORIGEN.filter((x) => x.texto)) {
    const col = hoja.getColumn(c.k);
    if (col) col.numFmt = '@';
  }
};

const unir = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean))].join(' · ');
const siNo = (v: unknown) => (v ? 'SI' : 'NO');

export const nombreExcel = () => {
  const ahora = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `CAMBIOS_CONTACTOS_${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}_${dos(ahora.getHours())}${dos(ahora.getMinutes())}.xlsx`;
};

export const excel = async (db: Db) => {
  const config = await leerConfig(db);
  const vacio = (v: unknown) => (v === null || v === undefined || v === '' ? config.vaciosExportacion : v);

  const contactos = await db.query<Fila & { id: number; estado: Estado; es_alta: number; enc_ventas: number; enc_postventa: number;
    sin_email: number; sin_movil: number }>(`
    SELECT c.*, v.nombre AS validado_por_nombre, va.nombre AS validado_admin_nombre,
      ep.nombre AS enc_por_nombre, ea.nombre AS enc_admin_nombre
    FROM contactos c
    LEFT JOIN usuarios v ON v.id = c.validado_por LEFT JOIN usuarios va ON va.id = c.validado_admin
    LEFT JOIN usuarios ep ON ep.id = c.enc_por LEFT JOIN usuarios ea ON ea.id = c.enc_admin
    ORDER BY c.cliente, c.apellido, c.nombre`);

  const props = await db.query<{ contacto_id: number; tipo: string; estado: string; comercial_id: number; comercial: string; admin: string | null;
    aprobado_por: string | null; creado_en: string; motivo: string }>(`
    SELECT p.contacto_id, p.tipo, p.estado, p.comercial_id, co.nombre AS comercial, ad.nombre AS admin, rp.nombre AS aprobado_por,
      p.creado_en, p.motivo
    FROM propuestas p JOIN usuarios co ON co.id = p.comercial_id LEFT JOIN usuarios ad ON ad.id = p.admin_id
      LEFT JOIN usuarios rp ON rp.id = p.resuelto_por
    WHERE p.estado IN ('aprobada', 'pendiente') ORDER BY p.creado_en`);
  const aprobadas = new Map<number, typeof props>();
  const pendientes = new Map<number, number>();
  for (const p of props) {
    if (p.estado === 'aprobada') aprobadas.set(p.contacto_id, [...(aprobadas.get(p.contacto_id) ?? []), p]);
    else pendientes.set(p.contacto_id, (pendientes.get(p.contacto_id) ?? 0) + 1);
  }

  // Quién ve cada contacto, con los datos de su cartera para ese cliente y unidad
  const asig = await db.query<Fila & { contacto_id: number; usuario_id: number }>(`
    SELECT a.contacto_id, a.usuario_id, un.texto AS unidad, u.nombre AS desc_empleado, u.usuario, u.cod_empleado,
      ca.area, ca.num_orden, ca.facturacion, ca.pct_total, ca.pct_acum, ca.fact_ultimo_ano
    FROM asignaciones a
    JOIN unidades un ON un.codigo = a.unidad
    JOIN usuarios u ON u.id = a.usuario_id
    JOIN contactos c ON c.id = a.contacto_id
    LEFT JOIN cartera ca ON ca.usuario_id = a.usuario_id AND ca.unidad = a.unidad AND ca.solicitante = c.solicitante AND ca.pagador = c.pagador
    ORDER BY u.nombre, un.orden`);
  const asigPor = new Map<number, typeof asig>();
  for (const a of asig) asigPor.set(a.contacto_id, [...(asigPor.get(a.contacto_id) ?? []), a]);

  // Datos del contacto y, de la cartera del comercial, los del comercial y el cliente
  const origen = (c: Fila, a?: Fila): Fila => {
    const m: Fila = { ...(a ?? {}), ...c };
    return Object.fromEntries(ORIGEN.map((o) => [o.k, (o.vacio ? vacio(m[o.k]) : m[o.k] ?? '') as string | number | null]));
  };
  const justificacion = (c: Fila) => ({
    sin_email: c.sin_email ? `NO TIENE: ${c.motivo_sin_email}` : '',
    sin_movil: c.sin_movil ? `NO TIENE: ${c.motivo_sin_movil}` : '',
  });

  // ── CAMBIOS ──
  const ORDEN_ACCION: Record<string, number> = { ALTA: 0, 'MODIFICACIÓN': 1, BAJA: 2, ENCUESTA: 3 };
  const cambios: Fila[] = [];
  for (const c of contactos) {
    const ps = aprobadas.get(c.id) ?? [];
    const baja = ps.some((p) => p.tipo === 'baja');
    const alta = ps.some((p) => p.tipo === 'alta');
    // Un alta que no se ha aprobado no se carga; una alta que después se dio de baja, sencillamente, no se exporta
    if (c.es_alta && (!alta || baja)) continue;
    const accion = baja ? 'BAJA' : c.es_alta ? 'ALTA' : ps.some((p) => p.tipo === 'modificacion') ? 'MODIFICACIÓN'
      : c.enc_ventas || c.enc_postventa ? 'ENCUESTA' : null;
    if (!accion) continue;
    const usadas = accion === 'ENCUESTA' ? [] : ps;
    const a = asigPor.get(c.id) ?? [];
    const quien = usadas.length ? usadas.map((p) => p.comercial_id) : [];
    const mia = a.find((x) => quien.includes(x.usuario_id)) ?? a[0];
    cambios.push({
      unidad: unir(a.filter((x) => !quien.length || quien.includes(x.usuario_id)).map((x) => String(x.unidad))) || unir(a.map((x) => String(x.unidad))),
      ...origen(c, mia),
      enc_ventas: siNo(c.enc_ventas), enc_postventa: siNo(c.enc_postventa),
      accion,
      propuesto_por: accion === 'ENCUESTA' ? String(c.enc_por_nombre ?? '') : unir(usadas.map((p) => p.comercial)),
      hecho_admin: accion === 'ENCUESTA' ? String(c.enc_admin_nombre ?? '') : unir(usadas.map((p) => p.admin)),
      fecha: accion === 'ENCUESTA' ? String(c.enc_en ?? '') : (usadas[usadas.length - 1]?.creado_en ?? ''),
      aprobado_por: unir(usadas.map((p) => p.aprobado_por)),
      motivo_baja: unir(usadas.filter((p) => p.tipo === 'baja').map((p) => p.motivo)),
      ...justificacion(c),
    });
  }
  cambios.sort((x, y) => ORDEN_ACCION[String(x.accion)] - ORDEN_ACCION[String(y.accion)] || String(x.cliente).localeCompare(String(y.cliente)));

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Depuración de contactos';

  const COLS_FINALES = [
    { header: 'Encuesta ventas', key: 'enc_ventas', width: 10 }, { header: 'Encuesta postventa', key: 'enc_postventa', width: 10 },
  ];
  const h1 = libro.addWorksheet('CAMBIOS');
  h1.columns = [
    { header: 'Unidad', key: 'unidad', width: 22 },
    ...ORIGEN.map((o) => ({ header: o.t, key: o.k, width: o.ancho })),
    ...COLS_FINALES,
    { header: 'Acción', key: 'accion', width: 14 }, { header: 'Propuesto por', key: 'propuesto_por', width: 28 },
    { header: 'Hecho por admin.', key: 'hecho_admin', width: 18 }, { header: 'Fecha', key: 'fecha', width: 18 },
    { header: 'Aprobado por', key: 'aprobado_por', width: 22 }, { header: 'Motivo baja', key: 'motivo_baja', width: 30 },
    { header: 'Sin email (motivo)', key: 'sin_email', width: 26 }, { header: 'Sin móvil (motivo)', key: 'sin_movil', width: 26 },
  ];
  columnasTexto(h1);
  for (const f of cambios) h1.addRow(f);
  estilarCabecera(h1);

  // ── ESTADO ──
  const h2 = libro.addWorksheet('ESTADO');
  h2.columns = [
    { header: 'Unidad', key: 'unidad', width: 22 }, { header: 'Usuario', key: 'usuario', width: 12 },
    ...ORIGEN.map((o) => ({ header: o.t, key: o.k, width: o.ancho })),
    ...COLS_FINALES,
    { header: 'Estado', key: 'estado', width: 13 }, { header: 'Validado por', key: 'validado_por', width: 28 },
    { header: 'Validado el', key: 'validado_en', width: 18 }, { header: 'Hecho por admin.', key: 'hecho_admin', width: 18 },
    { header: 'Acción aprobada', key: 'accion', width: 16 }, { header: 'Propuestas pendientes', key: 'pendientes', width: 12 },
    { header: 'Sin email (motivo)', key: 'sin_email', width: 26 }, { header: 'Sin móvil (motivo)', key: 'sin_movil', width: 26 },
  ];
  columnasTexto(h2);
  let filasEstado = 0;
  for (const c of contactos) {
    const ps = aprobadas.get(c.id) ?? [];
    const accion = ps.some((p) => p.tipo === 'baja') ? 'BAJA' : c.es_alta && ps.some((p) => p.tipo === 'alta') ? 'ALTA'
      : ps.some((p) => p.tipo === 'modificacion') ? 'MODIFICACIÓN' : '';
    const todas = asigPor.get(c.id) ?? [];
    // Un contacto nuevo sale una sola vez: en la fila de quien lo dio de alta
    const filas = c.es_alta ? [todas.find((x) => x.usuario_id === c.validado_por) ?? todas[0]].filter(Boolean) : todas;
    for (const a of filas.length ? filas : [undefined]) {
      h2.addRow({
        unidad: a?.unidad ?? '', usuario: a?.usuario ?? '',
        ...origen(c, a),
        enc_ventas: siNo(c.enc_ventas), enc_postventa: siNo(c.enc_postventa),
        estado: ESTADO_TEXTO[c.estado] ?? c.estado,
        validado_por: c.validado_por_nombre ?? '', validado_en: c.validado_en ?? '', hecho_admin: c.validado_admin_nombre ?? '',
        accion, pendientes: pendientes.get(c.id) ?? 0,
        ...justificacion(c),
      });
      filasEstado++;
    }
  }
  estilarCabecera(h2);

  // ── RESUMEN ──
  const h3 = libro.addWorksheet('RESUMEN');
  h3.columns = [{ header: 'Concepto', key: 'k', width: 46 }, { header: 'Valor', key: 'v', width: 12 }];
  const seccion = (t: string) => { const r = h3.addRow({ k: t }); r.font = { bold: true }; };
  seccion('Filas de la hoja CAMBIOS por acción');
  for (const a of ['ALTA', 'MODIFICACIÓN', 'BAJA', 'ENCUESTA']) h3.addRow({ k: a, v: cambios.filter((f) => f.accion === a).length });
  h3.addRow({ k: 'Total CAMBIOS', v: cambios.length });
  h3.addRow({ k: 'Filas de la hoja ESTADO', v: filasEstado });
  h3.addRow({});
  seccion('Contactos por estado');
  for (const e of Object.keys(ESTADO_TEXTO) as Estado[]) h3.addRow({ k: ESTADO_TEXTO[e], v: contactos.filter((c) => c.estado === e).length });
  h3.addRow({ k: 'Total contactos', v: contactos.length });
  h3.addRow({});
  seccion('Propuestas pendientes');
  const [pp] = await db.query<{ total: number; conflicto: number }>(`SELECT count(*) AS total, coalesce(sum(en_conflicto), 0) AS conflicto
    FROM propuestas WHERE estado = 'pendiente'`);
  h3.addRow({ k: 'Por decidir (sin las de conflictos)', v: pp.total - pp.conflicto });
  h3.addRow({ k: 'En conflicto', v: pp.conflicto });
  h3.addRow({});
  seccion('Email y móvil');
  h3.addRow({ k: 'Sin email (justificado)', v: contactos.filter((c) => c.sin_email).length });
  h3.addRow({ k: 'Sin móvil (justificado)', v: contactos.filter((c) => c.sin_movil).length });
  h3.addRow({
    k: 'Les falta el email o el móvil, sin justificar',
    v: contactos.filter((c) => {
      const f = faltanDatos({ ...(c as unknown as DatosContacto), sin_email: !!c.sin_email, sin_movil: !!c.sin_movil });
      return f.email || f.movil;
    }).length,
  });
  estilarCabecera(h3);

  const buffer = Buffer.from(await libro.xlsx.writeBuffer());
  // Se genera en el momento y se descarga en el equipo del usuario: no se guarda ninguna copia en el servidor, porque los datos
  // cambian de un día para otro y una copia antigua solo llevaría a confusión
  return { buffer, nombre: nombreExcel() };
};
