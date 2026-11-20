import type { ReactNode } from 'react';
import { useBloquearFondo, useEscCierra } from '../hooks';
import { Icono } from './Icono';

interface Props {
  titulo: string;
  sub?: string;
  icono?: ReactNode;
  onCerrar: () => void;
  children: ReactNode;
}

/** Ventana modal con las mismas piezas que la ficha del contacto */
export const Ventana = ({ titulo, sub, icono, onCerrar, children }: Props) => {
  useBloquearFondo(true);
  useEscCierra(onCerrar);
  return (
    <div id="ficha-overlay" className="open" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onCerrar(); }}>
      <div id="ficha-modal" role="dialog" aria-labelledby="ventana-titulo">
        <div id="ficha-modal-header">
          {icono}
          <div className="crece">
            <h2 id="ventana-titulo">{titulo}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button className="modal-cerrar" type="button" title="Cerrar (Esc)" onClick={onCerrar}><Icono n="cerrar" /></button>
        </div>
        <div id="ficha-modal-body">{children}</div>
      </div>
    </div>
  );
};
