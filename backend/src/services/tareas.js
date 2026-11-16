import { db } from '../db/index.js';
import { config } from '../config.js';
import { vencerReservas, enviarRecordatorios, cumplirSanciones } from './flujo.js';

/** Procesos automáticos: vencer reservas, recordatorios de devolución y fin de sanciones. */
export async function ejecutarTareas(){
  try {
    const vencidas = await db.tx(q => vencerReservas(q));
    const avisos = await db.tx(q => enviarRecordatorios(q));
    const cumplidas = await db.tx(q => cumplirSanciones(q));
    if (vencidas || avisos || cumplidas) console.log(`[tareas] reservas vencidas: ${vencidas} · avisos: ${avisos} · sanciones cumplidas: ${cumplidas}`);
  } catch (e) {
    console.error('[tareas] error:', e.message);
  }
}

export function iniciarTareas(){
  ejecutarTareas();
  return setInterval(ejecutarTareas, config.intervaloTareasMs);
}
