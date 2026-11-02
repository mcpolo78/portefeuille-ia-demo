// Tests : node --test test/   (aucune dépendance, Mistral simulé par un serveur local)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { mensualite, capitalRestantDu } from '../lib/finance.js';
import { CONTRATS } from '../lib/donnees.js';
import { OUTILS, executerOutil } from '../lib/outils.js';
import { traiterMessage } from '../lib/mcp.js';

function fauxRes() {
  const res = { code: 200, entetes: {}, corps: undefined };
  res.status = (c) => { res.code = c; return res; };
  res.json = (o) => { res.corps = o; return res; };
  res.end = () => res;
  res.setHeader = (k, v) => { res.entetes[k] = v; };
  return res;
}

test('mensualité et capital restant dû cohérents', () => {
  const p = mensualite(10000, 6, 12);
  assert.ok(Math.abs(p - 860.66) < 0.01);
  assert.ok(Math.abs(capitalRestantDu(10000, 6, p, 12)) < 0.01);
  const pVR = mensualite(30000, 5, 36, 6000);
  assert.ok(Math.abs(capitalRestantDu(30000, 5, pVR, 36) - 6000) < 0.01);
});

test('portefeuille déterministe et identifiants uniques', () => {
  assert.equal(CONTRATS.length, 40);
  assert.equal(new Set(CONTRATS.map((c) => c.id)).size, 40);
  assert.ok(CONTRATS.some((c) => c.statut === 'contentieux'));
  assert.ok(CONTRATS.some((c) => c.statut === 'impayé'));
});

test('chaque outil s\'exécute sans erreur', () => {
  const id = CONTRATS.find((c) => c.statut === 'impayé').id;
  const args = {
    statistiques_portefeuille: {}, rechercher_contrats: { statut: 'impayé' }, detail_contrat: { id },
    echeancier_contrat: { id, nombre: 6 }, simuler_avenant: { id, nouvelle_duree_restante_mois: 24 }, priorites_recouvrement: { limite: 3 },
  };
  for (const o of OUTILS) {
    const r = executerOutil(o.name, args[o.name]);
    assert.ok(r.ok, `${o.name} : ${r.erreur}`);
  }
  assert.equal(executerOutil('detail_contrat', { id: 'CT-0000-0000' }).ok, false);
  const enRetard = executerOutil('rechercher_contrats', { en_retard: true, limite: 20 }).resultat;
  assert.equal(enRetard.nombre_trouves, CONTRATS.filter((c) => c.statut === 'impayé' || c.statut === 'contentieux').length);
});

test('MCP : initialize, tools/list, tools/call, erreurs', () => {
  const init = traiterMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(traiterMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const liste = traiterMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(liste.result.tools.length, 6);
  const appel = traiterMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'statistiques_portefeuille', arguments: {} } });
  assert.equal(appel.result.isError, false);
  assert.equal(appel.result.structuredContent.nombre_contrats, 40);
  assert.equal(traiterMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'detail_contrat', arguments: { id: 'X' } } }).result.isError, true);
  assert.equal(traiterMessage({ jsonrpc: '2.0', id: 5, method: 'inconnue' }).error.code, -32601);
});

// --- Assistant avec un faux Mistral : 1er tour = appel d'outil, 2e tour = réponse finale ---
let fauxMistral;
const requetesRecues = [];
before(async () => {
  fauxMistral = createServer(async (req, res) => {
    let brut = '';
    for await (const m of req) brut += m;
    const corps = JSON.parse(brut);
    requetesRecues.push(corps);
    const dernier = corps.messages.at(-1);
    const message = dernier.role === 'tool'
      ? { role: 'assistant', content: 'Le portefeuille compte **40 contrats**.' }
      : { role: 'assistant', content: '', tool_calls: [{ id: 'a1', type: 'function', function: { name: 'statistiques_portefeuille', arguments: '{}' } }] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ model: corps.model, choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
  await new Promise((ok) => fauxMistral.listen(0, ok));
  process.env.MISTRAL_API_URL = `http://127.0.0.1:${fauxMistral.address().port}/v1/chat/completions`;
});
after(() => fauxMistral.close());

test('assistant : boucle d\'appels d\'outils et piste d\'audit', async () => {
  process.env.MISTRAL_API_KEY = 'cle-de-test';
  const { default: handler } = await import('../api/assistant.js');
  const res = fauxRes();
  await handler({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'Combien de contrats ?' }] } }, res);
  assert.equal(res.code, 200, JSON.stringify(res.corps));
  assert.match(res.corps.reponse, /40 contrats/);
  assert.equal(res.corps.trace.length, 1);
  assert.equal(res.corps.trace[0].outil, 'statistiques_portefeuille');
  assert.equal(requetesRecues[0].model, 'ministral-14b-latest');
  assert.equal(requetesRecues[1].messages.at(-1).role, 'tool');
});

test('assistant : clé absente → 503, requête vide → 400', async () => {
  const { default: handler } = await import('../api/assistant.js');
  const res1 = fauxRes();
  await handler({ method: 'POST', headers: {}, body: {} }, res1);
  assert.equal(res1.code, 400);
  const cle = process.env.MISTRAL_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  const res2 = fauxRes();
  await handler({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'x' }] } }, res2);
  assert.equal(res2.code, 503);
  process.env.MISTRAL_API_KEY = cle;
});

test('règles : validation, application et passage par MCP (_meta)', async () => {
  const { validerRegles, REGLES_DEFAUT } = await import('../lib/regles.js');
  assert.equal(validerRegles(REGLES_DEFAUT).ok, true);
  const mauvaise = validerRegles({ regles: [{ si: { couleur: 'rouge' }, action: 'x', niveau: 'urgent' }], autre: 1 });
  assert.equal(mauvaise.ok, false);
  assert.ok(mauvaise.erreurs.length >= 3);
  const perso = { regles: [{ si: { produit: 'LLD' }, action: 'Reprise du véhicule', niveau: 'élevé' }, { si: {}, action: 'Relance', niveau: 'faible' }] };
  const r = traiterMessage({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'priorites_recouvrement', arguments: { limite: 20 }, _meta: { regles: perso } } });
  const prio = r.result.structuredContent.priorites;
  assert.equal(r.result.structuredContent.regles, 'personnalisées');
  assert.ok(prio.every((d) => d.action_recommandee === (d.produit === 'LLD' ? 'Reprise du véhicule' : 'Relance')));
  const ko = traiterMessage({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'priorites_recouvrement', arguments: {}, _meta: { regles: { regles: [] } } } });
  assert.equal(ko.error.code, -32602);
});

test('assistant : flux d\'événements (étapes en direct)', async () => {
  const { default: handler } = await import('../api/assistant.js');
  let texte = '';
  const res = fauxRes();
  res.write = (morceau) => { texte += morceau; return true; };
  await handler({ method: 'POST', headers: {}, body: { flux: true, messages: [{ role: 'user', content: 'Combien ?' }] } }, res);
  const types = [...texte.matchAll(/^event: (.*)$/gm)].map((m) => m[1]);
  assert.deepEqual(types, ['reflexion', 'etape', 'trace', 'reflexion', 'fin']);
});
