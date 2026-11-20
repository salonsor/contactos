import 'dotenv/config';
import { rellenarCatalogo } from '../consultas-comercial.js';
import { getDb } from '../db.js';
import { migrar } from '../migrar.js';

const db = await getDb();
const aplicadas = await migrar(db);
// Lo mismo que hace la API al arrancar (en Vercel no arranca un servidor: esto corre al desplegar)
await rellenarCatalogo(db);
console.log(aplicadas.length ? 'Aplicadas: ' + aplicadas.join(', ') : 'La base ya estaba al día', '·', db.descripcion);
await db.close();
