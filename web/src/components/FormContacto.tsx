import { useEffect, useState } from 'react';
import type { Catalogo, CampoContacto, DatosContacto } from '../../../shared/tipos';
import { emailValido, TELEFONOS, telefonoValido, tieneMovil } from '../../../shared/tipos';
import { api } from '../api';

export const VACIO: DatosContacto = {
  nombre: '', apellido: '', desc_dpto: '', desc_funcion: '', email: '', tel_contacto: '', telefono: '',
  tel_ad1: '', tel_ad2: '', tel_ad3: '', tel_ad4: '', tel_ad5: '',
};

/** Todo lo que recoge el formulario: los datos (propuesta) y lo que se guarda al momento */
export interface Formulario {
  datos: DatosContacto;
  /** Motivo de que no tenga email; null = no está marcado */
  sinEmail: string | null;
  sinMovil: string | null;
  encuestas: { ventas: boolean; postventa: boolean };
}

// El catálogo se pide una vez por sesión de la página
let catalogoCache: Promise<Catalogo> | null = null;
export const cargarCatalogo = () => (catalogoCache ??= api.catalogo().catch((e) => { catalogoCache = null; throw e; }));

/** Comprobaciones en el navegador (las mismas que hace la API): null si todo está bien */
export const comprobarFormulario = (f: Formulario, catalogo: Catalogo | null, tocados: CampoContacto[]) => {
  const d = f.datos;
  if (!d.nombre.trim()) return 'El nombre es obligatorio';
  if (!d.apellido.trim()) return 'El apellido es obligatorio';
  if (!d.desc_dpto) return 'Elige el departamento';
  if (!d.desc_funcion) return 'Elige la función';
  if (catalogo?.departamentos.length) {
    const dpto = catalogo.departamentos.find((x) => x.nombre === d.desc_dpto);
    if (!dpto) return `El departamento «${d.desc_dpto}» ya no existe en la tabla oficial: elige uno válido`;
    if (!dpto.funciones.some((x) => x.nombre === d.desc_funcion)) return `La función «${d.desc_funcion}» ya no existe en la tabla oficial: elige una válida`;
  }
  if (d.email.trim() && !emailValido(d.email)) return 'El email no parece válido';
  if (!d.email.trim() && f.sinEmail === null) return 'El email es obligatorio. Si de verdad no tiene, marca «No tiene email» e indica el motivo.';
  if (f.sinEmail !== null && !f.sinEmail.trim()) return 'Indica por qué no tiene email';
  for (const k of TELEFONOS.filter((k) => tocados.includes(k) && d[k].trim())) {
    if (!telefonoValido(d[k])) return `El teléfono «${d[k]}» no es válido: solo cifras, espacios y el signo +`;
  }
  if (!tieneMovil(d) && f.sinMovil === null) return 'Tiene que haber al menos un móvil (9 cifras que empiecen por 6 o 7). Si de verdad no tiene, marca «No tiene móvil» e indica el motivo.';
  if (f.sinMovil !== null && !f.sinMovil.trim()) return 'Indica por qué no tiene móvil';
  return null;
};

interface Props {
  f: Formulario;
  onChange: (f: Formulario) => void;
  /** Datos de antes, para marcar lo que cambia */
  original?: DatosContacto;
  catalogo: Catalogo | null;
}

export const FormContacto = ({ f, onChange, original, catalogo }: Props) => {
  const datos = f.datos;
  const poner = (k: CampoContacto, v: string) => onChange({ ...f, datos: { ...datos, [k]: v } });
  const cambiado = (k: CampoContacto) => !!original && original[k] !== datos[k];
  const estilo = (k: CampoContacto) => (cambiado(k) ? { borderColor: 'var(--azul)', background: '#f4f8fe' } : undefined);

  const campo = (k: CampoContacto, etiqueta: string, tipo = 'text', extra?: Record<string, string>) => (
    <div>
      <label className="etiqueta" htmlFor={`f-${k}`}>{etiqueta}{cambiado(k) && <span className="chip tipo-modificacion" style={{ marginLeft: 6 }}>cambia</span>}</label>
      <input id={`f-${k}`} type={tipo} value={datos[k]} style={estilo(k)} onChange={(e) => poner(k, e.target.value)} {...extra} />
      {cambiado(k) && original![k] && <div className="ayuda-campo">Antes: {original![k]}</div>}
    </div>
  );

  // Departamento y función salen de la tabla oficial; si el contacto trae de origen uno que ya no existe, se avisa
  const dptos = catalogo?.departamentos ?? [];
  const dpto = dptos.find((d) => d.nombre === datos.desc_dpto);
  const dptoObsoleto = !!catalogo && !!datos.desc_dpto && dptos.length > 0 && !dpto;
  const funcionObsoleta = !!catalogo && !!datos.desc_funcion && !!dpto && !dpto.funciones.some((x) => x.nombre === datos.desc_funcion);

  const masAdicionales = (['tel_ad2', 'tel_ad3', 'tel_ad4', 'tel_ad5'] as CampoContacto[]);
  const [verMas, setVerMas] = useState(masAdicionales.some((k) => datos[k]));
  useEffect(() => { if (masAdicionales.some((k) => datos[k])) setVerMas(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="fila-form">
        {campo('nombre', 'Nombre *', 'text', { autoComplete: 'off' })}
        {campo('apellido', 'Apellido *', 'text', { autoComplete: 'off' })}
      </div>
      <div className="fila-form">
        <div>
          <label className="etiqueta" htmlFor="f-dpto">Departamento *{cambiado('desc_dpto') && <span className="chip tipo-modificacion" style={{ marginLeft: 6 }}>cambia</span>}</label>
          <select id="f-dpto" value={dpto ? datos.desc_dpto : ''} style={estilo('desc_dpto')}
            onChange={(e) => onChange({ ...f, datos: { ...datos, desc_dpto: e.target.value, desc_funcion: '' } })}>
            <option value="">Elige…</option>
            {dptos.map((d) => <option key={d.nombre} value={d.nombre}>{d.nombre}</option>)}
          </select>
          {dptoObsoleto && <div className="aviso-campo">«{datos.desc_dpto}» ya no existe en la tabla oficial: elige uno válido.</div>}
        </div>
        <div>
          <label className="etiqueta" htmlFor="f-funcion">Función *{cambiado('desc_funcion') && <span className="chip tipo-modificacion" style={{ marginLeft: 6 }}>cambia</span>}</label>
          <select id="f-funcion" value={dpto?.funciones.some((x) => x.nombre === datos.desc_funcion) ? datos.desc_funcion : ''} style={estilo('desc_funcion')}
            onChange={(e) => poner('desc_funcion', e.target.value)} disabled={!dpto}>
            <option value="">{dpto ? 'Elige…' : 'Elige primero el departamento'}</option>
            {(dpto?.funciones ?? []).map((x) => <option key={x.nombre} value={x.nombre}>{x.nombre}</option>)}
          </select>
          {(funcionObsoleta || (dptoObsoleto && datos.desc_funcion)) && (
            <div className="aviso-campo">«{datos.desc_funcion}» ya no existe en la tabla oficial: elige una válida.</div>
          )}
        </div>
      </div>
      <div className="fila-form">
        {campo('email', 'Email *', 'email', { autoComplete: 'off' })}
        {campo('tel_contacto', 'Móvil/directo de la persona *', 'tel')}
      </div>
      <div className="fila-form">
        {campo('telefono', 'Teléfono centralita (cliente)', 'tel')}
        {campo('tel_ad1', 'Teléfono adicional 1', 'tel')}
      </div>
      <details className="mas-telefonos" open={verMas} onToggle={(e) => setVerMas((e.target as HTMLDetailsElement).open)}>
        <summary>Más teléfonos adicionales</summary>
        <div className="fila-form">
          {masAdicionales.map((k, i) => <div key={k}>{campo(k, `Teléfono adicional ${i + 2}`, 'tel')}</div>)}
        </div>
      </details>

      <div className="caja-obligatorios">
        <p className="pequeno"><b>* El email es obligatorio y tiene que haber al menos un móvil</b> (9 cifras que empiecen por 6 o 7) en cualquiera
          de los teléfonos. Si de verdad no tiene, márcalo aquí y di por qué; no inventes el dato.</p>
        <div className="no-tiene">
          <label className={'pildora conmutador' + (f.sinEmail !== null ? ' activa' : '')}>
            <input type="checkbox" checked={f.sinEmail !== null} onChange={(e) => onChange({ ...f, sinEmail: e.target.checked ? '' : null })} />
            No tiene email
          </label>
          {f.sinEmail !== null && (
            <input className="crece" placeholder="Motivo (no lo facilita, solo centralita, jubilado…)" value={f.sinEmail}
              onChange={(e) => onChange({ ...f, sinEmail: e.target.value })} />
          )}
        </div>
        <div className="no-tiene">
          <label className={'pildora conmutador' + (f.sinMovil !== null ? ' activa' : '')}>
            <input type="checkbox" checked={f.sinMovil !== null} onChange={(e) => onChange({ ...f, sinMovil: e.target.checked ? '' : null })} />
            No tiene móvil
          </label>
          {f.sinMovil !== null && (
            <input className="crece" placeholder="Motivo (no lo facilita, solo centralita, jubilado…)" value={f.sinMovil}
              onChange={(e) => onChange({ ...f, sinMovil: e.target.value })} />
          )}
        </div>
      </div>

      <div className="encuestas">
        <span className="etiqueta">Contesta encuestas de</span>
        <label className={'pildora conmutador' + (f.encuestas.ventas ? ' activa' : '')}>
          <input type="checkbox" checked={f.encuestas.ventas} onChange={(e) => onChange({ ...f, encuestas: { ...f.encuestas, ventas: e.target.checked } })} />Ventas
        </label>
        <label className={'pildora conmutador' + (f.encuestas.postventa ? ' activa' : '')}>
          <input type="checkbox" checked={f.encuestas.postventa} onChange={(e) => onChange({ ...f, encuestas: { ...f.encuestas, postventa: e.target.checked } })} />Postventa
        </label>
      </div>
      <div className="ayuda-campo">Marca si esta persona es a quien contesta las encuestas de satisfacción. Se guarda al momento, sin pasar por el administrador.</div>
    </>
  );
};
