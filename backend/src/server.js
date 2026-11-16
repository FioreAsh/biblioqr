import express from 'express';
import { config } from './config.js';
import { conectar, db } from './db/index.js';
import { migrar } from './db/migrate.js';
import { sembrarSiVacia, reiniciarDemo } from './db/seed.js';
import { manejadorErrores, ruta, HttpError } from './lib/errores.js';
import { autenticar, permitir } from './middleware/auth.js';
import { iniciarTareas } from './services/tareas.js';
import auth from './routes/auth.js';
import catalogo from './routes/catalogo.js';
import cuenta from './routes/cuenta.js';
import mostrador from './routes/mostrador.js';
import gestion from './routes/gestion.js';
import administracion from './routes/administracion.js';

await conectar();
await migrar({ silencioso: true });
await sembrarSiVacia();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);            // detrás del proxy de Render/otros: IP real del visitante en auditoría
app.use(express.json({ limit: '200kb' }));
app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  next();
});

// API
app.get('/api/salud', (_req, res) => res.json({ ok: true, base_de_datos: db.tipo, modo_dev: config.mostrarCodigoDev, modo_demo: config.modoDemo, dominio: config.dominioInstitucional }));
app.use('/api/auth', auth);
// Solo en modo demo: el administrador puede devolver todo a los datos de prueba iniciales
app.post('/api/demo/reiniciar', autenticar, permitir('configuracion.gestionar'), ruta(async (req, res) => {
  if (!config.modoDemo) throw new HttpError(404, 'Ruta de la API no encontrada.');
  await reiniciarDemo();
  console.log(`[demo] datos reiniciados por ${req.usuario.email}`);
  res.json({ ok: true });
}));
app.use('/api/catalogo', autenticar, catalogo);
app.use('/api/mi', autenticar, cuenta);
app.use('/api/mostrador', autenticar, mostrador);
app.use('/api/gestion', autenticar, gestion);
app.use('/api/admin', autenticar, administracion);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta de la API no encontrada.' }));
app.use(manejadorErrores);

// Frontend estático (misma URL → sin CORS)
app.use(express.static(config.frontendDir, { extensions: ['html'] }));

iniciarTareas();
app.listen(config.puerto, () => {
  console.log(`BiblioQR escuchando en http://localhost:${config.puerto}  (base de datos: ${db.tipo})`);
  if (config.modoDemo) console.log('Modo demostración: códigos en pantalla, accesos rápidos por rol y reinicio de datos.');
  else if (config.mostrarCodigoDev) console.log('Modo desarrollo: los códigos de verificación se muestran en pantalla y en esta consola.');
  if (config.produccion && config.secreto === 'cambia-este-secreto-en-produccion') console.warn('⚠ Define APP_SECRET en las variables de entorno.');
});
