// Assistant : boucle d'appels d'outils avec Ministral 14B (Mistral AI). Le modèle choisit les outils MCP du portefeuille,
// le serveur les exécute et renvoie la réponse finale + la piste d'audit (chaque appel, arguments, résultat, durée).
// Variables d'environnement : MISTRAL_API_KEY (obligatoire), MISTRAL_MODEL (défaut ministral-14b-latest).

import { OUTILS, executerOutil } from '../lib/outils.js';
import { DATE_ARRETE } from '../lib/donnees.js';
import { limiter } from '../lib/limite.js';
import { validerRegles } from '../lib/regles.js';

const URL_MISTRAL = process.env.MISTRAL_API_URL || 'https://api.mistral.ai/v1/chat/completions';
const MAX_TOURS = 5;
const MAX_MESSAGES = 8;
const MAX_CARACTERES = 600;

const SYSTEME = `Tu es l'assistant d'un gestionnaire de portefeuille de financements professionnels (crédit-bail, LOA, LLD, crédits amortissables).
Les données sont FICTIVES, arrêtées au ${DATE_ARRETE.split('-').reverse().join('/')}.
Règles :
- Réponds toujours en français, de façon concise et structurée (listes courtes ou petits tableaux Markdown).
- Pour tout chiffre ou contrat, appelle d'abord les outils : n'invente jamais une donnée.
- Montants en euros au format français (ex. 12 345,67 €), dates au format JJ/MM/AAAA.
- Cite les identifiants de contrat (CT-…) pour qu'on puisse les vérifier.
- « En retard » ou « en impayé » couvre les statuts impayé ET contentieux : utilise le filtre en_retard.
- Les simulations (avenant) ne modifient rien : précise-le.
- Les actions de recouvrement viennent de règles configurables par l'utilisateur : cite l'action et son niveau tels que renvoyés par l'outil.
- Si la question sort du périmètre du portefeuille, dis-le poliment en une phrase et propose une question utile.`;

const OUTILS_MISTRAL = OUTILS.map(({ name, description, inputSchema }) => ({
  type: 'function',
  function: { name, description, parameters: inputSchema },
}));

function nettoyerHistorique(messages) {
  if (!Array.isArray(messages)) return null;
  const propres = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === 'user' ? MAX_CARACTERES : 2000) }));
  if (!propres.length || propres[propres.length - 1].role !== 'user') return null;
  return propres;
}

// Offre gratuite Mistral : environ 1 requête toutes les 2 secondes. On espace les appels d'une même
// question et on réessaie après une pause en cas de 429 (limite de débit) ou d'erreur passagère.
const espacementMs = () => Number(process.env.MISTRAL_ESPACEMENT_MS ?? 2100);
const PAUSES_REESSAI_MS = [2500, 5000];
let dernierAppel = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function appelerMistral(messages) {
  for (let essai = 0; ; essai++) {
    const attente = dernierAppel + espacementMs() - Date.now();
    if (attente > 0) await pause(attente);
    dernierAppel = Date.now();
    let r;
    try {
      r = await fetch(URL_MISTRAL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
        body: JSON.stringify({
          model: process.env.MISTRAL_MODEL || 'ministral-14b-latest',
          messages,
          tools: OUTILS_MISTRAL,
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      console.error(`[assistant] appel Mistral impossible (essai ${essai + 1}) : ${err.name} ${err.message}`);
      if (essai < PAUSES_REESSAI_MS.length && err.name !== 'TimeoutError') { await pause(PAUSES_REESSAI_MS[essai]); continue; }
      throw err;
    }
    if (r.ok) return r.json();
    const detail = (await r.text().catch(() => '')).slice(0, 200);
    console.error(`[assistant] Mistral ${r.status} (essai ${essai + 1}) : ${detail}`);
    if ((r.status === 429 || r.status >= 500) && essai < PAUSES_REESSAI_MS.length) {
      await pause(PAUSES_REESSAI_MS[essai]);
      continue;
    }
    const e = new Error(`Mistral ${r.status}`);
    e.statut = r.status;
    throw e;
  }
}

const tronquer = (obj) => {
  const texte = JSON.stringify(obj);
  return texte.length > 6000 ? { apercu: texte.slice(0, 6000) + '…' } : obj;
};

/** Boucle modèle ↔ outils. `emettre(type, donnees)` signale chaque étape (pour l'affichage en direct). */
async function repondre(historique, contexte, emettre) {
  const messages = [{ role: 'system', content: SYSTEME }, ...historique];
  const trace = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  const debut = Date.now();
  try {
    for (let tour = 0; tour < MAX_TOURS; tour++) {
      emettre('reflexion', { tour: tour + 1 });
      const data = await appelerMistral(messages);
      usage.prompt_tokens += data.usage?.prompt_tokens ?? 0;
      usage.completion_tokens += data.usage?.completion_tokens ?? 0;
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error('Réponse vide');
      const appels = msg.tool_calls ?? [];
      if (!appels.length) {
        return { ok: true, reponse: typeof msg.content === 'string' ? msg.content : '', trace, usage, modele: data.model, duree_ms: Date.now() - debut };
      }
      messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: appels });
      for (const appel of appels) {
        const nom = appel.function?.name;
        let args = {};
        try { args = JSON.parse(appel.function?.arguments || '{}'); } catch { args = {}; }
        emettre('etape', { outil: nom, arguments: args });
        const t0 = performance.now();
        const r = executerOutil(nom, args, contexte);
        const duree = Math.round((performance.now() - t0) * 100) / 100;
        const entree = { outil: nom, arguments: args, ok: r.ok, resultat: r.ok ? tronquer(r.resultat) : r.erreur, duree_ms: duree };
        trace.push(entree);
        emettre('trace', entree);
        messages.push({
          role: 'tool',
          tool_call_id: appel.id,
          name: nom,
          content: r.ok ? JSON.stringify(r.resultat) : JSON.stringify({ erreur: r.erreur }),
        });
      }
    }
    return { ok: true, reponse: 'Je n\'ai pas pu conclure en un nombre raisonnable d\'étapes. Reformulez la question plus précisément.', trace, usage, duree_ms: Date.now() - debut };
  } catch (e) {
    const quota = e.statut === 429;
    return {
      ok: false, statut: quota ? 429 : 502, trace,
      erreur: quota ? 'quota_modele' : 'modele',
      message: quota ? 'Le quota du modèle est atteint pour le moment.' : 'Le modèle ne répond pas pour le moment.',
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erreur: 'methode', message: 'Utilisez POST.' });
  }
  if (!process.env.MISTRAL_API_KEY) {
    return res.status(503).json({ erreur: 'cle_absente', message: 'Le modèle n\'est pas configuré sur ce serveur.' });
  }
  if (!limiter(req, 'assistant', 20)) {
    return res.status(429).json({ erreur: 'limite', message: 'Limite de questions atteinte, réessayez dans 10 minutes.' });
  }
  let corps = req.body;
  if (typeof corps === 'string') {
    try { corps = JSON.parse(corps); } catch { corps = null; }
  }
  const historique = nettoyerHistorique(corps?.messages);
  if (!historique) return res.status(400).json({ erreur: 'requete', message: 'Question manquante.' });
  let contexte = {};
  if (corps.regles !== undefined && corps.regles !== null) {
    const v = validerRegles(corps.regles);
    if (!v.ok) return res.status(400).json({ erreur: 'regles', message: `Règles invalides : ${v.erreurs.join(' ')}` });
    contexte = { regles: v.config };
  }

  if (corps.flux === true) {
    // Flux d'événements (Server-Sent Events) : étapes en direct, puis la réponse finale
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const envoyer = (type, donnees) => res.write(`event: ${type}\ndata: ${JSON.stringify(donnees)}\n\n`);
    const r = await repondre(historique, contexte, envoyer);
    const { ok, statut, ...reste } = r;
    envoyer(ok ? 'fin' : 'erreur', reste);
    return res.end();
  }

  const r = await repondre(historique, contexte, () => {});
  const { ok, statut, ...reste } = r;
  return res.status(ok ? 200 : statut).json(reste);
}
