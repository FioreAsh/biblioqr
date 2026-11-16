import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Carga backend/.env si existe (Node ≥ 20.12)
try { process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env')); } catch { /* sin .env */ }

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// MODO_DEMO=1 → enlace público para presentar el proyecto: el código de verificación se muestra en pantalla,
// hay accesos rápidos por rol y un botón para reiniciar los datos de prueba. Sin MODO_DEMO, en desarrollo
// (NODE_ENV distinto de production) también se muestra el código para poder probar sin correo.
const modoDemo = process.env.MODO_DEMO === '1';

export const config = {
  modoDemo,
  puerto: Number(process.env.PORT || 3000),
  produccion: process.env.NODE_ENV === 'production',
  // Si hay DATABASE_URL se usa PostgreSQL real; si no, PGlite (PostgreSQL embebido) en backend/data
  databaseUrl: process.env.DATABASE_URL || '',
  pgliteDir: process.env.PGLITE_DIR || path.join(raiz, 'data', 'pglite'),
  frontendDir: path.resolve(raiz, '..', 'frontend'),
  // Solo los correos de este dominio pueden autorregistrarse como estudiantes
  dominioInstitucional: (process.env.DOMINIO_INSTITUCIONAL || 'aula.edu.pe').toLowerCase(),
  secreto: process.env.APP_SECRET || 'cambia-este-secreto-en-produccion',
  minutosCodigo: 10,
  intentosCodigo: 5,
  // En modo demo varias personas usan la misma cuenta a la vez: sin espera entre códigos
  segundosEntreCodigos: modoDemo ? 0 : 45,
  horasSesion: 12,
  // La API devuelve el código en la respuesta para poder probar sin correo real
  mostrarCodigoDev: modoDemo || (process.env.MOSTRAR_CODIGO_DEV ? process.env.MOSTRAR_CODIGO_DEV === '1' : process.env.NODE_ENV !== 'production'),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'BiblioQR <no-responder@biblioteca.edu.pe>'
  },
  intervaloTareasMs: 60_000
};
