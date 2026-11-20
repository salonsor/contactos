// Pone la contraseña provisional común (CLAVE_POR_DEFECTO de server/.env, u otra pasada como argumento)
// a todos los usuarios que aún no han elegido la suya. Tendrán que cambiarla al entrar.
//
//   npm run db:clave-defecto              usa CLAVE_POR_DEFECTO
//   npm run db:clave-defecto -- --todos   también a quien ya eligió su contraseña (se la quita)
import 'dotenv/config';
import { hashClave } from '../auth.js';
import { getDb } from '../db.js';
import { migrar } from '../migrar.js';

const args = process.argv.slice(2);
const todos = args.includes('--todos');
const clave = args.find((a) => !a.startsWith('--')) || process.env.CLAVE_POR_DEFECTO;
if (!clave) {
  console.error('Indica la contraseña (npm run db:clave-defecto -- <clave>) o pon CLAVE_POR_DEFECTO en server/.env');
  process.exit(1);
}

const db = await getDb();
await migrar(db);
// Quien ya eligió su contraseña (tiene una y no es provisional) se respeta, salvo con --todos
const usuarios = await db.query<{ id: number; usuario: string }>(
  `SELECT id, usuario FROM usuarios WHERE ?1 OR clave_hash IS NULL OR clave_inicial = 1 ORDER BY usuario`, [todos]);
const respetados = await db.query<{ usuario: string }>(
  `SELECT usuario FROM usuarios WHERE NOT ?1 AND clave_hash IS NOT NULL AND clave_inicial = 0 ORDER BY usuario`, [todos]);
await db.transaction(async (tx) => {
  for (const u of usuarios) {
    await tx.query('UPDATE usuarios SET clave_hash = ?2, clave_inicial = 1 WHERE id = ?1', [u.id, await hashClave(clave)]);
    await tx.query('DELETE FROM sesiones WHERE usuario_id = ?1', [u.id]);
  }
});
console.log(`Contraseña provisional puesta a ${usuarios.length} usuarios; la cambiarán al entrar.`);
if (respetados.length) console.log(`Sin tocar (ya tienen su propia contraseña): ${respetados.map((u) => u.usuario).join(', ')}`);
await db.close();
