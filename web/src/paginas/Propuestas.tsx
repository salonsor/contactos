import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Contadores, EstadoPropuesta, PropuestaAdmin, TipoPropuesta, UsuarioAdmin } from '../../../shared/tipos';
import { ESTADO_PROPUESTA_TEXTO, ESTADO_TEXTO, ESTADOS_PROPUESTA } from '../../../shared/tipos';
import { api } from '../api';
import { DiffPropuesta, NOMBRE_TIPO, queCambia } from '../components/DiffPropuesta';
import { Icono } from '../components/Icono';
import { MultiSelect, type Seleccion } from '../components/MultiSelect';
import { VentanaFicha } from '../components/VentanaFicha';
import { useBloquearFondo, useEscCierra } from '../hooks';
import { fmtFecha, num } from '../util';

const TIPOS: TipoPropuesta[] = ['modificacion', 'alta', 'baja'];
const aSeleccion = (v: string | null): Seleccion => (v ? new Set(v.split(',').filter(Boolean)) : null);
const NINGUNO = 'ninguno';
/** Selección del desplegable → parámetro de la URL: null = todos (se quita), conjunto vacío = ninguno */
const aParam = (s: Seleccion) => (!s ? null : s.size ? [...s].join(',') : NINGUNO);

export const Propuestas = () => {
  const [params, setParams] = useSearchParams();
  // Por defecto, las pendientes; el resto de filtros, todos
  const estado = params.get('estado') ?? 'pendiente';
  const tipo = params.get('tipo') ?? '';
  const comercial = params.get('comercial') ?? '';
  const fijar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k); else p.set(k, v);
    }
    setParams(p, { replace: true });
  };

  const [lista, setLista] = useState<PropuestaAdmin[] | null>(null);
  const [pendientes, setPendientes] = useState<PropuestaAdmin[]>([]);
  const [cont, setCont] = useState<Contadores | null>(null);
  const [enConflicto, setEnConflicto] = useState(0);
  const [comerciales, setComerciales] = useState<UsuarioAdmin[]>([]);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const [todasAbiertas, setTodasAbiertas] = useState(false);
  const [comentario, setComentario] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error' | 'alerta'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fichaId, setFichaId] = useState<number | null>(null);
  useBloquearFondo(fichaId !== null);
  useEscCierra(fichaId !== null ? () => setFichaId(null) : null);

  const cargar = useCallback(() => {
    // «Ninguno» en cualquiera de los desplegables deja la lista vacía
    if ([estado, tipo, comercial].includes(NINGUNO)) { setLista([]); setMarcadas(new Set()); }
    // Las que están en conflicto no salen aquí: se resuelven en Conflictos
    else api.propuestas({ estado, tipo, comercial, conflicto: 'no' }).then((l) => { setLista(l); setMarcadas(new Set()); })
      .catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }));
    // Para las cajas de arriba: todas las pendientes, sin filtros
    api.propuestas({ estado: 'pendiente', tipo: '', comercial: '', conflicto: 'no' }).then(setPendientes).catch(() => {});
    api.contadores().then(setCont).catch(() => {});
    api.propuestas({ estado: 'pendiente', tipo: '', comercial: '' }).then((l) => setEnConflicto(l.filter((p) => p.en_conflicto).length)).catch(() => {});
  }, [estado, tipo, comercial]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { api.usuarios().then((u) => setComerciales(u.filter((x) => x.esComercial))).catch(() => {}); }, []);

  const decidibles = useMemo(() => (lista ?? []).filter((p) => p.estado === 'pendiente' && !p.en_conflicto), [lista]);
  const porTipo = (t: string) => pendientes.filter((p) => !t || p.tipo === t).length;

  const decidir = async (ids: number[], accion: 'aprobar' | 'rechazar') => {
    if (!ids.length) return;
    if (ids.length > 1 && !window.confirm(`¿${accion === 'aprobar' ? 'Aprobar' : 'Rechazar'} ${ids.length} propuestas?`)) return;
    setOcupado(true);
    try {
      const r = await api.decidir(ids, accion, comentario.trim());
      setAviso(r.errores.length
        ? { tipo: 'alerta', texto: `${r.hechas} hecha(s). No se pudieron decidir ${r.errores.length}: ${r.errores.join(' · ')}` }
        : { tipo: 'ok', texto: `${r.hechas} propuesta${r.hechas === 1 ? '' : 's'} ${accion === 'aprobar' ? 'aprobada' : 'rechazada'}${r.hechas === 1 ? '' : 's'}.` });
      setComentario('');
      cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  const alternar = (setter: typeof setMarcadas, id: number) => setter((m) => {
    const n = new Set(m);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const todas = decidibles.length > 0 && decidibles.every((p) => marcadas.has(p.id));
  const caja = (t: string, clase: string, etiqueta: string, sub: string, ico: Parameters<typeof Icono>[0]['n']) => (
    <a key={t} href="#" className={`kpi ${clase}` + (estado === 'pendiente' && tipo === t ? ' activa' : '')}
      onClick={(e) => { e.preventDefault(); fijar({ estado: null, tipo: t || null }); }}>
      <div><div className="etiqueta">{etiqueta}</div><div className="cifra">{num(porTipo(t))}</div><div className="sub">{sub}</div></div>
      <span className="ico"><Icono n={ico} /></span>
    </a>
  );

  return (
    <>
      <div className="cabecera-pagina"><div><h2>Propuestas de los comerciales</h2></div></div>

      <div className="kpis cinco">
        {caja('', 'c-ambar', 'Pendientes', 'por decidir', 'bandeja')}
        {caja('modificacion', 'c-azul', 'Modificaciones', 'datos que cambian', 'modificacion')}
        {caja('alta', 'c-verde', 'Altas', 'contactos nuevos', 'alta')}
        {caja('baja', 'c-rojo', 'Bajas', 'contactos que salen', 'baja')}
        <Link to="/conflictos" className="kpi c-carbon">
          <div><div className="etiqueta">En conflicto</div><div className="cifra">{num(cont?.conflictos ?? 0)}</div><div className="sub">se resuelven en Conflictos</div></div>
          <span className="ico"><Icono n="aviso" /></span>
        </Link>
      </div>

      <section className="tarjeta filtros">
        <div className="bloque-cab"><h3>Filtrar la lista</h3><span>{lista ? `${num(lista.length)} propuesta${lista.length === 1 ? '' : 's'} con este filtro` : ''} · se aplica al marcar</span></div>
        <div className="filtros-tabla">
          {/* Estado: sin parámetro = pendientes; «todos» se guarda como cadena vacía */}
          <MultiSelect etiqueta="Estado" sinBuscar seleccion={aSeleccion(estado)}
            onChange={(s) => fijar({ estado: aParam(s) ?? '' })}
            opciones={ESTADOS_PROPUESTA.map((e) => ({ id: e, nombre: ESTADO_PROPUESTA_TEXTO[e as EstadoPropuesta], detalle: '' }))} />
          <MultiSelect etiqueta="Tipo" sinBuscar seleccion={aSeleccion(tipo)} onChange={(s) => fijar({ tipo: aParam(s) })}
            opciones={TIPOS.map((t) => ({ id: t, nombre: NOMBRE_TIPO[t], detalle: '' }))} />
          <MultiSelect etiqueta="Comercial" seleccion={comercial ? new Set(comercial.split(',').map((x) => (x === NINGUNO ? x : Number(x)))) : null}
            onChange={(s) => fijar({ comercial: aParam(s) })}
            opciones={comerciales.map((c) => ({ id: c.id, nombre: c.nombre, detalle: c.usuario }))} />
        </div>
      </section>

      {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.texto}</div>}
      {!!cont?.conflictos && (
        <div className="aviso alerta">Hay <b>{cont.conflictos} contacto{cont.conflictos === 1 ? '' : 's'} en conflicto</b>, con {enConflicto} propuesta
          {enConflicto === 1 ? '' : 's'} pendiente{enConflicto === 1 ? '' : 's'}. No aparecen en esta lista: se resuelven en{' '}
          <Link to="/conflictos">Conflictos</Link>, donde se ven las versiones enfrentadas.</div>
      )}

      <div className="lista-cab">
        <span className="contador-chip">{lista ? `${num(lista.length)} propuesta${lista.length === 1 ? '' : 's'}` : 'Cargando…'}</span>
        <button type="button" className="btn pequeno" onClick={() => { setTodasAbiertas(!todasAbiertas); setAbiertas(new Set()); }}>
          {todasAbiertas ? 'Ocultar todos los cambios' : 'Ver todos los cambios'}
        </button>
      </div>

      {lista?.map((p) => {
        const abierta = todasAbiertas !== abiertas.has(p.id);
        const decidible = p.estado === 'pendiente' && !p.en_conflicto;
        return (
          <div key={p.id} className={`tarjeta propuesta tipo-${p.tipo}`}>
            <div className="propuesta-cab">
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {decidible && (
                  <label className="marcar"><input type="checkbox" checked={marcadas.has(p.id)} onChange={() => alternar(setMarcadas, p.id)} aria-label="Marcar" /></label>
                )}
                <div>
                  <div>
                    <span className={`chip tipo-${p.tipo}`}>{NOMBRE_TIPO[p.tipo]}</span>{' '}
                    <a href="#" className="cel-clic" onClick={(e) => { e.preventDefault(); setFichaId(p.contacto_id); }}>{p.contacto || 'Sin nombre'}</a>
                    <span className="atenuado"> · {p.num_contacto ? `nº ${p.num_contacto}` : 'sin nº'} · {p.cliente} · {p.localidad}{p.unidad_texto && ` · ${p.unidad_texto}`}</span>
                    {' '}<span className={`badge ${p.estado_contacto}`}>{ESTADO_TEXTO[p.estado_contacto]}</span>
                  </div>
                  <div className="pequeno atenuado">
                    de <b>{p.comercial}</b> el {fmtFecha(p.creado_en)}
                    {p.admin && <> · <span className="chip admin">hecho por el administrador {p.admin}</span></>}
                  </div>
                  <div className="pequeno" style={{ marginTop: 4 }}>
                    {queCambia(p)}
                    {p.tipo !== 'baja' && <> · <a href="#" onClick={(e) => { e.preventDefault(); alternar(setAbiertas, p.id); }}>{abierta ? 'Ocultar cambios' : 'Ver cambios'}</a></>}
                  </div>
                </div>
              </div>
              <div>
                {p.estado === 'pendiente'
                  ? <span className="chip prop-pendiente">pendiente</span>
                  : <span className={`chip prop-${p.estado}`}>{ESTADO_PROPUESTA_TEXTO[p.estado].replace(/s$/, '').toLowerCase()} el {fmtFecha(p.resuelto_en)}{p.resuelto_por && ` · ${p.resuelto_por}`}</span>}
              </div>
            </div>
            {abierta && p.tipo !== 'baja' && <DiffPropuesta p={p} codigos={{ dpto: p.cod_dpto, funcion: p.cod_funcion }} />}
            {p.comentario && <div className="nota">«{p.comentario}»</div>}
            {decidible && (
              <div className="botones">
                <button type="button" className="btn btn-accion aprobar mini" disabled={ocupado} onClick={() => decidir([p.id], 'aprobar')}>
                  <span className="ico"><Icono n="check" /></span>Aprobar
                </button>
                <button type="button" className="btn btn-accion rechazar mini" disabled={ocupado} onClick={() => decidir([p.id], 'rechazar')}>
                  <span className="ico"><Icono n="cerrar" /></span>Rechazar
                </button>
              </div>
            )}
          </div>
        );
      })}
      {lista && !lista.length && <div className="aviso ok">No hay propuestas con ese filtro.</div>}

      {decidibles.length > 0 && (
        <section className={'tarjeta lote' + (marcadas.size ? ' flotante' : '')}>
          <div className="bloque-cab"><h3>Resolver las marcadas en bloque</h3>
            <span>marca las casillas de la izquierda · el comentario también va con Aprobar y Rechazar de una sola fila</span></div>
          <input placeholder="Comentario para el comercial (opcional): lo verá en la tarjeta del contacto" value={comentario}
            onChange={(e) => setComentario(e.target.value)} />
          <div className="botones">
            <button type="button" className="btn btn-accion aprobar" disabled={ocupado || !marcadas.size} onClick={() => decidir([...marcadas], 'aprobar')}>
              <span className="ico"><Icono n="check" /></span>Aprobar marcadas{marcadas.size ? ` (${marcadas.size})` : ''}
            </button>
            <button type="button" className="btn btn-accion rechazar" disabled={ocupado || !marcadas.size} onClick={() => decidir([...marcadas], 'rechazar')}>
              <span className="ico"><Icono n="cerrar" /></span>Rechazar marcadas
            </button>
            <button type="button" className="btn btn-accion neutro" onClick={() => setMarcadas(todas ? new Set() : new Set(decidibles.map((p) => p.id)))}>
              <span className="ico"><Icono n="todas" /></span>{todas ? 'Desmarcar todas' : 'Marcar todas'}
            </button>
          </div>
        </section>
      )}

      {fichaId !== null && <VentanaFicha key={fichaId} id={fichaId} onCerrar={() => setFichaId(null)} />}
    </>
  );
};
