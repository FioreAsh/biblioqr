/* Componentes de interfaz compartidos: toast, capas modales, pase QR, formularios y contadores */
import { $, $$, esc, fmtCount, fmtDate, qrSVG, icono } from './util.js';

/* ───────── Toast ───────── */
let toastT;
export function toast(msg, tone, action){
  const t = $('#toast');
  t.textContent = msg; t.dataset.tone = tone || ''; t.dataset.show = 'true';
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast__btn'; b.textContent = action.label;
    b.addEventListener('click', () => { t.dataset.show = 'false'; action.fn(); });
    t.append(' ', b);
  }
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.dataset.show = 'false'; }, action ? 6000 : 3800);
}

/* ───────── Capas (sheet en móvil, modal en desktop) ───────── */
let lastFocus = null;
const alCerrar = new Set();
export const onCerrarCapas = fn => { alCerrar.add(fn); return () => alCerrar.delete(fn); };

export function abrirCapa(id){
  if (!$$('.layer[data-open="true"]').length) lastFocus = document.activeElement;
  $$('.layer[data-open="true"]').forEach(el => { if ('#' + el.id !== id) { el.dataset.open = 'false'; el.inert = true; } });
  const el = $(id); el.inert = false; el.dataset.open = 'true'; document.body.style.overflow = 'hidden';
  setTimeout(() => { const f = el.querySelector('[autofocus], .layer__x, .btn--primary, button'); if (f) f.focus({ preventScroll: true }); }, 60);
}

export function cerrarCapas(silencioso){
  $$('.layer').forEach(el => { el.dataset.open = 'false'; el.inert = true; });
  document.body.style.overflow = '';
  alCerrar.forEach(fn => fn());
  if (!silencioso && lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}

export const botonCerrar = `<button class="icon-btn layer__x" type="button" data-action="cerrar" aria-label="Cerrar">${icono.x}</button>`;

/** Formulario genérico en la capa #layer-form. Devuelve el panel para enlazar eventos. */
export function abrirFormulario(html){
  // Panel nuevo en cada apertura: los listeners del formulario anterior no se acumulan
  const viejo = $('#form-panel'), p = viejo.cloneNode(false);
  p.removeAttribute('style');
  viejo.replaceWith(p);
  p.innerHTML = botonCerrar + html;
  abrirCapa('#layer-form');
  return p;
}

/** Confirmación accesible (reemplaza window.confirm). Resuelve true/false. */
export function confirmar({ titulo, texto, accion = 'Confirmar', tono = 'primary', campo }){
  return new Promise(resolve => {
    const p = abrirFormulario(`
      <div class="panel__head"><h2 id="form-title">${esc(titulo)}</h2></div>
      <p class="vista__lead" style="margin-top:0">${esc(texto)}</p>
      <form class="form" style="margin-top:16px" novalidate>
        ${campo ? `<label class="field"><span>${esc(campo.label)}</span><textarea name="valor" required placeholder="${esc(campo.placeholder || '')}" autofocus></textarea></label><p class="form__err" role="alert"></p>` : ''}
        <div class="form__foot"><button class="btn btn--ghost" type="button" data-action="cerrar">Cancelar</button><button class="btn btn--${tono}" type="submit">${esc(accion)}</button></div>
      </form>`);
    p.style.width = 'min(100%, 480px)';
    let hecho = false;
    const fin = v => { if (hecho) return; hecho = true; alCerrar.delete(alCancelar); p.style.width = ''; resolve(v); };
    const alCancelar = () => fin(false);
    alCerrar.add(alCancelar);
    p.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const v = campo ? e.target.valor.value.trim() : true;
      if (campo && v.length < 3) { p.querySelector('.form__err').textContent = 'Escribe al menos 3 caracteres.'; return; }
      fin(v); cerrarCapas();
    });
  });
}

/** Muestra errores de la API en un formulario: campo concreto si viene `campo`, si no, mensaje general. */
export function errorEnFormulario(form, err){
  $$('[data-error]', form).forEach(f => { f.removeAttribute('data-error'); f.querySelector('.field__err')?.remove(); });
  const campo = err?.datos?.campo;
  const input = campo && form.querySelector(`[name="${campo}"]`);
  const field = input?.closest('.field');
  if (field) {
    field.dataset.error = '';
    field.insertAdjacentHTML('beforeend', `<span class="field__err" role="alert">${esc(err.message)}</span>`);
    input.focus();
    const g = form.querySelector('.form__err'); if (g) g.textContent = '';
  } else {
    const g = form.querySelector('.form__err');
    if (g) g.textContent = err.message; else toast(err.message, 'warn');
  }
}

export async function conBoton(btn, texto, fn){
  const orig = btn.innerHTML; btn.disabled = true; btn.textContent = texto;
  try { return await fn(); } finally { if (document.contains(btn)) { btn.disabled = false; btn.innerHTML = orig; } }
}

/* ───────── Pase QR (recojo o devolución) ───────── */
export function abrirPase({ eyebrow, titulo, codigo, expira, items = [], nota, pista }){
  $('#pass-panel').innerHTML = `
    ${botonCerrar}
    <p class="eyebrow">${esc(eyebrow)}</p>
    <h2 id="pass-title">${esc(titulo)}</h2>
    <div class="qr-frame">${qrSVG(codigo)}</div>
    <p class="pass__code num">${esc(codigo)}</p>
    ${expira ? `<div class="timer"><span>Tiempo para recoger</span><strong class="num" data-countdown data-exp="${esc(expira)}">${fmtCount(new Date(expira) - Date.now())}</strong></div>
    <p class="pass__small">Válido hasta el <b>${esc(fmtDate(expira))}</b>. Si no recoges a tiempo, la reserva vence sin sanción.</p>` : ''}
    ${nota ? `<p class="pass__small">${nota}</p>` : ''}
    <ul class="pass__items">${items.map(i => `<li><b>${esc(i.titulo)}</b><span class="num">${esc(i.codigo_inventario)} · ${esc(i.ubicacion || '')}</span></li>`).join('')}</ul>
    <p class="pass__hint">${esc(pista || 'Sube el brillo de tu pantalla antes de pasar por mostrador.')}</p>
    <button class="btn btn--primary" type="button" data-action="cerrar">Listo</button>`;
  abrirCapa('#layer-pass');
}

/* ───────── Contadores en vivo ───────── */
export function tick(){
  $$('[data-countdown]').forEach(el => { el.textContent = fmtCount(new Date(el.dataset.exp) - Date.now()); });
}

/* ───────── Eventos globales de capas ───────── */
document.addEventListener('click', ev => { if (ev.target.closest('[data-action="cerrar"]')) cerrarCapas(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $$('.layer[data-open="true"]').length) cerrarCapas(); });
/* Si una portada_url falla, se queda la portada tipográfica */
document.addEventListener('error', ev => { if (ev.target.classList?.contains('cover__img')) ev.target.remove(); }, true);
/* Algunos servicios devuelven una imagen vacía de 1×1 cuando no tienen la portada: también cae a la generada */
document.addEventListener('load', ev => { const t = ev.target; if (t.classList?.contains('cover__img') && t.naturalWidth <= 2) t.remove(); }, true);
