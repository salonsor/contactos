import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Catalogo, Conflicto, DatosContacto, Ficha } from '../../../shared/tipos';
import { CAMPOS } from '../../../shared/tipos';
import { api } from '../api';
import { NOMBRE_TIPO, queCambia } from '../components/DiffPropuesta';
import { cargarCatalogo } from '../components/FormContacto';
import { ComparativaVersiones, LineaTiempoContacto, movimientos } from '../components/HistorialConflicto';
import { Icono } from '../components/Icono';
import { VentanaFicha } from '../components/VentanaFicha';
import { useBloquearFondo, useEscCierra } from '../hooks';
import { fmtFecha, num } from '../util';

export const Conflictos = () => {
  const [lista, setLista] = useState<Conflicto[] | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [fichaId, setFichaId] = useState<number | null>(null);
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const [todasAbiertas, setTodasAbiertas] = useState(true);
  const navegar = useNavigate();
  useBloquearFondo(fichaId !== null);
  useEscCierra(fichaId !== null ? () => setFichaId(null) : null);

  const cargar = useCallback(() => api.conflictos().then(setLista).catch((e: Error) => setAviso({ tipo: 'error', texto: e.message })), []);
  useEffect(() => { cargar(); }, [cargar]);

  const decidir = async (c: Conflicto, id: number, accion: 'aprobar' | 'rechazar', texto: string) => {
    setOcupado(c.contacto_id);
    try {
      const r = await api.decidir([id], accion);
      if (r.errores.length) throw new Error(r.errores.join(' · '));
      setAviso({ tipo: 'ok', texto: `${c.contacto}: ${texto}` });
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  };

  const enfrentadas = (lista ?? []).reduce((s, c) => s + c.propuestas.length, 0);
  const alternar = (id: number) => setAbiertas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <div className="cabecera-pagina"><div><h2>Contactos en conflicto</h2></div></div>

      <div className="kpis">
        <div className="kpi c-rojo"><div><div className="etiqueta">Contactos en conflicto</div><div className="cifra">{num(lista?.length ?? 0)}</div>
          <div className="sub">por resolver</div></div><span className="ico"><Icono n="aviso" /></span></div>
        <div className="kpi c-ambar"><div><div className="etiqueta">Propuestas enfrentadas</div><div className="cifra">{num(enfrentadas)}</div>
          <div className="sub">sin aplicar, a la espera</div></div><span className="ico"><Icono n="bandeja" /></span></div>
        <div className="kpi c-carbon ancha"><div><div className="etiqueta">Cómo se resuelve</div>
          <div className="sub">Un comercial corrigió o dio de baja un contacto que otro ya había validado. <b>Aprueba</b> una de las propuestas,{' '}
            <b>recházalas</b>, o <b>fija los datos a mano</b>.</div></div><span className="ico"><Icono n="todas" /></span></div>
      </div>

      {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.texto}</div>}
      {!lista && <p className="atenuado">Cargando…</p>}

      {lista && (
        <section className="tarjeta">
          <div className="bloque-cab">
            <h3>{num(lista.length)} contacto{lista.length === 1 ? '' : 's'} en conflicto</h3>
            <span>Cada contacto muestra la comparativa de versiones (al inicio, ahora y lo que propone cada uno) y su historial completo</span>
            <button type="button" className="btn btn-accion neutro mini" onClick={() => { setTodasAbiertas(!todasAbiertas); setAbiertas(new Set()); }}>
              <span className="ico"><Icono n="todas" /></span>{todasAbiertas ? 'Ocultar todos los cambios' : 'Ver todos los cambios'}
            </button>
          </div>
          {!lista.length && <div className="aviso ok">No hay ningún conflicto pendiente.</div>}
          {lista.map((c) => {
            const abierto = todasAbiertas !== abiertas.has(c.contacto_id);
            return (
            <div key={c.contacto_id} className="conflicto-bloque">
              <div className="conflicto-validado">
                <span className="ico-aviso"><Icono n="aviso" /></span>
                <div className="crece">
                  <a href="#" className="cel-clic" onClick={(e) => { e.preventDefault(); setFichaId(c.contacto_id); }}>{c.contacto || 'Sin nombre'}</a>
                  <div className="pequeno atenuado">{c.desc_funcion}{c.num_contacto && <> · nº <span className="mono">{c.num_contacto}</span></>}</div>
                </div>
                <div className="pequeno">{c.cliente}<div className="atenuado">{c.localidad}</div></div>
                <div className="pequeno">{c.validado_por ? <>Validado por <b>{c.validado_por}</b><div className="atenuado">{fmtFecha(c.validado_en)}</div></> : 'Sin validar'}</div>
                <div className="pequeno ahora"><span className="etiqueta">Ahora</span>{c.datos.email || '—'}<br />{c.datos.tel_contacto || '—'}</div>
                <button type="button" className="btn btn-accion neutro mini" onClick={() => navegar(`/conflictos/${c.contacto_id}`)}>
                  <span className="ico"><Icono n="modificacion" /></span>Resolver a mano
                </button>
              </div>
              {c.propuestas.map((p) => {
                return (
                  <div key={p.id} className={`propuesta-enfrentada tipo-${p.tipo}`}>
                    <div className="enfrentada-cab">
                      <span><span className={`chip tipo-${p.tipo}`}>{p.tipo === 'modificacion' ? 'Corrección' : NOMBRE_TIPO[p.tipo]}</span>
                        <div className="pequeno atenuado">sin aplicar</div></span>
                      <span className="pequeno"><b>{p.comercial}</b><div className="atenuado">{fmtFecha(p.creado_en)}
                        {p.admin && <> <span className="chip admin">admin</span></>}</div></span>
                      <span className="pequeno crece">Propone {queCambia(p).toLowerCase()}</span>
                      <span className="botones compactos">
                        <button type="button" className="btn btn-accion aprobar mini" disabled={ocupado === c.contacto_id}
                          onClick={() => decidir(c, p.id, 'aprobar', `aprobada la propuesta de ${p.comercial}: queda validado a su nombre y las demás pendientes, superadas.`)}>
                          <span className="ico"><Icono n="check" /></span>Aprobar esta
                        </button>
                        <button type="button" className="btn btn-accion rechazar mini" disabled={ocupado === c.contacto_id}
                          onClick={() => decidir(c, p.id, 'rechazar', `rechazada la propuesta de ${p.comercial}.`)}>
                          <span className="ico"><Icono n="cerrar" /></span>Rechazar esta
                        </button>
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="conflicto-detalle">
                <a href="#" className="conmutador" onClick={(e) => { e.preventDefault(); alternar(c.contacto_id); }}>
                  {abierto ? '− Ocultar' : '+ Ver'} todos los cambios del contacto ({num(movimientos(c))} movimiento{movimientos(c) === 1 ? '' : 's'})
                </a>
                {abierto && (
                  <div className="conflicto-detalle-cuerpo">
                    <div>
                      <h4>Comparativa de versiones</h4>
                      <ComparativaVersiones c={c} />
                    </div>
                    <div>
                      <h4>Historial del contacto</h4>
                      <LineaTiempoContacto c={c} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
          })}
        </section>
      )}

      {fichaId !== null && <VentanaFicha key={fichaId} id={fichaId} onCerrar={() => setFichaId(null)} />}
    </>
  );
};

/** «Resolver a mano»: arriba, el historial de propuestas; abajo, el formulario con los datos definitivos */
export const ResolverAMano = () => {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [datos, setDatos] = useState<DatosContacto | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // La ficha da el historial; los datos, campo a campo (con los adicionales en su casilla), salen del listado de conflictos
  const [original, setOriginal] = useState<DatosContacto | null>(null);
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);
  useEffect(() => {
    api.ficha(Number(id)).then(setFicha).catch((e: Error) => setError(e.message));
    api.conflictos().then((l) => {
      const c = l.find((x) => x.contacto_id === Number(id));
      if (!c) { setError('Este contacto ya no está en conflicto.'); return; }
      setConflicto(c);
      setDatos(c.datos);
      setOriginal(c.datos);
    }).catch((e: Error) => setError(e.message));
    cargarCatalogo().then(setCatalogo).catch(() => {});
  }, [id]);

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!datos) return;
    setEnviando(true);
    setError(null);
    try {
      await api.resolverAMano(Number(id), datos, comentario);
      navegar('/conflictos');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (!ficha || !datos || !conflicto) return error ? <div className="aviso error">{error} <Link to="/conflictos">Volver a Conflictos</Link></div> : <p className="atenuado">Cargando…</p>;
  const dpto = catalogo?.departamentos.find((d) => d.nombre === datos.desc_dpto);
  const campo = (k: keyof DatosContacto, t: string) => (
    <div><label className="etiqueta" htmlFor={`r-${k}`}>{t}</label>
      <input id={`r-${k}`} value={datos[k]} onChange={(e) => setDatos({ ...datos, [k]: e.target.value })} /></div>
  );

  return (
    <>
      <Link to="/conflictos" className="volver">← Conflictos</Link>
      <div className="cabecera-pagina"><div>
        <h2>{ficha.nombre} {ficha.apellido} <span className="badge conflicto">En conflicto</span></h2>
        <p className="atenuado pequeno">{ficha.cliente} · {ficha.localidad}</p>
      </div></div>

      <section className="tarjeta">
        <div className="bloque-cab"><h3>Comparativa de versiones</h3>
          <span>{conflicto.propuestas.length} propuesta{conflicto.propuestas.length === 1 ? '' : 's'} enfrentada{conflicto.propuestas.length === 1 ? '' : 's'} a lo validado</span></div>
        <ComparativaVersiones c={conflicto} />
      </section>

      <section className="tarjeta">
        <div className="bloque-cab"><h3>Historial del contacto</h3><span>{num(movimientos(conflicto))} movimiento{movimientos(conflicto) === 1 ? '' : 's'}</span></div>
        <LineaTiempoContacto c={conflicto} />
      </section>

      <form className="tarjeta" onSubmit={guardar}>
        <div className="bloque-cab"><h3>Fijar los datos definitivos a mano</h3></div>
        <p className="pequeno atenuado">Lo que guardes aquí sustituye a las propuestas pendientes, que quedan como superadas, y cuenta como modificación aprobada a tu nombre.</p>
        {error && <div className="aviso error">{error}</div>}
        <div className="fila-form">{campo('nombre', 'Nombre *')}{campo('apellido', 'Apellido *')}</div>
        <div className="fila-form">
          <div>
            <label className="etiqueta" htmlFor="r-dpto">Departamento *</label>
            <select id="r-dpto" value={datos.desc_dpto} onChange={(e) => setDatos({ ...datos, desc_dpto: e.target.value, desc_funcion: '' })}>
              {!dpto && <option value={datos.desc_dpto}>{datos.desc_dpto || 'Elige…'}</option>}
              {catalogo?.departamentos.map((d) => <option key={d.nombre} value={d.nombre}>{d.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="r-func">Función *</label>
            <select id="r-func" value={datos.desc_funcion} onChange={(e) => setDatos({ ...datos, desc_funcion: e.target.value })}>
              {!dpto?.funciones.some((f) => f.nombre === datos.desc_funcion) && <option value={datos.desc_funcion}>{datos.desc_funcion || 'Elige…'}</option>}
              {dpto?.funciones.map((f) => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="fila-form">{campo('email', 'Email')}{campo('tel_contacto', 'Móvil/directo de la persona')}</div>
        <div className="fila-form">{campo('telefono', 'Teléfono centralita (cliente)')}{campo('tel_ad1', 'Teléfono adicional 1')}</div>
        <details className="mas-telefonos">
          <summary>Más teléfonos adicionales</summary>
          <div className="fila-form">{(['tel_ad2', 'tel_ad3', 'tel_ad4', 'tel_ad5'] as const).map((k, i) => <div key={k}>{campo(k, `Teléfono adicional ${i + 2}`)}</div>)}</div>
        </details>
        <label className="etiqueta" htmlFor="r-com">Comentario</label>
        <input id="r-com" placeholder="Por qué se resuelve así (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
        <div className="botones">
          <button type="submit" className="btn btn-accion guardar" disabled={enviando}>
            <span className="ico"><Icono n="check" /></span>{enviando ? 'Guardando…' : 'Guardar y cerrar el conflicto'}
          </button>
          <button type="button" className="btn" onClick={() => navegar('/conflictos')}>Cancelar</button>
        </div>
        <p className="ayuda-campo">Campos que cambian respecto a lo que hay ahora:{' '}
          {CAMPOS.filter(({ k }) => original?.[k] !== datos[k]).map((c) => c.t).join(', ') || 'ninguno'}.</p>
      </form>
    </>
  );
};
