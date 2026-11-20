import type { MouseEvent } from 'react';
import type { Avance, Estado, TipoPropuesta } from '../../../shared/tipos';
import { ESTADO_TEXTO, ESTADOS } from '../../../shared/tipos';
import type { Consulta } from '../api';
import { num, pct } from '../util';
import { Anillo } from './Anillo';

export type AbrirListado = (consulta: Consulta, titulo: string) => void;

const TITULO_ESTADO: Record<Estado, string> = {
  pendiente: 'Contactos pendientes de revisar',
  ok: 'Contactos marcados OK',
  modificado: 'Contactos modificados',
  baja: 'Contactos dados de baja',
  conflicto: 'Contactos en conflicto',
};

const APROBADOS: { tipo: TipoPropuesta; nombre: string; titulo: string }[] = [
  { tipo: 'alta', nombre: 'altas', titulo: 'Altas aprobadas' },
  { tipo: 'modificacion', nombre: 'modificaciones', titulo: 'Modificaciones aprobadas' },
  { tipo: 'baja', nombre: 'bajas', titulo: 'Bajas aprobadas' },
];

const sinNavegar = (fn: () => void) => (ev: MouseEvent) => { ev.preventDefault(); fn(); };

/** Una cifra con su texto: si hay algo, un clic abre esos contactos */
const Ficha = ({ n, nombre, clase, onClick }: { n: number; nombre: string; clase: string; onClick: () => void }) => {
  const dentro = <><b>{num(n)}</b><span>{nombre}</span></>;
  return n
    ? <a href="#" className={`aprob ${clase}`} onClick={sinNavegar(onClick)}>{dentro}</a>
    : <div className={`aprob ${clase} vacio`}>{dentro}</div>;
};

/** Cabecera del avance: anillo con el % revisado y las cifras que piden acción */
export const Kpis = ({ k }: { k: Avance['kpis'] }) => (
  <section className="resumen-hero">
    <div className="hero-anillo">
      <Anillo pct={pct(k.revisados, k.contactos)} tam={148} grosor={14} texto="revisado" />
      <div>
        <div className="hero-cifra">{num(k.revisados)} <span>de {num(k.contactos)}</span></div>
        <div className="hero-texto">contactos revisados en la campaña</div>
      </div>
    </div>
    <dl className="hero-datos">
      <div className={k.propuestasPendientes ? 'aviso-dato' : ''}>
        <dt>Propuestas pendientes</dt><dd>{num(k.propuestasPendientes)}</dd>
      </div>
      <div className={k.conflictos ? 'alerta-dato' : ''}>
        <dt>En conflicto</dt><dd>{num(k.conflictos)}</dd>
      </div>
      <div>
        <dt>Comerciales sin entrar</dt><dd>{num(k.comercialesSinEntrar)} <span>/ {num(k.comerciales)}</span></dd>
      </div>
      <div>
        <dt>Contactos en la campaña</dt><dd>{num(k.contactos)}</dd>
      </div>
    </dl>
  </section>
);

/** Estados como una sola barra segmentada; la leyenda abre el listado de cada estado. Debajo, email y móvil. */
export const PanelEstados = ({ a, abrir }: { a: Avance; abrir: AbrirListado }) => (
  <section className="tarjeta bloque">
    <header className="bloque-cab"><h3>Estado de los contactos</h3><span>pulsa un estado para ver sus contactos</span></header>
    <div className="segmentos" role="img" aria-label="Reparto de contactos por estado">
      {ESTADOS.filter((e) => a.estados[e]).map((e) => (
        <span key={e} className={`seg est-${e}`} style={{ flexGrow: a.estados[e] }} title={`${ESTADO_TEXTO[e]}: ${num(a.estados[e])}`} />
      ))}
    </div>
    <ul className="leyenda">
      {ESTADOS.map((e) => {
        const n = a.estados[e];
        const dentro = <><i className={`punto est-${e}`} /><span className="ley-nombre">{ESTADO_TEXTO[e]}</span><b>{num(n)}</b><small>{Math.round(pct(n, a.kpis.contactos))}%</small></>;
        return (
          <li key={e}>
            {n ? <a href="#" onClick={sinNavegar(() => abrir({ de: 'estado', estado: e }, TITULO_ESTADO[e]))}>{dentro}</a> : <span className="vacio">{dentro}</span>}
          </li>
        );
      })}
    </ul>
    <header className="bloque-cab bloque-sub"><h3>Email y móvil</h3><span>obligatorios para validar · justificado = «no tiene», con motivo</span></header>
    <div className="aprobados-fila">
      <Ficha n={a.datos.sinEmail} nombre="sin email (justificado)" clase="tipo-justificado"
        onClick={() => abrir({ de: 'datos', tipo: 'sin_email' }, 'Sin email (justificado)')} />
      <Ficha n={a.datos.sinMovil} nombre="sin móvil (justificado)" clase="tipo-justificado"
        onClick={() => abrir({ de: 'datos', tipo: 'sin_movil' }, 'Sin móvil (justificado)')} />
      <Ficha n={a.datos.falta} nombre="les falta email o móvil" clase="tipo-falta"
        onClick={() => abrir({ de: 'datos', tipo: 'falta' }, 'Les falta el email o el móvil')} />
    </div>
  </section>
);

/** Cambios aprobados (lo que irá a la hoja CAMBIOS) y quién contesta las encuestas */
export const PanelAprobados = ({ a, abrir }: { a: Avance; abrir: AbrirListado }) => (
  <section className="tarjeta bloque">
    <header className="bloque-cab"><h3>Cambios aprobados</h3><span>van a la hoja CAMBIOS</span></header>
    <div className="aprobados-fila">
      {APROBADOS.map(({ tipo, nombre, titulo }) => (
        <Ficha key={tipo} n={a.aprobados[tipo]} nombre={nombre} clase={`tipo-${tipo}`} onClick={() => abrir({ de: 'aprobado', tipo }, titulo)} />
      ))}
    </div>
    <header className="bloque-cab bloque-sub"><h3>Contestan encuestas</h3><span>columnas SI/NO del Excel</span></header>
    <div className="aprobados-fila dos">
      <Ficha n={a.encuestas.ventas} nombre="encuesta de ventas" clase="tipo-encuesta"
        onClick={() => abrir({ de: 'encuesta', tipo: 'ventas' }, 'Contestan la encuesta de ventas')} />
      <Ficha n={a.encuestas.postventa} nombre="encuesta de postventa" clase="tipo-encuesta"
        onClick={() => abrir({ de: 'encuesta', tipo: 'postventa' }, 'Contestan la encuesta de postventa')} />
    </div>
    <p className="nota-pie">Los <b>{num(a.estados.ok)}</b> contactos marcados OK no son un cambio: salen en la hoja ESTADO del Excel.</p>
  </section>
);
