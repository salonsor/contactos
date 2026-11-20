import { useEffect, useState, type ReactNode } from 'react';
import type { Actividad, Ficha } from '../../../shared/tipos';
import { ACCION_TEXTO, ESTADO_TEXTO, faltanDatos } from '../../../shared/tipos';
import { api } from '../api';
import { fmtFecha, inicialesContacto } from '../util';
import { DiffPropuesta, NOMBRE_TIPO } from './DiffPropuesta';
import { Icono } from './Icono';

// Un dato = etiqueta arriba y valor debajo; los vacíos, atenuados para que se note que faltan
const Dato = ({ k, v, tipo, icono }: { k: string; v: ReactNode; tipo?: 'mail' | 'tel'; icono?: Parameters<typeof Icono>[0]['n'] }) => {
  let valor: ReactNode = <span className="atenuado">—</span>;
  if (v) valor = typeof v === 'string' && tipo === 'mail' ? <a href={`mailto:${v}`}>{v}</a> : typeof v === 'string' && tipo === 'tel' ? <a href={`tel:${v}`}>{v}</a> : v;
  return <div className="dato">{icono && <span className="dato-ico"><Icono n={icono} /></span>}<span><span className="etiqueta">{k}</span><span className="valor">{valor}</span></span></div>;
};

/** «Marta marcó OK» · «Administrador modificó · en nombre de SOTO VEGA, LUCIA» */
export const textoActividad = (a: Actividad) => {
  const accion = ACCION_TEXTO[a.accion] ?? a.accion;
  return a.admin
    ? <><b>{a.admin}</b> {accion} · <span className="atenuado">en nombre de {a.usuario}</span></>
    : <><b>{a.usuario}</b> {accion}</>;
};

export const LineaTiempo = ({ actividad, conContacto = false }: { actividad: Actividad[]; conContacto?: boolean }) => (
  <ul className="linea-tiempo">
    {actividad.map((a) => (
      <li key={a.id}>
        <div>{textoActividad(a)}{conContacto && a.contacto && <> · <b>{a.contacto}</b></>}{a.detalle && <span className="atenuado"> · {a.detalle}</span>}</div>
        <small>{fmtFecha(a.fecha)}</small>
      </li>
    ))}
    {!actividad.length && <li className="atenuado">Sin actividad registrada.</li>}
  </ul>
);

const Cuerpo = ({ c }: { c: Ficha }) => {
  const falta = faltanDatos({ ...c, tel_ad1: c.tel_adicionales[0] ?? '', tel_ad2: c.tel_adicionales[1] ?? '', tel_ad3: c.tel_adicionales[2] ?? '',
    tel_ad4: c.tel_adicionales[3] ?? '', tel_ad5: c.tel_adicionales[4] ?? '' });
  const emailMovil = falta.email || falta.movil
    ? <span className="chip prop-rechazada">falta {falta.email && falta.movil ? 'email y móvil' : falta.email ? 'el email' : 'el móvil'}</span>
    : c.sin_email || c.sin_movil ? <span className="chip admin">justificado</span> : <span className="chip nuevo">completos</span>;
  return (
    <>
      <div className="ficha-linea">
        <span className={`badge ${c.estado}`}>{ESTADO_TEXTO[c.estado]}</span>
        {c.es_alta && <span className="chip nuevo">NUEVO</span>}
        <span className="ficha-cargo">{c.desc_funcion || 'Sin función'}</span>
        <span className="atenuado">· {c.desc_dpto || 'Sin departamento'}</span>
      </div>

      <div className="ficha-cols">
        <div className="ficha-sec">
          <div className="ficha-sec-titulo"><Icono n="correo" />Datos de contacto</div>
          <Dato k="Email" v={c.email || (c.sin_email ? <span className="atenuado">no tiene: {c.motivo_sin_email}</span> : '')} tipo="mail" icono="correo" />
          <div className="ficha-2">
            <Dato k="Móvil / directo" v={c.tel_contacto} tipo="tel" icono="llave" />
            <Dato k="Centralita" v={c.telefono} tipo="tel" icono="cliente" />
          </div>
          <Dato k="Teléfonos adicionales" icono="mas" v={c.tel_adicionales.length
            ? <>{c.tel_adicionales.map((t, i) => <span key={i}>{i > 0 && ' · '}<a href={`tel:${t}`}>{t}</a></span>)}</> : ''} />
          {c.sin_movil && <Dato k="Sin móvil" v={<span className="atenuado">no tiene: {c.motivo_sin_movil}</span>} />}
          <div className="ficha-2">
            <Dato k="Contesta encuestas" icono="bandeja" v={[c.enc_ventas && 'Ventas', c.enc_postventa && 'Postventa'].filter(Boolean).join(' y ')} />
            <Dato k="Email y móvil" icono="check" v={emailMovil} />
          </div>
        </div>
        <div className="ficha-sec">
          <div className="ficha-sec-titulo"><Icono n="cliente" />Cliente</div>
          <Dato k="Cliente" v={c.cliente} />
          <div className="ficha-2">
            <Dato k="Localidad" v={`${c.localidad}${c.provincia ? ` · ${c.provincia}` : ''}`} />
            <Dato k="Nº contacto" v={c.num_contacto ? <span className="mono">{c.num_contacto}</span> : <span className="atenuado">sin asignar</span>} />
          </div>
          <div className="ficha-2"><Dato k="Pagador" v={c.pagador} /><Dato k="Solicitante" v={c.solicitante} /></div>
          {(c.cod_dpto || c.cod_funcion) && <Dato k="Códigos dpto. / función" v={<span className="mono">{c.cod_dpto || '—'} / {c.cod_funcion || '—'}</span>} />}
          <Dato k={c.ven.length > 1 ? 'Lo ven' : 'Lo ve'} v={<>{c.ven.map((v, i) => (
            <div key={i}>{v.comercial} <span className={'chip unidad ' + (v.unidad.startsWith('POSTVENTA') ? 'postventa' : 'venta')}>{v.unidad_texto}</span></div>
          ))}</>} />
        </div>
      </div>

      <div className={'nota ficha-nota' + (c.validado_por ? ' validado' : '')}>
        {c.validado_por ? (
          <>Validado por <b>{c.validado_por}</b> el {fmtFecha(c.validado_en)}
            {c.validado_admin && <> · <b>hecho por el administrador {c.validado_admin}</b></>}</>
        ) : 'Todavía no lo ha revisado ningún comercial.'}
      </div>

      <div className="ficha-sec-titulo ficha-props">
        <Icono n="bandeja" />Propuestas{c.propuestas.length > 0 && <> <span className="contador">{c.propuestas.length}</span></>}
      </div>
      {!c.propuestas.length && <div className="atenuado pequeno">Sin propuestas.</div>}
      {c.propuestas.map((p) => (
        <div key={p.id} className={`propuesta-enfrentada sep tipo-${p.tipo}`}>
          <div className="pequeno">
            <span className={`chip tipo-${p.tipo}`}>{NOMBRE_TIPO[p.tipo]}</span> de <b>{p.comercial}</b> el {fmtFecha(p.creado_en)}
            {p.admin && <> · <span className="chip admin">hecho por el administrador {p.admin}</span></>}
            {' · '}<span className={`chip prop-${p.estado}`}>{p.estado}</span>
            {p.en_conflicto && p.estado === 'pendiente' && ' · en conflicto, sin aplicar'}
            {p.resuelto_en && ` el ${fmtFecha(p.resuelto_en)}`}{p.resuelto_por && ` por ${p.resuelto_por}`}
            {p.comentario && ` · «${p.comentario}»`}
          </div>
          <DiffPropuesta p={p} />
        </div>
      ))}

      <div className="ficha-sec-titulo ficha-props"><Icono n="reloj" />Registro de actividad <small className="atenuado">quién hizo qué y cuándo</small></div>
      <LineaTiempo actividad={c.actividad} />
    </>
  );
};

export const VentanaFicha = ({ id, onCerrar }: { id: number; onCerrar: () => void }) => {
  const [c, setC] = useState<Ficha | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    api.ficha(id).then((f) => { if (vigente) setC(f); }).catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [id]);

  return (
    <div id="ficha-overlay" className="open" onClick={(ev) => { if (ev.target === ev.currentTarget) onCerrar(); }}>
      <div id="ficha-modal" role="dialog" aria-labelledby="ficha-titulo">
        <div id="ficha-modal-header">
          <span className={'avatar-contacto' + (c ? ` est-${c.estado}` : '')}>{c ? inicialesContacto(c) : ''}</span>
          <div className="crece">
            <h2 id="ficha-titulo">{c ? `${c.nombre} ${c.apellido}` : 'Contacto'}</h2>
            <p>{c ? `${c.cliente} · ${c.localidad}` : ''}</p>
          </div>
          <button className="modal-cerrar" type="button" title="Cerrar (Esc)" onClick={onCerrar}><Icono n="cerrar" /></button>
        </div>
        <div id="ficha-modal-body">
          {error ? <div className="aviso error">No se ha podido cargar la ficha.</div>
            : c ? <Cuerpo c={c} /> : <div className="atenuado">Cargando…</div>}
        </div>
      </div>
    </div>
  );
};
