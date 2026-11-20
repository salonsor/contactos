import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Client, InValue, ResultSet } from '@libsql/client';

// Base de datos SQLite a través de libSQL. En Vercel, una base Turso (TURSO_DATABASE_URL y TURSO_AUTH_TOKEN);
// en local, sin esas variables, un fichero (por defecto server/datos/contactos.db; SQLITE_PATH lo cambia).

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Varias sentencias separadas por «;», sin parámetros (migraciones) */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Pick<Db, 'query' | 'exec'>) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  descripcion: string;
}

// SQLite guarda los booleanos como 0/1 y las listas como texto JSON: estas columnas se devuelven ya convertidas
const BOOLEANAS = new Set(['es_alta', 'en_conflicto', 'activo', 'tieneClave', 'claveInicial', 'dobleFactor', 'clave_inicial', 'baja_aprobada',
  'aplicada', 'enc_ventas', 'enc_postventa', 'sin_email', 'sin_movil', 'validado_por_mi', 'esComercial', 'es_comercial']);
const JSON_COLS = new Set(['unidades', 'funciones', 'campos', 'diff', 'previo']);

const convertirFilas = (rs: ResultSet) => rs.rows.map((fila) => {
  const r: Record<string, unknown> = {};
  rs.columns.forEach((k, i) => {
    const v = fila[i];
    if (BOOLEANAS.has(k) && (typeof v === 'number' || typeof v === 'bigint')) r[k] = Number(v) !== 0;
    else if (JSON_COLS.has(k) && typeof v === 'string') r[k] = JSON.parse(v);
    else r[k] = v;
  });
  return r;
});

const convertirParam = (v: unknown): InValue => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string' || v instanceof Uint8Array) return v;
  return JSON.stringify(v);   // listas y objetos, como texto JSON
};

type Ejecutor = Pick<Client, 'execute' | 'executeMultiple'>;

const operaciones = (c: Ejecutor) => ({
  query: async <T>(sql: string, params: unknown[] = []) =>
    convertirFilas(await c.execute({ sql, args: params.map(convertirParam) })) as T[],
  exec: async (sql: string) => { await c.executeMultiple(sql); },
});

export const abrir = async (url: string, authToken?: string): Promise<Db> => {
  const local = url.startsWith('file:');
  // El cliente completo trae un módulo nativo para los ficheros; con Turso basta el de HTTP, sin nada nativo
  const { createClient } = local ? await import('@libsql/client') : await import('@libsql/client/web');
  const client = createClient({ url, authToken, intMode: 'number' });
  const directo = operaciones(client);

  // Con un fichero local, una transacción abarca varios «await»: mientras dura, el resto de peticiones de este
  // proceso espera su turno para no chocar con ella. Con Turso es el servidor quien ordena las escrituras.
  let turno: Promise<void> = Promise.resolve();
  let enTransaccion = false;
  const esperar = async () => { while (local && enTransaccion) await turno; };
  // Las claves ajenas no se hacen cumplir (Turso las trae desactivadas y libSQL abre otra conexión tras cada
  // transacción): los borrados quitan antes, a mano, las filas que dependen de lo borrado.
  const preparado = local ? client.execute('PRAGMA journal_mode = WAL') : Promise.resolve();

  return {
    descripcion: local ? 'SQLite en ' + path.resolve(url.slice('file:'.length)) : 'Turso en ' + url.replace(/\?.*$/, ''),
    async query<T>(sql: string, params?: unknown[]) {
      await preparado;
      await esperar();   // sin await entre la comprobación y el uso
      return directo.query<T>(sql, params);
    },
    async exec(sql) {
      await preparado;
      await esperar();
      await directo.exec(sql);
    },
    async transaction(fn) {
      await preparado;
      await esperar();
      let liberar!: () => void;
      if (local) {
        turno = new Promise<void>((r) => { liberar = r; });
        enTransaccion = true;
      }
      const tx = await client.transaction('write');
      try {
        const r = await fn(operaciones(tx));
        await tx.commit();
        return r;
      } catch (e) {
        await tx.rollback().catch(() => {});
        throw e;
      } finally {
        tx.close();
        if (local) { enTransaccion = false; liberar(); }
      }
    },
    close: async () => { client.close(); },
  };
};

let instancia: Promise<Db> | null = null;

const ficheroLocal = () => {
  const ruta = path.resolve(process.env.SQLITE_PATH || 'datos/contactos.db');
  mkdirSync(path.dirname(ruta), { recursive: true });
  return 'file:' + path.relative(process.cwd(), ruta).replaceAll('\\', '/');
};

export const getDb = (): Promise<Db> => (instancia ??= (() => {
  // TURSO_URL es el nombre que pone la integración de Vercel con el prefijo «TURSO»
  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL;
  if (url) return abrir(url, process.env.TURSO_AUTH_TOKEN);
  // En Vercel el disco no se conserva: un fichero local perdería los datos sin avisar
  if (process.env.VERCEL) throw new Error('Falta la variable de entorno TURSO_DATABASE_URL en el proyecto de Vercel');
  return abrir(ficheroLocal());
})());
