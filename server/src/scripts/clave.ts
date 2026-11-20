// Da una contraseña nueva a un usuario desde la consola (la primera del administrador, o si alguien se queda fuera).
//
//   npm run db:clave -- admin            contraseña nueva para el usuario «admin»
//   npm run db:clave -- jperez --admin   y además le da rol de administrador (lo crea si no existe)
//
// La contraseña se enseña una vez y hay que cambiarla al entrar.
import 'dotenv/config';
import { generarClave, hashClave } from '../auth.js';
import { getDb } from '../db.js';
import { migrar } from '../migrar.js';

const args = process.argv.slice(2);
const usuario = args.find((a) => !a.startsWith('--'));
const hacerAdmin = args.includes('--admin');
if (!usuario) {
  console.error('Uso: npm run db:clave -- <usuario> [--admin]');
  process.exit(1);
}

const db = await getDb();
await migrar(db);
const clave = generarClave();
const hash = await hashClave(clave);
let [u] = await db.query<{ id: number; nombre: string; rol: string }>(
  'SELECT id, nombre, rol FROM usuarios WHERE lower(usuario) = lower(?1)', [usuario]);
if (!u && !hacerAdmin) {
  console.error(`No existe el usuario ${usuario}. Para crearlo como administrador, añade --admin.`);
  process.exit(1);
}
if (!u) {
  [u] = await db.query('INSERT INTO usuarios (usuario, nombre, rol) VALUES (?1, ?2, ?3) RETURNING id, nombre, rol',
    [usuario, 'Administrador', 'admin']);
}
await db.query(`UPDATE usuarios SET clave_hash = ?2, clave_inicial = true, activo = true, rol = CASE WHEN ?3 THEN 'admin' ELSE rol END
  WHERE id = ?1`, [u.id, hash, hacerAdmin]);
await db.query('DELETE FROM sesiones WHERE usuario_id = ?1', [u.id]);
console.log(`Usuario: ${usuario} (${u.nombre}, ${hacerAdmin ? 'admin' : u.rol})\nContraseña provisional: ${clave}\nSe pedirá cambiarla al entrar.`);
await db.close();
