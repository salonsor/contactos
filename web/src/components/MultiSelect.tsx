import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { normalizar } from '../util';
import { Icono } from './Icono';

export interface Opcion {
  id: number | string;
  nombre: string;
  detalle: string;
}

/** null = todos; un conjunto vacío = ninguno */
export type Seleccion = Set<number | string> | null;

interface Props {
  etiqueta: string;
  /** Sin buscador (listas cortas, como estado o tipo) */
  sinBuscar?: boolean;
  opciones: Opcion[];
  seleccion: Seleccion;
  onChange: (s: Seleccion) => void;
}

/**
 * Desplegable de selección múltiple con buscador (patrón del Dashboard PCC): escribir filtra sin tildes,
 * Enter se queda con todos los que coinciden, clic en un nombre selecciona solo ese y la casilla marca o
 * desmarca uno a uno. «Todos» y «Ninguno» arriba del listado.
 */
export const MultiSelect = ({ etiqueta, opciones, seleccion, onChange, sinBuscar }: Props) => {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const caja = useRef<HTMLDivElement>(null);
  const buscar = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: globalThis.MouseEvent) => { if (!caja.current?.contains(ev.target as Node)) setAbierto(false); };
    document.addEventListener('click', fuera);
    return () => document.removeEventListener('click', fuera);
  }, [abierto]);

  const visibles = useMemo(() => {
    const q = normalizar(texto);
    return opciones.filter((o) => !q || normalizar(o.nombre + ' ' + o.detalle).includes(q));
  }, [opciones, texto]);

  // Si al final quedan todas marcadas, equivale a «todos»
  const fijar = (s: Set<number | string>) => onChange(s.size === opciones.length ? null : s);

  const alternar = (id: number | string, marcar: boolean) => {
    const s = new Set(seleccion ?? []);
    if (marcar) s.add(id); else s.delete(id);
    fijar(s);
  };

  const alEscribir = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    fijar(new Set(visibles.map((o) => o.id)));
  };

  const accion = (ev: MouseEvent, s: Seleccion) => { ev.preventDefault(); onChange(s); };

  const elegidos = seleccion ? opciones.filter((o) => seleccion.has(o.id)) : [];
  const resumen = !seleccion ? 'Todos'
    : !elegidos.length ? 'Ninguno'
    : elegidos.length === 1 ? elegidos[0].nombre
    : `${elegidos.length} seleccionados`;

  return (
    <div className="ms-wrap" ref={caja}>
      <button type="button" className={'ms-btn' + (abierto ? ' open' : '')}
        onClick={() => { setAbierto(!abierto); setTexto(''); setTimeout(() => buscar.current?.focus()); }}>
        <span className="ms-ico"><Icono n="contactos" /></span>
        <span className="ms-etiqueta">{etiqueta}</span><span className="ms-texto">{resumen}</span>
      </button>
      <div className={'ms-panel' + (abierto ? ' open' : '')}>
        <div className="ms-buscar-wrap" hidden={sinBuscar}>
          <input ref={buscar} className="ms-buscar" type="search" placeholder="Escribe unas letras…" autoComplete="off"
            value={texto} onChange={(ev) => setTexto(ev.target.value)} onKeyDown={alEscribir} />
        </div>
        <div className="ms-acciones">
          <a href="#" onClick={(ev) => accion(ev, null)}>Todos</a>
          <a href="#" onClick={(ev) => accion(ev, new Set())}>Ninguno</a>
        </div>
        <div className="ms-lista">
          {visibles.length ? visibles.map((o) => (
            <div key={o.id} className="ms-item">
              <input type="checkbox" id={`ms-${etiqueta}-${o.id}`} checked={!!seleccion?.has(o.id)}
                onChange={(ev) => alternar(o.id, ev.target.checked)} />
              <label htmlFor={`ms-${etiqueta}-${o.id}`} title="Clic en el nombre: solo este"
                onClick={(ev) => { ev.preventDefault(); fijar(new Set([o.id])); }}>
                {o.nombre}<small>{o.detalle}</small>
              </label>
            </div>
          )) : <div className="ms-vacio">Sin coincidencias</div>}
        </div>
      </div>
    </div>
  );
};
