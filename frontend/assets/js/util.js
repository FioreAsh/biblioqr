/* Utilidades compartidas por todas las vistas */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const pad = n => String(n).padStart(2, '0');
export const reduce = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export const ESTADOS = { disponible: 'Disponible', reservado: 'Reservado', prestado: 'Prestado', mantenimiento: 'En mantenimiento', perdido: 'Perdido' };
export const COVER = { 1: ['#0F4C81', '#2B7BB5'], 2: ['#1F5F8B', '#3C93C9'], 3: ['#13565F', '#2F8F9D'], 4: ['#3A4F7A', '#6179B0'], 5: ['#6B4E12', '#B8892B'], 6: ['#2C5E4A', '#4C9A7B'] };
const COVER_EXTRA = [['#4A3B72', '#7B66B3'], ['#6B2D3A', '#A8505F'], ['#2F4858', '#557C93']];

export const fmtDate = iso => new Date(iso).toLocaleString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const fmtDay = iso => new Date(iso).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtShort = iso => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtCount = ms => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`; };
export const hace = iso => {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return 'hace un momento';
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  if (d < 172800) return 'ayer';
  return fmtShort(iso);
};

/** Tiempo restante de un préstamo → texto, tono y fracción consumida (indicador del estudiante). */
export function plazo(limite, entrega){
  const ms = new Date(limite) - Date.now();
  const total = entrega ? new Date(limite) - new Date(entrega) : 14 * 864e5;
  const frac = Math.min(1, Math.max(0, 1 - ms / total));
  if (ms <= 0) {
    const dias = Math.ceil(-ms / 864e5);
    return { tono: 'danger', texto: `Vencido hace ${plural(dias, 'día', 'días')}`, frac: 1 };
  }
  const h = ms / 36e5;
  if (h < 24) return { tono: 'warn', texto: `Vence en ${Math.max(1, Math.floor(h))} h`, frac };
  const d = Math.floor(h / 24), hr = Math.floor(h % 24);
  return { tono: d < 3 ? 'warn' : 'ok', texto: `Quedan ${plural(d, 'día', 'días')}${d < 3 && hr ? ` ${hr} h` : ''}`, frac };
}

export const urlValida = u => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u);
export const autoresDe = l => String(l.autor || '').split(', ');

export function qrSVG(text){
  try {
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch {
    return `<div style="display:grid;place-items:center;height:100%;font-size:12px;color:#5A6F85;text-align:center">No se pudo dibujar el QR.<br>Código: ${esc(String(text).slice(0, 8))}…</div>`;
  }
}

/** Portada: imagen real si portada_url es válida (fallback onerror global); si no, portada tipográfica. */
export function coverHTML(l, size, categoria){
  const [a, b] = COVER[l.categoria_id] || COVER_EXTRA[(l.categoria_id || 0) % COVER_EXTRA.length];
  const img = urlValida(l.portada_url) ? `<img class="cover__img" src="${esc(l.portada_url)}" alt="" loading="lazy">` : '';
  return `<div class="cover${size ? ' cover--' + size : ''}" style="--a:${a};--b:${b}" role="img" aria-label="Portada de ${esc(l.titulo)}"><span class="cover__cat" aria-hidden="true">${esc(categoria || '')}</span><span class="cover__ini" aria-hidden="true">${esc(String(l.titulo || '?').charAt(0))}</span><span class="cover__t" aria-hidden="true">${esc(l.titulo)}</span><span class="cover__a" aria-hidden="true">${esc(autoresDe(l)[0])}</span>${img}</div>`;
}

export const icono = {
  xs: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  alerta: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>',
  campana: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  salir: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
  lupa: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  mas: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  qr: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>',
  libro: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M9 8h5"/></svg>'
};
