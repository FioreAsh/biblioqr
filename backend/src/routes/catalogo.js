import { Router } from 'express';
import { db } from '../db/index.js';
import { ruta, noEncontrado } from '../lib/errores.js';
import { entero } from '../lib/validar.js';
import { permitir } from '../middleware/auth.js';
import { politicas } from '../lib/util.js';

const r = Router();
r.use(permitir('catalogo.ver'));

/**
 * Catálogo completo con etiquetas y ejemplares.
 * Filtros opcionales (combinables, usan los índices de la migración v2):
 *   ?q=  título/autor/ISBN (pg_trgm)  ?categoria_id=  ?autor=  ?isbn=  ?disponibles=1
 */
r.get('/', ruta(async (req, res) => {
  const w = [], p = [];
  const add = (sql, val) => { p.push(val); w.push(sql.replace('?', `$${p.length}`)); };
  if (req.query.q) add(`(l.titulo ILIKE ? OR l.autor ILIKE $${p.length + 1} OR replace(l.isbn,'-','') ILIKE replace($${p.length + 1},'-',''))`, `%${req.query.q}%`);
  if (req.query.categoria_id) add('l.categoria_id = ?', entero(req.query.categoria_id, 'categoria_id', { min: 1 }));
  if (req.query.autor) add('l.autor ILIKE ?', `%${req.query.autor}%`);
  if (req.query.isbn) add(`replace(l.isbn,'-','') ILIKE ?`, `%${String(req.query.isbn).replace(/-/g, '')}%`);
  if (req.query.disponibles === '1') w.push(`EXISTS (SELECT 1 FROM ejemplares e WHERE e.libro_id = l.id AND e.estado = 'disponible')`);

  const libros = (await db.query(
    `SELECT l.id, l.categoria_id, l.isbn, l.titulo, l.autor, l.editorial, l.anio_publicacion, l.descripcion, l.portada_url
       FROM libros l ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.titulo`, p)).rows;
  const ids = libros.map(l => l.id);
  const [categorias, etiquetas, libroEtiquetas, ejemplares, pol] = await Promise.all([
    db.query('SELECT id, nombre, descripcion FROM categorias ORDER BY nombre'),
    db.query('SELECT id, nombre FROM etiquetas ORDER BY nombre'),
    db.query('SELECT libro_id, etiqueta_id FROM libro_etiquetas WHERE libro_id = ANY($1)', [ids]),
    db.query('SELECT id, libro_id, codigo_inventario, ubicacion, estado FROM ejemplares WHERE libro_id = ANY($1) ORDER BY codigo_inventario', [ids]),
    politicas(db)
  ]);
  res.json({
    categorias: categorias.rows,
    libros,
    etiquetas: etiquetas.rows,
    libro_etiquetas: libroEtiquetas.rows,
    ejemplares: ejemplares.rows,
    politicas: pol
  });
}));

/** Libros similares: consulta SQL v2 (3×etiqueta común + 2×misma categoría + 4×autor común). */
r.get('/libros/:id/similares', ruta(async (req, res) => {
  const id = entero(req.params.id, 'id', { min: 1 });
  const existe = await db.query('SELECT 1 FROM libros WHERE id = $1', [id]);
  if (!existe.rows.length) throw noEncontrado('Libro');
  const { rows } = await db.query(`
    WITH base AS (
        SELECT id, categoria_id, string_to_array(autor, ', ') AS autores
        FROM libros WHERE id = $1
    ),
    comunes AS (
        SELECT le2.libro_id, COUNT(*) AS n
        FROM libro_etiquetas le1
        JOIN libro_etiquetas le2 ON le2.etiqueta_id = le1.etiqueta_id AND le2.libro_id <> le1.libro_id
        WHERE le1.libro_id = $1
        GROUP BY le2.libro_id
    )
    SELECT l.id, l.titulo, l.autor, l.portada_url, l.categoria_id,
           (COALESCE(c.n, 0) * 3
             + (l.categoria_id = b.categoria_id)::int * 2
             + (string_to_array(l.autor, ', ') && b.autores)::int * 4)::int AS puntaje,
           COALESCE(c.n, 0)::int AS etiquetas_comunes,
           (l.categoria_id = b.categoria_id) AS misma_categoria,
           (string_to_array(l.autor, ', ') && b.autores) AS mismo_autor,
           (SELECT COUNT(*) FROM ejemplares e WHERE e.libro_id = l.id AND e.estado = 'disponible')::int AS disponibles
    FROM libros l
    CROSS JOIN base b
    LEFT JOIN comunes c ON c.libro_id = l.id
    WHERE l.id <> b.id
      AND EXISTS (SELECT 1 FROM ejemplares e WHERE e.libro_id = l.id AND e.estado = 'disponible')
    ORDER BY puntaje DESC, l.titulo
    LIMIT 3`, [id]);
  res.json(rows);
}));

export default r;
