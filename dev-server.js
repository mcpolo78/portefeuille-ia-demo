// Serveur local : interface Angular compilée (front/dist) + fonctions /api/* au format Vercel,
// avec les mêmes en-têtes de sécurité que vercel.json (CSP comprise).
//   npm run build --prefix front && MISTRAL_API_KEY=... node dev-server.js   →   http://localhost:3000
//   (ou, en développement Angular : node dev-server.js puis npm start --prefix front → http://localhost:4200)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const RACINE = fileURLToPath(new URL('./front/dist/front/browser/', import.meta.url));
const ENTETES = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url))).headers[0].headers;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
const API = { '/api/mcp': () => import('./api/mcp.js'), '/api/assistant': () => import('./api/assistant.js'), '/api/regles': () => import('./api/regles.js') };

function enrichir(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

createServer(async (req, res) => {
  for (const { key, value } of ENTETES) res.setHeader(key, value);
  const chemin = new URL(req.url, 'http://x').pathname;
  if (API[chemin]) {
    let brut = '';
    for await (const morceau of req) brut += morceau;
    try { req.body = brut ? JSON.parse(brut) : undefined; } catch { req.body = brut; }
    const { default: handler } = await API[chemin]();
    return handler(req, enrichir(res));
  }
  const fichier = normalize(join(RACINE, chemin === '/' ? 'index.html' : chemin));
  if (!fichier.startsWith(RACINE)) { res.statusCode = 403; return res.end(); }
  try {
    const contenu = await readFile(fichier);
    res.setHeader('Content-Type', TYPES[extname(fichier)] || 'application/octet-stream');
    res.end(contenu);
  } catch {
    res.statusCode = 404;
    res.end('Introuvable');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
