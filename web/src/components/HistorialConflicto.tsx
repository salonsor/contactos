import type { Actividad, Conflicto, Propuesta } from '../../../shared/tipos';
import { CAMPOS, ESTADO_PROPUESTA_TEXTO } from '../../../shared/tipos';
import { fmtFecha } from '../util';
import { NOMBRE_TIPO } from './DiffPropuesta';

const nombreTipo = (p: Pick<Propuesta, 'tipo' | 'en_conflicto'>) =>
  p.tipo === 'modificacion' && p.en_conflicto ? 'Corrección' : NOMBRE_TIPO[p.tipo];

/** Campos que han cambiado alguna vez o que cambia alguna de las propuestas enfrentadas */
const camposTocados = (c: Conflicto) => {
  const tocados = new Set(c.historial.filter((p) => p.tipo !== 'alta').flatMap((p) => (p.diff ?? []).map((d) => d[0])));
  return CAMPOS.filter(({ k, t }) => tocados.has(t) || c.inicial[k] !== c.datos[k]);
};

/**
 * Las versiones en juego, campo a campo: cómo empezó, lo que hay ahora (lo validado) y lo que dejaría cada propuesta
 * enfrentada si se aprobara. Lo que difiere de «Ahora» se resalta.
 */
export const ComparativaVersiones = ({ c }: { c: Conflicto }) => {
  const campos = camposTocados(c);
  if (!campos.length) return <p className="pequeno atenuado">Ninguna propuesta cambia datos: solo se enfrentan bajas a lo validado.</p>;
  const valor = (p: Propuesta, t: string, ahora: string) => p.diff?.find((d) => d[0] === t)?.[2] ?? ahora;
  return (
    <div className="desplaza-x">
      <table className="tabla comparativa">
        <thead>
          <tr>
            <th>Campo</th>
            <th className="col-inicio">Al inicio</th>
            <th className="col-ahora">Ahora<div className="sub">{c.validado_por ? <>validado por {c.validado_por}<br />{fmtFecha(c.validado_en)}</> : 'sin validar'}</div></th>
            {c.propuestas.map((p) => (
              <th key={p.id} className={`col-prop tipo-${p.tipo}`}>
                {nombreTipo(p)} de {p.comercial}
                <div className="sub">{fmtFecha(p.creado_en)} · sin aplicar</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campos.map(({ k, t }, i) => {
            const ahora = c.datos[k];
            return (
              <tr key={k}>
                <td className="campo">{t}</td>
                <td className={`col-inicio${c.inicial[k] !== ahora ? ' cambio' : ''}`}>{c.inicial[k] || '—'}</td>
                <td className="col-ahora">{ahora || '—'}</td>
                {c.propuestas.map((p) => {
                  if (p.tipo === 'baja') {
                    return i === 0
                      ? <td key={p.id} rowSpan={campos.length} className="col-prop baja"><b>Dar de baja</b><div>Motivo: {p.motivo || '—'}</div></td>
                      : null;
                  }
                  const v = valor(p, t, ahora);
                  return v === ahora
                    ? <td key={p.id} className="col-prop igual">= igual</td>
                    : <td key={p.id} className="col-prop distinto">{v || '— (vacío)'}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Una resolución a mano con cambios ya figura como modificación aprobada
const actividadVisible = (c: Conflicto) => c.actividad.filter((a) => a.accion !== 'resolver' || a.detalle === 'sin cambios en los datos');

type Evento = { fecha: string; orden: number } & ({ p: Propuesta } | { a: Actividad });

const TEXTO_ACTIVIDAD: Record<string, string> = {
  ok: 'Validado como OK',
  sin_datos: 'Indica que falta un dato',
  resolver: 'Conflicto resuelto a mano',
};

const estadoPropuesta = (p: Propuesta) => {
  if (p.estado === 'pendiente') {
    return p.en_conflicto
      ? <span className="chip prop-pendiente">en conflicto · sin aplicar</span>
      : <span className="chip prop-pendiente">pendiente · aplicada provisionalmente</span>;
  }
  return <span className={`chip prop-${p.estado}`}>{ESTADO_PROPUESTA_TEXTO[p.estado].replace(/s$/, '').toLowerCase()}
    {p.resuelto_en && ` el ${fmtFecha(p.resuelto_en)}`}{p.resuelto_por && ` · ${p.resuelto_por}`}</span>;
};

/** Todo lo que ha pasado con el contacto, en orden: validaciones, cambios (con su antes y después) y cómo acabó cada uno */
export const LineaTiempoContacto = ({ c }: { c: Conflicto }) => {
  const eventos: Evento[] = [
    ...c.historial.map((p, i) => ({ fecha: p.creado_en, orden: i, p })),
    ...actividadVisible(c).map((a, i) => ({ fecha: a.fecha, orden: i, a })),
  ].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.orden - y.orden);
  if (!eventos.length) return <p className="pequeno atenuado">Sin movimientos registrados.</p>;

  return (
    <ol className="linea-tiempo historial">
      {eventos.map((e) => {
        if ('a' in e) {
          const a = e.a;
          return (
            <li key={`a${a.id}`} className={`ev-${a.accion}`}>
              <small>{fmtFecha(a.fecha)}</small>
              <div><b>{TEXTO_ACTIVIDAD[a.accion] ?? a.accion}</b> · {a.usuario ?? '—'}{a.admin && <> <span className="chip admin">admin {a.admin}</span></>}
                {a.detalle && a.accion !== 'ok' && <span className="atenuado"> — {a.detalle}</span>}</div>
            </li>
          );
        }
        const p = e.p;
        const enfrentada = p.estado === 'pendiente' && p.en_conflicto;
        const filas = p.tipo === 'alta' ? (p.diff ?? []).filter((d) => d[2]) : (p.diff ?? []);
        return (
          <li key={`p${p.id}`} className={`ev-prop tipo-${p.tipo}${enfrentada ? ' enfrentada' : ''}`}>
            <small>{fmtFecha(p.creado_en)}</small>
            <div className="ev-cab">
              <span className={`chip tipo-${p.tipo}`}>{nombreTipo(p)}</span> de <b>{p.comercial}</b>
              {p.admin && <> <span className="chip admin">admin {p.admin}</span></>} {estadoPropuesta(p)}
            </div>
            {p.tipo === 'baja'
              ? <div className="ev-cambios">Motivo: {p.motivo || '—'}</div>
              : !!filas.length && (
                <ul className="ev-cambios">
                  {filas.map(([campo, antes, despues]) => (
                    <li key={campo}><span className="atenuado">{campo}:</span>{' '}
                      {p.tipo === 'alta' ? <b>{despues}</b> : <><s>{antes || '—'}</s> → <b>{despues || '— (vacío)'}</b></>}</li>
                  ))}
                </ul>
              )}
            {p.comentario && <div className="pequeno atenuado">«{p.comentario}»</div>}
          </li>
        );
      })}
    </ol>
  );
};

/** Nº de movimientos del historial (para el conmutador) */
export const movimientos = (c: Conflicto) => c.historial.length + actividadVisible(c).length;
