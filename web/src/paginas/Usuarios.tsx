import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Actividad, Rol, Tablero, UsuarioAdmin } from '../../../shared/tipos';
import { ACCION_TEXTO } from '../../../shared/tipos';
import { api } from '../api';
import { Icono } from '../components/Icono';
import { Ventana } from '../components/Ventana';
import { LineaTiempo } from '../components/VentanaFicha';
import { fmtFecha, inicialesComercial, normalizar, num } from '../util';

type Modo = 'con' | 'sin' | 'todos' | 'clave' | 'admin';

/** Conexión: verde si hizo algo en los últimos 5 minutos, ámbar hasta 15 */
const conexion = (u: UsuarioAdmin) => (u.minutosInactivo === null ? null : u.minutosInactivo <= 5 ? 'conectado' : u.minutosInactivo <= 15 ? 'inactivo' : null);

export const Usuarios = ({ alEntrarComo }: { alEntrarComo: () => void }) => {
  const [lista, setLista] = useState<UsuarioAdmin[] | null>(null);
  const [tablero, setTablero] = useState<Tablero | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string; clave?: string } | null>(null);
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<Modo>('con');
  const [nuevo, setNuevo] = useState(false);
  const [historial, setHistorial] = useState<UsuarioAdmin | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  const cargar = useCallback(() => {
    api.usuarios().then(setLista).catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
    api.tablero().then(setTablero).catch(() => {});
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Ctrl+K lleva el cursor al buscador
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); buscador.current?.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      const r = await fn();
      const clave = (r as { clave?: string })?.clave;
      setAviso({ tipo: 'ok', texto: ok, clave });
      cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    }
  };

  const todos = lista ?? [];
  const filtro: Record<Modo, (u: UsuarioAdmin) => boolean> = {
    con: (u) => u.esComercial,
    sin: (u) => !u.esComercial && u.rol !== 'admin',
    todos: () => true,
    clave: (u) => u.claveInicial,
    admin: (u) => u.rol === 'admin',
  };
  const visibles = useMemo(() => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    return todos.filter((u) => filtro[modo](u) && palabras.every((p) => normalizar(`${u.nombre} ${u.usuario} ${u.codigo ?? ''}`).includes(p)));
  }, [todos, texto, modo]); // eslint-disable-line react-hooks/exhaustive-deps

  const caja = (m: Modo, clase: string, etiqueta: string, ico: Parameters<typeof Icono>[0]['n'], sub: string) => (
    <a href="#" className={`kpi ${clase}` + (modo === m ? ' activa' : '')} onClick={(e) => { e.preventDefault(); setModo(m); }}>
      <div><div className="etiqueta">{etiqueta}</div><div className="cifra">{num(todos.filter(filtro[m]).length)}</div><div className="sub">{sub}</div></div>
      <span className="ico"><Icono n={ico} /></span>
    </a>
  );
  const pildora = (m: Modo, t: string) => (
    <button type="button" className={'pildora' + (modo === m ? ' activa' : '')} onClick={() => setModo(m)}>{t} <b>{num(todos.filter(filtro[m]).length)}</b></button>
  );

  return (
    <>
      <div className="cabecera-pagina">
        <div><h2>Usuarios</h2></div>
        <div className="botones compactos">
          <div className={'buscador instantaneo' + (texto ? ' con-texto' : '')} style={{ margin: 0 }}>
            <div className="campo">
              <span className="lupa">🔍</span>
              <input ref={buscador} type="search" placeholder="Nombre, usuario o código… (Ctrl+K)" value={texto} onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setTexto(''); } }} />
              <button type="button" className="limpiar" title="Borrar" onClick={() => setTexto('')}>✕</button>
            </div>
            <span className="contador-filtro">{visibles.length} de {todos.length}</span>
          </div>
          <button type="button" className="btn btn-accion neutro" onClick={() => setNuevo(!nuevo)}>
            <span className="ico"><Icono n="mas" /></span>Nuevo usuario
          </button>
          <Link className="btn btn-accion neutro" to="/accesos" title="Registro de entradas, fallos y cambios de seguridad">
            <span className="ico"><Icono n="escudo" /></span>Accesos
          </Link>
          <Link className="btn btn-accion neutro" to="/cargar" title="Cargar la campaña desde un Excel">
            <span className="ico"><Icono n="subir" /></span>Cargar datos
          </Link>
        </div>
      </div>

      <div className="kpis cinco">
        {caja('todos', 'c-carbon', 'Usuarios', 'contactos', 'pueden entrar')}
        {caja('con', 'c-verde', 'Con clientes', 'cliente', 'tienen contactos que revisar')}
        {caja('sin', 'c-ambar', 'Sin clientes', 'sinEntrar', 'nada que revisar')}
        {caja('clave', 'c-rojo', 'Clave inicial', 'llave', 'aún no la han cambiado')}
        {caja('admin', 'c-azul', 'Administradores', 'escudo', 'gestionan la campaña')}
      </div>

      {tablero && (
        <section className="tarjeta tablero">
          <div className="bloque-cab"><h3>Ahora en la aplicación</h3>
            <span>se actualiza al entrar en la pantalla · <span className="punto-con conectado" /> activo en los últimos 5 min · <span className="punto-con inactivo" /> inactivo hasta 15 min</span></div>
          <div className="tablero-fila">
            <div><b className="tablero-cifra">{tablero.conectados}</b> conectados ahora{tablero.inactivos > 0 && <> · {tablero.inactivos} inactivos</>}</div>
            <div><b className="tablero-cifra">{tablero.entradasHoy}</b> han entrado hoy</div>
            <div className="tablero-acciones">
              <span className="etiqueta">Hoy se ha hecho</span>
              {tablero.accionesHoy.length ? tablero.accionesHoy.map((a) => (
                <span key={a.accion} className="chip">{num(a.n)} · {ACCION_TEXTO[a.accion] ?? a.accion}</span>
              )) : <span className="atenuado pequeno">nada todavía</span>}
            </div>
          </div>
        </section>
      )}

      {nuevo && <NuevoUsuario onCreado={(clave, usuario) => { setNuevo(false); setAviso({ tipo: 'ok', texto: `Usuario ${usuario} creado.`, clave }); cargar(); }} />}

      {aviso && (
        <div className={`aviso ${aviso.tipo}`}>
          {aviso.texto}
          {aviso.clave && <> Contraseña nueva: <b className="mono" style={{ fontSize: '1rem' }}>{aviso.clave}</b> — apúntala y dásela al comercial; no se
            volverá a mostrar y tendrá que cambiarla al entrar.</>}
        </div>
      )}

      <section className="tarjeta">
        <div className="bloque-cab"><h3>Lista de usuarios</h3><span>un clic en un nombre abre lo que ha hecho</span></div>
        <div className="pildoras" style={{ marginBottom: 12 }}>{pildora('con', 'Con clientes')}{pildora('sin', 'Sin clientes')}{pildora('todos', 'Todos')}</div>
        <div className="scroll">
          <table className="tabla tabla-movil" id="tabla-usuarios">
            <thead>
              <tr><th>Nombre</th><th>Usuario</th><th>Código</th><th>Rol</th><th>Conexión</th><th className="num">Contactos</th>
                <th className="acciones">Acciones</th></tr>
            </thead>
            <tbody>
              {visibles.map((u) => {
                const con = conexion(u);
                return (
                  <tr key={u.id} className={u.ultimaEntrada ? undefined : 'sin-entrar'} style={u.activo ? undefined : { opacity: 0.55 }}>
                    <td data-label="Nombre" className="nombre"><a href="#" className="com-nombre cel-clic" onClick={(e) => { e.preventDefault(); setHistorial(u); }}>
                      <span className={'avatar-mini' + (u.rol === 'admin' ? ' admin' : '')}>{inicialesComercial(u.nombre)}</span><span>{u.nombre}</span>
                    </a></td>
                    <td data-label="Usuario" className="mono">{u.usuario}</td>
                    <td data-label="Código" className="mono">{u.codigo ?? ''}</td>
                    <td data-label="Rol" className="rol">
                      {u.rol === 'admin' && <span className="chip rol-admin">ADMIN</span>}
                      {u.esComercial && <span className="chip">COMERCIAL</span>}
                      {u.claveInicial && <span className="chip clave-inicial">CLAVE INICIAL</span>}
                      {!u.esComercial && <span className="chip admin">SIN CLIENTES</span>}
                      {!u.tieneClave && <span className="chip suave">sin contraseña</span>}
                      {u.dobleFactor ? <span className="chip acceso-ok" title="Tiene configurada la aplicación de autenticación">2 pasos</span>
                        : u.tieneClave && <span className="chip suave" title="La configurará en su próxima entrada">sin 2 pasos</span>}
                      {!u.activo && <span className="chip suave">inactivo</span>}
                    </td>
                    <td data-label="Conexión" className="pequeno">
                      {con && <div><span className={`punto-con ${con}`} /><b className={con}>{con === 'conectado' ? 'CONECTADO' : 'INACTIVO'}</b></div>}
                      {u.ultimaEntrada ? <span className="atenuado">{fmtFecha(u.ultimaEntrada)}</span> : <span className="chip prop-rechazada">nunca</span>}
                    </td>
                    <td data-label="Revisados" className="num">{num(u.revisados)} / {num(u.contactos)}</td>
                    <td data-label="Acciones" className="acciones">
                      {u.esComercial && u.activo ? (
                        <button type="button" className="btn btn-accion entrar mini" title="Abre la aplicación tal como la ve este comercial, sin su contraseña"
                          onClick={() => api.entrarComo(u.id).then(alEntrarComo).catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }))}>
                          <span className="ico"><Icono n="entrar" /></span>Entrar como
                        </button>
                      ) : <span className="hueco" />}
                      <button type="button" className="btn btn-accion clave mini" title="Genera una contraseña nueva al azar; se muestra una sola vez"
                        onClick={() => window.confirm(`¿Generar una contraseña nueva para ${u.nombre}? La anterior dejará de valer.`)
                          && accion(() => api.nuevaClave(u.id), `Contraseña nueva para ${u.usuario}.`)}>
                        <span className="ico"><Icono n="llave" /></span>Contraseña
                      </button>
                      <button type="button" className="btn btn-accion hacer-admin mini"
                        onClick={() => window.confirm(u.rol === 'admin' ? `¿Quitar a ${u.nombre} de administrador?` : `¿Hacer administrador a ${u.nombre}? Verá y decidirá todo.`)
                          && accion(() => api.cambiarUsuario(u.id, { rol: (u.rol === 'admin' ? 'comercial' : 'admin') as Rol }), `${u.usuario}: rol cambiado.`)}>
                        <span className="ico"><Icono n="escudo" /></span>{u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                      </button>
                      {u.dobleFactor && (
                        <button type="button" className="btn btn-accion clave mini" title="Ha perdido el móvil: configurará la aplicación otra vez al entrar"
                          onClick={() => window.confirm(`¿Restablecer la verificación en dos pasos de ${u.nombre}? Su aplicación y sus códigos de recuperación dejarán de valer, se cerrarán sus sesiones y la configurará de nuevo en su próxima entrada.\n\nHazlo solo si has comprobado que te lo pide él.`)
                            && accion(() => api.restablecerDobleFactor(u.id), `${u.usuario}: verificación en dos pasos restablecida.`)}>
                          <span className="ico"><Icono n="escudo" /></span>Restablecer 2 pasos
                        </button>
                      )}
                      <button type="button" className="btn btn-accion rechazar mini"
                        onClick={() => window.confirm(u.activo ? `¿Desactivar a ${u.nombre}? No podrá entrar.` : `¿Reactivar a ${u.nombre}?`)
                          && accion(() => api.cambiarUsuario(u.id, { activo: !u.activo }), `${u.usuario}: ${u.activo ? 'desactivado' : 'reactivado'}.`)}>
                        <span className="ico"><Icono n={u.activo ? 'cerrar' : 'check'} /></span>{u.activo ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {lista && !visibles.length && <tr><td colSpan={7} className="atenuado">Ningún usuario con ese filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {historial && <VentanaActividad u={historial} onCerrar={() => setHistorial(null)} />}
    </>
  );
};

/** Lo que ha hecho un usuario: en su nombre o, si es administrador, entrando como un comercial */
const VentanaActividad = ({ u, onCerrar }: { u: UsuarioAdmin; onCerrar: () => void }) => {
  const [lista, setLista] = useState<Actividad[] | null>(null);
  useEffect(() => { api.actividadUsuario(u.id).then(setLista).catch(() => setLista([])); }, [u.id]);
  return (
    <Ventana titulo={`Lo que ha hecho ${u.nombre}`} sub={`${u.usuario} · última entrada ${u.ultimaEntrada ? fmtFecha(u.ultimaEntrada) : 'nunca'} · ${num(u.revisados)} de ${num(u.contactos)} contactos revisados`}
      icono={<span className="avatar-contacto">{inicialesComercial(u.nombre)}</span>} onCerrar={onCerrar}>
      {lista ? <LineaTiempo actividad={lista} conContacto /> : <p className="atenuado">Cargando…</p>}
    </Ventana>
  );
};

const NuevoUsuario = ({ onCreado }: { onCreado: (clave: string, usuario: string) => void }) => {
  const [usuario, setUsuario] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('comercial');
  const [error, setError] = useState<string | null>(null);
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    try {
      const r = await api.crearUsuario({ usuario, nombre, rol });
      onCreado(r.clave, usuario.toUpperCase());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <form className="tarjeta formulario alta" onSubmit={enviar}>
      <div className="titulo-form"><h2>Nuevo usuario</h2></div>
      {error && <div className="aviso error">{error}</div>}
      <div className="fila-form">
        <div>
          <label className="etiqueta" htmlFor="n-usuario">Usuario</label>
          <input id="n-usuario" required value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="JPEREZ" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="n-rol">Rol</label>
          <select id="n-rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            <option value="comercial">Comercial</option><option value="admin">Administrador</option>
          </select>
        </div>
      </div>
      <label className="etiqueta" htmlFor="n-nombre">Nombre</label>
      <input id="n-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="PEREZ GARCIA, JUAN" />
      <div className="ayuda-campo">Los clientes se asignan a los comerciales al cargar la campaña; un usuario nuevo empieza sin clientes.</div>
      <div className="botones">
        <button type="submit" className="btn btn-accion guardar"><span className="ico"><Icono n="check" /></span>Crear y generar contraseña</button>
      </div>
    </form>
  );
};
