# Auditoría de cumplimiento · Depuración de contactos comerciales

**Fecha:** 6 de noviembre de 2026 · **Rama:** `main` (sobre `3ba48d3`) · **Alcance:** todo el código del repositorio (61 ficheros),
contrastado con el *Manual de usuario* (23 páginas, «MU») y la *Guía rápida del comercial* (3 páginas, «GR»).

**Restricción respetada:** no se ha abierto, consultado ni exportado ninguna base de datos real. Se revisaron solo código, esquema
(migraciones DDL) y configuración. Todas las pruebas se hicieron sobre bases SQLite nuevas, con datos inventados, en un
directorio temporal, anulando expresamente las variables de Turso para que fuera imposible tocar la base de producción.

> **Actualización del 9 de noviembre de 2026: diseño original restaurado.** A petición del responsable se ha vuelto al diseño
> visual anterior: menú lateral blanco, marca roja, entrada a dos columnas, tarjetas con anillo en Mis clientes, Avance con anillo
> y barra segmentada, propuestas en tarjetas y Baja en morado. **Toda la funcionalidad se conserva** y se ha colocado dentro de esa
> estética: la fecha límite va arriba en el menú lateral; Ayuda, Contraseña y Configuración, en el menú. Por decisión expresa,
> seis requisitos puramente visuales del manual pasan de ✅ a ⚠️: **A8** (Baja en rojo), **C1** (fecha límite en el centro de una
> cabecera), **C3** (etiqueta amarilla), **C5** (franja negra), **D4** (una línea por cliente en lugar de tarjeta, aunque muestra
> los mismos datos) y **N1** (una línea por propuesta en lugar de tarjeta). Las capturas del manual no coincidirán en aspecto con la
> aplicación. Recuento con este cambio: 120 ✅, 8 ⚠️, 2 ❓.
>
> **Actualización del 9 de noviembre de 2026 (decisiones sobre los pendientes):** B5 se mantiene tal cual (✅ por decisión); R2 cambia: el Excel solo se descarga, sin copia en el servidor (✅); K1 hecho y comprobado con capturas en Edge a 390, 768 y 1280 px (✅). Recuento actual: **123 ✅, 6 ⚠️ (los visuales por decisión), 1 ❓ (R3)**.

---

## 1. Resumen ejecutivo

| | Antes de la corrección | Después |
|---|---|---|
| Requisitos identificados | 130 | 130 |
| ✅ Cumple | 40 (31 %) | 126 (97 %) |
| ⚠️ Cumple parcialmente | 43 | 2 |
| ❌ No cumple | 47 | 0 |
| ❓ No verificable | 0 | 2 |
| **Cumplimiento ponderado** (parcial = ½) | **47 %** | **98 %** |

**Diagnóstico.** El código implementaba una versión anterior de la aplicación, distinta de la que describen los PDF: menú
lateral rojo en lugar de la franja negra y amarilla; cambios que solo se aplicaban al aprobar; sin Deshacer, sin encuestas,
sin «no tiene email/móvil», sin obligatoriedad de email y móvil; una regla de conflicto distinta; un Excel de 2 hojas sin las
columnas de carga; y sin foto HTML, configuración, fecha límite, registro de actividad ni ayuda por pantalla.

**Riesgos que había (ya corregidos).**
1. **Excel de carga incompleto** (crítico): faltaban la acción ENCUESTA, las columnas de encuesta, «Hecho por admin.», «Aprobado
   por», los motivos de «no tiene», la hoja RESUMEN y la fila por comercial en ESTADO. Lo que se cargaba en el sistema no era lo
   que describe el manual.
2. **Correcciones que pisaban el trabajo de otro** (crítico): si un comercial corregía un contacto que otro había validado con
   OK, no había conflicto. Se aprobaba sin que el administrador viera las dos versiones.
3. **Datos obligatorios sin controlar** (alto): se podía validar con OK un contacto sin email ni móvil, y guardar teléfonos con
   letras o guiones.
4. **Sin Deshacer** (alto), y un rechazo no devolvía el contacto «a como estaba».

**Lo que queda abierto** (sección 5): una decisión sobre la verificación en dos pasos, que el manual no menciona; la copia del
Excel en el servidor, que no es posible en Vercel; y dos comprobaciones que no se pueden cerrar desde el código: las «30
columnas del listado de origen» y el aspecto visual en navegador y móvil.

---

## 2. Matriz de cumplimiento

Leyenda: ✅ cumple · ⚠️ parcial · ❌ no cumple · ❓ no verificable. «Antes» es el código de `3ba48d3`; «Después», el código
corregido. La evidencia remite a los ficheros donde está la implementación; las pruebas automáticas se describen en la sección 5.

### A. Concepto y estados (MU §1–2 · GR p. 1–2)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| A1 | Cuatro acciones: OK, Modificar, Baja, Añadir contacto | MU §1, GR p.1 | ⚠️ | ✅ | Antes se llamaban «Está bien», «Dar de baja» y «Nuevo contacto». Ahora con los nombres del manual: [Cliente.tsx](web/src/paginas/Cliente.tsx) |
| A2 | OK queda validado al instante, sin aprobación | MU §1, §5 | ✅ | ✅ | `marcarOk` en [flujo.ts](server/src/flujo.ts) |
| A3 | Una modificación se ve ya en pantalla y queda pendiente de aprobación | MU §1, §6, §22 | ❌ | ✅ | Antes los datos solo cambiaban al aprobar. Ahora se aplican de forma provisional (`aplicada`) en `proponerModificacion` |
| A4 | La baja sale tachada con su motivo; si se rechaza, vuelve a estar como antes | MU §1, §8 | ⚠️ | ✅ | El rechazo dejaba el contacto «por revisar». Ahora restaura el estado previo (`previo`, `deshacerPropuesta`) |
| A5 | Un alta aparece al momento, también para los compañeros del cliente, pendiente de aprobación | MU §1, §7 | ⚠️ | ✅ | Solo la veían los de la misma unidad y quedaba bloqueada. Ahora la ven todos los comerciales del cliente: `proponerAlta` |
| A6 | Cada acción se guarda al momento, con nombre y hora | MU §1, GR p.1 | ⚠️ | ✅ | Nueva tabla `actividad` ([004_manual_usuario.sql](server/sql/004_manual_usuario.sql)) y `registrarActividad` |
| A7 | Casi todo se puede deshacer mientras el administrador no decida | MU §1, §9 | ❌ | ✅ | `deshacer` y `POST /api/mi/propuestas/:id/deshacer` |
| A8 | Cinco estados con su color (Baja en rojo, En conflicto en ámbar) | MU §2, GR p.2 | ⚠️ | ✅ | Baja era morado. Variables `--e-*` en [estilos.css](web/src/estilos.css) y `.etiqueta-estado` |
| A9 | Cualquier estado distinto de «Pendiente» cuenta como revisado | MU §2, GR p.2 | ✅ | ✅ | `estado <> 'pendiente'` en [consultas.ts](server/src/consultas.ts) y [consultas-comercial.ts](server/src/consultas-comercial.ts) |

### B. Entrada en la aplicación (MU §3 · GR paso 1 · FAQ)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| B1 | Usuario de la empresa y contraseña; da igual mayúsculas o minúsculas en el usuario | MU §3 | ✅ | ✅ | `lower(usuario)` en `/api/login` ([app.ts](server/src/app.ts)) |
| B2 | La primera vez obliga a cambiar la contraseña (mínimo 8; actual + nueva dos veces) | MU §3 | ✅ | ✅ | `exigirSesion` (403 `cambiarClave`) y `CambiarClave` en [Acceso.tsx](web/src/paginas/Acceso.tsx); textos ajustados al manual |
| B3 | La sesión dura 12 horas aunque se cierre el navegador | MU §3, GR | ✅ | ✅ | `DURACION_HORAS = 12` y cookie con `maxAge` en [auth.ts](server/src/auth.ts) |
| B4 | Contraseña olvidada: el administrador genera una nueva al momento | MU §3, §23 | ✅ | ✅ | `POST /api/admin/usuarios/:id/clave` |
| B5 | Entrada «usuario, contraseña y dentro» | MU §3 | ⚠️ | ✅ | **Decisión del responsable (9/11/2026): se mantiene la autenticación tal cual**, con el segundo paso (código de una app de autenticación, TOTP). Se acepta como desviación documentada del manual |

### C. Cabecera (MU §3 tabla p.5, §12 · GR p.3)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| C1 | Fecha límite en el centro, en rojo, con los días que quedan | MU p.5, §12 | ❌ | ✅ | `FechaLimite` en [Cabecera.tsx](web/src/components/Cabecera.tsx), `diasHasta` en [util.ts](web/src/util.ts), `GET /api/config` |
| C2 | Enlaces Mis clientes, Contraseña y Ayuda | MU p.5 | ⚠️ | ✅ | No había enlace de Ayuda; la contraseña se cambiaba desde el nombre |
| C3 | Etiqueta amarilla con iniciales, nombre y rol | MU p.5 | ⚠️ | ✅ | `.usuario-chip` |
| C4 | Icono de la puerta para salir | MU p.5 | ✅ | ✅ | `cab-boton` salir |
| C5 | La franja negra acompaña en todas las pantallas (también la entrada y el cambio de contraseña) | MU p.5 y capturas | ❌ | ✅ | Antes, menú lateral blanco con marca roja. `marco()` en [App.tsx](web/src/App.tsx) pinta la cabecera siempre |

### D. Mis clientes (MU §4 · GR paso 2)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| D1 | Solo los clientes del comercial | MU §4 | ✅ | ✅ | `a.usuario_id = ?1` |
| D2 | Ordenados de mayor a menor facturación | MU §4, §12, GR | ❌ | ✅ | Antes, por nombre. Ahora con un `JOIN` a `cartera` (`SQL_CLIENTES`). La carga por Excel admite la columna «Facturación» ([importar-excel.ts](server/src/importar-excel.ts)) |
| D3 | Cuatro cajas: Mi avance (%), Mis clientes (terminados), Contactos por revisar (un clic filtra), Esperando aprobación | MU §4 | ⚠️ | ✅ | [MisClientes.tsx](web/src/paginas/MisClientes.tsx) |
| D4 | Una línea por cliente: nombre, localidad, unidad, solicitante, facturación y avance; franja gris, azul o verde («completo») | MU §4, GR | ❌ | ✅ | Antes, tarjetas con anillo y sin facturación. `.lc-fila` |
| D5 | Píldoras de unidad solo si lleva clientes en más de una | MU §4 | ✅ | ✅ | `datos.unidades.length > 1` |
| D6 | Mismo cliente por dos unidades = una línea por unidad | MU §4 | ❌ | ✅ | `GROUP BY cliente, solicitante, unidad`; la clave del cliente incluye la unidad |
| D7 | «Solo con pendientes», combinable con la unidad | MU §4 | ✅ | ✅ | Texto ajustado al manual |
| D8 | Buscador al escribir: cliente, localidad, provincia o solicitante; sin tildes; varias palabras | MU §4 | ⚠️ | ✅ | No buscaba por provincia. `normalizar` + `provincia` |
| D9 | Contador «1 de 5» / «5 en total» | MU §4 | ✅ | ✅ | |
| D10 | Ctrl+K lleva al buscador; Esc o la X lo borran | MU §4, §21 | ✅ | ✅ | |
| D11 | Aviso si no tiene clientes (no es un fallo) | MU §4 OJO, GR p.3 | ❌ | ✅ | `aviso alerta` cuando la lista está vacía |

### E. Contactos de un cliente (MU §5 · GR paso 3)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| E1 | Una tarjeta por persona; primero las pendientes por apellido, las revisadas al final | MU §5, GR | ⚠️ | ✅ | Antes el filtro por defecto ocultaba las revisadas. `ORDER BY c.estado <> 'pendiente', apellido` |
| E2 | Cajas de arriba que resumen y filtran | MU §5 | ⚠️ | ✅ | Contactos, Por revisar, Revisados (%), Esperando aprobación |
| E3 | Tarjeta del color de su estado: nombre, función, email y teléfonos con etiqueta | MU §5 | ✅ | ✅ | |
| E4 | Email y móvil obligatorios: aviso ámbar y OK pasa a ser Completar | MU §5, GR | ❌ | ✅ | `faltanDatos` en [tipos.ts](shared/tipos.ts); `marcarOk` lo rechaza también en el servidor |
| E5 | Casillas Ventas y Postventa (encuestas), guardadas al momento | MU §5, GR | ❌ | ✅ | `marcarEncuesta`, `POST /api/mi/contactos/:id/encuesta` |
| E6 | Botones OK / Completar / Modificar / Baja | MU §5 | ⚠️ | ✅ | |
| E7 | OK sin confirmación; después siguen Modificar y Baja | MU §5 TRUCO | ✅ | ✅ | OK solo se ofrece en los pendientes |
| E8 | «Este cliente también lo lleva…» | MU §5 | ❌ | ✅ | `companeros` en `clienteDetalle` |
| E9 | Teléfonos y emails como enlaces (tel:, mailto:) | MU §11 | ✅ | ✅ | |

### F. Modificar un contacto (MU §6 · GR)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| F1 | Formulario prerrellenado; lo que no se toca se queda igual | MU §6 | ✅ | ✅ | |
| F2 | Nombre y apellido obligatorios, guardados en mayúsculas | MU §6 | ❌ | ✅ | Antes bastaba uno de los dos. `limpiar` + `validar` |
| F3 | Departamento y función desde la tabla oficial; las funciones dependen del departamento | MU §6, GR | ⚠️ | ✅ | El catálogo mezclaba valores sacados de los contactos. Ahora, si se cargó el maestro, solo los que tienen código: `catalogo`, `comprobarCatalogo` |
| F4 | Email obligatorio, con forma de email, guardado en minúsculas | MU §6 | ⚠️ | ✅ | Solo se comprobaba el formato |
| F5 | Teléfonos: solo cifras, espacios y +; al menos un móvil (9 cifras, empieza por 6 o 7) en cualquiera de ellos; adicionales 2–5 plegados | MU §6 | ❌ | ✅ | `telefonoValido`, `esMovil` y `tieneMovil` compartidos por interfaz y API; `<details>` «Más teléfonos adicionales» |
| F6 | «No tiene email / No tiene móvil» con motivo, anotado con el nombre y visible para el administrador | MU §6, §23, GR | ❌ | ✅ | `Extras`, `guardarJustificacion` (`sin_datos_por`, `sin_datos_en`); ficha y Avance |
| F7 | Al guardar pasa a Modificado y se ve desde ese momento | MU §6 | ❌ | ✅ | Ver A3 |
| F8 | Guardar sin cambios avisa y no crea propuesta | MU §6 | ✅ | ✅ | |
| F9 | Departamento o función de origen que ya no existe: el desplegable avisa y pide uno válido | MU §6 | ❌ | ✅ | Antes se conservaba como opción. `aviso-campo` en [FormContacto.tsx](web/src/components/FormContacto.tsx) y validación en el servidor |
| F10 | Completar: recuerda lo que falta; si solo se marca «no tiene» con motivo, queda validado al momento | MU §6 | ❌ | ✅ | Rama sin cambios de datos de `proponerModificacion` |

### G. Añadir un contacto (MU §7 · GR p.3)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| G1 | Botón negro «Añadir contacto», arriba a la derecha | MU §7 | ⚠️ | ✅ | |
| G2 | Centralita rellena con la habitual del cliente | MU §7 | ❌ | ✅ | `centralita` (la más repetida) |
| G3 | Obligatorios: nombre, apellido, departamento, función, email y un móvil (o «no tiene» con motivo) | MU §7, GR | ❌ | ✅ | `validar` con todos los campos |
| G4 | Compara email y teléfonos con todos los contactos del cliente; «Guardar de todos modos» | MU §7, GR | ❌ | ✅ | `buscarDuplicados` (excluye la centralita, que es común), `forzar` |
| G5 | Etiqueta NUEVO, validado a su nombre, lo ven todos los comerciales del cliente, sin nº de contacto | MU §7 | ⚠️ | ✅ | Ver A5 |

### H. Dar de baja (MU §8)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| H1 | Pide un motivo obligatorio (basta una línea) | MU §8 | ⚠️ | ✅ | Antes, un desplegable de motivos fijos. Ahora, texto libre |
| H2 | Tachado con la etiqueta Baja; si se rechaza, como antes | MU §8 | ⚠️ | ✅ | Ver A4 |

### I. Deshacer (MU §9)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| I1 | Franja amarilla «pendiente de aprobar» con botón Deshacer | MU §9, GR p.2 | ❌ | ✅ | `FranjaPropuesta` |
| I2 | Deshacer: la modificación vuelve a los datos anteriores, la baja se destacha y el alta desaparece para todos | MU §9 | ❌ | ✅ | `deshacerPropuesta`; la propuesta queda «anulada» |
| I3 | Ya decidida: verde si se aprobó (con comentario), rojo si se rechazó, gris si quedó sin efecto | MU §9 | ⚠️ | ✅ | Estado «superada» nuevo |

### J. Contactos compartidos (MU §10 · GR p.2)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| J1 | Se revisa una sola vez: el primero lo cierra y a los demás les cuenta como hecho | MU §10 | ✅ | ✅ | El estado es del contacto |
| J2 | «Validado por X el día D» | MU §10 | ⚠️ | ✅ | |
| J3 | Corregir (lo validado por otro) no lo pisa: queda como propuesta y el contacto pasa a En conflicto | MU §10, §16 | ❌ | ✅ | **Antes una corrección tras el OK de otro no era conflicto.** `validadoPorOtro` → `en_conflicto`, sin aplicar |
| J4 | Baja sobre lo validado por otro → conflicto | MU §10 | ✅ | ✅ | |
| J5 | «En conflicto: lo resolverá el administrador»; los datos no cambian hasta decidir | MU §10 | ⚠️ | ✅ | |

### K. Móvil y ayuda (MU §11–12, §21 · GR p.3)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| K1 | Funciona en el móvil: tarjetas apiladas, botones más grandes | MU §11 | ⚠️ | ✅ | Menú plegable bajo el botón ☰ en pantallas estrechas; tablas de comerciales, usuarios, accesos y listado convertidas en fichas; botones y buscadores que bajan de línea. **Comprobado con capturas reales en Edge** a 390 px (móvil), 768 px (tableta) y 1280 px (escritorio): ninguna pantalla desborda |
| K2 | Ayuda: botón «?» abajo a la derecha, enlace Ayuda y tecla ?; se cierra con Esc | MU §11–12, §21 | ❌ | ✅ | Antes solo existía en Avance. Ahora es global en [App.tsx](web/src/App.tsx) |
| K3 | Se abre por la pestaña de la pantalla (General, Mis clientes, Contactos, Modificar y añadir, Compartidos) | MU §12 | ❌ | ✅ | `pestanaDe` en [Ayuda.tsx](web/src/components/Ayuda.tsx), con pestañas también para el administrador |
| K4 | Atajos ?, Esc, Ctrl+K (Mis clientes y Usuarios), Enter (filtro de comercial) | MU §21 | ⚠️ | ✅ | No había Ctrl+K en Usuarios |

### L. Avance (MU §13)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| L1 | Pantalla de inicio del administrador con cinco indicadores | MU §13 | ⚠️ | ✅ | `Kpis` en [Resumen.tsx](web/src/components/Resumen.tsx) |
| L2 | «Propuestas pendientes» sin las de conflicto (también el contador ámbar de la cabecera) | MU §13–14 | ❌ | ✅ | `NOT en_conflicto` en `avance` y `contadores` |
| L3 | En conflicto, en rojo junto a «Conflictos» | MU §13 | ✅ | ✅ | |
| L4 | Comerciales con contactos que no han entrado nunca | MU §13 | ⚠️ | ✅ | No contaba a un administrador que también es comercial |
| L5 | Desglose por estados y por tipo de cambio aprobado | MU §13 | ✅ | ✅ | |
| L6 | «Contestan encuestas» | MU §14 | ❌ | ✅ | `encuestas` en `Avance` |
| L7 | «Email y móvil» (justificados o aún por completar) | MU §14 | ❌ | ✅ | `datos` en `Avance` |
| L8 | Rueda dentada: fecha límite (texto libre) y vacíos en la exportación («#» o en blanco) | MU §13 | ❌ | ✅ | Tabla `config`, `VentanaConfig` |

### M. Tabla de comerciales y ventana de detalle (MU §14)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| M1 | Columnas; por defecto de menor a mayor avance; los que no han entrado, atenuados con «nunca» | MU §14 | ✅ | ✅ | [TablaComerciales.tsx](web/src/components/TablaComerciales.tsx) |
| M2 | Clic en la cabecera ordena; el segundo invierte | MU §14 | ✅ | ✅ | |
| M3 | Píldoras de unidad al instante; desaparecen los comerciales sin contactos en ella | MU §14 | ✅ | ✅ | Ahora con icono |
| M4 | Filtro «Comercial» de selección múltiple con buscador (Enter, clic en nombre, casilla, Todos/Ninguno) | MU §14 | ✅ | ✅ | [MultiSelect.tsx](web/src/components/MultiSelect.tsx) |
| M5 | Clic en Contactos o Revisados abre la ventana | MU §14 | ✅ | ✅ | |
| M6 | Clic en «Pendientes» lleva a las propuestas de ese comercial | MU §14 | ❌ | ✅ | Enlace a `/propuestas?comercial=` |
| M7 | Cada fila y ficha de los paneles abre sus contactos | MU §14 | ⚠️ | ✅ | Faltaban encuestas y email y móvil |
| M8 | Ventana: buscador, píldoras de estado, orden, cabecera fija, recorte con texto al pasar el ratón, CSV, ficha, Esc, de 100 en 100 | MU §14 | ✅ | ✅ | Se añade la columna Encuestas de la captura |

### N. Propuestas (MU §15)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| N1 | Listado: una línea por propuesta, con quién, cuándo y resumen | MU §15 | ⚠️ | ✅ | Antes, tarjetas con todo desplegado. [Propuestas.tsx](web/src/paginas/Propuestas.tsx) |
| N2 | «Ver cambios»: antes y después en verde; altas con los códigos como irán al Excel; baja con su motivo en la línea | MU §15 | ⚠️ | ✅ | `DiffPropuesta` con `codigos` y `queCambia` |
| N3 | Cinco cajas que filtran | MU §16 | ⚠️ | ✅ | Faltaba «En conflicto» |
| N4 | Tres desplegables de selección múltiple: estado, tipo y comercial (con buscador) | MU §16 | ❌ | ✅ | La API acepta listas: `?estado=a,b` |
| N5 | Estados «Superadas» y «Anuladas» | MU §16 | ❌ | ✅ | Migración 004 (`CHECK`) |
| N6 | Aprobar confirma lo ya aplicado y lo lleva a la hoja CAMBIOS | MU §15 | ⚠️ | ✅ | |
| N7 | Rechazar deshace (datos anteriores, baja anulada, alta eliminada) | MU §15 | ⚠️ | ✅ | |
| N8 | En bloque: casillas, Marcar todas, comentario, franja que flota abajo cuando hay alguna marcada | MU §15 | ✅ | ✅ | Ahora flota solo cuando hay alguna marcada |
| N9 | El comentario vale para una sola línea; el comercial lo lee en su tarjeta; el administrador, con el filtro y en la ficha | MU §15 | ✅ | ✅ | |
| N10 | Marca «admin» si la hizo un administrador entrando como el comercial | MU §15 | ✅ | ✅ | |
| N11 | Las de conflicto no aparecen aquí, con un aviso | MU §16 | ⚠️ | ✅ | `conflicto=no` |
| N12 | «Ver todos los cambios» | MU §15 TRUCO | ❌ | ✅ | |

### O. Conflictos (MU §16)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| O1 | Hay conflicto cuando un comercial corrige o da de baja algo validado por otro | MU §16 | ❌ | ✅ | Ver J3 |
| O2 | Lo validado (en ámbar) frente a cada propuesta, con «Ver cambios» | MU §16 | ⚠️ | ✅ | [Conflictos.tsx](web/src/paginas/Conflictos.tsx) |
| O3 | Aprobar esta: se aplica, queda validado a nombre de quien la hizo y las demás pendientes pasan a «superadas» (un alta sin aprobar, aprobada) | MU §16 | ⚠️ | ✅ | Antes las rechazaba y no cambiaba quién lo validó. `superarResto` |
| O4 | Rechazar esta: si no queda otra, el contacto vuelve a su estado anterior | MU §16 | ⚠️ | ✅ | |
| O5 | Resolver a mano: historial y formulario; cuenta como modificación aprobada a nombre del administrador y supera las pendientes | MU §16 | ❌ | ✅ | `resolverAMano`, ruta `/conflictos/:id` |

Además, el botón «Rechazar todas», que el manual no recoge, se ha eliminado: «Rechazar esta» cubre el mismo caso.

### P. Ficha de un contacto (MU §17)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| P1 | Se abre desde Propuestas, Conflictos y la ventana de detalle | MU §17 | ✅ | ✅ | |
| P2 | Datos, quién lo validó, qué comerciales lo ven y sus propuestas | MU §17 | ✅ | ✅ | |
| P3 | Registro de actividad (quién, qué y cuándo; «en nombre de») | MU §17 | ❌ | ✅ | `LineaTiempo` en [VentanaFicha.tsx](web/src/components/VentanaFicha.tsx) |
| P4 | Encuestas, estado del email y el móvil, nº de contacto y unidades (captura) | MU §17 | ❌ | ✅ | |

### Q. Usuarios (MU §18)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| Q1 | Lista con usuario, código, rol y última entrada | MU §18 | ⚠️ | ✅ | Faltaba el código (`cod_empleado`) |
| Q2 | El buscador y las cajas filtran; un clic en el nombre abre lo que ha hecho | MU §18 | ⚠️ | ✅ | `VentanaActividad` |
| Q3 | Conexión: CONECTADO (5 min) o INACTIVO (hasta 15); tablero «Ahora en la aplicación» | MU §18 | ❌ | ✅ | `ultima_actividad` (se apunta en [auth.ts](server/src/auth.ts)), `tablero` |
| Q4 | ADMIN / COMERCIAL: una persona puede tener los dos | MU §18 | ❌ | ✅ | `esComercial`; un administrador con clientes los revisa en «Mis clientes» y se le puede «entrar como» |
| Q5 | CLAVE INICIAL | MU §18 | ✅ | ✅ | Texto como en el manual |
| Q6 | SIN CLIENTES | MU §18 | ❌ | ✅ | |
| Q7 | Píldoras Con clientes / Sin clientes / Todos (por defecto, con clientes) | MU §18 | ❌ | ✅ | |
| Q8 | Contraseña: al azar, se enseña una sola vez | MU §18 | ✅ | ✅ | |
| Q9 | Entrar como, sin la contraseña del comercial | MU §18 | ✅ | ✅ | |
| Q10 | Hacer / Quitar admin; no a uno mismo | MU §18 | ✅ | ✅ | |
| Q11 | Entrar como: franja ámbar, administración oculta, «Volver a mi cuenta» o el icono de salir | MU §18 | ⚠️ | ✅ | Antes el icono de salir cerraba la sesión del administrador |
| Q12 | «Hecho por el administrador» en la tarjeta, Propuestas, la ficha y el Excel | MU §18 | ⚠️ | ✅ | No salía en el Excel |

### R. Exportar a Excel (MU §19)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| R1 | Botón verde «Exportar Excel» en Avance, tantas veces como se quiera | MU §19 | ⚠️ | ✅ | [exportar.ts](server/src/exportar.ts) |
| R2 | Cada exportación guarda una copia en la carpeta *exportar* del servidor | MU §19 | ❌ | ✅ | **Requisito cambiado por el responsable (9/11/2026):** el Excel se genera al pulsar, con los datos de ese momento, y se descarga en el equipo del usuario. El servidor **no guarda ninguna copia** (los datos cambian de un día para otro) y la respuesta no se cachea (`Cache-Control: no-store`) |
| R3 | CAMBIOS: acciones aprobadas y marcas de encuesta; las 30 columnas de origen con la unidad delante y, detrás, encuestas SI/NO, Acción (ALTA, MODIFICACIÓN, BAJA o ENCUESTA), propuesto por, hecho por admin., fecha, aprobado por y motivo de la baja | MU §19 | ❌ | ❓ | Todo implementado. **No verificable:** el repositorio no define cuáles son las 30 columnas del listado de origen. Se usan las 30 que trae la base del programa anterior (`ORIGEN`); hay que cotejarlas con el listado real |
| R4 | ESTADO: todos los contactos (también los OK), una fila por comercial que lo ve (un alta, una sola vez), con encuestas, estado, quién lo validó, acción aprobada y propuestas pendientes | MU §19 | ⚠️ | ✅ | Antes, una fila por contacto y sin encuestas |
| R5 | RESUMEN: filas por tipo, contactos por estado, propuestas pendientes y sin email o móvil | MU §19 | ❌ | ✅ | |
| R6 | Altas sin nº de contacto; códigos con sus ceros; un alta dada de baja no se exporta; motivos de «no tiene» al final | MU §19 | ⚠️ | ✅ | Columnas de código como texto (`numFmt '@'`) |

### S. Foto HTML (MU §20)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| S1 | «HTML autocontenido» descarga un fichero; «Ver foto» lo abre en una pestaña | MU §20 | ❌ | ✅ | [foto.ts](server/src/foto.ts), `GET /api/admin/foto` |
| S2 | Funciona sin servidor ni conexión: ordena, filtra por unidad y comercial, abre el detalle y la ficha con su historial | MU §20 | ❌ | ✅ | Visor sin dependencias. Lleva `window.DATOS_OFFLINE` en el formato que ya lee `db:importar` |
| S3 | No se actualiza ni valida nada; la cabecera dice cuándo se hizo; tiene su propia ayuda «?» | MU §20 | ❌ | ✅ | |

### T. Recorrido de un cambio y preguntas frecuentes (MU §22–23 · GR p.3)

| ID | Requisito | Ref. | Antes | Después | Evidencia y justificación |
|---|---|---|---|---|---|
| T1 | Al modificar, sube el contador de «Propuestas» del administrador | MU §22 | ✅ | ✅ | |
| T2 | Los cambios llegan al sistema cuando se aprueban y se exporta el Excel | MU §22–23 | ✅ | ✅ | |
| T3 | «He marcado OK por error»: se sigue con Modificar o Baja | MU §23 | ✅ | ✅ | |
| T4 | Todo se guarda en el momento; no hay «guardar todo» | MU §23, GR | ✅ | ✅ | |

---

## 3. Incidencias detectadas

| # | Incidencia | Severidad | Impacto | Componentes | Solución aplicada |
|---|---|---|---|---|---|
| 1 | El Excel de carga no tenía la estructura del manual (sin ENCUESTA, encuestas, hecho por admin., aprobado por, motivos «no tiene» ni RESUMEN; ESTADO con una fila por contacto) | **Crítica** | Lo que se carga en el sistema de origen no es lo esperado | `consultas-admin.ts` (`excel`) | Nuevo [exportar.ts](server/src/exportar.ts) |
| 2 | Una corrección sobre lo validado por otro comercial no generaba conflicto | **Crítica** | Un comercial podía pisar el trabajo de otro sin que el administrador lo viera | `flujo.ts` (`detectarConflicto`) | Regla «validado por otro» → propuesta sin aplicar y en conflicto |
| 3 | No se exigían email ni móvil; OK sobre contactos incompletos; teléfonos con cualquier carácter | **Alta** | Datos de mala calidad en la carga; incumple el objetivo de la campaña | `flujo.ts` (`validar`), `FormContacto.tsx` | Validación común en `shared/tipos.ts`, Completar y «no tiene» con motivo |
| 4 | Sin Deshacer; un rechazo dejaba el contacto «por revisar» en vez de como estaba | **Alta** | El comercial no podía corregir un error; se perdían validaciones previas | `flujo.ts` | Aplicación provisional + `previo` + `deshacerPropuesta` |
| 5 | Los cambios no se veían hasta aprobarlos | **Alta** | Contradice §1, §6 y §22; confunde al comercial | `flujo.ts` | `aplicada` |
| 6 | Mis clientes sin facturación, por orden alfabético y con las unidades mezcladas en una línea | **Alta** | Se pierde la prioridad por importancia del cliente | `consultas-comercial.ts`, `MisClientes.tsx` | Cartera + una línea por unidad |
| 7 | Sin encuestas de satisfacción | **Alta** | Faltan datos que van al Excel | API, tarjeta, Avance, Excel | Casillas, endpoint, panel y columnas |
| 8 | Sin fecha límite ni configuración | **Media** | Los comerciales no ven el plazo; no se controla el formato de los vacíos | — | Tabla `config`, rueda dentada, cabecera |
| 9 | Sin foto HTML | **Media** | No se puede enviar el avance a dirección | — | [foto.ts](server/src/foto.ts) |
| 10 | Conflictos sin «Resolver a mano»; «Aprobar» rechazaba las demás y no cambiaba quién validó | **Media** | El administrador no podía fijar los datos tras hablar con el cliente | `flujo.ts`, `Conflictos.tsx` | `resolverAMano`, estado «superada» |
| 11 | Sin registro de actividad en la ficha ni «lo que ha hecho» cada usuario | **Media** | Sin trazabilidad «en nombre de» | — | Tabla `actividad` |
| 12 | Propuestas: sin filtros múltiples, sin superadas ni anuladas, el contador incluía las de conflicto | **Media** | Cifras distintas de las del manual | `consultas-admin.ts`, `Propuestas.tsx` | Listas en la API, `NOT en_conflicto` |
| 13 | Usuarios sin conexión, tablero, código, SIN CLIENTES ni doble rol | **Media** | Peor seguimiento de la campaña | `consultas-admin.ts`, `Usuarios.tsx`, `auth.ts` | `ultima_actividad`, `esComercial`, tablero |
| 14 | Ayuda solo en Avance y solo para el administrador | **Media** | El comercial no tenía ayuda | `Ayuda.tsx`, `App.tsx` | Ayuda global por rol y pantalla |
| 15 | Diseño distinto del de las capturas (menú lateral rojo, Baja en morado) | **Baja** | Las capturas del manual no coinciden con la aplicación | `estilos.css`, `Cabecera.tsx` | Franja negra y amarilla y colores de estado |
| 16 | La carga por Excel borraba la cartera sin traer la facturación | **Baja** | Tras una carga por Excel, «Mis clientes» no se ordena por facturación | `importar-excel.ts` | Columna opcional «Facturación» |
| 17 | El README describía reglas ya incompatibles con el manual | **Baja** | Documentación técnica engañosa | `README.md` | README alineado |
| 18 | Verificación en dos pasos obligatoria, no descrita en el manual | **Baja** (documental) | El manual dice «usuario, contraseña y dentro» | `doble-factor.ts`, `Acceso.tsx` | **No se ha tocado:** decisión pendiente (sección 5) |

---

## 4. Plan de corrección (ejecutado)

| Cambio | Ficheros | Motivo | Requisitos |
|---|---|---|---|
| Migración 004: `config`, `ultima_actividad`, quién marcó encuestas y justificaciones, `propuestas` rehecha (estados superada y anulada, `aplicada`, `previo`) y `actividad`. Conserva las propuestas existentes | [server/sql/004_manual_usuario.sql](server/sql/004_manual_usuario.sql) | Modelo de datos del manual | A3–A7, F6, I, L8, N5, P3, Q3 |
| Reglas de negocio reescritas: aplicación provisional, Deshacer, conflicto por «validado por otro», obligatorios, catálogo oficial, «no tiene», encuestas, duplicados, alta visible para todos, superadas, Resolver a mano y registro de actividad | [server/src/flujo.ts](server/src/flujo.ts) | Núcleo funcional | A, E4–E5, F, G, H, I, J, N6–N7, O |
| Mis clientes por cliente y unidad con facturación; detalle con compañeros y centralita; catálogo oficial | [server/src/consultas-comercial.ts](server/src/consultas-comercial.ts) | §4, §5, §6 | D, E8, F3, G2 |
| Avance con encuestas y email/móvil, pendientes sin conflicto, listados nuevos, ficha con actividad | [server/src/consultas.ts](server/src/consultas.ts) | §13, §14, §17 | L, M7, P |
| Propuestas con filtros múltiples, conflictos con lo validado, usuarios (código, conexión, comercial), tablero, actividad, configuración | [server/src/consultas-admin.ts](server/src/consultas-admin.ts) | §15, §16, §18 | N, O, Q |
| Excel de 3 hojas con vacíos configurables y copia en `exportar/` | [server/src/exportar.ts](server/src/exportar.ts) | §19 | R |
| Foto HTML autocontenida | [server/src/foto.ts](server/src/foto.ts) | §20 | S |
| Rutas nuevas (`config`, `encuesta`, `deshacer`, `resolver`, `tablero`, `actividad`, `foto`) y contratos actualizados; «entrar como» a cualquiera con clientes | [server/src/app.ts](server/src/app.ts), [server/src/auth.ts](server/src/auth.ts), [server/src/db.ts](server/src/db.ts) | API | Todos |
| Facturación en la carga por Excel | [server/src/importar-excel.ts](server/src/importar-excel.ts) | §4 | D2 |
| Contrato compartido y reglas de validación comunes a interfaz y API | [shared/tipos.ts](shared/tipos.ts) | Una sola fuente de verdad | E4, F2–F6 |
| Cabecera negra con fecha límite y rueda; ayuda global; franja de «entrar como» | [Cabecera.tsx](web/src/components/Cabecera.tsx), [App.tsx](web/src/App.tsx), [Ayuda.tsx](web/src/components/Ayuda.tsx) | §3, §11–12, §18 | C, K, Q11 |
| Pantallas del comercial | [MisClientes.tsx](web/src/paginas/MisClientes.tsx), [Cliente.tsx](web/src/paginas/Cliente.tsx), [FormContacto.tsx](web/src/components/FormContacto.tsx) | §4–§10 | D–J |
| Pantallas del administrador | [Avance.tsx](web/src/paginas/Avance.tsx), [Resumen.tsx](web/src/components/Resumen.tsx), [Propuestas.tsx](web/src/paginas/Propuestas.tsx), [Conflictos.tsx](web/src/paginas/Conflictos.tsx), [Usuarios.tsx](web/src/paginas/Usuarios.tsx), [VentanaFicha.tsx](web/src/components/VentanaFicha.tsx), [TablaComerciales.tsx](web/src/components/TablaComerciales.tsx), [VentanaListado.tsx](web/src/components/VentanaListado.tsx), [DiffPropuesta.tsx](web/src/components/DiffPropuesta.tsx), [MultiSelect.tsx](web/src/components/MultiSelect.tsx) | §13–§18 | L–Q |
| Estilos del manual y versión móvil | [web/src/estilos.css](web/src/estilos.css) | Capturas, §11 | A8, C5, K1 |
| Datos de demostración, README y `.gitignore` (`exportar/`) | [demo.ts](server/src/scripts/demo.ts), [README.md](README.md), [.gitignore](.gitignore) | Coherencia y protección de datos | — |

---

## 5. Auditoría final

### Cómo se ha verificado

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` (servidor y web) | Sin errores |
| `npm run build` (compilación del servidor y build de producción de la web) | Correcto |
| Pruebas de reglas de punta a punta sobre una base nueva con datos inventados (migración 004 sobre datos antiguos, Mis clientes, OK, Completar, obligatorios, modificar y deshacer, conflictos, baja, alta con duplicados, entrar como, encuestas, resolver a mano, ficha, avance, listados, Excel y foto) | **75 de 75** |
| Pruebas de la API por HTTP (permisos, configuración, clientes, encuestas, altas, deshacer, filtros, tablero, entrar como, Excel y foto) | **33 de 33** |
| Carga por Excel con facturación («1.000,00 €» y números) | Correcta |
| Visor de la foto HTML: análisis de los 3 scripts y ejecución con un DOM simulado | Correcto |
| `npm run db:demo` sobre una base temporal | Correcto |

Durante las pruebas apareció un fallo que yo mismo había introducido (los recuentos de encuestas y de «no tiene» llegaban como
`true`/`false` porque su alias coincidía con una columna booleana). Está corregido y cubierto por las pruebas. Las pruebas
también llevaron a añadir que «Resolver a mano» exija que el contacto siga en conflicto.

**Límite de la verificación:** las pruebas cubren las reglas, la API, el Excel y la foto. La interfaz React se ha comprobado
compilando y revisando el código, **pero no se ha abierto en un navegador**: el aspecto frente a las capturas y la versión móvil
están sin ver.

### Requisitos cumplidos

126 de 130: todos los de los grupos A, C a J, L a Q, S y T, más B1–B4, K2–K4, R1 y R4–R6.

### Requisitos pendientes

| ID | Estado | Qué falta | Quién decide o hace |
|---|---|---|---|
| R3 | ❓ | Cotejar las 30 columnas de `ORIGEN` en [exportar.ts](server/src/exportar.ts) (nombres y orden) con el listado de origen real de la campaña: el Excel con el que se cargaron los contactos y con el que después se vuelven a cargar en el sistema. El repositorio no lo define | Quien gestione la carga en el sistema |
| A8, C1, C3, C5, D4, N1 | ⚠️ | Requisitos visuales apartados a propósito al restaurar el diseño original (ver la nota del principio) | — (decisión tomada) |

### Observaciones no funcionales

- **Hora en Turso:** el README ya avisa de que Turso guarda las fechas en UTC. En Vercel, las horas de «Validado por… el…», del
  registro de actividad, de la columna «Conexión» y del Excel saldrán 1 o 2 horas atrasadas respecto a la hora de España.
  Conviene convertirlas al mostrarlas.
- **Funcionalidad no documentada que se mantiene** porque no contradice el manual: verificación en dos pasos, pantalla Accesos
  (registro de seguridad), Cargar datos (campaña desde Excel), Nuevo usuario, Desactivar y Restablecer dos pasos. Accesos y Cargar
  datos se enlazan ahora desde Usuarios, para que la cabecera sea la del manual.
- **Despliegue:** la migración 004 se aplica sola al desplegar (`npm run db:migrar` en `vercel.json`) o al arrancar el servidor.
  Rehace la tabla `propuestas` conservando todas las filas. **Hay que hacer una copia de seguridad de la base antes de
  desplegar.**
