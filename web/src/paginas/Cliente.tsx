import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { Catalogo, CampoContacto, ClienteDetalle, ContactoComercial, DatosContacto, Duplicado, Propuesta } from '../../../shared/tipos';
import { CAMPOS, ESTADO_TEXTO, faltanDatos } from '../../../shared/tipos';
import { api } from '../api';
import { cargarCatalogo, comprobarFormulario, FormContacto, VACIO, type Formulario } from '../components/FormContacto';
import { Icono } from '../components/Icono';
import { Ventana } from '../components/Ventana';
import { fmtFecha, inicialesContacto, num, pct } from '../util';

type Filtro = 'todos' | 'pendientes' | 'revisados' | 'esperando';
type ModoForm = 'modificar' | 'completar' | 'corregir';
type Accion = { tipo: ModoForm; c: ContactoComercial } | { tipo: 'baja'; c: ContactoComercial } | { tipo: 'alta' } | null;

const NOMBRE_TIPO = { modificacion: 'Modificación', alta: 'Alta', baja: 'Baja' } as const;

const datosDe = (c: ContactoComercial): DatosContacto =>
  Object.fromEntries(CAMPOS.map(({ k }) => [k, c[k] ?? ''])) as DatosContacto;

const formularioDe = (c: ContactoComercial): Formulario => ({
  datos: datosDe(c),
  sinEmail: c.sin_email ? c.motivo_sin_email : null,
  sinMovil: c.sin_movil ? c.motivo_sin_movil : null,
  encuestas: { ventas: c.enc_ventas, postventa: c.enc_postventa },
});

/** La franja de mi última propuesta: pendiente (con Deshacer) o lo que decidió el administrador */
const FranjaPropuesta = ({ p, onDeshacer, ocupado }: { p: Propuesta; onDeshacer: () => void; ocupado: boolean }) => {
  const tipo = NOMBRE_TIPO[p.tipo];
  if (p.estado === 'pendiente') {
    return (
      <div className="nota pendiente-aprobar">
        <span>{tipo} pendiente de aprobar{p.en_conflicto && ' (en conflicto)'}.
          {p.admin && <> <span className="chip admin">hecho por el administrador {p.admin}</span></>}</span>
        <button type="button" className="btn btn-accion neutro mini" disabled={ocupado} onClick={onDeshacer}>
          <span className="ico"><Icono n="deshacer" /></span>Deshacer
        </button>
      </div>
    );
  }
  if (p.estado === 'aprobada') {
    return <div className="nota aprobada">{tipo} aprobada{p.resuelto_por ? ` por ${p.resuelto_por}` : ''} el {fmtFecha(p.resuelto_en)}{p.comentario && <> · «{p.comentario}»</>}</div>;
  }
  if (p.estado === 'rechazada') {
    return <div className="nota rechazada">{tipo} rechazada{p.resuelto_por ? ` por ${p.resuelto_por}` : ''} el {fmtFecha(p.resuelto_en)}: los datos volvieron a como estaban{p.comentario && <> · «{p.comentario}»</>}</div>;
  }
  return <div className="nota">Tu {tipo.toLowerCase()} quedó sin efecto: el administrador decidió otra propuesta de este contacto.</div>;
};

const Dato = ({ k, v, enlace, nota }: { k: string; v: string; enlace?: string; nota?: string }) => (
  <div>
    <span className="etiqueta">{k}</span>
    {v ? (enlace ? <a href={enlace + v.replace(/\s+/g, '')}>{v}</a> : v) : <span className="atenuado">{nota ?? '—'}</span>}
  </div>
);

/** `base`: '' para el comercial, '/mis-clientes' para un administrador que también lo es */
export const Cliente = ({ base }: { base: string }) => {
  const { clave = '' } = useParams();
  const [d, setD] = useState<ClienteDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [accion, setAccion] = useState<Accion>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const navegar = useNavigate();
  const { key } = useLocation();
  const lista = base || '/';

  const cargar = useCallback(() => api.cliente(clave).then(setD).catch((e: Error) => setError(e.message)), [clave]);
  useEffect(() => { cargar(); }, [cargar]);

  const ejecutar = async (id: number | null, fn: () => Promise<unknown>, ok: string) => {
    setOcupado(id);
    setAviso(null);
    try {
      await fn();
      setAviso({ tipo: 'ok', texto: ok });
      setAccion(null);
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
      throw e;
    } finally {
      setOcupado(null);
    }
  };

  if (error) return <div className="aviso error">{error} · <Link to={lista}>volver a mis clientes</Link></div>;
  if (!d) return <p className="atenuado">Cargando…</p>;

  const { cliente } = d;
  const porRevisar = d.contactos.filter((c) => c.estado === 'pendiente').length;
  const revisados = d.contactos.length - porRevisar;
  const esperando = d.contactos.filter((c) => c.mi_propuesta?.estado === 'pendiente').length;
  // Primero las pendientes (por apellido); las revisadas bajan al final (el servidor ya las da en ese orden)
  const visibles = d.contactos.filter((c) => filtro === 'todos'
    || (filtro === 'pendientes' ? c.estado === 'pendiente'
      : filtro === 'revisados' ? c.estado !== 'pendiente' : c.mi_propuesta?.estado === 'pendiente'));

  const caja = (f: Filtro, clase: string, etiqueta: string, n: number, sub: string, icono: Parameters<typeof Icono>[0]['n'], barra?: number) => (
    <a href="#" className={`kpi ${clase}` + (filtro === f ? ' activa' : '')} onClick={(e) => { e.preventDefault(); setFiltro(filtro === f && f !== 'todos' ? 'todos' : f); }}>
      <div className="crece"><div className="etiqueta">{etiqueta}</div>
        <div className="cifra">{num(n)}{barra !== undefined && <span className="pct">{Math.round(barra)} %</span>}</div>
        {barra !== undefined && <div className="barra"><span style={{ width: `${barra}%` }} /></div>}
        <div className="sub">{sub}</div></div>
      <span className="ico"><Icono n={icono} /></span>
    </a>
  );

  const encuesta = (c: ContactoComercial, tipo: 'ventas' | 'postventa', valor: boolean) =>
    ejecutar(c.id, () => api.encuesta(c.id, tipo, valor), `${c.nombre} ${c.apellido}: encuesta de ${tipo} ${valor ? 'marcada' : 'desmarcada'}.`).catch(() => {});

  return (
    <>
      {/* Volver atrás conserva los filtros de la lista; si se entró directo por la URL, a la lista */}
      <Link to={lista} className="volver" onClick={(e) => { if (key !== 'default') { e.preventDefault(); navegar(-1); } }}>
        ← Mis clientes
      </Link>
      <div className="cabecera-pagina">
        <div>
          <h2>{cliente.cliente}</h2>
          <p className="atenuado pequeno">
            {cliente.localidad}{cliente.provincia ? ` · ${cliente.provincia}` : ''} · <span className={'chip unidad ' + d.unidad.familia}>{d.unidad.texto}</span>
            {' '}· Pagador <span className="mono">{cliente.pagador}</span> · Solicitante <span className="mono">{cliente.solicitante}</span>
          </p>
          {d.companeros.length > 0 && <p className="atenuado pequeno">Este cliente también lo lleva{d.companeros.length > 1 ? 'n' : ''}: {d.companeros.join(', ')}</p>}
        </div>
        <div className="botones compactos">
          <button type="button" className="btn btn-accion aprobar" onClick={() => setAccion({ tipo: 'alta' })}>
            <span className="ico"><Icono n="alta" /></span>Añadir contacto
          </button>
        </div>
      </div>

      {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.texto}</div>}

      <div className="kpis">
        {caja('todos', 'c-carbon', 'Contactos', d.contactos.length, 'de este cliente en tu lista', 'contactos')}
        {caja('pendientes', 'c-ambar', 'Por revisar', porRevisar, 'pendientes', 'reloj')}
        {caja('revisados', 'c-verde', 'Revisados', revisados, 'con OK, cambios o baja', 'revisados', pct(revisados, d.contactos.length))}
        {caja('esperando', 'c-azul', 'Esperando aprobación', esperando, 'cambios tuyos por aprobar', 'bandeja')}
      </div>

      {visibles.map((c) => {
        const bloqueado = !!c.bloqueado;
        const falta = faltanDatos(c);
        const pendiente = c.estado === 'pendiente';
        const deOtro = !pendiente && !!c.validado_por && !c.validado_por_mi;
        const adicionales = [c.tel_ad1, c.tel_ad2, c.tel_ad3, c.tel_ad4, c.tel_ad5].filter(Boolean).join(' · ');
        return (
          <div key={c.id} className={`tarjeta contacto estado-${c.estado}`}>
            <div className="contacto-cab">
              <span className={`avatar-contacto est-${c.estado}`}>{inicialesContacto(c)}</span>
              <div className="crece">
                <div className="contacto-nombre">
                  {c.nombre} {c.apellido} {c.es_alta && <span className="chip nuevo">NUEVO</span>}
                </div>
                <div className="atenuado pequeno">{c.desc_funcion || 'Sin función'} · {c.desc_dpto || 'Sin departamento'}</div>
              </div>
              <span className={`badge ${c.estado}`}>{ESTADO_TEXTO[c.estado]}</span>
            </div>

            <div className="contacto-datos">
              <Dato k="Email" v={c.email} enlace="mailto:" nota={c.sin_email ? `no tiene: ${c.motivo_sin_email}` : 'sin email'} />
              <Dato k="Móvil/directo" v={c.tel_contacto} enlace="tel:" nota={c.sin_movil ? `no tiene móvil: ${c.motivo_sin_movil}` : undefined} />
              <Dato k="Centralita" v={c.telefono} enlace="tel:" />
              {adicionales && <Dato k="Adicionales" v={adicionales} />}
            </div>

            {!bloqueado && (falta.email || falta.movil) && (
              <div className="nota falta">
                <Icono n="aviso" /> Falta {falta.email && falta.movil ? <><b>el email y un móvil</b></> : falta.email ? <b>el email</b> : <b>un móvil</b>}:
                complétalo, o indica que no lo tiene, para poder validarlo.
              </div>
            )}

            <div className="encuestas">
              <span className="etiqueta">Contesta encuestas de</span>
              {(['ventas', 'postventa'] as const).map((t) => {
                const marcada = t === 'ventas' ? c.enc_ventas : c.enc_postventa;
                return (
                  <label key={t} className={'pildora conmutador' + (marcada ? ' activa' : '')}>
                    <input type="checkbox" checked={marcada} disabled={bloqueado || ocupado === c.id} onChange={(e) => encuesta(c, t, e.target.checked)} />
                    {t === 'ventas' ? 'Ventas' : 'Postventa'}
                  </label>
                );
              })}
            </div>

            {c.validado_por && !pendiente && (
              <div className={'nota' + (deOtro ? ' otro' : '')}>
                {c.validado_por_mi ? <>Validado por ti el {fmtFecha(c.validado_en)}.</>
                  : <>Validado por <b>{c.validado_por}</b> el {fmtFecha(c.validado_en)}. Si no estás de acuerdo, corrígelo.</>}
                {c.validado_admin && <> <span className="chip admin">hecho por el administrador {c.validado_admin}</span></>}
              </div>
            )}
            {c.estado === 'conflicto' && <div className="nota otro">En conflicto: lo resolverá el administrador.</div>}
            {c.mi_propuesta && (
              <FranjaPropuesta p={c.mi_propuesta} ocupado={ocupado === c.id}
                onDeshacer={() => ejecutar(c.id, () => api.deshacer(c.mi_propuesta!.id), `${c.nombre} ${c.apellido}: propuesta deshecha.`).catch(() => {})} />
            )}
            {bloqueado && <div className="nota">{c.bloqueado}</div>}

            {!bloqueado && (
              <div className="botones">
                {pendiente && (falta.email || falta.movil ? (
                  <button type="button" className="btn btn-accion completar" onClick={() => setAccion({ tipo: 'completar', c })}>
                    <span className="ico"><Icono n="aviso" /></span>Completar
                  </button>
                ) : (
                  <button type="button" className="btn btn-accion aprobar" disabled={ocupado === c.id}
                    onClick={() => ejecutar(c.id, () => api.marcarOk(c.id), `${c.nombre} ${c.apellido}: validado.`).catch(() => {})}>
                    <span className="ico"><Icono n="check" /></span>OK
                  </button>
                ))}
                <button type="button" className="btn btn-accion modificar" onClick={() => setAccion({ tipo: deOtro ? 'corregir' : 'modificar', c })}>
                  <span className="ico"><Icono n="modificacion" /></span>{deOtro ? 'Corregir' : 'Modificar'}
                </button>
                <button type="button" className="btn btn-accion rechazar" onClick={() => setAccion({ tipo: 'baja', c })}>
                  <span className="ico"><Icono n="baja" /></span>Baja
                </button>
              </div>
            )}
          </div>
        );
      })}
      {!visibles.length && (
        <div className="aviso ok">{filtro === 'pendientes' ? 'No te queda ningún contacto por revisar en este cliente. ¡Gracias!' : 'Ningún contacto con ese filtro.'}</div>
      )}

      {accion && accion.tipo !== 'baja' && accion.tipo !== 'alta' && (
        <VentanaModificar modo={accion.tipo} c={accion.c} onCerrar={() => setAccion(null)}
          onGuardar={(f) => ejecutar(accion.c.id, () => api.modificar(accion.c.id, f.datos,
            { sinEmail: f.sinEmail, sinMovil: f.sinMovil, encuestas: f.encuestas }), accion.tipo === 'corregir'
            ? 'Corrección enviada: no pisa lo validado; el contacto queda en conflicto hasta que decida el administrador.'
            : 'Guardado. Si cambiaste algún dato, ya se ve y queda pendiente de aprobar.')} />
      )}
      {accion?.tipo === 'baja' && (
        <VentanaBaja c={accion.c} onCerrar={() => setAccion(null)}
          onGuardar={(motivo) => ejecutar(accion.c.id, () => api.baja(accion.c.id, motivo), 'Baja enviada: el contacto sale tachado hasta que el administrador la apruebe.')} />
      )}
      {accion?.tipo === 'alta' && (
        <VentanaAlta cliente={cliente.cliente} centralita={d.centralita} onCerrar={() => setAccion(null)}
          onGuardar={async (f, forzar) => {
            const r = await api.alta(clave, f.datos, { sinEmail: f.sinEmail, sinMovil: f.sinMovil, encuestas: f.encuestas }, forzar);
            if (!r.ok) return r.duplicados;
            setAccion(null);
            setAviso({ tipo: 'ok', texto: 'Contacto añadido: ya lo ven tus compañeros de cliente; queda pendiente de que el administrador apruebe el alta.' });
            await cargar();
            return null;
          }} />
      )}
    </>
  );
};

// ── Ventanas de los formularios ──

const useCatalogo = () => {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  useEffect(() => { cargarCatalogo().then(setCatalogo).catch(() => {}); }, []);
  return catalogo;
};

const useEnvio = (fn: () => Promise<unknown>) => {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setEnviando(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setEnviando(false); }
  };
  return { error, setError, enviando, enviar };
};

const TITULO: Record<ModoForm, string> = { modificar: 'Modificar a', completar: 'Completar a', corregir: 'Corregir a' };

const VentanaModificar = ({ modo, c, onCerrar, onGuardar }: {
  modo: ModoForm; c: ContactoComercial; onCerrar: () => void; onGuardar: (f: Formulario) => Promise<unknown>;
}) => {
  const original = formularioDe(c);
  const [f, setF] = useState(original);
  const catalogo = useCatalogo();
  const tocados = CAMPOS.filter(({ k }) => f.datos[k] !== original.datos[k]).map(({ k }) => k) as CampoContacto[];
  const { error, setError, enviando, enviar } = useEnvio(async () => {
    const problema = comprobarFormulario(f, catalogo, tocados);
    if (problema) { setError(problema); return; }
    await onGuardar(f);
  });
  const falta = faltanDatos(c);
  const sinCambios = !tocados.length && f.sinEmail === original.sinEmail && f.sinMovil === original.sinMovil
    && f.encuestas.ventas === original.encuestas.ventas && f.encuestas.postventa === original.encuestas.postventa;
  return (
    <Ventana titulo={`${TITULO[modo]} ${c.nombre} ${c.apellido}`}
      sub={modo === 'corregir'
        ? `Lo validó ${c.validado_por}. Tu corrección no pisa lo suyo: queda como propuesta y el administrador decide viendo las dos versiones.`
        : 'Los cambios se aplican al momento y quedan pendientes de que el administrador los apruebe.'}
      icono={<span className="avatar-contacto est-modificado">{inicialesContacto(c)}</span>} onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        {(falta.email || falta.movil) && (
          <div className="aviso alerta"><b>Para dar este contacto por bueno falta {falta.email && falta.movil ? 'el email y un móvil' : falta.email ? 'el email' : 'un móvil'}.</b>{' '}
            Rellénalo, o marca abajo que no tiene e indica el motivo.</div>
        )}
        {error && <div className="aviso error">{error}</div>}
        <FormContacto f={f} original={original.datos} onChange={setF} catalogo={catalogo} />
        <div className="botones">
          <button type="submit" className="btn btn-accion guardar" disabled={enviando}>
            <span className="ico"><Icono n="check" /></span>{enviando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          {sinCambios && <span className="pequeno atenuado">Todavía no has cambiado nada.</span>}
        </div>
      </form>
    </Ventana>
  );
};

const VentanaBaja = ({ c, onCerrar, onGuardar }: { c: ContactoComercial; onCerrar: () => void; onGuardar: (motivo: string) => Promise<unknown> }) => {
  const [motivo, setMotivo] = useState('');
  const { error, enviando, enviar } = useEnvio(() => onGuardar(motivo.trim()));
  return (
    <Ventana titulo={`Dar de baja a ${c.nombre} ${c.apellido}`}
      sub={`${c.desc_funcion || 'Sin función'}. La baja queda pendiente de que el administrador la apruebe. Hasta entonces el contacto aparece tachado.`}
      icono={<span className="avatar-contacto est-baja">{inicialesContacto(c)}</span>} onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        {error && <div className="aviso error">{error}</div>}
        <label className="etiqueta" htmlFor="motivo">Motivo *</label>
        <textarea id="motivo" rows={3} required autoFocus value={motivo} placeholder="Ya no trabaja en la empresa, se jubiló, está duplicado…"
          onChange={(e) => setMotivo(e.target.value)} />
        <div className="botones">
          <button type="submit" className="btn btn-accion baja-llena" disabled={enviando || !motivo.trim()}>
            <span className="ico"><Icono n="baja" /></span>{enviando ? 'Enviando…' : 'Confirmar baja'}
          </button>
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Ventana>
  );
};

const VentanaAlta = ({ cliente, centralita, onCerrar, onGuardar }: {
  cliente: string; centralita: string; onCerrar: () => void; onGuardar: (f: Formulario, forzar: boolean) => Promise<Duplicado[] | null>;
}) => {
  const [f, setF] = useState<Formulario>({ datos: { ...VACIO, telefono: centralita }, sinEmail: null, sinMovil: null, encuestas: { ventas: false, postventa: false } });
  const [duplicados, setDuplicados] = useState<Duplicado[] | null>(null);
  const catalogo = useCatalogo();
  const { error, setError, enviando, enviar } = useEnvio(async () => {
    const problema = comprobarFormulario(f, catalogo, CAMPOS.map((x) => x.k));
    if (problema) { setError(problema); return; }
    setDuplicados(await onGuardar(f, !!duplicados));
  });
  // Si cambian el email o los teléfonos, hay que volver a comprobar las coincidencias
  const cambiar = (n: Formulario) => { setF(n); if (duplicados) setDuplicados(null); };
  return (
    <Ventana titulo={`Nuevo contacto en ${cliente}`}
      sub="Obligatorios: nombre, apellido, departamento, función, email y al menos un móvil. Lo verán todos los comerciales del cliente."
      icono={<span className="avatar-contacto est-ok"><Icono n="alta" /></span>} onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        {duplicados && (
          <div className="aviso alerta">
            <b>Puede que este contacto ya exista.</b> Coincide el email o un teléfono con:
            <ul className="lista-duplicados">
              {duplicados.map((x) => <li key={x.id}>{x.nombre} {x.apellido} · {x.desc_funcion} · {x.email} {x.telefonos}</li>)}
            </ul>
            Si es la misma persona, cancela y modifica la que ya existe. Si es otra persona, pulsa «Guardar de todos modos».
          </div>
        )}
        {error && <div className="aviso error">{error}</div>}
        <FormContacto f={f} onChange={cambiar} catalogo={catalogo} />
        <div className="botones">
          <button type="submit" className="btn btn-accion guardar" disabled={enviando}>
            <span className="ico"><Icono n="check" /></span>{enviando ? 'Guardando…' : duplicados ? 'Guardar de todos modos' : 'Guardar'}
          </button>
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Ventana>
  );
};
