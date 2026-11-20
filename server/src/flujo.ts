// Reglas de la campaña: qué pasa cuando un comercial revisa un contacto y cuando el administrador decide.
//
// Cada comercial da su veredicto: OK (vale al momento, sin aprobación), modificación, baja o alta. Estas tres últimas
// son propuestas que el administrador aprueba o rechaza, pero se aplican ya de forma provisional: el cambio se ve
// desde el primer momento y, si se deshace o se rechaza, el contacto vuelve a como estaba.
//
// Un contacto compartido se revisa una sola vez: el primero que lo valida lo cierra. Si después otro comercial lo
// corrige o pide su baja, su propuesta no pisa lo validado: queda «sin aplicar» y el contacto pasa a «En conflicto»
// hasta que el administrador decide.
import type { CampoContacto, DatosContacto, Duplicado, Extras } from '../../shared/tipos.js';
import { CAMPOS, emailValido, TELEFONOS, telefonoValido, tieneMovil } from '../../shared/tipos.js';
import type { Contexto } from './auth.js';
import type { Db } from './db.js';

export type Tx = Pick<Db, 'query' | 'exec'>;

export class ErrorFlujo extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const CAMPO_POR_ETIQUETA = new Map(CAMPOS.map((c) => [c.t, c.k]));

const quien = (ctx: Contexto) => ({
  usuario: ctx.efectivo.id,
  // Si un administrador actúa en nombre del comercial, queda constancia
  admin: ctx.efectivo.id !== ctx.real.id ? ctx.real.id : null,
});

type Veredicto = 'ok' | 'alta' | 'modificacion' | 'baja';

/** Cómo estaba el contacto (y lo que había dicho el comercial) antes de una propuesta */
interface Previo {
  validado_por?: number | null;
  validado_admin?: number | null;
  validado_en?: string | null;
  veredicto?: Veredicto | null;
  veredicto_admin?: number | null;
  veredicto_en?: string | null;
}

interface FilaPropuesta {
  id: number; contacto_id: number; comercial_id: number; admin_id: number | null;
  tipo: 'alta' | 'modificacion' | 'baja'; estado: string; en_conflicto: boolean; aplicada: boolean;
  diff: [string, string, string][]; previo: Previo; creado_en: string;
}

type Contacto = DatosContacto & {
  id: number; cliente: string; solicitante: string; estado: string; es_alta: boolean;
  validado_por: number | null; validado_admin: number | null; validado_en: string | null;
  sin_email: boolean; sin_movil: boolean; motivo_sin_email: string; motivo_sin_movil: string;
  enc_ventas: boolean; enc_postventa: boolean;
};

// ── Registro de actividad ──

export const registrarActividad = async (tx: Pick<Db, 'query'>, a: {
  contactoId: number | null; usuarioId: number; adminId?: number | null; accion: string; detalle?: string;
}) => {
  await tx.query(`
    INSERT INTO actividad (contacto_id, contacto, usuario_id, admin_id, accion, detalle)
    VALUES (?1, coalesce((SELECT trim(nombre || ' ' || apellido) FROM contactos WHERE id = ?1), ''), ?2, ?3, ?4, ?5)`,
  [a.contactoId, a.usuarioId, a.adminId ?? null, a.accion, a.detalle ?? '']);
};

// ── Estado del contacto ──

/** El estado del contacto se deduce de sus propuestas y veredictos */
export const recalcularEstado = async (tx: Tx, contactoId: number) => {
  const [r] = await tx.query<{ estado: string }>(`
    SELECT CASE
      WHEN max(p.estado = 'pendiente' AND p.en_conflicto) THEN 'conflicto'
      WHEN max(p.tipo = 'baja' AND (p.estado = 'aprobada' OR (p.estado = 'pendiente' AND p.aplicada))) THEN 'baja'
      WHEN max(p.tipo = 'modificacion' AND (p.estado = 'aprobada' OR (p.estado = 'pendiente' AND p.aplicada))) THEN 'modificado'
      WHEN max(p.tipo = 'alta' AND p.estado IN ('pendiente', 'aprobada')) THEN 'ok'
      WHEN EXISTS (SELECT 1 FROM veredictos v WHERE v.contacto_id = ?1 AND v.veredicto = 'ok') THEN 'ok'
      ELSE 'pendiente' END AS estado
    FROM (SELECT 1) uno LEFT JOIN propuestas p ON p.contacto_id = ?1`, [contactoId]);
  await tx.query('UPDATE contactos SET estado = ?2 WHERE id = ?1', [contactoId, r.estado]);
  // Si ya no queda nada que lo sostenga, deja de constar como validado
  if (r.estado === 'pendiente') {
    await tx.query('UPDATE contactos SET validado_por = NULL, validado_admin = NULL, validado_en = NULL WHERE id = ?1', [contactoId]);
  }
  return r.estado;
};

// ── Comprobaciones ──

/** El comercial efectivo tiene que ver el contacto, y el contacto no puede estar ya dado de baja */
const comprobarAcceso = async (tx: Tx, ctx: Contexto, contactoId: number) => {
  const [c] = await tx.query<Contacto & { baja_aprobada: boolean }>(`
    SELECT c.*,
      EXISTS (SELECT 1 FROM propuestas p WHERE p.contacto_id = c.id AND p.tipo = 'baja' AND p.estado = 'aprobada') AS baja_aprobada
    FROM contactos c
    WHERE c.id = ?1 AND EXISTS (SELECT 1 FROM asignaciones a WHERE a.contacto_id = c.id AND a.usuario_id = ?2)`,
  [contactoId, ctx.efectivo.id]);
  if (!c) throw new ErrorFlujo('Ese contacto no es tuyo', 404);
  if (c.baja_aprobada) throw new ErrorFlujo('Ese contacto ya está dado de baja');
  return c;
};

/** Lo validó otro comercial: lo que proponga este no lo pisa, queda en conflicto */
const validadoPorOtro = (c: Contacto, usuario: number) => c.estado !== 'pendiente' && c.validado_por !== null && c.validado_por !== usuario;

/** Nombre y apellido en mayúsculas, email en minúsculas, todo sin espacios sobrantes */
const limpiar = (datos: Partial<DatosContacto>): DatosContacto => {
  const d = Object.fromEntries(CAMPOS.map(({ k }) => [k, String(datos[k] ?? '').trim().replace(/\s+/g, ' ')])) as DatosContacto;
  d.nombre = d.nombre.toUpperCase();
  d.apellido = d.apellido.toUpperCase();
  d.email = d.email.toLowerCase();
  return d;
};

/** Departamento y función tienen que estar en la tabla oficial (la del maestro, si se cargó; si no, el catálogo) */
const comprobarCatalogo = async (tx: Tx, d: DatosContacto) => {
  const [r] = await tx.query<{ hay: number; dpto: number; funcion: number }>(`
    WITH oficial AS (SELECT EXISTS (SELECT 1 FROM departamentos WHERE codigo IS NOT NULL) AS hay)
    SELECT (SELECT count(*) FROM departamentos) AS hay,
      EXISTS (SELECT 1 FROM departamentos d, oficial o WHERE d.nombre = ?1 AND (NOT o.hay OR d.codigo IS NOT NULL)) AS dpto,
      EXISTS (SELECT 1 FROM funciones f JOIN departamentos d ON d.id = f.departamento_id, oficial o
              WHERE d.nombre = ?1 AND f.nombre = ?2 AND (NOT o.hay OR f.codigo IS NOT NULL)) AS funcion`,
  [d.desc_dpto, d.desc_funcion]);
  if (!r.hay) return;   // sin catálogo cargado no hay con qué comparar
  if (!r.dpto) throw new ErrorFlujo(`El departamento «${d.desc_dpto}» no está en la tabla oficial: elige uno de la lista`);
  if (!r.funcion) throw new ErrorFlujo(`La función «${d.desc_funcion}» no está en la tabla oficial para ese departamento: elige una de la lista`);
};

/**
 * Comprueba los datos completos de un contacto. El formato de los teléfonos solo se mira en los que cambian, para no
 * tropezar con datos antiguos que nadie ha tocado; lo obligatorio, siempre.
 */
const validar = async (tx: Tx, d: DatosContacto, j: { sinEmail: boolean; sinMovil: boolean }, cambiados: CampoContacto[]) => {
  if (!d.nombre) throw new ErrorFlujo('El nombre es obligatorio');
  if (!d.apellido) throw new ErrorFlujo('El apellido es obligatorio');
  if (!d.desc_dpto) throw new ErrorFlujo('Elige el departamento');
  if (!d.desc_funcion) throw new ErrorFlujo('Elige la función');
  if (cambiados.includes('desc_dpto') || cambiados.includes('desc_funcion')) await comprobarCatalogo(tx, d);
  else await comprobarCatalogo(tx, d).catch((e) => { throw new ErrorFlujo(`${e.message}. Viene así de origen y ya no es válido.`); });
  if (d.email && !emailValido(d.email)) throw new ErrorFlujo('El email no parece válido');
  if (!d.email && !j.sinEmail) throw new ErrorFlujo('El email es obligatorio. Si de verdad no tiene, marca «No tiene email» e indica el motivo.');
  for (const k of TELEFONOS.filter((k) => cambiados.includes(k) && d[k])) {
    if (!telefonoValido(d[k])) throw new ErrorFlujo(`El teléfono «${d[k]}» no es válido: solo cifras, espacios y el signo +`);
  }
  if (!tieneMovil(d) && !j.sinMovil) {
    throw new ErrorFlujo('Tiene que haber al menos un móvil (9 cifras que empiecen por 6 o 7) en cualquiera de los teléfonos. Si de verdad no tiene, marca «No tiene móvil» e indica el motivo.');
  }
};

/** Normaliza las marcas «no tiene»: devuelve cómo quedan y si cambian */
const leerJustificacion = (c: Pick<Contacto, 'sin_email' | 'sin_movil' | 'motivo_sin_email' | 'motivo_sin_movil'>, ex: Extras) => {
  const motivo = (v: string | null | undefined, marcado: boolean, actual: string, que: string) => {
    if (v === undefined) return { marcado, motivo: actual };
    if (v === null) return { marcado: false, motivo: '' };
    if (!v.trim()) throw new ErrorFlujo(`Indica por qué no tiene ${que}`);
    return { marcado: true, motivo: v.trim().slice(0, 300) };
  };
  const email = motivo(ex.sinEmail, c.sin_email, c.motivo_sin_email, 'email');
  const movil = motivo(ex.sinMovil, c.sin_movil, c.motivo_sin_movil, 'móvil');
  const cambia = email.marcado !== c.sin_email || email.motivo !== c.motivo_sin_email
    || movil.marcado !== c.sin_movil || movil.motivo !== c.motivo_sin_movil;
  return { email, movil, cambia };
};

// ── Lo que se guarda al momento, sin aprobación ──

const guardarJustificacion = async (tx: Tx, ctx: Contexto, contactoId: number, j: ReturnType<typeof leerJustificacion>) => {
  if (!j.cambia) return;
  const { usuario, admin } = quien(ctx);
  await tx.query(`UPDATE contactos SET sin_email = ?2, motivo_sin_email = ?3, sin_movil = ?4, motivo_sin_movil = ?5,
      sin_datos_por = ?6, sin_datos_admin = ?7, sin_datos_en = datetime('now', 'localtime') WHERE id = ?1`,
  [contactoId, j.email.marcado, j.email.motivo, j.movil.marcado, j.movil.motivo, usuario, admin]);
  const partes = [j.email.marcado && `sin email: ${j.email.motivo}`, j.movil.marcado && `sin móvil: ${j.movil.motivo}`].filter(Boolean);
  await registrarActividad(tx, { contactoId, usuarioId: usuario, adminId: admin, accion: 'sin_datos', detalle: partes.join(' · ') || 'quitó la marca' });
};

const guardarEncuestas = async (tx: Tx, ctx: Contexto, c: Pick<Contacto, 'id' | 'enc_ventas' | 'enc_postventa'>, e: Extras['encuestas']) => {
  if (!e || (!!e.ventas === c.enc_ventas && !!e.postventa === c.enc_postventa)) return false;
  const { usuario, admin } = quien(ctx);
  await tx.query(`UPDATE contactos SET enc_ventas = ?2, enc_postventa = ?3, enc_por = ?4, enc_admin = ?5, enc_en = datetime('now', 'localtime')
    WHERE id = ?1`, [c.id, !!e.ventas, !!e.postventa, usuario, admin]);
  const marcadas = [e.ventas && 'ventas', e.postventa && 'postventa'].filter(Boolean).join(' y ');
  await registrarActividad(tx, { contactoId: c.id, usuarioId: usuario, adminId: admin, accion: 'encuesta', detalle: marcadas ? `contesta ${marcadas}` : 'ninguna' });
  return true;
};

/** Casillas Ventas y Postventa de la tarjeta: se guardan al momento */
export const marcarEncuesta = async (tx: Tx, ctx: Contexto, contactoId: number, tipo: string, valor: boolean) => {
  if (tipo !== 'ventas' && tipo !== 'postventa') throw new ErrorFlujo('Encuesta desconocida');
  const c = await comprobarAcceso(tx, ctx, contactoId);
  await guardarEncuestas(tx, ctx, c, { ventas: tipo === 'ventas' ? valor : c.enc_ventas, postventa: tipo === 'postventa' ? valor : c.enc_postventa });
  return c.estado;
};

// ── Veredictos y propuestas ──

const leerVeredicto = async (tx: Tx, contactoId: number, usuario: number) => {
  const [v] = await tx.query<{ veredicto: Veredicto; admin_id: number | null; creado_en: string }>(
    'SELECT veredicto, admin_id, creado_en FROM veredictos WHERE contacto_id = ?1 AND usuario_id = ?2', [contactoId, usuario]);
  return v ?? null;
};

const ponerVeredicto = (tx: Tx, contactoId: number, usuario: number, v: Veredicto, admin: number | null) => tx.query(`
  INSERT INTO veredictos (contacto_id, usuario_id, veredicto, admin_id) VALUES (?1, ?2, ?3, ?4)
  ON CONFLICT (contacto_id, usuario_id) DO UPDATE SET veredicto = ?3, admin_id = ?4, creado_en = datetime('now', 'localtime')`,
[contactoId, usuario, v, admin]);

const validarA = (tx: Tx, contactoId: number, usuario: number, admin: number | null, en?: string) => tx.query(
  `UPDATE contactos SET validado_por = ?2, validado_admin = ?3, validado_en = coalesce(?4, datetime('now', 'localtime')) WHERE id = ?1`,
  [contactoId, usuario, admin, en ?? null]);

const escribirDatos = async (tx: Tx, contactoId: number, pares: [CampoContacto, string][]) => {
  for (const [campo, valor] of pares) await tx.query(`UPDATE contactos SET ${campo} = ?2 WHERE id = ?1`, [contactoId, valor]);
  if (pares.some(([k]) => k === 'desc_dpto' || k === 'desc_funcion')) await asignarCodigos(tx, contactoId);
};

const paresDiff = (diff: [string, string, string][], cual: 1 | 2) =>
  diff.map(([etiqueta, ...v]) => [CAMPO_POR_ETIQUETA.get(etiqueta), v[cual - 1]] as const)
    .filter((x): x is [CampoContacto, string] => !!x[0]);

const leerPropuesta = async (tx: Tx, id: number) => {
  const [p] = await tx.query<FilaPropuesta>(
    `SELECT id, contacto_id, comercial_id, admin_id, tipo, estado, en_conflicto, aplicada, diff, previo, creado_en FROM propuestas WHERE id = ?1`, [id]);
  return p ?? null;
};

/** Borra un alta que no llega a existir (deshecha o rechazada) y todo lo que cuelga de ella */
const borrarAlta = async (tx: Tx, contactoId: number) => {
  for (const tabla of ['veredictos', 'propuestas', 'asignaciones']) await tx.query(`DELETE FROM ${tabla} WHERE contacto_id = ?1`, [contactoId]);
  await tx.query('DELETE FROM contactos WHERE id = ?1', [contactoId]);
};

/**
 * Deja sin efecto una propuesta pendiente (la deshace el comercial o la rechaza el administrador): los datos vuelven a
 * los anteriores, el comercial vuelve a lo que había dicho antes y el contacto recupera su estado.
 */
const deshacerPropuesta = async (tx: Tx, p: FilaPropuesta, estado: 'anulada' | 'rechazada', resueltoPor: number | null, comentario = '') => {
  if (p.tipo === 'alta') {
    await borrarAlta(tx, p.contacto_id);
    return 'eliminado';
  }
  if (p.tipo === 'modificacion' && p.aplicada) await escribirDatos(tx, p.contacto_id, paresDiff(p.diff, 1));
  await tx.query(`UPDATE propuestas SET estado = ?2, resuelto_por = ?3, resuelto_en = datetime('now', 'localtime'), comentario = ?4,
      en_conflicto = false WHERE id = ?1`, [p.id, estado, resueltoPor, comentario]);
  const prev = p.previo ?? {};
  if (prev.veredicto) {
    await tx.query(`INSERT INTO veredictos (contacto_id, usuario_id, veredicto, admin_id, creado_en) VALUES (?1, ?2, ?3, ?4, coalesce(?5, datetime('now', 'localtime')))
      ON CONFLICT (contacto_id, usuario_id) DO UPDATE SET veredicto = ?3, admin_id = ?4, creado_en = coalesce(?5, datetime('now', 'localtime'))`,
    [p.contacto_id, p.comercial_id, prev.veredicto, prev.veredicto_admin ?? null, prev.veredicto_en ?? null]);
  } else {
    await tx.query('DELETE FROM veredictos WHERE contacto_id = ?1 AND usuario_id = ?2', [p.contacto_id, p.comercial_id]);
  }
  // Solo una propuesta aplicada había cambiado quién lo validó
  if (p.aplicada && 'validado_por' in prev) {
    await tx.query('UPDATE contactos SET validado_por = ?2, validado_admin = ?3, validado_en = ?4 WHERE id = ?1',
      [p.contacto_id, prev.validado_por ?? null, prev.validado_admin ?? null, prev.validado_en ?? null]);
  }
  return recalcularEstado(tx, p.contacto_id);
};

/** Una propuesta nueva del comercial sustituye a la suya anterior que siguiera pendiente (se anula primero) */
const anularPendienteMia = async (tx: Tx, contactoId: number, usuario: number) => {
  const [p] = await tx.query<{ id: number }>(
    `SELECT id FROM propuestas WHERE contacto_id = ?1 AND comercial_id = ?2 AND estado = 'pendiente' AND tipo <> 'alta'`, [contactoId, usuario]);
  if (p) await deshacerPropuesta(tx, (await leerPropuesta(tx, p.id))!, 'anulada', usuario, 'Sustituida por otra propuesta del mismo comercial');
};

const capturarPrevio = async (tx: Tx, contactoId: number, usuario: number): Promise<Previo> => {
  const [c] = await tx.query<{ validado_por: number | null; validado_admin: number | null; validado_en: string | null }>(
    'SELECT validado_por, validado_admin, validado_en FROM contactos WHERE id = ?1', [contactoId]);
  const v = await leerVeredicto(tx, contactoId, usuario);
  return { ...c, veredicto: v?.veredicto ?? null, veredicto_admin: v?.admin_id ?? null, veredicto_en: v?.creado_en ?? null };
};

export const marcarOk = async (tx: Tx, ctx: Contexto, contactoId: number) => {
  const c = await comprobarAcceso(tx, ctx, contactoId);
  const { usuario, admin } = quien(ctx);
  if (validadoPorOtro(c, usuario)) throw new ErrorFlujo('Ya lo ha revisado otro comercial y te cuenta como hecho. Si no estás de acuerdo, corrígelo.');
  const [mia] = await tx.query(`SELECT 1 FROM propuestas WHERE contacto_id = ?1 AND comercial_id = ?2 AND estado = 'pendiente'`, [contactoId, usuario]);
  if (mia) throw new ErrorFlujo('Tienes un cambio pendiente de aprobar en este contacto. Si te equivocaste, pulsa Deshacer.');
  const falta = !c.email && !c.sin_email ? 'el email' : !tieneMovil(c) && !c.sin_movil ? 'un móvil' : null;
  if (falta) throw new ErrorFlujo(`Le falta ${falta}: usa Completar para añadirlo o indicar que no lo tiene.`);
  await ponerVeredicto(tx, contactoId, usuario, 'ok', admin);
  await validarA(tx, contactoId, usuario, admin);
  await registrarActividad(tx, { contactoId, usuarioId: usuario, adminId: admin, accion: 'ok' });
  return recalcularEstado(tx, contactoId);
};

/**
 * Modificar, Completar o Corregir. Si solo se justifica que falta un dato (o solo cambian las encuestas), no hay
 * nada que aprobar: se guarda al momento y, en el primer caso, el contacto queda validado.
 */
export const proponerModificacion = async (tx: Tx, ctx: Contexto, contactoId: number, datos: Partial<DatosContacto>, extras: Extras = {}) => {
  const c = await comprobarAcceso(tx, ctx, contactoId);
  const { usuario, admin } = quien(ctx);
  const j = leerJustificacion(c, extras);
  const nuevos = limpiar({ ...c, ...datos });
  const cambiados = CAMPOS.filter(({ k }) => (c[k] ?? '') !== nuevos[k]);

  if (!cambiados.length) {
    if (j.cambia) {
      await validar(tx, nuevos, { sinEmail: j.email.marcado, sinMovil: j.movil.marcado }, []);
      await guardarJustificacion(tx, ctx, contactoId, j);
      await guardarEncuestas(tx, ctx, c, extras.encuestas);
      // Sin nada que aprobar, queda validado al momento (si no lo había validado otro)
      if (!validadoPorOtro(c, usuario) && c.estado === 'pendiente') {
        await ponerVeredicto(tx, contactoId, usuario, 'ok', admin);
        await validarA(tx, contactoId, usuario, admin);
        await registrarActividad(tx, { contactoId, usuarioId: usuario, adminId: admin, accion: 'ok' });
      }
      return recalcularEstado(tx, contactoId);
    }
    if (await guardarEncuestas(tx, ctx, c, extras.encuestas)) return c.estado;
    throw new ErrorFlujo('No has cambiado ningún dato. Si todo está bien, márcalo como OK.');
  }

  await validar(tx, nuevos, { sinEmail: j.email.marcado, sinMovil: j.movil.marcado }, cambiados.map((x) => x.k));
  await anularPendienteMia(tx, contactoId, usuario);
  // Tras anular la anterior, los datos de partida pueden haber vuelto atrás: el diff se calcula sobre lo que hay ahora
  const [actual] = await tx.query<Contacto>('SELECT * FROM contactos WHERE id = ?1', [contactoId]);
  const diff = CAMPOS.filter(({ k }) => (actual[k] ?? '') !== nuevos[k]).map(({ k, t }) => [t, actual[k] ?? '', nuevos[k]] as [string, string, string]);
  const conflicto = validadoPorOtro(actual, usuario);
  const previo = await capturarPrevio(tx, contactoId, usuario);

  if (diff.length) {
    if (!conflicto) {
      await escribirDatos(tx, contactoId, paresDiff(diff, 2));
      await validarA(tx, contactoId, usuario, admin);
    }
    await ponerVeredicto(tx, contactoId, usuario, 'modificacion', admin);
    await tx.query(`INSERT INTO propuestas (contacto_id, comercial_id, admin_id, tipo, en_conflicto, aplicada, diff, previo)
      VALUES (?1, ?2, ?3, 'modificacion', ?4, ?5, ?6, ?7)`,
    [contactoId, usuario, admin, conflicto, !conflicto, JSON.stringify(diff), JSON.stringify(previo)]);
    await registrarActividad(tx, {
      contactoId, usuarioId: usuario, adminId: admin, accion: conflicto ? 'correccion' : 'modificacion',
      detalle: diff.map((d) => d[0]).join(', '),
    });
  }
  await guardarJustificacion(tx, ctx, contactoId, j);
  await guardarEncuestas(tx, ctx, actual, extras.encuestas);
  return recalcularEstado(tx, contactoId);
};

export const proponerBaja = async (tx: Tx, ctx: Contexto, contactoId: number, motivo: string) => {
  const c = await comprobarAcceso(tx, ctx, contactoId);
  if (!motivo.trim()) throw new ErrorFlujo('Indica el motivo de la baja');
  const { usuario, admin } = quien(ctx);
  await anularPendienteMia(tx, contactoId, usuario);
  const [actual] = await tx.query<Contacto>('SELECT * FROM contactos WHERE id = ?1', [c.id]);
  const conflicto = validadoPorOtro(actual, usuario);
  const previo = await capturarPrevio(tx, contactoId, usuario);
  if (!conflicto) await validarA(tx, contactoId, usuario, admin);
  await ponerVeredicto(tx, contactoId, usuario, 'baja', admin);
  await tx.query(`INSERT INTO propuestas (contacto_id, comercial_id, admin_id, tipo, en_conflicto, aplicada, motivo, previo)
    VALUES (?1, ?2, ?3, 'baja', ?4, ?5, ?6, ?7)`,
  [contactoId, usuario, admin, conflicto, !conflicto, motivo.trim().slice(0, 500), JSON.stringify(previo)]);
  await registrarActividad(tx, { contactoId, usuarioId: usuario, adminId: admin, accion: conflicto ? 'baja_conflicto' : 'baja', detalle: motivo.trim() });
  return recalcularEstado(tx, contactoId);
};

/** Contactos del cliente (todas las unidades) que coinciden en email o en algún teléfono */
export const buscarDuplicados = async (tx: Pick<Db, 'query'>, cliente: { cliente: string; solicitante: string }, d: DatosContacto, excluir?: number) => {
  const tels = TELEFONOS.map((k) => d[k].replace(/\D/g, '')).filter((t) => t.length >= 6);
  if (!d.email && !tels.length) return [];
  const filas = await tx.query<DatosContacto & { id: number }>(`
    SELECT id, nombre, apellido, desc_funcion, email, tel_contacto, telefono, tel_ad1, tel_ad2, tel_ad3, tel_ad4, tel_ad5
    FROM contactos WHERE cliente = ?1 AND solicitante = ?2 AND id IS NOT ?3`, [cliente.cliente, cliente.solicitante, excluir ?? null]);
  // La centralita es la del cliente: la comparten todos y no delata un duplicado
  const propios = (x: DatosContacto) => TELEFONOS.filter((k) => k !== 'telefono').map((k) => x[k].replace(/\D/g, '')).filter(Boolean);
  const telsNuevos = new Set(TELEFONOS.filter((k) => k !== 'telefono').map((k) => d[k].replace(/\D/g, '')).filter((t) => t.length >= 6));
  return filas
    .filter((x) => (d.email && x.email.toLowerCase() === d.email) || propios(x).some((t) => telsNuevos.has(t)))
    .map((x): Duplicado => ({
      id: x.id, nombre: x.nombre, apellido: x.apellido, desc_funcion: x.desc_funcion, email: x.email,
      telefonos: TELEFONOS.map((k) => x[k]).filter(Boolean).join(' '),
    }));
};

/**
 * Un contacto nuevo en un cliente del comercial. Aparece al momento, validado a su nombre, para todos los comerciales
 * que llevan ese cliente; queda pendiente de que el administrador apruebe el alta.
 */
export const proponerAlta = async (
  tx: Tx, ctx: Contexto, cliente: { cliente: string; solicitante: string; unidad: string }, datos: Partial<DatosContacto>,
  extras: Extras = {}, forzar = false,
): Promise<{ id: number } | { duplicados: Duplicado[] }> => {
  const [base] = await tx.query<{ cliente: string; localidad: string; pagador: string; solicitante: string; cod_provincia: string; provincia: string }>(`
    SELECT c.cliente, c.localidad, c.pagador, c.solicitante, c.cod_provincia, c.provincia
    FROM contactos c JOIN asignaciones a ON a.contacto_id = c.id
    WHERE a.usuario_id = ?1 AND a.unidad = ?2 AND c.cliente = ?3 AND c.solicitante = ?4
    LIMIT 1`, [ctx.efectivo.id, cliente.unidad, cliente.cliente, cliente.solicitante]);
  if (!base) throw new ErrorFlujo('No llevas ese cliente en esa unidad', 404);
  const d = limpiar(datos);
  const j = leerJustificacion({ sin_email: false, sin_movil: false, motivo_sin_email: '', motivo_sin_movil: '' }, extras);
  await validar(tx, d, { sinEmail: j.email.marcado, sinMovil: j.movil.marcado }, CAMPOS.map((x) => x.k));
  if (!forzar) {
    const duplicados = await buscarDuplicados(tx, base, d);
    if (duplicados.length) return { duplicados };
  }
  const { usuario, admin } = quien(ctx);
  const [{ id }] = await tx.query<{ id: number }>(`
    INSERT INTO contactos (cliente, localidad, pagador, solicitante, nombre, apellido, desc_dpto, desc_funcion, email,
      tel_contacto, telefono, tel_ad1, tel_ad2, tel_ad3, tel_ad4, tel_ad5, cod_provincia, provincia, es_alta, creado_en, estado,
      validado_por, validado_admin, validado_en)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, true, datetime('now', 'localtime'), 'ok',
      ?19, ?20, datetime('now', 'localtime'))
    RETURNING id`,
  [base.cliente, base.localidad, base.pagador, base.solicitante, d.nombre, d.apellido, d.desc_dpto, d.desc_funcion, d.email,
    d.tel_contacto, d.telefono, d.tel_ad1, d.tel_ad2, d.tel_ad3, d.tel_ad4, d.tel_ad5, base.cod_provincia, base.provincia, usuario, admin]);
  await asignarCodigos(tx, id);
  // Lo ven todos los comerciales que llevan el cliente, cada uno en su unidad; y quien lo da de alta, en la suya
  await tx.query(`
    INSERT INTO asignaciones (contacto_id, usuario_id, unidad)
    SELECT DISTINCT ?1, a.usuario_id, a.unidad
    FROM asignaciones a JOIN contactos c ON c.id = a.contacto_id
    WHERE c.cliente = ?2 AND c.solicitante = ?3 AND c.id <> ?1
    ON CONFLICT DO NOTHING`, [id, base.cliente, base.solicitante]);
  await tx.query('INSERT INTO asignaciones (contacto_id, usuario_id, unidad) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING', [id, usuario, cliente.unidad]);
  await ponerVeredicto(tx, id, usuario, 'alta', admin);
  await tx.query(`INSERT INTO propuestas (contacto_id, comercial_id, admin_id, tipo, aplicada, diff) VALUES (?1, ?2, ?3, 'alta', true, ?4)`,
    [id, usuario, admin, JSON.stringify(CAMPOS.map(({ k, t }) => [t, '', d[k]]))]);
  await registrarActividad(tx, { contactoId: id, usuarioId: usuario, adminId: admin, accion: 'alta' });
  const [creado] = await tx.query<Contacto>('SELECT * FROM contactos WHERE id = ?1', [id]);
  await guardarJustificacion(tx, ctx, id, j);
  await guardarEncuestas(tx, ctx, creado, extras.encuestas);
  await recalcularEstado(tx, id);
  return { id };
};

/** «Deshacer»: el comercial retira su propuesta mientras el administrador no haya decidido */
export const deshacer = async (tx: Tx, ctx: Contexto, propuestaId: number) => {
  const p = await leerPropuesta(tx, propuestaId);
  const { usuario, admin } = quien(ctx);
  if (!p || p.comercial_id !== usuario) throw new ErrorFlujo('Esa propuesta no es tuya', 404);
  if (p.estado !== 'pendiente') throw new ErrorFlujo('El administrador ya la ha decidido: si sigue habiendo un error, haz una modificación nueva');
  await registrarActividad(tx, { contactoId: p.contacto_id, usuarioId: usuario, adminId: admin, accion: 'deshacer', detalle: p.tipo });
  return deshacerPropuesta(tx, p, 'anulada', usuario);
};

// ── Decisiones del administrador ──

const propuestaPendiente = async (tx: Tx, id: number) => {
  const p = await leerPropuesta(tx, id);
  if (!p) throw new ErrorFlujo(`La propuesta ${id} no existe`, 404);
  if (p.estado !== 'pendiente') throw new ErrorFlujo(`La propuesta ${id} ya estaba decidida`);
  return p;
};

/**
 * Las demás pendientes del contacto quedan «superadas» (sin efecto). Un alta todavía sin aprobar no se pierde: si se
 * decide otra cosa sobre ese contacto, el alta queda aprobada (salvo que lo decidido sea su baja).
 */
const superarResto = async (tx: Tx, contactoId: number, menos: number | null, adminId: number, aprobarAlta: boolean) => {
  const otras = await tx.query<{ id: number; tipo: string }>(
    `SELECT id, tipo FROM propuestas WHERE contacto_id = ?1 AND estado = 'pendiente' AND id IS NOT ?2`, [contactoId, menos]);
  for (const o of otras) {
    const estado = o.tipo === 'alta' && aprobarAlta ? 'aprobada' : 'superada';
    await tx.query(`UPDATE propuestas SET estado = ?2, resuelto_por = ?3, resuelto_en = datetime('now', 'localtime'), en_conflicto = false,
        comentario = CASE WHEN ?2 = 'superada' THEN 'Sin efecto: el administrador decidió otra propuesta de este contacto' ELSE comentario END
      WHERE id = ?1`, [o.id, estado, adminId]);
  }
};

export const aprobar = async (tx: Tx, adminId: number, id: number, comentario = '') => {
  const p = await propuestaPendiente(tx, id);
  // Aprobar escribe siempre los datos nuevos: si ya estaban aplicados no cambia nada; si estaba en conflicto, ahora se aplican
  if (p.tipo === 'modificacion') await escribirDatos(tx, p.contacto_id, paresDiff(p.diff, 2));
  await tx.query(`UPDATE propuestas SET estado = 'aprobada', aplicada = true, resuelto_por = ?2, resuelto_en = datetime('now', 'localtime'),
      comentario = ?3, en_conflicto = false WHERE id = ?1`, [id, adminId, comentario]);
  if (p.en_conflicto) {
    // Queda validado a nombre de quien hizo la propuesta; las demás pendientes del contacto, superadas
    await validarA(tx, p.contacto_id, p.comercial_id, p.admin_id, p.creado_en);
    await superarResto(tx, p.contacto_id, p.id, adminId, p.tipo !== 'baja');
  } else if (p.tipo === 'baja') {
    await superarResto(tx, p.contacto_id, p.id, adminId, false);
  }
  await registrarActividad(tx, { contactoId: p.contacto_id, usuarioId: adminId, accion: 'aprobar', detalle: `${p.tipo}${comentario ? ` · «${comentario}»` : ''}` });
  return recalcularEstado(tx, p.contacto_id);
};

export const rechazar = async (tx: Tx, adminId: number, id: number, comentario = '') => {
  const p = await propuestaPendiente(tx, id);
  await registrarActividad(tx, { contactoId: p.contacto_id, usuarioId: adminId, accion: 'rechazar', detalle: `${p.tipo}${comentario ? ` · «${comentario}»` : ''}` });
  // Se deshace: los datos vuelven a los anteriores, la baja se anula o el contacto nuevo desaparece
  return deshacerPropuesta(tx, p, 'rechazada', adminId, comentario);
};

/**
 * «Resolver a mano» un conflicto: el administrador fija los datos. Cuenta como una modificación aprobada a su nombre y
 * deja superadas las propuestas pendientes del contacto.
 */
export const resolverAMano = async (tx: Tx, adminId: number, contactoId: number, datos: Partial<DatosContacto>, comentario: string) => {
  const [c] = await tx.query<Contacto>('SELECT * FROM contactos WHERE id = ?1', [contactoId]);
  if (!c) throw new ErrorFlujo('Contacto no encontrado', 404);
  if (c.estado !== 'conflicto') throw new ErrorFlujo('Ese contacto ya no está en conflicto');
  const nuevos = limpiar({ ...c, ...datos });
  const diff = CAMPOS.filter(({ k }) => (c[k] ?? '') !== nuevos[k]).map(({ k, t }) => [t, c[k] ?? '', nuevos[k]] as [string, string, string]);
  if (!nuevos.nombre || !nuevos.apellido) throw new ErrorFlujo('El nombre y el apellido son obligatorios');
  if (nuevos.email && !emailValido(nuevos.email)) throw new ErrorFlujo('El email no parece válido');
  for (const k of TELEFONOS.filter((k) => diff.some((d) => CAMPO_POR_ETIQUETA.get(d[0]) === k) && nuevos[k])) {
    if (!telefonoValido(nuevos[k])) throw new ErrorFlujo(`El teléfono «${nuevos[k]}» no es válido: solo cifras, espacios y el signo +`);
  }
  if (diff.some((d) => ['Departamento', 'Función'].includes(d[0]))) await comprobarCatalogo(tx, nuevos);
  await superarResto(tx, contactoId, null, adminId, true);
  if (diff.length) {
    await escribirDatos(tx, contactoId, paresDiff(diff, 2));
    await tx.query(`INSERT INTO propuestas (contacto_id, comercial_id, tipo, estado, aplicada, comentario, resuelto_por, resuelto_en, diff)
      VALUES (?1, ?2, 'modificacion', 'aprobada', true, ?3, ?2, datetime('now', 'localtime'), ?4)`,
    [contactoId, adminId, comentario.trim(), JSON.stringify(diff)]);
  }
  await validarA(tx, contactoId, adminId, null);
  await registrarActividad(tx, { contactoId, usuarioId: adminId, accion: 'resolver', detalle: diff.map((d) => d[0]).join(', ') || 'sin cambios en los datos' });
  return recalcularEstado(tx, contactoId);
};

/** Pone a los contactos los códigos del maestro que corresponden a su departamento y función ('' si no están) */
export const asignarCodigos = (tx: Pick<Db, 'query'>, contactoId?: number) => tx.query(`
  UPDATE contactos SET
    cod_dpto = coalesce((SELECT d.codigo FROM departamentos d WHERE d.nombre = contactos.desc_dpto), ''),
    cod_funcion = coalesce((SELECT f.codigo FROM funciones f JOIN departamentos d ON d.id = f.departamento_id
                            WHERE d.nombre = contactos.desc_dpto AND f.nombre = contactos.desc_funcion), '')
  WHERE ?1 IS NULL OR id = ?1`, [contactoId ?? null]);
