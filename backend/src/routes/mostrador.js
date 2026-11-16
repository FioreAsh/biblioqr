import { Router } from 'express';
import { db } from '../db/index.js';
import { ruta, noEncontrado, invalido } from '../lib/errores.js';
import * as v from '../lib/validar.js';
import { ipDe } from '../lib/registro.js';
import { permitir } from '../middleware/auth.js';
import { buscarCodigo, entregarReserva, registrarDevolucion, diasRetraso } from '../services/flujo.js';

/** Módulo del bibliotecario: escaneo de QR, entrega física y devolución. */
const r = Router();
r.use(permitir('mostrador.operar'));

/** Identifica un QR (de recojo o de préstamo) y devuelve qué se puede hacer con él. */
r.get('/qr/:codigo', ruta(async (req, res) => {
  const codigo = String(req.params.codigo).trim().toLowerCase();
  if (!v.esUuid(codigo)) throw invalido('Ese texto no es un código BiblioQR. Vuelve a escanear el QR.');
  const info = await buscarCodigo(db, codigo);
  if (!info) throw noEncontrado('Código QR');
  res.json(info);
}));

r.post('/reservas/:id/entregar', ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  res.json(await db.tx(q => entregarReserva(q, req.usuario, id, ipDe(req))));
}));

r.post('/prestamos/:id/devolver', permitir('incidencias.registrar'), ruta(async (req, res) => {
  const id = v.entero(req.params.id, 'id', { min: 1 });
  res.json(await db.tx(q => registrarDevolucion(q, req.usuario, id, req.body || {}, ipDe(req))));
}));

/** Tablero del día: reservas por recoger, préstamos vencidos y ejemplares en revisión. */
r.get('/tablero', ruta(async (_req, res) => {
  const [porRecoger, vencidos, activos, mantenimiento, hoy] = await Promise.all([
    db.query(`SELECT r.id, r.codigo_reserva, r.fecha_expiracion, u.nombres, u.apellidos, u.codigo_estudiante,
                     (SELECT COUNT(*)::int FROM reserva_detalle rd WHERE rd.reserva_id = r.id) AS n
                FROM reservas r JOIN usuarios u ON u.id = r.usuario_id
               WHERE r.estado = 'pendiente' AND r.fecha_expiracion > now() ORDER BY r.fecha_expiracion LIMIT 50`),
    db.query(`SELECT p.id, p.codigo_prestamo, rd.fecha_limite_devol, l.titulo, e.codigo_inventario, u.nombres, u.apellidos, u.codigo_estudiante, u.email
                FROM reserva_detalle rd JOIN prestamos p ON p.reserva_id = rd.reserva_id
                JOIN ejemplares e ON e.id = rd.ejemplar_id JOIN libros l ON l.id = e.libro_id
                JOIN usuarios u ON u.id = p.usuario_id
               WHERE rd.estado = 'prestado' AND rd.fecha_limite_devol <= now() ORDER BY rd.fecha_limite_devol LIMIT 50`),
    db.query(`SELECT COUNT(*)::int AS n FROM reserva_detalle WHERE estado = 'prestado'`),
    db.query(`SELECT e.id, e.codigo_inventario, e.ubicacion, l.titulo,
                     (SELECT rd.observacion FROM reserva_detalle rd WHERE rd.ejemplar_id = e.id AND rd.fecha_devolucion IS NOT NULL ORDER BY rd.fecha_devolucion DESC LIMIT 1) AS observacion
                FROM ejemplares e JOIN libros l ON l.id = e.libro_id WHERE e.estado = 'mantenimiento' ORDER BY l.titulo`),
    db.query(`SELECT
                (SELECT COUNT(*)::int FROM reservas WHERE fecha_retiro::date = CURRENT_DATE) AS entregas,
                (SELECT COUNT(*)::int FROM reserva_detalle WHERE fecha_devolucion::date = CURRENT_DATE) AS devoluciones`)
  ]);
  res.json({
    por_recoger: porRecoger.rows,
    vencidos: vencidos.rows.map(x => ({ ...x, dias_retraso: diasRetraso(x.fecha_limite_devol) })),
    prestados: activos.rows[0].n,
    mantenimiento: mantenimiento.rows,
    hoy: hoy.rows[0]
  });
}));

export default r;
