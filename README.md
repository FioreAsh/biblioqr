# BiblioQR

Sistema web de biblioteca: catálogo, reserva con código QR, recojo presencial, préstamo de 14 días,
devolución total o parcial, incidencias, sanciones, notificaciones y auditoría.
Tres roles con permisos propios: **estudiante**, **bibliotecario** y **administrador**.

## Publicarlo con un enlace

Sigue [DESPLIEGUE.md](DESPLIEGUE.md): GitHub + Render (gratis) con `render.yaml` ya configurado, en modo demostración.

## Cómo ejecutarlo

```bash
cd backend
npm install
npm start            # http://localhost:3000
```

Sin configuración usa **PGlite** (PostgreSQL real embebido, se guarda en `backend/data/`) y carga datos de
demostración la primera vez. Para usar tu servidor PostgreSQL, copia `.env.example` a `.env` y define
`DATABASE_URL`; las migraciones se aplican solas al arrancar.

| Comando | Qué hace |
|---|---|
| `npm start` | Migra, siembra si la base está vacía, inicia API + frontend y las tareas automáticas |
| `npm run dev` | Igual, recargando al guardar cambios |
| `npm run migrate` | Solo aplica migraciones pendientes |
| `npm run reset` | Borra todo, migra y vuelve a sembrar |

### Cuentas de demostración
En desarrollo, la pantalla de ingreso muestra el código de verificación (y también la consola del servidor).

| Rol | Correo |
|---|---|
| Estudiante | `20231458@aula.edu.pe` (Camila, tiene un préstamo que vence en ~20 h) |
| Bibliotecario | `m.quispe@biblioteca.edu.pe` |
| Administrador | `admin@biblioteca.edu.pe` |

Cualquier correo nuevo `@aula.edu.pe` puede registrarse como estudiante. El personal lo crea el administrador.

## Estructura

```
biblioqr/
├── backend/                         API REST (Node.js + Express + PostgreSQL)
│   ├── src/
│   │   ├── server.js                Arranque: migraciones, rutas, frontend estático, tareas
│   │   ├── config.js                Variables de entorno
│   │   ├── db/
│   │   │   ├── index.js             Acceso a datos (pg o PGlite) con transacciones
│   │   │   ├── migrate.js           Aplica migrations/*.sql en orden
│   │   │   ├── seed.js              Datos de demostración coherentes
│   │   │   └── migrations/
│   │   │       ├── 001_esquema_base.sql
│   │   │       ├── 002_migracion_v2.sql              (tu migración: portada, etiquetas, índices)
│   │   │       └── 003_acceso_prestamos_incidencias.sql
│   │   ├── lib/                     permisos.js (matriz de roles), validar, errores, correo, auditoría
│   │   ├── middleware/auth.js       Sesión Bearer + permitir('permiso')
│   │   ├── services/
│   │   │   ├── flujo.js             Reserva → entrega → devolución, vencimientos y recordatorios
│   │   │   └── tareas.js            Proceso automático cada minuto
│   │   └── routes/
│   │       ├── auth.js              /api/auth   código al correo, registro, sesión
│   │       ├── catalogo.js          /api/catalogo   catálogo + libros similares (consulta SQL v2)
│   │       ├── cuenta.js            /api/mi   reservas, préstamos y notificaciones del estudiante
│   │       ├── mostrador.js         /api/mostrador   QR, entrega, devolución, tablero
│   │       ├── gestion.js           /api/gestion   libros, ejemplares, categorías
│   │       └── administracion.js    /api/admin   usuarios, sanciones, incidencias, auditoría, políticas
│   └── .env.example
└── frontend/                        HTML + CSS + JavaScript (módulos ES, sin compilación)
    ├── index.html
    └── assets/
        ├── css/   tokens · base · cabecera · catalogo · capas · vistas
        └── js/
            ├── app.js               Router por hash con control de permisos
            ├── api.js               Cliente de la API
            ├── ui.js · util.js      Toast, capas, pase QR, portadas, fechas
            └── vistas/              login · catalogo · cuenta · notificaciones · mostrador
                                     panel · libros · usuarios · sanciones · auditoria
```

## Permisos por rol

| Módulo | Estudiante | Bibliotecario | Administrador |
|---|:-:|:-:|:-:|
| Catálogo y libros similares | ✓ | ✓ | ✓ |
| Carrito y reservas | ✓ | | |
| Mis reservas, préstamos y notificaciones | ✓ | | |
| Mostrador: escanear QR, entregar, devolver | | ✓ | ✓ |
| Estado físico de ejemplares (mantenimiento/baja) | | ✓ | ✓ |
| Sanciones e incidencias | | ✓ | ✓ |
| Panel de indicadores | | ✓ | ✓ |
| Libros, ejemplares y categorías (CRUD) | | | ✓ |
| Usuarios y roles | | | ✓ |
| Auditoría y políticas | | | ✓ |

La matriz vive en `backend/src/lib/permisos.js`. El backend valida cada ruta; el frontend solo oculta lo que no corresponde.

## Reglas de negocio implementadas

- **Reserva atómica**: los ejemplares se bloquean con `SELECT … FOR UPDATE` y un índice único parcial impide que un
  ejemplar esté en dos reservas o préstamos vivos a la vez. Máximo 3 ejemplares simultáneos (reservados + prestados), uno por título.
- **QR de recojo** válido 48 h. Al vencer, un proceso automático libera los ejemplares y notifica, **sin sanción**.
- **Entrega**: el bibliotecario escanea, el sistema valida que sea vigente y no usado; al confirmar nace el préstamo
  (14 días desde la entrega física) con **su propio QR de devolución**, y el QR de recojo queda invalidado.
- **Recordatorio** automático 24 h antes del vencimiento y aviso de préstamo vencido.
- **Devolución total o parcial** con revisión de cada ejemplar: buen estado → disponible; revisión o daño →
  mantenimiento (no reservable hasta liberarlo); pérdida → perdido. Retraso, daño y pérdida generan **incidencias**;
  el sistema sugiere días de suspensión según las políticas y el bibliotecario decide si aplicarla.
- Estudiantes suspendidos no pueden reservar. Todo cambio queda en **auditoría** con datos antes/después.
- Plazos y días de sanción se editan en el Panel (administrador).
