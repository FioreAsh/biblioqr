import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { HttpError } from '../lib/errores.js';
import { permisosDe } from '../lib/permisos.js';

export const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');

/** Exige un token Bearer válido y carga req.usuario y req.permisos. */
export async function autenticar(req, _res, next){
  try {
    const m = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization || '');
    if (!m) throw new HttpError(401, 'Inicia sesión para continuar.');
    const r = await db.query(
      `SELECT u.id, u.codigo_estudiante, u.nombres, u.apellidos, u.email, u.rol, u.activo, s.id AS sesion_id
         FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token_hash = $1 AND NOT s.revocada AND s.expira_en > now()`,
      [hashToken(m[1])]
    );
    const u = r.rows[0];
    if (!u) throw new HttpError(401, 'Tu sesión expiró. Vuelve a iniciar sesión.');
    if (!u.activo) throw new HttpError(403, 'Tu cuenta está desactivada. Acércate a la biblioteca.');
    req.usuario = u;
    req.permisos = permisosDe(u.rol);
    next();
  } catch (e) { next(e); }
}

/** Exige al menos uno de los permisos indicados. */
export const permitir = (...permisos) => (req, _res, next) => {
  if (permisos.some(p => req.permisos?.includes(p))) return next();
  next(new HttpError(403, 'Tu rol no tiene permiso para esta acción.'));
};
