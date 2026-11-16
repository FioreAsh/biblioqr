/* Administración · Libros: alta, edición, portada, etiquetas, ejemplares y categorías */
import { api } from '../api.js';
import { $, $$, esc, norm, coverHTML, ESTADOS, plural, icono } from '../util.js';
import { toast, abrirFormulario, cerrarCapas, confirmar, errorEnFormulario, conBoton } from '../ui.js';

export async function montar(el, ctx, params){
  const st = { cat: null, q: '', categoria: 0 };

  el.innerHTML = `<section class="wrap vista">
    <div class="vista__head"><div><p class="eyebrow">Administración</p><h1>Libros y ejemplares</h1>
      <p class="vista__lead">Lo que guardes aquí se refleja al instante en el catálogo de los estudiantes.</p></div>
      <div class="vista__actions"><button class="btn btn--ghost" type="button" data-action="categorias">Categorías</button><button class="btn btn--primary" type="button" data-action="nuevo">${icono.mas} Nuevo libro</button></div></div>
    <section class="panel glass" style="margin-top:24px">
      <div class="toolbar">
        <label class="field"><span>Buscar</span><input id="q" type="search" placeholder="Título, autor o ISBN" autocomplete="off"></label>
        <label class="field field--narrow"><span>Categoría</span><select id="fcat"></select></label>
        <p class="count num" id="count" style="margin-left:auto"></p>
      </div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Libro</th><th>ISBN</th><th>Categoría</th><th>Ejemplares</th><th><span class="sr">Acciones</span></th></tr></thead><tbody id="tbody"><tr><td colspan="5"><div class="skel"></div></td></tr></tbody></table></div>
    </section></section>`;

  const catNombre = id => st.cat.categorias.find(c => c.id === id)?.nombre || '—';
  const tagsDe = id => { const ids = st.cat.libro_etiquetas.filter(x => x.libro_id === id).map(x => x.etiqueta_id); return st.cat.etiquetas.filter(t => ids.includes(t.id)).map(t => t.nombre); };
  const ejsDe = id => st.cat.ejemplares.filter(e => e.libro_id === id);

  async function cargar(){
    st.cat = await api.get('/catalogo');
    $('#fcat', el).innerHTML = `<option value="0">Todas</option>` + st.cat.categorias.map(c => `<option value="${c.id}" ${st.categoria === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
    pintar();
  }

  function pintar(){
    const q = norm(st.q);
    const lista = st.cat.libros.filter(l => (!st.categoria || l.categoria_id === st.categoria) && (!q || norm(`${l.titulo} ${l.autor} ${l.isbn}`).includes(q)));
    $('#count', el).textContent = `${lista.length} de ${st.cat.libros.length} títulos`;
    $('#tbody', el).innerHTML = lista.length ? lista.map(l => {
      const ejs = ejsDe(l.id), cuenta = Object.entries(ESTADOS).map(([k, t]) => [k, t, ejs.filter(e => e.estado === k).length]).filter(x => x[2]);
      return `<tr>
        <td><div class="t-book">${coverHTML(l, 'sm', catNombre(l.categoria_id))}<div><div class="t-title">${esc(l.titulo)}</div><div class="t-sub">${esc(l.autor)}${l.anio_publicacion ? ` · <span class="num">${l.anio_publicacion}</span>` : ''}</div></div></div></td>
        <td class="num" style="white-space:nowrap">${esc(l.isbn)}</td>
        <td>${esc(catNombre(l.categoria_id))}</td>
        <td><div style="display:flex;flex-wrap:wrap;gap:4px">${cuenta.length ? cuenta.map(([k, t, n]) => `<span class="badge" data-estado="${k}" title="${t}">${n} ${t.toLowerCase()}</span>`).join('') : '<span class="muted small">Sin ejemplares</span>'}</div></td>
        <td><div class="t-actions"><button class="btn btn--ghost btn--sm" type="button" data-action="editar" data-id="${l.id}">Editar</button><button class="icon-btn" type="button" data-action="eliminar" data-id="${l.id}" aria-label="Eliminar ${esc(l.titulo)}" title="Eliminar">${icono.x}</button></div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="5"><div class="blank"><p>Ningún libro coincide con la búsqueda.</p></div></td></tr>`;
  }

  /* ───────── Formulario de libro ───────── */
  function abrirLibro(libro){
    const nuevo = !libro;
    const l = libro || { titulo: '', autor: '', isbn: '', editorial: '', anio_publicacion: '', descripcion: '', portada_url: '', categoria_id: st.cat.categorias[0]?.id };
    let tags = nuevo ? [] : tagsDe(l.id);
    const p = abrirFormulario(`
      <div class="panel__head"><h2 id="form-title">${nuevo ? 'Nuevo libro' : 'Editar libro'}</h2><p>${nuevo ? 'Completa los datos y, si quieres, registra sus ejemplares.' : `ID ${l.id}`}</p></div>
      <form class="form" id="f-libro" novalidate>
        <div class="cover-preview"><div id="prev">${coverHTML(l, null, catNombre(l.categoria_id))}</div>
          <div style="flex:1;display:grid;gap:14px;min-width:0">
            <label class="field"><span>Título</span><input name="titulo" required maxlength="255" value="${esc(l.titulo)}" autofocus></label>
            <label class="field"><span>Autor(es)</span><input name="autor" required maxlength="255" value="${esc(l.autor)}"><small>Separa varios autores con coma: «Ramez Elmasri, Shamkant B. Navathe».</small></label>
          </div></div>
        <div class="form__row form__row--3">
          <label class="field"><span>ISBN</span><input name="isbn" class="num" required value="${esc(l.isbn)}" placeholder="978-607-32-0603-7"></label>
          <label class="field"><span>Editorial</span><input name="editorial" value="${esc(l.editorial || '')}"></label>
          <label class="field"><span>Año</span><input name="anio_publicacion" class="num" type="number" min="1400" max="${new Date().getFullYear() + 1}" value="${esc(l.anio_publicacion || '')}"></label>
        </div>
        <label class="field"><span>Categoría</span><select name="categoria_id">${st.cat.categorias.map(c => `<option value="${c.id}" ${c.id === l.categoria_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
        <label class="field"><span>URL de portada</span><input name="portada_url" type="url" inputmode="url" value="${esc(l.portada_url || '')}" placeholder="https://…/portada.jpg"><small>Déjalo vacío para usar la portada tipográfica generada. Si la imagen no carga, también se usa la generada.</small></label>
        <label class="field"><span>Descripción</span><textarea name="descripcion" maxlength="4000">${esc(l.descripcion || '')}</textarea></label>
        <div class="field"><span id="tags-l">Etiquetas · alimentan «Libros similares»</span><div class="tags-input" id="tags"><input id="tag-in" list="tag-list" placeholder="Escribe y presiona Enter" aria-labelledby="tags-l"></div>
          <datalist id="tag-list">${st.cat.etiquetas.map(t => `<option value="${esc(t.nombre)}">`).join('')}</datalist></div>
        ${nuevo ? `<div class="form__row form__row--21"><label class="field"><span>Ubicación de los ejemplares</span><input name="ubicacion" placeholder="Piso 2 · Estante A-30"></label><label class="field"><span>Cantidad</span><input name="cantidad" type="number" min="0" max="50" value="1" class="num"></label></div>`
          : `<section class="detail__sec" style="margin-top:6px"><div class="panel__head"><h3 style="font-size:18px">Ejemplares físicos</h3><p>Los cambios de estado se guardan al momento</p></div><div id="ejs" style="display:grid;gap:8px"></div>
            <div class="form__row form__row--21" style="margin-top:12px"><label class="field"><span>Agregar ejemplares en</span><input id="nu-ubic" placeholder="Piso 2 · Estante A-30" value="${esc(ejsDe(l.id)[0]?.ubicacion || '')}"></label><label class="field"><span>Cantidad</span><div style="display:flex;gap:8px"><input id="nu-cant" type="number" min="1" max="50" value="1" class="num" style="flex:1"><button class="btn btn--ghost" type="button" data-action="agregar-ej">Agregar</button></div></label></div></section>`}
        <p class="form__err" role="alert"></p>
        <div class="form__foot"><button class="btn btn--ghost" type="button" data-action="cerrar">Cancelar</button><button class="btn btn--primary" type="submit">${nuevo ? 'Crear libro' : 'Guardar cambios'}</button></div>
      </form>`);
    const f = $('#f-libro', p);

    const pintarTags = () => {
      $$('.tag-x', p).forEach(x => x.remove());
      $('#tag-in', p).insertAdjacentHTML('beforebegin', tags.map((t, i) => `<span class="tag-x">${esc(t)}<button type="button" data-quitar-tag="${i}" aria-label="Quitar etiqueta ${esc(t)}">${icono.xs}</button></span>`).join(''));
    };
    const agregarTag = () => {
      const i = $('#tag-in', p), v = i.value.trim().toLowerCase().replace(/,$/, '');
      if (v && !tags.includes(v) && tags.length < 12) tags.push(v);
      i.value = ''; pintarTags();
    };
    pintarTags();
    $('#tag-in', p).addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); agregarTag(); }
      if (e.key === 'Backspace' && !e.target.value && tags.length) { tags.pop(); pintarTags(); }
    });
    $('#tag-in', p).addEventListener('change', agregarTag);
    p.addEventListener('click', e => { const b = e.target.closest('[data-quitar-tag]'); if (b) { tags.splice(+b.dataset.quitarTag, 1); pintarTags(); } });

    // Vista previa de la portada en vivo
    const prev = () => $('#prev', p).innerHTML = coverHTML({ id: l.id, titulo: f.titulo.value || 'Título', autor: f.autor.value || 'Autor', categoria_id: +f.categoria_id.value, portada_url: f.portada_url.value.trim() }, null, catNombre(+f.categoria_id.value));
    ['titulo', 'autor', 'categoria_id', 'portada_url'].forEach(n => f[n].addEventListener('input', prev));

    // Ejemplares (solo en edición)
    const pintarEjs = () => {
      const box = $('#ejs', p); if (!box) return;
      const ejs = ejsDe(l.id);
      box.innerHTML = ejs.length ? ejs.map(e => {
        const fijo = ['reservado', 'prestado'].includes(e.estado);
        return `<div class="ej-edit" data-ej="${e.id}"><b class="num">${esc(e.codigo_inventario)}</b>
          <input aria-label="Ubicación de ${esc(e.codigo_inventario)}" data-campo="ubicacion" value="${esc(e.ubicacion || '')}">
          <select aria-label="Estado de ${esc(e.codigo_inventario)}" data-campo="estado" ${fijo ? 'disabled title="Cambia solo con la entrega o la devolución"' : ''}>${(fijo ? [e.estado] : ['disponible', 'mantenimiento', 'perdido']).map(s => `<option value="${s}" ${s === e.estado ? 'selected' : ''}>${ESTADOS[s]}</option>`).join('')}</select>
          <button class="icon-btn" type="button" data-action="borrar-ej" data-id="${e.id}" aria-label="Eliminar ${esc(e.codigo_inventario)}" ${fijo ? 'disabled' : ''}>${icono.x}</button></div>`;
      }).join('') : '<p class="muted small">Este libro aún no tiene ejemplares físicos.</p>';
    };
    pintarEjs();
    p.addEventListener('change', async e => {
      const row = e.target.closest('[data-ej]'); if (!row || !e.target.dataset.campo) return;
      try {
        const nuevoEj = await api.patch('/gestion/ejemplares/' + row.dataset.ej, { [e.target.dataset.campo]: e.target.value });
        Object.assign(st.cat.ejemplares.find(x => x.id === nuevoEj.id), nuevoEj);
        toast(`${nuevoEj.codigo_inventario} actualizado.`); pintar();
      } catch (err) { toast(err.message, 'warn'); pintarEjs(); }
    });
    p.addEventListener('click', async e => {
      const t = e.target.closest('[data-action]'); if (!t) return;
      if (t.dataset.action === 'agregar-ej') {
        try {
          const creados = await conBoton(t, 'Agregando…', () => api.post(`/gestion/libros/${l.id}/ejemplares`, { cantidad: +$('#nu-cant', p).value, ubicacion: $('#nu-ubic', p).value }));
          st.cat.ejemplares.push(...creados); pintarEjs(); pintar();
          toast(`${plural(creados.length, 'ejemplar agregado', 'ejemplares agregados')}: ${creados.map(c => c.codigo_inventario).join(', ')}.`);
        } catch (err) { toast(err.message, 'warn'); }
      }
      if (t.dataset.action === 'borrar-ej') {
        try { await api.del('/gestion/ejemplares/' + t.dataset.id); st.cat.ejemplares = st.cat.ejemplares.filter(x => x.id !== +t.dataset.id); pintarEjs(); pintar(); toast('Ejemplar eliminado.'); }
        catch (err) { toast(err.message, 'warn'); }
      }
    });

    f.addEventListener('submit', async e => {
      e.preventDefault();
      if ($('#tag-in', p).value.trim()) agregarTag();
      const cuerpo = {
        titulo: f.titulo.value, autor: f.autor.value, isbn: f.isbn.value, editorial: f.editorial.value,
        anio_publicacion: f.anio_publicacion.value || null, categoria_id: +f.categoria_id.value,
        portada_url: f.portada_url.value.trim() || null, descripcion: f.descripcion.value, etiquetas: tags
      };
      if (nuevo) cuerpo.ejemplares = { cantidad: +f.cantidad.value || 0, ubicacion: f.ubicacion.value };
      try {
        const r = await conBoton(f.querySelector('[type=submit]'), 'Guardando…', () => nuevo ? api.post('/gestion/libros', cuerpo) : api.put('/gestion/libros/' + l.id, cuerpo));
        cerrarCapas(true);
        toast(nuevo ? `«${r.titulo}» se agregó al catálogo.` : 'Cambios guardados.');
        await cargar();
      } catch (err) {
        const mapa = { 'título': 'titulo', 'año de publicación': 'anio_publicacion', 'URL de portada': 'portada_url', 'categoría': 'categoria_id', 'descripción': 'descripcion', 'cantidad de ejemplares': 'cantidad', 'ubicación': 'ubicacion' };
        errorEnFormulario(f, { message: err.message, datos: { campo: mapa[err.datos.campo] || err.datos.campo } });
      }
    });
  }

  /* ───────── Categorías ───────── */
  function abrirCategorias(){
    const p = abrirFormulario(`<div class="panel__head"><h2 id="form-title">Categorías</h2><p>Organizan el catálogo y suman puntos en «Libros similares».</p></div>
      <div id="cats" style="display:grid;gap:8px"></div>
      <form class="form" id="f-cat" style="margin-top:16px" novalidate><div class="form__row form__row--21"><label class="field"><span>Nueva categoría</span><input name="nombre" required maxlength="80"></label><label class="field"><span>Descripción</span><input name="descripcion" maxlength="500"></label></div>
      <p class="form__err" role="alert"></p><div class="form__foot"><button class="btn btn--primary" type="submit">Agregar categoría</button></div></form>`);
    const pintarCats = () => {
      $('#cats', p).innerHTML = st.cat.categorias.map(c => {
        const n = st.cat.libros.filter(l => l.categoria_id === c.id).length;
        return `<div class="ej-edit" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) auto auto" data-cat="${c.id}"><input aria-label="Nombre" data-c="nombre" value="${esc(c.nombre)}"><input aria-label="Descripción" data-c="descripcion" value="${esc(c.descripcion || '')}"><span class="pill num">${plural(n, 'libro', 'libros')}</span><button class="icon-btn" type="button" data-borrar-cat="${c.id}" aria-label="Eliminar ${esc(c.nombre)}" ${n ? 'disabled title="Tiene libros"' : ''}>${icono.x}</button></div>`;
      }).join('');
    };
    pintarCats();
    p.addEventListener('change', async e => {
      const row = e.target.closest('[data-cat]'); if (!row) return;
      const c = st.cat.categorias.find(x => x.id === +row.dataset.cat);
      try { Object.assign(c, await api.put('/gestion/categorias/' + c.id, { nombre: row.querySelector('[data-c=nombre]').value, descripcion: row.querySelector('[data-c=descripcion]').value })); toast('Categoría actualizada.'); pintar(); }
      catch (err) { toast(err.message, 'warn'); pintarCats(); }
    });
    p.addEventListener('click', async e => {
      const b = e.target.closest('[data-borrar-cat]'); if (!b) return;
      try { await api.del('/gestion/categorias/' + b.dataset.borrarCat); st.cat.categorias = st.cat.categorias.filter(c => c.id !== +b.dataset.borrarCat); pintarCats(); toast('Categoría eliminada.'); }
      catch (err) { toast(err.message, 'warn'); }
    });
    $('#f-cat', p).addEventListener('submit', async e => {
      e.preventDefault();
      try { const c = await api.post('/gestion/categorias', { nombre: e.target.nombre.value, descripcion: e.target.descripcion.value }); st.cat.categorias.push(c); e.target.reset(); pintarCats(); toast(`Categoría «${c.nombre}» creada.`); await cargar(); }
      catch (err) { errorEnFormulario(e.target, err); }
    });
  }

  /* ───────── Eventos ───────── */
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-action]'); if (!t) return;
    const a = t.dataset.action, id = +t.dataset.id;
    if (a === 'nuevo') abrirLibro(null);
    else if (a === 'categorias') abrirCategorias();
    else if (a === 'editar') abrirLibro(st.cat.libros.find(l => l.id === id));
    else if (a === 'eliminar') {
      const l = st.cat.libros.find(x => x.id === id);
      if (!(await confirmar({ titulo: `Eliminar «${l.titulo}»`, texto: 'Se borran el libro, sus etiquetas y sus ejemplares. Si alguno ya circuló, el sistema lo impedirá para conservar el historial.', accion: 'Eliminar', tono: 'danger' }))) return;
      try { await api.del('/gestion/libros/' + id); toast('Libro eliminado.'); await cargar(); }
      catch (err) { toast(err.message, 'warn'); }
    }
  });
  $('#q', el).addEventListener('input', e => { st.q = e.target.value; pintar(); });
  $('#fcat', el).addEventListener('change', e => { st.categoria = +e.target.value; pintar(); });

  try { await cargar(); } catch (e) { $('#tbody', el).innerHTML = `<tr><td colspan="5"><div class="blank"><p>${esc(e.message)}</p></div></td></tr>`; return; }
  const editar = +params.get('editar');
  if (editar && st.cat.libros.some(l => l.id === editar)) abrirLibro(st.cat.libros.find(l => l.id === editar));
}
