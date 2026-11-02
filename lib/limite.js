// Limite de débit simple, en mémoire, par adresse IP (par instance serverless : protection d'appoint,
// le vrai garde-fou de coût est le plafond de dépense fixé chez Mistral).

const FENETRE_MS = 10 * 60 * 1000;
const compteurs = new Map();

export function ipDe(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket?.remoteAddress || 'inconnue';
}

/** true si la requête est autorisée (au plus `max` requêtes par 10 minutes pour ce canal et cette IP). */
export function limiter(req, canal, max) {
  const cle = `${canal}:${ipDe(req)}`;
  const maintenant = Date.now();
  const e = compteurs.get(cle);
  if (!e || maintenant - e.debut > FENETRE_MS) {
    compteurs.set(cle, { debut: maintenant, n: 1 });
    if (compteurs.size > 5000) compteurs.clear();
    return true;
  }
  e.n += 1;
  return e.n <= max;
}
