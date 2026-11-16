/**
 * Arranque del frontend: sesión, cabecera según el rol y router por hash con control de permisos.
 * Cada vista vive en /vistas y exporta montar(contenedor, ctx) → desmontar opcional.
 */
import { api, sesion, ApiError } from './api.js';
import { $, esc, icono } from './util.js';
import { cerrarCapas, tick, toast } from './ui.js';

const RUTAS = {
  '/mostrador':      { permiso: 'mostrador.operar',   tab: 'Mostrador',       carga: () => import('./vistas/mostrador.js') },
  '/panel':          { permiso: 'reportes.ver',       tab: 'Panel',           carga: () => import('./vistas/panel.js') },
  '/catalogo':       { permiso: 'catalogo.ver',       tab: 'Catálogo',        carga: () => import('./vistas/catalogo.js') },
  '/mi-cuenta':      { permiso: 'cuenta.propia',      tab: 'Mis reservas',    carga: () => import('./vistas/cuenta.js') },
  '/libros':         { permiso: 'libros.gestionar',   tab: 'Libros',          carga: () => import('./vistas/libros.js') },
  '/usuarios':       { permiso: 'usuarios.gestionar', tab: 'Usuarios',        carga: () => import('./vistas/usuarios.js') },
  '/sanciones':      { permiso: 'sanciones.gestionar',tab: 'Sanciones',       carga: () => import('./vistas/sanciones.js') },
  '/auditoria':      { permiso: 'auditoria.ver',      tab: 'Auditoría',       carga: () => import('./vistas/auditoria.js') },
  '/notificaciones': { permiso: 'cuenta.propia',      tab: null,              carga: () => import('./vistas/notificaciones.js') },
  '/ingresar':       { publica: true,                 tab: null,              carga: () => import('./vistas/login.js') }
};
const INICIO = { estudiante: '/catalogo', bibliotecario: '/mostrador', administrador: '/panel' };

export const ctx = {
  yo: null,                                   // { usuario, permisos, sancion_activa, no_leidas }
  puede: p => !!ctx.yo?.permisos.includes(p),
  navegar: ruta => { if (location.hash === '#' + ruta) enrutar(); else location.hash = ruta; },
  async refrescarYo(){ ctx.yo = await api.get('/auth/yo'); pintarCabecera(); return ctx.yo; },
  async entrar(datos, recordar){ sesion.guardar(datos.token, recordar); ctx.yo = datos; pintarCabecera(); ctx.navegar(INICIO[datos.usuario.rol]); },
  async salir(){
    try { await api.post('/auth/salir'); } catch { /* la sesión ya no existe */ }
    sesion.borrar(); ctx.yo = null; pintarCabecera(); ctx.navegar('/ingresar');
  },
  inicio: () => INICIO[ctx.yo?.usuario.rol] || '/ingresar'
};
window.BiblioQR = Object.assign(window.BiblioQR || {}, { ctx });

function pintarCabecera(){
  const top = $('#top');
  top.hidden = !ctx.yo;
  if (!ctx.yo) return;
  const { usuario: u, no_leidas } = ctx.yo;
  const actual = location.hash.slice(1).split('?')[0];
  $('#nav').innerHTML = Object.entries(RUTAS)
    .filter(([, r]) => r.tab && ctx.puede(r.permiso))
    .map(([ruta, r]) => `<a class="tab" href="#${ruta}" ${ruta === actual ? 'aria-current="page"' : ''}>${r.tab}</a>`).join('');
  $('#tools').innerHTML = `
    ${ctx.puede('cuenta.propia') ? `<a class="icon-btn icon-btn--ink bell" href="#/notificaciones" aria-label="Notificaciones${no_leidas ? `, ${no_leidas} sin leer` : ''}" ${actual === '/notificaciones' ? 'aria-current="page"' : ''}>${icono.campana}${no_leidas ? `<b class="num">${no_leidas > 9 ? '9+' : no_leidas}</b>` : ''}</a>` : ''}
    <div class="who"><b>${esc(u.nombres)} ${esc(u.apellidos.split(' ')[0])}</b><span class="role-chip" data-rol="${u.rol}">${esc(u.rol_nombre)}</span></div>
    <button class="icon-btn icon-btn--ink" type="button" data-action="salir" aria-label="Cerrar sesión" title="Cerrar sesión">${icono.salir}</button>`;
}

let desmontar = null, turno = 0;
async function enrutar(){
  const [ruta, query = ''] = location.hash.slice(1).split('?');
  const t = ++turno;
  cerrarCapas(true);
  if (!ctx.yo && ruta !== '/ingresar') return ctx.navegar('/ingresar');
  if (ctx.yo && (ruta === '/ingresar' || !RUTAS[ruta])) return ctx.navegar(ctx.inicio());
  const def = RUTAS[ruta];
  if (!def.publica && !ctx.puede(def.permiso)) {
    toast('Tu rol no tiene acceso a ese módulo.', 'warn');
    return ctx.navegar(ctx.inicio());
  }
  pintarCabecera();
  const mod = await def.carga();
  if (t !== turno) return;
  if (typeof desmontar === 'function') desmontar();
  // Contenedor nuevo en cada vista: así no sobreviven listeners de la vista anterior
  const viejo = $('#vista'), vista = viejo.cloneNode(false);
  viejo.replaceWith(vista);
  window.scrollTo(0, 0);
  desmontar = await mod.montar(vista, ctx, new URLSearchParams(query));
  document.title = `${def.tab || (ruta === '/notificaciones' ? 'Notificaciones' : 'Ingresar')} · BiblioQR`;
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-action="salir"]')) ctx.salir();
});
sesion.alExpirar(() => { ctx.yo = null; toast('Tu sesión terminó. Vuelve a ingresar.', 'warn'); ctx.navegar('/ingresar'); });
window.addEventListener('hashchange', enrutar);

(async function arrancar(){
  if (sesion.token) {
    try { ctx.yo = await api.get('/auth/yo'); }
    catch (e) { if (!(e instanceof ApiError) || e.status !== 401) toast(e.message, 'warn'); }
  }
  if (!location.hash || location.hash === '#/') location.hash = ctx.yo ? ctx.inicio() : '/ingresar';
  else enrutar();
  setInterval(tick, 1000);
})();
