export class HttpError extends Error {
  constructor(status, mensaje, extra = {}){ super(mensaje); this.status = status; this.extra = extra; }
}
export const noEncontrado = (que = 'Recurso') => new HttpError(404, `${que} no encontrado.`);
export const conflicto = (m, extra) => new HttpError(409, m, extra);
export const invalido = (m, extra) => new HttpError(400, m, extra);

/** Express 4 no captura promesas rechazadas: envolvemos cada handler. */
export const ruta = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function manejadorErrores(err, req, res, _next){
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido.' });
  // Violaciones de restricciones de PostgreSQL → mensajes entendibles
  if (err?.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con ese valor (ISBN, correo, código o nombre repetido).', detalle: err.detail });
  if (err?.code === '23503') return res.status(409).json({ error: 'El registro está vinculado a otros datos y no se puede modificar de esa forma.' });
  if (err?.code === '23514') return res.status(400).json({ error: 'Algún valor no cumple las reglas de la base de datos.' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}
