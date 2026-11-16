import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, db } from './index.js';
import { config } from '../config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Aplica en orden los .sql de /migrations que aún no estén registrados. */
export async function migrar({ silencioso = false } = {}){
  await conectar();
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migraciones (nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const hechas = new Set((await db.query('SELECT nombre FROM schema_migraciones')).rows.map(r => r.nombre));
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of archivos) {
    if (hechas.has(f)) continue;
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    await db.query('INSERT INTO schema_migraciones (nombre) VALUES ($1)', [f]);
    if (!silencioso) console.log(`  ✓ migración ${f}`);
  }
}

const esScript = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (esScript) {
  if (process.argv.includes('--reset')) {
    if (config.databaseUrl) {
      await conectar();
      await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await db.close();
    } else {
      fs.rmSync(config.pgliteDir, { recursive: true, force: true });
    }
    console.log('Base de datos reiniciada.');
  }
  await migrar();
  await db.close();
  console.log('Migraciones al día.');
}
