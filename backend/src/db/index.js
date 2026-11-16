import fs from 'node:fs';
import { config } from '../config.js';

/**
 * Capa de acceso a datos única para todo el backend.
 *   db.query(sql, params)   → { rows, rowCount }
 *   db.tx(async q => {...})  → ejecuta en una transacción (q.query con la misma firma)
 *   db.exec(sql)             → varias sentencias sin parámetros (migraciones)
 * Funciona igual con PostgreSQL (pg) y con PGlite.
 */
let impl = null;

const normalizar = r => ({ rows: r.rows, rowCount: r.rowCount ?? r.affectedRows ?? r.rows.length });

async function crearPg(){
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(20, v => Number(v));      // BIGINT → number
  pg.types.setTypeParser(1700, v => Number(v));    // NUMERIC → number
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  return {
    tipo: 'postgresql',
    query: async (t, p) => normalizar(await pool.query(t, p)),
    exec: async sql => { await pool.query(sql); },
    async tx(fn){
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn({ query: async (t, p) => normalizar(await c.query(t, p)) });
        await c.query('COMMIT');
        return r;
      } catch (e) { await c.query('ROLLBACK'); throw e; }
      finally { c.release(); }
    },
    close: () => pool.end()
  };
}

async function crearPglite(){
  const { PGlite, types } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  fs.mkdirSync(config.pgliteDir, { recursive: true });
  const parsers = { [types.INT8]: v => Number(v), [types.NUMERIC]: v => Number(v) };
  const db = new PGlite(config.pgliteDir, { extensions: { pg_trgm }, parsers });
  await db.waitReady;
  return {
    tipo: 'pglite',
    query: async (t, p) => normalizar(await db.query(t, p)),
    exec: async sql => { await db.exec(sql); },
    tx: fn => db.transaction(tx => fn({ query: async (t, p) => normalizar(await tx.query(t, p)) })),
    close: () => db.close()
  };
}

export async function conectar(){
  if (!impl) impl = config.databaseUrl ? await crearPg() : await crearPglite();
  return impl;
}

export const db = {
  get tipo(){ return impl?.tipo; },
  query: (t, p) => impl.query(t, p),
  exec: sql => impl.exec(sql),
  tx: fn => impl.tx(fn),
  close: async () => { if (impl) { await impl.close(); impl = null; } }
};
