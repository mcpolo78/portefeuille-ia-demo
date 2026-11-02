// Règles de recouvrement : GET renvoie les règles par défaut, POST valide une configuration personnalisée.
// Les règles validées sont gardées par le navigateur et renvoyées avec chaque question (aucun stockage serveur).

import { REGLES_DEFAUT, validerRegles } from '../lib/regles.js';

export default function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json(REGLES_DEFAUT);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, erreurs: ['Utilisez GET ou POST.'] });
  }
  let corps = req.body;
  if (typeof corps === 'string') {
    try { corps = JSON.parse(corps); } catch { return res.status(200).json({ ok: false, erreurs: ['JSON invalide.'] }); }
  }
  const v = validerRegles(corps);
  return res.status(200).json(v.ok ? { ok: true, config: v.config } : v);
}
