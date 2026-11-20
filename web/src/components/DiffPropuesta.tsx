import type { Propuesta } from '../../../shared/tipos';

/**
 * Lo que propone: motivo de la baja, datos del alta (con los códigos de departamento y función como irán al Excel) o el
 * antes y, en verde, el después de la modificación.
 */
export const DiffPropuesta = ({ p, codigos }: { p: Pick<Propuesta, 'tipo' | 'motivo' | 'diff'>; codigos?: { dpto: string; funcion: string } }) => {
  if (p.tipo === 'baja') return <div className="motivo"><span className="etiqueta">Motivo</span> {p.motivo || '—'}</div>;
  const filas = p.tipo === 'alta' ? p.diff.filter((d) => d[2]) : p.diff;
  if (!filas.length) return null;
  const conCodigo = (campo: string, valor: string) => {
    const cod = campo === 'Departamento' ? codigos?.dpto : campo === 'Función' ? codigos?.funcion : '';
    return cod ? `${valor} (${cod})` : valor;
  };
  return (
    <table className="tabla diff">
      <tbody>
        <tr><th>Campo</th>{p.tipo === 'alta' ? <th>Valor</th> : <><th>Antes</th><th>Después</th></>}</tr>
        {filas.map(([campo, antes, despues], i) => (
          <tr key={i}>
            <td>{campo}</td>
            {p.tipo !== 'alta' && <td className="viejo">{antes || '—'}</td>}
            <td className="nuevo">{p.tipo === 'alta' ? conCodigo(campo, despues) : despues || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const NOMBRE_TIPO = { modificacion: 'Modificación', alta: 'Alta', baja: 'Baja' } as const;
export const ICONO_TIPO = { modificacion: 'modificacion', alta: 'alta', baja: 'baja' } as const;

/** Resumen de una línea: qué campos cambia, «Contacto nuevo · N datos» o el motivo de la baja */
export const queCambia = (p: Pick<Propuesta, 'tipo' | 'motivo' | 'diff'>) => {
  if (p.tipo === 'baja') return `Motivo: ${p.motivo || '—'}`;
  if (p.tipo === 'alta') return `Contacto nuevo · ${p.diff.filter((d) => d[2]).length} datos`;
  return `${p.diff.length} campo${p.diff.length === 1 ? '' : 's'}: ${p.diff.map((d) => d[0]).join(', ')}`;
};
