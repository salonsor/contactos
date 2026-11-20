import { useState, type ReactNode } from 'react';
import { Icono } from './Icono';

const Item = ({ badge, clase = '', nombre, children }: { badge: string; clase?: string; nombre: string; children: ReactNode }) => (
  <div className="h-item">
    <span className={`h-badge ${clase}`}>{badge}</span>
    <span><span className="h-name">{nombre}</span><span className="h-desc">{children}</span></span>
  </div>
);

const Seccion = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <div className="h-section"><div className="h-section-title">{titulo}</div>{children}</div>
);

const ESTADOS = (
  <Seccion titulo="Los cinco estados de un contacto">
    <Item badge="PEND" nombre="Pendiente">Nadie lo ha mirado todavía. Así empiezan todos.</Item>
    <Item badge="OK" clase="ok" nombre="OK">Un comercial ha confirmado que los datos están bien. Vale al momento, sin aprobación.</Item>
    <Item badge="MOD" clase="kpi" nombre="Modificado">Alguien cambió algún dato. Ya se ve, pero espera el visto bueno del administrador.</Item>
    <Item badge="BAJA" clase="baja" nombre="Baja">Se ha pedido que desaparezca. Sale tachado hasta que el administrador decida.</Item>
    <Item badge="CONF" clase="conf" nombre="En conflicto">Dos comerciales no coinciden sobre la misma persona. Desempata el administrador.</Item>
  </Seccion>
);

const TECLAS = (
  <Seccion titulo="Atajos de teclado">
    <Item badge="?" clase="filter" nombre="?">Abre esta ayuda por la sección en la que estás.</Item>
    <Item badge="ESC" clase="filter" nombre="Esc">Cierra la ventana abierta o borra el buscador.</Item>
    <Item badge="CTRL K" clase="filter" nombre="Ctrl + K">Lleva el cursor al buscador (Mis clientes y Usuarios).</Item>
    <Item badge="ENTER" clase="filter" nombre="Enter">En los filtros de comercial, se queda con todos los que coinciden con lo escrito.</Item>
  </Seccion>
);

type Panel = { id: string; titulo: string; contenido: ReactNode };

const COMERCIAL: Panel[] = [
  {
    id: 'general', titulo: '🏠 General', contenido: (
      <>
        <Seccion titulo="¿De qué va todo esto?">
          <div className="h-note">Repasa los contactos de tus clientes y di, persona a persona: <b>OK</b> si los datos están bien,{' '}
            <b>Modificar</b> si algún dato está mal o falta, <b>Baja</b> si esa persona ya no procede, o <b>Añadir contacto</b> si
            falta alguien. Cada acción se guarda al momento, con tu nombre y la hora. Tu objetivo: que no te quede ningún contacto en
            «Pendiente». Cuando tu barra llegue al 100 %, has terminado.</div>
        </Seccion>
        <Seccion titulo="El menú de la izquierda">
          <Item badge="FECHA" clase="conf" nombre="Fecha límite">Arriba, en rojo, con los días que quedan.</Item>
          <Item badge="NAV" clase="filter" nombre="Mis clientes · Contraseña · Ayuda">Tu lista de trabajo, el cambio de contraseña y esta ayuda.</Item>
          <Item badge="TÚ" clase="filter" nombre="Abajo">Quién está conectado: iniciales, nombre y rol; y Salir.</Item>
        </Seccion>
        {ESTADOS}
        {TECLAS}
      </>
    ),
  },
  {
    id: 'mis-clientes', titulo: '📋 Mis clientes', contenido: (
      <Seccion titulo="La lista de clientes">
        <div className="h-note">Solo ves <b>tus clientes</b>: aquellos en los que figuras como comercial en el listado de facturación de la
          campaña. Si llevas un cliente por dos unidades de negocio, aparece una línea por unidad. Si no aparece ninguno, no es un fallo:
          el listado no incluye ningún cliente a tu nombre; si crees que debería, avisa al administrador.</div>
        <Item badge="KPI" clase="kpi" nombre="Cajas de resumen"><b>Mi avance</b> (porcentaje y contactos revisados), <b>Mis clientes</b>{' '}
          (y cuántos tienes terminados), <b>Contactos por revisar</b> (un clic deja solo los clientes con pendientes) y <b>Esperando
          aprobación</b> (cambios tuyos que el administrador aún no ha decidido).</Item>
        <Item badge="TBL" clase="table" nombre="Orden">De <b>mayor a menor facturación</b>, para que empieces por los importantes. Franja gris:
          sin empezar; azul: a medias; verde: «completo».</Item>
        <Item badge="FIL" clase="filter" nombre="Píldoras de unidad y Solo con pendientes">Las píldoras filtran por unidad de negocio y solo
          aparecen si llevas clientes en más de una. «Solo con pendientes» esconde los terminados y se combina con la unidad.</Item>
        <Item badge="FIL" clase="filter" nombre="Buscador">Filtra mientras escribes por cliente, localidad, provincia o solicitante, sin
          importar tildes ni mayúsculas, con varias palabras en cualquier orden. <b>Ctrl+K</b> lleva el cursor; <b>Esc</b> o la X lo borran.</Item>
        <Item badge="NAV" clase="table" nombre="Entrar en un cliente">Un clic (o un toque) en la línea abre sus contactos.</Item>
      </Seccion>
    ),
  },
  {
    id: 'contactos', titulo: '👤 Contactos', contenido: (
      <>
        <Seccion titulo="Los contactos de un cliente">
          <div className="h-note">Una tarjeta por persona. Primero las <b>pendientes</b>, por apellido; las revisadas bajan al final. Las cajas de
            arriba resumen el cliente y filtran la lista con un clic. «Este cliente también lo lleva…» dice con qué compañeros lo compartes.</div>
          <Item badge="TEL" clase="filter" nombre="Teléfonos"><b>Móvil/directo</b>: el de la persona. <b>Centralita</b>: el general del cliente.{' '}
            <b>Adicionales</b>: otros que tenga anotados (hasta cinco). En el móvil, un toque llama o abre el correo.</Item>
          <Item badge="!" clase="conf" nombre="Email y móvil obligatorios">Si falta alguno, la tarjeta lo avisa en ámbar y <b>OK</b> pasa a ser{' '}
            <b>Completar</b>.</Item>
          <Item badge="ENC" clase="ok" nombre="Ventas y Postventa">Márcalas si esa persona contesta esa encuesta de satisfacción. Se guardan al
            momento, sin pasar por el administrador.</Item>
        </Seccion>
        <Seccion titulo="Los botones">
          <Item badge="OK" clase="ok" nombre="OK">Todo está bien. Un toque y validado: sin confirmación ni aprobación. ¿Lo pulsaste sin querer? No
            hay nada que deshacer: sigue con Modificar o Baja.</Item>
          <Item badge="COMP" clase="conf" nombre="Completar">Sale en lugar de OK si falta el email o un móvil: añade lo que falta o anota que no lo tiene.</Item>
          <Item badge="MOD" clase="kpi" nombre="Modificar">Abre el formulario con todos los datos.</Item>
          <Item badge="BAJA" clase="baja" nombre="Baja">Pide el motivo (obligatorio) y deja el contacto tachado hasta que el administrador decida.</Item>
          <Item badge="DESH" clase="filter" nombre="Deshacer">Mientras el administrador no haya decidido, la nota «pendiente de aprobar»
            lleva un botón Deshacer: una modificación vuelve a los datos de antes, una baja deja de estar tachada y un alta desaparece. Ya
            decidida, la tarjeta dice qué pasó: en verde si se aprobó (con su comentario), en rojo si se rechazó y en gris si quedó sin efecto.</Item>
        </Seccion>
        {ESTADOS}
      </>
    ),
  },
  {
    id: 'modificar', titulo: '✏️ Modificar y añadir', contenido: (
      <>
        <Seccion titulo="El formulario">
          <Item badge="REQ" clase="conf" nombre="Nombre y apellido">Obligatorios. Se guardan en mayúsculas, escribas como escribas.</Item>
          <Item badge="LISTA" clase="filter" nombre="Departamento y función">Desplegables con la tabla oficial. Primero el departamento; las funciones
            se ajustan solas. Si el contacto trae de origen uno que ya no existe, el desplegable lo avisa y pide uno válido.</Item>
          <Item badge="REQ" clase="conf" nombre="Email">Obligatorio. Tiene que parecer un email. Se guarda en minúsculas.</Item>
          <Item badge="TEL" clase="filter" nombre="Teléfonos">Solo cifras, espacios y el signo +. Tiene que haber al menos un móvil (9 cifras que
            empiecen por 6 o 7) en cualquiera de ellos. Los adicionales 2 a 5, bajo «Más teléfonos adicionales».</Item>
          <Item badge="NO" clase="baja" nombre="No tiene email / No tiene móvil">Si de verdad no tiene, marca la casilla y escribe el motivo. Queda
            anotado con tu nombre y lo ve el administrador. No inventes el dato. Si solo marcas eso, no hay nada que aprobar: el contacto queda
            validado al momento.</Item>
        </Seccion>
        <Seccion titulo="Al guardar">
          <div className="h-note">El contacto pasa a <b>Modificado</b> y el cambio se ve desde ese momento, pendiente de aprobación. Si guardas sin
            haber cambiado nada, la aplicación te lo dice y no crea ninguna propuesta.</div>
        </Seccion>
        <Seccion titulo="Añadir contacto">
          <div className="h-note">El botón negro <b>Añadir contacto</b> abre el mismo formulario en blanco, con la centralita habitual del cliente.
            Son obligatorios nombre, apellido, departamento, función, email y un móvil (o la marca de que no tiene, con el motivo). Antes de
            guardar se compara el email y los teléfonos con todos los contactos del cliente: si alguno coincide, te lo enseña. Si es la misma
            persona, cancela y modifica la que existe; si es otra, <b>Guardar de todos modos</b>. El contacto nuevo sale con la etiqueta{' '}
            <b>NUEVO</b>, validado a tu nombre, y lo ven todos los comerciales del cliente.</div>
        </Seccion>
      </>
    ),
  },
  {
    id: 'compartidos', titulo: '🤝 Compartidos', contenido: (
      <Seccion titulo="Contactos compartidos con otros comerciales">
        <div className="h-note">Un contacto compartido aparece en la lista de todos, pero <b>se revisa una sola vez</b>: el primero que llega lo
          cierra, y a los demás les cuenta como hecho. Nadie pisa el trabajo de nadie.</div>
        <Item badge="VAL" clase="ok" nombre="«Validado por X el día D»">Un compañero ya lo revisó. Si estás de acuerdo, no hagas nada.</Item>
        <Item badge="CORR" clase="conf" nombre="Corregir">En esos contactos, Modificar se llama Corregir. Tu corrección no pisa lo que validó tu
          compañero: queda como propuesta, el contacto pasa a En conflicto y el administrador decide viendo las dos versiones.</Item>
        <Item badge="BAJA" clase="baja" nombre="Baja sobre uno validado por otro">Igual que corregir: va al administrador como conflicto.</Item>
        <Item badge="CONF" clase="conf" nombre="«En conflicto: lo resolverá el administrador»">Los datos no cambian hasta que el administrador decida.</Item>
      </Seccion>
    ),
  },
];

const ADMIN: Panel[] = [
  {
    id: 'general', titulo: '🏠 General', contenido: (
      <>
        <Seccion titulo="Administración">
          <div className="h-note">Ves cómo va la campaña, decides sobre las propuestas de los comerciales y exportas el Excel de carga.
            Abajo en el menú, <b>Configuración</b> fija la fecha límite (texto libre que ven todos en el menú) y cómo salen en el Excel los
            emails y teléfonos vacíos («#» o en blanco).</div>
        </Seccion>
        {ESTADOS}
        {TECLAS}
      </>
    ),
  },
  {
    id: 'avance', titulo: '📊 Avance', contenido: (
      <>
        <Seccion titulo="El cuadro de mandos">
          <Item badge="KPI" clase="kpi" nombre="Indicadores"><b>Contactos</b> de la campaña, <b>Revisados</b> (con su porcentaje), <b>Propuestas
            pendientes</b> (sin las que están en conflicto; el mismo número sale en ámbar junto a «Propuestas»), <b>En conflicto</b> (en rojo junto
            a «Conflictos») y <b>Comerciales sin entrar</b>.</Item>
          <Item badge="CLIC" clase="table" nombre="Paneles">Contactos por estado, Cambios ya aprobados (lo que irá a la hoja CAMBIOS; los OK salen en
            ESTADO), Contestan encuestas y Email y móvil (justificados o aún por completar): un clic en cada fila o ficha abre sus contactos.</Item>
        </Seccion>
        <Seccion titulo="Tabla de comerciales">
          <Item badge="TBL" clase="table" nombre="Orden">Al abrir, de menor a mayor avance. Un clic en una cabecera ordena; el segundo invierte.
            Los que nunca han entrado salen atenuados, con «nunca».</Item>
          <Item badge="FIL" clase="filter" nombre="Unidad y Comercial">Las píldoras restringen las cifras a una unidad al instante. El filtro
            Comercial es de selección múltiple con buscador: escribe, <b>Enter</b> se queda con los que coinciden, el clic en un nombre elige solo
            ese y la casilla marca uno a uno; «Todos» y «Ninguno».</Item>
          <Item badge="CLIC" clase="table" nombre="Cifras">Contactos (azul) y Revisados (verde) abren la ventana con esos contactos; Pendientes
            lleva a las propuestas de ese comercial.</Item>
        </Seccion>
        <Seccion titulo="Ventana de detalle y ficha">
          <Item badge="TBL" clase="table" nombre="Ventana">Buscador sin tildes, píldoras de estado con su recuento, orden por cabecera (fija al
            bajar), CSV de lo que ves, de 100 en 100. Un clic en una fila abre la ficha; Esc o la X cierran.</Item>
          <Item badge="FICHA" clase="table" nombre="Ficha">Todo lo que se sabe del contacto: datos, quién lo validó, qué comerciales lo ven, sus
            propuestas y el registro de actividad («en nombre de» si lo hizo un administrador desde la cuenta de un comercial).</Item>
        </Seccion>
      </>
    ),
  },
  {
    id: 'propuestas', titulo: '📥 Propuestas', contenido: (
      <Seccion titulo="Aprobar o rechazar">
        <Item badge="TBL" clase="table" nombre="Listado">Una línea por propuesta: quién, cuándo y qué cambia. «Ver cambios» despliega el antes y, en
          verde, el después; en las altas, sus datos con los códigos como irán al Excel; en las bajas, el motivo. La marca «admin» indica que la
          hizo un administrador entrando como el comercial.</Item>
        <Item badge="FIL" clase="filter" nombre="Filtros">Las cinco cajas resumen lo pendiente y filtran con un clic; los desplegables de estado,
          tipo y comercial son de selección múltiple. «Superadas»: quedaron sin efecto en un conflicto; «anuladas»: las deshizo el comercial.</Item>
        <Item badge="OK" clase="ok" nombre="Aprobar">Confirma el cambio, que ya estaba aplicado de forma provisional, y lo incluye en la hoja CAMBIOS.</Item>
        <Item badge="NO" clase="baja" nombre="Rechazar">Se deshace: los datos vuelven a los anteriores, la baja se anula o el contacto nuevo desaparece.</Item>
        <Item badge="LOTE" clase="filter" nombre="En bloque">Marca las casillas (o «Marcar todas»), escribe si quieres un comentario para el comercial
          y pulsa «Aprobar marcadas» o «Rechazar marcadas». Con alguna marcada, la franja flota abajo.</Item>
      </Seccion>
    ),
  },
  {
    id: 'conflictos', titulo: '⚠️ Conflictos', contenido: (
      <Seccion titulo="Cuando dos comerciales no coinciden">
        <div className="h-note">Un contacto entra en conflicto cuando un comercial corrige o da de baja algo que otro ya había validado. La segunda
          opinión queda «sin aplicar» hasta que decidas.</div>
        <Item badge="VER" clase="kpi" nombre="Comparativa de versiones">Bajo cada contacto, campo a campo: <b>Al inicio</b> (el dato de partida),
          <b> Ahora</b> (lo validado, en ámbar) y una columna por propuesta enfrentada con lo que quedaría si la apruebas. Lo que cambia sale en
          azul; «= igual», lo que no toca; una baja, en morado con su motivo.</Item>
        <Item badge="HIST" clase="kpi" nombre="Historial del contacto">Todo lo que ha pasado, en orden: validaciones OK, modificaciones y bajas con su
          antes → después, y cómo acabó cada una (aprobada, rechazada, anulada, superada). Las enfrentadas llevan el punto rodeado de ámbar.
          «Ver/Ocultar todos los cambios» lo pliega en todos los contactos a la vez.</Item>
        <Item badge="OK" clase="ok" nombre="Aprobar esta">Se aplica, el contacto queda validado a nombre de quien la hizo y las demás pendientes pasan
          a «superadas» (un alta sin aprobar queda aprobada).</Item>
        <Item badge="NO" clase="baja" nombre="Rechazar esta">Se descarta. Si no queda ninguna otra en conflicto, el contacto vuelve a su estado anterior.</Item>
        <Item badge="MANO" clase="conf" nombre="Resolver a mano">Abres el historial y fijas tú los datos: cuenta como una modificación aprobada a tu
          nombre y deja superadas las pendientes.</Item>
      </Seccion>
    ),
  },
  {
    id: 'usuarios', titulo: '👥 Usuarios', contenido: (
      <Seccion titulo="Usuarios">
        <Item badge="CON" clase="ok" nombre="Conexión">Verde si hizo algo en los últimos 5 minutos, ámbar hasta 15. Arriba, el tablero del día.</Item>
        <Item badge="ROL" clase="filter" nombre="ADMIN / COMERCIAL">El rol. Una misma persona puede tener los dos.</Item>
        <Item badge="CLAVE" clase="conf" nombre="CLAVE INICIAL">Todavía no ha cambiado la contraseña que se le dio.</Item>
        <Item badge="SIN" clase="filter" nombre="SIN CLIENTES">No figura como comercial de ningún cliente: puede entrar, pero no tiene nada que revisar.</Item>
        <Item badge="BTN" clase="table" nombre="Contraseña">Genera una al azar y la muestra una sola vez. Tendrá que cambiarla al entrar.</Item>
        <Item badge="BTN" clase="table" nombre="Entrar como">Abre la aplicación tal como la ve ese comercial. Lo que hagas queda a su nombre con la marca
          «hecho por el administrador». «Volver a mi cuenta» o el icono de salir te devuelven.</Item>
        <Item badge="BTN" clase="table" nombre="Hacer admin / Quitar admin">No puedes quitártelo a ti mismo.</Item>
      </Seccion>
    ),
  },
  {
    id: 'exportar', titulo: '📤 Exportar', contenido: (
      <>
        <Seccion titulo="Exportar Excel">
          <Item badge="XLS" clase="ok" nombre="CAMBIOS">Las filas con una acción aprobada y las marcadas para alguna encuesta (Acción ALTA,
            MODIFICACIÓN, BAJA o ENCUESTA), con quién la propuso, si la hizo un administrador en su nombre, la fecha, quién la aprobó y el
            motivo de la baja. Las altas van sin número de contacto; un alta que después se dio de baja no se exporta.</Item>
          <Item badge="XLS" clase="ok" nombre="ESTADO">Todos los contactos, también los OK, una fila por comercial que lo ve.</Item>
          <Item badge="XLS" clase="ok" nombre="RESUMEN">Los recuentos.</Item>
          <div className="h-note">Cada vez que se pulsa se genera con los datos de ese momento y se descarga en tu equipo. El servidor no
            guarda ninguna copia: si lo generas otro día, puede salir distinto.</div>
        </Seccion>
        <Seccion titulo="La foto HTML">
          <div className="h-note"><b>HTML autocontenido</b> descarga un único fichero con el Avance tal como está; <b>Ver foto</b> lo abre en una
            pestaña. Funciona sin servidor ni conexión, se ordena y se filtra, abre listados y fichas, pero no se actualiza solo y en él no se
            puede validar ni aprobar nada.</div>
        </Seccion>
      </>
    ),
  },
];

/** Pestaña de la ayuda que corresponde a la pantalla en la que se está */
const pestanaDe = (ruta: string, admin: boolean) => {
  if (!admin) return ruta.startsWith('/cliente') ? 'contactos' : ruta === '/' || ruta.startsWith('/mis-clientes') ? 'mis-clientes' : 'general';
  if (ruta === '/') return 'avance';
  if (ruta.startsWith('/propuestas')) return 'propuestas';
  if (ruta.startsWith('/conflictos')) return 'conflictos';
  if (ruta.startsWith('/usuarios')) return 'usuarios';
  return 'general';
};

export const Ayuda = ({ admin, ruta, onCerrar }: { admin: boolean; ruta: string; onCerrar: () => void }) => {
  const paneles = admin ? ADMIN : COMERCIAL;
  const [pestana, setPestana] = useState(() => pestanaDe(ruta, admin));
  const actual = paneles.find((p) => p.id === pestana) ?? paneles[0];
  return (
    <div id="help-overlay" className="open" onClick={(ev) => { if (ev.target === ev.currentTarget) onCerrar(); }}>
      <div id="help-modal" role="dialog" aria-labelledby="help-titulo">
        <div id="help-modal-header">
          <div>
            <h2 id="help-titulo">📖 Ayuda · Depuración de contactos comerciales</h2>
            <p>Qué significa cada pantalla, cada botón y cada estado. Esc cierra.</p>
          </div>
          <button className="modal-cerrar" type="button" title="Cerrar (Esc)" onClick={onCerrar}><Icono n="cerrar" /></button>
        </div>
        <div id="help-tabs">
          {paneles.map((p) => (
            <button key={p.id} type="button" className={'htab' + (actual.id === p.id ? ' active' : '')} onClick={() => setPestana(p.id)}>{p.titulo}</button>
          ))}
        </div>
        <div id="help-body"><div className="hpanel active">{actual.contenido}</div></div>
      </div>
    </div>
  );
};
