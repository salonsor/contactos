// Carga de la campaña desde un Excel de contactos: una fila por contacto, comercial y unidad.
//
// Se reconoce la cabecera aunque las columnas vengan en otro orden o con nombres parecidos
// («Población» por «Localidad», «Correo» por «Email»…). La carga sustituye la campaña (contactos,
// asignaciones, revisiones y propuestas) y conserva los usuarios con sus contraseñas.
import ExcelJS from 'exceljs';
import type { Db } from './db.js';
import { asignarCodigos, ErrorFlujo } from './flujo.js';
import { rellenarCatalogo } from './consultas-comercial.js';
import { hashClave } from './auth.js';

type Columna =
  | 'usuario' | 'comercial' | 'unidad' | 'cliente' | 'localidad' | 'pagador' | 'solicitante' | 'num_contacto'
  | 'nombre' | 'apellido' | 'desc_dpto' | 'desc_funcion' | 'email' | 'tel_contacto' | 'telefono'
  | 'tel_ad1' | 'tel_ad2' | 'tel_ad3' | 'tel_ad4' | 'tel_ad5' | 'facturacion';

/** Columnas de la plantilla, en orden, con los otros nombres con que se aceptan */
// `debil`: nombres que se usan solo si no hay otra columna para el mismo dato (en el Excel de origen, «Departamento»
// y «Función» son códigos y «DescDepartamento» / «DescFuncion» las descripciones)
export const COLUMNAS: { k: Columna; t: string; obligatoria?: boolean; alias: string[]; debil?: string[]; ejemplo: string }[] = [
  { k: 'usuario', t: 'Usuario comercial', obligatoria: true, alias: ['usuario', 'login', 'user', 'usuario vendedor', 'cod comercial', 'codigo comercial', 'empleado', 'cod empleado', 'codigo empleado'], ejemplo: 'JPEREZ' },
  { k: 'comercial', t: 'Nombre comercial', alias: ['comercial', 'vendedor', 'nombre vendedor', 'nombre del comercial', 'descempleado', 'desc empleado', 'nombre empleado'], ejemplo: 'PEREZ GARCIA, JUAN' },
  { k: 'unidad', t: 'Unidad', obligatoria: true, alias: ['unidad de negocio', 'unidad negocio', 'linea', 'linea de negocio'], ejemplo: 'Postventa · Máquinas' },
  { k: 'cliente', t: 'Cliente', obligatoria: true, alias: ['razon social', 'nombre cliente', 'empresa'], ejemplo: 'EJEMPLO S.L.' },
  { k: 'localidad', t: 'Localidad', alias: ['poblacion', 'ciudad', 'municipio'], ejemplo: 'MADRID' },
  { k: 'pagador', t: 'Pagador', alias: ['cod pagador', 'codigo pagador', 'n pagador'], ejemplo: '3000001' },
  { k: 'solicitante', t: 'Solicitante', alias: ['cod solicitante', 'codigo solicitante', 'n solicitante', 'cod cliente', 'codigo cliente'], ejemplo: '1000001' },
  { k: 'num_contacto', t: 'Nº contacto', alias: ['num contacto', 'numero contacto', 'n contacto', 'no contacto', 'id contacto', 'contacto id', 'codigo contacto'], ejemplo: '12000001' },
  { k: 'nombre', t: 'Nombre', alias: ['nombre contacto', 'nombrecontacto', 'nombrecon', 'nombre con'], ejemplo: 'ANA' },
  { k: 'apellido', t: 'Apellido', alias: ['apellidos', 'apellido contacto', 'apellidocontacto', 'apellidocon', 'apellido con', 'apellidoscontacto'], ejemplo: 'LOPEZ' },
  { k: 'desc_dpto', t: 'Departamento', alias: ['dpto', 'desc dpto', 'departamento contacto', 'descdepartamento', 'desc departamento', 'descdpto'], debil: ['departamento'], ejemplo: 'Compras' },
  { k: 'desc_funcion', t: 'Función', alias: ['cargo', 'puesto', 'desc funcion', 'descfuncion'], debil: ['funcion'], ejemplo: 'JEFE DE COMPRAS' },
  { k: 'email', t: 'Email', alias: ['correo', 'correo electronico', 'e mail', 'mail'], ejemplo: 'ana.lopez@ejemplo.es' },
  { k: 'tel_contacto', t: 'Móvil/directo', alias: ['movil', 'movil directo', 'telefono movil', 'tel contacto', 'telefono directo', 'directo'], ejemplo: '600000000' },
  { k: 'telefono', t: 'Centralita', alias: ['telefono', 'telefono centralita', 'tel centralita', 'telefono cliente'], ejemplo: '910000000' },
  { k: 'tel_ad1', t: 'Tel. adicional 1', alias: ['telefono adicional 1', 'tel ad1', 'tel adicional1'], ejemplo: '' },
  { k: 'tel_ad2', t: 'Tel. adicional 2', alias: ['telefono adicional 2', 'tel ad2', 'tel adicional2'], ejemplo: '' },
  { k: 'tel_ad3', t: 'Tel. adicional 3', alias: ['telefono adicional 3', 'tel ad3', 'tel adicional3'], ejemplo: '' },
  { k: 'tel_ad4', t: 'Tel. adicional 4', alias: ['telefono adicional 4', 'tel ad4', 'tel adicional4'], ejemplo: '' },
  { k: 'tel_ad5', t: 'Tel. adicional 5', alias: ['telefono adicional 5', 'tel ad5', 'tel adicional5'], ejemplo: '' },
  // Facturación del cliente para ese comercial y unidad: ordena «Mis clientes» de mayor a menor
  { k: 'facturacion', t: 'Facturación', alias: ['facturacion cliente', 'importe facturacion', 'fact ultimo ano', 'fact'], ejemplo: '4820000' },
];

/** «4.820.000,50 €» o 4820000.5 → 4820000.5 (null si no es un número) */
const leerImporte = (t: string) => {
  const limpio = t.replace(/[€\s]/g, '');
  const n = Number(/,\d{1,2}$/.test(limpio) || limpio.split('.').length > 2 ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(',', '.'));
  return Number.isFinite(n) && limpio !== '' ? n : null;
};

const normalizar = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[º°ª.·_/\\-]+/g, ' ').replace(/\s+/g, ' ').trim();

const COLUMNA_POR_NOMBRE = new Map<string, { k: Columna; debil: boolean }>();
for (const c of COLUMNAS) for (const n of [c.t, c.k, ...c.alias]) COLUMNA_POR_NOMBRE.set(normalizar(n), { k: c.k, debil: false });
for (const c of COLUMNAS) for (const n of c.debil ?? []) COLUMNA_POR_NOMBRE.set(normalizar(n), { k: c.k, debil: true });

/** Texto de una celda de exceljs (fórmulas, enlaces, texto enriquecido, números, fechas) */
const textoCelda = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'string' || typeof v === 'boolean') return String(v).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v && typeof v.text === 'string') return v.text.trim();       // enlace (mailto…)
    if ('result' in v) return textoCelda(v.result as ExcelJS.CellValue);       // fórmula
  }
  return String(v).trim();
};

type Fila = Record<Columna, string> & { fila: number };

export interface Lectura {
  hoja: string;
  filaCabecera: number;
  reconocidas: { columna: string; campo: string }[];
  ignoradas: string[];
  filas: Fila[];
  errores: { fila: number; motivo: string }[];
}

/** Lee la primera hoja con una cabecera reconocible y comprueba cada fila */
const leer = async (db: Db, fichero: Buffer): Promise<Lectura> => {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(fichero as unknown as ArrayBuffer);
  } catch {
    throw new ErrorFlujo('No se ha podido abrir el fichero: tiene que ser un Excel .xlsx');
  }

  // Busca la cabecera en las 10 primeras filas de cada hoja: la que reconozca más columnas
  let mejor: { hoja: ExcelJS.Worksheet; fila: number; mapa: Map<number, Columna>; ignoradas: string[] } | null = null;
  for (const hoja of libro.worksheets) {
    for (let r = 1; r <= Math.min(10, hoja.rowCount); r++) {
      // Cada dato se toma de la primera columna que lo nombra; una columna «débil» cede ante otra que no lo sea
      const elegida = new Map<Columna, { col: number; debil: boolean; t: string }>();
      const ignoradas: string[] = [];
      hoja.getRow(r).eachCell((celda, col) => {
        const t = textoCelda(celda.value);
        if (!t) return;
        const c = COLUMNA_POR_NOMBRE.get(normalizar(t));
        const previa = c && elegida.get(c.k);
        if (c && (!previa || (previa.debil && !c.debil))) {
          if (previa) ignoradas.push(previa.t);
          elegida.set(c.k, { col, debil: c.debil, t });
        } else ignoradas.push(t);
      });
      const mapa = new Map<number, Columna>([...elegida].map(([k, v]) => [v.col, k]));
      if (mapa.size >= 3 && (!mejor || mapa.size > mejor.mapa.size)) mejor = { hoja, fila: r, mapa, ignoradas };
    }
  }
  if (!mejor) throw new ErrorFlujo('No encuentro la fila de cabecera: descarga la plantilla y usa sus nombres de columna');
  const presentes = new Set(mejor.mapa.values());
  const faltan = COLUMNAS.filter((c) => c.obligatoria && !presentes.has(c.k)).map((c) => c.t);
  if (!presentes.has('nombre') && !presentes.has('apellido')) faltan.push('Nombre o Apellido');
  if (faltan.length) throw new ErrorFlujo(`Faltan columnas obligatorias: ${faltan.join(', ')}`);

  // Unidades: por código o por texto
  const unidades = await db.query<{ codigo: string; texto: string }>('SELECT codigo, texto FROM unidades');
  const unidadPor = new Map<string, string>();
  for (const u of unidades) { unidadPor.set(normalizar(u.codigo), u.codigo); unidadPor.set(normalizar(u.texto), u.codigo); }

  const filas: Fila[] = [];
  const errores: Lectura['errores'] = [];
  const { hoja, fila: filaCab, mapa } = mejor;
  for (let r = filaCab + 1; r <= hoja.rowCount; r++) {
    const fila = { fila: r } as Fila;
    for (const c of COLUMNAS) fila[c.k] = '';
    let vacia = true;
    hoja.getRow(r).eachCell((celda, col) => {
      const k = mapa.get(col);
      if (!k) return;
      const t = textoCelda(celda.value);
      if (t) { fila[k] = t; vacia = false; }
    });
    if (vacia) continue;
    const motivos: string[] = [];
    if (!fila.usuario) motivos.push('falta el usuario del comercial');
    if (!fila.cliente) motivos.push('falta el cliente');
    // Un contacto sin nombre se acepta si algo lo identifica: precisamente es de los que hay que completar
    if (!fila.nombre && !fila.apellido && !fila.email && !fila.num_contacto && !fila.tel_contacto && !fila.telefono) {
      motivos.push('el contacto no tiene nombre, apellido, email, teléfono ni Nº de contacto');
    }
    const unidad = unidadPor.get(normalizar(fila.unidad));
    if (!fila.unidad) motivos.push('falta la unidad');
    else if (!unidad) motivos.push(`unidad desconocida «${fila.unidad}»`);
    else fila.unidad = unidad;
    if (fila.usuario && !/^[A-Za-z0-9._-]{1,30}$/.test(fila.usuario)) motivos.push(`usuario no válido «${fila.usuario}»`);
    if (motivos.length) errores.push({ fila: r, motivo: motivos.join('; ') });
    else filas.push({ ...fila, usuario: fila.usuario.toUpperCase() });
  }
  // Si el código del comercial no es un usuario que ya exista pero su nombre sí, se usa ese usuario
  // (así conserva su contraseña aunque el Excel traiga, por ejemplo, el nº de empleado)
  const existentes = await db.query<{ usuario: string; nombre: string }>('SELECT upper(usuario) AS usuario, nombre FROM usuarios');
  const hayUsuario = new Set(existentes.map((u) => u.usuario));
  const usuarioPorNombre = new Map(existentes.map((u) => [normalizar(u.nombre), u.usuario]));
  for (const f of filas) {
    const porNombre = f.comercial ? usuarioPorNombre.get(normalizar(f.comercial)) : undefined;
    if (!hayUsuario.has(f.usuario) && porNombre) f.usuario = porNombre;
  }

  if (!filas.length) throw new ErrorFlujo(errores.length ? `Ninguna fila es válida. Primera: fila ${errores[0].fila}, ${errores[0].motivo}` : 'El Excel no tiene filas de datos');

  return {
    hoja: hoja.name,
    filaCabecera: filaCab,
    reconocidas: [...mapa.entries()].map(([col, k]) => ({
      columna: textoCelda(hoja.getRow(filaCab).getCell(col).value),
      campo: COLUMNAS.find((c) => c.k === k)!.t,
    })),
    ignoradas: mejor.ignoradas,
    filas,
    errores,
  };
};

// Un contacto se identifica por su Nº de contacto; sin él, por cliente + solicitante + nombre + apellido + email
const claveContacto = (f: Fila) => (f.num_contacto
  ? 'n:' + f.num_contacto
  : 'd:' + [f.cliente, f.solicitante, f.nombre, f.apellido, f.email].map(normalizar).join('|'));

export interface Resumen {
  hoja: string;
  filaCabecera: number;
  reconocidas: Lectura['reconocidas'];
  ignoradas: string[];
  filas: number;
  errores: Lectura['errores'];
  contactos: number;
  asignaciones: number;
  clientes: number;
  comerciales: number;
  comercialesNuevos: string[];
  porUnidad: { unidad: string; contactos: number }[];
  /** Lo que hay ahora en la base y se perderá al sustituir la campaña */
  actual: { contactos: number; revisados: number; propuestas: number };
  /** Los comerciales nuevos entran con la contraseña provisional común */
  conClaveDefecto: boolean;
}

const resumir = async (db: Db, l: Lectura): Promise<Resumen> => {
  const contactos = new Set(l.filas.map(claveContacto));
  const asignaciones = new Set(l.filas.map((f) => `${claveContacto(f)}|${f.usuario}|${f.unidad}`));
  const usuarios = [...new Set(l.filas.map((f) => f.usuario))];
  const existentes = new Set((await db.query<{ u: string }>('SELECT upper(usuario) AS u FROM usuarios')).map((x) => x.u));
  const unidades = await db.query<{ codigo: string; texto: string }>('SELECT codigo, texto FROM unidades ORDER BY orden');
  const [actual] = await db.query<Resumen['actual']>(`SELECT
    (SELECT count(*) FROM contactos) AS contactos,
    (SELECT count(*) FROM contactos WHERE estado <> 'pendiente') AS revisados,
    (SELECT count(*) FROM propuestas) AS propuestas`);
  return {
    hoja: l.hoja,
    filaCabecera: l.filaCabecera,
    reconocidas: l.reconocidas,
    ignoradas: l.ignoradas,
    filas: l.filas.length + l.errores.length,
    errores: l.errores,
    contactos: contactos.size,
    asignaciones: asignaciones.size,
    clientes: new Set(l.filas.map((f) => normalizar(f.cliente) + '|' + f.solicitante)).size,
    comerciales: usuarios.length,
    comercialesNuevos: usuarios.filter((u) => !existentes.has(u)),
    porUnidad: unidades.map((u) => ({
      unidad: u.texto,
      contactos: new Set(l.filas.filter((f) => f.unidad === u.codigo).map(claveContacto)).size,
    })).filter((u) => u.contactos),
    actual,
    conClaveDefecto: !!process.env.CLAVE_POR_DEFECTO,
  };
};

export const previsualizar = async (db: Db, fichero: Buffer) => resumir(db, await leer(db, fichero));

/** Sustituye la campaña por la del Excel; conserva usuarios y contraseñas y crea los comerciales nuevos */
export const importar = async (db: Db, fichero: Buffer) => {
  const l = await leer(db, fichero);
  const resumen = await resumir(db, l);
  await db.transaction(async (tx) => {
    await tx.exec('DELETE FROM veredictos; DELETE FROM propuestas; DELETE FROM asignaciones; DELETE FROM contactos; DELETE FROM cartera;');

    // Comerciales: los nuevos se crean sin contraseña; a los que ya existen se les actualiza el nombre
    const nombres = new Map<string, string>();
    for (const f of l.filas) if (!nombres.has(f.usuario) || (!nombres.get(f.usuario) && f.comercial)) nombres.set(f.usuario, f.comercial);
    await tx.query(`
      INSERT INTO usuarios (usuario, nombre, rol)
      SELECT value->>'usuario', value->>'nombre', 'comercial' FROM json_each(?1) WHERE true
      ON CONFLICT (usuario) DO UPDATE SET nombre = CASE WHEN excluded.nombre <> excluded.usuario THEN excluded.nombre ELSE usuarios.nombre END`,
    [JSON.stringify([...nombres].map(([usuario, nombre]) => ({ usuario, nombre: nombre || usuario })))]);
    // Con contraseña provisional común configurada, los que aún no tienen contraseña reciben esa
    if (process.env.CLAVE_POR_DEFECTO) {
      for (const u of await tx.query<{ id: number }>('SELECT id FROM usuarios WHERE clave_hash IS NULL')) {
        await tx.query('UPDATE usuarios SET clave_hash = ?2, clave_inicial = 1 WHERE id = ?1', [u.id, await hashClave(process.env.CLAVE_POR_DEFECTO)]);
      }
    }
    const idPor = new Map((await tx.query<{ id: number; u: string }>('SELECT id, upper(usuario) AS u FROM usuarios')).map((x) => [x.u, x.id]));

    // Contactos: una vez cada uno (la primera fila manda); después, quién lo ve y en qué unidad
    const contactos = new Map<string, Fila>();
    for (const f of l.filas) if (!contactos.has(claveContacto(f))) contactos.set(claveContacto(f), f);
    const ids = new Map<string, number>();
    let id = 0;
    for (const k of contactos.keys()) ids.set(k, ++id);
    await tx.query(`
      INSERT INTO contactos (id, num_contacto, cliente, localidad, pagador, solicitante, nombre, apellido, desc_dpto, desc_funcion,
        email, tel_contacto, telefono, tel_ad1, tel_ad2, tel_ad3, tel_ad4, tel_ad5)
      SELECT value->>'id', nullif(value->>'num_contacto', ''), value->>'cliente', value->>'localidad', value->>'pagador',
        value->>'solicitante', value->>'nombre', value->>'apellido', value->>'desc_dpto', value->>'desc_funcion', value->>'email',
        value->>'tel_contacto', value->>'telefono', value->>'tel_ad1', value->>'tel_ad2', value->>'tel_ad3', value->>'tel_ad4',
        value->>'tel_ad5'
      FROM json_each(?1) WHERE true`,
    [JSON.stringify([...contactos].map(([k, f]) => ({ ...f, id: ids.get(k) })))]);
    await tx.query(`
      INSERT INTO asignaciones (contacto_id, usuario_id, unidad)
      SELECT value->>'c', value->>'u', value->>'unidad' FROM json_each(?1) WHERE true
      ON CONFLICT DO NOTHING`,
    [JSON.stringify(l.filas.map((f) => ({ c: ids.get(claveContacto(f)), u: idPor.get(f.usuario), unidad: f.unidad })))]);
    // Cartera: cada cliente de cada comercial y unidad, con su facturación (la mayor que traiga el Excel)
    const cartera = new Map<string, { u: number | undefined; unidad: string; pagador: string; solicitante: string; cliente: string; facturacion: number | null }>();
    for (const f of l.filas) {
      const k = `${f.usuario}|${f.unidad}|${f.pagador}|${f.solicitante}`;
      const importe = leerImporte(f.facturacion);
      const previa = cartera.get(k);
      const facturacion = previa?.facturacion == null ? importe : importe === null ? previa.facturacion : Math.max(previa.facturacion, importe);
      cartera.set(k, { u: idPor.get(f.usuario), unidad: f.unidad, pagador: f.pagador, solicitante: f.solicitante, cliente: f.cliente, facturacion });
    }
    await tx.query(`
      INSERT INTO cartera (usuario_id, unidad, pagador, solicitante, cliente, facturacion)
      SELECT value->>'u', value->>'unidad', value->>'pagador', value->>'solicitante', value->>'cliente', value->>'facturacion' FROM json_each(?1) WHERE true
      ON CONFLICT DO NOTHING`, [JSON.stringify([...cartera.values()])]);
    await rellenarCatalogo(tx);
    await asignarCodigos(tx);
  });
  return resumen;
};

/** Plantilla vacía: cabecera, una fila de ejemplo y la lista de unidades válidas */
export const plantilla = async (db: Db) => {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet('Contactos');
  h.columns = COLUMNAS.map((c) => ({ header: c.t, key: c.k, width: Math.max(14, c.t.length + 4) }));
  h.addRow(Object.fromEntries(COLUMNAS.map((c) => [c.k, c.ejemplo])));
  const cab = h.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2147' } };
  h.views = [{ state: 'frozen', ySplit: 1 }];
  COLUMNAS.forEach((c, i) => { if (c.obligatoria) h.getRow(1).getCell(i + 1).note = 'Obligatoria'; });

  const u = libro.addWorksheet('Unidades');
  u.columns = [{ header: 'Unidad (texto o código)', key: 'texto', width: 28 }, { header: 'Código', key: 'codigo', width: 32 }];
  for (const x of await db.query<{ codigo: string; texto: string }>('SELECT codigo, texto FROM unidades ORDER BY orden')) u.addRow(x);
  u.getRow(1).font = { bold: true };

  const n = libro.addWorksheet('Instrucciones');
  n.getColumn(1).width = 110;
  for (const linea of [
    'Una fila por contacto, comercial y unidad: si dos comerciales ven el mismo contacto, el contacto va en dos filas.',
    'Obligatorias: Usuario comercial, Unidad y Cliente; y, de cada contacto, algo que lo identifique (nombre, apellido, email, teléfono o Nº contacto).',
    'Unidad: el texto o el código de la hoja Unidades.',
    'El mismo contacto se reconoce por su Nº contacto; si no lo tiene, por cliente, solicitante, nombre, apellido y email.',
    'Las columnas pueden ir en otro orden y con nombres parecidos (Población, Correo, Móvil…).',
    'Facturación (opcional): la del cliente para ese comercial y unidad. Ordena la lista «Mis clientes» de mayor a menor.',
    'Al cargar se sustituye la campaña entera (contactos, revisiones y propuestas); los usuarios y sus contraseñas se conservan.',
  ]) n.addRow([linea]);
  return Buffer.from(await libro.xlsx.writeBuffer());
};
