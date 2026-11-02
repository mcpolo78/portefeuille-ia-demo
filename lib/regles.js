// Règles de recouvrement configurables sans code (JSON) : la première règle dont les conditions
// sont toutes vraies donne l'action et le niveau ; les poids calculent le score de priorité.
// Validées côté serveur avant usage : tout champ inconnu ou mal typé est refusé avec un message clair.

export const REGLES_DEFAUT = Object.freeze({
  regles: [
    { si: { statut: 'contentieux' }, action: 'Transmettre au service contentieux', niveau: 'critique' },
    { si: { jours_retard_min: 91 }, action: 'Transmettre au service contentieux', niveau: 'critique' },
    { si: { jours_retard_min: 46 }, action: 'Envoyer une mise en demeure (LRAR)', niveau: 'élevé' },
    { si: { jours_retard_min: 16 }, action: 'Appeler le client et proposer un échéancier', niveau: 'moyen' },
    { si: {}, action: 'Relance amiable par e-mail / SMS', niveau: 'faible' },
  ],
  poids: { par_100_euros_impayes: 1, par_jour_de_retard: 1.5, par_5000_euros_encours: 1 },
});

const NIVEAUX = ['faible', 'moyen', 'élevé', 'critique'];
const STATUTS = ['sain', 'impayé', 'contentieux', 'soldé'];
const PRODUITS = ['Crédit-bail', 'LOA', 'LLD', 'Crédit amortissable'];
const CONDITIONS = {
  statut: (v) => STATUTS.includes(v) || `doit valoir ${STATUTS.join(', ')}`,
  produit: (v) => PRODUITS.includes(v) || `doit valoir ${PRODUITS.join(', ')}`,
  partenaire: (v) => (typeof v === 'string' && v.length <= 60) || 'doit être un texte (60 caractères max)',
  jours_retard_min: (v) => (Number.isFinite(v) && v >= 0 && v <= 3650) || 'doit être un nombre entre 0 et 3650',
  jours_retard_max: (v) => (Number.isFinite(v) && v >= 0 && v <= 3650) || 'doit être un nombre entre 0 et 3650',
  montant_impaye_min: (v) => (Number.isFinite(v) && v >= 0) || 'doit être un nombre positif',
  encours_min: (v) => (Number.isFinite(v) && v >= 0) || 'doit être un nombre positif',
};
const POIDS = ['par_100_euros_impayes', 'par_jour_de_retard', 'par_5000_euros_encours'];

/** Valide une configuration. Renvoie { ok: true, config } ou { ok: false, erreurs: [...] }. */
export function validerRegles(entree) {
  const erreurs = [];
  if (!entree || typeof entree !== 'object' || Array.isArray(entree)) return { ok: false, erreurs: ['La configuration doit être un objet JSON { "regles": [...], "poids": {...} }.'] };
  for (const cle of Object.keys(entree)) if (!['regles', 'poids'].includes(cle)) erreurs.push(`Clé inconnue « ${cle} » (attendu : regles, poids).`);
  const { regles, poids = REGLES_DEFAUT.poids } = entree;
  if (!Array.isArray(regles) || regles.length === 0 || regles.length > 20) {
    erreurs.push('« regles » doit être une liste de 1 à 20 règles.');
  } else {
    regles.forEach((r, i) => {
      const n = `Règle ${i + 1}`;
      if (!r || typeof r !== 'object') return erreurs.push(`${n} : doit être un objet.`);
      for (const cle of Object.keys(r)) if (!['si', 'action', 'niveau'].includes(cle)) erreurs.push(`${n} : clé inconnue « ${cle} ».`);
      if (typeof r.action !== 'string' || !r.action.trim() || r.action.length > 80) erreurs.push(`${n} : « action » doit être un texte de 1 à 80 caractères.`);
      if (!NIVEAUX.includes(r.niveau)) erreurs.push(`${n} : « niveau » doit valoir ${NIVEAUX.join(', ')}.`);
      if (!r.si || typeof r.si !== 'object' || Array.isArray(r.si)) return erreurs.push(`${n} : « si » doit être un objet de conditions (vide = toujours vrai).`);
      for (const [c, v] of Object.entries(r.si)) {
        const verif = CONDITIONS[c];
        if (!verif) erreurs.push(`${n} : condition inconnue « ${c} » (possibles : ${Object.keys(CONDITIONS).join(', ')}).`);
        else if (verif(v) !== true) erreurs.push(`${n} : « ${c} » ${verif(v)}.`);
      }
    });
  }
  if (!poids || typeof poids !== 'object' || Array.isArray(poids)) erreurs.push('« poids » doit être un objet.');
  else {
    for (const cle of Object.keys(poids)) if (!POIDS.includes(cle)) erreurs.push(`Poids inconnu « ${cle} » (possibles : ${POIDS.join(', ')}).`);
    for (const cle of POIDS) if (poids[cle] !== undefined && !(Number.isFinite(poids[cle]) && poids[cle] >= 0 && poids[cle] <= 100)) erreurs.push(`Poids « ${cle} » : nombre entre 0 et 100.`);
  }
  if (erreurs.length) return { ok: false, erreurs: erreurs.slice(0, 10) };
  return { ok: true, config: { regles, poids: { ...REGLES_DEFAUT.poids, ...poids } } };
}

function conditionVraie(c, cle, v) {
  switch (cle) {
    case 'statut': return c.statut === v;
    case 'produit': return c.produit === v;
    case 'partenaire': return c.partenaire.toLowerCase().includes(v.toLowerCase());
    case 'jours_retard_min': return c.jours_retard >= v;
    case 'jours_retard_max': return c.jours_retard <= v;
    case 'montant_impaye_min': return c.montant_impaye >= v;
    case 'encours_min': return c.capital_restant_du >= v;
    default: return false;
  }
}

/** Action, niveau et numéro de la règle appliquée à un contrat en retard. */
export function appliquerRegles(contrat, config = REGLES_DEFAUT) {
  const i = config.regles.findIndex((r) => Object.entries(r.si).every(([k, v]) => conditionVraie(contrat, k, v)));
  if (i < 0) return { action: 'Aucune règle applicable', niveau: 'faible', regle: null };
  return { action: config.regles[i].action, niveau: config.regles[i].niveau, regle: i + 1 };
}

export function scorer(contrat, config = REGLES_DEFAUT) {
  const p = config.poids;
  return Math.round((contrat.montant_impaye / 100) * p.par_100_euros_impayes + contrat.jours_retard * p.par_jour_de_retard + (contrat.capital_restant_du / 5000) * p.par_5000_euros_encours);
}
