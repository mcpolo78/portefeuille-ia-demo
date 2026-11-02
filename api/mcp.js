// Transport HTTP du serveur MCP (Streamable HTTP, mode sans état : chaque POST reçoit une réponse JSON).
// Connexion : claude mcp add --transport http portefeuille https://<domaine>/api/mcp

import { traiterMessage } from '../lib/mcp.js';
import { limiter } from '../lib/limite.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-protocol-version, mcp-session-id');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Utilisez POST (JSON-RPC 2.0).' } });
  }
  if (!limiter(req, 'mcp', 120)) {
    return res.status(429).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Trop de requêtes, réessayez dans quelques minutes.' } });
  }
  let corps = req.body;
  if (typeof corps === 'string') {
    try { corps = JSON.parse(corps); } catch { corps = null; }
  }
  if (Array.isArray(corps)) {
    const reponses = corps.slice(0, 20).map(traiterMessage).filter(Boolean);
    return reponses.length ? res.status(200).json(reponses) : res.status(202).end();
  }
  const r = traiterMessage(corps);
  if (!r) return res.status(202).end();
  return res.status(200).json(r);
}
