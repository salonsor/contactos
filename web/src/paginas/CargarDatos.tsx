import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router';
import { api, type ResumenCarga } from '../api';
import { Icono } from '../components/Icono';
import { num } from '../util';

// Lee el fichero y lo pasa a base64 (viaja dentro del JSON)
const aBase64 = (f: File) => new Promise<string>((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] ?? '');
  r.onerror = () => mal(new Error('No se ha podido leer el fichero'));
  r.readAsDataURL(f);
});

// Vercel no admite peticiones de más de 4,5 MB, y el base64 ocupa 4/3 del fichero
const MAX_BYTES = 3 * 1024 * 1024;

export const CargarDatos = () => {
  const [fichero, setFichero] = useState<{ nombre: string; b64: string } | null>(null);
  const [resumen, setResumen] = useState<ResumenCarga | null>(null);
  const [hecho, setHecho] = useState<ResumenCarga | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<'leyendo' | 'cargando' | null>(null);
  const [encima, setEncima] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setResumen(null); setHecho(null);
    if (!/\.xlsx$/i.test(f.name)) { setError('El fichero tiene que ser un Excel .xlsx'); return; }
    if (f.size > MAX_BYTES) { setError('El Excel pasa de 3 MB, lo máximo que admite el servidor: quita columnas u hojas que no hagan falta'); return; }
    setOcupado('leyendo');
    try {
      const b64 = await aBase64(f);
      setFichero({ nombre: f.name, b64 });
      setResumen(await api.previsualizarCarga(b64));
    } catch (e) {
      setFichero(null);
      setError((e as Error).message);
    } finally {
      setOcupado(null);
      if (entrada.current) entrada.current.value = '';
    }
  };

  const cargar = async () => {
    if (!fichero || !resumen) return;
    const perdida = resumen.actual.revisados || resumen.actual.propuestas
      ? `\n\nSe perderán ${resumen.actual.revisados} contactos revisados y ${resumen.actual.propuestas} propuestas de la campaña actual.` : '';
    if (!window.confirm(`¿Sustituir la campaña por ${resumen.contactos} contactos de «${fichero.nombre}»?${perdida}`)) return;
    setOcupado('cargando');
    try {
      setHecho(await api.cargarExcel(fichero.b64));
      setResumen(null); setFichero(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  };

  const soltar = (ev: DragEvent) => { ev.preventDefault(); setEncima(false); elegir(ev.dataTransfer.files[0]); };

  return (
    <>
      <div className="cabecera-pagina">
        <div>
          <h2>Cargar datos</h2>
          <p className="atenuado pequeno">Sube el Excel con los contactos de la campaña. Antes de cargar verás un resumen; al confirmar se
            sustituye la campaña entera y se conservan los usuarios y sus contraseñas.</p>
        </div>
        <div className="botones compactos">
          <a className="btn btn-accion neutro" href="/api/admin/importar/plantilla">
            <span className="ico"><Icono n="descargar" /></span>Descargar plantilla
          </a>
        </div>
      </div>

      {error && <div className="aviso error">{error}</div>}
      {hecho && (
        <div className="aviso ok">
          Campaña cargada: {num(hecho.contactos)} contactos, {num(hecho.asignaciones)} asignaciones y {num(hecho.comerciales)} comerciales
          {hecho.comercialesNuevos.length > 0 && (hecho.conClaveDefecto
            ? <> ({hecho.comercialesNuevos.length} nuevos, entran con la contraseña provisional común)</>
            : <> ({hecho.comercialesNuevos.length} nuevos, sin contraseña todavía: dásela desde <Link to="/usuarios">Usuarios</Link>)</>)}.{' '}
          <Link to="/">Ver el avance</Link>
        </div>
      )}

      <label className={'tarjeta zona-carga' + (encima ? ' encima' : '')}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)} onDrop={soltar}>
        <input ref={entrada} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
          onChange={(e: ChangeEvent<HTMLInputElement>) => elegir(e.target.files?.[0])} />
        <span className="ico-carga"><Icono n="subir" /></span>
        <b>{ocupado === 'leyendo' ? 'Leyendo el Excel…' : fichero ? fichero.nombre : 'Arrastra aquí el Excel o haz clic para elegirlo'}</b>
        <span className="atenuado pequeno">Formato .xlsx · una fila por contacto, comercial y unidad · columnas como en la plantilla</span>
      </label>

      {resumen && (
        <>
          <div className="kpis">
            <div className="kpi c-carbon"><div><div className="etiqueta">Contactos</div><div className="cifra">{num(resumen.contactos)}</div>
              <div className="sub">{num(resumen.clientes)} clientes</div></div><span className="ico"><Icono n="contactos" /></span></div>
            <div className="kpi c-azul"><div><div className="etiqueta">Comerciales</div><div className="cifra">{num(resumen.comerciales)}</div>
              <div className="sub">{resumen.comercialesNuevos.length ? `${resumen.comercialesNuevos.length} nuevos` : 'todos ya existen'}</div></div>
              <span className="ico"><Icono n="cliente" /></span></div>
            <div className="kpi c-verde"><div><div className="etiqueta">Asignaciones</div><div className="cifra">{num(resumen.asignaciones)}</div>
              <div className="sub">contacto × comercial × unidad</div></div><span className="ico"><Icono n="check" /></span></div>
            <div className={'kpi ' + (resumen.errores.length ? 'c-rojo' : 'c-verde')}><div><div className="etiqueta">Filas con errores</div>
              <div className="cifra">{num(resumen.errores.length)}</div><div className="sub">de {num(resumen.filas)} filas; se ignoran</div></div>
              <span className="ico"><Icono n="aviso" /></span></div>
          </div>

          {(resumen.actual.revisados > 0 || resumen.actual.propuestas > 0) && (
            <div className="aviso alerta">
              La campaña actual tiene <b>{num(resumen.actual.revisados)}</b> contactos revisados y <b>{num(resumen.actual.propuestas)}</b> propuestas.
              Al cargar se pierden. Si los necesitas, descarga antes el Excel de carga desde <Link to="/">Avance</Link>.
            </div>
          )}

          <div className="dos-columnas">
            <div className="tarjeta panel">
              <div className="panel-titulo"><span className="ico"><Icono n="todas" /></span><b>Por unidad</b></div>
              <table className="tabla compacta"><tbody>
                {resumen.porUnidad.map((u) => <tr key={u.unidad}><td>{u.unidad}</td><td className="num">{num(u.contactos)}</td></tr>)}
              </tbody></table>
            </div>
            <div className="tarjeta panel">
              <div className="panel-titulo"><span className="ico"><Icono n="check" /></span><b>Columnas</b>
                <small>hoja «{resumen.hoja}», cabecera en la fila {resumen.filaCabecera}</small></div>
              <p className="pequeno">{resumen.reconocidas.map((c) => c.columna === c.campo ? c.campo : `${c.columna} → ${c.campo}`).join(' · ')}</p>
              {resumen.ignoradas.length > 0 && <p className="pequeno atenuado" style={{ marginTop: 8 }}>Se ignoran: {resumen.ignoradas.join(' · ')}</p>}
              {resumen.comercialesNuevos.length > 0 && (
                <p className="pequeno" style={{ marginTop: 8 }}><b>Comerciales nuevos:</b> {resumen.comercialesNuevos.join(', ')}</p>
              )}
            </div>
          </div>

          {resumen.errores.length > 0 && (
            <div className="tarjeta panel">
              <div className="panel-titulo"><span className="ico" style={{ background: 'var(--red)', color: '#fff' }}><Icono n="aviso" /></span>
                <b>Filas que no se cargarán</b><small>{resumen.errores.length > 50 ? 'las 50 primeras' : ''}</small></div>
              <table className="tabla compacta"><tbody>
                {resumen.errores.slice(0, 50).map((e) => <tr key={e.fila}><td className="num" style={{ width: 70 }}>Fila {e.fila}</td><td>{e.motivo}</td></tr>)}
              </tbody></table>
            </div>
          )}

          <div className="botones">
            <button type="button" className="btn btn-accion aprobar" disabled={!!ocupado} onClick={cargar}>
              <span className="ico"><Icono n="subir" /></span>{ocupado === 'cargando' ? 'Cargando…' : `Cargar ${num(resumen.contactos)} contactos`}
            </button>
            <button type="button" className="btn" disabled={!!ocupado} onClick={() => { setResumen(null); setFichero(null); }}>Cancelar</button>
          </div>
        </>
      )}
    </>
  );
};
