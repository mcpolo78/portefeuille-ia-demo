// Agrégats du tableau de bord : encours sur 24 mois (12 passés, 12 projetés), répartition par produit
// et par partenaire, ancienneté des impayés, encaissements attendus. Calculés à partir des échéanciers.

import { CONTRATS, DATE_ARRETE } from './donnees.js';
import { arrondi, capitalRestantDu, dateEcheance, moisEcoules } from './finance.js';

const PRODUITS = ['Crédit-bail', 'LOA', 'LLD', 'Crédit amortissable'];
const capitalDe = (c) => c.montant_finance - c.apport;

/** Fin de mois décalée de n mois par rapport à la date d'arrêté (fin octobre 2026). */
function finDeMois(n) {
  const [a, m] = DATE_ARRETE.split('-').map(Number);
  return new Date(Date.UTC(a, m + n, 0)).toISOString().slice(0, 10);
}

/** Encours théorique, nombre de contrats vivants et loyers du mois à une date donnée. */
function etatAu(date) {
  let encours = 0;
  let vivants = 0;
  let loyers = 0;
  for (const c of CONTRATS) {
    if (c.date_debut > date) continue;
    const k = moisEcoules(c.date_debut, date);
    if (k >= c.duree_mois) continue;
    encours += capitalRestantDu(capitalDe(c), c.taux_annuel, c.loyer_mensuel, k);
    vivants += 1;
    loyers += c.loyer_mensuel;
  }
  return { encours: arrondi(encours), vivants, loyers: arrondi(loyers) };
}

export function tableauDeBord() {
  const vivants = CONTRATS.filter((c) => c.statut !== 'soldé');
  const enRetard = vivants.filter((c) => c.echeances_impayees > 0);
  const encoursReel = arrondi(vivants.reduce((s, c) => s + c.capital_restant_du, 0));

  // Série mensuelle : -12 … +12 mois ; le point 0 (date d'arrêté) prend l'encours réel
  const serie = [];
  for (let n = -12; n <= 12; n++) {
    const date = n === 0 ? DATE_ARRETE : finDeMois(n);
    const e = etatAu(date);
    serie.push({ mois: date.slice(0, 7), projete: n > 0, ...e, encours: n === 0 ? encoursReel : e.encours });
  }

  const parProduit = PRODUITS.map((p) => {
    const liste = vivants.filter((c) => c.produit === p);
    return { produit: p, contrats: liste.length, encours: arrondi(liste.reduce((s, c) => s + c.capital_restant_du, 0)) };
  });

  const TRANCHES = [['0-30 j', 0, 30], ['31-60 j', 31, 60], ['61-90 j', 61, 90], ['> 90 j', 91, Infinity]];
  const anciennete = TRANCHES.map(([tranche, min, max]) => {
    const liste = enRetard.filter((c) => c.jours_retard >= min && c.jours_retard <= max);
    return { tranche, min, max: Number.isFinite(max) ? max : null, dossiers: liste.length, montant: arrondi(liste.reduce((s, c) => s + c.montant_impaye, 0)) };
  });

  // Encaissements attendus sur les 6 prochains mois (loyers à échéance), séparés selon le risque du contrat
  const encaissements = [];
  for (let n = 1; n <= 6; n++) {
    const debut = finDeMois(n - 1);
    const fin = finDeMois(n);
    let sains = 0;
    let risque = 0;
    for (const c of vivants) {
      for (let k = c.echeances_echues + 1; k <= c.duree_mois; k++) {
        const d = dateEcheance(c.date_debut, k);
        if (d > fin) break;
        if (d > debut) {
          if (c.echeances_impayees > 0) risque += c.loyer_mensuel;
          else sains += c.loyer_mensuel;
        }
      }
    }
    encaissements.push({ mois: fin.slice(0, 7), sains: arrondi(sains), a_risque: arrondi(risque) });
  }

  const partenaires = [...new Set(CONTRATS.map((c) => c.partenaire))].map((p) => {
    const liste = vivants.filter((c) => c.partenaire === p);
    return {
      partenaire: p,
      contrats: liste.length,
      encours: arrondi(liste.reduce((s, c) => s + c.capital_restant_du, 0)),
      encours_en_retard: arrondi(liste.filter((c) => c.echeances_impayees > 0).reduce((s, c) => s + c.capital_restant_du, 0)),
    };
  }).sort((a, b) => b.encours - a.encours);

  const ilYa12Mois = serie[0];
  return {
    date_arrete: DATE_ARRETE,
    indicateurs: {
      encours: encoursReel,
      encours_variation_12_mois_pct: arrondi(((encoursReel - ilYa12Mois.encours) / ilYa12Mois.encours) * 100),
      contrats_vivants: vivants.length,
      contrats_en_retard: enRetard.length,
      taux_contrats_en_retard_pct: arrondi((enRetard.length / vivants.length) * 100),
      montant_impaye: arrondi(enRetard.reduce((s, c) => s + c.montant_impaye, 0)),
      loyers_attendus_mois_prochain: arrondi(encaissements[0].sains + encaissements[0].a_risque),
    },
    serie_mensuelle: serie,
    par_produit: parProduit,
    anciennete_impayes: anciennete,
    encaissements_6_mois: encaissements,
    par_partenaire: partenaires,
  };
}
