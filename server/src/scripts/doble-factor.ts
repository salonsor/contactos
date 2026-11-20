// Restablece desde la consola la verificación en dos pasos de un usuario (p. ej. el único administrador ha
// perdido el móvil y sus códigos de recuperación). En su próxima entrada dará de alta la aplicación otra vez.
//
//   npm run db:2fa-restablecer -- <usuario>
import 'dotenv/config';
import { getDb } from '../db.js';
import { registrar } from '../doble-factor.js';
import { migrar } from '../migrar.js';

const usuario = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!usuario) {
  console.error('Uso: npm run db:2fa-restablecer -- <usuario>');
  process.exit(1);
}

const db = await getDb();
await migrar(db);
const [u] = await db.query<{ id: number; usuario: string; nombre: string }>(
  'SELECT id, usuario, nombre FROM usuarios WHERE lower(usuario) = lower(?1)', [usuario]);
if (!u) {
  console.error(`No existe el usuario ${usuario}.`);
  process.exit(1);
}
await db.transaction(async (tx) => {
  await tx.query('UPDATE usuarios SET totp_secreto = NULL, totp_activado_en = NULL, totp_ultimo_paso = NULL WHERE id = ?1', [u.id]);
  await tx.query('DELETE FROM codigos_recuperacion WHERE usuario_id = ?1', [u.id]);
  await tx.query('DELETE FROM sesiones WHERE usuario_id = ?1', [u.id]);
  await registrar(tx, null, 'doble_factor_restablecido', { usuarioId: u.id, usuario: u.usuario });
});
console.log(`Verificación en dos pasos restablecida para ${u.usuario} (${u.nombre}). En su próxima entrada tendrá que dar de alta la aplicación.`);
await db.close();
