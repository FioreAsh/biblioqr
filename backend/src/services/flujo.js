/**
 * Casos de uso del ciclo de préstamo. Cada función recibe `q` (una transacción abierta),
 * así la operación completa se confirma o se revierte entera.
 *
 *   reserva (pendiente, QR 48 h) ──entregar──▶ préstamo (activo, QR propio, 14 días) ──devolver──▶ cerrado
 *            └─ vence / se cancela: ejemplares vuelven a 'disponible', sin sanción
 */
import { HttpError, conflicto, invalido, noEncontrado } from '../lib/errores.js';
import { auditar, notificar } from '../lib/registro.js';
import { fecha, politicas } from '../lib/util.js';

export const CONDICIONES = {
  bueno:    { ejemplar: 'disponible',    detalle: 'devuelto', texto: 'buen estado' },
  revision: { ejemplar: 'mantenimiento', detalle: 'devuelto', texto: 'requiere revisión' },
  danado:   { ejemplar: 'mantenimiento', detalle: 'devuelto', texto: 'con daños' },
  perdido:  { ejemplar: 'perdido',       detalle: 'perdido',  texto: 'reportado como perdido' }
};

const DIA = 86_400_000;
export const diasRetraso = limite => Math.max(0, Math.ceil((Date.now() - new Date(limite).getTime()) / DIA));

/** Ejemplares de una reserva con su libro. */
export async function itemsDe(q, reservaId){
  return (await q.query(
    `SELECT rd.id AS detalle_id, rd.estado, rd.fecha_limite_devol, rd.fecha_devolucion, rd.condicion_devolucion, rd.observacion,
            e.id AS ejemplar_id, e.codigo_inventario, e.ubicacion, e.estado AS ejemplar_estado,
            l.id AS libro_id, l.titulo, l.autor, l.isbn, l.portada_url, l.categoria_id
       FROM reserva_detalle rd
       JOIN ejemplares e ON e.id = rd.ejemplar_id
       JOIN libros l ON l.id = e.libro_id
      WHERE rd.reserva_id = $1 ORDER BY rd.id`, [reservaId])).rows;
}

export async function sancionActiva(q, usuarioId){
  return (await q.query(
    `SELECT id, motivo, fecha_fin FROM sanciones
      WHERE usuario_id = $1 AND estado = 'activa' AND fecha_fin > now()
      ORDER BY fecha_fin DESC LIMIT 1`, [usuarioId])).rows[0] || null;
}

export async function cupoUsado(q, usuarioId){
  return (await q.query(
    `SELECT COUNT(*)::int AS n FROM reserva_detalle rd JOIN reservas r ON r.id = rd.reserva_id
      WHERE r.usuario_id = $1 AND rd.estado IN ('reservado','prestado')`, [usuarioId])).rows[0].n;
}

/* ───────────── Reserva ───────────── */
export async function crearReserva(q, usuario, ejemplarIds, ip){
  const pol = await politicas(q);
  const ids = [...new Set(ejemplarIds)];
  if (!ids.length) throw invalido('Elige al menos un ejemplar.');
  if (ids.length > pol.max_ejemplares) throw invalido(`Puedes reservar hasta ${pol.max_ejemplares} ejemplares.`);

  // Serializa las reservas del mismo estudiante (cupo) y bloquea los ejemplares elegidos
  await q.query('SELECT id FROM usuarios WHERE id = $1 FOR UPDATE', [usuario.id]);
  const s = await sancionActiva(q, usuario.id);
  if (s) throw new HttpError(403, `Tienes una suspensión vigente hasta el ${fecha(s.fecha_fin)}. No puedes reservar mientras dure.`, { sancion: s });

  const ejs = (await q.query(
    `SELECT e.id, e.libro_id, e.estado, e.codigo_inventario, e.ubicacion, l.titulo
       FROM ejemplares e JOIN libros l ON l.id = e.libro_id
      WHERE e.id = ANY($1) ORDER BY e.id FOR UPDATE OF e`, [ids])).rows;
  if (ejs.length !== ids.length) throw noEncontrado('Uno de los ejemplares');
  const ocupados = ejs.filter(e => e.estado !== 'disponible');
  if (ocupados.length) throw conflicto(
    ocupados.length === 1 ? `«${ocupados[0].titulo}» (${ocupados[0].codigo_inventario}) acaba de dejar de estar disponible.` : 'Algunos ejemplares acaban de dejar de estar disponibles.',
    { no_disponibles: ocupados.map(e => e.id) });
  if (new Set(ejs.map(e => e.libro_id)).size !== ejs.length) throw invalido('Solo puedes apartar un ejemplar por título.');

  const usado = await cupoUsado(q, usuario.id);
  if (usado + ids.length > pol.max_ejemplares) {
    const libre = Math.max(0, pol.max_ejemplares - usado);
    throw conflicto(libre
      ? `Ya tienes ${usado} ejemplar${usado === 1 ? '' : 'es'} entre reservas y préstamos; solo puedes apartar ${libre} más.`
      : `Ya tienes ${usado} ejemplares entre reservas y préstamos, el máximo permitido. Devuelve alguno para reservar otro.`,
      { cupo_libre: libre });
  }

  const reserva = (await q.query(
    `INSERT INTO reservas (usuario_id, fecha_expiracion) VALUES ($1, now() + make_interval(hours => $2)) RETURNING *`,
    [usuario.id, pol.horas_recojo])).rows[0];
  for (const e of ejs) {
    await q.query(`INSERT INTO reserva_detalle (reserva_id, ejemplar_id, estado) VALUES ($1,$2,'reservado')`, [reserva.id, e.id]);
    await q.query(`UPDATE ejemplares SET estado = 'reservado' WHERE id = $1`, [e.id]);
  }
  await notificar(q, {
    usuario_id: usuario.id, reserva_id: reserva.id, tipo: 'reserva_confirmada', asunto: 'Tus libros están listos para recoger',
    mensaje: `Apartamos ${ejs.length === 1 ? 'tu ejemplar' : `tus ${ejs.length} ejemplares`}: ${ejs.map(e => `${e.titulo} (${e.codigo_inventario})`).join('; ')}.\nPresenta tu código QR en el mostrador antes del ${fecha(reserva.fecha_expiracion)}. Si no los recoges a tiempo, la reserva vence sin sanción.`
  });
  await auditar(q, { usuario_id: usuario.id, accion: 'CREAR_RESERVA', entidad: 'reservas', entidad_id: reserva.id, ip,
    despues: { codigo_reserva: reserva.codigo_reserva, ejemplares: ids, fecha_expiracion: reserva.fecha_expiracion } });
  return { ...reserva, items: await itemsDe(q, reserva.id) };
}

/** Libera los ejemplares de una reserva (vencida o cancelada). */
async function liberar(q, reserva, nuevoEstado){
  await q.query(`UPDATE reservas SET estado = $2 WHERE id = $1`, [reserva.id, nuevoEstado]);
  const det = (await q.query(
    `UPDATE reserva_detalle SET estado = 'liberado' WHERE reserva_id = $1 AND estado = 'reservado' RETURNING ejemplar_id`, [reserva.id])).rows;
  await q.query(`UPDATE ejemplares SET estado = 'disponible' WHERE id = ANY($1) AND estado = 'reservado'`, [det.map(d => d.ejemplar_id)]);
  return det.length;
}

export async function cancelarReserva(q, usuario, reservaId, ip){
  const r = (await q.query('SELECT * FROM reservas WHERE id = $1 AND usuario_id = $2 FOR UPDATE', [reservaId, usuario.id])).rows[0];
  if (!r) throw noEncontrado('Reserva');
  if (r.estado !== 'pendiente') throw conflicto('Solo puedes cancelar una reserva pendiente.');
  const n = await liberar(q, r, 'cancelada');
  await auditar(q, { usuario_id: usuario.id, accion: 'CANCELAR_RESERVA', entidad: 'reservas', entidad_id: r.id, ip, antes: { estado: 'pendiente' }, despues: { estado: 'cancelada', ejemplares_liberados: n } });
  return { ok: true };
}

/** Proceso automático: reservas sin recoger dentro del plazo. No genera sanción. */
export async function vencerReservas(q){
  const vencidas = (await q.query(
    `SELECT * FROM reservas WHERE estado = 'pendiente' AND fecha_expiracion <= now() ORDER BY id FOR UPDATE SKIP LOCKED`)).rows;
  for (const r of vencidas) {
    const items = await itemsDe(q, r.id);
    const n = await liberar(q, r, 'vencida');
    await notificar(q, {
      usuario_id: r.usuario_id, reserva_id: r.id, tipo: 'reserva_vencida', asunto: 'Tu reserva venció',
      mensaje: `No se recogieron a tiempo: ${items.map(i => i.titulo).join('; ')}. El código QR ya no es válido y los ejemplares volvieron al catálogo. Esto no genera sanción; puedes reservar de nuevo cuando quieras.`
    });
    await auditar(q, { accion: 'VENCER_RESERVA', entidad: 'reservas', entidad_id: r.id, antes: { estado: 'pendiente' }, despues: { estado: 'vencida', ejemplares_liberados: n } });
  }
  return vencidas.length;
}

/* ───────────── Mostrador: lectura del QR ───────────── */
export async function buscarCodigo(q, codigo){
  const pol = await politicas(q);
  const reserva = (await q.query(
    `SELECT r.*, p.id AS prestamo_id FROM reservas r LEFT JOIN prestamos p ON p.reserva_id = r.id WHERE r.codigo_reserva = $1`, [codigo])).rows[0];
  if (reserva) {
    const usuario = await datosUsuario(q, reserva.usuario_id);
    let valido = true, motivo = null;
    if (reserva.estado === 'retirada') { valido = false; motivo = 'Este QR de recojo ya se utilizó: los libros se entregaron el ' + fecha(reserva.fecha_retiro) + '.'; }
    else if (reserva.estado === 'cancelada') { valido = false; motivo = 'El estudiante canceló esta reserva.'; }
    else if (reserva.estado === 'vencida' || new Date(reserva.fecha_expiracion) <= new Date()) { valido = false; motivo = 'El QR venció el ' + fecha(reserva.fecha_expiracion) + '. Los ejemplares ya se liberaron.'; }
    return { tipo: 'reserva', valido, motivo, reserva, usuario, items: await itemsDe(q, reserva.id), politicas: pol };
  }
  const prestamo = (await q.query('SELECT * FROM prestamos WHERE codigo_prestamo = $1', [codigo])).rows[0];
  if (prestamo) {
    const usuario = await datosUsuario(q, prestamo.usuario_id);
    const items = (await itemsDe(q, prestamo.reserva_id)).map(i => ({ ...i, dias_retraso: i.estado === 'prestado' ? diasRetraso(i.fecha_limite_devol) : 0 }));
    const valido = prestamo.estado === 'activo';
    return { tipo: 'prestamo', valido, motivo: valido ? null : 'Este préstamo ya está cerrado: todos los ejemplares se devolvieron.', prestamo, usuario, items, politicas: pol };
  }
  return null;
}

async function datosUsuario(q, id){
  const u = (await q.query('SELECT id, nombres, apellidos, email, codigo_estudiante, activo FROM usuarios WHERE id = $1', [id])).rows[0];
  return { ...u, sancion_activa: await sancionActiva(q, id) };
}

/* ───────────── Entrega física (reserva → préstamo) ───────────── */
export async function entregarReserva(q, bibliotecario, reservaId, ip){
  const pol = await politicas(q);
  const r = (await q.query('SELECT * FROM reservas WHERE id = $1 FOR UPDATE', [reservaId])).rows[0];
  if (!r) throw noEncontrado('Reserva');
  if (r.estado === 'retirada') throw conflicto('Este QR ya se utilizó. Los libros ya se entregaron.');
  if (r.estado !== 'pendiente') throw conflicto(`La reserva está ${r.estado}; no se puede entregar.`);
  if (new Date(r.fecha_expiracion) <= new Date())
    throw conflicto('El QR venció antes de la entrega. Los ejemplares vuelven al catálogo automáticamente.');
  await q.query(`UPDATE reservas SET estado = 'retirada', fecha_retiro = now(), bibliotecario_id = $2 WHERE id = $1`, [r.id, bibliotecario.id]);
  const det = (await q.query(
    `UPDATE reserva_detalle SET estado = 'prestado', fecha_limite_devol = now() + make_interval(days => $2)
      WHERE reserva_id = $1 AND estado = 'reservado' RETURNING ejemplar_id, fecha_limite_devol`, [r.id, pol.dias_prestamo])).rows;
  if (!det.length) throw conflicto('La reserva no tiene ejemplares pendientes de entrega.');
  await q.query(`UPDATE ejemplares SET estado = 'prestado' WHERE id = ANY($1)`, [det.map(d => d.ejemplar_id)]);
  const prestamo = (await q.query(
    `INSERT INTO prestamos (reserva_id, usuario_id, bibliotecario_id, fecha_limite) VALUES ($1,$2,$3,$4) RETURNING *`,
    [r.id, r.usuario_id, bibliotecario.id, det[0].fecha_limite_devol])).rows[0];
  const items = await itemsDe(q, r.id);
  await notificar(q, {
    usuario_id: r.usuario_id, reserva_id: r.id, tipo: 'prestamo_registrado', asunto: 'Préstamo registrado',
    mensaje: `Recibiste: ${items.map(i => i.titulo).join('; ')}.\nDevuélvelos a más tardar el ${fecha(prestamo.fecha_limite)}. Para devolver, muestra en el mostrador el QR de tu préstamo (lo encuentras en «Mis préstamos»).`
  });
  await auditar(q, { usuario_id: bibliotecario.id, accion: 'ENTREGAR_RESERVA', entidad: 'prestamos', entidad_id: prestamo.id, ip,
    antes: { reserva_id: r.id, estado: 'pendiente' }, despues: { estado: 'retirada', codigo_prestamo: prestamo.codigo_prestamo, fecha_limite: prestamo.fecha_limite } });
  return { prestamo, items };
}

/* ───────────── Devolución total o parcial ───────────── */
export async function registrarDevolucion(q, bibliotecario, prestamoId, { items, sancion }, ip){
  const p = (await q.query('SELECT * FROM prestamos WHERE id = $1 FOR UPDATE', [prestamoId])).rows[0];
  if (!p) throw noEncontrado('Préstamo');
  if (p.estado !== 'activo') throw conflicto('Este préstamo ya está cerrado.');
  if (!Array.isArray(items) || !items.length) throw invalido('Marca al menos un ejemplar para devolver.');

  const vivos = (await q.query(
    `SELECT rd.*, l.titulo, e.codigo_inventario FROM reserva_detalle rd
       JOIN ejemplares e ON e.id = rd.ejemplar_id JOIN libros l ON l.id = e.libro_id
      WHERE rd.reserva_id = $1 AND rd.estado = 'prestado' FOR UPDATE OF rd`, [p.reserva_id])).rows;
  const porId = new Map(vivos.map(d => [d.id, d]));

  const incidencias = [], resumen = [];
  for (const it of items) {
    const d = porId.get(Number(it.detalle_id));
    if (!d) throw invalido('Uno de los ejemplares no pertenece a este préstamo o ya se devolvió.');
    const cond = CONDICIONES[it.condicion];
    if (!cond) throw invalido('Indica el estado físico de cada ejemplar: bueno, revisión, dañado o perdido.');
    const obs = it.observacion ? String(it.observacion).trim().slice(0, 500) : null;
    if ((it.condicion === 'danado' || it.condicion === 'perdido') && !obs) throw invalido(`Describe el ${it.condicion === 'danado' ? 'daño' : 'contexto de la pérdida'} de «${d.titulo}».`, { detalle_id: d.id });
    porId.delete(d.id);

    const retraso = diasRetraso(d.fecha_limite_devol);
    await q.query(
      `UPDATE reserva_detalle SET estado = $2, fecha_devolucion = now(), condicion_devolucion = $3, observacion = $4 WHERE id = $1`,
      [d.id, cond.detalle, it.condicion, obs]);
    await q.query('UPDATE ejemplares SET estado = $2 WHERE id = $1', [d.ejemplar_id, cond.ejemplar]);

    const nuevas = [];
    if (retraso > 0) nuevas.push(['retraso', `${retraso} día${retraso === 1 ? '' : 's'} de retraso`, retraso]);
    if (it.condicion === 'danado') nuevas.push(['danio', obs, 0]);
    if (it.condicion === 'perdido') nuevas.push(['perdida', obs, 0]);
    for (const [tipo, desc, dias] of nuevas) {
      const inc = (await q.query(
        `INSERT INTO incidencias (prestamo_id, reserva_detalle_id, usuario_id, bibliotecario_id, tipo, descripcion, dias_retraso)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [p.id, d.id, p.usuario_id, bibliotecario.id, tipo, `${d.titulo} (${d.codigo_inventario}): ${desc}`, dias])).rows[0];
      incidencias.push(inc);
    }
    resumen.push({ titulo: d.titulo, codigo: d.codigo_inventario, condicion: it.condicion, texto: cond.texto, retraso });
  }

  let sancionCreada = null;
  if (sancion && Number(sancion.dias) > 0) {
    const dias = Number(sancion.dias);
    if (!Number.isInteger(dias) || dias > 365) throw invalido('La suspensión debe ser de 1 a 365 días.');
    const motivo = String(sancion.motivo || incidencias.map(i => i.descripcion).join('; ') || 'Incidencia en devolución').slice(0, 500);
    sancionCreada = (await q.query(
      `INSERT INTO sanciones (usuario_id, bibliotecario_id, motivo, fecha_fin) VALUES ($1,$2,$3, now() + make_interval(days => $4)) RETURNING *`,
      [p.usuario_id, bibliotecario.id, motivo, dias])).rows[0];
    if (incidencias.length) await q.query('UPDATE incidencias SET sancion_id = $1 WHERE id = ANY($2)', [sancionCreada.id, incidencias.map(i => i.id)]);
    await auditar(q, { usuario_id: bibliotecario.id, accion: 'APLICAR_SANCION', entidad: 'sanciones', entidad_id: sancionCreada.id, ip, despues: { usuario_id: p.usuario_id, dias, motivo } });
  }

  const pendientes = porId.size;
  if (!pendientes) await q.query(`UPDATE prestamos SET estado = 'cerrado' WHERE id = $1`, [p.id]);

  const lineas = resumen.map(x => `• ${x.titulo} (${x.codigo}): ${x.texto}${x.retraso ? `, ${x.retraso} día${x.retraso === 1 ? '' : 's'} de retraso` : ''}.`);
  await notificar(q, {
    usuario_id: p.usuario_id, reserva_id: p.reserva_id, tipo: 'devolucion_registrada',
    asunto: pendientes ? 'Devolución parcial registrada' : 'Devolución registrada',
    mensaje: `Registramos tu devolución:\n${lineas.join('\n')}` +
      (pendientes ? `\nAún tienes ${pendientes} ejemplar${pendientes === 1 ? '' : 'es'} de este préstamo; el plazo sigue vigente.` : '\nTu préstamo quedó cerrado. ¡Gracias!') +
      (incidencias.length ? `\nSe registraron ${incidencias.length} incidencia${incidencias.length === 1 ? '' : 's'}.` : '') +
      (sancionCreada ? `\nSe aplicó una suspensión hasta el ${fecha(sancionCreada.fecha_fin)}.` : '')
  });
  if (sancionCreada) await notificar(q, {
    usuario_id: p.usuario_id, sancion_id: sancionCreada.id, tipo: 'sancion_aplicada', asunto: 'Suspensión temporal',
    mensaje: `No podrás hacer reservas hasta el ${fecha(sancionCreada.fecha_fin)}. Motivo: ${sancionCreada.motivo}`
  });
  await auditar(q, { usuario_id: bibliotecario.id, accion: pendientes ? 'DEVOLUCION_PARCIAL' : 'DEVOLUCION_TOTAL', entidad: 'prestamos', entidad_id: p.id, ip,
    despues: { items: resumen, incidencias: incidencias.map(i => i.id), sancion_id: sancionCreada?.id ?? null, pendientes } });

  return { cerrado: !pendientes, pendientes, resumen, incidencias, sancion: sancionCreada };
}

/* ───────────── Tareas programadas ───────────── */
export async function enviarRecordatorios(q){
  const pol = await politicas(q);
  const proximos = (await q.query(
    `SELECT rd.id, rd.fecha_limite_devol, r.usuario_id, r.id AS reserva_id, l.titulo
       FROM reserva_detalle rd JOIN reservas r ON r.id = rd.reserva_id
       JOIN ejemplares e ON e.id = rd.ejemplar_id JOIN libros l ON l.id = e.libro_id
      WHERE rd.estado = 'prestado'
        AND rd.fecha_limite_devol > now()
        AND rd.fecha_limite_devol <= now() + make_interval(hours => $1)
        AND NOT EXISTS (SELECT 1 FROM notificaciones n WHERE n.reserva_detalle_id = rd.id AND n.tipo = 'recordatorio_devolucion')`,
    [pol.horas_recordatorio])).rows;
  for (const d of proximos) await notificar(q, {
    usuario_id: d.usuario_id, reserva_id: d.reserva_id, reserva_detalle_id: d.id, tipo: 'recordatorio_devolucion',
    asunto: 'Mañana vence tu préstamo', mensaje: `«${d.titulo}» debe volver a la biblioteca a más tardar el ${fecha(d.fecha_limite_devol)}.`
  });

  const vencidos = (await q.query(
    `SELECT rd.id, rd.fecha_limite_devol, r.usuario_id, r.id AS reserva_id, l.titulo
       FROM reserva_detalle rd JOIN reservas r ON r.id = rd.reserva_id
       JOIN ejemplares e ON e.id = rd.ejemplar_id JOIN libros l ON l.id = e.libro_id
      WHERE rd.estado = 'prestado' AND rd.fecha_limite_devol <= now()
        AND NOT EXISTS (SELECT 1 FROM notificaciones n WHERE n.reserva_detalle_id = rd.id AND n.tipo = 'prestamo_vencido')`)).rows;
  for (const d of vencidos) await notificar(q, {
    usuario_id: d.usuario_id, reserva_id: d.reserva_id, reserva_detalle_id: d.id, tipo: 'prestamo_vencido',
    asunto: 'Préstamo vencido', mensaje: `El plazo de «${d.titulo}» venció el ${fecha(d.fecha_limite_devol)}. Devuélvelo cuanto antes; el retraso puede generar una suspensión.`
  });
  return proximos.length + vencidos.length;
}

export async function cumplirSanciones(q){
  const r = await q.query(`UPDATE sanciones SET estado = 'cumplida' WHERE estado = 'activa' AND fecha_fin <= now() RETURNING id`);
  return r.rowCount;
}
