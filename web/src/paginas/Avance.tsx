import { useCallback, useEffect, useState } from 'react';
import type { Avance as DatosAvance } from '../../../shared/tipos';
import { api, type Consulta } from '../api';
import { Icono } from '../components/Icono';
import { Kpis, PanelAprobados, PanelEstados } from '../components/Resumen';
import { TablaComerciales } from '../components/TablaComerciales';
import { VentanaFicha } from '../components/VentanaFicha';
import { VentanaListado } from '../components/VentanaListado';
import { useBloquearFondo, useEscCierra } from '../hooks';
import { fmtFecha } from '../util';

export const Avance = () => {
  const [avance, setAvance] = useState<DatosAvance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listado, setListado] = useState<{ consulta: Consulta; titulo: string } | null>(null);
  const [fichaId, setFichaId] = useState<number | null>(null);

  useEffect(() => {
    api.avance().then((a) => { setAvance(a); setError(null); }).catch((e: Error) => setError(e.message));
  }, []);

  useBloquearFondo(!!listado || fichaId !== null);
  useEscCierra(listado ? () => setListado(null) : null, fichaId !== null ? () => setFichaId(null) : null);

  const abrirListado = useCallback((consulta: Consulta, titulo: string) => setListado({ consulta, titulo }), []);

  return (
    <>
      <div className="cabecera-pagina">
        <div>
          <h2>Avance de la campaña</h2>
          <p className="atenuado pequeno">{avance ? <>Datos del {fmtFecha(avance.generadoEn)}</> : 'Cargando…'}</p>
        </div>
        <div className="botones compactos">
          <a className="btn btn-accion neutro" href="/api/admin/foto?descargar=1" title="Descarga un único fichero con esta pantalla tal como está ahora">
            <span className="ico"><Icono n="html" /></span>HTML autocontenido
          </a>
          <a className="btn btn-accion neutro" href="/api/admin/foto" target="_blank" rel="noopener" title="Genera la foto y la abre en una pestaña, sin descargarla">
            <span className="ico"><Icono n="camara" /></span>Ver foto
          </a>
          <a className="btn btn-accion excel" href="/api/admin/excel" title="Genera el Excel con los datos de ahora (hojas CAMBIOS, ESTADO y RESUMEN) y lo descarga en tu equipo">
            <span className="ico"><Icono n="descargar" /></span>Exportar Excel
          </a>
        </div>
      </div>

      {error && <div className="aviso error">No se han podido leer los datos del avance ({error}).</div>}
      {avance && (
        <>
          <Kpis k={avance.kpis} />
          <div className="rejilla-2-1">
            <PanelEstados a={avance} abrir={abrirListado} />
            <PanelAprobados a={avance} abrir={abrirListado} />
          </div>
          <TablaComerciales comerciales={avance.comerciales} unidades={avance.unidades} abrir={abrirListado} />
        </>
      )}

      {listado && (
        <VentanaListado key={JSON.stringify(listado.consulta)} consulta={listado.consulta} titulo={listado.titulo}
          onCerrar={() => setListado(null)} onFicha={setFichaId} />
      )}
      {fichaId !== null && <VentanaFicha key={fichaId} id={fichaId} onCerrar={() => setFichaId(null)} />}
    </>
  );
};
