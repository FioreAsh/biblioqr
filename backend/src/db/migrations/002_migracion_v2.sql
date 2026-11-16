-- BiblioQR · Migración v2 (PostgreSQL)
-- Agrega: portada del libro, etiquetas para recomendaciones e índices para filtros combinados.
-- No modifica ninguna tabla del flujo de reservas, préstamos, sanciones ni auditoría.

BEGIN;

-- 1. Imagen de portada --------------------------------------------------------
-- Guarda la URL (o ruta en tu almacenamiento) de la imagen. Si es NULL, la interfaz muestra una portada generada.
ALTER TABLE libros ADD COLUMN IF NOT EXISTS portada_url TEXT;

-- 2. Etiquetas (base de las recomendaciones) -----------------------------------
CREATE TABLE IF NOT EXISTS etiquetas (
    id      BIGSERIAL PRIMARY KEY,
    nombre  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS libro_etiquetas (
    libro_id     BIGINT NOT NULL REFERENCES libros(id)    ON DELETE CASCADE,
    etiqueta_id  BIGINT NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
    PRIMARY KEY (libro_id, etiqueta_id)
);

CREATE INDEX IF NOT EXISTS idx_libro_etiquetas_etiqueta ON libro_etiquetas (etiqueta_id);

-- 3. Índices para filtrar por categoría, autor, ISBN y título -------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_libros_categoria    ON libros (categoria_id);
CREATE INDEX IF NOT EXISTS idx_libros_isbn         ON libros (isbn);
CREATE INDEX IF NOT EXISTS idx_libros_titulo_trgm  ON libros USING gin (titulo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_libros_autor_trgm   ON libros USING gin (autor  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ejemplares_libro_estado ON ejemplares (libro_id, estado);

COMMIT;

-- 4. Consulta de libros similares (misma lógica que la interfaz) ----------------
-- Puntaje: 3 por etiqueta en común + 2 por misma categoría + 4 por autor en común.
-- Solo recomienda libros con al menos un ejemplar disponible.
-- Parámetro: :libro_id
--
-- WITH base AS (
--     SELECT id, categoria_id, string_to_array(autor, ', ') AS autores
--     FROM libros WHERE id = :libro_id
-- ),
-- comunes AS (
--     SELECT le2.libro_id, COUNT(*) AS n
--     FROM libro_etiquetas le1
--     JOIN libro_etiquetas le2 ON le2.etiqueta_id = le1.etiqueta_id AND le2.libro_id <> le1.libro_id
--     WHERE le1.libro_id = :libro_id
--     GROUP BY le2.libro_id
-- )
-- SELECT l.id, l.titulo, l.autor, l.portada_url,
--        COALESCE(c.n, 0) * 3
--          + (l.categoria_id = b.categoria_id)::int * 2
--          + (string_to_array(l.autor, ', ') && b.autores)::int * 4 AS puntaje,
--        (SELECT COUNT(*) FROM ejemplares e WHERE e.libro_id = l.id AND e.estado = 'disponible') AS disponibles
-- FROM libros l
-- CROSS JOIN base b
-- LEFT JOIN comunes c ON c.libro_id = l.id
-- WHERE l.id <> b.id
--   AND EXISTS (SELECT 1 FROM ejemplares e WHERE e.libro_id = l.id AND e.estado = 'disponible')
-- ORDER BY puntaje DESC, l.titulo
-- LIMIT 3;
