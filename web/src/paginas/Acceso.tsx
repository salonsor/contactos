import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AltaDobleFactor, SesionPendiente } from '../../../shared/tipos';
import { api, ErrorApi } from '../api';
import { Icono } from '../components/Icono';

const useEnvio = (fn: () => Promise<void>) => {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setEnviando(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setEnviando(false); }
  };
  return { error, enviando, enviar };
};

export const Login = ({ alEntrar, aviso }: { alEntrar: () => void; aviso?: string | null }) => {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const { error, enviando, enviar } = useEnvio(async () => { await api.login(usuario, clave); alEntrar(); });
  return (
    <form className="tarjeta estrecha formulario acceso" onSubmit={enviar}>
      <div className="titulo-form">
        <span className="ico-tipo" style={{ background: 'var(--carbon)' }}><Icono n="contactos" /></span>
        <h2>Entrar</h2>
      </div>
      <p className="atenuado pequeno">Usa tu usuario de la empresa y la contraseña que te han facilitado.</p>
      {aviso && !error && <div className="aviso alerta" style={{ marginTop: 12 }}>{aviso}</div>}
      {error && <div className="aviso error" style={{ marginTop: 12 }}>{error}</div>}
      <label className="etiqueta" htmlFor="usuario">Usuario</label>
      <input id="usuario" autoComplete="username" autoFocus required value={usuario} onChange={(e) => setUsuario(e.target.value)} />
      <label className="etiqueta" htmlFor="clave">Contraseña</label>
      <input id="clave" type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
      <div className="botones">
        <button className="btn btn-accion entrar" type="submit" disabled={enviando}>
          <span className="ico"><Icono n="check" /></span>{enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
      <p className="ayuda-campo" style={{ marginTop: 12 }}>¿No tienes contraseña o la has olvidado? Contacta con digital_it@finanzauto.es para resetearla.</p>
    </form>
  );
};

interface PropsSegundoFactor {
  pendiente: SesionPendiente;
  /** Ambos pasos correctos: cargar la sesión completa */
  alCompletar: () => void;
  /** La sesión a medias ya no vale (caducada o demasiados códigos): volver a la contraseña con este aviso */
  alCaducar: (aviso: string) => void;
  alCancelar: () => void;
}

/** Segundo paso de la entrada: alta de la aplicación de autenticación o código de 6 cifras */
export const SegundoFactor = (props: PropsSegundoFactor) => {
  // Lo que se enseña una sola vez tras acertar: los códigos de recuperación nuevos, o cuántos quedan
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [restantes, setRestantes] = useState<number | null>(null);
  if (codigos) return <CodigosRecuperacion codigos={codigos} alSeguir={props.alCompletar} />;
  if (restantes !== null) return <AvisoRecuperacion restantes={restantes} alSeguir={props.alCompletar} />;
  return props.pendiente.alta
    ? <AltaApp {...props} alActivar={setCodigos} />
    : <PedirCodigo {...props} alUsarRecuperacion={setRestantes} />;
};

/** Pide el código y gestiona los errores comunes a alta y verificación */
const useCodigo = (fn: (codigo: string) => Promise<void>, alCaducar: (aviso: string) => void) => {
  const [codigo, setCodigo] = useState('');
  const { error, enviando, enviar } = useEnvio(async () => {
    try {
      await fn(codigo.trim());
    } catch (e) {
      setCodigo('');
      if (e instanceof ErrorApi && e.status === 401) { alCaducar(e.message); return; }
      throw e;
    }
  });
  return { codigo, setCodigo, error, enviando, enviar };
};

const CampoCodigo = ({ valor, alCambiar, recuperacion = false }: { valor: string; alCambiar: (v: string) => void; recuperacion?: boolean }) => (
  <>
    <label className="etiqueta" htmlFor="codigo">{recuperacion ? 'Código de recuperación' : 'Código de 6 cifras'}</label>
    <input id="codigo" className="mono campo-codigo" autoFocus required autoComplete="one-time-code"
      inputMode={recuperacion ? 'text' : 'numeric'} pattern={recuperacion ? '[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}' : '\\d{6}'}
      maxLength={recuperacion ? 9 : 6} placeholder={recuperacion ? 'XXXX-XXXX' : '123456'}
      value={valor} onChange={(e) => alCambiar(recuperacion ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ''))} />
  </>
);

const AltaApp = ({ pendiente, alCaducar, alCancelar, alActivar }: PropsSegundoFactor & { alActivar: (codigos: string[]) => void }) => {
  const [alta, setAlta] = useState<AltaDobleFactor | null>(null);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const caducar = useRef(alCaducar);
  caducar.current = alCaducar;
  useEffect(() => {
    api.altaDobleFactor().then(setAlta).catch((e) => {
      if (e instanceof ErrorApi && e.status === 401) caducar.current(e.message); else setErrorAlta((e as Error).message);
    });
  }, []);
  const { codigo, setCodigo, error, enviando, enviar } = useCodigo(async (c) => alActivar((await api.confirmarAlta(c)).codigos), alCaducar);
  return (
    <form className="tarjeta estrecha formulario acceso" onSubmit={enviar}>
      <div className="titulo-form">
        <span className="ico-tipo" style={{ background: 'var(--carbon)' }}><Icono n="escudo" /></span>
        <h2>Verificación en dos pasos</h2>
      </div>
      <p className="pequeno">Hola, {pendiente.nombre}. Para proteger los datos de los contactos, además de la contraseña se pide un código
        que genera tu móvil. Se configura una sola vez:</p>
      <ol className="pasos-alta pequeno">
        <li>Instala en el móvil <b>Google Authenticator</b> o <b>Microsoft Authenticator</b>.</li>
        <li>Abre la app:
          <ul>
            <li>En el caso de <b>Google Authenticator</b>, pulsa el icono del <b>+</b> y pulsa en "Escanear un código QR".</li>
            <li>En el caso de <b>Microsoft Authenticator</b>, pulsa en el icono del QR.</li>
          </ul>
        </li>
        <li>Escanea el código QR.</li>
        <li>Escribe abajo los <b>6 números</b> que te muestra el móvil con el título de "Depuración de contactos: &lt;usuario&gt;".</li>
      </ol>
      {errorAlta && <div className="aviso error">{errorAlta}</div>}
      {alta ? (
        <div className="qr-alta">
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(alta.qr)}`} width={180} height={180}
            alt="Código QR para la aplicación de autenticación" />
          <details>
            <summary className="pequeno">No puedo escanearlo</summary>
            <p className="pequeno">Elige «Introducir clave» en la aplicación y escribe esta, de tipo «basada en tiempo»:</p>
            <p className="mono secreto-alta">{alta.secreto}</p>
          </details>
        </div>
      ) : !errorAlta && <p className="atenuado pequeno">Preparando el código…</p>}
      {error && <div className="aviso error">{error}</div>}
      <CampoCodigo valor={codigo} alCambiar={setCodigo} />
      <div className="botones">
        <button className="btn btn-accion entrar" type="submit" disabled={enviando || !alta}>
          <span className="ico"><Icono n="check" /></span>{enviando ? 'Comprobando…' : 'Activar y entrar'}
        </button>
        <button className="btn" type="button" onClick={alCancelar}>Cancelar</button>
      </div>
    </form>
  );
};

const PedirCodigo = ({ pendiente, alCompletar, alCaducar, alCancelar, alUsarRecuperacion }: PropsSegundoFactor & { alUsarRecuperacion: (n: number) => void }) => {
  const [recuperacion, setRecuperacion] = useState(false);
  const { codigo, setCodigo, error, enviando, enviar } = useCodigo(async (c) => {
    const r = await api.verificarCodigo(c);
    if (r.codigosRestantes !== undefined) alUsarRecuperacion(r.codigosRestantes); else alCompletar();
  }, alCaducar);
  return (
    <form className="tarjeta estrecha formulario acceso" onSubmit={enviar}>
      <div className="titulo-form">
        <span className="ico-tipo" style={{ background: 'var(--carbon)' }}><Icono n="escudo" /></span>
        <h2>Verificación en dos pasos</h2>
      </div>
      <p className="pequeno">
        {recuperacion
          ? 'Escribe uno de los códigos de recuperación que guardaste al activar la verificación. Cada uno vale una sola vez.'
          : <>Abre la aplicación de autenticación del móvil y escribe el código de <b>Depuración de contactos</b> para {pendiente.usuario}.</>}
      </p>
      {error && <div className="aviso error">{error}</div>}
      <CampoCodigo key={String(recuperacion)} valor={codigo} alCambiar={setCodigo} recuperacion={recuperacion} />
      <div className="botones">
        <button className="btn btn-accion entrar" type="submit" disabled={enviando}>
          <span className="ico"><Icono n="check" /></span>{enviando ? 'Comprobando…' : 'Entrar'}
        </button>
        <button className="btn" type="button" onClick={alCancelar}>Cancelar</button>
      </div>
      <button type="button" className="enlace-boton pequeno" onClick={() => { setRecuperacion(!recuperacion); setCodigo(''); }}>
        {recuperacion ? 'Usar el código de la aplicación' : 'No tengo el móvil: usar un código de recuperación'}
      </button>
      <p className="ayuda-campo">Si has perdido el móvil y los códigos de recuperación, pide al administrador que restablezca tu verificación en dos pasos.</p>
    </form>
  );
};

const CodigosRecuperacion = ({ codigos, alSeguir }: { codigos: string[]; alSeguir: () => void }) => {
  const [copiado, setCopiado] = useState(false);
  const [guardados, setGuardados] = useState(false);
  const copiar = () => navigator.clipboard.writeText(codigos.join('\n')).then(() => setCopiado(true)).catch(() => {});
  return (
    <div className="tarjeta estrecha formulario acceso">
      <div className="titulo-form">
        <span className="ico-tipo" style={{ background: 'var(--carbon)' }}><Icono n="llave" /></span>
        <h2>Guarda tus códigos de recuperación</h2>
      </div>
      <div className="aviso ok">Verificación en dos pasos activada.</div>
      <p className="pequeno">Si pierdes el móvil, podrás entrar con uno de estos códigos. Cada uno vale una sola vez y <b>no se volverán a
        mostrar</b>. Guárdalos en un sitio seguro, fuera del móvil.</p>
      <ul className="codigos-recuperacion mono">{codigos.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="botones">
        <button className="btn" type="button" onClick={copiar}><span className="ico"><Icono n="descargar" /></span>{copiado ? 'Copiados' : 'Copiar'}</button>
      </div>
      <label className="marca-guardados pequeno"><input type="checkbox" checked={guardados} onChange={(e) => setGuardados(e.target.checked)} /> Los he guardado</label>
      <div className="botones">
        <button className="btn btn-accion entrar" type="button" disabled={!guardados} onClick={alSeguir}>
          <span className="ico"><Icono n="check" /></span>Continuar
        </button>
      </div>
    </div>
  );
};

const AvisoRecuperacion = ({ restantes, alSeguir }: { restantes: number; alSeguir: () => void }) => (
  <div className="tarjeta estrecha formulario acceso">
    <div className="titulo-form">
      <span className="ico-tipo" style={{ background: 'var(--carbon)' }}><Icono n="aviso" /></span>
      <h2>Has entrado con un código de recuperación</h2>
    </div>
    <div className={'aviso ' + (restantes <= 2 ? 'error' : 'alerta')}>
      {restantes === 0 ? 'Era el último que te quedaba.' : `Te quedan ${restantes} ${restantes === 1 ? 'código' : 'códigos'}.`}
    </div>
    <p className="pequeno">Si has perdido el móvil, pide al administrador que restablezca tu verificación en dos pasos: en tu próxima
      entrada la configurarás en el móvil nuevo y recibirás códigos de recuperación nuevos.</p>
    <div className="botones">
      <button className="btn btn-accion entrar" type="button" onClick={alSeguir}><span className="ico"><Icono n="check" /></span>Continuar</button>
    </div>
  </div>
);

export const CambiarClave = ({ obligatoria, alCambiar, alCancelar }: { obligatoria: boolean; alCambiar: () => void; alCancelar?: () => void }) => {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const { error, enviando, enviar } = useEnvio(async () => {
    if (nueva !== repetida) throw new Error('Las dos contraseñas nuevas no coinciden');
    await api.cambiarClave(actual, nueva);
    alCambiar();
  });
  return (
    <form className="tarjeta estrecha formulario acceso" onSubmit={enviar}>
      <div className="titulo-form">
        <span className="ico-tipo" style={{ background: 'var(--carbon)' }}><Icono n="check" /></span>
        <h2>Cambiar contraseña</h2>
      </div>
      {obligatoria && (
        <div className="aviso info" style={{ marginTop: 10 }}>
          Es tu primera entrada: elige una contraseña propia para continuar.
        </div>
      )}
      {error && <div className="aviso error">{error}</div>}
      <label className="etiqueta" htmlFor="actual">Contraseña actual</label>
      <input id="actual" type="password" autoComplete="current-password" autoFocus required value={actual} onChange={(e) => setActual(e.target.value)} />
      <label className="etiqueta" htmlFor="nueva">Contraseña nueva (mínimo 8 caracteres)</label>
      <input id="nueva" type="password" autoComplete="new-password" required minLength={8} value={nueva} onChange={(e) => setNueva(e.target.value)} />
      <label className="etiqueta" htmlFor="repetida">Repite la contraseña nueva</label>
      <input id="repetida" type="password" autoComplete="new-password" required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      <div className="botones">
        <button className="btn btn-accion guardar" type="submit" disabled={enviando}>
          <span className="ico"><Icono n="check" /></span>{enviando ? 'Guardando…' : 'Guardar'}
        </button>
        {alCancelar && <button className="btn" type="button" onClick={alCancelar}>Cancelar</button>}
      </div>
    </form>
  );
};
