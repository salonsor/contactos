import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { MisClientes as Datos } from '../../../shared/tipos';
import { api } from '../api';
import { Anillo } from '../components/Anillo';
import { Icono } from '../components/Icono';
import { euros, normalizar, num, pct, plural } from '../util';

/** Lista de trabajo del comercial. `base`: '' para el comercial, '/mis-clientes' para un administrador que también lo es */
export const MisClientes = ({ base }: { base: string }) => {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Los filtros van en la URL: al volver de un cliente se conservan
  const [params, setParams] = useSearchParams();
  const texto = params.get('q') ?? '';
  const unidad = params.get('unidad') ?? '';
  const soloPendientes = params.get('pendientes') === '1';
  const buscador = useRef<HTMLInputElement>(null);

  const fijar = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  useEffect(() => { api.misClientes().then(setDatos).catch((e: Error) => setError(e.message)); }, []);

  // Ctrl+K lleva el cursor al buscador desde cualquier punto de la página
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); buscador.current?.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

  const clientes = datos?.clientes ?? [];
  const visibles = useMemo(() => {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    return clientes.filter((c) => {
      if (unidad && c.unidad !== unidad) return false;
      if (soloPendientes && c.revisados >= c.total) return false;
      const t = normalizar(`${c.cliente} ${c.localidad} ${c.provincia} ${c.solicitante}`);
      return palabras.every((p) => t.includes(p));
    });
  }, [clientes, texto, unidad, soloPendientes]);

  const total = clientes.reduce((s, c) => s + c.total, 0);
  const revisados = clientes.reduce((s, c) => s + c.revisados, 0);
  const pendientes = clientes.reduce((s, c) => s + c.pendientes, 0);
  const completos = clientes.filter((c) => c.revisados >= c.total).length;
  const textoUnidad = (cod: string) => datos?.unidades.find((u) => u.codigo === cod);

  if (error) return <div className="aviso error">No se han podido leer tus clientes ({error}).</div>;
  if (!datos) return <p className="atenuado">Cargando…</p>;

  return (
    <>
      <div className="cabecera-pagina">
        <div>
          <h2>Mis clientes</h2>
          <p className="atenuado pequeno">Entra en cada cliente y revisa sus contactos: confirma los que están bien, corrige los
            que no y da de baja a quien ya no esté. Los cambios los aprueba el administrador. Van de mayor a menor facturación.</p>
        </div>
      </div>

      {!clientes.length && (
        <div className="aviso alerta">No tienes clientes en esta campaña: el listado de facturación no incluye ningún cliente a tu nombre. No es un
          fallo; si crees que debería haber alguno, avisa al administrador.</div>
      )}

      <div className="kpis">
        <div className="kpi c-verde">
          <div className="crece"><div className="etiqueta">Mi avance</div>
            <div className="cifra">{Math.round(pct(revisados, total))} %<span className="pct">{num(revisados)} de {num(total)}</span></div>
            <div className="barra"><span style={{ width: `${pct(revisados, total)}%` }} /></div></div>
          <span className="ico"><Icono n="revisados" /></span>
        </div>
        <div className="kpi c-carbon">
          <div><div className="etiqueta">Mis clientes</div><div className="cifra">{num(clientes.length)}</div>
            <div className="sub">{plural(completos, 'terminado')}</div></div>
          <span className="ico"><Icono n="cliente" /></span>
        </div>
        <a href="#" className={'kpi c-ambar' + (soloPendientes ? ' activa' : '')} title="Ver solo los clientes con contactos por revisar"
          onClick={(e) => { e.preventDefault(); fijar('pendientes', soloPendientes ? '' : '1'); }}>
          <div><div className="etiqueta">Contactos por revisar</div><div className="cifra">{num(total - revisados)}</div>
            <div className="sub">todavía pendientes</div></div>
          <span className="ico"><Icono n="bandeja" /></span>
        </a>
        <div className="kpi c-azul">
          <div><div className="etiqueta">Esperando aprobación</div><div className="cifra">{num(pendientes)}</div>
            <div className="sub">cambios tuyos en manos del administrador</div></div>
          <span className="ico"><Icono n="modificacion" /></span>
        </div>
      </div>

      <div className="filtros">
        <div className={'buscador instantaneo' + (texto ? ' con-texto' : '')} style={{ marginBottom: 10 }}>
          <div className="campo">
            <span className="lupa">🔍</span>
            <input ref={buscador} type="search" placeholder="Buscar cliente, localidad o solicitante… (Ctrl+K)" value={texto}
              onChange={(e) => fijar('q', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fijar('q', ''); } }} />
            <button type="button" className="limpiar" title="Borrar (Esc)" onClick={() => fijar('q', '')}>✕</button>
          </div>
          <span className="contador-filtro">
            {visibles.length === clientes.length ? `${num(clientes.length)} en total` : `${num(visibles.length)} de ${num(clientes.length)}`}
          </span>
        </div>
        <div className="filtros-tabla">
          {datos.unidades.length > 1 && (
            <div className="segmentado" role="tablist" aria-label="Unidad de negocio">
              <button type="button" className={!unidad ? 'activo' : ''} onClick={() => fijar('unidad', '')}>Todas</button>
              {datos.unidades.map((u) => (
                <button key={u.codigo} type="button" className={unidad === u.codigo ? 'activo' : ''} onClick={() => fijar('unidad', u.codigo)}>
                  {u.texto}
                </button>
              ))}
            </div>
          )}
          <button type="button" className={'pildora conmutador' + (soloPendientes ? ' activa' : '')}
            onClick={() => fijar('pendientes', soloPendientes ? '' : '1')}>
            <span className="casilla" />Solo con pendientes
          </button>
        </div>
      </div>

      <div className="rejilla-clientes">
        {visibles.map((c) => {
          const completo = c.revisados >= c.total;
          return (
            <Link key={c.clave} to={`${base || '/cliente'}/${c.clave}`} className={'tarjeta cliente' + (completo ? ' completo' : c.revisados ? ' en-curso' : '')}>
              <div className="cliente-cab">
                <div className="crece">
                  <div className="cliente-nombre">{c.cliente}</div>
                  <div className="atenuado pequeno">{c.localidad}{c.provincia ? ` · ${c.provincia}` : ''}</div>
                  {c.facturacion !== null && <div className="cliente-facturacion">{euros(c.facturacion)}</div>}
                </div>
                <Anillo pct={pct(c.revisados, c.total)} tam={58} grosor={6} completo={completo} />
              </div>
              <div className="cliente-pie">
                <span><b>{c.revisados}</b> de {c.total} revisados{completo && <> · <b className="verde">completo</b></>}</span>
                {c.pendientes > 0 && <span className="cifra-chip ambar" title="Cambios tuyos pendientes de aprobar">{c.pendientes} por aprobar</span>}
              </div>
              <div className="cliente-codigos">
                <span className="mono">S {c.solicitante}</span>
                <span className="unidad-txt">{textoUnidad(c.unidad)?.texto ?? c.unidad}</span>
              </div>
            </Link>
          );
        })}
      </div>
      {clientes.length > 0 && !visibles.length && <div className="aviso info">Ningún cliente con ese filtro.</div>}
    </>
  );
};
