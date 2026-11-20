import express, { type NextFunction, type Request, type Response } from 'express';
import type { CriterioGlobal, DatosContacto, Estado, EstadoPropuesta, Extras, Rol, TipoPropuesta } from '../../shared/tipos.js';
import { ESTADOS, ESTADOS_PROPUESTA } from '../../shared/tipos.js';
import { randomBytes } from 'node:crypto';
import type { EventoAcceso, SesionPendiente } from '../../shared/tipos.js';
import {
  aSesion, cargarSesion, comprobarClave, COOKIE, crearSesion, exigirAdmin, exigirSesion, generarClave, hashClave,
  ponerCookie, soloJson, type Pendiente,
} from './auth.js';
import {
  bloqueo, cifrar, comprobarTotp, datosAlta, descifrar, hashCodigo, MAX_INTENTOS_SESION, nuevosCodigos, nuevoSecreto,
  pareceCodigoRecuperacion, registrar,
} from './doble-factor.js';
import { avance, ficha, listadoComercial, listadoGlobal, type FiltroComercial } from './consultas.js';
import * as admin from './consultas-admin.js';
import { catalogo, clienteDetalle, leerClave, misClientes } from './consultas-comercial.js';
import type { Db } from './db.js';
import {
  aprobar, deshacer, ErrorFlujo, marcarEncuesta, marcarOk, proponerAlta, proponerBaja, proponerModificacion, rechazar, resolverAMano,
} from './flujo.js';
import { importar, plantilla, previsualizar } from './importar-excel.js';
import { excel } from './exportar.js';
import { foto, nombreFoto } from './foto.js';

/** Lo que se guarda al momento con un alta o una modificación (encuestas y «no tiene email / móvil») */
const leerExtras = (v: unknown): Extras => {
  const e = (v ?? {}) as Record<string, unknown>;
  const motivo = (x: unknown) => (x === null ? null : typeof x === 'string' ? x : undefined);
  const enc = e.encuestas as Record<string, unknown> | undefined;
  return {
    sinEmail: motivo(e.sinEmail),
    sinMovil: motivo(e.sinMovil),
    encuestas: enc && typeof enc === 'object' ? { ventas: !!enc.ventas, postventa: !!enc.postventa } : undefined,
  };
};

/** «a,b,c» → lista, quedándose solo con los valores válidos */
const lista = <T extends string>(v: unknown, validos: readonly T[]) =>
  (typeof v === 'string' ? v.split(',') : []).filter((x): x is T => validos.includes(x as T));

const TIPOS: TipoPropuesta[] = ['alta', 'modificacion', 'baja'];
const FILTROS: FiltroComercial[] = ['todos', 'revisados', 'pendientes'];

// Envuelve un manejador asíncrono para que los errores lleguen al manejador de errores de Express
const asincrono = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

const idValido = (v: unknown) => (/^\d+$/.test(String(v)) ? Number(v) : null);
const texto = (v: unknown) => (typeof v === 'string' ? v : '');

export const crearApp = (db: Db) => {
  const app = express();
  app.disable('x-powered-by');
  // En Vercel las peticiones llegan a través de su proxy, que pone la IP y el protocolo del navegador
  app.set('trust proxy', process.env.VERCEL ? true : 'loopback');
  // El Excel de carga llega en base64 dentro del JSON: su ruta admite más tamaño
  app.use('/api/admin/importar', express.json({ limit: '30mb' }));
  app.use('/api', express.json({ limit: '100kb' }), soloJson, cargarSesion(db));

  // ── Sesión: primer paso, la contraseña ──

  // Con un usuario que no existe se compara igualmente contra un hash, para no delatarlo por el tiempo de respuesta
  const hashFicticio = hashClave(randomBytes(16).toString('hex'));
  const MSG_BLOQUEO = 'Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.';

  app.post('/api/login', asincrono(async (req, res) => {
    const usuario = texto(req.body?.usuario).trim();
    const clave = texto(req.body?.clave);
    if (!usuario || !clave) return res.status(400).json({ error: 'Escribe usuario y contraseña' });
    const [u] = await db.query<{ id: number; usuario: string; clave_hash: string | null; totp_secreto: string | null }>(
      'SELECT id, usuario, clave_hash, totp_secreto FROM usuarios WHERE lower(usuario) = lower(?1) AND activo', [usuario]);
    const quien = { usuarioId: u?.id, usuario: u?.usuario ?? usuario };
    if (await bloqueo(db, quien.usuario, req)) {
      await registrar(db, req, 'bloqueado', quien);
      return res.status(429).json({ error: MSG_BLOQUEO });
    }
    if (!(await comprobarClave(clave, u?.clave_hash ?? await hashFicticio)) || !u) {
      await registrar(db, req, 'clave_incorrecta', quien);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    await registrar(db, req, 'clave_correcta', quien);
    if (req.pendiente) await db.query('DELETE FROM sesiones WHERE id = ?1', [req.pendiente.sesionId]);
    // Todavía no hay acceso: la sesión queda a medias hasta el segundo factor
    ponerCookie(res, await crearSesion(db, u.id, 'segundo_factor'), req);
    res.json({ ok: true, paso: 'segundo_factor', alta: !u.totp_secreto });
  }));

  app.post('/api/logout', asincrono(async (req, res) => {
    const sesion = req.ctx?.sesionId ?? req.pendiente?.sesionId;
    if (sesion) {
      await db.query('DELETE FROM sesiones WHERE id = ?1', [sesion]);
      const u = req.ctx?.real ?? { id: req.pendiente!.usuarioId, usuario: req.pendiente!.usuario };
      await registrar(db, req, 'sesion_cerrada', { usuarioId: u.id, usuario: u.usuario });
    }
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }));

  const aPendiente = (p: Pendiente): SesionPendiente => ({
    paso: 'segundo_factor', usuario: p.usuario, nombre: p.nombre, alta: !p.totpSecreto,
    intentosRestantes: MAX_INTENTOS_SESION - p.intentos,
  });

  app.get('/api/sesion', (req, res) => {
    if (req.pendiente) return res.json(aPendiente(req.pendiente));
    if (!req.ctx) return res.status(401).json({ error: 'Inicia sesión' });
    res.json(aSesion(req.ctx));
  });

  // ── Sesión: segundo paso, el código de la aplicación de autenticación ──

  const exigirPendiente = (req: Request, res: Response) => {
    if (req.pendiente) return req.pendiente;
    res.status(401).json({ error: 'Tu sesión ha caducado. Vuelve a escribir tu usuario y contraseña.' });
    return null;
  };

  /** Código incorrecto: se apunta y, al quinto en la misma sesión, hay que volver a empezar por la contraseña */
  const falloCodigo = async (req: Request, res: Response, p: Pendiente) => {
    await registrar(db, req, 'codigo_incorrecto', { usuarioId: p.usuarioId, usuario: p.usuario });
    const intentos = p.intentos + 1;
    if (intentos >= MAX_INTENTOS_SESION) {
      await db.query('DELETE FROM sesiones WHERE id = ?1', [p.sesionId]);
      res.clearCookie(COOKIE, { path: '/' });
      return res.status(401).json({ error: 'Demasiados códigos incorrectos. Vuelve a escribir tu usuario y contraseña.' });
    }
    await db.query('UPDATE sesiones SET intentos = ?2 WHERE id = ?1', [p.sesionId, intentos]);
    const quedan = MAX_INTENTOS_SESION - intentos;
    return res.status(400).json({ error: `Código incorrecto. ${quedan === 1 ? 'Te queda 1 intento' : `Te quedan ${quedan} intentos`}.` });
  };

  /** Ambos pasos correctos: la sesión a medias se sustituye por una completa con otro token */
  const completar = async (tx: Pick<Db, 'query'>, req: Request, res: Response, p: Pendiente, eventos: EventoAcceso[]) => {
    await tx.query('DELETE FROM sesiones WHERE id = ?1', [p.sesionId]);
    await tx.query(`UPDATE usuarios SET ultima_entrada = datetime('now', 'localtime') WHERE id = ?1`, [p.usuarioId]);
    for (const e of [...eventos, 'acceso_concedido' as const]) await registrar(tx, req, e, { usuarioId: p.usuarioId, usuario: p.usuario });
    ponerCookie(res, await crearSesion(tx, p.usuarioId, 'completa'), req);
  };

  // Alta de la aplicación de autenticación (primera vez, o tras restablecerla el administrador)
  app.post('/api/2fa/alta', asincrono(async (req, res) => {
    const p = exigirPendiente(req, res);
    if (!p) return;
    if (p.totpSecreto) return res.status(400).json({ error: 'Ya tienes la verificación en dos pasos activada' });
    // Dentro de la misma sesión se devuelve siempre el mismo secreto, aunque se pida otra vez (p. ej. al recargar la página)
    const secreto = p.totpAlta ? descifrar(p.totpAlta) : nuevoSecreto();
    if (!p.totpAlta) await db.query('UPDATE sesiones SET totp_alta = ?2 WHERE id = ?1', [p.sesionId, cifrar(secreto)]);
    res.json(await datosAlta(p.usuario, secreto));
  }));

  app.post('/api/2fa/alta/confirmar', asincrono(async (req, res) => {
    const p = exigirPendiente(req, res);
    if (!p) return;
    if (p.totpSecreto) return res.status(400).json({ error: 'Ya tienes la verificación en dos pasos activada' });
    if (!p.totpAlta) return res.status(400).json({ error: 'Empieza por escanear el código QR' });
    if (await bloqueo(db, p.usuario, req)) return res.status(429).json({ error: MSG_BLOQUEO });
    const paso = comprobarTotp(descifrar(p.totpAlta), texto(req.body?.codigo), null);
    if (paso === null) return falloCodigo(req, res, p);
    const codigos = nuevosCodigos();
    await db.transaction(async (tx) => {
      await tx.query(`UPDATE usuarios SET totp_secreto = ?2, totp_activado_en = datetime('now', 'localtime'), totp_ultimo_paso = ?3
        WHERE id = ?1`, [p.usuarioId, p.totpAlta, paso]);
      await tx.query('DELETE FROM codigos_recuperacion WHERE usuario_id = ?1', [p.usuarioId]);
      for (const c of codigos) await tx.query('INSERT INTO codigos_recuperacion (usuario_id, hash) VALUES (?1, ?2)', [p.usuarioId, hashCodigo(c)]);
      await completar(tx, req, res, p, ['doble_factor_activado']);
    });
    // Los códigos de recuperación se enseñan esta única vez
    res.json({ ok: true, codigos });
  }));

  app.post('/api/2fa/verificar', asincrono(async (req, res) => {
    const p = exigirPendiente(req, res);
    if (!p) return;
    if (!p.totpSecreto) return res.status(400).json({ error: 'Antes tienes que dar de alta la aplicación de autenticación' });
    if (await bloqueo(db, p.usuario, req)) return res.status(429).json({ error: MSG_BLOQUEO });
    const codigo = texto(req.body?.codigo).trim();

    if (pareceCodigoRecuperacion(codigo)) {
      const restantes = await db.transaction(async (tx) => {
        const usado = await tx.query(`UPDATE codigos_recuperacion SET usado_en = datetime('now', 'localtime')
          WHERE usuario_id = ?1 AND hash = ?2 AND usado_en IS NULL RETURNING id`, [p.usuarioId, hashCodigo(codigo)]);
        if (!usado.length) return null;
        await completar(tx, req, res, p, ['codigo_recuperacion_usado']);
        const [{ n }] = await tx.query<{ n: number }>('SELECT count(*) AS n FROM codigos_recuperacion WHERE usuario_id = ?1 AND usado_en IS NULL', [p.usuarioId]);
        return n;
      });
      if (restantes === null) return falloCodigo(req, res, p);
      return res.json({ ok: true, codigosRestantes: restantes });
    }

    const paso = comprobarTotp(descifrar(p.totpSecreto), codigo, p.totpUltimoPaso);
    if (paso === null) return falloCodigo(req, res, p);
    const ok = await db.transaction(async (tx) => {
      // Solo si nadie ha usado ya este código (o uno posterior) entre medias
      const r = await tx.query(`UPDATE usuarios SET totp_ultimo_paso = ?2
        WHERE id = ?1 AND (totp_ultimo_paso IS NULL OR totp_ultimo_paso < ?2) RETURNING id`, [p.usuarioId, paso]);
      if (!r.length) return false;
      await completar(tx, req, res, p, []);
      return true;
    });
    if (!ok) return falloCodigo(req, res, p);
    res.json({ ok: true });
  }));

  app.post('/api/sesion/clave', asincrono(async (req, res) => {
    if (!req.ctx) return res.status(401).json({ error: 'Inicia sesión' });
    const actual = texto(req.body?.actual);
    const nueva = texto(req.body?.nueva);
    const [u] = await db.query<{ clave_hash: string }>('SELECT clave_hash FROM usuarios WHERE id = ?1', [req.ctx.real.id]);
    if (!(await comprobarClave(actual, u.clave_hash))) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
    if (nueva.length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    if (nueva === actual) return res.status(400).json({ error: 'La nueva contraseña tiene que ser distinta' });
    await db.query('UPDATE usuarios SET clave_hash = ?2, clave_inicial = false WHERE id = ?1', [req.ctx.real.id, await hashClave(nueva)]);
    // Las demás sesiones abiertas con la contraseña anterior se cierran
    await db.query('DELETE FROM sesiones WHERE usuario_id = ?1 AND id <> ?2', [req.ctx.real.id, req.ctx.sesionId]);
    await registrar(db, req, 'clave_cambiada', { usuarioId: req.ctx.real.id, usuario: req.ctx.real.usuario });
    res.json({ ok: true });
  }));

  // El administrador deja de actuar en nombre del comercial
  app.post('/api/sesion/dejar-como', asincrono(async (req, res) => {
    if (!req.ctx) return res.status(401).json({ error: 'Inicia sesión' });
    await db.query('UPDATE sesiones SET como_id = NULL WHERE id = ?1', [req.ctx.sesionId]);
    res.json({ ok: true });
  }));

  // Fecha límite y demás configuración que se ve en la cabecera (también mientras se cambia la contraseña inicial)
  app.get('/api/config', asincrono(async (req, res) => {
    if (!req.ctx) return res.status(401).json({ error: 'Inicia sesión' });
    res.json(await admin.leerConfig(db));
  }));

  // ── A partir de aquí, con sesión ──
  app.use('/api', exigirSesion);

  app.get('/api/catalogo', asincrono(async (_req, res) => { res.json(await catalogo(db)); }));

  // ── Pantallas del comercial (actúa el comercial efectivo) ──

  app.get('/api/mi/clientes', asincrono(async (req, res) => {
    res.json(await misClientes(db, req.ctx!.efectivo.id));
  }));

  app.get('/api/mi/clientes/:clave', asincrono(async (req, res) => {
    const d = await clienteDetalle(db, req.ctx!.efectivo.id, String(req.params.clave));
    if (!d) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(d);
  }));

  const accionContacto = (fn: (req: Request, id: number) => Promise<unknown>) => asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    if (id === null) return res.status(404).json({ error: 'Contacto no encontrado' });
    const estado = await fn(req, id);
    res.json({ ok: true, estado });
  });

  app.post('/api/mi/contactos/:id/ok', accionContacto((req, id) =>
    db.transaction((tx) => marcarOk(tx, req.ctx!, id))));

  // Modificar, Completar y Corregir: datos (propuesta) y extras (se guardan al momento)
  app.post('/api/mi/contactos/:id/modificar', accionContacto((req, id) =>
    db.transaction((tx) => proponerModificacion(tx, req.ctx!, id, (req.body?.datos ?? {}) as Partial<DatosContacto>, leerExtras(req.body?.extras)))));

  app.post('/api/mi/contactos/:id/baja', accionContacto((req, id) =>
    db.transaction((tx) => proponerBaja(tx, req.ctx!, id, texto(req.body?.motivo)))));

  // Casillas Ventas y Postventa: se guardan al momento, sin pasar por el administrador
  app.post('/api/mi/contactos/:id/encuesta', accionContacto((req, id) =>
    db.transaction((tx) => marcarEncuesta(tx, req.ctx!, id, texto(req.body?.tipo), req.body?.valor === true))));

  // Deshacer una propuesta propia mientras el administrador no haya decidido
  app.post('/api/mi/propuestas/:id/deshacer', asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    if (id === null) return res.status(404).json({ error: 'Propuesta no encontrada' });
    res.json({ ok: true, estado: await db.transaction((tx) => deshacer(tx, req.ctx!, id)) });
  }));

  // Alta: si coincide el email o un teléfono con otro contacto del cliente, se devuelven las coincidencias para que el
  // comercial decida; con «forzar» (Guardar de todos modos) se guarda igualmente
  app.post('/api/mi/clientes/:clave/alta', asincrono(async (req, res) => {
    const k = leerClave(String(req.params.clave));
    if (!k) return res.status(404).json({ error: 'Cliente no encontrado' });
    const r = await db.transaction((tx) => proponerAlta(tx, req.ctx!, k, (req.body?.datos ?? {}) as Partial<DatosContacto>,
      leerExtras(req.body?.extras), req.body?.forzar === true));
    res.json('duplicados' in r ? { ok: false, duplicados: r.duplicados } : { ok: true, id: r.id });
  }));

  // ── Administración ──
  app.use(['/api/admin', '/api/avance', '/api/contactos', '/api/comerciales'], exigirAdmin);

  app.get('/api/avance', asincrono(async (_req, res) => { res.json(await avance(db)); }));

  // Toda la campaña: ?estado=pendiente|ok|…, ?aprobado=alta|modificacion|baja, ?encuesta=ventas|postventa o
  // ?datos=sin_email|sin_movil|falta
  app.get('/api/contactos', asincrono(async (req, res) => {
    const estado = texto(req.query.estado);
    const aprobado = texto(req.query.aprobado);
    const encuesta = texto(req.query.encuesta);
    const datos = texto(req.query.datos);
    let criterio: CriterioGlobal | null = null;
    if (ESTADOS.includes(estado as Estado)) criterio = { estado: estado as Estado };
    else if (TIPOS.includes(aprobado as TipoPropuesta)) criterio = { aprobado: aprobado as TipoPropuesta };
    else if (encuesta === 'ventas' || encuesta === 'postventa') criterio = { encuesta };
    else if (datos === 'sin_email' || datos === 'sin_movil' || datos === 'falta') criterio = { datos };
    if (!criterio) return res.status(400).json({ error: 'Indica ?estado=, ?aprobado=, ?encuesta= o ?datos= con un valor válido' });
    res.json(await listadoGlobal(db, criterio));
  }));

  app.get('/api/contactos/:id', asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    const f = id === null ? null : await ficha(db, id);
    if (!f) return res.status(404).json({ error: 'Contacto no encontrado' });
    res.json(f);
  }));

  app.get('/api/comerciales/:id/contactos', asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    const filtro = (texto(req.query.filtro) || 'todos') as FiltroComercial;
    if (!FILTROS.includes(filtro)) return res.status(400).json({ error: 'filtro debe ser todos, revisados o pendientes' });
    const l = id === null ? null : await listadoComercial(db, id, filtro, texto(req.query.unidad));
    if (!l) return res.status(404).json({ error: 'Comercial no encontrado' });
    res.json(l);
  }));

  app.get('/api/admin/contadores', asincrono(async (_req, res) => { res.json(await admin.contadores(db)); }));

  // Filtros de selección múltiple: ?estado=pendiente,aprobada&tipo=alta&comercial=3,7 (vacío = todos)
  app.get('/api/admin/propuestas', asincrono(async (req, res) => {
    res.json(await admin.propuestas(db, {
      estados: lista<EstadoPropuesta>(req.query.estado, ESTADOS_PROPUESTA),
      tipos: lista<TipoPropuesta>(req.query.tipo, TIPOS),
      comerciales: texto(req.query.comercial).split(',').map(idValido).filter((x): x is number => x !== null),
      sinConflicto: req.query.conflicto === 'no',
    }));
  }));

  // Aprueba o rechaza varias propuestas; cada una en su transacción, para que un error no tumbe las demás
  app.post('/api/admin/propuestas/decidir', asincrono(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(idValido).filter((x): x is number => x !== null) : [];
    const accion = texto(req.body?.accion);
    if (!ids.length || !['aprobar', 'rechazar'].includes(accion)) return res.status(400).json({ error: 'Indica ids y accion' });
    const comentario = texto(req.body?.comentario).trim();
    const errores: string[] = [];
    let hechas = 0;
    for (const id of ids) {
      try {
        await db.transaction((tx) => (accion === 'aprobar' ? aprobar : rechazar)(tx, req.ctx!.real.id, id, comentario));
        hechas++;
      } catch (e) {
        if (e instanceof ErrorFlujo) errores.push(e.message); else throw e;
      }
    }
    res.json({ hechas, errores });
  }));

  app.get('/api/admin/conflictos', asincrono(async (_req, res) => { res.json(await admin.conflictos(db)); }));

  // «Resolver a mano»: el administrador fija los datos definitivos del contacto
  app.post('/api/admin/conflictos/:id/resolver', asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    if (id === null) return res.status(404).json({ error: 'Contacto no encontrado' });
    const estado = await db.transaction((tx) => resolverAMano(tx, req.ctx!.real.id, id,
      (req.body?.datos ?? {}) as Partial<DatosContacto>, texto(req.body?.comentario)));
    res.json({ ok: true, estado });
  }));

  // Rueda dentada: fecha límite y vacíos en la exportación
  app.post('/api/admin/config', asincrono(async (req, res) => {
    res.json(await admin.guardarConfig(db, {
      fechaLimite: typeof req.body?.fechaLimite === 'string' ? req.body.fechaLimite : undefined,
      vaciosExportacion: req.body?.vaciosExportacion,
    }));
  }));

  app.get('/api/admin/usuarios', asincrono(async (_req, res) => { res.json(await admin.usuarios(db)); }));

  app.get('/api/admin/tablero', asincrono(async (_req, res) => { res.json(await admin.tablero(db)); }));

  app.get('/api/admin/usuarios/:id/actividad', asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    res.json(id === null ? [] : await admin.actividadUsuario(db, id));
  }));

  app.post('/api/admin/usuarios', asincrono(async (req, res) => {
    const usuario = texto(req.body?.usuario).trim().toUpperCase();
    const nombre = texto(req.body?.nombre).trim().toUpperCase();
    const rol = texto(req.body?.rol) as Rol;
    if (!/^[A-Z0-9._-]{2,30}$/.test(usuario)) return res.status(400).json({ error: 'Usuario: de 2 a 30 letras sin espacios' });
    if (!nombre) return res.status(400).json({ error: 'Escribe el nombre' });
    if (!['comercial', 'admin'].includes(rol)) return res.status(400).json({ error: 'Rol no válido' });
    const [existe] = await db.query('SELECT 1 FROM usuarios WHERE lower(usuario) = lower(?1)', [usuario]);
    if (existe) return res.status(400).json({ error: `Ya hay un usuario ${usuario}` });
    const clave = generarClave();
    const [{ id }] = await db.query<{ id: number }>(
      'INSERT INTO usuarios (usuario, nombre, rol, clave_hash) VALUES (?1, ?2, ?3, ?4) RETURNING id',
      [usuario, nombre, rol, await hashClave(clave)]);
    res.json({ id, clave });
  }));

  // Genera una contraseña nueva; se enseña una sola vez y obliga a cambiarla al entrar
  app.post('/api/admin/usuarios/:id/clave', asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    const clave = generarClave();
    const r = await db.query('UPDATE usuarios SET clave_hash = ?2, clave_inicial = true WHERE id = ?1 RETURNING id',
      [id, await hashClave(clave)]);
    if (!r.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    await db.query('DELETE FROM sesiones WHERE usuario_id = ?1', [id]);
    res.json({ clave });
  }));

  app.post('/api/admin/usuarios/:id', asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    if (id === req.ctx!.real.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol ni desactivarte' });
    const rol = req.body?.rol as Rol | undefined;
    const activo = req.body?.activo as boolean | undefined;
    if (rol !== undefined && !['comercial', 'admin'].includes(rol)) return res.status(400).json({ error: 'Rol no válido' });
    const r = await db.query(`UPDATE usuarios SET rol = coalesce(?2, rol), activo = coalesce(?3, activo) WHERE id = ?1 RETURNING id`,
      [id, rol ?? null, typeof activo === 'boolean' ? activo : null]);
    if (!r.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (activo === false) await db.query('DELETE FROM sesiones WHERE usuario_id = ?1', [id]);
    res.json({ ok: true });
  }));

  // Perdió el móvil y los códigos de recuperación: en su próxima entrada dará de alta la aplicación otra vez
  app.post('/api/admin/usuarios/:id/doble-factor/restablecer', asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    const [u] = await db.query<{ id: number; usuario: string }>('SELECT id, usuario FROM usuarios WHERE id = ?1', [id]);
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    await db.transaction(async (tx) => {
      await tx.query('UPDATE usuarios SET totp_secreto = NULL, totp_activado_en = NULL, totp_ultimo_paso = NULL WHERE id = ?1', [u.id]);
      await tx.query('DELETE FROM codigos_recuperacion WHERE usuario_id = ?1', [u.id]);
      await tx.query('DELETE FROM sesiones WHERE usuario_id = ?1', [u.id]);
      await registrar(tx, req, 'doble_factor_restablecido', { usuarioId: u.id, usuario: u.usuario, adminId: req.ctx!.real.id });
    });
    res.json({ ok: true });
  }));

  app.get('/api/admin/accesos', asincrono(async (req, res) => {
    res.json(await admin.accesos(db, { usuario: texto(req.query.usuario).trim(), evento: texto(req.query.evento) }));
  }));

  // «Entrar como» un comercial: la sesión sigue siendo del administrador, pero actúa en su nombre. Vale para cualquiera
  // que lleve clientes (un administrador también puede ser comercial), salvo uno mismo.
  app.post('/api/admin/usuarios/:id/entrar', asincrono(async (req, res) => {
    const id = idValido(req.params.id);
    if (id === req.ctx!.real.id) return res.status(400).json({ error: 'Para ver tus propios clientes usa «Mis clientes»' });
    const [u] = await db.query<{ id: number }>(
      `SELECT id FROM usuarios u WHERE id = ?1 AND activo AND EXISTS (SELECT 1 FROM asignaciones a WHERE a.usuario_id = u.id)`, [id]);
    if (!u) return res.status(404).json({ error: 'Ese usuario no lleva ningún cliente en la campaña' });
    await db.query('UPDATE sesiones SET como_id = ?2 WHERE id = ?1', [req.ctx!.sesionId, u.id]);
    res.json({ ok: true });
  }));

  app.get('/api/admin/excel', asincrono(async (_req, res) => {
    // Se genera con los datos de este momento y se descarga en el equipo; el servidor no guarda copia ni la cachea
    const { buffer, nombre } = await excel(db);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(buffer);
  }));

  // Foto HTML autocontenida del avance: ?descargar=1 la descarga; sin él, se abre en una pestaña
  app.get('/api/admin/foto', asincrono(async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.descargar === '1') res.setHeader('Content-Disposition', `attachment; filename="${nombreFoto()}"`);
    res.send(await foto(db));
  }));

  // ── Carga de la campaña desde Excel ──

  app.get('/api/admin/importar/plantilla', asincrono(async (_req, res) => {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="PLANTILLA_CONTACTOS.xlsx"');
    res.send(await plantilla(db));
  }));

  const ficheroDe = (req: Request) => {
    const b64 = texto(req.body?.fichero);
    if (!b64) throw new ErrorFlujo('Falta el fichero');
    return Buffer.from(b64, 'base64');
  };

  app.post('/api/admin/importar/previsualizar', asincrono(async (req, res) => {
    res.json(await previsualizar(db, ficheroDe(req)));
  }));

  app.post('/api/admin/importar', asincrono(async (req, res) => {
    res.json(await importar(db, ficheroDe(req)));
  }));

  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Ruta no encontrada' }); });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ErrorFlujo) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  });

  return app;
};
