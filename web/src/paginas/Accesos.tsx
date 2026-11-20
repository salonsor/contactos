import { useEffect, useState } from 'react';
import type { Acceso, EventoAcceso } from '../../../shared/tipos';
import { EVENTO_TEXTO } from '../../../shared/tipos';
import { api } from '../api';
import { Icono } from '../components/Icono';
import { descargarCsv, fmtFecha, num } from '../util';

// Cómo se pinta cada evento: fallos en rojo, accesos en verde, cambios de seguridad en ámbar
const CLASE: Record<EventoAcceso, string> = {
  clave_correcta: 'suave', clave_incorrecta: 'clave-inicial', bloqueado: 'clave-inicial', codigo_incorrecto: 'clave-inicial',
  acceso_concedido: 'acceso-ok', codigo_recuperacion_usado: 'inicial', doble_factor_activado: 'inicial',
  doble_factor_restablecido: 'inicial', clave_cambiada: 'inicial', sesion_cerrada: 'suave',
};

/** «Mozilla/5.0 (Windows NT 10.0…) … Chrome/131…» → «Chrome · Windows» */
const navegador = (agente: string) => {
  if (!agente) return '';
  const nav = /Edg\//.test(agente) ? 'Edge' : /Firefox\//.test(agente) ? 'Firefox' : /Chrome\//.test(agente) ? 'Chrome'
    : /Safari\//.test(agente) ? 'Safari' : 'Otro';
  const so = /Windows/.test(agente) ? 'Windows' : /Android/.test(agente) ? 'Android' : /iPhone|iPad/.test(agente) ? 'iOS'
    : /Mac OS/.test(agente) ? 'macOS' : /Linux/.test(agente) ? 'Linux' : '';
  return so ? `${nav} · ${so}` : nav;
};

export const Accesos = () => {
  const [lista, setLista] = useState<Acceso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usuario, setUsuario] = useState('');
  const [evento, setEvento] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');

  useEffect(() => {
    setError(null);
    api.accesos({ usuario: filtroUsuario, evento }).then(setLista).catch((e: Error) => setError(e.message));
  }, [filtroUsuario, evento]);

  const fallos = (lista ?? []).filter((a) => CLASE[a.evento] === 'clave-inicial').length;
  const csv = () => descargarCsv('ACCESOS', ['Fecha', 'Usuario', 'Nombre', 'Evento', 'IP', 'Navegador', 'Administrador'],
    (lista ?? []).map((a) => [a.fecha, a.usuario, a.nombre ?? '', EVENTO_TEXTO[a.evento] ?? a.evento, a.ip, a.agente, a.admin ?? '']));

  return (
    <>
      <div className="cabecera-pagina">
        <div>
          <h2>Accesos</h2>
          <p className="atenuado pequeno">Entradas, intentos fallidos y cambios de seguridad de todos los usuarios, del más reciente al más
            antiguo (hasta 500). No se guardan contraseñas ni códigos.</p>
        </div>
        <div className="botones compactos">
          <button type="button" className="btn btn-accion neutro" onClick={csv} disabled={!lista?.length}>
            <span className="ico"><Icono n="descargar" /></span>CSV
          </button>
        </div>
      </div>

      <form className="filtros-tabla" onSubmit={(e) => { e.preventDefault(); setFiltroUsuario(usuario.trim()); }}>
        <div className="buscador" style={{ flex: '1 1 260px', maxWidth: 360 }}>
          <div className="campo">
            <span className="lupa">🔍</span>
            <input id="accesos-usuario" type="search" placeholder="Usuario exacto, p. ej. JSANCHO (Intro)" value={usuario}
              onChange={(e) => { setUsuario(e.target.value); if (!e.target.value) setFiltroUsuario(''); }} />
          </div>
        </div>
        <select id="accesos-evento" value={evento} onChange={(e) => setEvento(e.target.value)} aria-label="Tipo de evento">
          <option value="">Todos los eventos</option>
          {(Object.keys(EVENTO_TEXTO) as EventoAcceso[]).map((k) => <option key={k} value={k}>{EVENTO_TEXTO[k]}</option>)}
        </select>
        {lista && <span className="contador-chip">{num(lista.length)} eventos · {num(fallos)} fallos</span>}
      </form>

      {error && <div className="aviso error">{error}</div>}

      <div className="scroll">
        <table className="tabla tabla-movil">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Evento</th><th>IP</th><th>Navegador</th><th>Hecho por</th></tr></thead>
          <tbody>
            {(lista ?? []).map((a) => (
              <tr key={a.id}>
                <td data-label="Fecha" className="pequeno num">{fmtFecha(a.fecha)}</td>
                <td data-label="Usuario"><span className="mono">{a.usuario || '—'}</span>{a.nombre && <div className="pequeno atenuado">{a.nombre}</div>}
                  {!a.nombre && a.usuario && <div className="pequeno atenuado">usuario que no existe</div>}</td>
                <td data-label="Evento"><span className={`chip ${CLASE[a.evento] ?? ''}`}>{EVENTO_TEXTO[a.evento] ?? a.evento}</span></td>
                <td data-label="IP" className="mono pequeno">{a.ip}</td>
                <td data-label="Navegador" className="pequeno" title={a.agente}>{navegador(a.agente)}</td>
                <td data-label="Hecho por" className="pequeno">{a.admin ?? ''}</td>
              </tr>
            ))}
            {lista && !lista.length && <tr><td colSpan={6} className="atenuado">Ningún evento con ese filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
};
