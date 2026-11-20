// «Foto» HTML del panel de Avance (manual, capítulo 20): un único fichero autocontenido que funciona sin servidor y
// sin conexión. Se ordena, se filtra por unidad y por comercial, abre la ventana de detalle y la ficha de cada contacto
// con su historial de propuestas. No se actualiza sola ni permite validar o aprobar nada.
//
// Lleva los datos en window.DATOS_OFFLINE, en el mismo formato que lee «npm run db:importar» (importar-foto.ts).
import type { Db } from './db.js';
import { avance } from './consultas.js';
import { leerConfig } from './consultas-admin.js';

// JSON dentro de <script>: el signo menor y los separadores de línea U+2028/U+2029 van escapados para no cerrar ni romper el script
const BARRA = String.fromCharCode(92);
const json = (v: unknown) => JSON.stringify(v).replace(/</g, BARRA + 'u003c')
  .split(String.fromCharCode(0x2028)).join(BARRA + 'u2028').split(String.fromCharCode(0x2029)).join(BARRA + 'u2029');

export const nombreFoto = () => {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `AVANCE_CONTACTOS_${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}.html`;
};

export const foto = async (db: Db) => {
  const av = await avance(db);
  const config = await leerConfig(db);
  const filas = await db.query<Record<string, unknown> & { usuario_id: number }>(`
    SELECT c.id, a.usuario_id, c.cliente, c.localidad, c.provincia, c.pagador, c.solicitante, a.unidad, c.num_contacto, c.nombre, c.apellido,
      c.desc_funcion, c.desc_dpto, c.email, c.tel_contacto, c.telefono, c.tel_ad1, c.tel_ad2, c.tel_ad3, c.tel_ad4, c.tel_ad5,
      c.estado, c.es_alta, c.creado_en, c.validado_en, v.nombre AS validado_por, va.nombre AS validado_admin,
      c.enc_ventas, c.enc_postventa, c.sin_email, c.motivo_sin_email, c.sin_movil, c.motivo_sin_movil
    FROM asignaciones a JOIN contactos c ON c.id = a.contacto_id
    LEFT JOIN usuarios v ON v.id = c.validado_por LEFT JOIN usuarios va ON va.id = c.validado_admin
    ORDER BY c.cliente, c.apellido, c.nombre`);
  const contactos: Record<string, unknown[]> = {};
  for (const f of filas) (contactos[f.usuario_id] ??= []).push(f);
  const usuarios: Record<string, { nombre: string; usuario: string }> = {};
  for (const u of await db.query<{ id: number; nombre: string; usuario: string }>(
    'SELECT id, nombre, usuario FROM usuarios WHERE id IN (SELECT usuario_id FROM asignaciones)')) usuarios[u.id] = { nombre: u.nombre, usuario: u.usuario };
  const propuestas: Record<string, unknown[]> = {};
  for (const p of await db.query<Record<string, unknown> & { contacto_id: number }>(`
    SELECT p.contacto_id, p.tipo, co.nombre AS comercial, ad.nombre AS admin, p.creado_en, p.estado, p.en_conflicto, p.motivo, p.comentario,
      p.resuelto_en, p.diff
    FROM propuestas p JOIN usuarios co ON co.id = p.comercial_id LEFT JOIN usuarios ad ON ad.id = p.admin_id
    WHERE p.estado <> 'anulada' ORDER BY p.creado_en, p.id`)) {
    const { contacto_id, ...resto } = p;
    (propuestas[contacto_id] ??= []).push(resto);
  }
  const datos = { contactos, usuarios, propuestas };
  const resumen = { ...av, fechaLimite: config.fechaLimite };

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Avance de contactos · ${av.generadoEn}</title>
<style>${CSS}</style>
</head>
<body>
<header class="cab"><span class="marca">C</span><div><b>Depuración de contactos comerciales · Avance</b>
<small id="cab-sub"></small></div></header>
<main id="app"></main>
<div id="det" class="capa"></div><div id="ficha" class="capa"></div><div id="ayuda" class="capa"></div>
<button id="fab" type="button" title="Ayuda (tecla ?)">?</button>
<script>window.AVANCE_OFFLINE=${json(resumen)};</script>
<script>window.DATOS_OFFLINE=${json(datos)};</script>
<script>${SCRIPT}</script>
</body>
</html>`;
};

const CSS = `
:root{--negro:#151518;--amarillo:#d50029;--borde:#e4e4e7;--suave:#f6f6f7;--tinta:#18181b;--gris:#71717a;
--pendiente:#a1a1aa;--ok:#139a64;--modificado:#2f6fdb;--baja:#8b3fd9;--conflicto:#e38b06}
*{box-sizing:border-box;margin:0;padding:0}body{font:14px/1.45 'Segoe UI',system-ui,sans-serif;background:#f5f5f6;color:var(--tinta)}
.cab{display:flex;gap:14px;align-items:center;background:#fff;color:var(--tinta);padding:14px 22px;border-bottom:1px solid var(--borde)}
.cab small{display:block;color:var(--gris);font-size:12px}.marca{background:var(--amarillo);color:#fff;font-weight:800;padding:3px 9px;border-radius:5px}
main{max-width:1280px;margin:0 auto;padding:20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
.kpi{background:#fff;border:1px solid var(--borde);border-top:3px solid var(--c,#000);border-radius:10px;padding:12px 14px}
.kpi .e{font-size:11px;font-weight:700;color:var(--gris);text-transform:uppercase;letter-spacing:.04em}.kpi .n{font-size:26px;font-weight:800}
.kpi .s{font-size:12px;color:var(--gris)}
.panel{background:#fff;border:1px solid var(--borde);border-radius:10px;padding:14px 16px;margin-bottom:14px}
.panel h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.rej{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:800px){.rej{grid-template-columns:1fr}}
.fila{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer}.fila:hover{background:var(--suave)}
.punto{width:9px;height:9px;border-radius:50%;background:var(--c)}.barra{flex:1;height:6px;background:#eee;border-radius:4px;overflow:hidden}
.barra i{display:block;height:100%;background:var(--c,#2563eb)}
.fichas{display:flex;gap:8px;flex-wrap:wrap}.ficha{flex:1 1 120px;border:1px solid var(--borde);border-radius:8px;padding:8px 10px;cursor:pointer}
.ficha b{font-size:20px;display:block}.ficha:hover{border-color:#000}
.pild{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.pild button{font:inherit;font-size:12px;border:1px solid var(--borde);background:#fff;border-radius:20px;padding:4px 11px;cursor:pointer}
.pild button.on{background:var(--negro);color:#fff;border-color:var(--negro)}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;font-size:11px;color:var(--gris);text-transform:uppercase;padding:7px 8px;border-bottom:1px solid var(--borde);cursor:pointer;white-space:nowrap;background:#fff;position:sticky;top:0}
td{padding:7px 8px;border-bottom:1px solid #f1f1f3}tr.nunca td{color:var(--gris)}td.n{text-align:right}
.cif{display:inline-block;min-width:30px;text-align:center;border-radius:6px;padding:1px 7px;font-weight:700;background:#eef2ff;color:#1e40af;cursor:pointer}
.cif.v{background:#dcfce7;color:#166534}
.badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;text-transform:uppercase;background:color-mix(in srgb,var(--c) 14%,#fff);color:var(--c)}
.e-pendiente{--c:var(--pendiente)}.e-ok{--c:var(--ok)}.e-modificado{--c:var(--modificado)}.e-baja{--c:var(--baja)}.e-conflicto{--c:var(--conflicto)}
.capa{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10;justify-content:center;align-items:flex-start;padding:3vh 2vw}
.capa.on{display:flex}#ficha{z-index:11}#ayuda{z-index:12}
.ven{background:#fff;border-radius:12px;width:min(1200px,96vw);max-height:94vh;display:flex;flex-direction:column;overflow:hidden}
.ven.est{width:min(760px,96vw)}.ven header{display:flex;gap:10px;align-items:center;background:#fff;color:var(--tinta);padding:14px 16px;border-bottom:1px solid var(--borde)}
.ven header b{flex:1}.ven header button{border:1px solid var(--borde);background:#fff;color:var(--tinta);border-radius:50%;width:30px;height:30px;cursor:pointer}
.cuerpo{overflow:auto;padding:12px 16px}.barra-f{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
input[type=search]{font:inherit;padding:6px 10px;border:1px solid var(--borde);border-radius:7px;min-width:240px}
tr.clic{cursor:pointer}tr.clic:hover td{background:#fdeef1}
.dl{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 16px}.dl div{padding:3px 0}.dl small{display:block;color:var(--gris);font-size:11px;text-transform:uppercase}
.prop{border-left:3px solid var(--c,#999);padding:6px 10px;margin-top:10px;background:var(--suave);border-radius:0 6px 6px 0}
.viejo{text-decoration:line-through;color:var(--gris)}.nuevo{font-weight:700;color:#166534}
#fab{position:fixed;right:20px;bottom:20px;width:42px;height:42px;border-radius:50%;border:0;background:var(--negro);color:#fff;font-weight:800;font-size:18px;cursor:pointer}
.multi{position:relative;display:inline-block}.multi>div{display:none;position:absolute;z-index:5;background:#fff;border:1px solid var(--borde);border-radius:8px;padding:8px;max-height:300px;overflow:auto;min-width:280px;box-shadow:0 8px 24px rgba(0,0,0,.15)}
.multi.on>div{display:block}.multi label{display:block;padding:2px 0;white-space:nowrap}
.nota{color:var(--gris);font-size:12px}`;

// Script del visor: JavaScript sin dependencias. Sin plantillas con acento grave para poder incrustarlo aquí.
const SCRIPT = String.raw`
(function () {
  var A = window.AVANCE_OFFLINE, D = window.DATOS_OFFLINE;
  var TXT = { pendiente: 'Pendiente', ok: 'OK', modificado: 'Modificado', baja: 'Baja', conflicto: 'En conflicto' };
  var ESTADOS = ['pendiente', 'ok', 'modificado', 'baja', 'conflicto'];
  var TIPO = { alta: 'Alta', modificacion: 'Modificación', baja: 'Baja' };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var norm = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var fecha = function (v) { var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] : (v || ''); };
  var pct = function (a, b) { return b ? Math.round(100 * a / b) : 0; };

  // Un contacto, aunque lo vean varios comerciales
  var porId = {}, ven = {};
  Object.keys(D.contactos).forEach(function (uid) {
    D.contactos[uid].forEach(function (f) {
      if (!porId[f.id]) porId[f.id] = f;
      (ven[f.id] = ven[f.id] || []).push({ u: uid, unidad: f.unidad });
    });
  });
  var todos = Object.keys(porId).map(function (k) { return porId[k]; });
  var textoUnidad = {}; A.unidades.forEach(function (u) { textoUnidad[u.codigo] = u.texto; });
  var movil = function (t) { return /^[67]\d{8}$/.test(String(t || '').replace(/\s+/g, '').replace(/^(\+34|0034)/, '')); };
  var falta = function (c) {
    var tels = [c.tel_contacto, c.telefono, c.tel_ad1, c.tel_ad2, c.tel_ad3, c.tel_ad4, c.tel_ad5];
    return (!c.email && !c.sin_email) || (!tels.some(movil) && !c.sin_movil);
  };
  var aprobadas = function (c, tipo) { return (D.propuestas[c.id] || []).some(function (p) { return p.estado === 'aprobada' && p.tipo === tipo; }); };

  $('cab-sub').textContent = 'Foto del ' + fecha(A.generadoEn) + (A.fechaLimite ? ' · Fecha límite ' + A.fechaLimite : '') + ' · Fichero autocontenido: no se actualiza solo';

  var k = A.kpis, h = '';
  h += '<div class="kpis">';
  h += kpi('Contactos', k.contactos, 'en la campaña', '#000');
  h += kpi('Revisados', k.revisados, pct(k.revisados, k.contactos) + ' %', 'var(--ok)');
  h += kpi('Propuestas pendientes', k.propuestasPendientes, 'por decidir', 'var(--conflicto)');
  h += kpi('En conflicto', k.conflictos, 'por resolver', 'var(--baja)');
  h += kpi('Comerciales sin entrar', k.comercialesSinEntrar, 'de ' + k.comerciales + ' · aún no han entrado', 'var(--modificado)');
  h += '</div><div class="rej"><div class="panel"><h3>Contactos por estado</h3>';
  ESTADOS.forEach(function (e) {
    h += '<div class="fila e-' + e + '" data-estado="' + e + '"><span class="punto"></span><span style="width:110px">' + TXT[e] + '</span>'
      + '<span class="barra"><i style="width:' + pct(A.estados[e], k.contactos) + '%"></i></span><b>' + A.estados[e] + '</b><span class="nota">' + pct(A.estados[e], k.contactos) + ' %</span></div>';
  });
  h += '<h3 style="margin-top:14px">Email y móvil</h3><div class="fichas">'
    + '<div class="ficha" data-datos="sin_email"><b>' + A.datos.sinEmail + '</b>Sin email (justificado)</div>'
    + '<div class="ficha" data-datos="sin_movil"><b>' + A.datos.sinMovil + '</b>Sin móvil (justificado)</div>'
    + '<div class="ficha" data-datos="falta"><b>' + A.datos.falta + '</b>Falta email o móvil</div></div></div>';
  h += '<div class="panel"><h3>Cambios ya aprobados</h3><div class="fichas">'
    + '<div class="ficha" data-aprobado="alta"><b>' + A.aprobados.alta + '</b>Altas</div>'
    + '<div class="ficha" data-aprobado="modificacion"><b>' + A.aprobados.modificacion + '</b>Modificaciones</div>'
    + '<div class="ficha" data-aprobado="baja"><b>' + A.aprobados.baja + '</b>Bajas</div></div>'
    + '<h3 style="margin-top:14px">Contestan encuestas</h3><div class="fichas">'
    + '<div class="ficha" data-encuesta="ventas"><b>' + A.encuestas.ventas + '</b>Encuesta de ventas</div>'
    + '<div class="ficha" data-encuesta="postventa"><b>' + A.encuestas.postventa + '</b>Encuesta de postventa</div></div>'
    + '<p class="nota" style="margin-top:10px">Los contactos marcados OK también salen en el Excel: no cambian nada en el sistema, así que no van a la hoja CAMBIOS sino a la hoja ESTADO.</p></div></div>';
  h += '<div class="panel"><h3>Avance por comercial</h3><div class="pild" id="unidades"></div>'
    + '<div class="barra-f"><div class="multi" id="multi"><button type="button" id="multi-b">Comercial: Todos</button><div><input type="search" id="multi-q" placeholder="Escribe unas letras… (Enter)"><p class="nota"><a href="#" id="m-todos">Todos</a> · <a href="#" id="m-ninguno">Ninguno</a></p><div id="multi-l"></div></div></div>'
    + '<span class="nota" id="cuenta"></span></div><div style="overflow:auto"><table><thead><tr id="th"></tr></thead><tbody id="tb"></tbody></table></div></div>';
  $('app').innerHTML = h;

  function kpi(e, n, s, c) { return '<div class="kpi" style="--c:' + c + '"><div class="e">' + e + '</div><div class="n">' + n + '</div><div class="s">' + s + '</div></div>'; }

  // Paneles: un clic abre los contactos de toda la campaña
  document.querySelectorAll('[data-estado]').forEach(function (el) { el.onclick = function () { var e = el.dataset.estado; lista(todos.filter(function (c) { return c.estado === e; }), 'Contactos: ' + TXT[e], true); }; });
  document.querySelectorAll('[data-aprobado]').forEach(function (el) { el.onclick = function () { var t = el.dataset.aprobado; lista(todos.filter(function (c) { return aprobadas(c, t); }), TIPO[t] + ' aprobadas', true); }; });
  document.querySelectorAll('[data-encuesta]').forEach(function (el) { el.onclick = function () { var t = el.dataset.encuesta; lista(todos.filter(function (c) { return t === 'ventas' ? c.enc_ventas : c.enc_postventa; }), 'Contestan la encuesta de ' + t, true); }; });
  document.querySelectorAll('[data-datos]').forEach(function (el) {
    el.onclick = function () {
      var t = el.dataset.datos;
      var f = t === 'sin_email' ? function (c) { return c.sin_email; } : t === 'sin_movil' ? function (c) { return c.sin_movil; } : falta;
      lista(todos.filter(f), t === 'falta' ? 'Les falta el email o el móvil' : t === 'sin_email' ? 'Sin email (justificado)' : 'Sin móvil (justificado)', true);
    };
  });

  // Tabla de comerciales: unidad, selección de comerciales y orden
  var unidad = '', sel = null, orden = null;
  var COLS = [['nombre', 'Comercial'], ['usuario', 'Usuario'], ['t', 'Contactos'], ['r', 'Revisados'], ['avance', 'Avance'], ['p', 'Pendientes'], ['entrada', 'Última entrada']];
  var pu = '<button type="button" data-u="" class="on">Todas</button>';
  A.unidades.forEach(function (u) { pu += '<button type="button" data-u="' + u.codigo + '">' + esc(u.texto) + '</button>'; });
  $('unidades').innerHTML = pu;
  $('unidades').onclick = function (ev) { var b = ev.target.closest('button'); if (!b) return; unidad = b.dataset.u; $('unidades').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); tabla(); };
  $('th').innerHTML = COLS.map(function (c) { return '<th data-k="' + c[0] + '">' + c[1] + '</th>'; }).join('');
  $('th').onclick = function (ev) { var t = ev.target.closest('th'); if (!t) return; var kk = t.dataset.k; orden = orden && orden.k === kk ? { k: kk, asc: !orden.asc } : { k: kk, asc: true }; tabla(); };

  function filasComerciales() {
    return A.comerciales.map(function (c) {
      var d = c.porUnidad[unidad] || { t: 0, r: 0, p: 0 };
      return { id: c.id, nombre: c.nombre, usuario: c.usuario, entrada: c.ultimaEntrada || '', t: d.t, r: d.r, p: d.p, avance: d.t ? d.r / d.t : 0 };
    }).filter(function (f) { return f.t > 0; });
  }
  function tabla() {
    var base = filasComerciales();
    var v = base.filter(function (f) { return !sel || sel[f.id]; });
    var kk = orden ? orden.k : 'avance', s = orden ? (orden.asc ? 1 : -1) : 1;
    v.sort(function (a, b) { var x = a[kk], y = b[kk]; if (typeof x === 'string') { x = norm(x); y = norm(y); } return (x < y ? -1 : x > y ? 1 : 0) * s; });
    $('tb').innerHTML = v.map(function (f) {
      var p = Math.round(f.avance * 100);
      return '<tr class="' + (f.entrada ? '' : 'nunca') + '"><td>' + esc(f.nombre) + '</td><td>' + esc(f.usuario) + '</td>'
        + '<td class="n"><span class="cif" data-c="' + f.id + '" data-f="todos">' + f.t + '</span></td>'
        + '<td class="n">' + (f.r ? '<span class="cif v" data-c="' + f.id + '" data-f="revisados">' + f.r + '</span>' : '0') + '</td>'
        + '<td><span class="barra" style="display:inline-block;width:120px;vertical-align:middle;--c:' + (p >= 100 ? 'var(--ok)' : p < 50 ? 'var(--conflicto)' : 'var(--modificado)') + '"><i style="width:' + p + '%"></i></span> ' + p + ' %</td>'
        + '<td class="n">' + f.p + '</td><td>' + (f.entrada ? fecha(f.entrada) : '<i>nunca</i>') + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="nota">Ningún comercial con ese filtro.</td></tr>';
    $('cuenta').textContent = v.length + ' de ' + base.length + ' comerciales';
  }
  $('tb').onclick = function (ev) {
    var c = ev.target.closest('[data-c]'); if (!c) return;
    var uid = c.dataset.c, rev = c.dataset.f === 'revisados';
    var filas = (D.contactos[uid] || []).filter(function (f) { return (!unidad || f.unidad === unidad) && (!rev || f.estado !== 'pendiente'); });
    lista(filas, (rev ? 'Revisados por ' : 'Contactos de ') + D.usuarios[uid].nombre + (unidad ? ' · ' + textoUnidad[unidad] : ''), false);
  };

  // Filtro de comercial: escribir reduce la lista, Enter se queda con los que coinciden, clic en el nombre elige solo ese
  function multi() {
    var q = norm($('multi-q').value);
    $('multi-l').innerHTML = A.comerciales.filter(function (c) { return !q || norm(c.nombre + ' ' + c.usuario).indexOf(q) >= 0; }).map(function (c) {
      return '<label><input type="checkbox" data-id="' + c.id + '"' + (!sel || sel[c.id] ? ' checked' : '') + '> <span data-solo="' + c.id + '">' + esc(c.nombre) + '</span></label>';
    }).join('');
    var n = sel ? Object.keys(sel).length : 0;
    $('multi-b').textContent = 'Comercial: ' + (!sel ? 'Todos' : !n ? 'Ninguno' : n === 1 ? A.comerciales.filter(function (c) { return sel[c.id]; })[0].nombre : n + ' seleccionados');
  }
  $('multi-b').onclick = function () { $('multi').classList.toggle('on'); $('multi-q').value = ''; multi(); $('multi-q').focus(); };
  $('multi-q').oninput = multi;
  $('multi-q').onkeydown = function (ev) {
    if (ev.key !== 'Enter') return; ev.preventDefault(); var q = norm($('multi-q').value); sel = {};
    A.comerciales.forEach(function (c) { if (norm(c.nombre + ' ' + c.usuario).indexOf(q) >= 0) sel[c.id] = 1; }); multi(); tabla();
  };
  $('m-todos').onclick = function (ev) { ev.preventDefault(); sel = null; multi(); tabla(); };
  $('m-ninguno').onclick = function (ev) { ev.preventDefault(); sel = {}; multi(); tabla(); };
  $('multi-l').onclick = function (ev) {
    var solo = ev.target.closest('[data-solo]');
    if (solo) { ev.preventDefault(); sel = {}; sel[solo.dataset.solo] = 1; multi(); tabla(); return; }
    var cb = ev.target.closest('input'); if (!cb) return;
    if (!sel) { sel = {}; A.comerciales.forEach(function (c) { sel[c.id] = 1; }); }
    if (cb.checked) sel[cb.dataset.id] = 1; else delete sel[cb.dataset.id];
    if (Object.keys(sel).length === A.comerciales.length) sel = null; multi(); tabla();
  };
  document.addEventListener('click', function (ev) { if (!ev.target.closest('#multi')) $('multi').classList.remove('on'); });
  tabla();

  // Ventana de detalle: buscador, píldoras de estado, orden por columnas, de 100 en 100; clic en una fila, la ficha
  function lista(filas, titulo, global) {
    var q = '', est = '', ord = { k: 'cliente', asc: true }, pag = 1;
    var tel = function (r) { return r.tel_contacto || r.telefono || ''; };
    var cols = [['cliente', 'Cliente'], ['localidad', 'Localidad'], [global ? 'comerciales' : 'unidad', global ? 'Comercial' : 'Unidad'], ['contacto', 'Contacto'], ['desc_funcion', 'Función'], ['email', 'Email'], ['tel', 'Teléfono'], ['estado', 'Estado'], ['validado_por', 'Validado por']];
    var val = function (r, kk) {
      if (kk === 'contacto') return r.nombre + ' ' + r.apellido + (r.es_alta ? ' (nuevo)' : '');
      if (kk === 'tel') return tel(r);
      if (kk === 'unidad') return textoUnidad[r.unidad] || r.unidad;
      if (kk === 'comerciales') return (ven[r.id] || []).map(function (x) { return D.usuarios[x.u].nombre; }).join(' · ');
      if (kk === 'estado') return ESTADOS.indexOf(r.estado);
      return r[kk] || '';
    };
    function pinta() {
      var nq = norm(q);
      var v = filas.filter(function (r) { return (!est || r.estado === est) && (!nq || norm([r.cliente, r.localidad, r.nombre, r.apellido, r.email, r.tel_contacto, r.telefono].join(' ')).indexOf(nq) >= 0); });
      v.sort(function (a, b) { var x = val(a, ord.k), y = val(b, ord.k); if (typeof x === 'string') { x = norm(x); y = norm(y); } return (x < y ? -1 : x > y ? 1 : 0) * (ord.asc ? 1 : -1); });
      var paginas = Math.max(1, Math.ceil(v.length / 100)); pag = Math.min(pag, paginas);
      var cuenta = {}; filas.forEach(function (r) { cuenta[r.estado] = (cuenta[r.estado] || 0) + 1; });
      var h = '<div class="barra-f"><input type="search" id="lq" placeholder="Filtrar por cliente, nombre, email, teléfono…" value="' + esc(q) + '"><div class="pild" style="margin:0">'
        + '<button type="button" data-e=""' + (est ? '' : ' class="on"') + '>Todos ' + filas.length + '</button>';
      ESTADOS.forEach(function (e) { if (cuenta[e]) h += '<button type="button" data-e="' + e + '"' + (est === e ? ' class="on"' : '') + '>' + TXT[e] + ' ' + cuenta[e] + '</button>'; });
      h += '</div><span class="nota">' + v.length + ' contactos' + (paginas > 1 ? ' · página ' + pag + '/' + paginas + ' <a href="#" data-p="-1">‹</a> <a href="#" data-p="1">›</a>' : '') + '</span></div>';
      h += '<table><thead><tr>' + cols.map(function (c) { return '<th data-o="' + c[0] + '">' + c[1] + (ord.k === c[0] ? (ord.asc ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr></thead><tbody>';
      v.slice((pag - 1) * 100, pag * 100).forEach(function (r) {
        h += '<tr class="clic" data-id="' + r.id + '"><td><b>' + esc(r.cliente) + '</b></td><td>' + esc(r.localidad) + '</td><td>' + esc(val(r, cols[2][0])) + '</td><td>' + esc(val(r, 'contacto')) + '</td><td>' + esc(r.desc_funcion)
          + '</td><td>' + esc(r.email) + '</td><td>' + esc(tel(r)) + '</td><td><span class="badge e-' + r.estado + '">' + TXT[r.estado] + '</span></td><td>' + esc(r.validado_por) + '</td></tr>';
      });
      $('lc').innerHTML = h + '</tbody></table>';
      var i = $('lq'); i.oninput = function () { q = i.value; pag = 1; pinta(); $('lq').focus(); $('lq').setSelectionRange(q.length, q.length); };
    }
    $('det').innerHTML = '<div class="ven"><header><b>' + esc(titulo) + '</b><button type="button" data-cerrar>✕</button></header><div class="cuerpo" id="lc"></div></div>';
    $('det').classList.add('on');
    $('lc').onclick = function (ev) {
      var t = ev.target;
      if (t.closest('[data-e]')) { est = t.closest('[data-e]').dataset.e; pag = 1; pinta(); return; }
      if (t.closest('[data-o]')) { var kk = t.closest('[data-o]').dataset.o; ord = ord.k === kk ? { k: kk, asc: !ord.asc } : { k: kk, asc: true }; pinta(); return; }
      if (t.closest('[data-p]')) { ev.preventDefault(); pag += Number(t.closest('[data-p]').dataset.p); if (pag < 1) pag = 1; pinta(); return; }
      var tr = t.closest('tr[data-id]'); if (tr) ficha(Number(tr.dataset.id));
    };
    pinta();
  }

  function ficha(id) {
    var c = porId[id], ps = D.propuestas[id] || [];
    var dato = function (k, v) { return '<div><small>' + k + '</small>' + (v ? esc(v) : '<span class="nota">—</span>') + '</div>'; };
    var h = '<div class="ven est"><header><span class="badge e-' + c.estado + '">' + TXT[c.estado] + '</span><b>' + esc(c.nombre + ' ' + c.apellido) + ' · ' + esc(c.cliente) + '</b><button type="button" data-cerrar>✕</button></header><div class="cuerpo">'
      + '<p><b>' + esc(c.desc_funcion || 'Sin función') + '</b> · ' + esc(c.desc_dpto || 'Sin departamento') + (c.es_alta ? ' · <b>NUEVO</b>' : '') + '</p><div class="dl" style="margin-top:8px">'
      + dato('Email', c.email || (c.sin_email ? 'No tiene: ' + c.motivo_sin_email : '')) + dato('Móvil / directo', c.tel_contacto || (c.sin_movil ? 'No tiene: ' + c.motivo_sin_movil : ''))
      + dato('Centralita', c.telefono) + dato('Teléfonos adicionales', [c.tel_ad1, c.tel_ad2, c.tel_ad3, c.tel_ad4, c.tel_ad5].filter(Boolean).join(' · '))
      + dato('Contesta encuestas', [c.enc_ventas && 'Ventas', c.enc_postventa && 'Postventa'].filter(Boolean).join(' y ')) + dato('Nº contacto', c.num_contacto || 'sin asignar')
      + dato('Localidad', c.localidad + (c.provincia ? ' · ' + c.provincia : '')) + dato('Pagador / Solicitante', c.pagador + ' / ' + c.solicitante)
      + dato('Lo ven', (ven[id] || []).map(function (x) { return D.usuarios[x.u].nombre + ' (' + (textoUnidad[x.unidad] || x.unidad) + ')'; }).join(' · '))
      + dato('Validado por', c.validado_por ? c.validado_por + ' el ' + fecha(c.validado_en) + (c.validado_admin ? ' · hecho por el administrador ' + c.validado_admin : '') : '')
      + '</div><h3 style="margin-top:14px;font-size:12px;text-transform:uppercase">Propuestas (' + ps.length + ')</h3>';
    ps.forEach(function (p) {
      var color = p.tipo === 'alta' ? 'var(--ok)' : p.tipo === 'baja' ? 'var(--baja)' : 'var(--modificado)';
      h += '<div class="prop" style="--c:' + color + '"><b>' + TIPO[p.tipo] + '</b> de ' + esc(p.comercial) + ' el ' + fecha(p.creado_en) + (p.admin ? ' · hecho por el administrador ' + esc(p.admin) : '')
        + ' · <b>' + esc(p.estado) + '</b>' + (p.en_conflicto && p.estado === 'pendiente' ? ' (en conflicto)' : '') + (p.resuelto_en ? ' el ' + fecha(p.resuelto_en) : '') + (p.comentario ? ' · «' + esc(p.comentario) + '»' : '');
      if (p.tipo === 'baja') h += '<div>Motivo: ' + esc(p.motivo) + '</div>';
      else (p.diff || []).forEach(function (d) { if (p.tipo !== 'alta' || d[2]) h += '<div>' + esc(d[0]) + ': ' + (p.tipo === 'alta' ? '' : '<span class="viejo">' + esc(d[1] || '—') + '</span> → ') + '<span class="nuevo">' + esc(d[2] || '—') + '</span></div>'; });
      h += '</div>';
    });
    $('ficha').innerHTML = h + '</div></div>';
    $('ficha').classList.add('on');
  }

  var AYUDA = '<div class="ven est"><header><b>Ayuda · Foto del avance</b><button type="button" data-cerrar>✕</button></header><div class="cuerpo">'
    + '<p>Este fichero es una <b>foto</b> del avance de la campaña de depuración de contactos comerciales, tal como estaba en la fecha y hora de la cabecera. Funciona sin conexión y <b>no se actualiza solo</b>: para ver datos nuevos hay que pedir otra foto. Aquí no se puede validar ni aprobar nada: es para mirar.</p>'
    + '<p style="margin-top:8px"><b>Indicadores</b>: contactos de la campaña, revisados (los que ya no están en «Pendiente»), propuestas que esperan decisión, contactos en conflicto (dos comerciales no coinciden) y comerciales que aún no han entrado.</p>'
    + '<p style="margin-top:8px"><b>Estados</b>: Pendiente (nadie lo ha mirado), OK (datos confirmados), Modificado (un dato cambiado, espera aprobación), Baja (se ha pedido que desaparezca) y En conflicto. Un clic en un estado, en un tipo de cambio aprobado, en una encuesta o en las cifras de email y móvil abre esos contactos.</p>'
    + '<p style="margin-top:8px"><b>Tabla de comerciales</b>: va de menor a mayor avance. Un clic en una cabecera ordena (otro, al revés); las píldoras restringen las cifras a una unidad de negocio; el filtro «Comercial» se queda con uno o con varios (escribe y pulsa Enter, o haz clic en un nombre). Las cifras de Contactos y Revisados abren el listado.</p>'
    + '<p style="margin-top:8px"><b>Listado</b>: buscador sin tildes, píldoras por estado, orden por columnas, de 100 en 100. Un clic en una fila abre la ficha, con el historial de propuestas.</p>'
    + '<p style="margin-top:8px"><b>Teclas</b>: <b>?</b> abre esta ayuda y <b>Esc</b> cierra la ventana de encima.</p></div></div>';
  $('fab').onclick = function () { $('ayuda').innerHTML = AYUDA; $('ayuda').classList.add('on'); };
  document.addEventListener('click', function (ev) {
    var capa = ev.target.closest('.capa');
    if (ev.target.closest('[data-cerrar]') || (capa && ev.target === capa)) capa.classList.remove('on');
  });
  document.addEventListener('keydown', function (ev) {
    var enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
    if (ev.key === '?' && !enCampo) { $('fab').onclick(); return; }
    if (ev.key !== 'Escape') return;
    var abiertas = ['ayuda', 'ficha', 'det'].filter(function (x) { return $(x).classList.contains('on'); });
    if (abiertas.length) $(abiertas[0]).classList.remove('on');
  });
})();`;
