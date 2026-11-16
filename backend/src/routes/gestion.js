import { Router } from 'express';
import { db } from '../db/index.js';
import { ruta, noEncontrado, conflicto, invalido } from '../lib/errores.js';
import * as v from '../lib/validar.js';
import { auditar, ipDe } from '../lib/registro.js';
import { permitir } from '../middleware/auth.js';

/** Gestión del catálogo: libros, ejemplares, categorías y etiquetas. */
const r = Router();
const libros = permitir('libros.gestionar');
const ejemplares = permitir('libros.gestionar', 'ejemplares.gestionar');

function datosLibro(b){
  return {
    categoria_id: v.entero(b.categoria_id, 'categoría', { min: 1 }),
    isbn: v.isbn(b.isbn),
    titulo: v.texto(b.titulo, 'título', { max: 255 }),
    autor: v.texto(b.autor, 'autor', { max: 255 }).split(',').map(s => s.trim()).filter(Boolean).join(', '),
    editorial: v.texto(b.editorial, 'editorial', { max: 120, opcional: true }),
    anio_publicacion: v.entero(b.anio_publicacion, 'año de publicación', { min: 1400, max: new Date().getFullYear() + 1, opcional: true }),
    descripcion: v.texto(b.descripcion, 'descripción', { max: 4000, opcional: true }),
    portada_url: v.url(b.portada_url, 'URL de portada')
  };
}

function nombresEtiquetas(lista){
  if (lista === undefined) return undefined;
  if (!Array.isArray(lista)) throw invalido('Las etiquetas deben enviarse como lista.');
  const n = [...new Set(lista.map(t => String(t).trim().toLowerCase()).filter(Boolean))];
  if (n.length > 12) throw invalido('Usa como máximo 12 etiquetas por libro.');
  n.forEach(t => { if (t.length > 60) throw invalido(`La etiqueta «${t.slice(0, 20)}…» supera 60 caracteres.`); });
  return n;
}

async function guardarEtiquetas(q, libroId, nombres){
  await q.query('DELETE FROM libro_etiquetas WHERE libro_id = $1', [libroId]);
  for (const nombre of nombres) {
    const t = (await q.query(
      `INSERT INTO etiquetas (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`, [nombre])).rows[0];
    await q.query('INSERT INTO libro_etiquetas (libro_id, etiqueta_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [libroId, t.id]);
  }
  await q.query('DELETE FROM etiquetas t WHERE NOT EXISTS (SELECT 1 FROM libro_etiquetas le WHERE le.etiqueta_id = t.id)');
}

async function agregarEjemplares(q, libroId, cantidad, ubicacion){
  const creados = [];
  for (let i = 0; i < cantidad; i++) {
    const e = (await q.query(
      `INSERT INTO ejemplares (libro_id, codigo_inventario, ubicacion) VALUES ($1, 'TMP-' || left(replace(gen_random_uuid()::text, '-', ''), 24), $2) RETURNING id`,
      [libroId, ubicacion])).rows[0];
    creados.push((await q.query(
      `UPDATE ejemplares SET codigo_inventario = 'BQ-' || lpad((2400 + id)::text, 6, '0') WHERE id = $1 RETURNING *`, [e.id])).rows[0]);
  }
  return creados;
}

async function libroCompleto(q, id){
  const l = (await q.query('SELECT * FROM libros WHERE id = $1', [id])).rows[0];
  if (!l) return null;
  l.etiquetas = (await q.query(
    `SELECT t.nombre FROM libro_etiquetas le JOIN etiquetas t ON t.id = le.etiqueta_id WHERE le.libro_id = $1 ORDER BY t.nombre`, [id])).rows.map(x => x.nombre);
  l.ejemplares = (await q.query('SELECT * FROM ejemplares WHERE libro_id = $1 ORDER BY codigo_inventario', [id])).rows;
  return l;
}

/* ───────── Libros ───────── */
r.post('/libros', libros, ruta(async (req, res) => {
  const d = datosLibro(req.body || {});
  const tags = nombresEtiquetas(req.body?.etiquetas) || [];
  const cant = v.entero(req.body?.ejemplares?.cantidad ?? 0, 'cantidad de ejemplares', { min: 0, max: 50 });
  const ubic = v.texto(req.body?.ejemplares?.ubicacion, 'ubicación', { max: 120, opcional: true });
  const libro = await db.tx(async q => {
    const l = (await q.query(
      `INSERT INTO libros (categoria_id, isbn, titulo, autor, editorial, anio_publicacion, descripcion, portada_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [d.categoria_id, d.isbn, d.titulo, d.autor, d.editorial, d.anio_publicacion, d.descripcion, d.portada_url])).rows[0];
    await guardarEtiquetas(q, l.id, tags);
    if (cant) await agregarEjemplares(q, l.id, cant, ubic);
    const completo = await libroCompleto(q, l.id);
    await auditar(q, { usuario_id: req.usuario.id, accion: 'CREAR_LIBRO', entidad: 'libros', entidad_id: l.id, ip: ipDe(req), despues: { ...d, etiquetas: tags, ejemplares: cant } });
    return completo;
  });
  res.status(201).json(libro);
}));

r.put('/libros/:id', libros, ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  const d = datosLibro(req.body || {});
  const tags = nombresEtiquetas(req.body?.etiquetas);
  const libro = await db.tx(async q => {
    const antes = await libroCompleto(q, id);
    if (!antes) throw noEncontrado('Libro');
    await q.query(
      `UPDATE libros SET categoria_id=$2, isbn=$3, titulo=$4, autor=$5, editorial=$6, anio_publicacion=$7, descripcion=$8, portada_url=$9, actualizado_en=now()
        WHERE id = $1`,
      [id, d.categoria_id, d.isbn, d.titulo, d.autor, d.editorial, d.anio_publicacion, d.descripcion, d.portada_url]);
    if (tags) await guardarEtiquetas(q, id, tags);
    const despues = await libroCompleto(q, id);
    const { ejemplares: _a, ...a } = antes, { ejemplares: _b, ...b } = despues;
    await auditar(q, { usuario_id: req.usuario.id, accion: 'EDITAR_LIBRO', entidad: 'libros', entidad_id: id, ip: ipDe(req), antes: a, despues: b });
    return despues;
  });
  res.json(libro);
}));

r.delete('/libros/:id', libros, ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  await db.tx(async q => {
    const antes = await libroCompleto(q, id);
    if (!antes) throw noEncontrado('Libro');
    const hist = (await q.query(
      `SELECT COUNT(*)::int AS n FROM reserva_detalle rd JOIN ejemplares e ON e.id = rd.ejemplar_id WHERE e.libro_id = $1`, [id])).rows[0].n;
    if (hist) throw conflicto(`Este libro tiene ${hist} movimiento${hist === 1 ? '' : 's'} de reserva o préstamo en su historial; no se puede eliminar sin perder trazabilidad. Marca sus ejemplares como «perdido» o «mantenimiento» para retirarlo de circulación.`);
    await q.query('DELETE FROM libros WHERE id = $1', [id]);
    await q.query('DELETE FROM etiquetas t WHERE NOT EXISTS (SELECT 1 FROM libro_etiquetas le WHERE le.etiqueta_id = t.id)');
    await auditar(q, { usuario_id: req.usuario.id, accion: 'ELIMINAR_LIBRO', entidad: 'libros', entidad_id: id, ip: ipDe(req), antes });
  });
  res.json({ ok: true });
}));

/* ───────── Ejemplares ───────── */
r.post('/libros/:id/ejemplares', libros, ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  const cant = v.entero(req.body?.cantidad, 'cantidad', { min: 1, max: 50 });
  const ubic = v.texto(req.body?.ubicacion, 'ubicación', { max: 120, opcional: true });
  const creados = await db.tx(async q => {
    if (!(await q.query('SELECT 1 FROM libros WHERE id = $1', [id])).rows.length) throw noEncontrado('Libro');
    const c = await agregarEjemplares(q, id, cant, ubic);
    await auditar(q, { usuario_id: req.usuario.id, accion: 'AGREGAR_EJEMPLARES', entidad: 'libros', entidad_id: id, ip: ipDe(req), despues: { codigos: c.map(e => e.codigo_inventario), ubicacion: ubic } });
    return c;
  });
  res.status(201).json(creados);
}));

/** Cambios manuales de estado físico. 'reservado' y 'prestado' solo los asigna el flujo de reservas. */
r.patch('/ejemplares/:id', ejemplares, ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  const e = await db.tx(async q => {
    const antes = (await q.query('SELECT * FROM ejemplares WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!antes) throw noEncontrado('Ejemplar');
    const estado = req.body?.estado !== undefined ? v.uno(req.body.estado, 'estado', ['disponible', 'mantenimiento', 'perdido']) : antes.estado;
    const ubicacion = req.body?.ubicacion !== undefined ? v.texto(req.body.ubicacion, 'ubicación', { max: 120, opcional: true }) : antes.ubicacion;
    if (estado !== antes.estado && ['reservado', 'prestado'].includes(antes.estado))
      throw conflicto(`El ejemplar está ${antes.estado}. Su estado cambia solo con la entrega o la devolución en mostrador.`);
    const d = (await q.query('UPDATE ejemplares SET estado = $2, ubicacion = $3 WHERE id = $1 RETURNING *', [id, estado, ubicacion])).rows[0];
    await auditar(q, { usuario_id: req.usuario.id, accion: 'CAMBIAR_ESTADO_EJEMPLAR', entidad: 'ejemplares', entidad_id: id, ip: ipDe(req),
      antes: { estado: antes.estado, ubicacion: antes.ubicacion }, despues: { estado, ubicacion } });
    return d;
  });
  res.json(e);
}));

r.delete('/ejemplares/:id', libros, ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  await db.tx(async q => {
    const e = (await q.query('SELECT * FROM ejemplares WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!e) throw noEncontrado('Ejemplar');
    const hist = (await q.query('SELECT COUNT(*)::int AS n FROM reserva_detalle WHERE ejemplar_id = $1', [id])).rows[0].n;
    if (hist) throw conflicto('Este ejemplar ya circuló (tiene historial). Márcalo como «perdido» o «mantenimiento» en lugar de eliminarlo.');
    await q.query('DELETE FROM ejemplares WHERE id = $1', [id]);
    await auditar(q, { usuario_id: req.usuario.id, accion: 'ELIMINAR_EJEMPLAR', entidad: 'ejemplares', entidad_id: id, ip: ipDe(req), antes: e });
  });
  res.json({ ok: true });
}));

/* ───────── Categorías ───────── */
r.post('/categorias', libros, ruta(async (req, res) => {
  const nombre = v.texto(req.body?.nombre, 'nombre', { max: 80 });
  const descripcion = v.texto(req.body?.descripcion, 'descripción', { max: 500, opcional: true });
  const c = await db.tx(async q => {
    const c = (await q.query('INSERT INTO categorias (nombre, descripcion) VALUES ($1,$2) RETURNING *', [nombre, descripcion])).rows[0];
    await auditar(q, { usuario_id: req.usuario.id, accion: 'CREAR_CATEGORIA', entidad: 'categorias', entidad_id: c.id, ip: ipDe(req), despues: c });
    return c;
  });
  res.status(201).json(c);
}));

r.put('/categorias/:id', libros, ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  const nombre = v.texto(req.body?.nombre, 'nombre', { max: 80 });
  const descripcion = v.texto(req.body?.descripcion, 'descripción', { max: 500, opcional: true });
  const c = await db.tx(async q => {
    const antes = (await q.query('SELECT * FROM categorias WHERE id = $1', [id])).rows[0];
    if (!antes) throw noEncontrado('Categoría');
    const c = (await q.query('UPDATE categorias SET nombre = $2, descripcion = $3 WHERE id = $1 RETURNING *', [id, nombre, descripcion])).rows[0];
    await auditar(q, { usuario_id: req.usuario.id, accion: 'EDITAR_CATEGORIA', entidad: 'categorias', entidad_id: id, ip: ipDe(req), antes, despues: c });
    return c;
  });
  res.json(c);
}));

r.delete('/categorias/:id', libros, ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  await db.tx(async q => {
    const n = (await q.query('SELECT COUNT(*)::int AS n FROM libros WHERE categoria_id = $1', [id])).rows[0].n;
    if (n) throw conflicto(`La categoría tiene ${n} libro${n === 1 ? '' : 's'}. Muévelos a otra categoría antes de eliminarla.`);
    const antes = (await q.query('DELETE FROM categorias WHERE id = $1 RETURNING *', [id])).rows[0];
    if (!antes) throw noEncontrado('Categoría');
    await auditar(q, { usuario_id: req.usuario.id, accion: 'ELIMINAR_CATEGORIA', entidad: 'categorias', entidad_id: id, ip: ipDe(req), antes });
  });
  res.json({ ok: true });
}));

export default r;
