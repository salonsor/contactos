/** Minúsculas y sin tildes, para buscar y ordenar */
export const normalizar = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** 4604 → «4.604» (Intl en es-ES no agrupa los números de cuatro cifras) */
export const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const pct = (parte: number, total: number) => (total ? (100 * parte) / total : 0);

/** 4820000 → «4.820.000 €» */
export const euros = (n: number | null | undefined) => (n === null || n === undefined ? '' : `${num(Math.round(n))} €`);

/** Días que quedan hasta una fecha escrita como «31/10/2026» o «2026-10-31» (null si el texto no es una fecha) */
export const diasHasta = (texto: string) => {
  const m = texto.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/) ?? texto.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [d, mes, a] = m[1].length === 4 ? [Number(m[3]), Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2]), Number(m[3])];
  const fin = new Date(a, mes - 1, d);
  if (Number.isNaN(fin.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((fin.getTime() - hoy.getTime()) / 86400000);
};

/** «2026-09-30 14:35:59» → «30/09/2026 14:35» */
export const fmtFecha = (v: string | null | undefined) => {
  if (!v) return '';
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : v;
};

/** «APELLIDOS, NOMBRE» → iniciales de nombre y primer apellido */
export const inicialesComercial = (nombre: string) => {
  const [apellidos = '', nom = ''] = nombre.split(',').map((s) => s.trim());
  return ((nom.charAt(0) || '') + (apellidos.charAt(0) || '')).toUpperCase() || '?';
};

export const inicialesContacto = (r: { nombre: string; apellido: string }) =>
  ((r.nombre || '').charAt(0) + (r.apellido || '').charAt(0)).toUpperCase() || '?';

export const plural = (n: number, singular: string, pluralTxt = singular + 's') => `${num(n)} ${n === 1 ? singular : pluralTxt}`;

export const descargarCsv = (nombre: string, cabecera: string[], filas: string[][]) => {
  const linea = (xs: string[]) => xs.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(';');
  const csv = '﻿' + [cabecera.join(';'), ...filas.map(linea)].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
};
