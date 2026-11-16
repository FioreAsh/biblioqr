-- BiblioQR · Migración v3 (PostgreSQL)
-- Agrega: inicio de sesión por código al correo, sesiones, préstamos con su propio QR,
-- incidencias (retraso, daño, pérdida), lectura de notificaciones y políticas configurables.
-- Las tablas v1/v2 solo reciben columnas e índices nuevos; no se borra nada.

BEGIN;

-- 1. Inicio de sesión con código de verificación -----------------------------
CREATE TABLE IF NOT EXISTS codigos_verificacion (
    id           BIGSERIAL PRIMARY KEY,
    email        VARCHAR(160) NOT NULL,
    codigo_hash  CHAR(64)     NOT NULL,          -- sha256(código + secreto); nunca el código en claro
    expira_en    TIMESTAMPTZ  NOT NULL,
    intentos     SMALLINT     NOT NULL DEFAULT 0,
    usado        BOOLEAN      NOT NULL DEFAULT FALSE,
    creado_en    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_codigos_email ON codigos_verificacion (email, creado_en DESC);

CREATE TABLE IF NOT EXISTS sesiones (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL UNIQUE,         -- sha256 del token opaco que guarda el navegador
    creada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en   TIMESTAMPTZ NOT NULL,
    revocada    BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones (usuario_id);

-- 2. Préstamo: nace al entregar una reserva y tiene su propio QR de devolución -
CREATE TABLE IF NOT EXISTS prestamos (
    id                BIGSERIAL PRIMARY KEY,
    reserva_id        BIGINT NOT NULL UNIQUE REFERENCES reservas(id),
    codigo_prestamo   UUID   NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    usuario_id        BIGINT NOT NULL REFERENCES usuarios(id),
    bibliotecario_id  BIGINT REFERENCES usuarios(id),
    fecha_entrega     TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_limite      TIMESTAMPTZ NOT NULL,
    estado            VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'cerrado'))
);
CREATE INDEX IF NOT EXISTS idx_prestamos_usuario_estado ON prestamos (usuario_id, estado);

-- 3. Incidencias registradas en mostrador ------------------------------------
CREATE TABLE IF NOT EXISTS incidencias (
    id                  BIGSERIAL PRIMARY KEY,
    prestamo_id         BIGINT REFERENCES prestamos(id),
    reserva_detalle_id  BIGINT REFERENCES reserva_detalle(id),
    usuario_id          BIGINT NOT NULL REFERENCES usuarios(id),
    bibliotecario_id    BIGINT REFERENCES usuarios(id),
    tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('retraso', 'danio', 'perdida')),
    descripcion         TEXT,
    dias_retraso        INTEGER NOT NULL DEFAULT 0,
    sancion_id          BIGINT REFERENCES sanciones(id),
    fecha               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidencias_usuario ON incidencias (usuario_id, fecha DESC);

-- 4. Columnas nuevas en tablas existentes ------------------------------------
ALTER TABLE notificaciones  ADD COLUMN IF NOT EXISTS leida_en    TIMESTAMPTZ;
ALTER TABLE reserva_detalle ADD COLUMN IF NOT EXISTS condicion_devolucion VARCHAR(20)
      CHECK (condicion_devolucion IN ('bueno', 'danado', 'revision', 'perdido'));
ALTER TABLE reserva_detalle ADD COLUMN IF NOT EXISTS observacion TEXT;

-- Un ejemplar solo puede estar en una reserva/préstamo vivo a la vez (blindaje contra doble reserva)
CREATE UNIQUE INDEX IF NOT EXISTS uq_detalle_ejemplar_vivo
    ON reserva_detalle (ejemplar_id) WHERE estado IN ('reservado', 'prestado');

-- Recordatorios: uno por línea de préstamo y tipo
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_detalle_tipo
    ON notificaciones (reserva_detalle_id, tipo) WHERE reserva_detalle_id IS NOT NULL;

-- 5. Políticas configurables por el administrador ---------------------------
CREATE TABLE IF NOT EXISTS configuracion (
    clave        VARCHAR(60) PRIMARY KEY,
    valor        INTEGER NOT NULL,
    descripcion  TEXT NOT NULL
);
INSERT INTO configuracion (clave, valor, descripcion) VALUES
    ('max_ejemplares',            3,  'Ejemplares simultáneos por estudiante (reservados + prestados)'),
    ('horas_recojo',             48,  'Horas de vigencia del QR de recojo'),
    ('dias_prestamo',            14,  'Días calendario de préstamo desde la entrega física'),
    ('horas_recordatorio',       24,  'Horas antes del vencimiento en que se envía el recordatorio'),
    ('dias_sancion_por_dia_retraso', 1, 'Días de suspensión sugeridos por cada día de retraso'),
    ('dias_sancion_danio',        7,  'Días de suspensión sugeridos por daño'),
    ('dias_sancion_perdida',     30,  'Días de suspensión sugeridos por pérdida')
ON CONFLICT (clave) DO NOTHING;

COMMIT;
