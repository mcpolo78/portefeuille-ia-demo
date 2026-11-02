#!/usr/bin/env node
// Transport stdio du serveur MCP, pour Claude Desktop, Claude Code ou tout client MCP local.
//   claude mcp add portefeuille -- node /chemin/vers/mcp-stdio.js
// Un message JSON-RPC par ligne sur stdin, une réponse par ligne sur stdout.

import { createInterface } from 'node:readline';
import { traiterMessage } from './lib/mcp.js';

const ecrire = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

createInterface({ input: process.stdin }).on('line', (ligne) => {
  if (!ligne.trim()) return;
  let msg;
  try {
    msg = JSON.parse(ligne);
  } catch {
    return ecrire({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } });
  }
  const r = traiterMessage(msg);
  if (r) ecrire(r);
});
