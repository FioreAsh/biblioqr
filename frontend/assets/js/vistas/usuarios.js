/* Administración · Usuarios y roles: alta de personal, cambio de rol, activar/desactivar y matriz de permisos */
import { api } from '../api.js';
import { $, esc, fmtShort, hace, icono } from '../util.js';
import { toast, abrirFormulario, cerrarCapas, confirmar, errorEnFormulario, conBoton } from '../ui.js';

export async function montar(el, ctx){
  const st = { usuarios: [], roles: null, q: '', rol: '' };
  el.innerHTML = `<section class="wrap vista">
    <div class="vista__head"><div><p class="eyebrow">Administración</p><h1>Usuarios y roles</h1>
      <p class="vista__lead">Cada rol entra con sus propios permisos. Un cambio de rol cierra las sesiones abiertas de esa persona.</p></div>
      <div class="vista__actions"><button class="btn btn--primary" type="button" data-action="nuevo">${icono.mas} Nuevo usuario</button></div></div>
    <section class="panel glass" style="margin-top:24px">
      <div class="toolbar">
        <label class="field"><span>Buscar</span><input id="q" type="search" placeholder="Nombre, correo o código" autocomplete="off"></label>
        <div class="field field--narrow" style="flex:0 0 auto"><span>Rol</span><div class="segmented" id="roles-f" role="group" aria-label="Filtrar por rol">
          ${[['', 'Todos'], ['estudiante', 'Estudiantes'], ['bibliotecario', 'Bibliotecarios'], ['administrador', 'Administradores']].map(([v, t]) => `<button type="button" data-rol="${v}" aria-pressed="${v === ''}">${t}</button>`).join('')}</div></div>
      </div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th class="num">En uso</th><th>Último acceso</th><th><span class="sr">Acciones</span></th></tr></thead><tbody id="tbody"><tr><td colspan="6"><div class="skel"></div></td></tr></tbody></table></div>
    </section>
    <section class="panel glass" style="margin-top:20px" id="matriz"></section>
  </section>`;

  async function cargar(){
    const p = new URLSearchParams(); if (st.q) p.set('q', st.q); if (st.rol) p.set('rol', st.rol);
    st.usuarios = await api.get('/admin/usuarios?' + p);
    pintar();
  }
  function pintar(){
    const yo = ctx.yo.usuario.id;
    $('#tbody', el).innerHTML = st.usuarios.length ? st.usuarios.map(u => `<tr>
      <td><div class="t-title">${esc(u.nombres)} ${esc(u.apellidos)}${u.id === yo ? ' <span class="pill">Tú</span>' : ''}</div><div class="t-sub">${esc(u.email)}${u.codigo_estudiante ? ` · <span class="num">${esc(u.codigo_estudiante)}</span>` : ''}</div></td>
      <td><span class="role-chip" data-rol="${u.rol}">${esc(st.roles?.roles[u.rol]?.nombre || u.rol)}</span></td>
      <td>${!u.activo ? '<span class="pill">Desactivado</span>' : u.suspendido_hasta ? `<span class="pill pill--danger" title="Hasta ${esc(fmtShort(u.suspendido_hasta))}">Suspendido</span>` : '<span class="pill pill--ok">Activo</span>'}</td>
      <td class="num">${u.rol === 'estudiante' ? u.ejemplares_activos : '—'}</td>
      <td class="t-sub">${u.ultimo_acceso ? esc(hace(u.ultimo_acceso)) : 'Nunca'}</td>
      <td><div class="t-actions"><button class="btn btn--ghost btn--sm" type="button" data-action="editar" data-id="${u.id}">Editar</button></div></td></tr>`).join('')
      : '<tr><td colspan="6"><div class="blank"><p>Ningún usuario coincide.</p></div></td></tr>';
  }
  function pintarMatriz(){
    const { permisos, roles } = st.roles, claves = Object.keys(roles);
    $('#matriz', el).innerHTML = `<div class="panel__head"><h2>Permisos por rol</h2><p>Definidos en el backend (src/lib/permisos.js) y validados en cada ruta de la API</p></div>
      <div class="table-wrap"><table class="table matrix"><thead><tr><th>Permiso</th>${claves.map(r => `<th>${esc(roles[r].nombre)}</th>`).join('')}</tr></thead>
      <tbody>${Object.entries(permisos).map(([k, d]) => `<tr><td><div class="t-title">${esc(d)}</div><div class="t-sub num">${esc(k)}</div></td>${claves.map(r => `<td>${roles[r].permisos.includes(k) ? `<span class="check" aria-label="Sí">${icono.check}</span>` : '<span class="muted" aria-label="No">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function formUsuario(u){
    const nuevo = !u; u = u || { nombres: '', apellidos: '', email: '', rol: 'bibliotecario', codigo_estudiante: '', activo: true };
    const esYo = u.id === ctx.yo.usuario.id;
    const p = abrirFormulario(`<div class="panel__head"><h2 id="form-title">${nuevo ? 'Nuevo usuario' : 'Editar usuario'}</h2><p>${nuevo ? 'La persona entrará con un código enviado a este correo.' : esc(u.email)}</p></div>
      <form class="form" novalidate>
        <div class="form__row form__row--2"><label class="field"><span>Nombres</span><input name="nombres" required value="${esc(u.nombres)}" autofocus></label><label class="field"><span>Apellidos</span><input name="apellidos" required value="${esc(u.apellidos)}"></label></div>
        ${nuevo ? `<label class="field"><span>Correo</span><input name="email" type="email" required placeholder="nombre@biblioteca.edu.pe"></label>` : ''}
        <div class="form__row form__row--2">
          <label class="field"><span>Rol</span><select name="rol" ${esYo ? 'disabled' : ''}>${Object.entries(st.roles.roles).map(([k, r]) => `<option value="${k}" ${k === u.rol ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select>${esYo ? '<small>No puedes cambiar tu propio rol.</small>' : ''}</label>
          <label class="field"><span>Código de estudiante</span><input name="codigo_estudiante" class="num" value="${esc(u.codigo_estudiante || '')}"><small>Solo para estudiantes.</small></label>
        </div>
        ${nuevo ? '' : `<label class="switch"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''} ${esYo ? 'disabled' : ''}><span class="switch__track" aria-hidden="true"></span>Cuenta activa (si la desactivas, no podrá ingresar)</label>`}
        <p class="form__err" role="alert"></p>
        <div class="form__foot"><button class="btn btn--ghost" type="button" data-action="cerrar">Cancelar</button><button class="btn btn--primary" type="submit">${nuevo ? 'Crear usuario' : 'Guardar'}</button></div>
      </form>`);
    const f = p.querySelector('form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const cuerpo = { nombres: f.nombres.value, apellidos: f.apellidos.value, codigo_estudiante: f.codigo_estudiante.value || null };
      if (!esYo) cuerpo.rol = f.rol.value;
      if (nuevo) cuerpo.email = f.email.value;
      else if (!esYo) cuerpo.activo = f.activo.checked;
      if (!nuevo && !esYo && cuerpo.rol !== u.rol && !(await confirmar({ titulo: 'Cambiar rol', texto: `${u.nombres} pasará de ${st.roles.roles[u.rol].nombre} a ${st.roles.roles[cuerpo.rol].nombre}. Sus sesiones abiertas se cerrarán.`, accion: 'Cambiar rol' }))) { formUsuario(u); return; }
      try {
        await conBoton(f.querySelector('[type=submit]'), 'Guardando…', () => nuevo ? api.post('/admin/usuarios', cuerpo) : api.patch('/admin/usuarios/' + u.id, cuerpo));
        cerrarCapas(true); toast(nuevo ? 'Usuario creado.' : 'Cambios guardados.'); await cargar();
      } catch (err) {
        if (!document.contains(f)) { toast(err.message, 'warn'); return; }
        errorEnFormulario(f, { message: err.message, datos: { campo: err.datos.campo === 'correo' ? 'email' : err.datos.campo === 'código de estudiante' ? 'codigo_estudiante' : err.datos.campo } });
      }
    });
  }

  el.addEventListener('click', e => {
    const r = e.target.closest('[data-rol]');
    if (r && r.closest('#roles-f')) { st.rol = r.dataset.rol; el.querySelectorAll('#roles-f button').forEach(b => b.setAttribute('aria-pressed', String(b === r))); cargar(); return; }
    const t = e.target.closest('[data-action]'); if (!t) return;
    if (t.dataset.action === 'nuevo') formUsuario(null);
    if (t.dataset.action === 'editar') formUsuario(st.usuarios.find(u => u.id === +t.dataset.id));
  });
  let deb; $('#q', el).addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { st.q = e.target.value.trim(); cargar(); }, 220); });

  try { st.roles = await api.get('/admin/roles'); pintarMatriz(); await cargar(); }
  catch (e) { $('#tbody', el).innerHTML = `<tr><td colspan="6"><div class="blank"><p>${esc(e.message)}</p></div></td></tr>`; }
}
