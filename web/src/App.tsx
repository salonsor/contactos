import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { Config, Sesion, SesionPendiente } from '../../shared/tipos';
import { api, siSePierdeLaSesion } from './api';
import { Ayuda } from './components/Ayuda';
import { Cabecera, FechaLimite } from './components/Cabecera';
import { useBloquearFondo, useEscCierra } from './hooks';
import { CambiarClave, Login, SegundoFactor } from './paginas/Acceso';
import { Accesos } from './paginas/Accesos';
import { CargarDatos } from './paginas/CargarDatos';
import { Avance } from './paginas/Avance';
import { Cliente } from './paginas/Cliente';
import { Conflictos, ResolverAMano } from './paginas/Conflictos';
import { MisClientes } from './paginas/MisClientes';
import { Propuestas } from './paginas/Propuestas';
import { Usuarios } from './paginas/Usuarios';

export default function App() {
  // undefined = comprobando; null = sin sesión
  const [sesion, setSesion] = useState<Sesion | SesionPendiente | null | undefined>(undefined);
  const [config, setConfig] = useState<Config | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ayuda, setAyuda] = useState(false);
  const navegar = useNavigate();
  const { pathname } = useLocation();

  const cargarSesion = useCallback(() => api.sesion().then(setSesion).catch(() => setSesion(null)), []);
  useEffect(() => {
    cargarSesion();
    siSePierdeLaSesion(() => setSesion(null));
  }, [cargarSesion]);

  const completa = sesion && sesion.paso === 'completa' ? sesion : null;
  // La fecha límite se ve también mientras se cambia la contraseña inicial
  useEffect(() => { if (completa) api.config().then(setConfig).catch(() => {}); }, [completa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // La ayuda, siempre a mano: la tecla «?» (fuera de los campos de texto) y Esc para cerrarla
  useBloquearFondo(ayuda);
  useEscCierra(ayuda ? () => setAyuda(false) : null);
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((ev.target as HTMLElement)?.tagName ?? '');
      if (ev.key === '?' && !enCampo && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); setAyuda(true); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

  const salir = async () => {
    await api.logout().catch(() => {});
    setSesion(null);
    navegar('/');
  };
  // Cambiar entre administración y «entrar como» cambia toda la aplicación: se recarga la página entera
  const dejarComo = async () => {
    await api.dejarComo();
    window.location.assign('/usuarios');
  };

  if (sesion === undefined) return null;

  // Entrada y cambio obligatorio de contraseña: panel de marca a la izquierda, formulario a la derecha
  const acceso = (contenido: ReactNode) => (
    <div className="acceso-fondo">
      <aside className="acceso-panel">
        <div className="acceso-marca"><span>C</span>Contactos</div>
        <div className="acceso-lema">
          <h1>Depuración de contactos comerciales</h1>
          <p>Revisa los contactos de tus clientes: confirma los correctos, corrige lo que no esté bien y da de baja a quien ya no esté.</p>
          {config && <FechaLimite texto={config.fechaLimite} />}
        </div>
        <div className="acceso-pie">Campaña de depuración de contactos</div>
      </aside>
      <div className="acceso-form">{contenido}</div>
    </div>
  );

  if (!sesion) return acceso(<Login aviso={aviso} alEntrar={() => { setAviso(null); cargarSesion(); navegar('/'); }} />);

  if (sesion.paso === 'segundo_factor') {
    return acceso(<SegundoFactor pendiente={sesion} alCompletar={cargarSesion} alCancelar={salir}
      alCaducar={(texto) => { setAviso(texto); setSesion(null); }} />);
  }

  // La primera vez no se deja pasar hasta cambiar la contraseña inicial
  if (sesion.claveInicial) return acceso(<CambiarClave obligatoria alCambiar={cargarSesion} />);

  const esAdmin = sesion.rol === 'admin' && !sesion.como;

  return (
    <div className="marco">
      <Cabecera sesion={sesion} config={config} alSalir={sesion.como ? dejarComo : salir} alAyuda={() => setAyuda(true)} alCambiarConfig={setConfig} />
      <div className="contenido">
        {sesion.como && (
          <div className="impersonando">
            <span>Estás dentro como <b>{sesion.como.nombre}</b> ({sesion.como.usuario}). Lo que hagas cuenta a su nombre y queda
              constancia de que lo hiciste tú.</span>
            <button type="button" className="btn pequeno" onClick={dejarComo}>Volver a mi cuenta</button>
          </div>
        )}
        <main>
          <Routes>
            {esAdmin ? (
              <>
                <Route path="/" element={<Avance />} />
                <Route path="/propuestas" element={<Propuestas />} />
                <Route path="/conflictos" element={<Conflictos />} />
                <Route path="/conflictos/:id" element={<ResolverAMano />} />
                <Route path="/usuarios" element={<Usuarios alEntrarComo={() => window.location.assign('/')} />} />
                <Route path="/cargar" element={<CargarDatos />} />
                <Route path="/accesos" element={<Accesos />} />
                {/* Un administrador que también lleva clientes los revisa aquí */}
                <Route path="/mis-clientes" element={<MisClientes base="/mis-clientes" />} />
                <Route path="/mis-clientes/:clave" element={<Cliente base="/mis-clientes" />} />
              </>
            ) : (
              <>
                <Route path="/" element={<MisClientes base="" />} />
                <Route path="/cliente/:clave" element={<Cliente base="" />} />
              </>
            )}
            <Route path="/clave" element={<CambiarClave obligatoria={false} alCambiar={() => navegar('/')} alCancelar={() => navegar(-1)} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <button id="help-fab" type="button" title="Ayuda (tecla ?)" onClick={() => setAyuda(true)}>?</button>
      {ayuda && <Ayuda admin={esAdmin} ruta={pathname} onCerrar={() => setAyuda(false)} />}
    </div>
  );
}
