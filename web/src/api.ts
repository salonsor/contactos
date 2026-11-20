import type {
  Acceso, Actividad, AltaDobleFactor, Avance, Catalogo, ClienteDetalle, Config, Conflicto, Contadores, DatosContacto, Duplicado, Estado,
  Extras, Ficha, Listado, MisClientes, PropuestaAdmin, Rol, Sesion, SesionPendiente, Tablero, TipoPropuesta, UsuarioAdmin,
} from '../../shared/tipos';

/** Qué listado se abre en la ventana de detalle */
export type Consulta =
  | { de: 'comercial'; id: number; filtro: 'todos' | 'revisados' | 'pendientes'; unidad: string }
  | { de: 'estado'; estado: Estado }
  | { de: 'aprobado'; tipo: TipoPropuesta }
  | { de: 'encuesta'; tipo: 'ventas' | 'postventa' }
  | { de: 'datos'; tipo: 'sin_email' | 'sin_movil' | 'falta' };

/** Resumen de un Excel de carga (vista previa y resultado) */
export interface ResumenCarga {
  hoja: string;
  filaCabecera: number;
  reconocidas: { columna: string; campo: string }[];
  ignoradas: string[];
  filas: number;
  errores: { fila: number; motivo: string }[];
  contactos: number;
  asignaciones: number;
  clientes: number;
  comerciales: number;
  comercialesNuevos: string[];
  porUnidad: { unidad: string; contactos: number }[];
  actual: { contactos: number; revisados: number; propuestas: number };
  conClaveDefecto: boolean;
}

export class ErrorApi extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// Si la sesión caduca, la aplicación vuelve a la pantalla de entrada
let alPerderSesion: () => void = () => {};
export const siSePierdeLaSesion = (fn: () => void) => { alPerderSesion = fn; };

const pedir = async <T>(url: string, cuerpo?: unknown): Promise<T> => {
  const r = await fetch(url, cuerpo === undefined
    ? { headers: { Accept: 'application/json' } }
    : { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    // El segundo factor gestiona su propia caducidad, para poder explicar al usuario qué ha pasado
    if (r.status === 401 && !/^\/api\/(login|sesion|2fa)/.test(url)) alPerderSesion();
    throw new ErrorApi(datos.error || `${r.status} ${r.statusText}`, r.status);
  }
  return datos as T;
};

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? '?' + s : '';
};

export const api = {
  // Sesión
  sesion: () => pedir<Sesion | SesionPendiente>('/api/sesion'),
  login: (usuario: string, clave: string) => pedir<{ ok: true; paso: 'segundo_factor'; alta: boolean }>('/api/login', { usuario, clave }),
  altaDobleFactor: () => pedir<AltaDobleFactor>('/api/2fa/alta', {}),
  confirmarAlta: (codigo: string) => pedir<{ ok: true; codigos: string[] }>('/api/2fa/alta/confirmar', { codigo }),
  verificarCodigo: (codigo: string) => pedir<{ ok: true; codigosRestantes?: number }>('/api/2fa/verificar', { codigo }),
  logout: () => pedir<{ ok: true }>('/api/logout', {}),
  cambiarClave: (actual: string, nueva: string) => pedir<{ ok: true }>('/api/sesion/clave', { actual, nueva }),
  dejarComo: () => pedir<{ ok: true }>('/api/sesion/dejar-como', {}),
  catalogo: () => pedir<Catalogo>('/api/catalogo'),
  config: () => pedir<Config>('/api/config'),

  // Comercial
  misClientes: () => pedir<MisClientes>('/api/mi/clientes'),
  cliente: (clave: string) => pedir<ClienteDetalle>('/api/mi/clientes/' + clave),
  marcarOk: (id: number) => pedir<{ estado: Estado }>(`/api/mi/contactos/${id}/ok`, {}),
  modificar: (id: number, datos: Partial<DatosContacto>, extras: Extras) =>
    pedir<{ estado: Estado }>(`/api/mi/contactos/${id}/modificar`, { datos, extras }),
  baja: (id: number, motivo: string) => pedir<{ estado: Estado }>(`/api/mi/contactos/${id}/baja`, { motivo }),
  encuesta: (id: number, tipo: 'ventas' | 'postventa', valor: boolean) =>
    pedir<{ estado: Estado }>(`/api/mi/contactos/${id}/encuesta`, { tipo, valor }),
  deshacer: (propuesta: number) => pedir<{ estado: string }>(`/api/mi/propuestas/${propuesta}/deshacer`, {}),
  alta: (clave: string, datos: Partial<DatosContacto>, extras: Extras, forzar = false) =>
    pedir<{ ok: true; id: number } | { ok: false; duplicados: Duplicado[] }>(`/api/mi/clientes/${clave}/alta`, { datos, extras, forzar }),

  // Administración
  avance: () => pedir<Avance>('/api/avance'),
  listado: (c: Consulta) => {
    if (c.de === 'estado') return pedir<Listado>('/api/contactos' + qs({ estado: c.estado }));
    if (c.de === 'aprobado') return pedir<Listado>('/api/contactos' + qs({ aprobado: c.tipo }));
    if (c.de === 'encuesta') return pedir<Listado>('/api/contactos' + qs({ encuesta: c.tipo }));
    if (c.de === 'datos') return pedir<Listado>('/api/contactos' + qs({ datos: c.tipo }));
    return pedir<Listado>(`/api/comerciales/${c.id}/contactos` + qs({ filtro: c.filtro, unidad: c.unidad }));
  },
  ficha: (id: number) => pedir<Ficha>('/api/contactos/' + id),
  contadores: () => pedir<Contadores>('/api/admin/contadores'),
  /** Filtros como listas separadas por comas; vacío = todos */
  propuestas: (f: { estado: string; tipo: string; comercial: string; conflicto?: 'no' }) =>
    pedir<PropuestaAdmin[]>('/api/admin/propuestas' + qs(f)),
  decidir: (ids: number[], accion: 'aprobar' | 'rechazar', comentario = '') =>
    pedir<{ hechas: number; errores: string[] }>('/api/admin/propuestas/decidir', { ids, accion, comentario }),
  conflictos: () => pedir<Conflicto[]>('/api/admin/conflictos'),
  resolverAMano: (id: number, datos: DatosContacto, comentario: string) =>
    pedir<{ estado: string }>(`/api/admin/conflictos/${id}/resolver`, { datos, comentario }),
  guardarConfig: (c: Partial<Config>) => pedir<Config>('/api/admin/config', c),
  usuarios: () => pedir<UsuarioAdmin[]>('/api/admin/usuarios'),
  tablero: () => pedir<Tablero>('/api/admin/tablero'),
  actividadUsuario: (id: number) => pedir<Actividad[]>(`/api/admin/usuarios/${id}/actividad`),
  crearUsuario: (u: { usuario: string; nombre: string; rol: Rol }) => pedir<{ id: number; clave: string }>('/api/admin/usuarios', u),
  nuevaClave: (id: number) => pedir<{ clave: string }>(`/api/admin/usuarios/${id}/clave`, {}),
  cambiarUsuario: (id: number, cambios: { rol?: Rol; activo?: boolean }) => pedir<{ ok: true }>(`/api/admin/usuarios/${id}`, cambios),
  entrarComo: (id: number) => pedir<{ ok: true }>(`/api/admin/usuarios/${id}/entrar`, {}),
  restablecerDobleFactor: (id: number) => pedir<{ ok: true }>(`/api/admin/usuarios/${id}/doble-factor/restablecer`, {}),
  accesos: (f: { usuario: string; evento: string }) => pedir<Acceso[]>('/api/admin/accesos' + qs(f)),
  previsualizarCarga: (fichero: string) => pedir<ResumenCarga>('/api/admin/importar/previsualizar', { fichero }),
  cargarExcel: (fichero: string) => pedir<ResumenCarga>('/api/admin/importar', { fichero }),
};
