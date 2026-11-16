import { Router } from 'express';
import { db } from '../db/index.js';
import { ruta, noEncontrado } from '../lib/errores.js';
import * as v from '../lib/validar.js';
import { ipDe } from '../lib/registro.js';
import { politicas } from '../lib/util.js';
import { permitir } from '../middleware/auth.js';
import { crearReserva, cancelarReserva, itemsDe, cupoUsado, sancionActiva, diasRetraso } from '../services/flujo.js';

/** Módulo del estudiante: sus reservas, préstamos, sanciones y notificaciones. */
const r = Router();

r.post('/reservas', permitir('reservas.crear'), ruta(async (req, res) => {
  const ids = v.listaIds(req.body?.ejemplares, 'ejemplares');
  const reserva = await db.tx(q => crearReserva(q, req.usuario, ids, ipDe(req)));
  res.status(201).json(reserva);
}));

r.post('/reservas/:id/cancelar', permitir('reservas.crear'), ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  res.json(await db.tx(q => cancelarReserva(q, req.usuario, id, ipDe(req))));
}));

/** Todo lo que el estudiante necesita para «Mis reservas y préstamos». */
r.get('/resumen', permitir('cuenta.propia'), ruta(async (req, res) => {
  const uid = req.usuario.id;
  const pol = await politicas(db);
  const reservas = (await db.query(
    `SELECT r.id, r.codigo_reserva, r.estado, r.fecha_reserva, r.fecha_expiracion, r.fecha_retiro,
            p.id AS prestamo_id, p.codigo_prestamo, p.estado AS prestamo_estado, p.fecha_entrega, p.fecha_limite
       FROM reservas r LEFT JOIN prestamos p ON p.reserva_id = r.id
      WHERE r.usuario_id = $1 ORDER BY r.fecha_reserva DESC LIMIT 40`, [uid])).rows;
  for (const x of reservas) {
    x.items = (await itemsDe(db, x.id)).map(i => ({ ...i, dias_retraso: i.estado === 'prestado' ? diasRetraso(i.fecha_limite_devol) : 0 }));
  }
  const sanciones = (await db.query(
    `SELECT id, motivo, fecha_inicio, fecha_fin, estado FROM sanciones WHERE usuario_id = $1 ORDER BY fecha_inicio DESC`, [uid])).rows;
  const usado = await cupoUsado(db, uid);
  res.json({
    pendientes: reservas.filter(x => x.estado === 'pendiente'),
    prestamos: reservas.filter(x => x.prestamo_id && x.prestamo_estado === 'activo'),
    historial: reservas.filter(x => x.estado !== 'pendiente' && !(x.prestamo_id && x.prestamo_estado === 'activo')),
    sanciones,
    sancion_activa: await sancionActiva(db, uid),
    cupo: { maximo: pol.max_ejemplares, usado, libre: Math.max(0, pol.max_ejemplares - usado) },
    politicas: pol
  });
}));

r.get('/notificaciones', ruta(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, tipo, asunto, mensaje, fecha_envio, leida_en FROM notificaciones
      WHERE usuario_id = $1 ORDER BY fecha_programada DESC, id DESC LIMIT 100`, [req.usuario.id]);
  res.json(rows);
}));

r.post('/notificaciones/leer-todas', ruta(async (req, res) => {
  await db.query('UPDATE notificaciones SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL', [req.usuario.id]);
  res.json({ ok: true });
}));

r.post('/notificaciones/:id/leer', ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  const x = await db.query('UPDATE notificaciones SET leida_en = COALESCE(leida_en, now()) WHERE id = $1 AND usuario_id = $2', [id, req.usuario.id]);
  if (!x.rowCount) throw noEncontrado('Notificación');
  res.json({ ok: true });
}));

export default r;
