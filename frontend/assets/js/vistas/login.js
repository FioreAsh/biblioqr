/* Inicio de sesión: correo institucional → código de verificación (6 dígitos) → registro si es nuevo */
import { api } from '../api.js';
import { $, esc } from '../util.js';
import { errorEnFormulario, conBoton } from '../ui.js';

const DEMO = [
  ['Camila Rojas', 'Estudiante', '20231458@aula.edu.pe'],
  ['Marcos Quispe', 'Bibliotecario', 'm.quispe@biblioteca.edu.pe'],
  ['Lucía Paredes', 'Administradora', 'admin@biblioteca.edu.pe']
];

export async function montar(el, ctx){
  let salud = { modo_dev: false, dominio: 'aula.edu.pe' };
  try { salud = await api.get('/salud'); } catch { /* se mostrará el error al enviar */ }
  const st = { paso: 'correo', email: '', nuevo: false, dev: null, espera: 0 };
  let reloj = null;

  el.innerHTML = `
    <section class="login">
      <div class="wrap login__in">
        <div>
          <a class="brand" href="#/ingresar">BIBLIO<b>QR</b></a>
          <h1><span>Tu biblioteca</span><em>en un código</em></h1>
          <p class="login__lead">Reserva hasta tres ejemplares desde el catálogo, recógelos con tu QR en 48 horas y devuélvelos en mostrador dentro de los 14 días del préstamo.</p>
          <ol class="login__steps">
            <li><b>1</b>Escribe tu correo institucional.</li>
            <li><b>2</b>Te enviamos un código de 6 dígitos para verificar que eres tú.</li>
            <li><b>3</b>Entras con los permisos de tu rol: estudiante, bibliotecario o administrador.</li>
          </ol>
        </div>
        <div class="login__card" id="card"></div>
      </div>
    </section>`;
  const card = $('#card', el);

  function pintar(){
    clearInterval(reloj);
    if (st.paso === 'correo') {
      const demo = salud.modo_demo;
      card.innerHTML = `
        <div class="step-in">
          <p class="eyebrow">${demo ? 'Demostración' : 'Ingresar'}</p>
          <h2>${demo ? 'Explora BiblioQR' : 'Bienvenido a BiblioQR'}</h2>
          ${demo ? `<p class="vista__lead">Entra con un clic según el rol que quieras probar. Todos los visitantes comparten los mismos datos de prueba.</p>
            <div class="demo demo--hero" role="group" aria-label="Entrar como"><div class="demo__list">${DEMO.map(([n, r, e]) => `<button type="button" data-entrar="${e}">${r}<span>${n}</span></button>`).join('')}</div></div>
            <p class="demo__or">o ingresa con un correo</p>`
          : `<p class="vista__lead">Estudiantes: usa tu correo <b>@${esc(salud.dominio)}</b>. Si es tu primera vez, te registramos en el siguiente paso.</p>`}
          <form class="form" id="f-correo" novalidate>
            <label class="field"><span>Correo institucional</span><input name="email" type="email" inputmode="email" autocomplete="email" required placeholder="20231458@${esc(salud.dominio)}" value="${esc(st.email)}" autofocus></label>
            <label class="switch"><input type="checkbox" name="recordar" ${localStorage.getItem('biblioqr.recordar') ? 'checked' : ''}><span class="switch__track" aria-hidden="true"></span>Mantener la sesión en este equipo</label>
            <p class="form__err" role="alert"></p>
            <button class="btn btn--primary btn--lg btn--block" type="submit">Enviar código</button>
          </form>
          ${salud.modo_dev && !demo ? `<div class="demo"><p>Cuentas de demostración</p><div class="demo__list">${DEMO.map(([n, r, e]) => `<button type="button" data-email="${e}">${n}<span>${r}</span></button>`).join('')}</div></div>` : ''}
        </div>`;
      const f = $('#f-correo', card);
      if (!demo) f.email.focus();
      f.addEventListener('submit', e => { e.preventDefault(); pedirCodigo(f); });
      card.querySelectorAll('[data-email]').forEach(b => b.addEventListener('click', () => { f.email.value = b.dataset.email; pedirCodigo(f); }));
      card.querySelectorAll('[data-entrar]').forEach(b => b.addEventListener('click', () => entrarDemo(b)));
      return;
    }
    card.innerHTML = `
      <div class="step-in">
        <p class="eyebrow">${st.nuevo ? 'Crear tu cuenta' : 'Verificación'}</p>
        <h2>${st.nuevo ? 'Completa tu registro' : 'Revisa tu correo'}</h2>
        <p class="vista__lead">Enviamos un código de 6 dígitos a <b>${esc(st.email)}</b>. Vence en 10 minutos.</p>
        <form class="form" id="f-codigo" novalidate>
          ${st.dev ? `<div class="dev-code" role="note"><span>${salud.modo_demo ? 'Demostración' : 'Modo desarrollo'} · tu código es</span><strong class="num">${esc(st.dev)}</strong><button class="linkish" type="button" id="usar">Usar</button></div>` : ''}
          <label class="field"><span>Código de verificación</span><input class="otp" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="······" autofocus></label>
          ${st.nuevo ? `
            <div class="form__row form__row--2">
              <label class="field"><span>Nombres</span><input name="nombres" autocomplete="given-name" required></label>
              <label class="field"><span>Apellidos</span><input name="apellidos" autocomplete="family-name" required></label>
            </div>
            <label class="field"><span>Código de estudiante</span><input name="codigo_estudiante" class="num" inputmode="numeric" required value="${esc(st.email.split('@')[0].replace(/\D/g, ''))}"></label>` : ''}
          <p class="form__err" role="alert"></p>
          <button class="btn btn--primary btn--lg btn--block" type="submit">${st.nuevo ? 'Crear cuenta e ingresar' : 'Ingresar'}</button>
          <div class="login__meta"><button class="linkish" type="button" id="cambiar">Usar otro correo</button><button class="linkish" type="button" id="reenviar"></button></div>
        </form>
      </div>`;
    const f = $('#f-codigo', card);
    f.codigo.focus();
    f.codigo.addEventListener('input', () => {
      f.codigo.value = f.codigo.value.replace(/\D/g, '').slice(0, 6);
      if (f.codigo.value.length === 6 && !st.nuevo) f.requestSubmit();
    });
    $('#usar', card)?.addEventListener('click', () => { f.codigo.value = st.dev; if (!st.nuevo) f.requestSubmit(); else f.nombres.focus(); });
    $('#cambiar', card).addEventListener('click', () => { st.paso = 'correo'; st.dev = null; pintar(); });
    const re = $('#reenviar', card);
    re.addEventListener('click', () => pedirCodigo(null));
    const cuenta = () => { st.espera = Math.max(0, st.espera - 1); re.disabled = st.espera > 0; re.textContent = st.espera ? `Reenviar en ${st.espera} s` : 'Reenviar código'; };
    cuenta(); reloj = setInterval(cuenta, 1000);
    f.addEventListener('submit', e => { e.preventDefault(); verificar(f); });
  }

  /** Modo demo: pide el código y lo verifica en un solo paso (el servidor lo devuelve en la respuesta). */
  async function entrarDemo(btn){
    const err = card.querySelector('.form__err');
    try {
      const datos = await conBoton(btn, 'Entrando…', async () => {
        const r = await api.post('/auth/codigo', { email: btn.dataset.entrar });
        return api.post('/auth/verificar', { email: btn.dataset.entrar, codigo: r.codigo_dev });
      });
      ctx.entrar(datos, false);
    } catch (e) { if (err) err.textContent = e.message; }
  }

  async function pedirCodigo(f){
    const btn = f ? f.querySelector('[type=submit]') : $('#reenviar', card);
    if (f) {
      st.email = f.email.value.trim().toLowerCase();
      if (f.recordar.checked) localStorage.setItem('biblioqr.recordar', '1'); else localStorage.removeItem('biblioqr.recordar');
    }
    try {
      const r = await conBoton(btn, 'Enviando…', () => api.post('/auth/codigo', { email: st.email }));
      Object.assign(st, { paso: 'codigo', nuevo: r.nuevo, dev: r.codigo_dev || null, espera: 46 });
      pintar();
    } catch (err) {
      if (f) errorEnFormulario(f, { ...err, datos: { ...err.datos, campo: err.datos.campo === 'correo' ? 'email' : err.datos.campo || 'email' }, message: err.message });
      else { const g = card.querySelector('.form__err'); if (g) g.textContent = err.message; }
    }
  }

  async function verificar(f){
    const cuerpo = { email: st.email, codigo: f.codigo.value };
    if (st.nuevo) cuerpo.registro = { nombres: f.nombres.value, apellidos: f.apellidos.value, codigo_estudiante: f.codigo_estudiante.value };
    try {
      const datos = await conBoton(f.querySelector('[type=submit]'), 'Verificando…', () => api.post('/auth/verificar', cuerpo));
      clearInterval(reloj);
      ctx.entrar(datos, !!localStorage.getItem('biblioqr.recordar'));
    } catch (err) {
      const campo = err.datos.campo === 'código de estudiante' ? 'codigo_estudiante' : err.datos.campo;
      errorEnFormulario(f, { message: err.message, datos: { campo } });
      if (err.datos.vencido) { f.codigo.value = ''; }
      else if (campo === 'codigo') { f.codigo.select(); }
    }
  }

  pintar();
  return () => clearInterval(reloj);
}
