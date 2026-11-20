# Depuración de contactos comerciales

Aplicación de la campaña de depuración de contactos: React + TypeScript en el navegador, API en Node
(Express + TypeScript) y SQLite.

Lo que hace cada pantalla está en el **manual de usuario** y en la **guía rápida del comercial** (PDF, octubre de 2026), que
son la referencia funcional; la ayuda de la propia aplicación (botón «?», enlace Ayuda o tecla ?) lo resume pantalla a pantalla.

**Comerciales**
- Mis clientes: una línea por cliente y unidad, de mayor a menor facturación; Mi avance, Contactos por revisar, Esperando
  aprobación; buscador (cliente, localidad, provincia, solicitante; Ctrl+K), píldoras de unidad y «Solo con pendientes».
- Cada cliente: por contacto, **OK** (o **Completar** si falta el email o un móvil), **Modificar** (o **Corregir** si lo validó
  otro comercial), **Baja** con motivo y **Añadir contacto** (con aviso de posibles duplicados); casillas de encuesta **Ventas** y
  **Postventa**; **Deshacer** mientras el administrador no decida.

**Administración**
- Avance: indicadores, contactos por estado, email y móvil, cambios aprobados, encuestas y avance por comercial, con listados,
  CSV y ficha (con registro de actividad). **Exportar Excel** (CAMBIOS, ESTADO y RESUMEN; se genera al momento y se descarga, sin guardar copia en el servidor), **HTML
  autocontenido** y **Ver foto**. La rueda dentada fija la fecha límite y cómo salen los vacíos en el Excel.
- Propuestas: filtros de selección múltiple, Ver cambios, aprobar o rechazar una a una o en bloque, con comentario.
- Conflictos: Aprobar esta, Rechazar esta o **Resolver a mano**.
- Usuarios: conexión, «Ahora en la aplicación», contraseñas, rol de administrador, **Entrar como** y lo que ha hecho cada uno.
  Desde aquí, también **Accesos** (registro de seguridad) y **Cargar datos** (campaña desde Excel).

## Reglas

- **OK** vale al instante, sin aprobación. Modificaciones, bajas y altas son propuestas que decide el administrador, pero se
  **aplican ya de forma provisional**: el cambio se ve desde el primer momento.
- **Deshacer** (comercial) y **Rechazar** (administrador) devuelven el contacto a como estaba: los datos de antes, la baja anulada o
  el alta eliminada. Aprobar confirma lo que ya estaba aplicado.
- El email y un móvil (9 cifras que empiezan por 6 o 7) son obligatorios; si no los tiene, se marca «No tiene» con el motivo. Si
  solo se justifica eso, el contacto queda validado al momento. Nombre y apellido se guardan en mayúsculas; el email, en
  minúsculas; departamento y función, de la tabla oficial.
- Un contacto compartido **se revisa una sola vez**. Si otro comercial **corrige** o **da de baja** lo que ya validó un compañero,
  su propuesta **no se aplica**: el contacto pasa a **En conflicto** y decide el administrador. Aprobar una propuesta en conflicto
  la aplica, deja el contacto validado a nombre de quien la hizo y las demás pendientes quedan **superadas** (un alta sin aprobar,
  aprobada).
- Una propuesta nueva de un comercial sustituye a la suya anterior que siguiera pendiente (la anterior queda **anulada**).
- Un contacto con la baja aprobada no se puede tocar. Las encuestas y las marcas «No tiene» se guardan al momento.

## Estructura

```
shared/tipos.ts        contrato de datos entre la API y la interfaz
server/sql/            migraciones SQL (esquema SQLite)
server/src/            API Express: app.ts (rutas), auth.ts (sesión), flujo.ts (reglas), consultas*.ts (SQL),
                       exportar.ts (Excel de carga), foto.ts (foto HTML autocontenida)
server/src/scripts/    migrar, importar una foto HTML, contraseñas y datos de demostración
web/src/paginas/       pantallas React (Vite)
```

## Puesta en marcha

```bash
npm install
npm run db:importar-sqlite             # o: npm run db:importar -- "C:\ruta\AVANCE_CONTACTOS_20260930_1440.html", o: npm run db:demo
npm run db:clave -- admin              # contraseña provisional del administrador
npm run dev                            # API en :3001 y web en http://localhost:5173
```

En PowerShell, si `npm` da el error «no está firmado digitalmente», usa `npm.cmd` o la consola Git Bash/CMD.

La base es un único fichero **SQLite**: `server/datos/contactos.db` (otra ruta con `SQLITE_PATH` en
`server/.env`, ver `server/.env.example`; en Vercel, una base Turso, ver más abajo). Se abre con libSQL
(`@libsql/client`); `db:importar-sqlite` lee la base antigua con el SQLite de Node 22.5 o superior (`node:sqlite`). El fichero se puede abrir con DB Browser for SQLite o DBeaver; para hacer una copia de
seguridad basta con copiarlo con la aplicación parada. Las migraciones (`server/sql/`) se aplican solas al
arrancar la API (o con `npm run db:migrar`). Antes de lanzar `db:importar` o `db:demo`, para la aplicación.

- `db:importar-sqlite -- [ruta]` carga la base del programa anterior (por defecto `server/sql/contactos.sqlite`, que
  solo se lee): usuarios, contactos, asignaciones, cartera con facturación y el maestro de departamentos y funciones con
  sus códigos, conservando los ids. No trae contraseñas: después se dan con `db:clave` o `db:clave-defecto`. Solo
  acepta una campaña sin empezar (sin revisiones ni propuestas). Con la base ya cargada se niega; `--vaciar` la sustituye.
- `db:importar` lee los contactos, comerciales y propuestas que la foto lleva embebidos y los carga conservando
  sus ids. Si la base ya tiene contactos se niega; `--vaciar` los sustituye (y borra usuarios y contraseñas).
- `db:clave -- <usuario> [--admin]` da una contraseña provisional desde la consola; con `--admin` además lo hace
  administrador (y lo crea si no existe). Al resto de usuarios se les da desde la pantalla Usuarios.
- `db:2fa-restablecer -- <usuario>` restablece su verificación en dos pasos (p. ej. si el único administrador pierde el
  móvil y sus códigos de recuperación); la configurará de nuevo al entrar. A los demás se les restablece desde Usuarios.
- `db:demo` **sustituye** todo por datos inventados, con `admin` / `admin1234`.

Producción en un servidor propio: `npm run build` y `npm start -w server`. La API sirve también la interfaz
compilada (`web/dist`).

## Despliegue en Vercel

En Vercel no hay disco que se conserve, así que la base va en **Turso** (SQLite en la nube: el mismo SQL). La interfaz
se publica como web estática (`web/dist`) y la API como una función (`api/index.js`, que carga la app Express
compilada). Todo está en `vercel.json`: al desplegar se compila y se aplican las migraciones (`npm run db:migrar`).

1. Crea la base en Turso (desde el Marketplace de Vercel, «Turso», o en turso.tech). Para llevar la base actual, sube
   `server/datos/contactos.db` con la aplicación parada (en la consola de Turso, al crear la base, o con
   `turso db create contactos --from-file server/datos/contactos.db`).
2. Variables de entorno del proyecto en Vercel:
   - `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` (la integración del Marketplace las pone sola).
   - `CLAVE_2FA`: **la misma** que en `server/.env` (o el contenido de `server/.clave-2fa`). Con otra, nadie podrá
     pasar el segundo factor. En Vercel es obligatoria.
   - `CLAVE_POR_DEFECTO`, si se usa.
3. Importa el repositorio en Vercel, sin cambiar nada de la configuración de compilación (la lee de `vercel.json`).

Los scripts `db:*` funcionan también contra Turso: basta con poner `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en
`server/.env`. Sin ellas se usa el fichero local. Límites de Vercel: cada petición admite como mucho 4,5 MB, así que el
Excel de carga no puede pasar de 3 MB. Turso guarda las fechas en hora UTC, no en la hora de España.

## Modelo de datos

| Tabla | Qué guarda |
|---|---|
| `usuarios` | comerciales y administradores (`rol`), código de empleado, contraseña (scrypt) y última entrada |
| `unidades` | las seis unidades de negocio (Postventa/Venta × Máquinas/Marinos/Terrestres) |
| `contactos` | un registro por contacto de la campaña, con su estado y quién lo validó; también la provincia del cliente, los códigos de departamento y función (se recalculan al cambiar estos), el nº de teléfonos adicionales en origen y las marcas `enc_ventas`, `enc_postventa`, `sin_email` y `sin_movil` con su motivo |
| `asignaciones` | qué comercial ve cada contacto y en qué unidad (un contacto puede verlo más de uno) |
| `cartera` | cada cliente que lleva un comercial en una unidad, con su puesto, facturación, % del total y área |
| `propuestas` | altas, modificaciones y bajas, con su `diff` en JSON, si ya están aplicadas, cómo estaba el contacto antes (`previo`) y quién y cuándo las decidió (aprobada, rechazada, superada o anulada) |
| `actividad` | registro de lo que hace cada usuario sobre cada contacto (la línea de tiempo de la ficha) |
| `config` | fecha límite y vacíos en la exportación |
| `veredictos` | lo último que ha dicho cada comercial de cada contacto (para detectar conflictos) |
| `sesiones` | sesiones abiertas (a medias hasta el segundo factor), con el comercial en cuyo nombre actúa un administrador |
| `codigos_recuperacion` | códigos de un solo uso para entrar sin el móvil, guardados como HMAC |
| `accesos` | registro de entradas, fallos y cambios de seguridad, con IP y navegador |
| `departamentos`, `funciones` | catálogo de los desplegables con sus códigos del maestro, completado con lo que aparece en los contactos |

## Seguridad

**Verificación en dos pasos.** Se entra con la contraseña y, después, con el código de 6 cifras de una aplicación de
autenticación del móvil (Microsoft Authenticator, Google Authenticator…; TOTP, RFC 6238). La primera vez se configura
escaneando un QR y se reciben 10 códigos de recuperación de un solo uso, que solo se enseñan entonces. Tras la
contraseña, la sesión queda a medias 5 minutos y solo sirve para el segundo factor; al completarlo se crea otra con un
token nuevo. Un código ya usado no vale otra vez, y 5 códigos mal en la misma sesión obligan a empezar por la contraseña.
El administrador puede restablecer el segundo factor de un usuario desde Usuarios.

El secreto de cada usuario se guarda cifrado con AES-256-GCM. La clave sale de `CLAVE_2FA` en `server/.env` o, si no
está, del fichero `server/.clave-2fa`, que se crea al arrancar por primera vez (excluido de git). **Guárdala aparte de
las copias de la base**: si se pierde, todos tendrán que volver a configurar la aplicación.

Contraseñas con scrypt; sesión en cookie `httpOnly` y `SameSite=Lax` de 12 horas; las peticiones que cambian algo
tienen que ser JSON (así una web ajena no puede enviarlas); 10 fallos (de contraseña o de código) de un usuario, o 30
desde una misma IP, bloquean 15 minutos, y el recuento está en la base, así que sobrevive a un reinicio. La pantalla
**Accesos** muestra el registro de entradas, fallos y cambios de seguridad, sin contraseñas ni códigos. Cada comercial
solo ve y toca sus contactos; la administración no está disponible mientras se «entra como».


Las fotos HTML y la base de datos contienen datos personales: `.gitignore` excluye los `*.html` (salvo
`web/index.html`), los `*.db`, los `*.sqlite` y la carpeta `server/datos/`.

