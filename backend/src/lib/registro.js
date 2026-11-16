import { enviarCorreo } from './correo.js';

/** Auditoría: toda operación que cambia datos deja rastro (usuario NULL = proceso automático). */
export async function auditar(q, { usuario_id = null, accion, entidad, entidad_id = null, antes = null, despues = null, ip = null }){
  await q.query(
    `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, datos_anteriores, datos_nuevos, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [usuario_id, accion, entidad, entidad_id, antes && JSON.stringify(antes), despues && JSON.stringify(despues), ip]
  );
}

/**
 * Notificación en la app + correo. Se guarda dentro de la transacción del caso de uso;
 * el correo sale después, sin bloquear la respuesta.
 */
export async function notificar(q, { usuario_id, tipo, asunto, mensaje, reserva_id = null, reserva_detalle_id = null, sancion_id = null }){
  const r = await q.query(
    `INSERT INTO notificaciones (usuario_id, reserva_id, reserva_detalle_id, sancion_id, tipo, asunto, mensaje, estado, fecha_envio)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'enviada', now())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [usuario_id, reserva_id, reserva_detalle_id, sancion_id, tipo, asunto, mensaje]
  );
  if (!r.rows.length) return null;
  const u = await q.query('SELECT email FROM usuarios WHERE id = $1', [usuario_id]);
  if (u.rows[0]) setImmediate(() => enviarCorreo({ para: u.rows[0].email, asunto: `BiblioQR · ${asunto}`, texto: mensaje }));
  return r.rows[0].id;
}

export const ipDe = req => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim() || null;
