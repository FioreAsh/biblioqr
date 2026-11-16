/* Módulo 4 · Sanciones e incidencias: suspensiones vigentes, historial, incidencias de mostrador */
import { api } from '../api.js';
import { $, esc, fmtDate, fmtShort, plural, icono } from '../util.js';
import { toast, abrirFormulario, cerrarCapas, confirmar, errorEnFormulario, conBoton } from '../ui.js';

const TIPO = { retraso: ['Retraso', 'warn'], danio: ['Daño', 'danger'], perdida: ['Pérdida', 'danger'] };

export async function montar(el){
  const st = { tab: 'vigentes', datos: [] };
  el.innerHTML = `<section class="wrap vista">
    <div class="vista__head"><div><p class="eyebrow">Módulo 4</p><h1>Sanciones e incidencias</h1>
      <p class="vista__lead">Retrasos, daños y pérdidas registrados en mostrador. Una suspensión impide reservar hasta su fecha de fin.</p></div>
      <div class="vista__actions"><button class="btn btn--primary" type="button" data-action="nueva">${icono.mas} Aplicar suspensión</button></div></div>
    <section class="panel glass" style="margin-top:24px">
      <div class="segmented" role="tablist" aria-label="Vista" id="tabs" style="margin-bottom:16px">
        ${[['vigentes', 'Vigentes'], ['historial', 'Historial'], ['incidencias', 'Incidencias']].map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-pressed="${k === st.tab}" aria-selected="${k === st.tab}">${t}</button>`).join('')}
      </div>
      <div id="cuerpo"><div class="skel"></div></div>
    </section></section>`;

  async function cargar(){
    const c = $('#cuerpo', el);
    c.innerHTML = '<div class="skel"></div>';
    try {
      st.datos = await api.get(st.tab === 'incidencias' ? '/admin/incidencias' : `/admin/sanciones${st.tab === 'vigentes' ? '?estado=vigentes' : ''}`);
      pintar();
    } catch (e) { c.innerHTML = `<div class="blank"><p>${esc(e.message)}</p></div>`; }
  }

  function pintar(){
    const c = $('#cuerpo', el), d = st.datos;
    if (st.tab === 'incidencias') {
      c.innerHTML = d.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Estudiante</th><th>Tipo</th><th>Detalle</th><th>Sanción</th></tr></thead><tbody>${d.map(i => `<tr>
        <td class="t-sub" style="white-space:nowrap">${esc(fmtShort(i.fecha))}</td>
        <td><div class="t-title">${esc(i.nombres)} ${esc(i.apellidos)}</div><div class="t-sub num">${esc(i.codigo_estudiante || '')}</div></td>
        <td><span class="pill pill--${TIPO[i.tipo][1]}">${TIPO[i.tipo][0]}</span></td>
        <td>${esc(i.descripcion || '')}</td>
        <td class="t-sub">${i.sancion_id ? `Hasta ${esc(fmtShort(i.sancion_hasta))}${i.sancion_estado !== 'activa' ? ` (${esc(i.sancion_estado)})` : ''}` : 'Sin sanción'}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="blank"><h3>Sin incidencias</h3><p>Se registran solas al devolver con retraso, daño o pérdida.</p></div>';
      return;
    }
    c.innerHTML = d.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Estudiante</th><th>Motivo</th><th>Periodo</th><th>Estado</th><th><span class="sr">Acciones</span></th></tr></thead><tbody>${d.map(s => {
      const vigente = s.estado === 'activa' && new Date(s.fecha_fin) > new Date();
      return `<tr>
        <td><div class="t-title">${esc(s.nombres)} ${esc(s.apellidos)}</div><div class="t-sub num">${esc(s.codigo_estudiante || '')}</div></td>
        <td style="max-width:380px">${esc(s.motivo)}<div class="t-sub">${s.bib_nombres ? `Aplicada por ${esc(s.bib_nombres)} ${esc(s.bib_apellidos)}` : ''}</div></td>
        <td class="t-sub" style="white-space:nowrap">${esc(fmtShort(s.fecha_inicio))} → <b>${esc(fmtDate(s.fecha_fin))}</b></td>
        <td><span class="pill ${vigente ? 'pill--danger' : s.estado === 'levantada' ? 'pill--info' : ''}">${vigente ? 'Vigente' : s.estado === 'levantada' ? 'Levantada' : 'Cumplida'}</span></td>
        <td><div class="t-actions">${vigente ? `<button class="btn btn--ghost btn--sm" type="button" data-action="levantar" data-id="${s.id}">Levantar</button>` : ''}</div></td></tr>`;
    }).join('')}</tbody></table></div>`
      : `<div class="blank"><h3>${st.tab === 'vigentes' ? 'Nadie suspendido' : 'Sin sanciones registradas'}</h3><p>Las reservas vencidas sin recoger no generan sanción.</p></div>`;
  }

  async function nueva(){
    let estudiantes = [];
    try { estudiantes = await api.get('/admin/usuarios?rol=estudiante'); } catch (e) { toast(e.message, 'warn'); return; }
    const p = abrirFormulario(`<div class="panel__head"><h2 id="form-title">Aplicar suspensión</h2><p>El estudiante recibirá una notificación con el motivo.</p></div>
      <form class="form" novalidate>
        <label class="field"><span>Estudiante</span><select name="usuario_id" required autofocus><option value="">Elige un estudiante…</option>${estudiantes.filter(u => u.activo).map(u => `<option value="${u.id}">${esc(u.apellidos)}, ${esc(u.nombres)} · ${esc(u.codigo_estudiante || '')}${u.suspendido_hasta ? ' (ya suspendido)' : ''}</option>`).join('')}</select></label>
        <div class="form__row form__row--21"><label class="field"><span>Motivo</span><input name="motivo" required minlength="5" placeholder="Ej. Devolución con 5 días de retraso"></label><label class="field"><span>Días</span><input name="dias" type="number" min="1" max="365" value="7" class="num"></label></div>
        <p class="form__err" role="alert"></p>
        <div class="form__foot"><button class="btn btn--ghost" type="button" data-action="cerrar">Cancelar</button><button class="btn btn--danger" type="submit">Aplicar suspensión</button></div>
      </form>`);
    const f = p.querySelector('form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await conBoton(f.querySelector('[type=submit]'), 'Aplicando…', () => api.post('/admin/sanciones', { usuario_id: +f.usuario_id.value || null, motivo: f.motivo.value, dias: +f.dias.value }));
        cerrarCapas(true); toast('Suspensión aplicada y notificada.'); st.tab = 'vigentes'; marcarTab(); cargar();
      } catch (err) { errorEnFormulario(f, { message: err.message, datos: { campo: { estudiante: 'usuario_id', 'días': 'dias' }[err.datos.campo] || err.datos.campo } }); }
    });
  }

  const marcarTab = () => el.querySelectorAll('#tabs button').forEach(b => { const on = b.dataset.tab === st.tab; b.setAttribute('aria-pressed', on); b.setAttribute('aria-selected', on); });

  el.addEventListener('click', async e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { st.tab = tab.dataset.tab; marcarTab(); cargar(); return; }
    const t = e.target.closest('[data-action]'); if (!t) return;
    if (t.dataset.action === 'nueva') nueva();
    if (t.dataset.action === 'levantar') {
      const motivo = await confirmar({ titulo: 'Levantar suspensión', texto: 'El estudiante podrá volver a reservar de inmediato y recibirá una notificación.', accion: 'Levantar', campo: { label: 'Motivo (queda en auditoría)', placeholder: 'Ej. Repuso el ejemplar dañado' } });
      if (!motivo) return;
      try { await api.post(`/admin/sanciones/${t.dataset.id}/levantar`, { motivo }); toast('Suspensión levantada.'); cargar(); }
      catch (err) { toast(err.message, 'warn'); }
    }
  });
  await cargar();
}
