# Copilote portefeuille · démo IA + MCP

Un assistant IA interroge un portefeuille **fictif** de crédits et de leasings (40 contrats, clients inventés, arrêté au 31/10/2026) par un serveur **MCP**. Chaque appel d'outil choisi par le modèle est affiché dans une piste d'audit : arguments, résultat brut et durée.

- **Modèle** : Ministral 14B (Mistral AI), par l'API Mistral, avec appels d'outils (boucle de 5 tours au maximum)
- **Six outils métier** (`lib/outils.js`) : statistiques du portefeuille, recherche de contrats, fiche contrat, échéancier (tableau d'amortissement), simulation d'avenant, priorités de recouvrement
- **Serveur MCP** sans dépendance (`lib/mcp.js`, JSON-RPC 2.0) avec deux transports : HTTP (`/api/mcp`, Streamable HTTP sans état) et stdio (`mcp-stdio.js`)
- **Interface** HTML/CSS/JS sans framework ; si le modèle est indisponible, les questions d'exemple appellent directement l'outil MCP (mode secours)
- **Aucune dépendance npm**, Node 20 ou plus

## Lancer en local

```bash
MISTRAL_API_KEY=... npm run dev   # http://localhost:3000
npm test                          # tests (Mistral simulé)
```

## Brancher le serveur MCP sur un agent

```bash
claude mcp add --transport http portefeuille https://<domaine>/api/mcp   # en ligne
claude mcp add portefeuille -- node mcp-stdio.js                         # en local
```

## Mise en ligne (Vercel)

Fichiers statiques à la racine, fonctions serverless dans `api/`. Variables d'environnement : `MISTRAL_API_KEY` (obligatoire), `MISTRAL_MODEL` (par défaut `ministral-14b-latest`). Une limite de débit par adresse IP protège le quota (20 questions par 10 minutes).

Projet de démonstration par [Marc Chesnel](https://marcchesnel.com).
