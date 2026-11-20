import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, useLocation } from 'react-router';
import type { Config, Contadores, Sesion } from '../../../shared/tipos';
import { api } from '../api';
import { useEscCierra } from '../hooks';
import { diasHasta, inicialesComercial } from '../util';
import { Icono } from './Icono';

interface Props {
  sesion: Sesion;
  config: Config | null;
  alSalir: () => void;
  alAyuda: () => void;
  alCambiarConfig: (c: Config) => void;
}

/** Fecha límite de la campaña, con los días que quedan */
export const FechaLimite = ({ texto }: { texto: string }) => {
  if (!texto) return null;
  const dias = diasHasta(texto);
  return (
    <div className="fecha-limite" title="Día en que termina la campaña">
      <span className="fl-etiqueta">Fecha límite</span>
      <b>{texto}</b>
      {dias !== null && <span className="fl-dias">{dias < 0 ? `pasada hace ${-dias} d` : dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}</span>}
    </div>
  );
};

/** Menú lateral: marca, fecha límite, navegación según el rol y, abajo, quién está conectado, configuración y salir */
export const Cabecera = ({ sesion, config, alSalir, alAyuda, alCambiarConfig }: Props) => {
  const esAdmin = sesion.rol === 'admin' && !sesion.como;
  const [cont, setCont] = useState<Contadores | null>(null);
  const [rueda, setRueda] = useState(false);
  // En el móvil el menú va plegado bajo el botón ☰ para no ocupar la pantalla
  const [abierto, setAbierto] = useState(false);
  const { pathname } = useLocation();

  // Los contadores de la navegación se refrescan al cambiar de pantalla; el menú del móvil se cierra al navegar
  useEffect(() => {
    if (esAdmin) api.contadores().then(setCont).catch(() => {});
    setAbierto(false);
  }, [esAdmin, pathname]);

  const enlace = ({ isActive }: { isActive: boolean }) => (isActive ? 'activo' : undefined);
  const quien = sesion.como ?? sesion;
  const avisos = (cont?.propuestasPendientes ?? 0) + (cont?.conflictos ?? 0);

  return (
    <aside className={'lateral' + (abierto ? ' menu-abierto' : '')}>
      <div className="brand">
        <span className="brand-mark">C</span>
        <div className="brand-texto">
          <b>Contactos</b>
          <small>Depuración comercial</small>
        </div>
      </div>
      {config && <FechaLimite texto={config.fechaLimite} />}
      <button type="button" className="btn-menu" aria-expanded={abierto} aria-label={abierto ? 'Cerrar el menú' : 'Abrir el menú'}
        onClick={() => setAbierto(!abierto)}>
        <Icono n={abierto ? 'cerrar' : 'menu'} />
        {!abierto && avisos > 0 && <span className="contador rojo">{avisos}</span>}
      </button>
      <nav>
        {esAdmin ? (
          <>
            <div className="seccion-menu">Campaña</div>
            <NavLink to="/" end className={enlace}><Icono n="barras" />Avance</NavLink>
            <NavLink to="/propuestas" className={enlace}>
              <Icono n="bandeja" />Propuestas{!!cont?.propuestasPendientes && <span className="contador">{cont.propuestasPendientes}</span>}
            </NavLink>
            <NavLink to="/conflictos" className={enlace}>
              <Icono n="aviso" />Conflictos{!!cont?.conflictos && <span className="contador rojo">{cont.conflictos}</span>}
            </NavLink>
            {sesion.esComercial && <NavLink to="/mis-clientes" className={enlace}><Icono n="cliente" />Mis clientes</NavLink>}
            <div className="seccion-menu">Gestión</div>
            <NavLink to="/usuarios" className={enlace}><Icono n="contactos" />Usuarios</NavLink>
            <NavLink to="/cargar" className={enlace}><Icono n="subir" />Cargar datos</NavLink>
            <NavLink to="/accesos" className={enlace}><Icono n="escudo" />Accesos</NavLink>
          </>
        ) : (
          <NavLink to="/" end className={enlace}><Icono n="cliente" />Mis clientes</NavLink>
        )}
        {!sesion.como && <NavLink to="/clave" className={enlace}><Icono n="llave" />Contraseña</NavLink>}
        <a href="#" onClick={(e) => { e.preventDefault(); alAyuda(); }}><Icono n="ayuda" />Ayuda</a>
      </nav>
      <div className="sesion">
        <span className={'usuario-chip' + (sesion.como ? ' suplantando' : '')} title={quien.nombre}>
          <span className="avatar">{inicialesComercial(quien.nombre)}</span>
          <span className="usuario-texto">
            <b>{quien.nombre}</b>
            <small>{sesion.como ? 'dentro como comercial' : sesion.rol === 'admin' ? 'Administrador' : 'Comercial'}</small>
          </span>
        </span>
        {esAdmin && (
          <button type="button" className="btn-salir" title="Fecha límite y vacíos en la exportación" onClick={() => setRueda(true)}>
            <Icono n="rueda" /><span>Configuración</span>
          </button>
        )}
        <button type="button" className="btn-salir" title={sesion.como ? 'Volver a mi cuenta' : 'Salir'} onClick={alSalir}>
          <Icono n="salir" /><span>{sesion.como ? 'Volver a mi cuenta' : 'Salir'}</span>
        </button>
      </div>
      {rueda && config && <VentanaConfig config={config} onCerrar={() => setRueda(false)} onGuardado={(c) => { alCambiarConfig(c); setRueda(false); }} />}
    </aside>
  );
};

/** La rueda dentada: fecha límite (texto libre) y cómo salen los vacíos en el Excel */
const VentanaConfig = ({ config, onCerrar, onGuardado }: { config: Config; onCerrar: () => void; onGuardado: (c: Config) => void }) => {
  const [fecha, setFecha] = useState(config.fechaLimite);
  const [vacios, setVacios] = useState(config.vaciosExportacion);
  const [error, setError] = useState<string | null>(null);
  useEscCierra(onCerrar);
  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    try { onGuardado(await api.guardarConfig({ fechaLimite: fecha, vaciosExportacion: vacios })); } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="capa-config" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onCerrar(); }}>
      <form className="tarjeta config" onSubmit={guardar}>
        <div className="titulo-form"><h2>Configuración</h2></div>
        {error && <div className="aviso error">{error}</div>}
        <label className="etiqueta" htmlFor="c-fecha">Fecha límite</label>
        <input id="c-fecha" value={fecha} placeholder="31/10/2026" onChange={(e) => setFecha(e.target.value)} />
        <div className="ayuda-campo">Texto libre que se muestra a todos los usuarios. Si lo dejas vacío, no se muestra nada.
          Con una fecha (dd/mm/aaaa) se ven además los días que quedan.</div>
        <label className="etiqueta" htmlFor="c-vacios">Vacíos en la exportación</label>
        <select id="c-vacios" value={vacios} onChange={(e) => setVacios(e.target.value as Config['vaciosExportacion'])}>
          <option value="#">Como «#», igual que en el listado de origen</option>
          <option value="">En blanco</option>
        </select>
        <div className="ayuda-campo">Cómo salen en el Excel los emails y teléfonos vacíos.</div>
        <div className="botones">
          <button type="submit" className="btn btn-accion guardar"><span className="ico"><Icono n="check" /></span>Guardar</button>
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
};
