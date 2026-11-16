/* Módulo 4 · Auditoría: quién hizo qué, cuándo y con qué datos antes/después */
import { api } from '../api.js';
import { $, esc, fmtDate } from '../util.js';

const ENTIDADES = ['', 'reservas', 'prestamos', 'libros', 'ejemplares', 'categorias', 'usuarios', 'sanciones', 'configuracion'];

export async function montar(el){
  const st = { entidad: '', accion: '' };
  el.innerHTML = `<section class="wrap vista">
    <div class="vista__head"><div><p class="eyebrow">Módulo 4</p><h1>Auditoría</h1>
      <p class="vista__lead">Bitácora inalterable de cada operación que cambia datos. «Sistema» son los procesos automáticos (vencimientos y recordatorios).</p></div></div>
    <section class="panel glass" style="margin-top:24px">
      <div class="toolbar">
        <label class="field field--narrow"><span>Entidad</span><select id="ent">${ENTIDADES.map(e => `<option value="${e}">${e ? e[0].toUpperCase() + e.slice(1) : 'Todas'}</option>`).join('')}</select></label>
        <label class="field field--narrow"><span>Acción</span><select id="acc"><option value="">Todas</option></select></label>
        <p class="count num" id="count" style="margin-left:auto"></p>
      </div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead><tbody id="tbody"><tr><td colspan="5"><div class="skel"></div></td></tr></tbody></table></div>
    </section></section>`;

  const json = v => v == null ? '<span class="muted small">—</span>' : `<pre class="json">${esc(JSON.stringify(v, null, 2))}</pre>`;

  async function cargar(){
    const p = new URLSearchParams(); if (st.entidad) p.set('entidad', st.entidad); if (st.accion) p.set('accion', st.accion);
    try {
      const { registros, acciones } = await api.get('/admin/auditoria?' + p);
      const sel = $('#acc', el);
      if (sel.options.length === 1) sel.insertAdjacentHTML('beforeend', acciones.map(a => `<option value="${a}">${a.replace(/_/g, ' ').toLowerCase()}</option>`).join(''));
      $('#count', el).textContent = `${registros.length} registros más recientes`;
      $('#tbody', el).innerHTML = registros.length ? registros.map(a => `<tr>
        <td class="t-sub" style="white-space:nowrap">${esc(fmtDate(a.fecha))}</td>
        <td>${a.usuario_id ? `<div class="t-title">${esc(a.nombres)} ${esc(a.apellidos)}</div><div class="t-sub">${esc(a.rol)}${a.ip ? ` · ${esc(a.ip)}` : ''}</div>` : '<span class="pill">Sistema</span>'}</td>
        <td><span class="pill pill--info" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px">${esc(a.accion)}</span></td>
        <td class="num">${esc(a.entidad)}${a.entidad_id ? ` #${a.entidad_id}` : ''}</td>
        <td style="min-width:240px">${a.datos_anteriores || a.datos_nuevos ? `<details class="audit"><summary>Ver datos</summary><div class="diff"><div><p class="eyebrow">Antes</p>${json(a.datos_anteriores)}</div><div><p class="eyebrow">Después</p>${json(a.datos_nuevos)}</div></div></details>` : '<span class="muted small">—</span>'}</td></tr>`).join('')
        : '<tr><td colspan="5"><div class="blank"><p>Sin registros con esos filtros.</p></div></td></tr>';
    } catch (e) { $('#tbody', el).innerHTML = `<tr><td colspan="5"><div class="blank"><p>${esc(e.message)}</p></div></td></tr>`; }
  }
  $('#ent', el).addEventListener('change', e => { st.entidad = e.target.value; cargar(); });
  $('#acc', el).addEventListener('change', e => { st.accion = e.target.value; cargar(); });
  await cargar();
}
