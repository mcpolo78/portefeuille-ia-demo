// Serveur MCP minimal (JSON-RPC 2.0), sans dépendance, partagé par le transport HTTP (api/mcp.js)
// et le transport stdio (mcp-stdio.js). Méthodes : initialize, ping, tools/list, tools/call.

import { OUTILS, executerOutil } from './outils.js';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const INFO_SERVEUR = { name: 'portefeuille-financement', title: 'Portefeuille de financement (démo)', version: '1.0.0' };

const reponse = (id, result) => ({ jsonrpc: '2.0', id, result });
const erreur = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Traite un message JSON-RPC. Renvoie la réponse, ou null pour une notification. */
export function traiterMessage(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return erreur(msg?.id, -32600, 'Requête invalide');
  }
  const { id, method, params = {} } = msg;
  if (id === undefined) return null; // notification (ex. notifications/initialized)

  switch (method) {
    case 'initialize': {
      const demandee = params.protocolVersion;
      return reponse(id, {
        protocolVersion: VERSIONS.includes(demandee) ? demandee : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: INFO_SERVEUR,
        instructions: 'Outils de lecture et de simulation sur un portefeuille FICTIF de crédits et de leasings (date d\'arrêté 31/10/2026). Aucun outil ne modifie les données.',
      });
    }
    case 'ping':
      return reponse(id, {});
    case 'tools/list':
      return reponse(id, {
        tools: OUTILS.map(({ name, description, inputSchema }) => ({
          name, description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const r = executerOutil(params.name, params.arguments);
      if (!r.ok && r.erreur.startsWith('Outil inconnu')) return erreur(id, -32602, r.erreur);
      return reponse(id, r.ok
        ? { content: [{ type: 'text', text: JSON.stringify(r.resultat) }], structuredContent: r.resultat, isError: false }
        : { content: [{ type: 'text', text: r.erreur }], isError: true });
    }
    default:
      return erreur(id, -32601, `Méthode non prise en charge : ${method}`);
  }
}
