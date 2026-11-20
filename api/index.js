// Función de Vercel: la misma API Express, compilada en server/dist (npm run build).
// Las migraciones no se aplican aquí sino al desplegar (npm run db:migrar, en el buildCommand de vercel.json).
import { crearApp } from '../server/dist/server/src/app.js';
import { getDb } from '../server/dist/server/src/db.js';

export default crearApp(await getDb());
