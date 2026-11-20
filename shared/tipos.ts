// Contrato entre la API (server) y la interfaz (web). Lo importan los dos lados.

export type Estado = 'pendiente' | 'ok' | 'modificado' | 'baja' | 'conflicto';
export type TipoPropuesta = 'alta' | 'modificacion' | 'baja';
export type EstadoPropuesta = 'pendiente' | 'aprobada' | 'rechazada' | 'superada' | 'anulada';
export type Familia = 'postventa' | 'venta';
export type IconoUnidad = 'maquinas' | 'marinos' | 'terrestres';

export const ESTADOS: Estado[] = ['pendiente', 'ok', 'modificado', 'baja', 'conflicto'];

export const ESTADO_TEXTO: Record<Estado, string> = {
  pendiente: 'Pendiente',
  ok: 'OK',
  modificado: 'Modificado',
  baja: 'Baja',
  conflicto: 'En conflicto',
};

export const ESTADOS_PROPUESTA: EstadoPropuesta[] = ['pendiente', 'aprobada', 'rechazada', 'superada', 'anulada'];

export const ESTADO_PROPUESTA_TEXTO: Record<EstadoPropuesta, string> = {
  pendiente: 'Pendientes',
  aprobada: 'Aprobadas',
  rechazada: 'Rechazadas',
  superada: 'Superadas',
  anulada: 'Anuladas',
};

export interface Unidad {
  codigo: string;
  texto: string;
  familia: Familia;
  icono: IconoUnidad;
}

/** Cifras de un comercial en una unidad: t = contactos, r = revisados, p = propuestas pendientes */
export interface Cifras {
  t: number;
  r: number;
  p: number;
}

export interface ComercialAvance {
  id: number;
  nombre: string;
  usuario: string;
  ultimaEntrada: string | null;
  /** Clave '' = todas las unidades; el resto, el código de la unidad */
  porUnidad: Record<string, Cifras>;
}

export interface Avance {
  generadoEn: string;
  kpis: {
    contactos: number;
    revisados: number;
    /** Sin las que están en conflicto, que tienen su propio contador */
    propuestasPendientes: number;
    conflictos: number;
    comercialesSinEntrar: number;
    comerciales: number;
  };
  estados: Record<Estado, number>;
  aprobados: Record<TipoPropuesta, number>;
  /** Contactos marcados para cada encuesta de satisfacción */
  encuestas: { ventas: number; postventa: number };
  /** Email y móvil: justificados (no tiene, con motivo) y los que aún faltan por completar */
  datos: { sinEmail: number; sinMovil: number; falta: number };
  unidades: Unidad[];
  comerciales: ComercialAvance[];
}

/** Configuración de la campaña (rueda dentada del administrador) */
export interface Config {
  /** Texto libre; vacío = no se muestra */
  fechaLimite: string;
  /** Cómo salen en el Excel los emails y teléfonos vacíos */
  vaciosExportacion: '#' | '';
}

/** Una fila de la ventana de listado */
export interface FilaContacto {
  id: number;
  cliente: string;
  localidad: string;
  nombre: string;
  apellido: string;
  desc_funcion: string;
  email: string;
  tel_contacto: string;
  telefono: string;
  estado: Estado;
  es_alta: boolean;
  validado_por: string;
  pendientes: number;
  enc_ventas: boolean;
  enc_postventa: boolean;
  /** Unidad(es) en texto: una en el listado de un comercial, varias unidas por « · » en el global */
  unidad: string;
  unidad_texto: string;
  /** Solo en el listado global: comerciales que lo ven, unidos por « · » */
  comerciales?: string;
}

export interface Listado {
  global: boolean;
  filas: FilaContacto[];
  comercial?: { id: number; nombre: string; usuario: string };
  unidad?: string;
}

/** Criterios del listado de toda la campaña */
export type CriterioGlobal =
  | { estado: Estado }
  | { aprobado: TipoPropuesta }
  | { encuesta: 'ventas' | 'postventa' }
  | { datos: 'sin_email' | 'sin_movil' | 'falta' };

export interface Propuesta {
  id: number;
  tipo: TipoPropuesta;
  estado: EstadoPropuesta;
  comercial: string;
  admin: string | null;
  /** Quién la aprobó o rechazó */
  resuelto_por: string | null;
  en_conflicto: boolean;
  /** El cambio ya se ve en los datos (las correcciones en conflicto no se aplican hasta que decide el administrador) */
  aplicada: boolean;
  motivo: string;
  comentario: string;
  creado_en: string;
  resuelto_en: string | null;
  /** [campo, antes, después] */
  diff: [string, string, string][];
}

export interface Actividad {
  id: number;
  fecha: string;
  contacto_id: number | null;
  contacto: string;
  /** En cuyo nombre se hizo */
  usuario: string | null;
  /** Administrador que lo hizo entrando como el comercial */
  admin: string | null;
  accion: string;
  detalle: string;
}

export interface Ficha {
  id: number;
  num_contacto: string | null;
  cliente: string;
  localidad: string;
  provincia: string;
  pagador: string;
  solicitante: string;
  nombre: string;
  apellido: string;
  desc_dpto: string;
  desc_funcion: string;
  cod_dpto: string;
  cod_funcion: string;
  email: string;
  tel_contacto: string;
  telefono: string;
  tel_adicionales: string[];
  estado: Estado;
  es_alta: boolean;
  validado_por: string | null;
  validado_admin: string | null;
  validado_en: string | null;
  enc_ventas: boolean;
  enc_postventa: boolean;
  sin_email: boolean;
  motivo_sin_email: string;
  sin_movil: boolean;
  motivo_sin_movil: string;
  ven: { comercial: string; unidad: string; unidad_texto: string }[];
  propuestas: Propuesta[];
  actividad: Actividad[];
}

// ── Sesión ──

export type Rol = 'comercial' | 'admin';

export interface Sesion {
  paso: 'completa';
  id: number;
  nombre: string;
  usuario: string;
  rol: Rol;
  /** Tiene la contraseña que generó el administrador: debe cambiarla */
  claveInicial: boolean;
  /** Lleva clientes en la campaña (un administrador también puede ser comercial) */
  esComercial: boolean;
  /** Comercial en cuyo nombre actúa un administrador («entrar como») */
  como: { id: number; nombre: string; usuario: string } | null;
}

/** Contraseña correcta; falta el código de la aplicación de autenticación */
export interface SesionPendiente {
  paso: 'segundo_factor';
  usuario: string;
  nombre: string;
  /** Aún no ha dado de alta la aplicación: hay que hacerlo ahora */
  alta: boolean;
  /** Códigos que aún puede fallar antes de tener que volver a escribir la contraseña */
  intentosRestantes: number;
}

export interface AltaDobleFactor {
  /** Código QR en SVG con la dirección otpauth:// */
  qr: string;
  /** El mismo secreto, en grupos de 4, para teclearlo si no se puede leer el QR */
  secreto: string;
}

export type EventoAcceso =
  | 'clave_correcta' | 'clave_incorrecta' | 'bloqueado' | 'codigo_incorrecto' | 'acceso_concedido'
  | 'codigo_recuperacion_usado' | 'doble_factor_activado' | 'doble_factor_restablecido' | 'clave_cambiada' | 'sesion_cerrada';

export const EVENTO_TEXTO: Record<EventoAcceso, string> = {
  clave_correcta: 'Contraseña correcta',
  clave_incorrecta: 'Contraseña incorrecta',
  bloqueado: 'Bloqueado por intentos',
  codigo_incorrecto: 'Código incorrecto',
  acceso_concedido: 'Acceso concedido',
  codigo_recuperacion_usado: 'Código de recuperación usado',
  doble_factor_activado: 'Verificación en dos pasos activada',
  doble_factor_restablecido: 'Verificación en dos pasos restablecida',
  clave_cambiada: 'Contraseña cambiada',
  sesion_cerrada: 'Sesión cerrada',
};

export interface Acceso {
  id: number;
  fecha: string;
  usuario: string;
  nombre: string | null;
  evento: EventoAcceso;
  ip: string;
  agente: string;
  admin: string | null;
}

// ── Datos editables de un contacto ──

export type CampoContacto =
  | 'nombre' | 'apellido' | 'desc_dpto' | 'desc_funcion' | 'email' | 'tel_contacto' | 'telefono'
  | 'tel_ad1' | 'tel_ad2' | 'tel_ad3' | 'tel_ad4' | 'tel_ad5';

/** Campos que puede proponer un comercial, con la etiqueta que se guarda en el diff de la propuesta */
export const CAMPOS: { k: CampoContacto; t: string }[] = [
  { k: 'nombre', t: 'Nombre' },
  { k: 'apellido', t: 'Apellido' },
  { k: 'desc_dpto', t: 'Departamento' },
  { k: 'desc_funcion', t: 'Función' },
  { k: 'email', t: 'Email' },
  { k: 'telefono', t: 'Teléfono centralita (cliente)' },
  { k: 'tel_contacto', t: 'Móvil/directo de la persona' },
  { k: 'tel_ad1', t: 'Teléfono adicional 1' },
  { k: 'tel_ad2', t: 'Teléfono adicional 2' },
  { k: 'tel_ad3', t: 'Teléfono adicional 3' },
  { k: 'tel_ad4', t: 'Teléfono adicional 4' },
  { k: 'tel_ad5', t: 'Teléfono adicional 5' },
];

export const TELEFONOS: CampoContacto[] = ['tel_contacto', 'telefono', 'tel_ad1', 'tel_ad2', 'tel_ad3', 'tel_ad4', 'tel_ad5'];

export type DatosContacto = Record<CampoContacto, string>;

// ── Reglas de los datos (las mismas en la interfaz y en la API) ──

/** Solo cifras, espacios y el signo + */
export const telefonoValido = (t: string) => /^\+?[\d ]+$/.test(t.trim()) && /\d/.test(t);

/** Un móvil: 9 cifras que empiezan por 6 o 7 (admite el prefijo +34 o 0034 y espacios) */
export const esMovil = (t: string) => /^[67]\d{8}$/.test(t.replace(/\s+/g, '').replace(/^(\+34|0034)/, ''));

export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Tiene algún móvil en cualquiera de sus teléfonos */
export const tieneMovil = (d: Pick<DatosContacto, CampoContacto>) => TELEFONOS.some((k) => esMovil(d[k] ?? ''));

/** Le falta el email o un móvil sin haber justificado que no lo tiene */
export const faltanDatos = (c: DatosContacto & { sin_email: boolean; sin_movil: boolean }) => ({
  email: !c.email.trim() && !c.sin_email,
  movil: !tieneMovil(c) && !c.sin_movil,
});

/** Tabla oficial de departamentos y funciones, con sus códigos */
export interface Catalogo {
  departamentos: { nombre: string; codigo: string | null; funciones: { nombre: string; codigo: string | null }[] }[];
}

/** Lo que acompaña a un alta o a una modificación y se guarda al momento, sin aprobación */
export interface Extras {
  /** Motivo de que no tenga email; null = sí lo tiene (se quita la marca); undefined = no se toca */
  sinEmail?: string | null;
  sinMovil?: string | null;
  encuestas?: { ventas: boolean; postventa: boolean };
}

/** Contacto del mismo cliente que coincide en email o teléfono con un alta */
export interface Duplicado {
  id: number;
  nombre: string;
  apellido: string;
  desc_funcion: string;
  email: string;
  telefonos: string;
}

// ── Pantallas del comercial ──

/** Un cliente en una unidad de negocio: si se lleva por dos unidades, son dos líneas */
export interface ClienteResumen {
  clave: string;
  cliente: string;
  localidad: string;
  provincia: string;
  pagador: string;
  solicitante: string;
  unidad: string;
  /** Facturación del listado de la campaña; null si el cliente no está en él */
  facturacion: number | null;
  total: number;
  revisados: number;
  /** Mis propuestas aún sin decidir */
  pendientes: number;
}

export interface MisClientes {
  unidades: Unidad[];
  clientes: ClienteResumen[];
}

export interface ContactoComercial extends DatosContacto {
  id: number;
  num_contacto: string | null;
  estado: Estado;
  es_alta: boolean;
  validado_por: string | null;
  /** Lo validó el propio comercial (si lo validó otro, «Modificar» pasa a ser «Corregir») */
  validado_por_mi: boolean;
  validado_admin: string | null;
  validado_en: string | null;
  enc_ventas: boolean;
  enc_postventa: boolean;
  sin_email: boolean;
  motivo_sin_email: string;
  sin_movil: boolean;
  motivo_sin_movil: string;
  /** Mi última propuesta sobre este contacto (pendiente o ya decidida), si la hay */
  mi_propuesta: Propuesta | null;
  /** Por qué no se puede tocar (baja ya aprobada), o null */
  bloqueado: string | null;
}

export interface ClienteDetalle {
  cliente: ClienteResumen;
  unidad: Unidad;
  /** Otros comerciales que llevan este cliente */
  companeros: string[];
  /** Centralita habitual del cliente, para el alta */
  centralita: string;
  contactos: ContactoComercial[];
}

// ── Administración ──

export interface PropuestaAdmin extends Propuesta {
  contacto_id: number;
  contacto: string;
  num_contacto: string | null;
  cliente: string;
  localidad: string;
  unidad_texto: string;
  estado_contacto: Estado;
  cod_dpto: string;
  cod_funcion: string;
}

export interface Conflicto {
  contacto_id: number;
  contacto: string;
  num_contacto: string | null;
  desc_funcion: string;
  cliente: string;
  localidad: string;
  /** Quién validó lo que hay ahora */
  validado_por: string | null;
  validado_en: string | null;
  /** Los datos que hay ahora */
  datos: DatosContacto;
  /** Propuestas enfrentadas, sin aplicar */
  propuestas: Propuesta[];
  /** Los datos al empezar la campaña (o al darse de alta): el «antes» del primer cambio de cada campo */
  inicial: DatosContacto;
  /** Todas las propuestas del contacto, de la más antigua a la más reciente (incluidas las enfrentadas) */
  historial: Propuesta[];
  /** Validaciones OK, justificaciones de datos que faltan y resoluciones a mano (lo que no queda como propuesta) */
  actividad: Actividad[];
}

export interface UsuarioAdmin {
  id: number;
  usuario: string;
  codigo: string | null;
  nombre: string;
  rol: Rol;
  /** Figura como comercial de algún cliente en la campaña */
  esComercial: boolean;
  activo: boolean;
  tieneClave: boolean;
  claveInicial: boolean;
  /** Ha dado de alta la aplicación de autenticación */
  dobleFactor: boolean;
  ultimaEntrada: string | null;
  ultimaActividad: string | null;
  /** Minutos desde su última petición (null = nunca) */
  minutosInactivo: number | null;
  contactos: number;
  revisados: number;
}

/** «Ahora en la aplicación»: tablero del día */
export interface Tablero {
  conectados: number;
  inactivos: number;
  entradasHoy: number;
  accionesHoy: { accion: string; n: number }[];
}

export interface Contadores {
  /** Sin contar las que están en conflicto: esas tienen su propio contador */
  propuestasPendientes: number;
  conflictos: number;
}

/** Texto de cada acción del registro de actividad */
export const ACCION_TEXTO: Record<string, string> = {
  ok: 'marcó OK',
  modificacion: 'modificó',
  correccion: 'corrigió (en conflicto)',
  baja: 'pidió la baja',
  baja_conflicto: 'pidió la baja (en conflicto)',
  alta: 'dio de alta',
  deshacer: 'deshizo su propuesta',
  encuesta: 'cambió las encuestas',
  sin_datos: 'justificó que falta un dato',
  aprobar: 'aprobó',
  rechazar: 'rechazó',
  resolver: 'resolvió el conflicto a mano',
};
