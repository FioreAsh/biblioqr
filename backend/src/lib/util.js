const fmt = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  timeZone: process.env.TZ_BIBLIOTECA || 'America/Lima'
});

/** Fecha legible para correos y notificaciones. */
export const fecha = d => fmt.format(new Date(d));

/** Políticas configurables (tabla configuracion) como objeto { clave: valor }. */
export async function politicas(q){
  const r = await q.query('SELECT clave, valor FROM configuracion');
  return Object.fromEntries(r.rows.map(x => [x.clave, x.valor]));
}
