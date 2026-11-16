/* Módulo 2 · Estudiante: reservas por recoger, préstamos activos con tiempo restante, historial y sanciones */
import { api } from '../api.js';
import { $, esc, fmtDate, fmtShort, fmtCount, qrSVG, coverHTML, plazo, plural, icono, ESTADOS } from '../util.js';
import { toast, abrirPase, confirmar, conBoton } from '../ui.js';

const ESTADO_RESERVA = { pendiente: ['Por recoger', 'warn'], retirada: ['Entregada', 'info'], vencida: ['Vencida', ''], cancelada: ['Cancelada', ''] };
const CONDICION = { bueno: 'Devuelto en buen estado', revision: 'Devuelto · en revisión', danado: 'Devuelto con daños', perdido: 'Reportado como perdido' };

export async function montar(el, ctx){
  let datos = null;
  el.innerHTML = `<section class="wrap vista"><div class="vista__head"><div><p class="eyebrow">Mi cuenta</p><h1>Mis reservas y préstamos</h1>
    <p class="vista__lead">Tu pase de recojo, el tiempo que te queda con cada libro y todo tu historial.</p></div>
    <div class="vista__actions"><a class="btn btn--primary" href="#/catalogo">Buscar libros</a></div></div>
    <div class="stack" id="cuerpo"><div class="skel" style="min-height:180px"></div><div class="skel" style="min-height:240px"></div></div></section>`;
  const cuerpo = $('#cuerpo', el);

  async function cargar(){
    try { datos = await api.get('/mi/resumen'); pintar(); }
    catch (e) { cuerpo.innerHTML = `<div class="panel glass blank"><h3>No se pudo cargar tu cuenta</h3><p>${esc(e.message)}</p></div>`; }
  }

  const itemHTML = (i, extra = '') => `<li class="item">${coverHTML(i, 'sm')}<div class="item__txt"><div class="item__t">${esc(i.titulo)}</div><div class="item__m num">${esc(i.codigo_inventario)} · ${esc(i.ubicacion || '')}</div></div>${extra}</li>`;

  function dueHTML(i, entrega){
    if (i.estado !== 'prestado') return `<div class="due" data-tone="done"><span class="due__txt">${esc(CONDICION[i.condicion_devolucion] || ESTADOS[i.estado] || i.estado)}</span><span class="t-sub">${i.fecha_devolucion ? fmtShort(i.fecha_devolucion) : ''}</span></div>`;
    const p = plazo(i.fecha_limite_devol, entrega);
    return `<div class="due" data-tone="${p.tono}" title="Fecha límite: ${esc(fmtDate(i.fecha_limite_devol))}"><span class="due__txt">${esc(p.texto)}</span><span class="due__bar" role="progressbar" aria-label="Tiempo de préstamo consumido" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.frac * 100)}"><i style="transform:scaleX(${p.frac.toFixed(3)})"></i></span><span class="t-sub">Hasta el ${esc(fmtDate(i.fecha_limite_devol))}</span></div>`;
  }

  function pintar(){
    const { pendientes, prestamos, historial, sanciones, sancion_activa, cupo, politicas } = datos;
    const ocupado = [...pendientes, ...prestamos].flatMap(x => x.items.filter(i => ['reservado', 'prestado'].includes(i.estado)).map(i => i.estado));
    const partes = [];

    if (sancion_activa) partes.push(`<div class="notice notice--danger">${icono.alerta}<div><b>Suspensión vigente hasta el ${esc(fmtDate(sancion_activa.fecha_fin))}</b>No puedes reservar mientras dure. Motivo: ${esc(sancion_activa.motivo)}</div></div>`);
    const vencidos = prestamos.flatMap(p => p.items).filter(i => i.estado === 'prestado' && i.dias_retraso > 0);
    if (vencidos.length) partes.push(`<div class="notice notice--warn">${icono.alerta}<div><b>Tienes ${plural(vencidos.length, 'libro vencido', 'libros vencidos')}</b>Devuélvelo${vencidos.length > 1 ? 's' : ''} cuanto antes en mostrador; el retraso puede generar una suspensión.</div></div>`);

    partes.push(`<div class="panel glass quota"><div style="flex:1;min-width:200px"><p class="eyebrow">Tu cupo</p><p style="margin-top:4px"><b class="num">${cupo.usado} de ${cupo.maximo}</b> ejemplares en uso · ${cupo.libre ? `puedes apartar ${plural(cupo.libre, 'más', 'más')}` : 'cupo completo'}</p></div>
      <div class="quota__bar" aria-hidden="true">${Array.from({ length: cupo.maximo }, (_, k) => `<i data-on="${ocupado[k] || ''}"></i>`).join('')}</div></div>`);

    // Reservas por recoger
    partes.push(`<section><div class="panel__head"><h2>Por recoger</h2><p>Presenta el QR en mostrador antes de que venza (${politicas.horas_recojo} h).</p></div>
      ${pendientes.length ? pendientes.map(r => `
        <article class="passcard glass">
          <div><div class="qr-frame">${qrSVG(r.codigo_reserva)}</div><p class="passcard__code num">${esc(r.codigo_reserva)}</p></div>
          <div>
            <span class="pill pill--warn">Pendiente de recojo</span>
            <h3 style="margin-top:8px">Reserva del ${esc(fmtDate(r.fecha_reserva))}</h3>
            <div class="passcard__time"><strong class="num" data-countdown data-exp="${r.fecha_expiracion}">${fmtCount(new Date(r.fecha_expiracion) - Date.now())}</strong><span class="muted">para recoger · vence el ${esc(fmtDate(r.fecha_expiracion))}</span></div>
            <ul class="items">${r.items.map(i => itemHTML(i)).join('')}</ul>
            <div class="passcard__actions"><button class="btn btn--primary" type="button" data-action="pase" data-id="${r.id}">${icono.qr} Mostrar pase</button><button class="btn btn--danger" type="button" data-action="cancelar" data-id="${r.id}">Cancelar reserva</button></div>
          </div>
        </article>`).join('') : `<div class="panel glass blank"><p>No tienes reservas pendientes.</p><a class="btn btn--ghost" href="#/catalogo">Ir al catálogo</a></div>`}
    </section>`);

    // Préstamos activos
    partes.push(`<section><div class="panel__head"><h2>Préstamos activos</h2><p>Para devolver, muestra en mostrador el QR del préstamo.</p></div>
      ${prestamos.length ? prestamos.map(p => `
        <article class="panel glass" style="margin-bottom:14px">
          <div class="result-head" style="justify-content:space-between">
            <div><p class="eyebrow">Préstamo · entregado el ${esc(fmtShort(p.fecha_entrega))}</p><h3 style="font-size:19px;margin-top:4px">${plural(p.items.filter(i => i.estado === 'prestado').length, 'libro por devolver', 'libros por devolver')}</h3></div>
            <button class="btn btn--primary" type="button" data-action="pase-prestamo" data-id="${p.id}">${icono.qr} QR de devolución</button>
          </div>
          <ul class="items">${p.items.map(i => itemHTML(i, dueHTML(i, p.fecha_entrega))).join('')}</ul>
        </article>`).join('') : `<div class="panel glass blank"><p>No tienes libros prestados ahora.</p></div>`}
    </section>`);

    // Historial y sanciones
    partes.push(`<div class="cols cols--2" style="margin-top:0">
      <section class="panel glass"><div class="panel__head"><h2>Historial</h2><p>${plural(historial.length, 'movimiento', 'movimientos')}</p></div>
        ${historial.length ? `<ul class="history">${historial.map(r => {
          const [txt, tono] = r.prestamo_id ? ['Préstamo cerrado', 'ok'] : ESTADO_RESERVA[r.estado];
          return `<li><div><div class="item__t">${esc(r.items.map(i => i.titulo).join(' · '))}</div><div class="item__m">${r.prestamo_id ? `Entregado el ${esc(fmtShort(r.fecha_entrega))}` : `Reservado el ${esc(fmtShort(r.fecha_reserva))}`}${r.items.some(i => i.condicion_devolucion && i.condicion_devolucion !== 'bueno') ? ' · con incidencias' : ''}</div></div><span class="pill ${tono ? 'pill--' + tono : ''}">${txt}</span></li>`;
        }).join('')}</ul>` : `<p class="muted small">Aquí aparecerán tus préstamos devueltos y reservas vencidas o canceladas.</p>`}
      </section>
      <section class="panel glass"><div class="panel__head"><h2>Sanciones</h2></div>
        ${sanciones.length ? `<ul class="history">${sanciones.map(s => `<li><div><div class="item__t">${esc(s.motivo)}</div><div class="item__m">${esc(fmtShort(s.fecha_inicio))} → ${esc(fmtShort(s.fecha_fin))}</div></div><span class="pill ${s.estado === 'activa' && new Date(s.fecha_fin) > new Date() ? 'pill--danger' : ''}">${s.estado === 'activa' && new Date(s.fecha_fin) > new Date() ? 'Vigente' : s.estado === 'levantada' ? 'Levantada' : 'Cumplida'}</span></li>`).join('')}</ul>`
          : `<p class="muted small">Sin sanciones. Las reservas que vencen sin recoger no generan sanción.</p>`}
      </section></div>`);

    cuerpo.innerHTML = partes.join('');
  }

  const ac = new AbortController();
  el.addEventListener('click', async ev => {
    const t = ev.target.closest('[data-action]'); if (!t || !datos) return;
    const id = +t.dataset.id;
    if (t.dataset.action === 'pase') {
      const r = datos.pendientes.find(x => x.id === id);
      abrirPase({ eyebrow: 'Reserva pendiente', titulo: 'Tu pase de recojo', codigo: r.codigo_reserva, expira: r.fecha_expiracion, items: r.items });
    } else if (t.dataset.action === 'pase-prestamo') {
      const p = datos.prestamos.find(x => x.id === id);
      const vivos = p.items.filter(i => i.estado === 'prestado');
      abrirPase({ eyebrow: 'Préstamo activo', titulo: 'QR de devolución', codigo: p.codigo_prestamo, items: vivos,
        nota: `Devuelve a más tardar el <b>${esc(fmtDate(p.fecha_limite))}</b>. Puedes devolver todos los libros o solo algunos.`,
        pista: 'El bibliotecario revisará cada ejemplar antes de registrar la devolución.' });
    } else if (t.dataset.action === 'cancelar') {
      const ok = await confirmar({ titulo: 'Cancelar reserva', texto: 'Los ejemplares vuelven al catálogo y tu pase QR deja de ser válido. No genera sanción.', accion: 'Sí, cancelar', tono: 'danger' });
      if (!ok) return;
      try { await conBoton(t, 'Cancelando…', () => api.post(`/mi/reservas/${id}/cancelar`)); toast('Reserva cancelada. Los ejemplares volvieron al catálogo.'); await cargar(); ctx.refrescarYo().catch(() => {}); }
      catch (e) { toast(e.message, 'warn'); }
    }
  }, { signal: ac.signal });

  await cargar();
  const sondeo = setInterval(() => { if (!document.hidden) cargar(); }, 60_000);
  return () => { ac.abort(); clearInterval(sondeo); };
}
