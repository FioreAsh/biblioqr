-- BiblioQR · Esquema base (PostgreSQL)
-- Tablas del flujo: usuarios, catálogo, ejemplares, reservas, detalle de reserva/préstamo,
-- sanciones, notificaciones y auditoría.

BEGIN;

CREATE TABLE IF NOT EXISTS usuarios (
    id                 BIGSERIAL PRIMARY KEY,
    codigo_estudiante  VARCHAR(20) UNIQUE,
    nombres            VARCHAR(80)  NOT NULL,
    apellidos          VARCHAR(120) NOT NULL,
    email              VARCHAR(160) NOT NULL UNIQUE,
    rol                VARCHAR(20)  NOT NULL DEFAULT 'estudiante'
                       CHECK (rol IN ('estudiante', 'bibliotecario', 'administrador')),
    activo             BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ultimo_acceso      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS categorias (
    id           BIGSERIAL PRIMARY KEY,
    nombre       VARCHAR(80) NOT NULL UNIQUE,
    descripcion  TEXT
);

CREATE TABLE IF NOT EXISTS libros (
    id                BIGSERIAL PRIMARY KEY,
    categoria_id      BIGINT NOT NULL REFERENCES categorias(id),
    isbn              VARCHAR(20)  NOT NULL UNIQUE,
    titulo            VARCHAR(255) NOT NULL,
    autor             VARCHAR(255) NOT NULL,          -- varios autores separados por ', '
    editorial         VARCHAR(120),
    anio_publicacion  INTEGER CHECK (anio_publicacion BETWEEN 1400 AND 2100),
    descripcion       TEXT,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ejemplares (
    id                 BIGSERIAL PRIMARY KEY,
    libro_id           BIGINT NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
    codigo_inventario  VARCHAR(30) NOT NULL UNIQUE,
    ubicacion          VARCHAR(120),
    estado             VARCHAR(20) NOT NULL DEFAULT 'disponible'
                       CHECK (estado IN ('disponible', 'reservado', 'prestado', 'mantenimiento', 'perdido'))
);

CREATE TABLE IF NOT EXISTS reservas (
    id                BIGSERIAL PRIMARY KEY,
    codigo_reserva    UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),   -- contenido del QR de recojo
    usuario_id        BIGINT NOT NULL REFERENCES usuarios(id),
    bibliotecario_id  BIGINT REFERENCES usuarios(id),
    estado            VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'retirada', 'vencida', 'cancelada')),
    fecha_reserva     TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion  TIMESTAMPTZ NOT NULL,
    fecha_retiro      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reserva_detalle (
    id                  BIGSERIAL PRIMARY KEY,
    reserva_id          BIGINT NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    ejemplar_id         BIGINT NOT NULL REFERENCES ejemplares(id),
    estado              VARCHAR(20) NOT NULL DEFAULT 'reservado'
                        CHECK (estado IN ('reservado', 'prestado', 'devuelto', 'perdido', 'liberado')),
    fecha_limite_devol  TIMESTAMPTZ,
    fecha_devolucion    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sanciones (
    id                BIGSERIAL PRIMARY KEY,
    usuario_id        BIGINT NOT NULL REFERENCES usuarios(id),
    bibliotecario_id  BIGINT REFERENCES usuarios(id),
    motivo            TEXT NOT NULL,
    fecha_inicio      TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_fin         TIMESTAMPTZ NOT NULL,
    estado            VARCHAR(20) NOT NULL DEFAULT 'activa'
                      CHECK (estado IN ('activa', 'cumplida', 'levantada'))
);

CREATE TABLE IF NOT EXISTS notificaciones (
    id                  BIGSERIAL PRIMARY KEY,
    usuario_id          BIGINT NOT NULL REFERENCES usuarios(id),
    reserva_id          BIGINT REFERENCES reservas(id) ON DELETE SET NULL,
    reserva_detalle_id  BIGINT REFERENCES reserva_detalle(id) ON DELETE SET NULL,
    sancion_id          BIGINT REFERENCES sanciones(id) ON DELETE SET NULL,
    tipo                VARCHAR(40) NOT NULL,
    asunto              VARCHAR(160) NOT NULL,
    mensaje             TEXT NOT NULL,
    estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'enviada', 'fallida')),
    fecha_programada    TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_envio         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auditoria (
    id                BIGSERIAL PRIMARY KEY,
    usuario_id        BIGINT REFERENCES usuarios(id),     -- NULL = proceso automático del sistema
    accion            VARCHAR(60) NOT NULL,
    entidad           VARCHAR(60) NOT NULL,
    entidad_id        BIGINT,
    datos_anteriores  JSONB,
    datos_nuevos      JSONB,
    ip                VARCHAR(64),
    fecha             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservas_usuario_estado   ON reservas (usuario_id, estado);
CREATE INDEX IF NOT EXISTS idx_reservas_expiracion       ON reservas (fecha_expiracion) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_detalle_reserva           ON reserva_detalle (reserva_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario    ON notificaciones (usuario_id, fecha_programada DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha           ON auditoria (fecha DESC);

COMMIT;
