/* Notificaciones del estudiante: reserva confirmada, vencida, préstamo, recordatorio, devolución y sanciones */
import { api } from '../api.js';
import { $, esc, hace, fmtDate } from '../util.js';
import { toast } from '../ui.js';

export async function montar(el, ctx){
  el.innerHTML = `<section class="wrap vista"><div class="vista__head"><div><p class="eyebrow">Mi cuenta</p><h1>Notificaciones</h1>
    <p class="vista__lead">Lo mismo que te enviamos al correo institucional.</p></div>
    <div class="vista__actions"><button class="btn btn--ghost" type="button" id="leer-todas">Marcar todas como leídas</button></div></div>
    <div class="panel glass" style="margin-top:24px" id="lista"><div class="skel"></div></div></section>`;
  let notis = [];

  async function cargar(){
    try { notis = await api.get('/mi/notificaciones'); pintar(); }
    catch (e) { $('#lista', el).innerHTML = `<div class="blank"><p>${esc(e.message)}</p></div>`; }
  }
  function pintar(){
    $('#leer-todas', el).disabled = !notis.some(n => !n.leida_en);
    $('#lista', el).innerHTML = notis.length
      ? `<ul class="notis">${notis.map(n => `<li><button class="noti" type="button" data-id="${n.id}" data-unread="${!n.leida_en}" aria-label="${n.leida_en ? '' : 'Sin leer: '}${esc(n.asunto)}"><span class="noti__dot" aria-hidden="true"></span><span class="noti__t">${esc(n.asunto)}</span><time datetime="${n.fecha_envio}" title="${esc(fmtDate(n.fecha_envio))}">${esc(hace(n.fecha_envio))}</time><span class="noti__m">${esc(n.mensaje)}</span></button></li>`).join('')}</ul>`
      : `<div class="blank"><h3>Todo en calma</h3><p>Cuando reserves, recojas o devuelvas libros, verás aquí los avisos.</p></div>`;
  }

  el.addEventListener('click', async e => {
    const b = e.target.closest('.noti');
    if (b && b.dataset.unread === 'true') {
      b.dataset.unread = 'false';
      const n = notis.find(x => x.id === +b.dataset.id); n.leida_en = new Date().toISOString();
      try { await api.post(`/mi/notificaciones/${n.id}/leer`); ctx.refrescarYo(); } catch { /* sin efecto visible */ }
      $('#leer-todas', el).disabled = !notis.some(x => !x.leida_en);
    }
    if (e.target.closest('#leer-todas')) {
      try { await api.post('/mi/notificaciones/leer-todas'); notis.forEach(n => { n.leida_en ||= new Date().toISOString(); }); pintar(); ctx.refrescarYo(); toast('Listo, todas leídas.'); }
      catch (err) { toast(err.message, 'warn'); }
    }
  });
  await cargar();
}
