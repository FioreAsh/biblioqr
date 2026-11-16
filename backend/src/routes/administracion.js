import { Router } from 'express';
import { db } from '../db/index.js';
import { ruta, noEncontrado, conflicto, invalido } from '../lib/errores.js';
import * as v from '../lib/validar.js';
import { auditar, notificar, ipDe } from '../lib/registro.js';
import { fecha, politicas } from '../lib/util.js';
import { PERMISOS, ROLES } from '../lib/permisos.js';
import { permitir } from '../middleware/auth.js';

/** Usuarios y roles, sanciones e incidencias, auditoría, políticas e indicadores. */
const r = Router();

/* ───────── Roles y permisos (solo lectura) ───────── */
r.get('/roles', permitir('usuarios.gestionar'), (_req, res) => res.json({ permisos: PERMISOS, roles: ROLES }));

/* ───────── Usuarios ───────── */
r.get('/usuarios', permitir('usuarios.gestionar', 'sanciones.gestionar'), ruta(async (req, res) => {
  const p = [], w = [];
  if (req.query.q) { p.push(`%${req.query.q}%`); w.push(`(u.nombres || ' ' || u.apellidos || ' ' || u.email || ' ' || COALESCE(u.codigo_estudiante,'')) ILIKE $${p.length}`); }
  if (req.query.rol) { p.push(v.uno(req.query.rol, 'rol', Object.keys(ROLES))); w.push(`u.rol = $${p.length}`); }
  const { rows } = await db.query(
    `SELECT u.id, u.codigo_estudiante, u.nombres, u.apellidos, u.email, u.rol, u.activo, u.creado_en, u.ultimo_acceso,
            (SELECT COUNT(*)::int FROM reserva_detalle rd JOIN reservas r ON r.id = rd.reserva_id
              WHERE r.usuario_id = u.id AND rd.estado IN ('reservado','prestado')) AS ejemplares_activos,
            (SELECT MAX(s.fecha_fin) FROM sanciones s WHERE s.usuario_id = u.id AND s.estado = 'activa' AND s.fecha_fin > now()) AS suspendido_hasta
       FROM usuarios u ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
      ORDER BY u.rol DESC, u.apellidos, u.nombres LIMIT 300`, p);
  res.json(rows);
}));

r.post('/usuarios', permitir('usuarios.gestionar'), ruta(async (req, res) => {
  const b = req.body || {};
  const d = {
    email: v.email(b.email),
    nombres: v.texto(b.nombres, 'nombres', { max: 80 }),
    apellidos: v.texto(b.apellidos, 'apellidos', { max: 120 }),
    rol: v.uno(b.rol, 'rol', Object.keys(ROLES)),
    codigo_estudiante: v.texto(b.codigo_estudiante, 'código de estudiante', { max: 20, opcional: true })
  };
  if (d.rol === 'estudiante' && !d.codigo_estudiante) throw invalido('Un estudiante necesita su código de estudiante.', { campo: 'codigo_estudiante' });
  if (d.rol !== 'estudiante') d.codigo_estudiante = null;
  const u = await db.tx(async q => {
    const u = (await q.query(
      `INSERT INTO usuarios (email, nombres, apellidos, rol, codigo_estudiante) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [d.email, d.nombres, d.apellidos, d.rol, d.codigo_estudiante])).rows[0];
    await auditar(q, { usuario_id: req.usuario.id, accion: 'CREAR_USUARIO', entidad: 'usuarios', entidad_id: u.id, ip: ipDe(req), despues: d });
    return u;
  });
  res.status(201).json(u);
}));

r.patch('/usuarios/:id', permitir('usuarios.gestionar'), ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  const b = req.body || {};
  const u = await db.tx(async q => {
    const antes = (await q.query('SELECT * FROM usuarios WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!antes) throw noEncontrado('Usuario');
    const d = {
      nombres: b.nombres !== undefined ? v.texto(b.nombres, 'nombres', { max: 80 }) : antes.nombres,
      apellidos: b.apellidos !== undefined ? v.texto(b.apellidos, 'apellidos', { max: 120 }) : antes.apellidos,
      rol: b.rol !== undefined ? v.uno(b.rol, 'rol', Object.keys(ROLES)) : antes.rol,
      activo: b.activo !== undefined ? Boolean(b.activo) : antes.activo,
      codigo_estudiante: b.codigo_estudiante !== undefined ? v.texto(b.codigo_estudiante, 'código de estudiante', { max: 20, opcional: true }) : antes.codigo_estudiante
    };
    if (id === req.usuario.id && (d.rol !== antes.rol || !d.activo))
      throw conflicto('No puedes cambiar tu propio rol ni desactivar tu propia cuenta. Pide a otro administrador que lo haga.');
    if (antes.rol === 'administrador' && (d.rol !== 'administrador' || !d.activo)) {
      const otros = (await q.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'administrador' AND activo AND id <> $1`, [id])).rows[0].n;
      if (!otros) throw conflicto('Debe quedar al menos un administrador activo.');
    }
    if (d.rol === 'estudiante' && !d.codigo_estudiante) throw invalido('Un estudiante necesita su código de estudiante.', { campo: 'codigo_estudiante' });
    const nu = (await q.query(
      `UPDATE usuarios SET nombres=$2, apellidos=$3, rol=$4, activo=$5, codigo_estudiante=$6 WHERE id=$1 RETURNING *`,
      [id, d.nombres, d.apellidos, d.rol, d.activo, d.codigo_estudiante])).rows[0];
    // Un cambio de rol o una desactivación cierra sus sesiones: el nuevo acceso se aplica al volver a entrar
    if (d.rol !== antes.rol || d.activo !== antes.activo) await q.query('UPDATE sesiones SET revocada = TRUE WHERE usuario_id = $1', [id]);
    await auditar(q, { usuario_id: req.usuario.id, accion: d.rol !== antes.rol ? 'CAMBIAR_ROL' : 'EDITAR_USUARIO', entidad: 'usuarios', entidad_id: id, ip: ipDe(req),
      antes: { nombres: antes.nombres, apellidos: antes.apellidos, rol: antes.rol, activo: antes.activo, codigo_estudiante: antes.codigo_estudiante }, despues: d });
    return nu;
  });
  res.json(u);
}));

/* ───────── Sanciones ───────── */
r.get('/sanciones', permitir('sanciones.gestionar'), ruta(async (req, res) => {
  const p = [], w = [];
  if (req.query.estado === 'vigentes') w.push(`s.estado = 'activa' AND s.fecha_fin > now()`);
  else if (req.query.estado) { p.push(v.uno(req.query.estado, 'estado', ['activa', 'cumplida', 'levantada'])); w.push(`s.estado = $${p.length}`); }
  const { rows } = await db.query(
    `SELECT s.*, u.nombres, u.apellidos, u.codigo_estudiante, u.email,
            b.nombres AS bib_nombres, b.apellidos AS bib_apellidos
       FROM sanciones s JOIN usuarios u ON u.id = s.usuario_id LEFT JOIN usuarios b ON b.id = s.bibliotecario_id
       ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY s.fecha_inicio DESC LIMIT 200`, p);
  res.json(rows);
}));

r.post('/sanciones', permitir('sanciones.gestionar'), ruta(async (req, res) => {
  const usuario_id = v.entero(req.body?.usuario_id, 'estudiante', { min: 1 });
  const dias = v.entero(req.body?.dias, 'días', { min: 1, max: 365 });
  const motivo = v.texto(req.body?.motivo, 'motivo', { min: 5, max: 500 });
  const s = await db.tx(async q => {
    const u = (await q.query('SELECT rol FROM usuarios WHERE id = $1', [usuario_id])).rows[0];
    if (!u) throw noEncontrado('Usuario');
    if (u.rol !== 'estudiante') throw invalido('Solo se suspende a estudiantes.');
    const s = (await q.query(
      `INSERT INTO sanciones (usuario_id, bibliotecario_id, motivo, fecha_fin) VALUES ($1,$2,$3, now() + make_interval(days => $4)) RETURNING *`,
      [usuario_id, req.usuario.id, motivo, dias])).rows[0];
    await notificar(q, { usuario_id, sancion_id: s.id, tipo: 'sancion_aplicada', asunto: 'Suspensión temporal',
      mensaje: `No podrás hacer reservas hasta el ${fecha(s.fecha_fin)}. Motivo: ${motivo}` });
    await auditar(q, { usuario_id: req.usuario.id, accion: 'APLICAR_SANCION', entidad: 'sanciones', entidad_id: s.id, ip: ipDe(req), despues: { usuario_id, dias, motivo } });
    return s;
  });
  res.status(201).json(s);
}));

r.post('/sanciones/:id/levantar', permitir('sanciones.gestionar'), ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  const motivo = v.texto(req.body?.motivo, 'motivo', { min: 3, max: 500 });
  const s = await db.tx(async q => {
    const s = (await q.query(`UPDATE sanciones SET estado = 'levantada' WHERE id = $1 AND estado = 'activa' RETURNING *`, [id])).rows[0];
    if (!s) throw conflicto('La sanción no existe o ya no está activa.');
    await notificar(q, { usuario_id: s.usuario_id, sancion_id: s.id, tipo: 'sancion_levantada', asunto: 'Suspensión levantada',
      mensaje: `Tu suspensión se levantó. Ya puedes volver a reservar. Nota: ${motivo}` });
    await auditar(q, { usuario_id: req.usuario.id, accion: 'LEVANTAR_SANCION', entidad: 'sanciones', entidad_id: id, ip: ipDe(req), antes: { estado: 'activa' }, despues: { estado: 'levantada', motivo } });
    return s;
  });
  res.json(s);
}));

r.get('/incidencias', permitir('sanciones.gestionar'), ruta(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT i.*, u.nombres, u.apellidos, u.codigo_estudiante, s.fecha_fin AS sancion_hasta, s.estado AS sancion_estado
       FROM incidencias i JOIN usuarios u ON u.id = i.usuario_id LEFT JOIN sanciones s ON s.id = i.sancion_id
      ORDER BY i.fecha DESC LIMIT 200`);
  res.json(rows);
}));

/* ───────── Auditoría ───────── */
r.get('/auditoria', permitir('auditoria.ver'), ruta(async (req, res) => {
  const p = [], w = [];
  if (req.query.entidad) { p.push(String(req.query.entidad)); w.push(`a.entidad = $${p.length}`); }
  if (req.query.accion) { p.push(String(req.query.accion)); w.push(`a.accion = $${p.length}`); }
  const limite = v.entero(req.query.limite ?? 150, 'límite', { min: 1, max: 500 });
  p.push(limite);
  const { rows } = await db.query(
    `SELECT a.*, u.nombres, u.apellidos, u.rol FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.fecha DESC, a.id DESC LIMIT $${p.length}`, p);
  const acciones = (await db.query('SELECT DISTINCT accion FROM auditoria ORDER BY accion')).rows.map(x => x.accion);
  res.json({ registros: rows, acciones });
}));

/* ───────── Políticas ───────── */
r.get('/configuracion', ruta(async (_req, res) => {
  res.json((await db.query('SELECT clave, valor, descripcion FROM configuracion ORDER BY clave')).rows);
}));

const LIMITES = {
  max_ejemplares: [1, 10], horas_recojo: [1, 168], dias_prestamo: [1, 90], horas_recordatorio: [1, 72],
  dias_sancion_por_dia_retraso: [0, 30], dias_sancion_danio: [0, 365], dias_sancion_perdida: [0, 365]
};
r.put('/configuracion', permitir('configuracion.gestionar'), ruta(async (req, res) => {
  const cambios = req.body || {};
  await db.tx(async q => {
    const antes = await politicas(q);
    for (const [k, val] of Object.entries(cambios)) {
      if (!LIMITES[k]) throw invalido(`Política desconocida: ${k}`);
      const n = v.entero(val, k, { min: LIMITES[k][0], max: LIMITES[k][1] });
      await q.query('UPDATE configuracion SET valor = $2 WHERE clave = $1', [k, n]);
    }
    await auditar(q, { usuario_id: req.usuario.id, accion: 'EDITAR_POLITICAS', entidad: 'configuracion', ip: ipDe(req), antes, despues: await politicas(q) });
  });
  res.json((await db.query('SELECT clave, valor, descripcion FROM configuracion ORDER BY clave')).rows);
}));

/* ───────── Indicadores ───────── */
r.get('/reportes/resumen', permitir('reportes.ver'), ruta(async (_req, res) => {
  const x = (await db.query(`SELECT
      (SELECT COUNT(*)::int FROM libros) AS libros,
      (SELECT COUNT(*)::int FROM ejemplares) AS ejemplares,
      (SELECT COUNT(*)::int FROM ejemplares WHERE estado = 'disponible') AS disponibles,
      (SELECT COUNT(*)::int FROM ejemplares WHERE estado = 'reservado') AS reservados,
      (SELECT COUNT(*)::int FROM ejemplares WHERE estado = 'prestado') AS prestados,
      (SELECT COUNT(*)::int FROM ejemplares WHERE estado = 'mantenimiento') AS mantenimiento,
      (SELECT COUNT(*)::int FROM ejemplares WHERE estado = 'perdido') AS perdidos,
      (SELECT COUNT(*)::int FROM usuarios WHERE rol = 'estudiante' AND activo) AS estudiantes,
      (SELECT COUNT(*)::int FROM sanciones WHERE estado = 'activa' AND fecha_fin > now()) AS suspendidos,
      (SELECT COUNT(*)::int FROM reserva_detalle WHERE estado = 'prestado' AND fecha_limite_devol <= now()) AS vencidos,
      (SELECT COUNT(*)::int FROM reservas WHERE fecha_reserva > now() - interval '30 days') AS reservas_30d,
      (SELECT COUNT(*)::int FROM reservas WHERE estado = 'vencida' AND fecha_reserva > now() - interval '30 days') AS vencidas_30d`)).rows[0];
  const top = (await db.query(
    `SELECT l.id, l.titulo, l.autor, COUNT(*)::int AS n
       FROM reserva_detalle rd JOIN ejemplares e ON e.id = rd.ejemplar_id JOIN libros l ON l.id = e.libro_id
      GROUP BY l.id ORDER BY n DESC, l.titulo LIMIT 5`)).rows;
  res.json({ ...x, top });
}));

export default r;
