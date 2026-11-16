/**
 * Cliente de la API REST. Guarda el token de sesión y traduce errores a ApiError.
 * Todas las vistas hablan con el backend solo a través de este módulo.
 */
const CLAVE = 'biblioqr.token';
let token = sessionStorage.getItem(CLAVE) || localStorage.getItem(CLAVE);
const alExpirar = new Set();

export class ApiError extends Error {
  constructor(status, datos){ super(datos?.error || 'No se pudo completar la operación.'); this.status = status; this.datos = datos || {}; }
}

export const sesion = {
  get token(){ return token; },
  guardar(t, recordar){ token = t; (recordar ? localStorage : sessionStorage).setItem(CLAVE, t); },
  borrar(){ token = null; sessionStorage.removeItem(CLAVE); localStorage.removeItem(CLAVE); },
  alExpirar(fn){ alExpirar.add(fn); }
};

async function pedir(metodo, ruta, cuerpo){
  let r;
  try {
    r = await fetch('/api' + ruta, {
      method: metodo,
      headers: { ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
  } catch {
    throw new ApiError(0, { error: 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.' });
  }
  const datos = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && token) { sesion.borrar(); alExpirar.forEach(fn => fn()); }
    throw new ApiError(r.status, datos);
  }
  return datos;
}

export const api = {
  get: ruta => pedir('GET', ruta),
  post: (ruta, cuerpo = {}) => pedir('POST', ruta, cuerpo),
  put: (ruta, cuerpo) => pedir('PUT', ruta, cuerpo),
  patch: (ruta, cuerpo) => pedir('PATCH', ruta, cuerpo),
  del: ruta => pedir('DELETE', ruta)
};
