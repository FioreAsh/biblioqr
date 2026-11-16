/* Panel general: indicadores, estado del fondo bibliográfico, más reservados y políticas de la biblioteca */
import { api } from '../api.js';
import { $, esc, plural } from '../util.js';
import { toast, conBoton, confirmar } from '../ui.js';

const ESTADOS = [['disponibles', 'Disponibles', '--st-disponible-dot'], ['reservados', 'Reservados', '--st-reservado-dot'], ['prestados', 'Prestados', '--st-prestado-dot'], ['mantenimiento', 'En mantenimiento', '--st-mantenimiento-dot'], ['perdidos', 'Perdidos', '--st-perdido-dot']];
const UNIDAD = { max_ejemplares: 'ejemplares', horas_recojo: 'horas', dias_prestamo: 'días', horas_recordatorio: 'horas', dias_sancion_por_dia_retraso: 'días', dias_sancion_danio: 'días', dias_sancion_perdida: 'días' };

export async function montar(el, ctx){
  const editable = ctx.puede('configuracion.gestionar');
  el.innerHTML = `<section class="wrap vista">
    <div class="vista__head"><div><p class="eyebrow">${esc(ctx.yo.usuario.rol_nombre)}</p><h1>Panel de la biblioteca</h1>
      <p class="vista__lead">Hola, ${esc(ctx.yo.usuario.nombres)}. Así está el fondo bibliográfico hoy.</p></div>
      <div class="vista__actions">${ctx.puede('libros.gestionar') ? '<a class="btn btn--primary" href="#/libros">Gestionar libros</a>' : ''}${ctx.puede('mostrador.operar') ? '<a class="btn btn--ghost" href="#/mostrador">Ir a mostrador</a>' : ''}</div></div>
    <div class="kpis" id="kpis" style="margin-top:24px"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
    <div class="cols cols--2"><section class="panel glass" id="fondo"></section><section class="panel glass" id="top"></section></div>
    <section class="panel glass" style="margin-top:20px" id="pol"></section>
  </section>`;

  try {
    const [r, pol] = await Promise.all([api.get('/admin/reportes/resumen'), api.get('/admin/configuracion')]);
    $('#kpis', el).innerHTML = [
      [r.libros, 'Títulos'], [r.ejemplares, 'Ejemplares'], [r.disponibles, 'Disponibles hoy'],
      [r.vencidos, 'Préstamos vencidos', r.vencidos ? 'danger' : ''], [r.suspendidos, 'Estudiantes suspendidos', r.suspendidos ? 'warn' : ''], [r.estudiantes, 'Estudiantes activos']
    ].map(([n, t, tono]) => `<div class="kpi glass" ${tono ? `data-tone="${tono}"` : ''}><b class="num">${n}</b><span>${t}</span></div>`).join('');

    const total = Math.max(1, r.ejemplares);
    $('#fondo', el).innerHTML = `<div class="panel__head"><h2>Estado de los ejemplares</h2><p class="num">${plural(r.ejemplares, 'ejemplar', 'ejemplares')}</p></div>
      <div class="stackbar" role="img" aria-label="${ESTADOS.map(([k, t]) => `${t}: ${r[k]}`).join(', ')}">${ESTADOS.filter(([k]) => r[k]).map(([k, t, c]) => `<i style="--c:var(${c});width:${(r[k] / total * 100).toFixed(2)}%" title="${t}: ${r[k]}"></i>`).join('')}</div>
      <div class="legend">${ESTADOS.map(([k, t, c]) => `<span style="--c:var(${c})">${t} <b class="num">${r[k]}</b></span>`).join('')}</div>
      <p class="small muted" style="margin-top:16px">Últimos 30 días: <b class="num">${r.reservas_30d}</b> reservas, <b class="num">${r.vencidas_30d}</b> vencieron sin recoger${r.reservas_30d ? ` (${Math.round(r.vencidas_30d / r.reservas_30d * 100)} %)` : ''}.</p>`;
    $('#top', el).innerHTML = `<div class="panel__head"><h2>Más solicitados</h2><p>Por reservas históricas</p></div>
      ${r.top.length ? `<ol class="list" style="padding-left:0">${r.top.map((l, i) => `<li><b class="num" style="font-family:var(--f-display);font-size:20px;width:22px;color:var(--gold)">${i + 1}</b><div class="list__txt"><div class="t-title">${esc(l.titulo)}</div><div class="t-sub">${esc(l.autor)}</div></div><span class="pill num">${plural(l.n, 'reserva', 'reservas')}</span></li>`).join('')}</ol>` : '<p class="muted small">Aún no hay reservas.</p>'}`;

    $('#pol', el).innerHTML = `<div class="panel__head"><h2>Políticas de la biblioteca</h2><p>${editable ? 'Los cambios aplican a las nuevas reservas, préstamos y sugerencias de sanción' : 'Solo el administrador puede modificarlas'}</p></div>
      <form class="form" id="f-pol" novalidate><div class="form__row form__row--3">${pol.map(p => `<label class="field"><span>${esc(p.descripcion)}</span><div style="display:flex;align-items:center;gap:8px"><input name="${p.clave}" type="number" class="num" value="${p.valor}" min="0" style="flex:1" ${editable ? '' : 'disabled'}><small>${UNIDAD[p.clave] || ''}</small></div></label>`).join('')}</div>
      ${editable ? '<p class="form__err" role="alert"></p><div class="form__foot"><button class="btn btn--primary" type="submit">Guardar políticas</button></div>' : ''}</form>`;
    if (editable) $('#f-pol', el).addEventListener('submit', async e => {
      e.preventDefault();
      const cuerpo = Object.fromEntries(pol.map(p => [p.clave, +e.target[p.clave].value]));
      try { await conBoton(e.target.querySelector('[type=submit]'), 'Guardando…', () => api.put('/admin/configuracion', cuerpo)); toast('Políticas actualizadas.'); e.target.querySelector('.form__err').textContent = ''; }
      catch (err) { e.target.querySelector('.form__err').textContent = err.message; }
    });

    // Modo demostración: devolver todo a los datos de prueba iniciales
    const salud = await api.get('/salud').catch(() => ({}));
    if (salud.modo_demo && editable) {
      el.querySelector('.vista').insertAdjacentHTML('beforeend', `<section class="panel glass" style="margin-top:20px"><div class="panel__head"><h2>Datos de demostración</h2><p>Este enlace es público y todos los visitantes comparten los mismos datos.</p></div>
        <div class="notice notice--info"><div style="flex:1">Si alguien dejó el catálogo desordenado, reinícialo: se borran reservas, préstamos, sanciones, libros nuevos y cambios, y vuelven los datos iniciales. Todas las sesiones abiertas se cierran.</div><button class="btn btn--danger" type="button" id="reiniciar">Reiniciar datos</button></div></section>`);
      $('#reiniciar', el).addEventListener('click', async ev => {
        if (!(await confirmar({ titulo: 'Reiniciar la demostración', texto: 'Se borra todo lo que hicieron los visitantes y vuelven los datos iniciales. Tendrás que volver a entrar.', accion: 'Reiniciar', tono: 'danger' }))) return;
        try { await conBoton(ev.target, 'Reiniciando…', () => api.post('/demo/reiniciar')); }
        catch (err) { toast(err.message, 'warn'); return; }
        toast('Datos reiniciados.');
        ctx.salir();
      });
    }
  } catch (e) {
    $('#kpis', el).innerHTML = `<div class="panel glass blank"><p>${esc(e.message)}</p></div>`;
  }
}
