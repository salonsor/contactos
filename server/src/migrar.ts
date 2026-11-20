import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

const DIR_SQL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sql');

/** Aplica, en orden, los ficheros sql/NNN_*.sql que aún no se hayan aplicado. */
export const migrar = async (db: Db): Promise<string[]> => {
  await db.exec(`CREATE TABLE IF NOT EXISTS migraciones (
    nombre TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')))`);
  const hechas = new Set((await db.query<{ nombre: string }>('SELECT nombre FROM migraciones')).map((m) => m.nombre));
  const ficheros = (await readdir(DIR_SQL)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const aplicadas: string[] = [];
  for (const f of ficheros) {
    if (hechas.has(f)) continue;
    const sql = await readFile(path.join(DIR_SQL, f), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO migraciones (nombre) VALUES (?1)', [f]);
    });
    aplicadas.push(f);
  }
  return aplicadas;
};
