import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { ruta, HttpError, invalido } from '../lib/errores.js';
import * as v from '../lib/validar.js';
import { enviarCorreo } from '../lib/correo.js';
import { auditar, ipDe } from '../lib/registro.js';
import { permisosDe, ROLES } from '../lib/permisos.js';
import { autenticar, hashToken } from '../middleware/auth.js';

const r = Router();

const hashCodigo = (email, codigo) =>
  crypto.createHash('sha256').update(`${email}:${codigo}:${config.secreto}`).digest('hex');

const dominio = email => email.split('@')[1];

export async function perfil(q, usuario){
  const s = await q.query(
    `SELECT id, motivo, fecha_fin FROM sanciones
      WHERE usuario_id = $1 AND estado = 'activa' AND fecha_fin > now()
      ORDER BY fecha_fin DESC LIMIT 1`, [usuario.id]);
  const n = await q.query(
    `SELECT COUNT(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND leida_en IS NULL`, [usuario.id]);
  return {
    usuario: {
      id: usuario.id, nombres: usuario.nombres, apellidos: usuario.apellidos, email: usuario.email,
      codigo_estudiante: usuario.codigo_estudiante, rol: usuario.rol, rol_nombre: ROLES[usuario.rol].nombre
    },
    permisos: permisosDe(usuario.rol),
    sancion_activa: s.rows[0] || null,
    no_leidas: n.rows[0].n
  };
}

/** Paso 1: el usuario escribe su correo y recibe un código de 6 dígitos. */
r.post('/codigo', ruta(async (req, res) => {
  const email = v.email(req.body?.email);
  const u = (await db.query('SELECT id, activo, nombres FROM usuarios WHERE email = $1', [email])).rows[0];

  if (!u && dominio(email) !== config.dominioInstitucional)
    throw new HttpError(403, `Usa tu correo institucional (@${config.dominioInstitucional}). Si eres personal de biblioteca, pide al administrador que registre tu cuenta.`);
  if (u && !u.activo) throw new HttpError(403, 'Tu cuenta está desactivada. Acércate a la biblioteca.');

  const ultimo = (await db.query(
    `SELECT EXTRACT(EPOCH FROM (now() - creado_en))::int AS seg FROM codigos_verificacion
      WHERE email = $1 ORDER BY creado_en DESC LIMIT 1`, [email])).rows[0];
  if (ultimo && ultimo.seg < config.segundosEntreCodigos)
    throw new HttpError(429, `Espera ${config.segundosEntreCodigos - ultimo.seg} s antes de pedir otro código.`, { espera: config.segundosEntreCodigos - ultimo.seg });

  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const expira = new Date(Date.now() + config.minutosCodigo * 60_000);
  // Fuera del modo demo, un código nuevo anula los anteriores. En demo varias personas comparten
  // la misma cuenta a la vez, así que cada código sigue valiendo hasta que se usa o vence.
  if (!config.modoDemo) await db.query('UPDATE codigos_verificacion SET usado = TRUE WHERE email = $1 AND NOT usado', [email]);
  await db.query('INSERT INTO codigos_verificacion (email, codigo_hash, expira_en) VALUES ($1,$2,$3)',
    [email, hashCodigo(email, codigo), expira]);

  await enviarCorreo({
    para: email,
    asunto: `BiblioQR · Tu código de verificación: ${codigo}`,
    texto: `${u ? `Hola, ${u.nombres}.` : 'Hola.'}\nTu código para ingresar a BiblioQR es ${codigo}.\nVence en ${config.minutosCodigo} minutos. Si no lo pediste, ignora este correo.`
  });

  res.json({
    enviado: true,
    nuevo: !u,                                     // true → el frontend pide nombres y código de estudiante
    expira_en: expira,
    ...(config.mostrarCodigoDev ? { codigo_dev: codigo } : {})
  });
}));

/** Paso 2: valida el código; si el correo es nuevo, completa el registro del estudiante. */
r.post('/verificar', ruta(async (req, res) => {
  const email = v.email(req.body?.email);
  const codigo = String(req.body?.codigo ?? '').replace(/\D/g, '');
  if (codigo.length !== 6) throw invalido('El código tiene 6 dígitos.', { campo: 'codigo' });

  const resultado = await db.tx(async q => {
    // Primero el código que coincide (en modo demo puede haber varios vigentes); si ninguno coincide,
    // el más reciente, para contar el intento fallido.
    const c = (await q.query(
      `SELECT id, codigo_hash, intentos FROM codigos_verificacion
        WHERE email = $1 AND NOT usado AND expira_en > now()
        ORDER BY (codigo_hash = $2) DESC, creado_en DESC LIMIT 1 FOR UPDATE`, [email, hashCodigo(email, codigo)])).rows[0];
    if (!c) throw invalido('El código venció o ya se usó. Pide uno nuevo.', { campo: 'codigo', vencido: true });
    if (c.intentos >= config.intentosCodigo) throw new HttpError(429, 'Demasiados intentos. Pide un código nuevo.', { vencido: true });

    const ok = crypto.timingSafeEqual(Buffer.from(c.codigo_hash), Buffer.from(hashCodigo(email, codigo)));
    if (!ok) {
      await q.query('UPDATE codigos_verificacion SET intentos = intentos + 1 WHERE id = $1', [c.id]);
      const quedan = config.intentosCodigo - c.intentos - 1;
      return { error: quedan > 0 ? `Código incorrecto. Te quedan ${quedan} intentos.` : 'Código incorrecto. Pide un código nuevo.' };
    }

    let u = (await q.query('SELECT * FROM usuarios WHERE email = $1', [email])).rows[0];
    if (!u) {
      if (dominio(email) !== config.dominioInstitucional) throw new HttpError(403, 'Correo no autorizado.');
      const reg = req.body?.registro || {};
      const nombres = v.texto(reg.nombres, 'nombres', { max: 80 });
      const apellidos = v.texto(reg.apellidos, 'apellidos', { max: 120 });
      const codEst = v.texto(reg.codigo_estudiante, 'código de estudiante', { min: 4, max: 20 });
      if (!/^[A-Za-z0-9-]+$/.test(codEst)) throw invalido('El código de estudiante solo admite letras, números y guiones.', { campo: 'codigo_estudiante' });
      u = (await q.query(
        `INSERT INTO usuarios (codigo_estudiante, nombres, apellidos, email, rol) VALUES ($1,$2,$3,$4,'estudiante') RETURNING *`,
        [codEst, nombres, apellidos, email])).rows[0];
      await auditar(q, { usuario_id: u.id, accion: 'REGISTRAR_ESTUDIANTE', entidad: 'usuarios', entidad_id: u.id, despues: { email, codigo_estudiante: codEst }, ip: ipDe(req) });
    }
    if (!u.activo) throw new HttpError(403, 'Tu cuenta está desactivada.');

    await q.query('UPDATE codigos_verificacion SET usado = TRUE WHERE id = $1', [c.id]);
    const token = crypto.randomBytes(32).toString('base64url');
    await q.query(`INSERT INTO sesiones (usuario_id, token_hash, expira_en) VALUES ($1,$2, now() + make_interval(hours => $3))`,
      [u.id, hashToken(token), config.horasSesion]);
    await q.query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [u.id]);
    await auditar(q, { usuario_id: u.id, accion: 'INICIAR_SESION', entidad: 'usuarios', entidad_id: u.id, ip: ipDe(req) });
    return { token, ...(await perfil(q, u)) };
  });

  if (resultado.error) return res.status(400).json({ error: resultado.error, campo: 'codigo' });
  res.json(resultado);
}));

r.get('/yo', autenticar, ruta(async (req, res) => res.json(await perfil(db, req.usuario))));

r.post('/salir', autenticar, ruta(async (req, res) => {
  await db.query('UPDATE sesiones SET revocada = TRUE WHERE id = $1', [req.usuario.sesion_id]);
  res.json({ ok: true });
}));

export default r;
