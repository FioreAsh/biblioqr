import { config } from '../config.js';

let transporte = null;

/**
 * Envía un correo. Si SMTP_HOST está configurado usa nodemailer (npm i nodemailer);
 * si no, lo imprime en la consola del servidor (modo desarrollo).
 */
export async function enviarCorreo({ para, asunto, texto }){
  if (config.smtp.host) {
    try {
      if (!transporte) {
        const nodemailer = (await import('nodemailer')).default;
        transporte = nodemailer.createTransport({
          host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
          auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
        });
      }
      await transporte.sendMail({ from: config.smtp.from, to: para, subject: asunto, text: texto });
      return true;
    } catch (e) {
      console.error('[correo] No se pudo enviar:', e.message);
      return false;
    }
  }
  console.log(`[correo · consola] Para: ${para} · ${asunto}\n  ${texto.replace(/\n/g, '\n  ')}`);
  return true;
}
