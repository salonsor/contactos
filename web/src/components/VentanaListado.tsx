import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Estado, FilaContacto, Listado } from '../../../shared/tipos';
import { ESTADO_TEXTO, ESTADOS } from '../../../shared/tipos';
import { api, type Consulta } from '../api';
import { descargarCsv, inicialesContacto, normalizar, num, plural } from '../util';
import { Icono } from './Icono';

const POR_PAGINA = 100;

interface Columna {
  k: string;
  t: string;
  txt?: boolean;
  num?: boolean;
  /** Texto de la celda (pantalla, title y CSV) */
  f: (r: FilaContacto) => string;
  /** Clave de orden, si no es el texto */
  s?: (r: FilaContacto) => string | number;
  /** Contenido de la celda, si no es el texto */
  h?: (r: FilaContacto) => ReactNode;
}

const tel = (r: FilaContacto) => r.tel_contacto || r.telefono || '';
const guion = <span className="cifra-cero">—</span>;

const COL_UNIDAD: Columna = {
  k: 'unidad', t: 'Unidad', f: (r) => r.unidad_texto,
  h: (r) => <span className={'chip unidad ' + (r.unidad.startsWith('POSTVENTA') ? 'postventa' : 'venta')}>{r.unidad_texto}</span>,
};
// En el listado de toda la campaña un contacto puede verlo más de un comercial
const COL_COMERCIAL: Columna = { k: 'comerciales', t: 'Comercial', txt: true, f: (r) => r.comerciales ?? '' };

const columnas = (global: boolean): Columna[] => [
  { k: 'cliente', t: 'Cliente', txt: true, f: (r) => r.cliente, h: (r) => <b>{r.cliente}</b> },
  { k: 'localidad', t: 'Localidad', txt: true, f: (r) => r.localidad },
  global ? COL_COMERCIAL : COL_UNIDAD,
  {
    k: 'contacto', t: 'Contacto',
    f: (r) => `${r.nombre} ${r.apellido}${r.es_alta ? ' (nuevo)' : ''}`,
    s: (r) => `${r.apellido} ${r.nombre}`,
    h: (r) => (
      <span className="com-nombre">
        <span className={`avatar-mini est-${r.estado}`}>{inicialesContacto(r)}</span>
        <span>{r.nombre} {r.apellido}{r.es_alta && <> <span className="chip nuevo">nuevo</span></>}</span>
      </span>
    ),
  },
  { k: 'funcion', t: 'Función', txt: true, f: (r) => r.desc_funcion },
  { k: 'email', t: 'Email', txt: true, f: (r) => r.email, h: (r) => (r.email ? <span className="enlace">{r.email}</span> : guion) },
  { k: 'telefono', t: 'Teléfono', f: tel, h: (r) => (tel(r) ? <span className="enlace">{tel(r)}</span> : guion) },
  {
    k: 'estado', t: 'Estado', f: (r) => ESTADO_TEXTO[r.estado],
    s: (r) => ESTADOS.indexOf(r.estado),
    h: (r) => <span className={`badge ${r.estado}`}>{ESTADO_TEXTO[r.estado]}</span>,
  },
  {
    k: 'encuestas', t: 'Encuestas', f: (r) => [r.enc_ventas && 'Ventas', r.enc_postventa && 'Postventa'].filter(Boolean).join(' · '),
    h: (r) => (r.enc_ventas || r.enc_postventa
      ? <span className="encuestas-celda">{r.enc_ventas && <span className="chip nuevo">VENTAS</span>}{r.enc_postventa && <span className="chip tipo-modificacion">POSTVENTA</span>}</span>
      : guion),
  },
  { k: 'validado', t: 'Validado por', txt: true, f: (r) => r.validado_por },
  {
    k: 'pendientes', t: 'Pend.', num: true, f: (r) => String(r.pendientes), s: (r) => r.pendientes,
    h: (r) => (r.pendientes
      ? <span className="cifra-chip ambar" title="Propuestas pendientes de aprobar">{r.pendientes}</span>
      : <span className="cifra-cero">0</span>),
  },
];


interface Props {
  consulta: Consulta;
  titulo: string;
  onCerrar: () => void;
  onFicha: (id: number) => void;
}

export const VentanaListado = ({ consulta, titulo, onCerrar, onFicha }: Props) => {
  const [datos, setDatos] = useState<Listado | null>(null);
  const [error, setError] = useState(false);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<Estado | ''>('');
  const [orden, setOrden] = useState({ k: 'cliente', asc: true });
  const [pagina, setPagina] = useState(1);
  const barra = useRef<HTMLDivElement>(null);
  const [altoBarra, setAltoBarra] = useState(58);

  useEffect(() => {
    let vigente = true;
    api.listado(consulta).then((d) => { if (vigente) setDatos(d); }).catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [consulta]);

  // La cabecera de la tabla se pega justo debajo de la barra de filtros, cuya altura varía
  // (en pantallas estrechas las píldoras bajan a otra línea)
  useLayoutEffect(() => {
    if (!barra.current) return;
    const ro = new ResizeObserver(() => setAltoBarra(barra.current?.offsetHeight || 58));
    ro.observe(barra.current);
    return () => ro.disconnect();
  }, []);

  const cols = useMemo(() => columnas(!!datos?.global), [datos?.global]);
  const filas = datos?.filas ?? [];

  const visibles = useMemo(() => {
    const q = normalizar(texto);
    const col = cols.find((c) => c.k === orden.k) ?? cols[0];
    const clave = col.s ?? col.f;
    return filas
      .filter((r) => !estado || r.estado === estado)
      .filter((r) => !q || normalizar([r.cliente, r.localidad, r.nombre, r.apellido, r.desc_funcion, r.email,
        r.tel_contacto, r.telefono, r.validado_por, r.comerciales].join(' ')).includes(q))
      .sort((a, b) => {
        let va = clave(a), vb = clave(b);
        if (typeof va === 'string') va = normalizar(va);
        if (typeof vb === 'string') vb = normalizar(vb);
        return (va < vb ? -1 : va > vb ? 1 : 0) * (orden.asc ? 1 : -1);
      });
  }, [filas, cols, texto, estado, orden]);

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas);
  const enPagina = visibles.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);

  const porEstado = useMemo(() => {
    const m: Partial<Record<Estado, number>> = {};
    for (const r of filas) m[r.estado] = (m[r.estado] ?? 0) + 1;
    return m;
  }, [filas]);

  const sub = datos
    ? plural(filas.length, 'contacto') + (datos.global
      ? ' de toda la campaña'
      : (datos.unidad && filas.length ? ' · ' + filas[0].unidad_texto : '') + ' · usuario ' + (datos.comercial?.usuario ?? ''))
      + '. Clic en una cabecera ordena; clic en una fila abre la ficha.'
    : 'Clic en una cabecera ordena (el segundo clic invierte). Clic en una fila abre la ficha del contacto.';

  const csv = () => descargarCsv(titulo || 'contactos', cols.map((c) => c.t), visibles.map((r) => cols.map((c) => c.f(r))));

  return (
    <div id="det-overlay" className="open" onClick={(ev) => { if (ev.target === ev.currentTarget) onCerrar(); }}>
      <div id="det-modal" role="dialog" aria-labelledby="det-titulo">
        <div id="det-modal-header">
          <span className="modal-ico"><Icono n="contactos" /></span>
          <div className="crece">
            <h2 id="det-titulo">{titulo}</h2>
            <p id="det-sub">{sub}</p>
          </div>
          <button className="modal-cerrar" type="button" title="Cerrar (Esc)" onClick={onCerrar}><Icono n="cerrar" /></button>
        </div>
        <div id="det-modal-body" style={{ '--det-barra': `${altoBarra}px` } as CSSProperties}>
          <div className="det-barra" ref={barra}>
            <div className="det-busca">
              <span className="lupa"><Icono n="lupa" /></span>
              <input type="search" placeholder="Filtrar por cliente, nombre, email, teléfono…" autoFocus
                value={texto} onChange={(ev) => { setTexto(ev.target.value); setPagina(1); }} />
            </div>
            <div className="pildoras">
              <button type="button" className={'pildora estado' + (estado ? '' : ' activa')} onClick={() => { setEstado(''); setPagina(1); }}>
                Todos <b>{num(filas.length)}</b>
              </button>
              {ESTADOS.filter((e) => porEstado[e]).map((e) => (
                <button key={e} type="button" className={`pildora estado est-${e}` + (estado === e ? ' activa' : '')}
                  onClick={() => { setEstado(e); setPagina(1); }}>
                  <span className="punto" />{ESTADO_TEXTO[e]} <b>{num(porEstado[e]!)}</b>
                </button>
              ))}
            </div>
            <button className="btn btn-accion mini excel" type="button" title="Descarga lo que estás viendo, con el filtro y el orden aplicados" onClick={csv}>
              <span className="ico"><Icono n="descargar" /></span>CSV
            </button>
          </div>
          <table className="tabla compacta tabla-movil" id="det-tabla">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.k} className={'th-sort' + (c.num ? ' num' : '')}
                    onClick={() => setOrden((o) => (o.k === c.k ? { k: c.k, asc: !o.asc } : { k: c.k, asc: true }))}>
                    {c.t}{orden.k === c.k ? (orden.asc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td colSpan={cols.length} className="aviso error">No se ha podido cargar el listado.</td></tr>
              ) : !datos ? (
                <tr><td colSpan={cols.length} className="atenuado">Cargando…</td></tr>
              ) : enPagina.length ? enPagina.map((r) => (
                <tr key={r.id} onClick={() => onFicha(r.id)}>
                  {cols.map((c) => {
                    const v = c.f(r);
                    return <td key={c.k} data-label={c.t} className={(c.txt ? 'txt' : '') + (c.num ? ' num' : '') + ' c-' + c.k} title={v}>{c.h ? c.h(r) : v}</td>;
                  })}
                </tr>
              )) : (
                <tr><td colSpan={cols.length} className="atenuado">Sin contactos con ese filtro.</td></tr>
              )}
            </tbody>
          </table>
          <div className="det-pag">
            <span className="contador-chip">
              {plural(visibles.length, 'contacto')}{visibles.length !== filas.length ? ` de ${num(filas.length)}` : ''}
            </span>
            {paginas > 1 && (
              <>
                <button className="btn pequeno" disabled={pag === 1} onClick={() => setPagina(pag - 1)}>‹</button>
                <span>página {pag} / {paginas}</span>
                <button className="btn pequeno" disabled={pag === paginas} onClick={() => setPagina(pag + 1)}>›</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
