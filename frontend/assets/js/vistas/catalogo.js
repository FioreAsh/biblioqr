/* Módulo 1 · Catálogo, filtros combinados, carrito de solicitud, reserva y libros similares */
import { api } from '../api.js';
import { $, $$, esc, norm, reduce, fmtDate, ESTADOS, coverHTML, autoresDe, qrSVG, icono, plural } from '../util.js';
import { toast, abrirCapa, cerrarCapas, abrirPase, onCerrarCapas } from '../ui.js';

export async function montar(el, ctx){
  const esEst = ctx.puede('reservas.crear');
  const store = { categorias: [], libros: [], ejemplares: [], etiquetas: [], libro_etiquetas: [], politicas: {}, resumen: null, carrito: [] };
  const ui = { cat: 0, q: '', autor: '', isbn: '', soloDisp: false, open: new Set(), busy: false, detailId: null, simCache: new Map() };
  const claveCarrito = `biblioqr.carrito.${ctx.yo.usuario.id}`;
  const ac = new AbortController();
  window.BiblioQR.store = store;

  /* ───────── Datos ───────── */
  const libroById = id => store.libros.find(l => l.id === id);
  const ejById = id => store.ejemplares.find(e => e.id === id);
  const ejsDe = id => store.ejemplares.filter(e => e.libro_id === id);
  const dispDe = id => ejsDe(id).filter(e => e.estado === 'disponible');
  const enCarrito = libroId => store.carrito.find(eid => ejById(eid)?.libro_id === libroId);
  const catDe = l => store.categorias.find(c => c.id === l.categoria_id) || { nombre: '' };
  const tagsDe = id => { const ids = store.libro_etiquetas.filter(x => x.libro_id === id).map(x => x.etiqueta_id); return store.etiquetas.filter(t => ids.includes(t.id)).map(t => t.nombre); };
  const cupoLibre = () => store.resumen ? store.resumen.cupo.libre : 0;
  const MAX = () => store.politicas.max_ejemplares || 3;
  const sancion = () => store.resumen?.sancion_activa;
  const cover = (l, size) => coverHTML(l, size, catDe(l).nombre);

  async function cargar(){
    const [cat, resumen] = await Promise.all([api.get('/catalogo'), esEst ? api.get('/mi/resumen') : null]);
    Object.assign(store, cat, { resumen });
    // El carrito sobrevive a recargas, pero solo con ejemplares que siguen disponibles
    const guardado = JSON.parse(sessionStorage.getItem(claveCarrito) || '[]');
    store.carrito = guardado.filter(id => ejById(id)?.estado === 'disponible').slice(0, cupoLibre());
    guardarCarrito();
  }
  const guardarCarrito = () => sessionStorage.setItem(claveCarrito, JSON.stringify(store.carrito));

  /* Similares en el carrito (misma fórmula que la consulta SQL v2, sumada sobre los libros elegidos) */
  function similaresCarrito(limit){
    const base = store.carrito.map(id => libroById(ejById(id).libro_id)), excl = new Set(base.map(b => b.id));
    const res = [];
    store.libros.forEach(l => {
      if (excl.has(l.id) || !dispDe(l.id).length) return;
      const tags = tagsDe(l.id), au = autoresDe(l);
      let score = 0; const comunes = []; let mismoAutor = false, mismaCat = false;
      base.forEach(b => {
        const sh = tagsDe(b.id).filter(t => tags.includes(t));
        score += sh.length * 3; sh.forEach(t => { if (!comunes.includes(t)) comunes.push(t); });
        if (b.categoria_id === l.categoria_id) { score += 2; mismaCat = true; }
        if (autoresDe(b).some(a => au.includes(a))) { score += 4; mismoAutor = true; }
      });
      if (score < 1) return;
      res.push({ libro: l, score, motivo: motivo(mismoAutor, comunes, mismaCat) });
    });
    return res.sort((x, y) => y.score - x.score || x.libro.titulo.localeCompare(y.libro.titulo, 'es')).slice(0, limit);
  }
  function motivo(mismoAutor, comunes, mismaCat){
    const p = [];
    if (mismoAutor) p.push('Mismo autor');
    if (comunes.length) p.push('Comparte: ' + comunes.slice(0, 2).join(', '));
    else if (mismaCat) p.push('Misma categoría');
    return p.join(' · ') || 'Otro título disponible';
  }
  window.BiblioQR.similares = similaresCarrito;

  /* ───────── Plantilla ───────── */
  const pol = () => store.politicas;
  el.innerHTML = `
    <section class="hero">
      <div class="wrap hero__in">
        <div>
          <span class="capsule"><i></i>Biblioteca Central · Catálogo en línea</span>
          <h1><span>Encuentra tu</span><em>próximo libro</em></h1>
          <p class="hero__lead" id="hero-lead"></p>
          <form class="finder" id="finder" role="search">
            <label class="finder__cell" for="q"><span>Búsqueda</span><input id="q" type="search" placeholder="Título, autor, ISBN o tema" autocomplete="off" spellcheck="false"></label>
            <label class="finder__cell" for="h-cat"><span>Categoría</span><select id="h-cat"></select></label>
            <label class="finder__cell" for="h-disp"><span>Disponibilidad</span><select id="h-disp"><option value="all">Todos los libros</option><option value="disp">Solo disponibles</option></select></label>
            <button class="finder__go" type="submit" aria-label="Ver resultados en el catálogo">${icono.lupa}</button>
          </form>
          <div class="hero__stats num" id="hero-stats"></div>
        </div>
        <aside class="pass-demo" id="hero-pass" aria-label="Tu pase QR"></aside>
      </div>
    </section>
    <div class="wrap cycle-wrap"><ol class="cycle glass" id="cycle" aria-label="Ciclo de un préstamo"></ol></div>
    <section class="wrap catalog" id="catalogo" aria-labelledby="cat-title">
      <div class="catalog__head"><h2 id="cat-title">Catálogo bibliográfico</h2><p class="count num" id="count" aria-live="polite"></p></div>
      <div id="avisos"></div>
      <div class="filters">
        <div class="chips" id="chips" role="group" aria-label="Filtrar por categoría"></div>
        <div class="fgrid">
          <label class="field"><span>Autor</span><input id="f-autor" type="search" list="autores" placeholder="Ej. Sommerville" autocomplete="off" spellcheck="false"></label>
          <label class="field"><span>ISBN</span><input id="f-isbn" class="num" type="search" inputmode="numeric" placeholder="Ej. 978-607" autocomplete="off"></label>
          <label class="switch"><input type="checkbox" id="solo"><span class="switch__track" aria-hidden="true"></span>Solo con ejemplares disponibles</label>
        </div>
        <datalist id="autores"></datalist>
        <p class="fhint">Los filtros se suman: búsqueda, categoría, autor e ISBN trabajan juntos.</p>
        <div class="active" id="active" aria-label="Filtros activos"></div>
      </div>
      <div class="layout"><div class="grid" id="grid"><div class="skel" style="min-height:260px"></div><div class="skel" style="min-height:260px"></div></div>
        <aside class="cart cart--aside glass" id="cart-aside" aria-label="Tu solicitud de reserva" ${esEst ? '' : 'hidden'}></aside></div>
    </section>
    <button class="fab" id="fab" data-action="abrir-carrito" ${esEst ? '' : 'hidden'}>${icono.libro} Mi solicitud <b class="num" id="fab-n">0</b></button>`;

  try { await cargar(); }
  catch (e) { $('#grid', el).innerHTML = `<div class="empty glass"><h3>No se pudo cargar el catálogo</h3><p>${esc(e.message)}</p><button class="btn btn--primary" type="button" data-action="reintentar">Reintentar</button></div>`; }

  /* ───────── Render: cabecera del catálogo ───────── */
  function renderHero(){
    $('#hero-lead', el).textContent = `Busca por título, autor o ISBN, aparta hasta ${pol().max_ejemplares} ejemplares y pasa por mostrador dentro de ${pol().horas_recojo} horas con tu código QR.`;
    $('#cycle', el).innerHTML = `
      <li><strong class="num">Hasta ${pol().max_ejemplares}</strong><span>ejemplares a la vez</span></li>
      <li><strong class="num">${pol().horas_recojo} h</strong><span>para recoger con tu QR</span></li>
      <li><strong class="num">${pol().dias_prestamo} días</strong><span>de préstamo calendario</span></li>
      <li><strong>Total o parcial</strong><span>devolución en mostrador</span></li>`;
    const pend = store.resumen?.pendientes?.[0];
    const aside = $('#hero-pass', el);
    if (pend) {
      aside.innerHTML = `<p class="eyebrow">Tu pase de recojo</p><div class="qr-frame">${qrSVG(pend.codigo_reserva)}</div>
        <div class="pass-demo__row"><span>Tiempo para recoger</span><strong class="num" data-countdown data-exp="${pend.fecha_expiracion}"></strong></div>
        <button class="btn btn--ghost btn--sm" type="button" data-action="ver-pase" style="margin-top:12px;width:100%">Ver pase completo</button>`;
    } else {
      aside.innerHTML = `<p class="eyebrow">Así se ve tu pase</p><div class="qr-frame">${qrSVG('3f9c2b1e-7a4d-4c58-9b0e-52d1a8f6c7e4')}</div>
        <div class="pass-demo__row"><span>Tiempo para recoger</span><strong class="num">${pol().horas_recojo}:00:00</strong></div><span class="pass-demo__tag">Ejemplo</span>`;
    }
    const av = [];
    if (!esEst) av.push(`<p class="role-note">Vista de ${esc(ctx.yo.usuario.rol_nombre.toLowerCase())}: consultas el catálogo y el estado físico de cada ejemplar.${ctx.puede('libros.gestionar') ? ' Para editar un libro abre su detalle o entra a «Libros».' : ' La entrega y la devolución se hacen en «Mostrador».'}</p>`);
    if (sancion()) av.push(`<div class="notice notice--danger" style="margin-top:14px">${icono.alerta}<div><b>Suspensión vigente hasta el ${esc(fmtDate(sancion().fecha_fin))}</b>Puedes consultar el catálogo, pero no reservar mientras dure. Motivo: ${esc(sancion().motivo)}</div></div>`);
    $('#avisos', el).innerHTML = av.join('');
  }

  /* ───────── Render: filtros y catálogo ───────── */
  function filtrados(){
    const q = norm(ui.q.trim()), qd = q.replace(/-/g, '');
    const au = norm(ui.autor.trim()), isbn = ui.isbn.replace(/[^\dxX]/g, '').toLowerCase();
    return store.libros.filter(l => {
      if (ui.cat && l.categoria_id !== ui.cat) return false;
      if (ui.soloDisp && !dispDe(l.id).length) return false;
      if (au && !norm(l.autor).includes(au)) return false;
      if (isbn && !l.isbn.replace(/-/g, '').toLowerCase().includes(isbn)) return false;
      if (!q) return true;
      const hay = norm(`${l.titulo} ${l.autor} ${l.editorial} ${l.isbn} ${tagsDe(l.id).join(' ')}`);
      return hay.includes(q) || (/^[\d-]+$/.test(q) && l.isbn.replace(/-/g, '').includes(qd));
    });
  }

  function renderChips(){
    const all = `<button type="button" class="chip" data-action="set-cat" data-cat="0" aria-pressed="${ui.cat === 0}">Todas <i class="num">${store.libros.length}</i></button>`;
    $('#chips', el).innerHTML = all + store.categorias.map(c => {
      const n = store.libros.filter(l => l.categoria_id === c.id).length;
      return `<button type="button" class="chip" data-action="set-cat" data-cat="${c.id}" aria-pressed="${ui.cat === c.id}" title="${esc(c.descripcion || '')}">${esc(c.nombre)} <i class="num">${n}</i></button>`;
    }).join('');
  }

  function renderActive(){
    const it = [];
    if (ui.q.trim()) it.push(['q', `Búsqueda: “${ui.q.trim()}”`]);
    if (ui.cat) it.push(['cat', `Categoría: ${store.categorias.find(c => c.id === ui.cat)?.nombre}`]);
    if (ui.autor.trim()) it.push(['autor', `Autor: ${ui.autor.trim()}`]);
    if (ui.isbn.trim()) it.push(['isbn', `ISBN: ${ui.isbn.trim()}`]);
    if (ui.soloDisp) it.push(['solo', 'Solo disponibles']);
    $('#active', el).innerHTML = it.length
      ? it.map(([k, t]) => `<button class="tag" type="button" data-action="quitar-filtro" data-k="${k}" aria-label="Quitar filtro ${esc(t)}">${esc(t)}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`).join('') + `<button class="link" type="button" data-action="reset">Limpiar todo</button>`
      : '';
  }

  function syncControls(){
    const set = (s, v) => { const x = $(s, el); if (x.value !== v) x.value = v; };
    set('#q', ui.q); set('#f-autor', ui.autor); set('#f-isbn', ui.isbn);
    set('#h-cat', String(ui.cat)); set('#h-disp', ui.soloDisp ? 'disp' : 'all');
    $('#solo', el).checked = ui.soloDisp;
  }

  const lleno = () => store.carrito.length >= cupoLibre();
  const bloqueado = () => !!sancion();

  function botonAgregar(l, pfx, sm){
    if (!esEst) return ctx.puede('libros.gestionar') && !sm ? `<a class="btn btn--ghost" href="#/libros?editar=${l.id}">Editar libro</a>` : '';
    const disp = dispDe(l.id), mine = enCarrito(l.id), s = sm ? ' btn--sm' : '';
    if (mine) return `<button class="btn btn--ok${s}" type="button" data-action="quitar-libro" data-id="${l.id}" data-fk="${pfx}add-${l.id}">${icono.check}${sm ? 'En solicitud' : 'En tu solicitud'}</button>`;
    if (!disp.length) return `<button class="btn btn--ghost${s}" type="button" disabled>No disponible</button>`;
    return `<button class="btn btn--primary${s}" type="button" data-action="agregar" data-id="${l.id}" data-fk="${pfx}add-${l.id}" ${(lleno() || bloqueado()) ? 'aria-disabled="true"' : ''}>${sm ? 'Agregar' : pfx === 'd' ? 'Agregar a mi solicitud' : 'Agregar'}</button>`;
  }

  function ejRows(l, pfx){
    const mine = enCarrito(l.id);
    return ejsDe(l.id).map(e => {
      let b = '';
      if (esEst && e.estado === 'disponible') b = store.carrito.includes(e.id)
        ? `<button class="btn btn--ok" type="button" disabled>Elegido</button>`
        : `<button class="btn btn--ghost" type="button" data-action="elegir" data-id="${l.id}" data-ej="${e.id}" data-fk="${pfx}ej-${e.id}" ${((!mine && lleno()) || bloqueado()) ? 'aria-disabled="true"' : ''}>Elegir</button>`;
      return `<li class="ej__row"><div><div class="ej__code num">${esc(e.codigo_inventario)}</div><div class="ej__loc">${esc(e.ubicacion || '')}</div></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end"><span class="badge" data-estado="${e.estado}">${ESTADOS[e.estado]}</span>${b}</div></li>`;
    }).join('');
  }

  function cardHTML(l){
    const ejs = ejsDe(l.id), disp = ejs.filter(e => e.estado === 'disponible'), open = ui.open.has(l.id);
    return `<article class="book glass" data-id="${l.id}" data-open="${open}">
      <div class="book__top"><span class="cat-badge">${esc(catDe(l).nombre)}</span><button class="eye" type="button" data-action="detalles" data-id="${l.id}" aria-label="Ver detalles de ${esc(l.titulo)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>Detalles</button></div>
      <div class="book__head">${cover(l)}<div class="book__txt"><h3>${esc(l.titulo)}</h3><p class="book__author">${esc(l.autor)}</p><div class="book__meta"><span class="num">ISBN ${esc(l.isbn)}</span><span>${esc(l.editorial || '')}${l.anio_publicacion ? ` · <span class="num">${l.anio_publicacion}</span>` : ''}</span></div></div></div>
      <div class="avail ${disp.length ? 'avail--ok' : 'avail--none'}">
        <span class="dots" aria-hidden="true">${ejs.map(e => `<span class="dot" data-estado="${e.estado}" title="${esc(e.codigo_inventario)}: ${ESTADOS[e.estado]}"></span>`).join('')}</span>
        <span class="avail__txt num">${disp.length ? `${disp.length} de ${ejs.length} disponibles` : ejs.length ? 'Sin ejemplares disponibles' : 'Sin ejemplares registrados'}</span>
      </div>
      <div class="book__actions">
        <button class="btn btn--ghost" type="button" data-action="toggle-ej" aria-expanded="${open}"><span>Ejemplares</span><svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        ${botonAgregar(l, '')}
      </div>
      <div class="ej" ${open ? '' : 'inert'}><div class="ej__in"><div class="ej__box"><ul class="ej__list">${ejRows(l, '')}</ul></div></div></div>
    </article>`;
  }

  function renderGrid(){
    const list = filtrados();
    const filtrado = ui.q.trim() || ui.cat || ui.autor.trim() || ui.isbn.trim() || ui.soloDisp;
    $('#count', el).textContent = filtrado ? `${list.length} de ${store.libros.length} títulos` : `${list.length} títulos`;
    renderActive(); syncControls();
    $('#grid', el).innerHTML = list.length ? list.map(cardHTML).join('') : `<div class="empty glass"><h3>Sin resultados</h3><p>Ningún título cumple todos los filtros activos. Quita alguno para ampliar la búsqueda.</p><button class="btn btn--primary" type="button" data-action="reset">Limpiar filtros</button></div>`;
    const disp = store.ejemplares.filter(e => e.estado === 'disponible').length;
    $('#hero-stats', el).innerHTML = `<div><b>${store.libros.length}</b><span>Títulos</span></div><div><b>${disp}</b><span>Ejemplares disponibles hoy</span></div><div><b>${pol().dias_prestamo} días</b><span>de préstamo</span></div>`;
  }

  /* ───────── Detalle + similares (consulta SQL v2 en el servidor) ───────── */
  async function cargarSimilares(id){
    if (!ui.simCache.has(id)) ui.simCache.set(id, api.get(`/catalogo/libros/${id}/similares`).catch(e => ({ error: e.message })));
    const sim = await ui.simCache.get(id);
    if (ui.detailId !== id) return;
    const box = $('#sim-box');
    if (!box) return;
    if (sim.error) { box.innerHTML = `<p class="fhint" style="margin-top:8px">${esc(sim.error)}</p>`; return; }
    const tagsBase = tagsDe(id);
    box.innerHTML = sim.length ? `<ul class="simlist">${sim.map(r => {
      const x = libroById(r.id) || r, n = dispDe(r.id).length || r.disponibles;
      const comunes = tagsDe(r.id).filter(t => tagsBase.includes(t));
      return `<li class="reco__item">${cover(x, 'sm')}<div class="reco__txt"><button class="reco__t" type="button" data-action="detalles" data-id="${r.id}">${esc(x.titulo)}</button><span>${esc(x.autor)}</span><span class="ok num">${plural(n, 'ejemplar disponible', 'ejemplares disponibles')}</span><span>${esc(motivo(r.mismo_autor, comunes, r.misma_categoria))} · <span class="num">${r.puntaje} pts</span></span></div><div class="reco__btns"><button class="btn btn--ghost btn--sm" type="button" data-action="detalles" data-id="${r.id}">Ver detalle</button>${botonAgregar(x, 's', true)}</div></li>`;
    }).join('')}</ul>` : `<p class="fhint" style="margin-top:8px">No hay otros títulos con ejemplares disponibles por ahora.</p>`;
  }

  function renderDetalle(){
    const l = libroById(ui.detailId); if (!l) return;
    const disp = dispDe(l.id), total = ejsDe(l.id).length;
    $('#detail-panel').innerHTML = `
      <button class="icon-btn layer__x" data-action="cerrar" aria-label="Cerrar">${icono.x}</button>
      <div class="detail__grid">
        <div class="detail__cover">${cover(l, 'lg')}</div>
        <div class="detail__main">
          <span class="cat-badge">${esc(catDe(l).nombre)}</span>
          <h2 id="det-title">${esc(l.titulo)}</h2>
          <p class="detail__author">${esc(l.autor)}</p>
          <dl class="facts">
            <div><dt>ISBN</dt><dd class="num">${esc(l.isbn)}</dd></div>
            <div><dt>Editorial</dt><dd>${esc(l.editorial || '—')}</dd></div>
            <div><dt>Año de publicación</dt><dd class="num">${l.anio_publicacion || '—'}</dd></div>
            <div><dt>Categoría</dt><dd>${esc(catDe(l).nombre)}</dd></div>
          </dl>
          ${l.descripcion ? `<p class="detail__desc">${esc(l.descripcion)}</p>` : ''}
          <div class="tagrow">${tagsDe(l.id).map(t => `<span class="tag-static">${esc(t)}</span>`).join('')}</div>
          <div class="detail__cta"><span class="avail ${disp.length ? 'avail--ok' : 'avail--none'}"><span class="avail__txt num">${disp.length ? `${disp.length} de ${total} disponibles` : 'Sin ejemplares disponibles'}</span></span>${botonAgregar(l, 'd')}</div>
        </div>
      </div>
      <section class="detail__sec"><h3>Ejemplares físicos</h3><ul class="ej__list" style="margin-top:10px">${ejRows(l, 'd')}</ul></section>
      <section class="detail__sec"><h3>Libros similares disponibles</h3><div id="sim-box"><ul class="simlist">${'<li class="skel"></li>'.repeat(3)}</ul></div></section>`;
    cargarSimilares(l.id);
  }

  /* ───────── Carrito ───────── */
  function ocupados(){
    const r = store.resumen; if (!r) return [];
    return [...r.pendientes, ...r.prestamos].flatMap(x => x.items.filter(i => ['reservado', 'prestado'].includes(i.estado)).map(i => ({ titulo: i.titulo, estado: i.estado })));
  }
  function recoHTML(){
    if (!store.carrito.length || lleno()) return '';
    const rec = similaresCarrito(3);
    if (!rec.length) return '';
    return `<section class="reco" aria-label="Libros similares"><h3>Te puede interesar</h3><ul class="simlist">${rec.map(r => `<li class="reco__item">${cover(r.libro, 'sm')}<div class="reco__txt"><button class="reco__t" type="button" data-action="detalles" data-id="${r.libro.id}">${esc(r.libro.titulo)}</button><span>${esc(r.motivo)}</span></div><button class="icon-btn reco__add" type="button" data-action="agregar" data-id="${r.libro.id}" data-fk="radd-${r.libro.id}" aria-label="Agregar ${esc(r.libro.titulo)}">${icono.mas}</button></li>`).join('')}</ul></section>`;
  }
  function cartHTML(){
    const max = MAX(), occ = ocupados(), n = store.carrito.length, usados = occ.length + n;
    const items = occ.map(o => `<li class="slot slot--full" style="opacity:.75"><div class="slot__txt"><div class="slot__title">${esc(o.titulo)}</div><div class="slot__meta">${o.estado === 'prestado' ? 'En préstamo' : 'Reservado, por recoger'}</div></div><span class="badge" data-estado="${o.estado}">${ESTADOS[o.estado]}</span></li>`);
    store.carrito.forEach(eid => {
      const e = ejById(eid), l = libroById(e.libro_id);
      items.push(`<li class="slot slot--full"><div class="slot__txt"><div class="slot__title">${esc(l.titulo)}</div><div class="slot__meta num">${esc(e.codigo_inventario)} · ${esc(e.ubicacion || '')}</div></div><button class="icon-btn" type="button" data-action="quitar" data-ej="${eid}" aria-label="Quitar ${esc(l.titulo)}">${icono.x}</button></li>`);
    });
    for (let i = usados; i < max; i++) items.push(`<li class="slot slot--empty">Espacio libre ${i + 1} de ${max}</li>`);
    return `
      <div class="cart__head"><h2>Tu solicitud</h2><span class="cart__n num" aria-label="${usados} de ${max} ejemplares">${usados} / ${max}</span></div>
      <div class="cart__bar ${usados >= max ? 'full' : ''}" aria-hidden="true" style="grid-template-columns:repeat(${max},1fr)">${Array.from({ length: max }, (_, i) => `<i data-on="${i < usados}"></i>`).join('')}</div>
      ${bloqueado() ? `<p class="cart__warn" role="status">Tienes una suspensión vigente: no puedes reservar hasta el ${esc(fmtDate(sancion().fecha_fin))}.</p>` : ''}
      ${!n && !bloqueado() ? `<p class="cart-empty">${cupoLibre() ? `Elige hasta ${plural(cupoLibre(), 'ejemplar', 'ejemplares')} del catálogo.` : 'Tus espacios están ocupados por préstamos o reservas. Devuelve un libro para reservar otro.'}</p>` : ''}
      <ul class="slots">${items.join('')}</ul>
      ${n && lleno() ? `<p class="cart__warn" role="status">Llegaste al máximo de ${max} ejemplares a la vez. Quita uno si quieres cambiarlo por otro.</p>` : ''}
      <button class="btn btn--primary" type="button" data-action="confirmar" ${(!n || ui.busy || bloqueado()) ? 'disabled' : ''}>${ui.busy ? 'Apartando ejemplares…' : 'Confirmar reserva'}</button>
      ${recoHTML()}
      <ul class="rules">
        <li>Se aparta un ejemplar físico por título.</li>
        <li>Tu QR es válido ${pol().horas_recojo} horas desde la confirmación.</li>
        <li>Si no recoges a tiempo, la reserva vence sin sanción.</li>
      </ul>`;
  }
  function renderCart(){
    if (!esEst) return;
    const h = cartHTML();
    $('#cart-aside', el).innerHTML = h; $('#cart-sheet').innerHTML = h;
    $('#fab-n', el).textContent = `${ocupados().length + store.carrito.length}/${MAX()}`;
  }

  function refresh(){
    const a = document.activeElement, fk = a?.dataset?.fk;
    renderHero(); renderGrid(); renderCart();
    if (ui.detailId && $('#layer-detail').dataset.open === 'true') renderDetalle();
    if (fk) { const x = document.querySelector(`[data-fk="${fk}"]`); if (x) x.focus({ preventScroll: true }); }
  }

  function agregar(libroId, ejId){
    if (!esEst) return;
    if (bloqueado()) { toast('Tienes una suspensión vigente. No puedes reservar por ahora.', 'warn'); return; }
    const libro = libroById(libroId);
    const ej = ejId ? ejById(ejId) : dispDe(libroId)[0];
    if (!ej || ej.estado !== 'disponible') { toast('Ese ejemplar ya no está disponible.', 'warn'); return; }
    const actual = enCarrito(libroId);
    if (actual) {
      if (actual === ej.id) return;
      store.carrito[store.carrito.indexOf(actual)] = ej.id;
      toast(`Cambiaste el ejemplar de “${libro.titulo}” a ${ej.codigo_inventario}.`);
    } else {
      if (lleno()) { toast(cupoLibre() ? `Ya elegiste ${plural(cupoLibre(), 'ejemplar', 'ejemplares')}, tu máximo disponible. Quita uno para agregar otro.` : 'Tus espacios están ocupados por préstamos o reservas vigentes.', 'warn'); return; }
      store.carrito.push(ej.id);
      const rec = !lleno() && window.innerWidth < 1024 && similaresCarrito(1).length;
      toast(`Agregaste “${libro.titulo}” (${ej.codigo_inventario}).`, '', rec ? { label: 'Ver similares', fn: () => abrirCapa('#layer-cart') } : null);
    }
    guardarCarrito(); refresh();
  }
  function quitar(ejId){ store.carrito = store.carrito.filter(id => id !== ejId); guardarCarrito(); refresh(); }

  async function confirmar(){
    if (!esEst || !store.carrito.length || ui.busy) return;
    ui.busy = true; renderCart();
    try {
      const reserva = await api.post('/mi/reservas', { ejemplares: store.carrito });
      store.carrito = []; guardarCarrito();
      ui.busy = false;
      await cargar(); ui.simCache.clear(); refresh(); ctx.refrescarYo().catch(() => {});
      cerrarCapas(true);
      abrirPase({ eyebrow: 'Reserva confirmada', titulo: 'Tu pase de recojo', codigo: reserva.codigo_reserva, expira: reserva.fecha_expiracion, items: reserva.items });
    } catch (e) {
      ui.busy = false;
      if (e.datos?.no_disponibles) store.carrito = store.carrito.filter(id => !e.datos.no_disponibles.includes(id));
      guardarCarrito();
      toast(e.message + (e.datos?.no_disponibles ? ' Lo quitamos de tu solicitud; revisa y confirma de nuevo.' : ''), 'warn');
      try { await cargar(); } catch { /* sin conexión: se mantiene lo último */ }
      refresh();
    }
  }

  function verPase(){
    const p = store.resumen?.pendientes?.[0]; if (!p) return;
    abrirPase({ eyebrow: 'Reserva pendiente', titulo: 'Tu pase de recojo', codigo: p.codigo_reserva, expira: p.fecha_expiracion, items: p.items });
  }

  /* ───────── Eventos ───────── */
  const on = (t, s, fn) => (t === document ? document : $(s, el)).addEventListener(t === document ? s : 'input', fn, { signal: ac.signal });
  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-action]'); if (!t) return;
    const a = t.dataset.action;
    if (a === 'set-cat') { ui.cat = +t.dataset.cat; renderChips(); renderGrid(); }
    else if (a === 'toggle-ej') {
      const card = t.closest('.book'), id = +card.dataset.id, open = !ui.open.has(id);
      open ? ui.open.add(id) : ui.open.delete(id);
      card.dataset.open = open; card.querySelector('.ej').inert = !open;
      t.setAttribute('aria-expanded', open);
    }
    else if (a === 'agregar') agregar(+t.dataset.id);
    else if (a === 'elegir') agregar(+t.dataset.id, +t.dataset.ej);
    else if (a === 'quitar-libro') { const e = enCarrito(+t.dataset.id); if (e) quitar(e); }
    else if (a === 'quitar') quitar(+t.dataset.ej);
    else if (a === 'confirmar') confirmar();
    else if (a === 'abrir-carrito') abrirCapa('#layer-cart');
    else if (a === 'ver-pase') verPase();
    else if (a === 'reintentar') ctx.navegar('/catalogo');
    else if (a === 'detalles') {
      const abierto = $('#layer-detail').dataset.open === 'true';
      ui.detailId = +t.dataset.id; renderDetalle();
      if (!abierto) abrirCapa('#layer-detail'); else $('#detail-panel').scrollTo({ top: 0, behavior: reduce() ? 'auto' : 'smooth' });
    }
    else if (a === 'quitar-filtro') {
      const k = t.dataset.k;
      if (k === 'q') ui.q = ''; else if (k === 'cat') ui.cat = 0; else if (k === 'autor') ui.autor = ''; else if (k === 'isbn') ui.isbn = ''; else if (k === 'solo') ui.soloDisp = false;
      renderChips(); renderGrid();
    }
    else if (a === 'reset') { ui.q = ''; ui.cat = 0; ui.autor = ''; ui.isbn = ''; ui.soloDisp = false; renderChips(); renderGrid(); }
  }, { signal: ac.signal });
  on(null, '#q', e => { ui.q = e.target.value; renderGrid(); });
  on(null, '#f-autor', e => { ui.autor = e.target.value; renderGrid(); });
  on(null, '#f-isbn', e => { ui.isbn = e.target.value; renderGrid(); });
  $('#solo', el).addEventListener('change', e => { ui.soloDisp = e.target.checked; renderGrid(); });
  $('#h-disp', el).addEventListener('change', e => { ui.soloDisp = e.target.value === 'disp'; renderGrid(); });
  $('#h-cat', el).addEventListener('change', e => { ui.cat = +e.target.value; renderChips(); renderGrid(); });
  $('#finder', el).addEventListener('submit', e => { e.preventDefault(); $('#catalogo', el).scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth' }); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q', el).focus(); }
  }, { signal: ac.signal });
  const offCerrar = onCerrarCapas(() => { ui.detailId = null; });

  /* ───────── Arranque ───────── */
  if (store.libros.length) {
    $('#autores', el).innerHTML = [...new Set(store.libros.flatMap(autoresDe))].sort().map(a => `<option value="${esc(a)}">`).join('');
    $('#h-cat', el).innerHTML = `<option value="0">Todas las categorías</option>` + store.categorias.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    renderChips(); refresh();
  }
  // Mantiene la disponibilidad al día mientras la vista está abierta
  const sondeo = setInterval(async () => {
    if (document.hidden || ui.busy || $$('.layer[data-open="true"]').length) return;
    try { await cargar(); renderGrid(); renderCart(); renderHero(); } catch { /* reintenta en el próximo ciclo */ }
  }, 45_000);

  return () => { ac.abort(); clearInterval(sondeo); offCerrar(); };
}
