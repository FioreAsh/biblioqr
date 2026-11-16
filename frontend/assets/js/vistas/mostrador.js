/* Módulo 3 · Mostrador: escanear QR, entregar reservas y registrar devoluciones con incidencias */
import { api } from '../api.js';
import { $, $$, esc, fmtDate, fmtShort, fmtCount, coverHTML, qrSVG, plural, icono, ESTADOS } from '../util.js';
import { toast, conBoton, confirmar } from '../ui.js';

const CONDS = [['bueno', 'Buen estado', 'ok'], ['revision', 'Requiere revisión', 'warn'], ['danado', 'Dañado', 'danger'], ['perdido', 'Perdido', 'danger']];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export async function montar(el, ctx){
  const st = { info: null, tablero: null, stream: null, loop: null, detector: null, buscando: false };
  const puedeEjemplares = ctx.puede('ejemplares.gestionar');

  el.innerHTML = `<section class="wrap vista">
    <div class="vista__head"><div><p class="eyebrow">Módulo 3 · Mostrador</p><h1>Entregas y devoluciones</h1>
      <p class="vista__lead">Escanea el QR del estudiante: el sistema reconoce si es un pase de recojo o un préstamo por devolver.</p></div></div>
    <div class="cols cols--2">
      <section class="panel glass scan" aria-labelledby="scan-t">
        <div class="panel__head" style="margin:0"><h2 id="scan-t">Escanear código</h2><p>Cámara, lector USB o pegando el código</p></div>
        <div class="scan__cam" id="cam"><div id="cam-msg" style="padding:20px;display:grid;gap:12px;justify-items:center">${icono.qr}<span>La cámara está apagada.</span><button class="btn btn--primary" type="button" data-action="camara">Activar cámara</button></div></div>
        <form class="scan__manual" id="manual" autocomplete="off"><label class="sr" for="codigo">Código QR</label><input id="codigo" name="codigo" placeholder="Pega o escanea el código (ej. 3f9c2b1e-…)" spellcheck="false" autofocus><button class="btn btn--primary" type="submit">Buscar</button></form>
        <p class="fhint">Los lectores USB escriben el código y presionan Enter solos: deja el cursor en este campo.</p>
      </section>
      <section class="panel glass" id="resultado" aria-live="polite"><div class="blank"><h3>Esperando un código</h3><p>Aquí verás al estudiante, sus ejemplares y la acción que corresponde.</p></div></section>
    </div>
    <div class="kpis" id="kpis" style="margin-top:24px"></div>
    <div class="cols cols--2" id="tablero"></div>
  </section>`;
  const res = $('#resultado', el);

  /* ───────── Cámara ───────── */
  async function cargarJsQR(){
    if (window.jsQR) return window.jsQR;
    await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; s.onload = ok; s.onerror = mal; document.head.append(s); });
    return window.jsQR;
  }
  async function encenderCamara(){
    if (!navigator.mediaDevices?.getUserMedia) { toast('Este navegador no permite usar la cámara. Usa el campo de código.', 'warn'); return; }
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch {
      toast('No se pudo abrir la cámara. Revisa el permiso del navegador o usa el lector.', 'warn'); return;
    }
    const cam = $('#cam', el);
    cam.innerHTML = `<video playsinline muted></video><div class="scan__frame" aria-hidden="true"></div><button class="btn btn--ghost btn--sm" type="button" data-action="apagar" style="position:absolute;right:12px;bottom:12px">Apagar cámara</button>`;
    const video = cam.querySelector('video');
    video.srcObject = st.stream; await video.play();
    let leer;
    if ('BarcodeDetector' in window) {
      st.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      leer = async () => (await st.detector.detect(video))[0]?.rawValue;
    } else {
      const jsQR = await cargarJsQR().catch(() => null);
      if (!jsQR) { toast('No se pudo cargar el lector de QR. Usa el campo de código.', 'warn'); apagarCamara(); return; }
      const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
      leer = () => {
        if (!video.videoWidth) return null;
        c.width = video.videoWidth; c.height = video.videoHeight; g.drawImage(video, 0, 0);
        return jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data;
      };
    }
    st.loop = setInterval(async () => {
      if (st.buscando) return;
      try { const v = await leer(); if (v && UUID.test(v)) { apagarCamara(); buscar(v.match(UUID)[0]); } } catch { /* fotograma ilegible */ }
    }, 220);
  }
  function apagarCamara(){
    clearInterval(st.loop); st.loop = null;
    st.stream?.getTracks().forEach(t => t.stop()); st.stream = null;
    const cam = $('#cam', el);
    if (cam) cam.innerHTML = `<div style="padding:20px;display:grid;gap:12px;justify-items:center">${icono.qr}<span>La cámara está apagada.</span><button class="btn btn--primary" type="button" data-action="camara">Activar cámara</button></div>`;
  }

  /* ───────── Búsqueda del código ───────── */
  async function buscar(codigo){
    const m = String(codigo).match(UUID);
    if (!m) { res.innerHTML = `<div class="notice notice--warn">${icono.alerta}<div><b>Código no reconocido</b>Eso no parece un código BiblioQR. Vuelve a escanear el QR del estudiante.</div></div>`; return; }
    st.buscando = true;
    res.innerHTML = '<div class="skel" style="min-height:220px"></div>';
    try {
      st.info = await api.get('/mostrador/qr/' + m[0].toLowerCase());
      pintarResultado();
    } catch (e) {
      res.innerHTML = `<div class="notice notice--danger">${icono.alerta}<div><b>${e.status === 404 ? 'QR no encontrado' : 'No se pudo validar'}</b>${esc(e.status === 404 ? 'Ese código no corresponde a ninguna reserva ni préstamo.' : e.message)}</div></div>`;
    } finally {
      st.buscando = false;
      $('#codigo', el).value = '';
    }
  }

  const whoHTML = u => `<div class="who-card"><span class="avatar" aria-hidden="true">${esc(u.nombres[0])}</span><div style="flex:1;min-width:0"><b>${esc(u.nombres)} ${esc(u.apellidos)}</b><div class="item__m num">${esc(u.codigo_estudiante || '')} · ${esc(u.email)}</div></div>${u.sancion_activa ? `<span class="pill pill--danger">Suspendido</span>` : `<span class="pill pill--ok">Al día</span>`}</div>`;
  const itemHTML = (i, extra = '') => `<li class="item">${coverHTML(i, 'sm')}<div class="item__txt"><div class="item__t">${esc(i.titulo)}</div><div class="item__m num">${esc(i.codigo_inventario)} · ${esc(i.ubicacion || '')}</div></div>${extra}</li>`;

  function pintarResultado(){
    const { tipo, valido, motivo, usuario, items } = st.info;
    if (tipo === 'reserva') {
      const r = st.info.reserva;
      res.innerHTML = `
        <div class="result-head"><span class="pill ${valido ? 'pill--ok' : 'pill--danger'}">${valido ? `${icono.check} QR de recojo válido` : 'QR no válido'}</span>${valido ? `<span class="muted small">Vence en <b class="num" data-countdown data-exp="${r.fecha_expiracion}">${fmtCount(new Date(r.fecha_expiracion) - Date.now())}</b></span>` : ''}</div>
        <h2 style="font-size:22px;margin:10px 0 12px">${valido ? 'Entregar reserva' : 'No se puede entregar'}</h2>
        ${whoHTML(usuario)}
        ${!valido ? `<div class="notice notice--danger" style="margin-top:12px">${icono.alerta}<div><b>${esc(motivo)}</b>Pide al estudiante que revise «Mis reservas» o que haga una nueva reserva.</div></div>` : ''}
        ${valido && usuario.sancion_activa ? `<div class="notice notice--warn" style="margin-top:12px">${icono.alerta}<div><b>El estudiante tiene una suspensión vigente</b>Hasta el ${esc(fmtDate(usuario.sancion_activa.fecha_fin))}. La reserva se hizo antes de la sanción; decide según la política de la biblioteca.</div></div>` : ''}
        <ul class="items">${items.map(i => itemHTML(i, `<span class="badge" data-estado="${i.ejemplar_estado}">${esc(ESTADOS[i.ejemplar_estado] || i.ejemplar_estado)}</span>`)).join('')}</ul>
        ${valido ? `<p class="fhint" style="margin-top:12px">Busca cada ejemplar por su código y ubicación, entrégalo al estudiante y confirma. El préstamo vence en ${st.info.politicas.dias_prestamo} días.</p>
          <div class="form__foot"><button class="btn btn--ghost" type="button" data-action="limpiar">Cancelar</button><button class="btn btn--primary btn--lg" type="button" data-action="entregar">Confirmar entrega física</button></div>` : `<div class="form__foot"><button class="btn btn--ghost" type="button" data-action="limpiar">Escanear otro</button></div>`}`;
      return;
    }
    // Préstamo → devolución
    const p = st.info.prestamo, pol = st.info.politicas;
    const vivos = items.filter(i => i.estado === 'prestado'), hechos = items.filter(i => i.estado !== 'prestado');
    res.innerHTML = `
      <div class="result-head"><span class="pill ${valido ? 'pill--info' : ''}">${valido ? 'Préstamo activo' : 'Préstamo cerrado'}</span><span class="muted small">Entregado el ${esc(fmtShort(p.fecha_entrega))} · límite ${esc(fmtDate(p.fecha_limite))}</span></div>
      <h2 style="font-size:22px;margin:10px 0 12px">${valido ? 'Registrar devolución' : 'Sin ejemplares pendientes'}</h2>
      ${whoHTML(usuario)}
      ${!valido ? `<div class="notice notice--info" style="margin-top:12px">${icono.info}<div>${esc(motivo)}</div></div>` : ''}
      <form id="f-dev" class="form" style="margin-top:14px" novalidate>
        ${vivos.map(i => `
          <div class="ret" data-on="true" data-id="${i.detalle_id}" data-retraso="${i.dias_retraso}">
            <div class="ret__top"><label><input type="checkbox" name="sel" value="${i.detalle_id}" checked>${coverHTML(i, 'sm')}<span class="item__txt"><span class="item__t" style="display:block">${esc(i.titulo)}</span><span class="item__m num">${esc(i.codigo_inventario)}</span></span></label>
              ${i.dias_retraso ? `<span class="pill pill--danger">${plural(i.dias_retraso, 'día', 'días')} de retraso</span>` : '<span class="pill pill--ok">A tiempo</span>'}</div>
            <div class="ret__body">
              <div class="segmented" role="group" aria-label="Estado físico de ${esc(i.titulo)}">${CONDS.map(([v, t, tono], k) => `<button type="button" data-cond="${v}" data-tone="${tono}" aria-pressed="${k === 0}">${t}</button>`).join('')}</div>
              <label class="field" hidden><span>Observación</span><textarea name="obs-${i.detalle_id}" rows="2" placeholder="Describe el daño o lo que debe revisarse"></textarea></label>
            </div>
          </div>`).join('')}
        ${hechos.length ? `<ul class="items">${hechos.map(i => itemHTML(i, `<span class="pill">${i.estado === 'perdido' ? 'Perdido' : 'Ya devuelto'}</span>`)).join('')}</ul>` : ''}
        ${vivos.length ? `
          <div id="sancion"></div>
          <p class="form__err" role="alert"></p>
          <div class="sum"><span class="muted small" id="sum-txt"></span><div style="display:flex;gap:10px"><button class="btn btn--ghost" type="button" data-action="limpiar">Cancelar</button><button class="btn btn--primary btn--lg" type="submit" id="btn-dev">Registrar devolución</button></div></div>` : `<div class="form__foot"><button class="btn btn--ghost" type="button" data-action="limpiar">Escanear otro</button></div>`}
      </form>`;
    if (vivos.length) actualizarDevolucion(pol);
  }

  /** Recalcula el resumen y la sanción sugerida según los ejemplares marcados y su estado físico. */
  function actualizarDevolucion(pol = st.info.politicas){
    const f = $('#f-dev', el); if (!f) return;
    const sel = $$('.ret', f).filter(r => r.dataset.on === 'true');
    let dias = 0; const motivos = [];
    sel.forEach(r => {
      const cond = r.querySelector('[aria-pressed="true"]').dataset.cond, ret = +r.dataset.retraso;
      const titulo = r.querySelector('.item__t').textContent;
      if (ret) { dias += ret * pol.dias_sancion_por_dia_retraso; motivos.push(`${titulo}: ${ret} d de retraso`); }
      if (cond === 'danado') { dias += pol.dias_sancion_danio; motivos.push(`${titulo}: daño`); }
      if (cond === 'perdido') { dias += pol.dias_sancion_perdida; motivos.push(`${titulo}: pérdida`); }
    });
    const total = $$('.ret', f).length;
    $('#sum-txt', el).textContent = sel.length === total ? `Devolución total · ${plural(sel.length, 'ejemplar', 'ejemplares')}` : `Devolución parcial · ${sel.length} de ${total}; el resto sigue prestado`;
    $('#btn-dev', el).disabled = !sel.length;
    const box = $('#sancion', el);
    const prev = box.querySelector('[name=aplicar]');
    const aplicar = prev ? prev.checked : false;
    box.innerHTML = dias ? `
      <div class="notice notice--warn"><span>${icono.alerta}</span><div style="flex:1;display:grid;gap:10px">
        <div><b>Se registrarán incidencias</b>Según las políticas, corresponde sugerir <b class="num">${plural(dias, 'día', 'días')}</b> de suspensión. La decisión es tuya.</div>
        <label class="switch"><input type="checkbox" name="aplicar" ${aplicar ? 'checked' : ''}><span class="switch__track" aria-hidden="true"></span>Aplicar suspensión temporal</label>
        <div class="form__row form__row--21" ${aplicar ? '' : 'hidden'} id="sancion-campos">
          <label class="field"><span>Motivo</span><input name="motivo" value="${esc(motivos.join('; '))}"></label>
          <label class="field"><span>Días</span><input name="dias" type="number" min="1" max="365" class="num" value="${dias}"></label>
        </div></div></div>` : '';
  }

  async function devolver(f){
    const items = $$('.ret', f).filter(r => r.dataset.on === 'true').map(r => ({
      detalle_id: +r.dataset.id,
      condicion: r.querySelector('[aria-pressed="true"]').dataset.cond,
      observacion: r.querySelector('textarea').value.trim() || undefined
    }));
    const falta = items.find(i => ['danado', 'perdido'].includes(i.condicion) && !i.observacion);
    if (falta) { const t = f.querySelector(`[name="obs-${falta.detalle_id}"]`); t.closest('.field').dataset.error = ''; t.focus(); f.querySelector('.form__err').textContent = 'Describe el daño o la pérdida antes de registrar.'; return; }
    const cuerpo = { items };
    if (f.aplicar?.checked) cuerpo.sancion = { dias: +f.dias.value, motivo: f.motivo.value };
    try {
      const r = await conBoton($('#btn-dev', el), 'Registrando…', () => api.post(`/mostrador/prestamos/${st.info.prestamo.id}/devolver`, cuerpo));
      res.innerHTML = `
        <div class="notice notice--ok">${icono.check}<div><b>${r.cerrado ? 'Devolución total registrada' : 'Devolución parcial registrada'}</b>${r.cerrado ? 'El préstamo quedó cerrado.' : `Quedan ${plural(r.pendientes, 'ejemplar', 'ejemplares')} en préstamo.`} El estudiante ya recibió la notificación.</div></div>
        <ul class="items">${r.resumen.map(x => `<li class="item"><div class="item__txt"><div class="item__t">${esc(x.titulo)}</div><div class="item__m num">${esc(x.codigo)}</div></div><span class="pill ${x.condicion === 'bueno' ? 'pill--ok' : x.condicion === 'revision' ? 'pill--warn' : 'pill--danger'}">${esc(x.texto)}</span></li>`).join('')}</ul>
        ${r.incidencias.length ? `<p class="small" style="margin-top:12px">${plural(r.incidencias.length, 'incidencia registrada', 'incidencias registradas')}${r.sancion ? ` · suspensión hasta el <b>${esc(fmtDate(r.sancion.fecha_fin))}</b>` : ''}.</p>` : ''}
        ${r.resumen.some(x => x.condicion !== 'bueno') ? '<p class="fhint" style="margin-top:6px">Los ejemplares dañados o en revisión quedan «en mantenimiento» y no se pueden reservar hasta que los liberes abajo.</p>' : ''}
        <div class="form__foot"><button class="btn btn--primary" type="button" data-action="limpiar">Siguiente estudiante</button></div>`;
      st.info = null; cargarTablero();
    } catch (e) {
      f.querySelector('.form__err').textContent = e.message;
    }
  }

  async function entregar(btn){
    try {
      const r = await conBoton(btn, 'Registrando…', () => api.post(`/mostrador/reservas/${st.info.reserva.id}/entregar`));
      res.innerHTML = `
        <div class="notice notice--ok">${icono.check}<div><b>Préstamo registrado</b>Devolución a más tardar el ${esc(fmtDate(r.prestamo.fecha_limite))}. El QR de recojo quedó invalidado.</div></div>
        <div class="passcard" style="padding:16px 0 0">
          <div><div class="qr-frame">${qrSVG(r.prestamo.codigo_prestamo)}</div></div>
          <div><p class="eyebrow">QR de devolución</p><p class="small" style="margin-top:6px">El estudiante lo tiene en «Mis reservas». Lo usará para devolver los libros.</p>
            <ul class="items">${r.items.map(i => itemHTML(i)).join('')}</ul></div>
        </div>
        <div class="form__foot"><button class="btn btn--primary" type="button" data-action="limpiar">Siguiente estudiante</button></div>`;
      st.info = null; cargarTablero();
    } catch (e) { toast(e.message, 'warn'); buscar(st.info.reserva.codigo_reserva); }
  }

  /* ───────── Tablero del día ───────── */
  async function cargarTablero(){
    try { st.tablero = await api.get('/mostrador/tablero'); pintarTablero(); }
    catch (e) { $('#tablero', el).innerHTML = `<div class="panel glass blank"><p>${esc(e.message)}</p></div>`; }
  }
  function pintarTablero(){
    const t = st.tablero;
    $('#kpis', el).innerHTML = [
      [t.por_recoger.length, 'Reservas por recoger'], [t.prestados, 'Ejemplares prestados'],
      [t.vencidos.length, 'Préstamos vencidos', t.vencidos.length ? 'danger' : ''], [t.mantenimiento.length, 'En revisión', t.mantenimiento.length ? 'warn' : ''],
      [t.hoy.entregas, 'Entregas hoy'], [t.hoy.devoluciones, 'Devoluciones hoy']
    ].map(([n, txt, tono]) => `<div class="kpi glass" ${tono ? `data-tone="${tono}"` : ''}><b class="num">${n}</b><span>${txt}</span></div>`).join('');
    $('#tablero', el).innerHTML = `
      <section class="panel glass"><div class="panel__head"><h2>Por recoger</h2><p>Ordenadas por vencimiento</p></div>
        ${t.por_recoger.length ? `<ul class="list">${t.por_recoger.map(r => `<li><span class="avatar" style="width:36px;height:36px;font-size:15px" aria-hidden="true">${esc(r.nombres[0])}</span><div class="list__txt"><b>${esc(r.nombres)} ${esc(r.apellidos)}</b><div class="item__m"><span class="num">${esc(r.codigo_estudiante || '')}</span> · ${plural(r.n, 'ejemplar', 'ejemplares')} · vence en <span class="num" data-countdown data-exp="${r.fecha_expiracion}"></span></div></div><button class="btn btn--ghost btn--sm" type="button" data-action="abrir" data-codigo="${r.codigo_reserva}">Abrir</button></li>`).join('')}</ul>` : '<p class="muted small">No hay reservas pendientes.</p>'}
      </section>
      <div style="display:grid;gap:20px">
        <section class="panel glass"><div class="panel__head"><h2>Préstamos vencidos</h2><p>Avisados por correo automáticamente</p></div>
          ${t.vencidos.length ? `<ul class="list">${t.vencidos.map(v => `<li><div class="list__txt"><b>${esc(v.titulo)}</b><div class="item__m">${esc(v.nombres)} ${esc(v.apellidos)} · <span class="num">${esc(v.codigo_inventario)}</span></div></div><span class="pill pill--danger">${plural(v.dias_retraso, 'día', 'días')}</span><button class="btn btn--ghost btn--sm" type="button" data-action="abrir" data-codigo="${v.codigo_prestamo}">Abrir</button></li>`).join('')}</ul>` : '<p class="muted small">Ningún préstamo vencido.</p>'}
        </section>
        <section class="panel glass"><div class="panel__head"><h2>En revisión</h2><p>No se pueden reservar hasta liberarlos</p></div>
          ${t.mantenimiento.length ? `<ul class="list">${t.mantenimiento.map(m => `<li><div class="list__txt"><b>${esc(m.titulo)}</b><div class="item__m"><span class="num">${esc(m.codigo_inventario)}</span> · ${esc(m.ubicacion || '')}${m.observacion ? ` · “${esc(m.observacion)}”` : ''}</div></div>${puedeEjemplares ? `<button class="btn btn--ok btn--sm" type="button" data-action="liberar" data-id="${m.id}">Disponible</button><button class="btn btn--ghost btn--sm" type="button" data-action="perdido" data-id="${m.id}">Baja</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Todos los ejemplares están en circulación.</p>'}
        </section>
      </div>`;
  }

  /* ───────── Eventos ───────── */
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-action]'); if (!t) return;
    const a = t.dataset.action;
    if (a === 'camara') encenderCamara();
    else if (a === 'apagar') apagarCamara();
    else if (a === 'limpiar') { st.info = null; res.innerHTML = '<div class="blank"><h3>Esperando un código</h3><p>Escanea el siguiente QR.</p></div>'; $('#codigo', el).focus(); }
    else if (a === 'entregar') entregar(t);
    else if (a === 'abrir') { buscar(t.dataset.codigo); res.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (a === 'liberar' || a === 'perdido') {
      if (a === 'perdido' && !(await confirmar({ titulo: 'Dar de baja el ejemplar', texto: 'Quedará como «perdido» y saldrá de circulación. Podrás reactivarlo desde «Libros» si aparece.', accion: 'Dar de baja', tono: 'danger' }))) return;
      try { await api.patch('/gestion/ejemplares/' + t.dataset.id, { estado: a === 'liberar' ? 'disponible' : 'perdido' }); toast(a === 'liberar' ? 'Ejemplar disponible otra vez en el catálogo.' : 'Ejemplar dado de baja.'); cargarTablero(); }
      catch (err) { toast(err.message, 'warn'); }
    }
  });
  el.addEventListener('change', e => {
    if (e.target.name === 'sel') { const r = e.target.closest('.ret'); r.dataset.on = String(e.target.checked); actualizarDevolucion(); }
    if (e.target.name === 'aplicar') $('#sancion-campos', el).hidden = !e.target.checked;
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-cond]'); if (!b) return;
    const g = b.parentElement; g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    const field = b.closest('.ret__body').querySelector('.field');
    field.hidden = b.dataset.cond === 'bueno';
    field.querySelector('span').textContent = b.dataset.cond === 'danado' ? 'Describe el daño (obligatorio)' : b.dataset.cond === 'perdido' ? 'Contexto de la pérdida (obligatorio)' : 'Qué debe revisarse (opcional)';
    delete field.dataset.error;
    actualizarDevolucion();
  });
  el.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'manual') buscar(e.target.codigo.value.trim());
    if (e.target.id === 'f-dev') devolver(e.target);
  });

  await cargarTablero();
  const sondeo = setInterval(() => { if (!document.hidden) cargarTablero(); }, 60_000);
  return () => { apagarCamara(); clearInterval(sondeo); };
}
