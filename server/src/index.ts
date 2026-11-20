import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearApp } from './app.js';
import { getDb } from './db.js';
import { rellenarCatalogo } from './consultas-comercial.js';
import { migrar } from './migrar.js';

const db = await getDb();
const aplicadas = await migrar(db);
if (aplicadas.length) console.log('Migraciones aplicadas:', aplicadas.join(', '));
await rellenarCatalogo(db);

const app = crearApp(db);

// En producción el mismo servidor sirve la interfaz compilada (web/dist)
const web = process.env.WEB_DIST
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(web)) {
  app.use(express.static(web));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(web, 'index.html')));
}

const puerto = Number(process.env.PORT || 3001);
app.listen(puerto, () => console.log(`API en http://localhost:${puerto} · ${db.descripcion}`));
