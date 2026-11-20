import { useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link } from 'react-router';
import type { ComercialAvance, Unidad } from '../../../shared/tipos';
import { fmtFecha, inicialesComercial, normalizar, num, pct } from '../util';
import { MultiSelect, type Seleccion } from './MultiSelect';
import type { AbrirListado } from './Resumen';

type Col = 'nombre' | 'usuario' | 't' | 'r' | 'avance' | 'p' | 'entrada';

const COLUMNAS: { k: Col; t: string; num?: boolean; estilo?: CSSProperties }[] = [
  { k: 'nombre', t: 'Comercial' },
  { k: 'usuario', t: 'Usuario' },
  { k: 't', t: 'Contactos', num: true },
  { k: 'r', t: 'Revisados', num: true },
  { k: 'avance', t: 'Avance', estilo: { minWidth: 120 } },
  { k: 'p', t: 'Pendientes', num: true },
  { k: 'entrada', t: 'Última entrada' },
];

interface Props {
  comerciales: ComercialAvance[];
  unidades: Unidad[];
  abrir: AbrirListado;
}

export const TablaComerciales = ({ comerciales, unidades, abrir }: Props) => {
  const [unidad, setUnidad] = useState('');
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  // Sin orden elegido: de menor a mayor avance (los que menos han hecho, arriba)
  const [orden, setOrden] = useState<{ k: Col; asc: boolean } | null>(null);

  const filas = useMemo(() => comerciales.map((c) => {
    const d = c.porUnidad[unidad] ?? { t: 0, r: 0, p: 0 };
    return { ...c, ...d, avance: pct(d.r, d.t) };
  }), [comerciales, unidad]);

  // Los comerciales sin contactos en la unidad elegida desaparecen de la tabla
  const enUnidad = filas.filter((f) => f.t > 0);
  const visibles = useMemo(() => {
    const v = enUnidad.filter((f) => !seleccion || seleccion.has(f.id));
    const clave = (f: (typeof v)[number]): string | number =>
      orden?.k === 'nombre' ? normalizar(f.nombre)
      : orden?.k === 'usuario' ? normalizar(f.usuario)
      : orden?.k === 'entrada' ? f.ultimaEntrada ?? ''
      : orden ? f[orden.k] : f.avance;
    const sentido = orden ? (orden.asc ? 1 : -1) : 1;
    return [...v].sort((a, b) => {
      const va = clave(a), vb = clave(b);
      return (va < vb ? -1 : va > vb ? 1 : normalizar(a.nombre).localeCompare(normalizar(b.nombre))) * sentido;
    });
  }, [enUnidad, seleccion, orden]);

  const ordenarPor = (k: Col) =>
    setOrden((o) => (o?.k === k ? { k, asc: !o.asc } : { k, asc: true }));

  const textoUnidad = unidades.find((u) => u.codigo === unidad)?.texto;
  const clic = (fn: () => void) => (ev: MouseEvent) => { ev.preventDefault(); fn(); };

  return (
    <section className="tarjeta bloque">
      <header className="bloque-cab">
        <h3>Avance por comercial</h3><span>pulsa una cifra para ver sus contactos · pulsa una cabecera para ordenar</span>
      </header>

      <div className="segmentado" role="tablist" aria-label="Unidad de negocio">
        <button type="button" role="tab" aria-selected={unidad === ''} className={unidad === '' ? 'activo' : ''} onClick={() => setUnidad('')}>
          Todas
        </button>
        {unidades.map((u) => (
          <button key={u.codigo} type="button" role="tab" aria-selected={unidad === u.codigo} className={unidad === u.codigo ? 'activo' : ''}
            onClick={() => setUnidad(u.codigo)}>
            {u.texto}
          </button>
        ))}
      </div>

      <div className="filtros-tabla">
        <MultiSelect etiqueta="Comercial" seleccion={seleccion} onChange={setSeleccion}
          opciones={comerciales.map((c) => ({ id: c.id, nombre: c.nombre, detalle: c.usuario }))} />
        <span className="contador-chip">{visibles.length} de {enUnidad.length} comerciales</span>
      </div>

      <div className="scroll">
        <table className="tabla ordenable tabla-movil" id="tabla-comerciales">
          <thead>
            <tr>
              {COLUMNAS.map((c) => (
                <th key={c.k} className={c.num ? 'num' : undefined} style={c.estilo} data-orden onClick={() => ordenarPor(c.k)}>
                  {c.t}{orden?.k === c.k && <span className="flecha">{orden.asc ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const sufijo = textoUnidad ? ` · ${textoUnidad}` : '';
              const barra = f.t && f.r >= f.t ? 'completo' : f.avance < 50 ? 'bajo' : '';
              return (
                <tr key={f.id} className={f.ultimaEntrada ? undefined : 'sin-entrar'}>
                  <td data-label="Comercial"><span className="com-nombre"><span className="avatar-mini">{inicialesComercial(f.nombre)}</span><span>{f.nombre}</span></span></td>
                  <td data-label="Usuario" className="mono">{f.usuario}</td>
                  <td data-label="Contactos" className="num">
                    <a href="#" className="cifra-chip azul" title="Ver los contactos"
                      onClick={clic(() => abrir({ de: 'comercial', id: f.id, filtro: 'todos', unidad }, `Contactos de ${f.nombre}${sufijo}`))}>
                      {num(f.t)}
                    </a>
                  </td>
                  <td data-label="Revisados" className="num">
                    {f.r ? (
                      <a href="#" className="cifra-chip verde" title="Ver los revisados"
                        onClick={clic(() => abrir({ de: 'comercial', id: f.id, filtro: 'revisados', unidad }, `Contactos revisados por ${f.nombre}${sufijo}`))}>
                        {num(f.r)}
                      </a>
                    ) : <span className="cifra-cero">0</span>}
                  </td>
                  <td data-label="Avance">
                    <div className="avance-celda">
                      <div className="barra"><span className={barra} style={{ width: `${f.avance}%` }} /></div>
                      <b>{Math.round(f.avance)} %</b>
                    </div>
                  </td>
                  <td data-label="Pendientes" className="num">{f.p
                    ? <Link className="cifra-chip ambar" title="Ver sus propuestas pendientes" to={`/propuestas?comercial=${f.id}`}>{num(f.p)}</Link>
                    : <span className="cifra-cero">0</span>}</td>
                  <td data-label="Última entrada" className="pequeno">{f.ultimaEntrada ? fmtFecha(f.ultimaEntrada) : <span className="chip-nunca">nunca</span>}</td>
                </tr>
              );
            })}
            {!visibles.length && (
              <tr><td colSpan={COLUMNAS.length} className="atenuado">Ningún comercial con ese filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
